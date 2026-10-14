import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, CircleSlash, ExternalLink, Lock, PlugZap, ShieldCheck, Wrench, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { toAppError } from '@/domain/errors/AppError';
import type { CheckStatus, DiagnosticCheck, StructureReport } from '@/domain/repositories';
import { SHEET_SCHEMAS, type CollectionName } from '@/infrastructure/google-sheets/schemas/sheetSchemas';
import { sessionManager } from '@/app/store/sessionManager';
import { useSessionStore } from '@/app/store/sessionStore';
import { Button } from '@/components/common/Button';
import { Badge, Card, CardHeader, PageHeader } from '@/components/common/Layout';
import { useConfirm } from '@/components/modals/ConfirmProvider';
import { queryKeys } from '@/constants/queryKeys';
import { useServices } from '@/hooks/useSession';
import { formatDateTime } from '@/utils/format';
import { ConnectionForm, SetupGuide } from './ConnectionForm';

const STATUS_ICON: Record<CheckStatus, { icon: typeof CheckCircle2; className: string; label: string }> = {
  pass: { icon: CheckCircle2, className: 'text-emerald-600', label: 'Passed' },
  warn: { icon: AlertTriangle, className: 'text-amber-600', label: 'Warning' },
  fail: { icon: XCircle, className: 'text-rose-600', label: 'Failed' },
  skipped: { icon: CircleSlash, className: 'text-slate-400', label: 'Skipped' },
};

const SOURCE_LABELS = {
  device: 'Set on this browser',
  'runtime-file': 'Deployment file (app-config.json)',
  'build-env': 'Build environment (.env)',
  'built-in': 'Built into the app',
  none: 'Not configured',
} as const;

