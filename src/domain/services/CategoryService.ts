import { AppError } from '../errors/AppError';
import type { Category, EntityId } from '../models';
import type { CategoryRepository, ProductRepository, SequenceRepository, VendorRepository } from '../repositories';
import { assertCan } from '../permissions/permissions';
import { categoryFormSchema, parseOrThrow, type CategoryFormValues } from '../validation/schemas';
import type { ServiceContext } from './context';
import { MasterDataService, duplicateError } from './MasterDataService';
import { normalizeName } from './ordering';

export class CategoryService extends MasterDataService<Category> {
  protected readonly entity = 'category' as const;
  protected readonly viewPermission = 'category:view' as const;
  protected readonly managePermission = 'category:manage' as const;
  protected readonly label = 'Category';

  constructor(
    repository: CategoryRepository,
    sequences: SequenceRepository,
    context: ServiceContext,
    private readonly vendors: VendorRepository,
    private readonly products: ProductRepository,
  ) {
    super(repository, sequences, context);
  }

  async create(input: CategoryFormValues): Promise<Category> {
    assertCan(this.context.getActor(), this.managePermission);
    const values = parseOrThrow(categoryFormSchema, input);
    await this.assertActiveVendor(values.vendorId);
    const existing = await this.repository.getAll();
    this.assertUniqueName(existing, values);
    const _id = await this.allocateId(existing);
    return this.repository.create({ _id, isActive: true, ...values });
  }

  async update(id: EntityId, input: CategoryFormValues, expectedVersion?: number): Promise<Category> {
    assertCan(this.context.getActor(), this.managePermission);
    const values = parseOrThrow(categoryFormSchema, input);
    const current = await this.requireExisting(id);
    if (current.vendorId !== values.vendorId) {
      await this.assertActiveVendor(values.vendorId);
      const products = await this.products.getAll();
      if (products.some((product) => product.categoryId === id)) {
        throw new AppError('VALIDATION', {
          userMessage: 'This category already has products, so its vendor cannot be changed.',
          fieldErrors: { vendorId: 'Category has products; vendor cannot be changed' },
        });
      }
    }
    this.assertUniqueName(await this.repository.getAll(), values, id);
    return this.repository.update(id, values, { expectedVersion });
  }

  protected async beforeReactivate(id: EntityId): Promise<void> {
    const category = await this.requireExisting(id);
    await this.assertActiveVendor(category.vendorId);
  }

  private async assertActiveVendor(vendorId: EntityId) {
    const vendor = await this.vendors.getById(vendorId);
    if (!vendor) throw new AppError('VALIDATION', { fieldErrors: { vendorId: 'Selected vendor does not exist' } });
    if (!vendor.isActive) {
      throw new AppError('VALIDATION', {
        userMessage: `Vendor "${vendor.vendorName}" is inactive. Reactivate the vendor first.`,
        fieldErrors: { vendorId: 'Vendor is inactive' },
      });
    }
  }

  private assertUniqueName(existing: readonly Category[], values: CategoryFormValues, ignoreId?: EntityId) {
    const clash = existing.find(
      (category) =>
        category._id !== ignoreId &&
        category.vendorId === values.vendorId &&
        normalizeName(category.categoryName) === normalizeName(values.categoryName),
    );
    if (clash) {
      throw duplicateError(
        'categoryName',
        `This vendor already has a${clash.isActive ? '' : 'n inactive'} category named "${clash.categoryName}".`,
      );
    }
  }
}
