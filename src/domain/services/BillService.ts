import { AppError, validationError } from '../errors/AppError';
import type {
  Bill,
  BillCustomerSnapshot,
  BillHeader,
  BillRouteSnapshot,
  BillStatus,
  Customer,
  EntityChanges,
  EntityId,
  EntityInput,
  IsoDate,
  Route,
} from '../models';
import { assertCan } from '../permissions/permissions';
import type { BillListQuery, BillRepository, CustomerRepository, RouteRepository, SequenceRepository } from '../repositories';
import { buildBillVendors, type QuantityMap } from './billing/billDocument';
import { calculateTotals, summarizeVendors } from './billing/calculations';
import type { CatalogVendor } from './billing/catalog';
import type { ServiceContext } from './context';
import { addDays, isIsoDate } from './dates';
import { BILL_NUMBER_FORMAT, ID_FORMATS, formatSequenceId, randomToken } from './ids';

/** What the billing screen submits. */
export interface BillDraftInput {
  billDate: IsoDate;
  routeId: EntityId;
  customerId: EntityId;
  notes?: string;
  /** The catalogue exactly as the user saw it — prices are snapshotted from here. */
  catalog: readonly CatalogVendor[];
  quantities: QuantityMap;
}

/** Statuses visible in Past Bills. Drafts are never persisted or listed. */
export const HISTORICAL_STATUSES: BillStatus[] = ['finalized', 'cancelled'];

const MAX_ALLOCATION_ATTEMPTS = 3;

export class BillService {
  constructor(
    private readonly bills: BillRepository,
    private readonly sequences: SequenceRepository,
    private readonly routes: RouteRepository,
    private readonly customers: CustomerRepository,
    private readonly context: ServiceContext,
  ) {}

  async list(query: BillListQuery = {}): Promise<BillHeader[]> {
    assertCan(this.context.getActor(), 'bill:view');
    const statuses = (query.statuses ?? HISTORICAL_STATUSES).filter((status) => status !== 'draft');
    return this.bills.list({ ...query, statuses });
  }

  async get(id: EntityId): Promise<Bill> {
    assertCan(this.context.getActor(), 'bill:view');
    const bill = await this.bills.getById(id);
    if (!bill || bill.status === 'draft') throw new AppError('NOT_FOUND', { userMessage: 'Bill not found.' });
    return bill;
  }

  /** The customer's most recent finalized bill (within `lookbackDays`), used by "Repeat last bill". */
  async findLastForCustomer(customerId: EntityId, today: IsoDate, lookbackDays = 60): Promise<Bill | null> {
    const headers = await this.list({ dateFrom: addDays(today, -lookbackDays), dateTo: today, statuses: ['finalized'] });
    const latest = headers
      .filter((bill) => bill.customerId === customerId)
      .sort((a, b) => b.billDate.localeCompare(a.billDate) || b.billNumber.localeCompare(a.billNumber))[0];
    return latest ? this.get(latest._id) : null;
  }

  /**
   * Builds an unsaved bill for printing. Printing a draft does NOT save it,
   * allocate a bill number or make it appear in Past Bills.
   */
  async buildDraftPreview(input: BillDraftInput): Promise<Bill> {
    const actor = this.context.getActor();
    assertCan(actor, 'bill:print');
    const { route, customer } = await this.resolveParties(input, { allowInactive: true });
    const content = this.buildContent(input, route, customer);
    const now = new Date().toISOString();
    return {
      ...content,
      _id: 'DRAFT',
      billNumber: 'DRAFT',
      status: 'draft',
      isActive: true,
      version: 0,
      finalizedAt: null,
      finalizedBy: null,
      finalizedByName: '',
      createdByName: actor.displayName,
      cancelledAt: null,
      cancelledBy: null,
      cancelReason: '',
      createdAt: now,
      createdBy: actor.userId,
      updatedAt: now,
      updatedBy: actor.userId,
    };
  }

  /** Saves the draft as a finalized bill with the next sequential bill number. */
  async finalize(input: BillDraftInput): Promise<Bill> {
    const actor = this.context.getActor();
    assertCan(actor, 'bill:create');
    const { route, customer } = await this.resolveParties(input, { allowInactive: false });
    const content = this.buildContent(input, route, customer);
    const now = new Date().toISOString();

    let floor = 0;
    for (let attempt = 1; ; attempt += 1) {
      const number = await this.sequences.next('bill', floor);
      const document: EntityInput<Bill> = {
        ...content,
        _id: formatSequenceId(ID_FORMATS.bill, number),
        billNumber: formatSequenceId(BILL_NUMBER_FORMAT, number),
        status: 'finalized',
        isActive: true,
        finalizedAt: now,
        finalizedBy: actor.userId,
        finalizedByName: actor.displayName,
        createdByName: actor.displayName,
        cancelledAt: null,
        cancelledBy: null,
        cancelReason: '',
      };
      try {
        return await this.bills.create(document);
      } catch (error) {
        // Another device claimed the same number — take the next one.
        if (error instanceof AppError && error.code === 'DUPLICATE' && attempt < MAX_ALLOCATION_ATTEMPTS) {
          floor = number;
          continue;
        }
        throw error;
      }
    }
  }

