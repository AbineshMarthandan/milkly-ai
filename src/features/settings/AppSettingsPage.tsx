import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { PAPER_SIZES, PAPER_SIZE_LABELS, isThermal, type AppSettings } from '@/domain/models/settings';
import { appSettingsSchema, type AppSettingsFormValues } from '@/domain/validation/schemas';
import { Button } from '@/components/common/Button';
import { ErrorState, FullPageSpinner } from '@/components/common/Feedback';
import { Card, CardHeader, PageHeader } from '@/components/common/Layout';
import { Field, Input, Select, Textarea } from '@/components/forms/Field';
import { queryKeys } from '@/constants/queryKeys';
import { useAppSettings } from '@/hooks/useAppSettings';
import { useServices } from '@/hooks/useSession';
import { formatDateTime } from '@/utils/format';
import { handleFormError } from '../shared/masterData';

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'LKR', 'NPR', 'BDT', 'MYR'];
const FIELDS = ['businessName', 'businessAddress', 'phone', 'taxId', 'invoiceFooter', 'currency', 'paperSize'];

/** Business details printed on bills, currency and print format (Tech Admin). */
export default function AppSettingsPage() {
  const services = useServices();
  const queryClient = useQueryClient();
  const settings = useAppSettings();
  const form = useForm({ resolver: zodResolver(appSettingsSchema) });
  const { errors, isDirty } = form.formState;
  const paperSize = useWatch({ control: form.control, name: 'paperSize' });

  const save = useMutation({
    meta: { silentError: true },
    mutationFn: (values: AppSettingsFormValues) => services.settings.saveAppSettings(values, settings.data?.version),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.appSettings });
      toast.success('Settings saved');
    },
  });

  useEffect(() => {
    if (settings.data) form.reset(settings.data.data);
  }, [settings.data, form]);

  if (settings.isLoading) return <FullPageSpinner />;
  if (settings.error) return <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />;

  const submit = form.handleSubmit(async (values) => {
    try {
      await save.mutateAsync(values as AppSettings);
    } catch (error) {
      handleFormError(error, form.setError, FIELDS);
    }
  });

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Settings"
        description={
          settings.data?.updatedAt ? `Last saved ${formatDateTime(settings.data.updatedAt)}` : 'Business details used on every printed bill.'
        }
      />
      <form onSubmit={submit} className="grid max-w-5xl gap-5 lg:grid-cols-2" noValidate>
        <Card>
          <CardHeader title="Business" description="Printed at the top of every bill and report." />
          <div className="space-y-4 p-5">
            <Field label="Business name" required error={errors.businessName?.message}>
              {(props) => <Input {...props} {...form.register('businessName')} />}
            </Field>
            <Field label="Address" error={errors.businessAddress?.message}>
              {(props) => <Textarea {...props} {...form.register('businessAddress')} rows={3} />}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Phone" error={errors.phone?.message}>
                {(props) => <Input {...props} {...form.register('phone')} type="tel" />}
              </Field>
              <Field label="Tax ID (e.g. GSTIN)" error={errors.taxId?.message}>
                {(props) => <Input {...props} {...form.register('taxId')} />}
              </Field>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Invoice & printing" />
          <div className="space-y-4 p-5">
            <Field
              label="Print format"
              required
              error={errors.paperSize?.message}
              hint={
                paperSize && isThermal(paperSize)
                  ? 'Choose your thermal printer in the print dialog. Each receipt is sized to its content, so the roll feeds exactly one bill.'
                  : 'Full-page invoice for laser/inkjet printers.'
              }
            >
              {(props) => (
                <Select {...props} {...form.register('paperSize')}>
                  {PAPER_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {PAPER_SIZE_LABELS[size]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Currency" required error={errors.currency?.message} hint="Amounts are formatted with this ISO 4217 currency.">
              {(props) => (
                <Select {...props} {...form.register('currency')}>
                  {CURRENCIES.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Invoice footer" error={errors.invoiceFooter?.message} hint="e.g. a thank-you note or payment terms.">
              {(props) => <Textarea {...props} {...form.register('invoiceFooter')} rows={2} />}
            </Field>
            {paperSize && isThermal(paperSize) && (
              <div className="flex gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                <Printer className="mt-0.5 size-4 shrink-0 text-slate-400" />
                <p>
                  Tip: to print without the dialog at the billing counter, start Chrome with <code className="rounded bg-white px-1">--kiosk-printing</code> and set
                  the thermal printer as the system default.
                </p>
              </div>
            )}
          </div>
        </Card>

        <div className="flex flex-wrap items-center gap-2 lg:col-span-2">
          <Button type="submit" loading={save.isPending} disabled={!isDirty}>
            Save settings
          </Button>
          <Button variant="secondary" onClick={() => settings.data && form.reset(settings.data.data)} disabled={!isDirty || save.isPending}>
            Discard changes
          </Button>
        </div>
      </form>
    </>
  );
}
