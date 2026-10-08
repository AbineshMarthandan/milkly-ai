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
import type { Category, Product, Vendor } from '../models/masterData';
import { assertCan } from '../permissions/permissions';
import type {
  BillListQuery,
  BillRepository,
  CategoryRepository,
  CustomerRepository,
  ProductRepository,
  RouteRepository,
  SequenceRepository,
  VendorRepository,
} from '../repositories';
import { buildBillVendors, type QuantityMap } from './billing/billDocument';
import { calculateTotals, summarizeVendors } from './billing/calculations';
import type { CatalogVendor } from './billing/catalog';
import type { ServiceContext } from './context';
import { BILL_RULE_MESSAGES, canMarkInvalid, isBillEditable } from './billing/billRules';
import { addDays, isIsoDate, toLocalIsoDate } from './dates';
import { BILL_NUMBER_FORMAT, ID_FORMATS, formatSequenceId, randomToken } from './ids';

/** What the billing screen submits. */
export interface BillDraftInput {
  billDate: IsoDate;
  routeId: EntityId;
  customerId: EntityId;
  notes?: string;
  /**
   * The catalogue exactly as the user saw it — prices are snapshotted from
   * here. New lines are re-checked against the current product master before
   * saving or printing (see `assertCatalogCurrent`).
   */
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
    private readonly master: { vendors: VendorRepository; categories: CategoryRepository; products: ProductRepository },
    /** The current business day; injectable for tests. */
    private readonly today: () => IsoDate = () => toLocalIsoDate(),
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
    this.assertDatedToday(input);
    const { route, customer } = await this.resolveParties(input, { allowInactive: true });
    await this.assertCatalogCurrent(input);
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

  /**
   * Saves the draft as a finalized bill with the next sequential bill number.
   * Always dated today; several bills for the same store on one day are fine.
   */
  async finalize(input: BillDraftInput): Promise<Bill> {
    const actor = this.context.getActor();
    assertCan(actor, 'bill:create');
    this.assertDatedToday(input);
    const { route, customer } = await this.resolveParties(input, { allowInactive: false });
    await this.assertCatalogCurrent(input);
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

  /**
   * Edits a finalized bill. Lines already on the bill keep the names and prices
   * saved with it; lines added now must match the current product master. The
   * store/route details stay as saved unless the bill is moved to another store.
   * Only today's bills can be edited; earlier bills can only be marked invalid.
   */
  async update(id: EntityId, input: BillDraftInput, expectedVersion: number): Promise<Bill> {
    assertCan(this.context.getActor(), 'bill:update');
    const current = await this.get(id);
    if (!isBillEditable(current, this.today())) {
      throw new AppError('VALIDATION', {
        userMessage: current.status === 'finalized' ? BILL_RULE_MESSAGES.editTodayOnly : 'Invalid bills cannot be edited.',
      });
    }
    if (input.billDate !== current.billDate) throw validationError({ billDate: BILL_RULE_MESSAGES.dateLocked });
    const sameStore = input.customerId === current.customerId && input.routeId === current.routeId;
    const { route, customer } = await this.resolveParties(input, { allowInactive: sameStore });
    await this.assertCatalogCurrent(input);
    const content = this.buildContent(input, route, customer);
    const changes: EntityChanges<Bill> = sameStore
      ? { ...content, customerSnapshot: current.customerSnapshot, routeSnapshot: current.routeSnapshot }
      : { ...content };
    return this.bills.update(id, changes, { expectedVersion });
  }

  /**
   * Marks a bill (from any date) invalid, with a reason. It stays on record and
   * readable in Past Bills, keeps its number, and is excluded from sales and
   * reports. This is how a bill from an earlier day is "corrected": mark it
   * invalid, then create a new bill today. Stored as status `cancelled`.
   */
  async markInvalid(id: EntityId, reason: string, expectedVersion: number): Promise<Bill> {
    const actor = this.context.getActor();
    assertCan(actor, 'bill:cancel');
    const trimmed = reason.trim();
    if (!trimmed) throw validationError({ reason: 'Enter the reason this bill is invalid' });
    const current = await this.get(id);
    if (!canMarkInvalid(current)) throw new AppError('VALIDATION', { userMessage: 'This bill is already marked invalid.' });
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

  private assertDatedToday(input: BillDraftInput) {
    if (input.billDate !== this.today()) throw validationError({ billDate: BILL_RULE_MESSAGES.createToday });
  }

  /**
   * New bills must reflect the product master as it is *now*. If a product on
   * the screen was deleted, moved under a deleted vendor/category, renamed or
   * re-priced since the screen loaded (e.g. by another admin), refuse and ask
   * the user to review the refreshed catalogue. Lines already on a saved bill
   * (`locked`) are exempt — they keep their saved values by design.
   */
  private async assertCatalogCurrent(input: BillDraftInput) {
    const ordered = input.catalog.flatMap((vendor) =>
      vendor.categories.flatMap((category) =>
        category.products
          .filter((product) => !product.locked && (input.quantities[product.productId] ?? 0) > 0)
          .map((product) => ({ vendor, category, product })),
      ),
    );
    if (!ordered.length) return;
    const [vendors, categories, products] = await Promise.all([
      this.master.vendors.getAll(),
      this.master.categories.getAll(),
      this.master.products.getAll(),
    ]);
    const byId = <T extends { _id: string }>(items: readonly T[]) => new Map(items.map((item) => [item._id, item]));
    const vendorById = byId<Vendor>(vendors);
    const categoryById = byId<Category>(categories);
    const productById = byId<Product>(products);

    const problems: string[] = [];
    for (const { vendor, category, product } of ordered) {
      const label = `${product.productName} ${product.unit}`;
      const current = productById.get(product.productId);
      const currentVendor = current && vendorById.get(current.vendorId);
      const currentCategory = current && categoryById.get(current.categoryId);
      if (!current || !current.isActive || !currentVendor?.isActive || !currentCategory?.isActive) {
        problems.push(`${label} is no longer available`);
      } else if (
        current.mrp !== product.mrp ||
        current.sellingPrice !== product.sellingPrice ||
        current.purchasePrice !== product.purchasePrice
      ) {
        problems.push(`${label} has a new price`);
      } else if (
        current.productName !== product.productName ||
        current.unit !== product.unit ||
        current.vendorId !== vendor.vendorId ||
        current.categoryId !== category.categoryId ||
        currentVendor.vendorName !== vendor.vendorName ||
        currentCategory.categoryName !== category.categoryName
      ) {
        problems.push(`${label} was renamed or moved`);
      }
    }
    if (problems.length) {
      throw new AppError('STALE_DATA', {
        userMessage: `Products changed since this screen was opened: ${problems.slice(0, 3).join('; ')}${problems.length > 3 ? ` (+${problems.length - 3} more)` : ''}. The list has been refreshed — please check the bill and try again.`,
      });
    }
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
