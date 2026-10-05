import { AlertTriangle, Database } from 'lucide-react';
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { toAppError, type AppError } from '@/domain/errors/AppError';
import { COLLECTIONS } from '@/infrastructure/google-sheets/schemas/sheetSchemas';
import { sessionManager } from '@/app/store/sessionManager';
import { useSessionStore } from '@/app/store/sessionStore';
import { Button } from '@/components/common/Button';
import { AuthShell } from './AuthShell';

/** First run on an empty spreadsheet: create the tabs and make the signer-in the first Tech Admin. */
export default function InitializePage() {
  const { status, identity } = useSessionStore();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  if (status === 'authenticated') return <Navigate to="/dashboard" replace />;
  if (status !== 'needs-initialization') return <Navigate to="/login" replace />;

  const initialize = async () => {
    setBusy(true);
    setError(null);
    try {
      await sessionManager.initializeDatabase();
      navigate('/dashboard', { replace: true });
    } catch (cause) {
      setError(toAppError(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <div className="flex size-11 items-center justify-center rounded-full bg-brand-50 text-brand-700">
        <Database className="size-5" />
      </div>
      <h1 className="mt-4 text-xl font-semibold text-slate-900">Set up this spreadsheet</h1>
      <p className="mt-1 text-sm text-slate-600">
        The connected spreadsheet has no users yet. Initialising it will create these tabs (existing tabs and data are never deleted):
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {COLLECTIONS.map((name) => (
          <code key={name} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
            {name}
          </code>
        ))}
      </div>
      <p className="mt-4 text-sm text-slate-600">
        <b>{identity?.email}</b> will become the first <b>Tech Admin</b>. You can add other users afterwards.
      </p>

      {error && (
        <div role="alert" className="mt-4 flex gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {error.userMessage}
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        <Button onClick={() => void initialize()} loading={busy}>
          Initialise and continue
        </Button>
        <Button variant="secondary" onClick={() => void sessionManager.signOut()} disabled={busy}>
          Use a different account
        </Button>
      </div>
    </AuthShell>
  );
}
