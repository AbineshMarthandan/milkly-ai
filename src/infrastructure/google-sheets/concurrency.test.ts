import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Actor, Bill, Customer, Product, Route } from '@/domain/models';
import type { DataSource, SequenceRepository } from '@/domain/repositories';
import { BootstrapService, createServices } from '@/domain/services';
import { buildCatalog, type CatalogVendor } from '@/domain/services/billing/catalog';
import { toLocalIsoDate } from '@/domain/services/dates';
import { createAuditContext } from '../shared/audit';
import { GoogleSheetsDataSource } from './GoogleSheetsDataSource';
import { SCHEMA_VERSION } from './schemas/sheetSchemas';
import { FakeSheetsServer } from './testing/FakeSheetsServer';

/**
 * Several people pressing "Save" at the same moment, each on their own device
 * (separate data source and caches), over a network with latency.
 */
describe('concurrent bill saving on Google Sheets', () => {
  afterEach(() => vi.unstubAllGlobals());

  const device = (actor: Actor) =>
    new GoogleSheetsDataSource({
      config: { spreadsheetId: 'concurrency-test-sheet-0123456789', oauthClientId: 'x.apps.googleusercontent.com', authMode: 'google-identity-services' },
      tokens: { getAccessToken: async () => 'token' },
      audit: createAuditContext(() => actor.userId),
      identityEmail: () => actor.email,
    });

  const cashier = (index: number): Actor => ({ userId: `MLUID00010${index}`, email: `u${index}@example.com`, displayName: `User ${index}`, role: 'ADMIN' });

  /** Initialises the spreadsheet with one vendor, three products, a route and a store. */
  async function setupShop() {
    let owner: Actor = { userId: 'SYSTEM', email: 'owner@example.com', displayName: 'Owner', role: 'TECH_ADMIN' };
    const setup = device(owner);
    await setup.admin.repairStructure();
    setup.clearCache();
    await new BootstrapService(setup, (actor) => {
      owner = actor;
    }).initialize({ email: 'owner@example.com', name: 'Owner' }, SCHEMA_VERSION);
    const admin = createServices(setup, { getActor: () => owner });
    const vendor = await admin.vendors.create({ vendorName: 'Aavin', priority: 1 });
    const category = await admin.categories.create({ vendorId: vendor._id, categoryName: 'Milk', priority: 1 });
    const products: Product[] = [];
    for (let i = 1; i <= 3; i += 1) {
      products.push(
        await admin.products.create({
          vendorId: vendor._id, categoryId: category._id, productName: `Milk ${i}`, unit: '500 ml', purchasePrice: 20, mrp: 30, sellingPrice: 22 + i, priority: i,
        }),
      );
    }
    const route: Route = await admin.routes.create({ routeName: 'Route A', routeCode: 'R-A', priority: 1 });
    const store: Customer = await admin.customers.create({
      routeId: route._id, storeName: 'Store', contactPerson: '', phone: '', address: '', priority: 1, vendorIds: [],
    });
    const catalog: CatalogVendor[] = buildCatalog({ vendors: [vendor], categories: [category], products, customer: store });
    return { owner, products, route, store, catalog, today: toLocalIsoDate() };
  }

  function linesOf(bill: Bill | null) {
    return Object.fromEntries(bill!.vendors.flatMap((v) => v.categories.flatMap((c) => c.items.map((i) => [i.productId, i.quantity]))));
  }

  function headerIds(server: FakeSheetsServer) {
    const sheet = server.table('bills');
    const header = sheet[0] as string[];
    return sheet.slice(1).map((row) => String(row[header.indexOf('_id')]));
  }

  it('never overwrites rows and never issues the same bill number twice', { timeout: 240_000 }, async () => {
    const USERS = 4;
    const BILLS_PER_USER = 3;
    const server = new FakeSheetsServer('Concurrency DB', [20, 250]);
    vi.stubGlobal('fetch', server.fetch);
    const shop = await setupShop();

    // Every cashier saves back-to-back with no pause: far more contention than a real shop.
    const saved: Array<{ bill: Bill; quantities: Record<string, number> }> = [];
    await Promise.all(
      Array.from({ length: USERS }, async (_, userIndex) => {
        const actor = cashier(userIndex);
        const services = createServices(device(actor), { getActor: () => actor });
        for (let n = 0; n < BILLS_PER_USER; n += 1) {
          const quantities = { [shop.products[n % 3]._id]: userIndex * 10 + n + 1, [shop.products[(n + 1) % 3]._id]: 1 };
          const bill = await services.bills.finalize({
            billDate: shop.today, routeId: shop.route._id, customerId: shop.store._id, catalog: shop.catalog, quantities,
          });
          saved.push({ bill, quantities });
        }
      }),
    );

    const total = USERS * BILLS_PER_USER;
    expect(new Set(saved.map(({ bill }) => bill.billNumber)).size).toBe(total);

    const live = headerIds(server).filter((id) => !id.startsWith('~retired~'));
    expect(live).toHaveLength(total); // one live header row per bill: nothing overwritten
    expect(new Set(live).size).toBe(total);

    const reader = device(shop.owner);
    expect(await reader.bills.count()).toBe(total);
    for (const { bill, quantities } of saved) {
      const stored = await reader.bills.getById(bill._id);
      expect(stored?.billNumber).toBe(bill.billNumber);
      expect(stored?.grandTotal).toBe(bill.grandTotal);
      expect(linesOf(stored)).toEqual(quantities);
    }
  });

  it('resolves two devices that were both handed the same bill number', { timeout: 60_000 }, async () => {
    // Fixed latency so both saves pass the pre-save duplicate check before either commits.
    const server = new FakeSheetsServer('Race DB', [100, 100]);
    vi.stubGlobal('fetch', server.fetch);
    const shop = await setupShop();

    /** Simulates a lost "claim, wait, verify": the first allocation returns a number another device also got. */
    const sameNumberFirst = (real: SequenceRepository): SequenceRepository => {
      let calls = 0;
      return { next: (entity, floor) => (calls++ === 0 ? Promise.resolve(1) : real.next(entity, floor)) };
    };

    const results = await Promise.all(
      [0, 1].map(async (index) => {
        const actor = cashier(index);
        const ds = device(actor);
        const racing: DataSource = Object.assign(Object.create(ds) as DataSource, { sequences: sameNumberFirst(ds.sequences) });
        const quantities = { [shop.products[index]._id]: 5 + index };
        const bill = await createServices(racing, { getActor: () => actor }).bills.finalize({
          billDate: shop.today, routeId: shop.route._id, customerId: shop.store._id, catalog: shop.catalog, quantities,
        });
        return { bill, quantities };
      }),
    );

    // One device kept MLB000001; the other was re-saved as MLB000002 before returning.
    expect(results.map(({ bill }) => bill.billNumber).sort()).toEqual(['MLB000001', 'MLB000002']);

    // The losing header was retired (kept for audit, hidden from readers).
    const ids = headerIds(server);
    expect(ids.filter((id) => id.startsWith('~retired~'))).toHaveLength(1);
    expect(ids.filter((id) => !id.startsWith('~retired~')).sort()).toEqual(['MLBID000001', 'MLBID000002']);

    const reader = device(shop.owner);
    expect(await reader.bills.count()).toBe(2);
    const listed = await reader.bills.list({ dateFrom: shop.today, dateTo: shop.today });
    expect(listed.map((bill) => bill.billNumber).sort()).toEqual(['MLB000001', 'MLB000002']);
    for (const { bill, quantities } of results) {
      expect(linesOf(await reader.bills.getById(bill._id))).toEqual(quantities);
    }
  });
});
