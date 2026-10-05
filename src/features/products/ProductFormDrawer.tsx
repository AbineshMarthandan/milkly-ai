import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import type { EntityId, Product } from '@/domain/models';
import { calculateLine } from '@/domain/services/billing/calculations';
import { roundMoney } from '@/domain/services/money';
import { sortByPriority } from '@/domain/services/ordering';
import { productFormSchema } from '@/domain/validation/schemas';
import { Button } from '@/components/common/Button';
import { Combobox, type ComboOption } from '@/components/forms/Combobox';
import { Field, Input } from '@/components/forms/Field';
import { Drawer } from '@/components/modals/Overlay';
import { useMoney } from '@/hooks/useAppSettings';
import { cn } from '@/utils/cn';
import { formatPercent } from '@/utils/format';
import { handleFormError, nextPriority, useMasterList, useSaveMaster } from '../shared/masterData';

const FORM_ID = 'product-form';

/** Raw input value → number for the live preview (blank or invalid counts as 0). */
const toAmount = (value: unknown) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
};

interface ProductFormDrawerProps {
  open: boolean;
  product: Product | null;
  /** Pre-selected vendor/category for a new product (e.g. the page's filters). */
  defaultVendorId?: EntityId | null;
  defaultCategoryId?: EntityId | null;
  onClose: () => void;
}

