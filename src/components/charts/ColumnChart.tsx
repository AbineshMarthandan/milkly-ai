import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { cn } from '@/utils/cn';

export interface ColumnDatum {
  key: string;
  /** Axis label (short). */
  label: string;
  value: number;
  /** Extra tooltip lines, e.g. "12 bills". */
  details?: string[];
}

interface ColumnChartProps {
  data: readonly ColumnDatum[];
  /** Formats values for ticks, labels and the tooltip. */
  format: (value: number) => string;
  /** Compact tick formatter (defaults to `format`). */
  formatTick?: (value: number) => string;
  /** What the bars measure, for screen readers and the tooltip. */
  seriesLabel: string;
  height?: number;
  /** CSS colour for the single series (a validated categorical slot). */
  color?: string;
  className?: string;
}

const PAD = { top: 12, right: 8, bottom: 26, left: 52 };
const DEFAULT_WIDTH = 640;
const MAX_BAR = 24;

/** Round axis maximum to a clean number (1, 2, 2.5, 5 × 10^n). */
function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exponent = 10 ** Math.floor(Math.log10(value));
  const fraction = value / exponent;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return nice * exponent;
}

/**
 * Single-series column chart (e.g. sales per day): ≤24px columns with a 4px
 * rounded cap, hairline grid, per-column hover/focus tooltip, and a
 * screen-reader table twin. One series → no legend; the card title names it.
 */
export function ColumnChart({ data, format, formatTick = format, seriesLabel, height = 220, color = 'var(--color-chart-1)', className }: ColumnChartProps) {
  const [active, setActive] = useState<number | null>(null);
  const titleId = useId();
  // Draw at the real pixel width so text stays 11px instead of scaling with the card.
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewWidth, setViewWidth] = useState(DEFAULT_WIDTH);
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setViewWidth(Math.max(280, Math.round(entry.contentRect.width))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const max = useMemo(() => niceMax(Math.max(0, ...data.map((d) => d.value))), [data]);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);

  const plotWidth = viewWidth - PAD.left - PAD.right;
  const plotHeight = height - PAD.top - PAD.bottom;
  const band = plotWidth / Math.max(1, data.length);
  const barWidth = Math.min(MAX_BAR, Math.max(4, band * 0.6));
  const y = (value: number) => PAD.top + plotHeight - (value / max) * plotHeight;
  const labelEvery = Math.ceil(data.length / Math.max(2, Math.floor(plotWidth / 56)));
  const highest = data.reduce((best, d, i) => (d.value > (data[best]?.value ?? -1) ? i : best), 0);

  const activeDatum = active === null ? null : data[active];
  const activeX = active === null ? 0 : PAD.left + band * active + band / 2;

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <svg viewBox={`0 0 ${viewWidth} ${height}`} width="100%" height={height} className="overflow-visible" role="img" aria-labelledby={titleId}>
        <title id={titleId}>{`${seriesLabel}: ${data.map((d) => `${d.label} ${format(d.value)}`).join(', ')}`}</title>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={viewWidth - PAD.right} y1={y(tick)} y2={y(tick)} stroke={tick === 0 ? 'var(--color-chart-axis)' : 'var(--color-chart-grid)'} strokeWidth={1} />
            <text x={PAD.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" className="tabular fill-(--color-chart-muted) text-[11px]">
              {formatTick(tick)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = PAD.left + band * i + (band - barWidth) / 2;
          const top = y(d.value);
          const barHeight = Math.max(0, PAD.top + plotHeight - top);
          const radius = Math.min(4, barHeight, barWidth / 2);
          // Rounded data-end, square at the baseline.
          const path =
            barHeight > 0
              ? `M${x},${top + barHeight} V${top + radius} Q${x},${top} ${x + radius},${top} H${x + barWidth - radius} Q${x + barWidth},${top} ${x + barWidth},${top + radius} V${top + barHeight} Z`
              : '';
          return (
            <g key={d.key}>
              {path && <path d={path} fill={color} opacity={active === null || active === i ? 1 : 0.55} />}
              {/* Hit target: the whole band, taller than the mark. */}
              <rect
                x={PAD.left + band * i}
                y={PAD.top}
                width={band}
                height={plotHeight}
                fill="transparent"
                tabIndex={0}
                role="presentation"
                className="cursor-default outline-none"
                onPointerEnter={() => setActive(i)}
                onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
              />
              {i % labelEvery === 0 && (
                <text x={PAD.left + band * i + band / 2} y={height - 8} textAnchor="middle" className="fill-(--color-chart-muted) text-[11px]">
                  {d.label}
                </text>
              )}
              {i === highest && d.value > 0 && active === null && (
                <text x={PAD.left + band * i + band / 2} y={top - 5} textAnchor="middle" className="tabular fill-slate-700 text-[11px] font-medium">
                  {formatTick(d.value)}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {activeDatum && (
        <div
          role="status"
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"
          style={{ left: `${(activeX / viewWidth) * 100}%` }}
        >
          <div className="text-sm font-semibold text-slate-900">{format(activeDatum.value)}</div>
          <div className="flex items-center gap-1.5 text-slate-500">
            <span className="h-0.5 w-3 rounded" style={{ background: color }} />
            {seriesLabel} · {activeDatum.label}
          </div>
          {activeDatum.details?.map((line) => (
            <div key={line} className="text-slate-500">
              {line}
            </div>
          ))}
        </div>
      )}

      <table className="sr-only">
        <caption>{seriesLabel}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.key}>
              <th scope="row">{d.label}</th>
              <td>{format(d.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
