import { AppError } from '../errors/AppError';
import type { EntityId, Product } from '../models';
import type { CategoryRepository, ProductRepository, SequenceRepository, VendorRepository } from '../repositories';
import { assertCan } from '../permissions/permissions';
import { parseOrThrow, productFormSchema, type ProductFormValues } from '../validation/schemas';
import type { ServiceContext } from './context';
import { MasterDataService, duplicateError } from './MasterDataService';
import { normalizeName } from './ordering';

export class ProductService extends MasterDataService<Product> {
  protected readonly entity = 'product' as const;
  protected readonly viewPermission = 'product:view' as const;
  protected readonly managePermission = 'product:manage' as const;
  protected readonly label = 'Product';

  constructor(
    repository: ProductRepository,
    sequences: SequenceRepository,
    context: ServiceContext,
    private readonly vendors: VendorRepository,
    private readonly categories: CategoryRepository,
  ) {
    super(repository, sequences, context);
  }

  async create(input: ProductFormValues): Promise<Product> {
    assertCan(this.context.getActor(), this.managePermission);
    const values = parseOrThrow(productFormSchema, input);
    await this.assertValidParents(values.vendorId, values.categoryId);
    const existing = await this.repository.getAll();
    this.assertUnique(existing, values);
    const _id = await this.allocateId(existing);
    return this.repository.create({ _id, isActive: true, ...values });
  }

  /**
   * Updates master data only. Saved bills hold their own price snapshot, so
   * changing prices here never alters historical bills.
   */
  async update(id: EntityId, input: ProductFormValues, expectedVersion?: number): Promise<Product> {
    assertCan(this.context.getActor(), this.managePermission);
    const values = parseOrThrow(productFormSchema, input);
    const current = await this.requireExisting(id);
    if (current.vendorId !== values.vendorId || current.categoryId !== values.categoryId) {
      await this.assertValidParents(values.vendorId, values.categoryId);
    }
    this.assertUnique(await this.repository.getAll(), values, id);
    return this.repository.update(id, values, { expectedVersion });
  }

  protected async beforeReactivate(id: EntityId): Promise<void> {
    const product = await this.requireExisting(id);
    await this.assertValidParents(product.vendorId, product.categoryId);
  }

  private async assertValidParents(vendorId: EntityId, categoryId: EntityId) {
    const [vendor, category] = await Promise.all([this.vendors.getById(vendorId), this.categories.getById(categoryId)]);
    if (!vendor || !vendor.isActive) {
      throw new AppError('VALIDATION', { fieldErrors: { vendorId: vendor ? 'Vendor is inactive' : 'Vendor does not exist' } });
    }
    if (!category || !category.isActive) {
      throw new AppError('VALIDATION', {
        fieldErrors: { categoryId: category ? 'Category is inactive' : 'Category does not exist' },
      });
    }
    if (category.vendorId !== vendorId) {
      throw new AppError('VALIDATION', { fieldErrors: { categoryId: 'Category does not belong to the selected vendor' } });
    }
  }

  private assertUnique(existing: readonly Product[], values: ProductFormValues, ignoreId?: EntityId) {
    const key = normalizeName(`${values.productName}|${values.unit}`);
    const clash = existing.find(
      (product) =>
        product._id !== ignoreId &&
        product.categoryId === values.categoryId &&
        normalizeName(`${product.productName}|${product.unit}`) === key,
    );
    if (clash) {
      throw duplicateError(
        'productName',
        `"${clash.productName} (${clash.unit})" already exists in this category${clash.isActive ? '' : ' (inactive)'}.`,
      );
    }
  }
}
