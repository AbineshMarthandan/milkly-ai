import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '@/utils/cn';
import { Skeleton } from '../common/Feedback';

interface StatTileProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  to?: string;
  loading?: boolean;
  emphasis?: boolean;
}

/** KPI tile: sentence-case label, proportional-figure value, optional context line. */
export function StatTile({ label, value, hint, icon: Icon, to, loading, emphasis }: StatTileProps) {
  const body = (
    <div
      className={cn(
        'h-full rounded-xl border bg-white p-4 shadow-xs transition-colors',
        emphasis ? 'border-brand-200 bg-gradient-to-br from-brand-50 to-white' : 'border-slate-200',
        to && 'hover:border-brand-300',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        {Icon && <Icon className="size-4 text-slate-400" aria-hidden />}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{loading ? <Skeleton className="h-7 w-24" /> : value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{loading ? <Skeleton className="h-3 w-16" /> : hint}</div>}
    </div>
  );
  return to ? (
    <Link to={to} className="block h-full rounded-xl focus-visible:outline-2 focus-visible:outline-brand-500">
      {body}
    </Link>
  ) : (
    body
  );
}
