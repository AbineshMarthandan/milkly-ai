import { KeyRound } from 'lucide-react';
import { useState } from 'react';
import { toAppError } from '@/domain/errors/AppError';
import { Button } from '@/components/common/Button';
import { Modal } from '@/components/modals/Overlay';
import { sessionManager } from '../store/sessionManager';
import { useSessionStore } from '../store/sessionStore';

/**
 * Google access tokens last about an hour and the browser cannot refresh them
 * silently (that would need a stored secret). When one expires we ask the user
 * to click once; unsaved work (e.g. a bill draft) stays on screen.
 */
export function ReauthDialog() {
  const open = useSessionStore((state) => state.reauthRequired);
  const email = useSessionStore((state) => state.identity?.email);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const renew = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await sessionManager.reauthenticate();
    } catch (cause) {
      setError(toAppError(cause).userMessage);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => undefined}
      dismissible={false}
      size="sm"
      title={
        <span className="flex items-center gap-2">
          <KeyRound className="size-5 text-brand-700" /> Session expired
        </span>
      }
      footer={
        <>
          <Button variant="secondary" onClick={() => void sessionManager.signOut()} disabled={busy}>
            Sign out
          </Button>
          <Button onClick={() => void renew()} loading={busy} autoFocus>
            Continue as {email ?? 'you'}
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-600">
        For security, your Google access expires regularly. Continue to renew it — anything you were working on is kept.
      </p>
      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
    </Modal>
  );
}
