import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { Category, EntityId } from '@/domain/models';
import { sortByPriority } from '@/domain/services/ordering';
import { categoryFormSchema } from '@/domain/validation/schemas';
import { Button } from '@/components/common/Button';
import { Combobox, type ComboOption } from '@/components/forms/Combobox';
import { Field, Input } from '@/components/forms/Field';
import { Drawer } from '@/components/modals/Overlay';
import { handleFormError, nextPriority, useMasterList, useSaveMaster } from '../shared/masterData';

const FORM_ID = 'category-form';

interface CategoryFormDrawerProps {
  open: boolean;
  category: Category | null;
  /** Pre-selected vendor for a new category (e.g. the page's vendor filter). */
  defaultVendorId?: EntityId | null;
  onClose: () => void;
}

export function CategoryFormDrawer({ open, category, defaultVendorId, onClose }: CategoryFormDrawerProps) {
  const { data: vendors = [] } = useMasterList('vendors');
  const { data: categories = [] } = useMasterList('categories');
  const save = useSaveMaster('categories');
  const form = useForm({ resolver: zodResolver(categoryFormSchema) });
  const { errors } = form.formState;

  /** Next free priority inside one vendor. */
  const suggestPriority = (vendorId: EntityId) => nextPriority(categories.filter((item) => item.vendorId === vendorId));

  useEffect(() => {
    if (!open) return;
    const presetVendor = vendors.find((vendor) => vendor._id === defaultVendorId && vendor.isActive);
    const vendorId = category?.vendorId ?? presetVendor?._id ?? '';
    form.reset({
      vendorId,
      categoryName: category?.categoryName ?? '',
      priority: category?.priority ?? suggestPriority(vendorId),
    });
    // Reset only when the drawer opens for a (different) record.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, category]);

  // Active vendors, plus the current one when editing a category of an inactive vendor.
  const vendorOptions = useMemo<ComboOption[]>(
    () =>
      sortByPriority(
        vendors.filter((vendor) => vendor.isActive || vendor._id === category?.vendorId),
        (vendor) => vendor.vendorName,
      ).map((vendor) => ({ value: vendor._id, label: vendor.vendorName, meta: vendor.isActive ? undefined : 'Inactive' })),
    [vendors, category],
  );

  /** A new category follows the chosen vendor's numbering, unless a priority was typed already. */
  const changeVendor = (vendorId: EntityId) => {
    if (!category && !form.getFieldState('priority').isDirty) form.setValue('priority', suggestPriority(vendorId));
  };

  const submit = form.handleSubmit(async (values) => {
    try {
      const saved = await save.mutateAsync({ id: category?._id, values, version: category?.version });
      toast.success(category ? `${saved.categoryName} updated` : `${saved.categoryName} added as ${saved._id}`);
      onClose();
    } catch (error) {
      handleFormError(error, form.setError, ['vendorId', 'categoryName', 'priority']);
    }
  });

  return (
    <Drawer
      open={open}
      onClose={onClose}
      dismissible={!save.isPending}
      title={category ? 'Edit category' : 'Add category'}
      description={category ? `Category ID ${category._id} (never changes)` : 'A category ID such as MLCAT000001 is assigned automatically.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} loading={save.isPending}>
            {category ? 'Save changes' : 'Add category'}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={submit} className="space-y-4" noValidate>
        <Field
          label="Vendor"
          required
          error={errors.vendorId?.message}
          hint={category ? 'A category that already has products cannot move to another vendor.' : undefined}
        >
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
        <Field label="Category name" required error={errors.categoryName?.message}>
          {(props) => <Input {...props} {...form.register('categoryName')} autoFocus placeholder="e.g. Milk" />}
        </Field>
        <Field
          label="Priority"
          required
          error={errors.priority?.message}
          hint="Controls the order of categories inside the vendor on bills: 1 prints first."
        >
          {(props) => <Input {...props} {...form.register('priority')} type="number" min={1} step={1} inputMode="numeric" className="w-32" />}
        </Field>
      </form>
    </Drawer>
  );
}
