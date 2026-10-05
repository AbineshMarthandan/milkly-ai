import { Info, Printer, Save, X } from 'lucide-react';
import type { BillTotals, BillVendorGroup } from '@/domain/models';
import { Button } from '@/components/common/Button';
import { Card, Kbd } from '@/components/common/Layout';
import { useMoney } from '@/hooks/useAppSettings';
import { formatNumber } from '@/utils/format';

interface BillSummaryProps {
  mode: 'create' | 'edit';
  customerName?: string;
  vendors: readonly BillVendorGroup[];
  totals: BillTotals;
  canSubmit: boolean;
  /** Why saving is not possible yet. */
  blocker?: string;
  saving: boolean;
  printing: boolean;
  onSave: () => void;
  onSaveAndPrint: () => void;
  onPrint: () => void;
  onCancel: () => void;
}

export function BillSummary(props: BillSummaryProps) {
  const money = useMoney();
  const { mode, customerName, vendors, totals, canSubmit, blocker, saving, printing } = props;
  const busy = saving || printing;

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-slate-100 px-5 py-4">
        <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">{mode === 'edit' ? 'Editing bill' : 'Bill summary'}</div>
        <div className="mt-0.5 truncate text-base font-semibold text-slate-900">{customerName ?? 'No customer selected'}</div>
      </div>

      <div className="space-y-3 px-5 py-4 text-sm">
        {vendors.length > 0 && (
          <ul className="space-y-1">
            {vendors.map((vendor) => (
              <li key={vendor.vendorId} className="flex justify-between gap-2 text-slate-600">
                <span className="truncate">{vendor.vendorName}</span>
                <span className="tabular">{money(vendor.total)}</span>
              </li>
            ))}
          </ul>
        )}
        <dl className="tabular space-y-1.5 border-t border-slate-100 pt-3">
          <div className="flex justify-between text-slate-600">
            <dt>Items · Qty</dt>
            <dd>
              {totals.itemCount} · {formatNumber(totals.totalQuantity)}
            </dd>
          </div>
          <div className="flex justify-between text-slate-600">
            <dt>MRP total</dt>
            <dd>{money(totals.mrpTotal)}</dd>
          </div>
          <div className="flex justify-between text-emerald-700">
            <dt>Total discount</dt>
            <dd>− {money(totals.totalDiscount)}</dd>
          </div>
          <div className="flex justify-between text-slate-600">
            <dt>Subtotal</dt>
            <dd>{money(totals.subtotal)}</dd>
          </div>
          <div className="flex items-baseline justify-between border-t border-slate-200 pt-2">
            <dt className="font-semibold text-slate-900">Grand total</dt>
            <dd className="text-2xl font-bold text-slate-900">{money(totals.grandTotal)}</dd>
          </div>
        </dl>
      </div>

      <div className="space-y-2 border-t border-slate-100 bg-slate-50/60 px-5 py-4">
        <Button className="w-full" size="lg" icon={<Save className="size-4" />} disabled={!canSubmit || busy} loading={saving} onClick={props.onSave}>
          {mode === 'edit' ? 'Save changes' : 'Save bill'}
        </Button>
        <Button className="w-full" variant="success" icon={<Printer className="size-4" />} disabled={!canSubmit || busy} onClick={props.onSaveAndPrint}>
          Save & print
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" icon={<Printer className="size-4" />} disabled={!canSubmit || busy} loading={printing} onClick={props.onPrint}>
            Print
          </Button>
          <Button variant="ghost" icon={<X className="size-4" />} disabled={busy} onClick={props.onCancel}>
            {mode === 'edit' ? 'Discard' : 'Cancel'}
          </Button>
        </div>
        {blocker && <p className="text-center text-xs text-slate-500">{blocker}</p>}
        <p className="flex gap-1.5 pt-1 text-xs text-slate-500">
          <Info className="mt-px size-3.5 shrink-0" />
          {mode === 'edit'
            ? '“Print” previews your changes without saving them.'
            : '“Print” prints a draft only. A bill is listed in Past Bills only after it is saved.'}
        </p>
        <div className="hidden flex-wrap gap-x-3 gap-y-1 pt-1 text-[11px] text-slate-500 lg:flex">
          <span>
            <Kbd>Ctrl</Kbd> <Kbd>S</Kbd> save
          </span>
          <span>
            <Kbd>Ctrl</Kbd> <Kbd>Enter</Kbd> save & print
          </span>
          <span>
            <Kbd>/</Kbd> search
          </span>
          <span>
            <Kbd>Enter</Kbd>/<Kbd>↓</Kbd> next item
          </span>
        </div>
      </div>
    </Card>
  );
}
