import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES, type User } from '@/domain/models';
import { userFormSchema } from '@/domain/validation/schemas';
import { Button } from '@/components/common/Button';
import { Field, Input } from '@/components/forms/Field';
import { Drawer } from '@/components/modals/Overlay';
import { useCurrentUser } from '@/hooks/useSession';
import { handleFormError } from '../shared/masterData';
import { useSaveUser } from './useUsers';

const FORM_ID = 'user-form';

export function UserFormDrawer({ open, user, onClose }: { open: boolean; user: User | null; onClose: () => void }) {
  const currentUser = useCurrentUser();
  const save = useSaveUser();
  const form = useForm({ resolver: zodResolver(userFormSchema) });
  const { errors } = form.formState;
  /** Your own sign-in e-mail cannot change (the service enforces this too). */
  const isSelf = Boolean(user && user._id === currentUser?._id);

  useEffect(() => {
    // New users start with the least privileged role.
    if (open) form.reset({ email: user?.email ?? '', displayName: user?.displayName ?? '', role: user?.role ?? 'ADMIN' });
    // Reset only when the drawer opens for a (different) record.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user]);

  const submit = form.handleSubmit(async (values) => {
    try {
      const saved = await save.mutateAsync({ id: user?._id, values, version: user?.version });
      if (user) {
        toast.success(`${saved.displayName} updated`);
      } else {
        toast.success(`${saved.displayName} added as ${saved._id}`, {
          description: `Share the spreadsheet with ${saved.email} (Editor) so they can sign in.`,
        });
      }
      onClose();
    } catch (error) {
      handleFormError(error, form.setError, ['email', 'displayName', 'role']);
    }
  });

  return (
    <Drawer
      open={open}
      onClose={onClose}
      dismissible={!save.isPending}
      title={user ? 'Edit user' : 'Add user'}
      description={user ? `User ID ${user._id} (never changes)` : 'They sign in with this Google account. A user ID is assigned automatically.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} loading={save.isPending}>
            {user ? 'Save changes' : 'Add user'}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={submit} className="space-y-4" noValidate>
        <Field
          label="E-mail"
          required
          error={errors.email?.message}
          hint={isSelf ? 'You cannot change your own sign-in e-mail.' : 'The Google account they sign in with.'}
        >
          {(props) =>
            isSelf ? (
              // Not registered: the form keeps the original value from `reset`.
              <Input {...props} value={user?.email ?? ''} disabled readOnly />
            ) : (
              <Input
                {...props}
                {...form.register('email')}
                type="email"
                autoComplete="off"
                spellCheck={false}
                autoFocus={!user}
                placeholder="name@gmail.com"
              />
            )
          }
        </Field>
        <Field label="Name" required error={errors.displayName?.message}>
          {(props) => <Input {...props} {...form.register('displayName')} autoFocus={Boolean(user)} placeholder="e.g. Priya Kumar" />}
        </Field>
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium text-slate-700">
            Role
            <span className="ml-0.5 text-rose-500">*</span>
          </legend>
          <div className="space-y-2">
            {ROLES.map((role) => (
              <label
                key={role}
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 transition-colors hover:bg-slate-50 has-checked:border-brand-500 has-checked:bg-brand-50/60 has-checked:ring-1 has-checked:ring-brand-500 has-focus-visible:ring-2 has-focus-visible:ring-brand-500/30"
              >
                <input type="radio" value={role} {...form.register('role')} className="mt-0.5 size-4 shrink-0 accent-brand-700" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-slate-900">{ROLE_LABELS[role]}</span>
                  <span className="block text-xs text-slate-500">{ROLE_DESCRIPTIONS[role]}</span>
                </span>
              </label>
            ))}
          </div>
          {errors.role?.message && (
            <p className="flex items-center gap-1 text-xs text-rose-600">
              <AlertCircle className="size-3.5 shrink-0" aria-hidden />
              {errors.role.message}
            </p>
          )}
        </fieldset>
      </form>
    </Drawer>
  );
}
