import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { Route } from '@/domain/models';
import { routeFormSchema } from '@/domain/validation/schemas';
import { Button } from '@/components/common/Button';
import { Field, Input } from '@/components/forms/Field';
import { Drawer } from '@/components/modals/Overlay';
import { handleFormError, nextPriority, useMasterList, useSaveMaster } from '../shared/masterData';

const FORM_ID = 'route-form';

export function RouteFormDrawer({ open, route, onClose }: { open: boolean; route: Route | null; onClose: () => void }) {
  const { data: routes = [] } = useMasterList('routes');
  const save = useSaveMaster('routes');
  const form = useForm({ resolver: zodResolver(routeFormSchema) });
  const { errors } = form.formState;

  useEffect(() => {
    if (open) {
      form.reset({
        routeName: route?.routeName ?? '',
        routeCode: route?.routeCode ?? '',
        priority: route?.priority ?? nextPriority(routes),
      });
    }
    // Reset only when the drawer opens for a (different) record.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, route]);

  const submit = form.handleSubmit(async (values) => {
    try {
      const saved = await save.mutateAsync({ id: route?._id, values, version: route?.version });
      toast.success(route ? `${saved.routeName} updated` : `${saved.routeName} added as ${saved._id}`);
      onClose();
    } catch (error) {
      handleFormError(error, form.setError, ['routeName', 'routeCode', 'priority']);
    }
  });

  return (
    <Drawer
      open={open}
      onClose={onClose}
      dismissible={!save.isPending}
      title={route ? 'Edit route' : 'Add route'}
      description={route ? `Route ID ${route._id} (never changes)` : 'A route ID such as MLRID000001 is assigned automatically.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} loading={save.isPending}>
            {route ? 'Save changes' : 'Add route'}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Route name" required error={errors.routeName?.message}>
          {(props) => <Input {...props} {...form.register('routeName')} autoFocus placeholder="e.g. North Market" />}
        </Field>
        <Field label="Route code" required error={errors.routeCode?.message} hint="Short code printed on bills, e.g. R-A">
          {(props) => (
            <Input {...props} {...form.register('routeCode')} placeholder="R-A" autoCapitalize="characters" spellCheck={false} className="w-40 font-mono uppercase" />
          )}
        </Field>
        <Field
          label="Priority"
          required
          error={errors.priority?.message}
          hint="Controls the order of routes when billing: 1 comes first."
        >
          {(props) => <Input {...props} {...form.register('priority')} type="number" min={1} step={1} inputMode="numeric" className="w-32" />}
        </Field>
      </form>
    </Drawer>
  );
}
