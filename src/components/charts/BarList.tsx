import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

export interface BarListItem {
  id: string;
  label: ReactNode;
  sublabel?: ReactNode;
  value: number;
  /** Formatted value shown at the bar tip (always visible — never tooltip-only). */
  display: string;
}

interface BarListProps {
  items: readonly BarListItem[];
  /** CSS colour of the single series. */
  color?: string;
  /** Scale maximum; defaults to the largest value in `items`. */
  max?: number;
  ariaLabel: string;
  className?: string;
  emptyText?: string;
}

/**
 * Ranked horizontal bars with a direct value label on each row. Bars are thin
 * (10px), grow from one baseline, and have a 4px rounded data-end. Negative
 * values (e.g. a loss) render as an empty track with the value still shown.
 */
export function BarList({ items, color = 'var(--color-chart-1)', max, ariaLabel, className, emptyText = 'No data for this period.' }: BarListProps) {
  const scale = max ?? Math.max(0, ...items.map((item) => item.value));
  if (!items.length) return <p className="py-6 text-center text-sm text-slate-500">{emptyText}</p>;
  return (
    <ul className={cn('space-y-3', className)} aria-label={ariaLabel}>
      {items.map((item) => {
        const width = scale > 0 ? Math.max(0, (item.value / scale) * 100) : 0;
        return (
          <li key={item.id} className="group rounded-md">
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-slate-700">
                {item.label}
                {item.sublabel && <span className="ml-1.5 text-xs text-slate-500">{item.sublabel}</span>}
              </span>
              <span className="tabular shrink-0 font-medium text-slate-900">{item.display}</span>
            </div>
            <div className="h-2.5 rounded-r bg-slate-100" aria-hidden>
              <div className="h-full rounded-r-[4px] transition-[width] duration-300 group-hover:brightness-110" style={{ width: `${width}%`, background: color }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