function CheckList({ checks }: { checks: DiagnosticCheck[] }) {
  return (
    <ul className="divide-y divide-slate-100">
      {checks.map((check) => {
        const status = STATUS_ICON[check.status];
        return (
          <li key={check.id} className="flex gap-3 px-5 py-3">
            <status.icon className={`mt-0.5 size-5 shrink-0 ${status.className}`} aria-label={status.label} />
            <div className="min-w-0">
              <div className="text-sm font-medium text-slate-900">{check.label}</div>
              <div className="text-sm text-slate-600">{check.message}</div>
              {check.details && <pre className="mt-1 overflow-x-auto rounded bg-slate-50 p-2 text-xs whitespace-pre-wrap text-slate-500">{check.details}</pre>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function StructureTable({ report }: { report: StructureReport }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50/80 text-xs tracking-wide text-slate-500 uppercase">
          <tr>
            <th className="px-5 py-2 text-left font-semibold">Tab</th>
            <th className="px-3 py-2 text-left font-semibold">Status</th>
            <th className="px-3 py-2 text-left font-semibold">Columns</th>
            <th className="px-5 py-2 text-left font-semibold">Notes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {report.collections.map((collection) => {
            const schema = SHEET_SCHEMAS[collection.name as CollectionName];
            return (
              <tr key={collection.name}>
                <td className="px-5 py-2.5 font-mono text-xs text-slate-800">{collection.name}</td>
                <td className="px-3">
                  {!collection.exists ? (
                    <Badge tone="red">Missing</Badge>
                  ) : collection.missingFields.length ? (
                    <Badge tone="amber">Incomplete</Badge>
                  ) : (
                    <Badge tone="green">OK</Badge>
                  )}
                </td>
                <td className="px-3 text-slate-600">{schema?.columns.length ?? '—'}</td>
                <td className="px-5 text-xs text-slate-500">
                  {collection.missingFields.length > 0 && collection.exists && `Missing: ${collection.missingFields.join(', ')}`}
                  {collection.unknownFields.length > 0 && ` Extra (ignored): ${collection.unknownFields.join(', ')}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {report.extraCollections.length > 0 && (
        <p className="px-5 py-3 text-xs text-slate-500">Other tabs in the spreadsheet (ignored by the app): {report.extraCollections.join(', ')}</p>
      )}
    </div>
  );
}

/** Tech Admin: connection, diagnostics, structure repair and storage-level protection. */
export default function GoogleSheetsPage() {
  const services = useServices();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { connection, dataSource } = useSessionStore();
  const admin = dataSource?.admin;
  const isSheets = dataSource?.kind === 'google-sheets';
  const [checks, setChecks] = useState<DiagnosticCheck[] | null>(null);
  const [savingConnection, setSavingConnection] = useState(false);

  const metadata = useQuery({ queryKey: queryKeys.databaseMeta, queryFn: () => services.settings.getDatabaseMetadata() });
  const structure = useMutation({ mutationFn: () => admin!.inspectStructure(), meta: { silentError: true } });
  const test = useMutation({
    mutationFn: () => admin!.testConnection(),
    onSuccess: (result) => {
      setChecks(result);
      const failed = result.filter((check) => check.status === 'fail').length;
      if (failed) toast.error(`${failed} check${failed === 1 ? '' : 's'} failed`);
      else toast.success('Connection is healthy');
    },
  });
  const repair = useMutation({
    mutationFn: () => admin!.repairStructure(),
    onSuccess: (result) => {
      dataSource?.clearCache();
      const added = Object.values(result.addedFields).flat().length;
      toast.success(
        result.createdCollections.length || added
          ? `Created ${result.createdCollections.length} tab(s) and added ${added} column(s). No data was changed.`
          : 'Structure already complete — nothing to change.',
      );
      structure.mutate();
    },
  });
  const users = useQuery({ queryKey: queryKeys.users, queryFn: () => services.users.list() });
  const protect = useMutation({
    mutationFn: (emails: string[]) => admin!.restrictAdminCollections!(emails),
    onSuccess: (names) => toast.success(`Protected tabs: ${names.join(', ')}`),
  });

  const techAdminEmails = (users.data ?? []).filter((user) => user.isActive && user.role === 'TECH_ADMIN').map((user) => user.email);

  return (
    <>
      <PageHeader
        eyebrow="Tech Admin"
        title="Google Sheets configuration"
        description="Connection to the spreadsheet that stores all business data, plus health checks and maintenance."
        actions={
          admin?.externalUrl && (
            <a href={admin.externalUrl} target="_blank" rel="noreferrer">
              <Button variant="secondary" icon={<ExternalLink className="size-4" />}>
                Open spreadsheet
              </Button>
            </a>
          )
        }
      />

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Connection"
            description={`Source: ${SOURCE_LABELS[connection?.source ?? 'none']}`}
            actions={connection?.source === 'device' && (
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  if (await confirm({ title: 'Use deployment connection?', description: 'This browser’s override is removed and you will be signed out.', confirmLabel: 'Reset' })) {
                    await sessionManager.resetConnectionToDeployment();
                    navigate('/login');
                  }
                }}
              >
                Use deployment default
              </Button>
            )}
          />
          <div className="p-5">
            <ConnectionForm
              defaults={connection?.config ?? connection?.deploymentDefaults ?? {}}
              submitLabel="Save connection and sign in again"
              busy={savingConnection}
              onSubmit={async (config) => {
                const ok = await confirm({
                  title: 'Change the database connection?',
                  description: 'This is saved for this browser. You will be signed out and must sign in with Google against the new spreadsheet.',
                  confirmLabel: 'Save and sign out',
                });
                if (!ok) return;
                setSavingConnection(true);
                try {
                  await sessionManager.applyConnection(config);
                  navigate('/login');
                } catch (error) {
                  toast.error(toAppError(error).userMessage);
                } finally {
                  setSavingConnection(false);
                }
              }}
            />
            <details className="mt-6 rounded-lg border border-slate-200 p-4">
              <summary className="cursor-pointer text-sm font-medium text-slate-700">Google Cloud setup steps</summary>
              <div className="mt-3">
                <SetupGuide />
              </div>
            </details>
          </div>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Test connection"
              description="Checks authentication, spreadsheet access, required tabs and columns, and read & write permission."
              actions={
                <Button size="sm" icon={<PlugZap className="size-4" />} loading={test.isPending} onClick={() => test.mutate()} disabled={!admin}>
                  Run test
                </Button>
              }
            />
            {checks ? <CheckList checks={checks} /> : <p className="px-5 py-6 text-sm text-slate-500">Run the test to see results.</p>}
          </Card>

          <Card>
            <CardHeader title="Database" />
            <dl className="divide-y divide-slate-100 px-5 py-1 text-sm">
              <div className="flex justify-between py-2">
                <dt className="text-slate-500">Schema version</dt>
                <dd>{metadata.data?.schemaVersion ?? '—'}</dd>
              </div>
              <div className="flex justify-between py-2">
                <dt className="text-slate-500">Initialised</dt>
                <dd>{formatDateTime(metadata.data?.initializedAt)}</dd>
              </div>
              <div className="flex justify-between py-2">
                <dt className="text-slate-500">Data source</dt>
                <dd>{dataSource?.label}</dd>
              </div>
            </dl>
          </Card>
        </div>

        <Card className="xl:col-span-2">
          <CardHeader
            title="Sheet structure"
            description="Each tab is one collection; row 1 holds field names. Repair only adds missing tabs and columns — it never deletes or rewrites data."
            actions={
              <>
                <Button size="sm" variant="secondary" loading={structure.isPending} onClick={() => structure.mutate()} disabled={!admin}>
                  Validate structure
                </Button>
                <Button
                  size="sm"
                  icon={<Wrench className="size-4" />}
                  loading={repair.isPending}
                  disabled={!admin}
                  onClick={async () => {
                    if (await confirm({ title: 'Repair sheet structure?', description: 'Missing tabs and header columns will be created. Existing data is untouched.', confirmLabel: 'Repair' })) repair.mutate();
                  }}
                >
                  Repair structure
                </Button>
              </>
            }
          />
          {structure.data ? (
            <StructureTable report={structure.data} />
          ) : structure.error ? (
            <p className="px-5 py-6 text-sm text-rose-600">{toAppError(structure.error).userMessage}</p>
          ) : (
            <p className="px-5 py-6 text-sm text-slate-500">Validate to compare the spreadsheet with the expected schema.</p>
          )}
        </Card>

        {isSheets && admin?.restrictAdminCollections && (
          <Card className="xl:col-span-2">
            <CardHeader
              title="Storage-level protection"
              description="App roles are enforced in the browser. For the most sensitive tabs, also let Google enforce who can edit them."
              actions={
                <Button
                  size="sm"
                  icon={<Lock className="size-4" />}
                  loading={protect.isPending}
                  disabled={!techAdminEmails.length}
                  onClick={async () => {
                    if (
                      await confirm({
                        title: 'Restrict users & settings tabs?',
                        description: `Only ${techAdminEmails.join(', ')} (and the spreadsheet owner) will be able to edit the users and settings tabs, even directly in Google Sheets. Other users can still read them to sign in.`,
                        confirmLabel: 'Apply protection',
                      })
                    ) {
                      protect.mutate(techAdminEmails);
                    }
                  }}
                >
                  Protect admin tabs
                </Button>
              }
            />
            <div className="flex gap-3 px-5 py-4 text-sm text-slate-600">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" />
              <ul className="list-disc space-y-1 pl-4">
                <li>Anyone the spreadsheet is shared with as Editor could edit it directly in Google Sheets, bypassing app roles.</li>
                <li>Protecting the <code>users</code> and <code>settings</code> tabs prevents role escalation. Re-apply after adding a Tech Admin.</li>
                <li>Header rows are protected with a warning automatically when you initialise or repair the structure.</li>
              </ul>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
