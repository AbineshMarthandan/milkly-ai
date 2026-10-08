import type { Bill } from '@/domain/models';
import type { AppSettings } from '@/domain/models/settings';
import { formatDate, formatDateTime, formatMoney, formatNumber, formatPercent } from '@/utils/format';
import { cn } from '@/utils/cn';

interface InvoiceProps {
  bill: Bill;
  settings: AppSettings;
  /** Compact typography for A5 paper. */
  compact?: boolean;
}

/**
 * Printable invoice. Used for the on-screen preview and for printing, so what
 * the user sees is exactly what is printed. Vendors, categories and products
 * appear in the order stored on the bill (priority order at save time).
 */
export function Invoice({ bill, settings, compact = false }: InvoiceProps) {
  const money = (value: number) => formatMoney(value, settings.currency);
  const isDraft = bill.status === 'draft';
  const isCancelled = bill.status === 'cancelled';
  let lineNo = 0;

  return (
    <article className={cn('relative bg-white text-slate-900', compact ? 'text-[10px]' : 'text-xs')}>
      {(isDraft || isCancelled) && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden text-[64px] font-black tracking-widest text-slate-900/[0.06] uppercase select-none"
          style={{ transform: 'rotate(-24deg)' }}
        >
          {isDraft ? 'Draft' : 'Invalid'}
        </div>
      )}

      <header className="flex items-start justify-between gap-6 border-b-2 border-slate-800 pb-3">
        <div className="min-w-0">
          <h1 className={cn('font-bold tracking-tight', compact ? 'text-base' : 'text-xl')}>{settings.businessName}</h1>
          {settings.businessAddress && <p className="mt-0.5 whitespace-pre-line text-slate-600">{settings.businessAddress}</p>}
          <p className="text-slate-600">
            {[settings.phone && `Ph: ${settings.phone}`, settings.taxId && `Tax ID: ${settings.taxId}`].filter(Boolean).join('  ·  ')}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className={cn('font-bold tracking-wide uppercase', compact ? 'text-sm' : 'text-base')}>
            {isDraft ? 'Draft bill — not saved' : isCancelled ? 'Invalid bill' : 'Invoice'}
          </div>
          <dl className="mt-1 grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-left">
            <dt className="text-slate-500">Bill No</dt>
            <dd className="font-semibold">{isDraft ? '—' : bill.billNumber}</dd>
            <dt className="text-slate-500">Date</dt>
            <dd className="font-semibold">{formatDate(bill.billDate)}</dd>
            <dt className="text-slate-500">Route</dt>
            <dd className="font-semibold">
              {bill.routeSnapshot.routeName} ({bill.routeSnapshot.routeCode})
            </dd>
          </dl>
        </div>
      </header>

      <section className="flex flex-wrap justify-between gap-4 border-b border-slate-300 py-2.5">
        <div>
          <div className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">Bill to</div>
          <div className={cn('font-semibold', compact ? 'text-xs' : 'text-sm')}>{bill.customerSnapshot.storeName}</div>
          <div className="text-slate-600">
            {[bill.customerSnapshot.contactPerson, bill.customerSnapshot.phone].filter(Boolean).join(' · ')}
          </div>
          {bill.customerSnapshot.address && <div className="text-slate-600">{bill.customerSnapshot.address}</div>}
        </div>
        <div className="text-right text-slate-600">
          <div>Customer ID: {bill.customerSnapshot.customerId}</div>
          <div>
            Items: {bill.itemCount} · Qty: {formatNumber(bill.totalQuantity)}
          </div>
        </div>
      </section>

      <table className="mt-2 w-full border-collapse">
        <thead>
          <tr className="border-b border-slate-800 text-left text-[10px] tracking-wide text-slate-600 uppercase">
            <th className="w-6 py-1.5 pr-1">#</th>
            <th className="py-1.5 pr-2">Product</th>
            <th className="py-1.5 pr-2 text-right">Qty</th>
            <th className="py-1.5 pr-2 text-right">MRP</th>
            <th className="py-1.5 pr-2 text-right">Price</th>
            <th className="py-1.5 pr-2 text-right">Disc %</th>
            <th className="py-1.5 pr-2 text-right">Discount</th>
            <th className="py-1.5 text-right">Total</th>
          </tr>
        </thead>
        {bill.vendors.map((vendor) => (
          <tbody key={vendor.vendorId} className="print-avoid-break">
            <tr className="bg-slate-100">
              <td colSpan={8} className="px-1 py-1 font-bold uppercase">
                {vendor.vendorName}
              </td>
            </tr>
            {vendor.categories.map((category) => (
              <CategoryRows key={category.categoryId} category={category} money={money} nextLine={() => ++lineNo} />
            ))}
            <tr className="border-b border-slate-400">
              <td colSpan={7} className="py-1 pr-2 text-right font-semibold">
                {vendor.vendorName} total
              </td>
              <td className="tabular py-1 text-right font-semibold">{money(vendor.total)}</td>
            </tr>
          </tbody>
        ))}
      </table>

      <section className="mt-3 flex flex-wrap items-start justify-between gap-6">
        <div className="max-w-sm space-y-1 text-slate-600">
          {bill.notes && (
            <p>
              <span className="font-semibold text-slate-800">Notes: </span>
              {bill.notes}
            </p>
          )}
          {isCancelled && (
            <p className="font-semibold text-rose-700">
              Marked invalid {formatDateTime(bill.cancelledAt)} — {bill.cancelReason}
            </p>
          )}
        </div>
        <dl className="tabular ml-auto grid min-w-56 grid-cols-[1fr_auto] gap-x-6 gap-y-1">
          <dt className="text-slate-600">MRP total</dt>
          <dd className="text-right">{money(bill.mrpTotal)}</dd>
          <dt className="text-slate-600">Total discount</dt>
          <dd className="text-right text-emerald-700">− {money(bill.totalDiscount)}</dd>
          <dt className="text-slate-600">Subtotal</dt>
          <dd className="text-right">{money(bill.subtotal)}</dd>
          <dt className={cn('border-t-2 border-slate-800 pt-1 font-bold', compact ? 'text-xs' : 'text-sm')}>Grand total</dt>
          <dd className={cn('border-t-2 border-slate-800 pt-1 text-right font-bold', compact ? 'text-xs' : 'text-sm')}>
            {money(bill.grandTotal)}
          </dd>
        </dl>
      </section>

      <footer className="mt-6 flex items-end justify-between gap-4 border-t border-slate-300 pt-2 text-[10px] text-slate-500">
        <div>
          {settings.invoiceFooter && <p className="text-xs text-slate-700">{settings.invoiceFooter}</p>}
          <p>
            {isDraft ? 'Unsaved draft printed' : `Prepared by ${bill.createdByName || '—'} · ${formatDateTime(bill.finalizedAt ?? bill.createdAt)}`}
          </p>
        </div>
        <div className="text-right">
          <div className="mb-6" />
          <div className="border-t border-slate-400 px-6 pt-0.5">Receiver’s signature</div>
        </div>
      </footer>
    </article>
  );
}

