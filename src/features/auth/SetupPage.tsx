import { AlertTriangle, ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { toAppError } from '@/domain/errors/AppError';
import { can } from '@/domain/permissions/permissions';
import { sessionManager } from '@/app/store/sessionManager';
import { useSessionStore } from '@/app/store/sessionStore';
import { Forbidden } from '@/app/router/guards';
import { FullPageSpinner } from '@/components/common/Feedback';
import { ConnectionForm, SetupGuide } from '../settings/ConnectionForm';
import { AuthShell } from './AuthShell';

/**
 * Bootstrap screen for a browser that has no working connection yet.
 *
 * Once a Tech Admin is signed in, configuration moves to Settings → Google
 * Sheets (Tech Admin only). Before sign-in, nobody can be verified, so this
 * page only ever changes the connection *for this browser* — pointing it at a
 * different spreadsheet grants no access to the real business data, which is
 * protected by Google sharing.
 */
export default function SetupPage() {
  const { status, user, connection } = useSessionStore();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  if (status === 'booting') return <FullPageSpinner />;
  if (status === 'authenticated') {
    return can(user?.role, 'settings:sheets:manage') ? <Navigate to="/admin/google-sheets" replace /> : <Forbidden />;
  }

  return (
    <AuthShell wide>
      <Link to="/login" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" /> Back to sign in
      </Link>
      <h1 className="text-xl font-semibold text-slate-900">Connect Google Sheets</h1>
      <p className="mt-1 text-sm text-slate-500">The business data lives in a Google Sheet you own. Follow these steps once.</p>

      {connection?.config && (
        <div className="mt-4 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <AlertTriangle className="size-4 shrink-0" />
          <p>
            A connection is already configured ({connection.source === 'device' ? 'on this browser' : connection.source === 'built-in' ? 'built into the app' : 'by the deployment'}). Changes here
            apply to this browser only. Tech Admins should normally use Settings → Google Sheets Configuration after signing in.
          </p>
        </div>
      )}

      <div className="mt-6 grid gap-8 md:grid-cols-2">
        <SetupGuide />
        <ConnectionForm
          defaults={connection?.config ?? connection?.deploymentDefaults ?? {}}
          submitLabel="Save and continue to sign in"
          busy={busy}
          onSubmit={async (config) => {
            setBusy(true);
            try {
              await sessionManager.applyConnection(config);
              toast.success('Connection saved. Sign in with Google to continue.');
              navigate('/login');
            } catch (error) {
              toast.error(toAppError(error).userMessage);
            } finally {
              setBusy(false);
            }
          }}
        />
      </div>
    </AuthShell>
  );
}
