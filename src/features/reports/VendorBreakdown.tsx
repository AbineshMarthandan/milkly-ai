import { ChevronRight } from 'lucide-react';
import { Fragment, useState } from 'react';
import type { CategoryReportRow, VendorReportRow } from '@/domain/services';
import { Card } from '@/components/common/Layout';
import { useMoney } from '@/hooks/useAppSettings';
import { cn } from '@/utils/cn';
import { formatNumber, formatPercent } from '@/utils/format';

/** Inline bar for a "bar table" column; each column is scaled on its own. */
function InlineBar({ value, max, color }: { value: number; max: number; color: string }) {
  const width = max > 0 ? Math.max(0, (value / max) * 100) : 0;
  return (
    <div className="mt-1 h-1.5 w-full rounded-r bg-slate-100" aria-hidden>
      <div className="h-full rounded-r-[4px]" style={{ width: `${width}%`, background: color }} />
    </div>
  );
}

function marginClass(margin: number) {
  return margin < 0 ? 'text-rose-600' : 'text-slate-600';
}

/**
 * One vendor: totals, then its categories as a bar table (sales and profit
 * bars, each scaled within the vendor), expandable to product rows.
 */
export function VendorBreakdown({ vendor, colorIndex }: { vendor: VendorReportRow; colorIndex: number }) {
  const money = useMoney();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const maxSales = Math.max(0, ...vendor.categories.map((category) => category.sales));
  const maxProfit = Math.max(0, ...vendor.categories.map((category) => category.profit));
  const toggle = (id: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-400">#{colorIndex + 1}</span>
            <h3 className="text-base font-semibold text-slate-900">{vendor.vendorName}</h3>
          </div>
          <p className="text-xs text-slate-500">
            {formatPercent(vendor.share)} of sales · {formatNumber(vendor.quantity)} units sold
          </p>
        </div>
        <dl className="tabular flex gap-6 text-right text-sm">
          <div>
            <dt className="text-xs text-slate-500">Sales</dt>
            <dd className="font-semibold text-slate-900">{money(vendor.sales)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Cost</dt>
            <dd className="text-slate-700">{money(vendor.cost)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Profit</dt>
            <dd className={cn('font-semibold', vendor.profit < 0 ? 'text-rose-600' : 'text-slate-900')}>{money(vendor.profit)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Margin</dt>
            <dd className={marginClass(vendor.margin)}>{formatPercent(vendor.margin)}</dd>
          </div>
        </dl>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50/80 text-xs tracking-wide text-slate-500 uppercase">
            <tr>
              <th className="px-5 py-2 text-left font-semibold">Category / product</th>
              <th className="px-3 py-2 text-right font-semibold">Qty</th>
              <th className="hidden px-3 py-2 text-right font-semibold md:table-cell">Avg rate</th>
              <th className="w-48 px-3 py-2 text-left font-semibold">Sales</th>
              <th className="hidden px-3 py-2 text-right font-semibold lg:table-cell">Cost</th>
              <th className="w-48 px-3 py-2 text-left font-semibold">Profit</th>
              <th className="px-5 py-2 text-right font-semibold">Margin</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {vendor.categories.map((category) => (
              <CategoryRows
                key={category.categoryId}
                category={category}
                expanded={open.has(category.categoryId)}
                onToggle={() => toggle(category.categoryId)}
                maxSales={maxSales}
                maxProfit={maxProfit}
                money={money}
              />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function CategoryRows({
  category,
  expanded,
  onToggle,
  maxSales,
  maxProfit,
  money,
}: {
  category: CategoryReportRow;
  expanded: boolean;
  onToggle: () => void;
  maxSales: number;
  maxProfit: number;
  money: (value: number) => string;
}) {
  return (
    <Fragment>
      <tr className="hover:bg-slate-50/70">
        <td className="px-5 py-2.5">
          <button type="button" onClick={onToggle} aria-expanded={expanded} className="flex items-center gap-1.5 text-left font-medium text-slate-900">
            <ChevronRight className={cn('size-4 text-slate-400 transition-transform', expanded && 'rotate-90')} />
            {category.categoryName}
            <span className="text-xs font-normal text-slate-500">
              · {category.products.length} product{category.products.length === 1 ? '' : 's'}
            </span>
          </button>
        </td>
        <td className="tabular px-3 text-right text-slate-700">{formatNumber(category.quantity)}</td>
        <td className="hidden px-3 text-right text-slate-400 md:table-cell">—</td>
        <td className="px-3 py-2">
          <div className="tabular text-slate-900">{money(category.sales)}</div>
          <InlineBar value={category.sales} max={maxSales} color="var(--color-chart-1)" />
        </td>
        <td className="tabular hidden px-3 text-right text-slate-600 lg:table-cell">{money(category.cost)}</td>
        <td className="px-3 py-2">
          <div className={cn('tabular', category.profit < 0 ? 'text-rose-600' : 'text-slate-900')}>{money(category.profit)}</div>
          <InlineBar value={category.profit} max={maxProfit} color="var(--color-chart-3)" />
        </td>
        <td className={cn('tabular px-5 text-right', marginClass(category.margin))}>{formatPercent(category.margin)}</td>
      </tr>
      {expanded &&
        category.products.map((product) => (
          <tr key={product.productId} className="bg-slate-50/50 text-[13px]">
            <td className="py-2 pr-3 pl-12 text-slate-700">
              {product.productName} <span className="text-xs text-slate-500">{product.unit}</span>
            </td>
            <td className="tabular px-3 text-right text-slate-700">{formatNumber(product.quantity)}</td>
            <td className="tabular hidden px-3 text-right text-slate-600 md:table-cell">{money(product.averageRate)}</td>
            <td className="tabular px-3 text-slate-800">{money(product.sales)}</td>
            <td className="tabular hidden px-3 text-right text-slate-600 lg:table-cell">{money(product.cost)}</td>
            <td className={cn('tabular px-3', product.profit < 0 ? 'text-rose-600' : 'text-slate-800')}>{money(product.profit)}</td>
            <td className={cn('tabular px-5 text-right', marginClass(product.margin))}>{formatPercent(product.margin)}</td>
          </tr>
        ))}
    </Fragment>
  );
}
