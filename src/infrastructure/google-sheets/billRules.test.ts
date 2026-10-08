import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Actor } from '@/domain/models';
import { BootstrapService, createServices } from '@/domain/services';
import { BILL_RULE_MESSAGES, isBillEditable } from '@/domain/services/billing/billRules';
import { buildCatalog } from '@/domain/services/billing/catalog';
import { addDays } from '@/domain/services/dates';
import { createAuditContext } from '../shared/audit';
import { GoogleSheetsDataSource } from './GoogleSheetsDataSource';
import { SCHEMA_VERSION } from './schemas/sheetSchemas';
import { FakeSheetsServer } from './testing/FakeSheetsServer';

/**
 * Bill lifecycle rules: bills are created only for today, today's bills can be
 * edited any number of times, earlier bills can only be marked invalid, and a
 * store may have several bills on the same day.
 */
describe('bill date and edit rules', () => {
  let actor: Actor | null = null;
  beforeEach(() => vi.stubGlobal('fetch', new FakeSheetsServer().fetch));
  afterEach(() => vi.unstubAllGlobals());

  it('pure rule: only valid bills dated today are editable', () => {
    expect(isBillEditable({ status: 'finalized', billDate: '2026-10-07' }, '2026-10-07')).toBe(true);
    expect(isBillEditable({ status: 'finalized', billDate: '2026-10-06' }, '2026-10-07')).toBe(false);
    expect(isBillEditable({ status: 'cancelled', billDate: '2026-10-07' }, '2026-10-07')).toBe(false);
  });

  it('enforces the rules in the bill service', { timeout: 60_000 }, async () => {
    let today = '2026-10-07';
    const ds = new GoogleSheetsDataSource({
      config: { spreadsheetId: 'rules-test-sheet-0123456789012', oauthClientId: 'x.apps.googleusercontent.com', authMode: 'google-identity-services' },
      tokens: { getAccessToken: async () => 'token' },
      audit: createAuditContext(() => actor?.userId),
      identityEmail: () => 'owner@example.com',
    });
    await ds.admin.repairStructure();
    ds.clearCache();
    await new BootstrapService(ds, (next) => {
      actor = next;
    }).initialize({ email: 'owner@example.com', name: 'Owner' }, SCHEMA_VERSION);
    const s = createServices(ds, { getActor: () => actor }, { today: () => today });

    const vendor = await s.vendors.create({ vendorName: 'Aavin', priority: 1 });
    const category = await s.categories.create({ vendorId: vendor._id, categoryName: 'Milk', priority: 1 });
    const milk = await s.products.create({ vendorId: vendor._id, categoryId: category._id, productName: 'Milk', unit: '1 L', purchasePrice: 38, mrp: 40, sellingPrice: 39, priority: 1 });
    const route = await s.routes.create({ routeName: 'Route A', routeCode: 'R-A', priority: 1 });
    const store = await s.customers.create({ routeId: route._id, storeName: 'Store', contactPerson: '', phone: '', address: '', priority: 1, vendorIds: [] });
    const catalog = buildCatalog({ vendors: [vendor], categories: [category], products: [milk], customer: store });
    const draft = (billDate: string, quantity: number) => ({ billDate, routeId: route._id, customerId: store._id, catalog, quantities: { [milk._id]: quantity } });

    // No bills for past dates.
    await expect(s.bills.finalize(draft(addDays(today, -1), 1))).rejects.toMatchObject({
      code: 'VALIDATION',
      fieldErrors: { billDate: BILL_RULE_MESSAGES.createToday },
    });

    // Several bills for the same store today are fine.
    const first = await s.bills.finalize(draft(today, 5));
    const second = await s.bills.finalize(draft(today, 3));
    expect([first.billNumber, second.billNumber]).toEqual(['MLB000001', 'MLB000002']);

    // Today's bill can be edited again and again; its date cannot be changed.
    const v2 = await s.bills.update(first._id, draft(today, 6), first.version);
    const v3 = await s.bills.update(first._id, draft(today, 7), v2.version);
    expect([v2.grandTotal, v3.grandTotal, v3.version]).toEqual([234, 273, 3]);
    await expect(s.bills.update(first._id, draft(addDays(today, 1), 8), v3.version)).rejects.toMatchObject({
      fieldErrors: { billDate: BILL_RULE_MESSAGES.dateLocked },
    });

    // Next day: yesterday's bills are read-only and can only be marked invalid.
    today = addDays(today, 1);
    await expect(s.bills.update(first._id, draft('2026-10-07', 9), v3.version)).rejects.toMatchObject({
      userMessage: BILL_RULE_MESSAGES.editTodayOnly,
    });
    await expect(s.bills.markInvalid(first._id, '  ', v3.version)).rejects.toMatchObject({ code: 'VALIDATION' });
    const invalid = await s.bills.markInvalid(first._id, 'Wrong quantities', v3.version);
    expect(invalid).toMatchObject({ status: 'cancelled', cancelReason: 'Wrong quantities', billNumber: 'MLB000001', grandTotal: 273 });
    await expect(s.bills.markInvalid(first._id, 'again', invalid.version)).rejects.toMatchObject({ code: 'VALIDATION' });

    // The correction is a new bill dated today; the other bill from yesterday is untouched.
    const corrected = await s.bills.finalize(draft(today, 6));
    expect(corrected).toMatchObject({ billNumber: 'MLB000003', billDate: today, status: 'finalized' });
    expect((await s.bills.get(second._id)).status).toBe('finalized');
  });
});
