import type { Bill } from '@/domain/models';
import type { AppSettings } from '@/domain/models/settings';
import { formatDate, formatDateTime, formatDecimal, formatNumber, formatPercent } from '@/utils/format';

/** Printable width in millimetres for each roll (paper minus the printer's dead margins). */
export const THERMAL_WIDTH_MM = { THERMAL_80: 72, THERMAL_58: 48 } as const;

interface ThermalReceiptProps {
  bill: Bill;
  settings: AppSettings;
  roll: keyof typeof THERMAL_WIDTH_MM;
}

const Rule = () => <div className="my-1.5 border-t border-dashed border-black" />;

function Row({ left, right, bold }: { left: React.ReactNode; right: React.ReactNode; bold?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-2 ${bold ? 'font-bold' : ''}`}>
      <span className="min-w-0">{left}</span>
      <span className="tabular shrink-0 text-right">{right}</span>
    </div>
  );
}

/**
 * Narrow single-column receipt for 80 mm / 58 mm thermal printers.
 * Pure black, no greys or backgrounds (thermal heads print grey poorly), and
 * amounts without the currency symbol (many receipt fonts lack ₹).
 */
export function ThermalReceipt({ bill, settings, roll }: ThermalReceiptProps) {
  const narrow = roll === 'THERMAL_58';
  const isDraft = bill.status === 'draft';
  const isCancelled = bill.status === 'cancelled';

  return (
    <article
      className="bg-white leading-snug text-black"
      style={{ width: `${THERMAL_WIDTH_MM[roll]}mm`, fontSize: narrow ? '10px' : '11.5px', fontFamily: 'Arial, Helvetica, sans-serif' }}
    >
      <header className="text-center">
        <div className="font-bold" style={{ fontSize: narrow ? '13px' : '15px' }}>
          {settings.businessName}
        </div>
        {settings.businessAddress && <div className="whitespace-pre-line">{settings.businessAddress}</div>}
        {settings.phone && <div>Ph: {settings.phone}</div>}
        {settings.taxId && <div>Tax ID: {settings.taxId}</div>}
      </header>

      <Rule />
      {(isDraft || isCancelled) && (
        <div className="my-1 border border-black py-0.5 text-center font-bold uppercase">
          {isDraft ? '*** Draft — not saved ***' : '*** Cancelled ***'}
        </div>
      )}
      <Row left="Bill No" right={<b>{isDraft ? '—' : bill.billNumber}</b>} />
      <Row left="Date" right={formatDate(bill.billDate)} />
      <Row left="Route" right={`${bill.routeSnapshot.routeName} (${bill.routeSnapshot.routeCode})`} />
      <Rule />
      <div className="font-bold">{bill.customerSnapshot.storeName}</div>
      {bill.customerSnapshot.phone && <div>{bill.customerSnapshot.phone}</div>}
      {!narrow && bill.customerSnapshot.address && <div>{bill.customerSnapshot.address}</div>}
      <Rule />

      <div className="flex justify-between font-bold">
        <span>Item</span>
        <span>Amount</span>
      </div>

      {bill.vendors.map((vendor) => (
        <section key={vendor.vendorId} className="mt-1.5">
          <div className="border-b border-black font-bold uppercase">{vendor.vendorName}</div>
          {vendor.categories.map((category) => (
            <div key={category.categoryId} className="mt-1">
              <div className="font-bold">· {category.categoryName}</div>
              {category.items.map((item) => (
                <div key={item.productId} className="mt-0.5">
                  <div>
                    {item.productName} {item.unit}
                  </div>
                  <Row
                    left={
                      <span>
                        {formatNumber(item.quantity)} × {formatDecimal(item.sellingPrice)}
                        {item.discountPercentage > 0 && !narrow && (
                          <span>
                            {' '}
                            (MRP {formatDecimal(item.mrp)}, −{formatPercent(item.discountPercentage)})
                          </span>
                        )}
                      </span>
                    }
                    right={formatDecimal(item.total)}
                  />
                </div>
              ))}
            </div>
          ))}
          <div className="mt-0.5 border-t border-black pt-0.5">
            <Row left={`${vendor.vendorName} total`} right={formatDecimal(vendor.total)} bold />
          </div>
        </section>
      ))}

      <Rule />
      <Row left="Items / Qty" right={`${bill.itemCount} / ${formatNumber(bill.totalQuantity)}`} />
      <Row left="MRP total" right={formatDecimal(bill.mrpTotal)} />
      <Row left="Discount" right={`−${formatDecimal(bill.totalDiscount)}`} />
      <div className="my-1 border-y-2 border-black py-0.5" style={{ fontSize: narrow ? '12px' : '14px' }}>
        <Row left={`TOTAL (${settings.currency})`} right={formatDecimal(bill.grandTotal)} bold />
      </div>
      {bill.notes && <div className="mt-1">Note: {bill.notes}</div>}
      {isCancelled && <div className="mt-1 font-bold">Reason: {bill.cancelReason}</div>}
      <Rule />
      <footer className="text-center">
        {settings.invoiceFooter && <div className="font-bold">{settings.invoiceFooter}</div>}
        <div>{isDraft ? 'Unsaved draft' : `By ${bill.createdByName || '—'} · ${formatDateTime(bill.finalizedAt ?? bill.createdAt)}`}</div>
      </footer>
      {/* Feed a little paper past the tear bar. */}
      <div style={{ height: '6mm' }} />
    </article>
  );
}
