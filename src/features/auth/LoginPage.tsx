import { AlertTriangle, FlaskConical, Settings2 } from 'lucide-react';
import { useEffect } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/domain/models';
import { DEMO_USERS } from '@/infrastructure/browser-demo/seed';
import { sessionManager } from '@/app/store/sessionManager';
import { useSessionStore } from '@/app/store/sessionStore';
import { Button } from '@/components/common/Button';
import { FullPageSpinner } from '@/components/common/Feedback';
import { AuthShell } from './AuthShell';

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
    </svg>
  );
}

const ERROR_HINTS: Partial<Record<string, string>> = {
  USER_NOT_REGISTERED: 'A Tech Admin must add your Google e-mail under Administration → Users.',
  SHEETS_PERMISSION_DENIED: 'The spreadsheet owner must share it with your Google account (Editor).',
  SPREADSHEET_NOT_FOUND: 'Check the spreadsheet ID in the connection settings.',
  CONFIG_INVALID: 'Check the Google Cloud project configuration.',
};

export default function LoginPage() {
  const { status, connection, error, identity } = useSessionStore();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard';
  const demoEnabled = sessionManager.isDemoEnabled();
  const busy = status === 'signing-in';

  useEffect(() => {
    if (connection?.config) sessionManager.prepareGoogle();
  }, [connection?.config]);

  if (status === 'booting') return <FullPageSpinner label="Starting…" />;
  if (status === 'authenticated') return <Navigate to={from} replace />;
  if (status === 'needs-initialization') return <Navigate to="/initialize" replace />;

  return (
    <AuthShell>
      <h1 className="text-xl font-semibold text-slate-900">Sign in</h1>
      <p className="mt-1 text-sm text-slate-500">Use the Google account your Tech Admin registered for you.</p>

      {error && (
        <div role="alert" className="mt-5 flex gap-2.5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">{error.userMessage}</p>
            {ERROR_HINTS[error.code] && <p className="mt-0.5 text-rose-700">{ERROR_HINTS[error.code]}</p>}
            {error.code === 'USER_NOT_REGISTERED' && (identity?.email || error.details) && (
              <p className="mt-0.5 text-xs text-rose-700">Signed in as {identity?.email ?? error.details}</p>
            )}
          </div>
        </div>
      )}

      <div className="mt-6 space-y-3">
        {connection?.config ? (
          <Button size="lg" variant="secondary" className="w-full" loading={busy} icon={<GoogleMark />} onClick={() => void sessionManager.signInWithGoogle()}>
            Sign in with Google
          </Button>
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-medium">Not connected to a spreadsheet yet</p>
            <p className="mt-1 text-amber-800">A Tech Admin needs to connect the Google Sheet that stores the business data.</p>
            <Link to="/setup" className="mt-3 inline-block">
              <Button size="sm" icon={<Settings2 className="size-4" />}>
                Set up Google Sheets
              </Button>
            </Link>
          </div>
        )}
      </div>

      {demoEnabled && (
        <div className="mt-8 border-t border-slate-200 pt-6">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <FlaskConical className="size-4 text-amber-600" /> Try the demo
          </div>
          <p className="mt-1 text-xs text-slate-500">Sample data stored only in this browser. Pick a role to see what it can do.</p>
          <div className="mt-3 grid gap-2">
            {DEMO_USERS.map((user) => (
              <button
                key={user.email}
                type="button"
                disabled={busy}
                onClick={() => void sessionManager.signInDemo(user.email)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-left transition hover:border-brand-300 hover:bg-brand-50 disabled:opacity-50"
              >
                <div className="text-sm font-medium text-slate-800">{ROLE_LABELS[user.role]}</div>
                <div className="text-xs text-slate-500">{ROLE_DESCRIPTIONS[user.role]}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {connection?.config && (
        <p className="mt-6 text-center text-xs text-slate-400">
          Connection problems?{' '}
          <Link to="/setup" className="text-slate-500 underline hover:text-slate-700">
            Connection settings
          </Link>
        </p>
      )}
    </AuthShell>
  );
}
