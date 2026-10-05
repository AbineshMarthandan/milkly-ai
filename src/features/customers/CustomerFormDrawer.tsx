import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { Customer, EntityId } from '@/domain/models';
import { sortByPriority } from '@/domain/services/ordering';
import { customerFormSchema } from '@/domain/validation/schemas';
import { Button } from '@/components/common/Button';
import { Combobox, type ComboOption } from '@/components/forms/Combobox';
import { Checkbox, Field, Input, Textarea } from '@/components/forms/Field';
import { Drawer } from '@/components/modals/Overlay';
import { handleFormError, nextPriority, useMasterList, useSaveMaster } from '../shared/masterData';

const FORM_ID = 'customer-form';

interface CustomerFormDrawerProps {
  open: boolean;
  customer: Customer | null;
  /** Pre-selected route for a new customer (e.g. the page's route filter). */
  defaultRouteId?: EntityId | null;
  onClose: () => void;
}

export function CustomerFormDrawer({ open, customer, defaultRouteId, onClose }: CustomerFormDrawerProps) {
  const { data: routes = [] } = useMasterList('routes');
  const { data: customers = [] } = useMasterList('customers');
  const { data: vendors = [] } = useMasterList('vendors');
  const save = useSaveMaster('customers');
  const form = useForm({ resolver: zodResolver(customerFormSchema) });
  const { errors } = form.formState;

  /** Next free priority inside one route. */
  const suggestPriority = (routeId: EntityId) => nextPriority(customers.filter((item) => item.routeId === routeId));

  useEffect(() => {
    if (!open) return;
    const presetRoute = routes.find((route) => route._id === defaultRouteId && route.isActive);
    const routeId = customer?.routeId ?? presetRoute?._id ?? '';
    form.reset({
      routeId,
      storeName: customer?.storeName ?? '',
      contactPerson: customer?.contactPerson ?? '',
      phone: customer?.phone ?? '',
      address: customer?.address ?? '',
      priority: customer?.priority ?? suggestPriority(routeId),
      vendorIds: customer?.vendorIds ?? [],
    });
    // Reset only when the drawer opens for a (different) record.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, customer]);

  // Active routes, plus the current one when editing a customer of an inactive route.
  const routeOptions = useMemo<ComboOption[]>(
    () =>
      sortByPriority(
        routes.filter((route) => route.isActive || route._id === customer?.routeId),
        (route) => route.routeName,
      ).map((route) => ({
        value: route._id,
        label: route.routeName,
        description: route.isActive ? undefined : 'Inactive',
        meta: route.routeCode,
      })),
    [routes, customer],
  );

  // Active vendors in bill order, plus any inactive vendor this customer still has selected.
  const vendorChoices = useMemo(
    () =>
      sortByPriority(
        vendors.filter((vendor) => vendor.isActive || customer?.vendorIds.includes(vendor._id)),
        (vendor) => vendor.vendorName,
      ),
    [vendors, customer],
  );

  /** A new customer goes to the end of the chosen route, unless a priority was typed already. */
  const changeRoute = (routeId: EntityId) => {
    if (!customer && !form.getFieldState('priority').isDirty) form.setValue('priority', suggestPriority(routeId));
  };

  const submit = form.handleSubmit(async (values) => {
    try {
      const saved = await save.mutateAsync({ id: customer?._id, values, version: customer?.version });
      toast.success(customer ? `${saved.storeName} updated` : `${saved.storeName} added as ${saved._id}`);
      onClose();
    } catch (error) {
      handleFormError(error, form.setError, ['routeId', 'storeName', 'contactPerson', 'phone', 'address', 'priority', 'vendorIds']);
    }
  });

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size="lg"
      dismissible={!save.isPending}
      title={customer ? 'Edit customer' : 'Add customer'}
      description={customer ? `Customer ID ${customer._id} (never changes)` : 'A customer ID such as MLCID000001 is assigned automatically.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} loading={save.isPending}>
            {customer ? 'Save changes' : 'Add customer'}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Route" required error={errors.routeId?.message}>
          {(props) => (
            <Controller
              control={form.control}
              name="routeId"
              render={({ field }) => (
                <Combobox
                  {...props}
                  ref={field.ref}
                  options={routeOptions}
                  value={field.value}
                  onChange={(value) => {
                    field.onChange(value ?? '');
                    changeRoute(value ?? '');
                  }}
                  invalid={Boolean(errors.routeId)}
                  placeholder="Select a route…"
                  emptyText="No active routes"
                />
              )}
            />
          )}
        </Field>
        <Field label="Store name" required error={errors.storeName?.message}>
          {(props) => <Input {...props} {...form.register('storeName')} autoFocus placeholder="e.g. Sri Murugan Stores" />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Contact person" error={errors.contactPerson?.message}>
            {(props) => <Input {...props} {...form.register('contactPerson')} autoComplete="off" />}
          </Field>
          <Field label="Phone" error={errors.phone?.message}>
            {(props) => <Input {...props} {...form.register('phone')} type="tel" inputMode="tel" autoComplete="off" placeholder="e.g. 98765 43210" />}
          </Field>
        </div>
        <Field label="Address" error={errors.address?.message}>
          {(props) => <Textarea {...props} {...form.register('address')} rows={2} />}
        </Field>
        <Field
          label="Priority"
          required
          error={errors.priority?.message}
          hint="Delivery order of the store within its route: 1 comes first."
        >
          {(props) => <Input {...props} {...form.register('priority')} type="number" min={1} step={1} inputMode="numeric" className="w-32" />}
        </Field>
        <Controller
          control={form.control}
          name="vendorIds"
          render={({ field }) => {
            const selected = field.value ?? [];
            const toggle = (vendorId: EntityId, checked: boolean) =>
              field.onChange(checked ? [...selected, vendorId] : selected.filter((id) => id !== vendorId));
            return (
              <fieldset className="space-y-1.5">
                <legend className="flex w-full items-baseline justify-between gap-2 text-sm font-medium text-slate-700">
                  Supplied vendors
                  <span className="text-xs font-normal text-slate-500">
                    {selected.length ? `${selected.length} selected` : 'All active vendors'}
                  </span>
                </legend>
                {vendorChoices.length ? (
                  <div className="grid gap-2.5 rounded-lg border border-slate-200 p-3 sm:grid-cols-2">
                    {vendorChoices.map((vendor) => (
                      <Checkbox
                        key={vendor._id}
                        label={vendor.vendorName}
                        description={vendor.isActive ? undefined : 'Inactive'}
                        checked={selected.includes(vendor._id)}
                        onChange={(event) => toggle(vendor._id, event.target.checked)}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500">No active vendors yet.</p>
                )}
                {errors.vendorIds?.message ? (
                  <p className="flex items-center gap-1 text-xs text-rose-600">
                    <AlertCircle className="size-3.5 shrink-0" aria-hidden />
                    {errors.vendorIds.message}
                  </p>
                ) : (
                  <p className="text-xs text-slate-500">Leave all unchecked to bill every active vendor.</p>
                )}
              </fieldset>
            );
          }}
        />
      </form>
    </Drawer>
  );
}
