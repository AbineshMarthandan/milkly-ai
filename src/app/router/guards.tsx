import { ShieldAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import type { Permission } from '@/domain/permissions/permissions';
import { Button } from '@/components/common/Button';
import { EmptyState, FullPageSpinner } from '@/components/common/Feedback';
import { usePermission } from '@/hooks/useSession';
import { useSessionStore } from '../store/sessionStore';

/** Route-level authentication gate. */
export function RequireSession({ children }: { children: ReactNode }) {
  const status = useSessionStore((state) => state.status);
  const location = useLocation();
  if (status === 'booting' || status === 'signing-in') return <FullPageSpinner label="Signing in…" />;
  if (status === 'needs-initialization') return <Navigate to="/initialize" replace />;
  if (status !== 'authenticated') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

/** Route-level authorisation gate. Services re-check the same permission. */
export function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const allowed = usePermission(permission);
  return allowed ? <>{children}</> : <Forbidden />;
}

/** Component-level authorisation: renders children only when allowed. */
export function Can({ permission, children, fallback = null }: { permission: Permission; children: ReactNode; fallback?: ReactNode }) {
  return usePermission(permission) ? <>{children}</> : <>{fallback}</>;
}

export function Forbidden() {
  return (
    <EmptyState
      className="py-24"
      icon={<ShieldAlert className="size-6" />}
      title="You don’t have access to this page"
      description="Your role does not include this feature. Ask your Tech Admin if you need access."
      action={
        <Link to="/dashboard">
          <Button variant="secondary">Back to dashboard</Button>
        </Link>
      }
    />
  );
}
