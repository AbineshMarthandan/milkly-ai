import type { EntityId, Vendor } from '../models';
import type { SequenceRepository, VendorRepository } from '../repositories';
import { assertCan } from '../permissions/permissions';
import { parseOrThrow, vendorFormSchema, type VendorFormValues } from '../validation/schemas';
import type { ServiceContext } from './context';
import { MasterDataService, duplicateError } from './MasterDataService';
import { normalizeName } from './ordering';

export class VendorService extends MasterDataService<Vendor> {
  protected readonly entity = 'vendor' as const;
  protected readonly viewPermission = 'vendor:view' as const;
  protected readonly managePermission = 'vendor:manage' as const;
  protected readonly label = 'Vendor';

  constructor(repository: VendorRepository, sequences: SequenceRepository, context: ServiceContext) {
    super(repository, sequences, context);
  }

  async create(input: VendorFormValues): Promise<Vendor> {
    assertCan(this.context.getActor(), this.managePermission);
    const values = parseOrThrow(vendorFormSchema, input);
    const existing = await this.repository.getAll();
    this.assertUniqueName(existing, values.vendorName);
    const _id = await this.allocateId(existing);
    return this.repository.create({ _id, vendorId: _id, isActive: true, ...values });
  }

  async update(id: EntityId, input: VendorFormValues, expectedVersion?: number): Promise<Vendor> {
    assertCan(this.context.getActor(), this.managePermission);
    const values = parseOrThrow(vendorFormSchema, input);
    this.assertUniqueName(await this.repository.getAll(), values.vendorName, id);
    return this.repository.update(id, values, { expectedVersion });
  }

  private assertUniqueName(existing: readonly Vendor[], name: string, ignoreId?: EntityId) {
    const clash = existing.find((vendor) => vendor._id !== ignoreId && normalizeName(vendor.vendorName) === normalizeName(name));
    if (clash) {
      throw duplicateError(
        'vendorName',
        clash.isActive
          ? `A vendor named "${clash.vendorName}" already exists (${clash._id}).`
          : `An inactive vendor named "${clash.vendorName}" already exists (${clash._id}). Reactivate it instead.`,
      );
    }
  }
}
