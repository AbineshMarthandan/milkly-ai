import { AppError } from '../errors/AppError';
import type { Customer, EntityId } from '../models';
import type { CustomerRepository, RouteRepository, SequenceRepository, VendorRepository } from '../repositories';
import { assertCan } from '../permissions/permissions';
import { customerFormSchema, parseOrThrow, type CustomerFormValues } from '../validation/schemas';
import type { ServiceContext } from './context';
import { MasterDataService, duplicateError } from './MasterDataService';
import { normalizeName } from './ordering';

export class CustomerService extends MasterDataService<Customer> {
  protected readonly entity = 'customer' as const;
  protected readonly viewPermission = 'customer:view' as const;
  protected readonly managePermission = 'customer:manage' as const;
  protected readonly label = 'Customer';

  constructor(
    repository: CustomerRepository,
    sequences: SequenceRepository,
    context: ServiceContext,
    private readonly routes: RouteRepository,
    private readonly vendors: VendorRepository,
  ) {
    super(repository, sequences, context);
  }

  async create(input: CustomerFormValues): Promise<Customer> {
    assertCan(this.context.getActor(), this.managePermission);
    const values = parseOrThrow(customerFormSchema, input);
    await this.assertValidRefs(values);
    const existing = await this.repository.getAll();
    this.assertUnique(existing, values);
    const _id = await this.allocateId(existing);
    return this.repository.create({ _id, customerId: _id, isActive: true, ...values });
  }

  async update(id: EntityId, input: CustomerFormValues, expectedVersion?: number): Promise<Customer> {
    assertCan(this.context.getActor(), this.managePermission);
    const values = parseOrThrow(customerFormSchema, input);
    const current = await this.requireExisting(id);
    await this.assertValidRefs(values, current.routeId);
    this.assertUnique(await this.repository.getAll(), values, id);
    return this.repository.update(id, values, { expectedVersion });
  }

  protected async beforeReactivate(id: EntityId): Promise<void> {
    const customer = await this.requireExisting(id);
    const route = await this.routes.getById(customer.routeId);
    if (!route?.isActive) {
      throw new AppError('VALIDATION', { userMessage: 'The customer’s route is inactive. Reactivate the route first.' });
    }
  }

  /** `allowedInactiveRouteId` lets an existing customer stay on a route that was later deactivated. */
  private async assertValidRefs(values: CustomerFormValues, allowedInactiveRouteId?: EntityId) {
    const route = await this.routes.getById(values.routeId);
    if (!route) throw new AppError('VALIDATION', { fieldErrors: { routeId: 'Selected route does not exist' } });
    if (!route.isActive && route._id !== allowedInactiveRouteId) {
      throw new AppError('VALIDATION', { fieldErrors: { routeId: 'Route is inactive' } });
    }
    if (values.vendorIds.length) {
      const vendorIds = new Set((await this.vendors.getAll()).map((vendor) => vendor._id));
      if (values.vendorIds.some((id) => !vendorIds.has(id))) {
        throw new AppError('VALIDATION', { fieldErrors: { vendorIds: 'One of the selected vendors no longer exists' } });
      }
    }
  }

  private assertUnique(existing: readonly Customer[], values: CustomerFormValues, ignoreId?: EntityId) {
    const clash = existing.find(
      (customer) =>
        customer._id !== ignoreId &&
        customer.routeId === values.routeId &&
        normalizeName(customer.storeName) === normalizeName(values.storeName),
    );
    if (clash) {
      throw duplicateError('storeName', `"${clash.storeName}" already exists on this route${clash.isActive ? '' : ' (inactive)'}.`);
    }
  }
}
