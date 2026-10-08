import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Actor } from '@/domain/models';
import { BootstrapService, createServices } from '@/domain/services';
import { flattenBill } from '@/domain/services/billing/billDocument';
import { buildCatalog } from '@/domain/services/billing/catalog';
import { toLocalIsoDate } from '@/domain/services/dates';
import { createAuditContext } from '../shared/audit';
import { GoogleSheetsDataSource } from './GoogleSheetsDataSource';
import { SCHEMA_VERSION } from './schemas/sheetSchemas';
import { FakeSheetsServer } from './testing/FakeSheetsServer';

/**
 * Business rule: deleting or changing a product, category, vendor or store
 * never alters saved bills; new bills always use the master data as it is now.
 */
describe('saved bills vs. later master-data changes', () => {
  let actor: Actor | null = null;
  beforeEach(() => vi.stubGlobal('fetch', new FakeSheetsServer().fetch));
  afterEach(() => vi.unstubAllGlobals());

  it('keeps history intact and builds new bills from current data', { timeout: 60_000 }, async () => {
    const ds = new GoogleSheetsDataSource({
      config: { spreadsheetId: 'history-test-sheet-0123456789', oauthClientId: 'x.apps.googleusercontent.com', authMode: 'google-identity-services' },
      tokens: { getAccessToken: async () => 'token' },
      audit: createAuditContext(() => actor?.userId),
      identityEmail: () => 'owner@example.com',
    });
    await ds.admin.repairStructure();
    ds.clearCache();
    await new BootstrapService(ds, (next) => {
      actor = next;
    }).initialize({ email: 'owner@example.com', name: 'Owner' }, SCHEMA_VERSION);
    const s = createServices(ds, { getActor: () => actor });

    const aavin = await s.vendors.create({ vendorName: 'Aavin', priority: 1 });
    const milkymist = await s.vendors.create({ vendorName: 'Milkymist', priority: 2 });
    const aMilk = await s.categories.create({ vendorId: aavin._id, categoryName: 'Milk', priority: 1 });
    const aCurd = await s.categories.create({ vendorId: aavin._id, categoryName: 'Curd', priority: 2 });
    const mMilk = await s.categories.create({ vendorId: milkymist._id, categoryName: 'Milk', priority: 1 });
    const milk = await s.products.create({ vendorId: aavin._id, categoryId: aMilk._id, productName: 'Milk', unit: '1 L', purchasePrice: 38, mrp: 40, sellingPrice: 39, priority: 1 });
    const curd = await s.products.create({ vendorId: aavin._id, categoryId: aCurd._id, productName: 'Curd', unit: '500 g', purchasePrice: 26, mrp: 30, sellingPrice: 28.5, priority: 1 });
    const mmMilk = await s.products.create({ vendorId: milkymist._id, categoryId: mMilk._id, productName: 'Milk', unit: '1 L', purchasePrice: 37, mrp: 42, sellingPrice: 40, priority: 1 });
    const route = await s.routes.create({ routeName: 'Route A', routeCode: 'R-A', priority: 1 });
    const store = await s.customers.create({ routeId: route._id, storeName: 'Sri Murugan Stores', contactPerson: 'Murugan', phone: '98400 11223', address: '12, Gandhi Road', priority: 1, vendorIds: [] });

    const today = toLocalIsoDate();
    const catalogNow = async (lockedLines?: ReturnType<typeof flattenBill>) => {
      ds.clearCache();
      return buildCatalog({
        vendors: await ds.vendors.getAll(),
        categories: await ds.categories.getAll(),
        products: await ds.products.getAll(),
        customer: (await ds.customers.getById(store._id))!,
        lockedLines,
      });
    };

    // 1. A bill saved "yesterday".
    const openedEarlier = await catalogNow();
    const quantities = { [milk._id]: 5, [curd._id]: 2, [mmMilk._id]: 3 };
    const saved = await s.bills.finalize({ billDate: today, routeId: route._id, customerId: store._id, catalog: openedEarlier, quantities });
    expect(saved.grandTotal).toBe(5 * 39 + 2 * 28.5 + 3 * 40);

    // 2. The master data changes: rename, re-price, delete a product, delete a whole vendor, edit the store.
    await s.vendors.update(aavin._id, { vendorName: 'Aavin Dairy', priority: 1 }, aavin.version);
    await s.products.update(milk._id, { vendorId: aavin._id, categoryId: aMilk._id, productName: 'Milk', unit: '1 L', purchasePrice: 40, mrp: 44, sellingPrice: 42, priority: 1 }, milk.version);
    await s.products.deactivate(curd._id, curd.version);
    await s.vendors.deactivate(milkymist._id, (await ds.vendors.getById(milkymist._id))!.version);
    await s.customers.update(store._id, { routeId: route._id, storeName: 'Sri Murugan Super Stores', contactPerson: 'Murugan', phone: '98400 11223', address: '99, New Road', priority: 1, vendorIds: [] }, store.version);

    // 3. The saved bill is exactly as it was — names, prices, store details, totals.
    ds.clearCache();
    const reread = await s.bills.get(saved._id);
    expect(reread.vendors).toEqual(saved.vendors);
    expect(reread.customerSnapshot).toEqual(saved.customerSnapshot);
    expect(reread.grandTotal).toBe(saved.grandTotal);
    expect(reread.vendors.map((v) => v.vendorName)).toEqual(['Aavin', 'Milkymist']);
    const pastBill = (await s.bills.list({ dateFrom: today, dateTo: today }))[0];
    expect(pastBill.customerSnapshot.storeName).toBe('Sri Murugan Stores');
    const report = await s.reports.generateSalesReport({ preset: 'today', from: today, to: today, label: 'Today' });
    expect(report.vendors.map((v) => v.vendorName).sort()).toEqual(['Aavin', 'Milkymist']);
    expect(report.totals.sales).toBe(saved.grandTotal);

    // 4. A screen opened before the changes cannot create a bill with stale data.
    await expect(
      s.bills.finalize({ billDate: today, routeId: route._id, customerId: store._id, catalog: openedEarlier, quantities: { [milk._id]: 1 } }),
    ).rejects.toMatchObject({ code: 'STALE_DATA' });
    await expect(
      s.bills.finalize({ billDate: today, routeId: route._id, customerId: store._id, catalog: openedEarlier, quantities: { [curd._id]: 1 } }),
    ).rejects.toMatchObject({ code: 'STALE_DATA' });

    // 5. A new bill uses the current data: new name, new price, deleted items gone, new store details.
    const fresh = await catalogNow();
    const freshIds = fresh.flatMap((v) => v.categories.flatMap((c) => c.products.map((p) => p.productId)));
    expect(freshIds).toEqual([milk._id]);
    expect(fresh.map((v) => v.vendorName)).toEqual(['Aavin Dairy']);
    const newBill = await s.bills.finalize({ billDate: today, routeId: route._id, customerId: store._id, catalog: fresh, quantities: { [milk._id]: 2 } });
    expect(newBill.vendors[0]).toMatchObject({ vendorName: 'Aavin Dairy', total: 84 });
    expect(newBill.customerSnapshot).toMatchObject({ storeName: 'Sri Murugan Super Stores', address: '99, New Road' });

    // 6. Editing the old bill keeps its saved lines, names, prices and store details.
    const editCatalog = await catalogNow(flattenBill(reread));
    const edited = await s.bills.update(
      saved._id,
      { billDate: today, routeId: route._id, customerId: store._id, catalog: editCatalog, quantities: { ...quantities, [milk._id]: 6 } },
      reread.version,
    );
    expect(edited.vendors.map((v) => v.vendorName)).toEqual(['Aavin', 'Milkymist']);
    const milkLine = edited.vendors[0].categories[0].items[0];
    expect(milkLine).toMatchObject({ productId: milk._id, sellingPrice: 39, quantity: 6, total: 234 });
    expect(edited.customerSnapshot).toEqual(saved.customerSnapshot);
  });
});
