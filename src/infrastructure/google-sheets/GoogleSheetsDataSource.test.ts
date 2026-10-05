import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Actor } from '@/domain/models';
import { BootstrapService, createServices } from '@/domain/services';
import { flattenBill } from '@/domain/services/billing/billDocument';
import { buildCatalog } from '@/domain/services/billing/catalog';
import { toLocalIsoDate } from '@/domain/services/dates';
import { createAuditContext } from '../shared/audit';
import { GoogleSheetsDataSource } from './GoogleSheetsDataSource';
import { SCHEMA_VERSION, SHEET_SCHEMAS } from './schemas/sheetSchemas';
import { FakeSheetsServer } from './testing/FakeSheetsServer';

/**
 * End-to-end test of the Google Sheets persistence layer against an in-memory
 * fake of the Sheets REST API: the same repositories, row mapping, batching,
 * sequence allocation and bill line layout used in production.
 */
describe('GoogleSheetsDataSource (against a fake Sheets API)', () => {
  let server: FakeSheetsServer;
  let actor: Actor | null;

  beforeEach(() => {
    server = new FakeSheetsServer();
    actor = null;
    vi.stubGlobal('fetch', server.fetch);
  });
  afterEach(() => vi.unstubAllGlobals());

  const createDataSource = () =>
    new GoogleSheetsDataSource({
      config: { spreadsheetId: 'test-spreadsheet-id-0123456789', oauthClientId: 'x.apps.googleusercontent.com', authMode: 'google-identity-services' },
      tokens: { getAccessToken: async () => 'test-token' },
      audit: createAuditContext(() => actor?.userId),
      identityEmail: () => 'owner@example.com',
    });

  it('initialises an empty spreadsheet and runs the full billing lifecycle', { timeout: 60_000 }, async () => {
    const ds = createDataSource();

    // A brand-new spreadsheet has no tabs → reading users fails as "missing".
    await expect(ds.users.getAll()).rejects.toMatchObject({ code: 'SHEET_MISSING' });

    // Initialise: tabs + headers, then the first Tech Admin.
    const repair = await ds.admin.repairStructure();
    expect(repair.createdCollections).toHaveLength(10);
    expect(server.table('bills')[0]).toEqual(SHEET_SCHEMAS.bills.columns.map((column) => column.key));
    ds.clearCache();
    const admin = await new BootstrapService(ds, (next) => {
      actor = next;
    }).initialize({ email: 'Owner@Example.com', name: 'Owner' }, SCHEMA_VERSION);
    expect(admin).toMatchObject({ _id: 'MLUID000001', email: 'owner@example.com', role: 'TECH_ADMIN', version: 1 });
    expect((await ds.admin.inspectStructure()).healthy).toBe(true);

    const services = createServices(ds, { getActor: () => actor });

    // Master data with sequential IDs.
    const aavin = await services.vendors.create({ vendorName: 'Aavin', priority: 1 });
    const milkymist = await services.vendors.create({ vendorName: 'Milkymist', priority: 2 });
    expect([aavin._id, milkymist._id]).toEqual(['MLVID000001', 'MLVID000002']);
    await expect(services.vendors.create({ vendorName: ' aavin ', priority: 3 })).rejects.toMatchObject({ code: 'DUPLICATE' });

    const milk = await services.categories.create({ vendorId: aavin._id, categoryName: 'Milk', priority: 1 });
    const mmMilk = await services.categories.create({ vendorId: milkymist._id, categoryName: 'Milk', priority: 1 });
    const p1 = await services.products.create({
      vendorId: aavin._id, categoryId: milk._id, productName: 'Milk', unit: '1 L', purchasePrice: 38, mrp: 40, sellingPrice: 39, priority: 1,
    });
    const p2 = await services.products.create({
      vendorId: milkymist._id, categoryId: mmMilk._id, productName: 'Milk', unit: '1 L', purchasePrice: 37, mrp: 42, sellingPrice: 40, priority: 1,
    });
    expect(p1._id).toBe('MLPID000001');
    const route = await services.routes.create({ routeName: 'Route A', routeCode: 'r-a', priority: 1 });
    expect(route.routeCode).toBe('R-A');
    const store = await services.customers.create({
      routeId: route._id, storeName: 'Store A', contactPerson: '', phone: '0098400 11223', address: '', priority: 1, vendorIds: [],
    });
    expect(store._id).toBe('MLCID000001');
    // Phone with a leading zero survives (RAW input, stored as text).
    expect((await ds.customers.getById(store._id))?.phone).toBe('0098400 11223');

    // Finalize a bill → MLB000001 with header + 2 line rows.
    const today = toLocalIsoDate();
    const catalogFor = async (lockedLines?: ReturnType<typeof flattenBill>) =>
      buildCatalog({
        vendors: await ds.vendors.getAll(),
        categories: await ds.categories.getAll(),
        products: await ds.products.getAll(),
        customer: store,
        lockedLines,
      });
    const bill = await services.bills.finalize({
      billDate: today, routeId: route._id, customerId: store._id, catalog: await catalogFor(), quantities: { [p1._id]: 5, [p2._id]: 5 },
    });
    expect(bill).toMatchObject({ _id: 'MLBID000001', billNumber: 'MLB000001', grandTotal: 395, totalDiscount: 15, status: 'finalized' });
    expect(server.table('bill_items')).toHaveLength(3); // header + 2 lines

    // Changing the master price never touches the saved bill.
    await services.products.update(p1._id, {
      vendorId: aavin._id, categoryId: milk._id, productName: 'Milk', unit: '1 L', purchasePrice: 39, mrp: 42, sellingPrice: 41, priority: 1,
    });
    ds.clearCache();
    const reloaded = await services.bills.get(bill._id);
    expect(reloaded.vendors[0].categories[0].items[0]).toMatchObject({ productId: p1._id, sellingPrice: 39, total: 195 });
    expect(reloaded.vendors.map((vendor) => vendor.vendorName)).toEqual(['Aavin', 'Milkymist']);

    // Past bills by date range (reads only the date column + matching rows).
    expect((await services.bills.list({ dateFrom: today, dateTo: today })).map((b) => b.billNumber)).toEqual(['MLB000001']);
    expect(await services.bills.list({ dateFrom: '2000-01-01', dateTo: '2000-01-31' })).toEqual([]);

    // Edit (as the edit screen does: saved lines keep their snapshot prices).
    const edited = await services.bills.update(
      bill._id,
      { billDate: today, routeId: route._id, customerId: store._id, catalog: await catalogFor(flattenBill(reloaded)), quantities: { [p1._id]: 2 } },
      reloaded.version,
    );
    expect(edited).toMatchObject({ billNumber: 'MLB000001', version: 2, itemCount: 1, grandTotal: 78 });
    await expect(
      services.bills.update(bill._id, { billDate: today, routeId: route._id, customerId: store._id, catalog: await catalogFor(), quantities: { [p1._id]: 1 } }, 1),
    ).rejects.toMatchObject({ code: 'CONCURRENT_UPDATE' });
    ds.clearCache();
    const afterEdit = await services.bills.get(bill._id);
    expect(afterEdit.vendors.flatMap((v) => v.categories.flatMap((c) => c.items)).map((i) => [i.productId, i.quantity])).toEqual([[p1._id, 2]]);

    // A second bill gets the next number; reports read only current lines.
    const second = await services.bills.finalize({
      billDate: today, routeId: route._id, customerId: store._id, catalog: await catalogFor(), quantities: { [p2._id]: 3 },
    });
    expect(second.billNumber).toBe('MLB000002');
    const lines = await ds.bills.listLines({ dateFrom: today, dateTo: today, statuses: ['finalized'] });
    expect(lines.map((line) => [line.billNumber, line.quantity])).toEqual([
      ['MLB000002', 3],
      ['MLB000001', 2],
    ]);

    // Cancel = soft delete; bill stays readable, numbers never reused.
    const cancelled = await services.bills.cancel(second._id, 'Wrong store', second.version);
    expect(cancelled).toMatchObject({ status: 'cancelled', isActive: false, cancelReason: 'Wrong store' });
    expect(await ds.bills.count()).toBe(2);
    const report = await services.reports.generateSalesReport({ preset: 'today', from: today, to: today, label: 'Today' });
    expect(report.billCount).toBe(1);
    expect(report.totals).toMatchObject({ sales: 78, cost: 76, profit: 2 });

    // Soft delete of master data keeps the row.
    await services.vendors.deactivate(milkymist._id, milkymist.version);
    ds.clearCache();
    expect((await ds.vendors.getById(milkymist._id))?.isActive).toBe(false);
    expect(server.table('vendors')).toHaveLength(3);

    // Diagnostics: every check passes on a healthy sheet.
    const checks = await ds.admin.testConnection();
    expect(checks.map((check) => `${check.id}:${check.status}`)).toEqual([
      'auth:pass', 'database:pass', 'collections:pass', 'fields:pass', 'read:pass', 'write:pass',
    ]);
  });

  it('reports missing columns and repairs them without touching data', { timeout: 30_000 }, async () => {
    const ds = createDataSource();
    await ds.admin.repairStructure();
    // Simulate a hand-edited sheet: drop the "priority" header from vendors.
    server.table('vendors')[0] = server.table('vendors')[0].filter((key) => key !== 'priority');
    ds.clearCache();
    const report = await ds.admin.inspectStructure();
    expect(report.collections.find((c) => c.name === 'vendors')?.missingFields).toEqual(['priority']);
    actor = { userId: 'MLUID000001', email: 'a@b.c', displayName: 'A', role: 'TECH_ADMIN' };
    await expect(ds.vendors.create({ _id: 'MLVID000009', vendorId: 'MLVID000009', vendorName: 'X', priority: 1, isActive: true })).rejects.toMatchObject({
      code: 'SCHEMA_MISMATCH',
    });
    const repaired = await ds.admin.repairStructure();
    expect(repaired.addedFields).toEqual({ vendors: ['priority'] });
    ds.clearCache();
    expect((await ds.admin.inspectStructure()).healthy).toBe(true);
  });
});
