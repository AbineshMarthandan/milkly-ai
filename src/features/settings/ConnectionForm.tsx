import { zodResolver } from '@hookform/resolvers/zod';
import { ExternalLink, ShieldCheck } from 'lucide-react';
import { useForm } from 'react-hook-form';
import type { GoogleSheetConfig } from '@/domain/models';
import { sheetConnectionSchema } from '@/domain/validation/schemas';
import { Button } from '@/components/common/Button';
import { Field, Input, Select } from '@/components/forms/Field';

interface ConnectionFormProps {
  defaults: Partial<GoogleSheetConfig>;
  submitLabel: string;
  onSubmit: (config: GoogleSheetConfig) => Promise<void> | void;
  busy?: boolean;
}

/** Spreadsheet + OAuth client configuration. Accepts only public identifiers. */
export function ConnectionForm({ defaults, submitLabel, onSubmit, busy }: ConnectionFormProps) {
  const form = useForm({
    resolver: zodResolver(sheetConnectionSchema),
    defaultValues: {
      spreadsheetId: defaults.spreadsheetId ?? '',
      oauthClientId: defaults.oauthClientId ?? '',
      authMode: 'google-identity-services' as const,
    },
  });
  const { errors } = form.formState;

  return (
    <form onSubmit={form.handleSubmit((values) => onSubmit(values))} className="space-y-4" noValidate>
      <Field
        label="Spreadsheet URL or ID"
        required
        error={errors.spreadsheetId?.message}
        hint="Paste the address of the Google Sheet used as the database."
      >
        {(props) => (
          <Input {...props} {...form.register('spreadsheetId')} placeholder="https://docs.google.com/spreadsheets/d/…/edit" autoComplete="off" />
        )}
      </Field>
      <Field
        label="Authentication"
        hint="Each user signs in with their own Google account. Other mechanisms (e.g. a backend proxy) can be added later without changing business logic."
      >
        {(props) => (
          <Select {...props} {...form.register('authMode')}>
            <option value="google-identity-services">Google sign-in (OAuth 2.0, browser-only)</option>
          </Select>
        )}
      </Field>
      <Field
        label="OAuth 2.0 Client ID"
        required
        error={errors.oauthClientId?.message}
        hint={
          <>
            From Google Cloud Console → APIs & Services → Credentials (type “Web application”).{' '}
            <a className="inline-flex items-center gap-0.5 text-brand-700 underline" href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">
              Open console <ExternalLink className="size-3" />
            </a>
          </>
        }
      >
        {(props) => <Input {...props} {...form.register('oauthClientId')} placeholder="1234567890-abc.apps.googleusercontent.com" autoComplete="off" />}
      </Field>
      <div className="flex items-start gap-2 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-900">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" />
        <p>
          No passwords, client secrets or service-account keys are needed or accepted. The Client ID and spreadsheet ID are public identifiers —
          access is controlled by Google sign-in and by who the spreadsheet is shared with.
        </p>
      </div>
      <Button type="submit" loading={busy}>
        {submitLabel}
      </Button>
    </form>
  );
}

export function SetupGuide() {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://your-app.example.com';
  return (
    <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-600 marker:font-semibold marker:text-brand-700">
      <li>
        In Google Cloud Console, create (or pick) a project and <b>enable the Google Sheets API</b>.
      </li>
      <li>
        Configure the <b>OAuth consent screen</b> — “Internal” for Google Workspace, or “External” and add each user as a test user.
      </li>
      <li>
        Create an <b>OAuth client ID</b> of type <i>Web application</i>. Under <i>Authorised JavaScript origins</i> add{' '}
        <code className="rounded bg-slate-100 px-1 text-xs">{origin}</code>. No redirect URI or client secret is used.
      </li>
      <li>
        Create a <b>blank Google Sheet</b> and share it as <i>Editor</i> with every person who will use the app.
      </li>
      <li>Paste the sheet URL and the Client ID here, then sign in. The first person to sign in initialises the sheet and becomes Tech Admin.</li>
    </ol>
  );
}
