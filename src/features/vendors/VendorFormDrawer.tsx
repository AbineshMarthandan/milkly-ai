import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { Vendor } from '@/domain/models';
import { vendorFormSchema } from '@/domain/validation/schemas';
import { Button } from '@/components/common/Button';
import { Field, Input } from '@/components/forms/Field';
import { Drawer } from '@/components/modals/Overlay';
import { handleFormError, nextPriority, useMasterList, useSaveMaster } from '../shared/masterData';

const FORM_ID = 'vendor-form';

export function VendorFormDrawer({ open, vendor, onClose }: { open: boolean; vendor: Vendor | null; onClose: () => void }) {
  const { data: vendors = [] } = useMasterList('vendors');
  const save = useSaveMaster('vendors');
  const form = useForm({ resolver: zodResolver(vendorFormSchema) });
  const { errors } = form.formState;

  useEffect(() => {
    if (open) form.reset({ vendorName: vendor?.vendorName ?? '', priority: vendor?.priority ?? nextPriority(vendors) });
    // Reset only when the drawer opens for a (different) record.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, vendor]);

  const submit = form.handleSubmit(async (values) => {
    try {
      const saved = await save.mutateAsync({ id: vendor?._id, values, version: vendor?.version });
      toast.success(vendor ? `${saved.vendorName} updated` : `${saved.vendorName} added as ${saved._id}`);
      onClose();
    } catch (error) {
      handleFormError(error, form.setError, ['vendorName', 'priority']);
    }
  });

  return (
    <Drawer
      open={open}
      onClose={onClose}
      dismissible={!save.isPending}
      title={vendor ? 'Edit vendor' : 'Add vendor'}
      description={vendor ? `Vendor ID ${vendor._id} (never changes)` : 'A vendor ID such as MLVID000001 is assigned automatically.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} loading={save.isPending}>
            {vendor ? 'Save changes' : 'Add vendor'}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Vendor name" required error={errors.vendorName?.message}>
          {(props) => <Input {...props} {...form.register('vendorName')} autoFocus placeholder="e.g. Aavin" />}
        </Field>
        <Field
          label="Priority"
          required
          error={errors.priority?.message}
          hint="Controls the order of vendors on bills: 1 prints first."
        >
          {(props) => <Input {...props} {...form.register('priority')} type="number" min={1} step={1} inputMode="numeric" className="w-32" />}
        </Field>
      </form>
    </Drawer>
  );
}