export function ProductFormDrawer({ open, product, defaultVendorId, defaultCategoryId, onClose }: ProductFormDrawerProps) {
  const money = useMoney();
  const { data: vendors = [] } = useMasterList('vendors');
  const { data: categories = [] } = useMasterList('categories');
  const { data: products = [] } = useMasterList('products');
  const save = useSaveMaster('products');
  const form = useForm({ resolver: zodResolver(productFormSchema) });
  const { errors } = form.formState;
  const vendorId = useWatch({ control: form.control, name: 'vendorId' });
  const [purchaseInput, mrpInput, sellingInput] = useWatch({ control: form.control, name: ['purchasePrice', 'mrp', 'sellingPrice'] });

  /** Next free priority inside one category. */
  const suggestPriority = (categoryId: EntityId) => nextPriority(products.filter((item) => item.categoryId === categoryId));

  useEffect(() => {
    if (!open) return;
    const presetCategory = categories.find((item) => item._id === defaultCategoryId && item.isActive);
    const presetVendor = vendors.find((item) => item._id === (presetCategory?.vendorId ?? defaultVendorId) && item.isActive);
    const categoryId = product?.categoryId ?? (presetCategory && presetCategory.vendorId === presetVendor?._id ? presetCategory._id : '');
    form.reset({
      vendorId: product?.vendorId ?? presetVendor?._id ?? '',
      categoryId,
      productName: product?.productName ?? '',
      unit: product?.unit ?? '',
      purchasePrice: product?.purchasePrice ?? '',
      mrp: product?.mrp ?? '',
      sellingPrice: product?.sellingPrice ?? '',
      priority: product?.priority ?? suggestPriority(categoryId),
    });
    // Reset only when the drawer opens for a (different) record.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, product]);

  // Active vendors, plus the current one when editing a product of an inactive vendor.
  const vendorOptions = useMemo<ComboOption[]>(
    () =>
      sortByPriority(
        vendors.filter((vendor) => vendor.isActive || vendor._id === product?.vendorId),
        (vendor) => vendor.vendorName,
      ).map((vendor) => ({ value: vendor._id, label: vendor.vendorName, meta: vendor.isActive ? undefined : 'Inactive' })),
    [vendors, product],
  );

  // Active categories of the selected vendor, plus the current one when editing.
  const categoryOptions = useMemo<ComboOption[]>(
    () =>
      sortByPriority(
        categories.filter(
          (category) => category.vendorId === vendorId && (category.isActive || category._id === product?.categoryId),
        ),
        (category) => category.categoryName,
      ).map((category) => ({ value: category._id, label: category.categoryName, meta: category.isActive ? undefined : 'Inactive' })),
    [categories, vendorId, product],
  );

  /** Categories belong to one vendor, so switching vendor clears the category. */
  const changeVendor = (nextVendorId: EntityId) => {
    const current = categories.find((category) => category._id === form.getValues('categoryId'));
    if (current?.vendorId !== nextVendorId) form.setValue('categoryId', '');
  };

  /** A new product follows the chosen category's numbering, unless a priority was typed already. */
  const changeCategory = (categoryId: EntityId) => {
    if (!product && categoryId && !form.getFieldState('priority').isDirty) form.setValue('priority', suggestPriority(categoryId));
  };

  // Live preview for one unit, using the same calculations as bills.
  const line = calculateLine({ mrp: toAmount(mrpInput), sellingPrice: toAmount(sellingInput), quantity: 1 });
  const margin = roundMoney(line.total - toAmount(purchaseInput));

  const submit = form.handleSubmit(async (values) => {
    try {
      const saved = await save.mutateAsync({ id: product?._id, values, version: product?.version });
      toast.success(product ? `${saved.productName} updated` : `${saved.productName} added as ${saved._id}`);
      onClose();
    } catch (error) {
      handleFormError(error, form.setError, [
        'vendorId',
        'categoryId',
        'productName',
        'unit',
        'purchasePrice',
        'mrp',
        'sellingPrice',
        'priority',
      ]);
    }
  });

  const priceInput = { type: 'number', min: 0, step: 0.01, inputMode: 'decimal', placeholder: '0.00' } as const;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size="lg"
      dismissible={!save.isPending}
      title={product ? 'Edit product' : 'Add product'}
      description={product ? `Product ID ${product._id} (never changes)` : 'A product ID such as MLPID000001 is assigned automatically.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} loading={save.isPending}>
            {product ? 'Save changes' : 'Add product'}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Vendor" required error={errors.vendorId?.message}>
            {(props) => (
              <Controller
                control={form.control}
                name="vendorId"
                render={({ field }) => (
                  <Combobox
                    {...props}
                    ref={field.ref}
                    options={vendorOptions}
                    value={field.value}
                    onChange={(value) => {
                      field.onChange(value ?? '');
                      changeVendor(value ?? '');
                    }}
                    invalid={Boolean(errors.vendorId)}
                    placeholder="Select a vendor…"
                    emptyText="No active vendors"
                  />
                )}
              />
            )}
          </Field>
          <Field label="Category" required error={errors.categoryId?.message}>
            {(props) => (
              <Controller
                control={form.control}
                name="categoryId"
                render={({ field }) => (
                  <Combobox
                    {...props}
                    ref={field.ref}
                    options={categoryOptions}
                    value={field.value}
                    onChange={(value) => {
                      field.onChange(value ?? '');
                      changeCategory(value ?? '');
                    }}
                    invalid={Boolean(errors.categoryId)}
                    disabled={!vendorId}
                    placeholder={vendorId ? 'Select a category…' : 'Select a vendor first'}
                    emptyText="No active categories for this vendor"
                  />
                )}
              />
            )}
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
          <Field label="Product name" required error={errors.productName?.message}>
            {(props) => <Input {...props} {...form.register('productName')} autoFocus placeholder="e.g. Toned Milk" />}
          </Field>
          <Field label="Unit" required error={errors.unit?.message}>
            {(props) => <Input {...props} {...form.register('unit')} placeholder="1 L, 500 ml, 200 g" />}
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Purchase price" required error={errors.purchasePrice?.message} hint="Your cost per unit">
            {(props) => <Input {...props} {...form.register('purchasePrice')} {...priceInput} />}
          </Field>
          <Field label="MRP" required error={errors.mrp?.message} hint="Printed on the pack">
            {(props) => <Input {...props} {...form.register('mrp')} {...priceInput} />}
          </Field>
          <Field label="Selling price" required error={errors.sellingPrice?.message} hint="Billed to the store">
            {(props) => <Input {...props} {...form.register('sellingPrice')} {...priceInput} />}
          </Field>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Per unit</div>
          <dl className="mt-2 grid grid-cols-3 gap-3">
            <div>
              <dt className="text-xs text-slate-500">Discount</dt>
              <dd className="tabular text-sm font-medium text-slate-900">{money(line.discountAmount)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Discount %</dt>
              <dd className="tabular text-sm font-medium text-slate-900">{formatPercent(line.discountPercentage)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Margin</dt>
              <dd className={cn('tabular text-sm font-medium', margin < 0 ? 'text-rose-600' : 'text-emerald-700')}>{money(margin)}</dd>
            </div>
          </dl>
          <p className="mt-3 border-t border-slate-200 pt-2 text-xs text-slate-500">
            Changing prices never alters saved bills: each bill keeps the prices it was created with.
          </p>
        </div>
        <Field
          label="Priority"
          required
          error={errors.priority?.message}
          hint="Controls the order of products inside the category on bills: 1 prints first."
        >
          {(props) => <Input {...props} {...form.register('priority')} type="number" min={1} step={1} inputMode="numeric" className="w-32" />}
        </Field>
      </form>
    </Drawer>
  );
}
