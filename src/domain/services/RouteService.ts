import type { EntityId, Route } from '../models';
import type { RouteRepository, SequenceRepository } from '../repositories';
import { assertCan } from '../permissions/permissions';
import { parseOrThrow, routeFormSchema, type RouteFormValues } from '../validation/schemas';
import type { ServiceContext } from './context';
import { MasterDataService, duplicateError } from './MasterDataService';
import { normalizeName } from './ordering';

export class RouteService extends MasterDataService<Route> {
  protected readonly entity = 'route' as const;
  protected readonly viewPermission = 'route:view' as const;
  protected readonly managePermission = 'route:manage' as const;
  protected readonly label = 'Route';

  constructor(repository: RouteRepository, sequences: SequenceRepository, context: ServiceContext) {
    super(repository, sequences, context);
  }

  async create(input: RouteFormValues): Promise<Route> {
    assertCan(this.context.getActor(), this.managePermission);
    const values = parseOrThrow(routeFormSchema, input);
    const existing = await this.repository.getAll();
    this.assertUnique(existing, values);
    const _id = await this.allocateId(existing);
    return this.repository.create({ _id, isActive: true, ...values });
  }

  async update(id: EntityId, input: RouteFormValues, expectedVersion?: number): Promise<Route> {
    assertCan(this.context.getActor(), this.managePermission);
    const values = parseOrThrow(routeFormSchema, input);
    this.assertUnique(await this.repository.getAll(), values, id);
    return this.repository.update(id, values, { expectedVersion });
  }

  private assertUnique(existing: readonly Route[], values: RouteFormValues, ignoreId?: EntityId) {
    const others = existing.filter((route) => route._id !== ignoreId);
    const codeClash = others.find((route) => route.routeCode.toUpperCase() === values.routeCode.toUpperCase());
    if (codeClash) throw duplicateError('routeCode', `Route code "${codeClash.routeCode}" is already used by ${codeClash.routeName}.`);
    const nameClash = others.find((route) => normalizeName(route.routeName) === normalizeName(values.routeName));
    if (nameClash) throw duplicateError('routeName', `A route named "${nameClash.routeName}" already exists.`);
  }
}