function CategoryRows({
  category,
  money,
  nextLine,
}: {
  category: Bill['vendors'][number]['categories'][number];
  money: (value: number) => string;
  nextLine: () => number;
}) {
  return (
    <>
      <tr>
        <td />
        <td colSpan={7} className="pt-1.5 pb-0.5 text-[10px] font-semibold tracking-wide text-slate-500 uppercase">
          {category.categoryName}
        </td>
      </tr>
      {category.items.map((item) => (
        <tr key={item.productId} className="border-b border-slate-100 align-top">
          <td className="py-1 pr-1 text-slate-500">{nextLine()}</td>
          <td className="py-1 pr-2">
            {item.productName} <span className="text-slate-500">{item.unit}</span>
          </td>
          <td className="tabular py-1 pr-2 text-right">{formatNumber(item.quantity)}</td>
          <td className="tabular py-1 pr-2 text-right text-slate-500">{money(item.mrp)}</td>
          <td className="tabular py-1 pr-2 text-right">{money(item.sellingPrice)}</td>
          <td className="tabular py-1 pr-2 text-right text-slate-500">{formatPercent(item.discountPercentage)}</td>
          <td className="tabular py-1 pr-2 text-right text-slate-500">{money(item.discountTotal)}</td>
          <td className="tabular py-1 text-right font-medium">{money(item.total)}</td>
        </tr>
      ))}
    </>
  );
}