  /** Edits a finalized bill. Existing lines keep the prices captured in the catalogue snapshot. */
  async update(id: EntityId, input: BillDraftInput, expectedVersion: number): Promise<Bill> {
    assertCan(this.context.getActor(), 'bill:update');
    const current = await this.get(id);
    if (current.status !== 'finalized') {
      throw new AppError('VALIDATION', { userMessage: 'Only finalized bills can be edited.' });
    }
    const { route, customer } = await this.resolveParties(input, {
      allowInactive: input.customerId === current.customerId,
    });
    const content = this.buildContent(input, route, customer);
    const changes: EntityChanges<Bill> = { ...content };
    return this.bills.update(id, changes, { expectedVersion });
  }

  /** Soft-deletes a bill. It stays readable in Past Bills with status "cancelled". */
  async cancel(id: EntityId, reason: string, expectedVersion: number): Promise<Bill> {
    const actor = this.context.getActor();
    assertCan(actor, 'bill:cancel');
    const trimmed = reason.trim();
    if (!trimmed) throw validationError({ reason: 'Enter a reason for cancelling this bill' });
    const current = await this.get(id);
    if (current.status === 'cancelled') throw new AppError('VALIDATION', { userMessage: 'This bill is already cancelled.' });
    return this.bills.update(
      id,
      {
        status: 'cancelled',
        isActive: false,
        cancelledAt: new Date().toISOString(),
        cancelledBy: actor.userId,
        cancelReason: trimmed.slice(0, 300),
      },
      { expectedVersion },
    );
  }

  private async resolveParties(
    input: BillDraftInput,
    { allowInactive }: { allowInactive: boolean },
  ): Promise<{ route: Route; customer: Customer }> {
    const fieldErrors: Record<string, string> = {};
    if (!input.routeId) fieldErrors.routeId = 'Select a route';
    if (!input.customerId) fieldErrors.customerId = 'Select a customer';
    if (!isIsoDate(input.billDate)) fieldErrors.billDate = 'Select a valid bill date';
    if (Object.keys(fieldErrors).length) throw validationError(fieldErrors);

    const [route, customer] = await Promise.all([this.routes.getById(input.routeId), this.customers.getById(input.customerId)]);
    if (!route) throw validationError({ routeId: 'Selected route no longer exists' });
    if (!customer) throw validationError({ customerId: 'Selected customer no longer exists' });
    if (customer.routeId !== route._id) throw validationError({ customerId: 'Customer does not belong to the selected route' });
    if (!allowInactive && !route.isActive) throw validationError({ routeId: `Route ${route.routeName} is inactive` });
    if (!allowInactive && !customer.isActive) throw validationError({ customerId: `${customer.storeName} is inactive` });
    return { route, customer };
  }

  private buildContent(input: BillDraftInput, route: Route, customer: Customer) {
    for (const [productId, quantity] of Object.entries(input.quantities)) {
      if (!Number.isFinite(quantity) || quantity < 0) {
        throw validationError({ [`quantities.${productId}`]: 'Quantity cannot be negative' });
      }
    }
    const vendors = buildBillVendors(input.catalog, input.quantities);
    if (!vendors.length) throw validationError({ items: 'Add at least one product with a quantity greater than zero' });

    const routeSnapshot: BillRouteSnapshot = { routeId: route._id, routeName: route.routeName, routeCode: route.routeCode };
    const customerSnapshot: BillCustomerSnapshot = {
      customerId: customer._id,
      storeName: customer.storeName,
      contactPerson: customer.contactPerson,
      phone: customer.phone,
      address: customer.address,
      routeId: customer.routeId,
    };
    return {
      billDate: input.billDate,
      routeId: route._id,
      customerId: customer._id,
      routeSnapshot,
      customerSnapshot,
      vendors,
      vendorIds: vendors.map((vendor) => vendor.vendorId),
      vendorSummary: summarizeVendors(vendors),
      notes: (input.notes ?? '').trim().slice(0, 500),
      itemsRevision: randomToken(),
      ...calculateTotals(vendors),
    };
  }
}
