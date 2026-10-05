import { ChevronDown, Lock, X } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import type { EntityId } from '@/domain/models';
import { calculateLine } from '@/domain/services/billing/calculations';
import type { CatalogProduct, CatalogVendor } from '@/domain/services/billing/catalog';
import { sumMoney } from '@/domain/services/money';
import { IconButton } from '@/components/common/Button';
import { Badge } from '@/components/common/Layout';
import { useMoney } from '@/hooks/useAppSettings';
import { cn } from '@/utils/cn';
import { formatPercent } from '@/utils/format';
import { useBillDraftStore, useDraftQuantity } from './billDraftStore';
import { QuantityInput } from './QuantityInput';

interface CatalogTableProps {
  draftKey: string;
  catalog: readonly CatalogVendor[];
  quantities: Record<EntityId, number>;
  search: string;
  selectedOnly: boolean;
}

function matches(product: CatalogProduct, needle: string, context: string) {
  return !needle || `${product.productName} ${product.unit} ${context}`.toLowerCase().includes(needle);
}

/** Vendor → category → product grid in priority order, with inline quantity entry. */
export function CatalogTable({ draftKey, catalog, quantities, search, selectedOnly }: CatalogTableProps) {
  const money = useMoney();
  const [collapsed, setCollapsed] = useState<Set<EntityId>>(new Set());
  const needle = search.trim().toLowerCase();

  // Filter by search / selection while keeping the priority order and a running row index.
  const visible = useMemo(() => {
    let index = 0;
    return catalog
      .map((vendor) => ({
        ...vendor,
        categories: vendor.categories
          .map((category) => ({
            ...category,
            products: category.products
              .filter((product) => matches(product, needle, `${vendor.vendorName} ${category.categoryName}`))
              .filter((product) => !selectedOnly || (quantities[product.productId] ?? 0) > 0)
              .map((product) => ({ product, index: index++ })),
          }))
          .filter((category) => category.products.length > 0),
      }))
      .filter((vendor) => vendor.categories.length > 0);
    // `quantities` only matters for the "selected only" view.
  }, [catalog, needle, selectedOnly, selectedOnly ? quantities : null]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!visible.length) {
    return (
      <div className="px-6 py-12 text-center text-sm text-slate-500">
        {selectedOnly ? 'No products added yet.' : needle ? `No products match “${search}”.` : 'No active products for this customer.'}
      </div>
    );
  }

  return (
    <div className="divide-y divide-slate-200">
      {visible.map((vendor) => {
        const isCollapsed = collapsed.has(vendor.vendorId) && !needle;
        const vendorProducts = vendor.categories.flatMap((category) => category.products.map((entry) => entry.product));
        const selected = vendorProducts.filter((product) => (quantities[product.productId] ?? 0) > 0);
        const vendorTotal = sumMoney(
          selected.map((product) => calculateLine({ ...product, quantity: quantities[product.productId] }).total),
        );
        return (
          <section key={vendor.vendorId} aria-label={vendor.vendorName}>
            <button
              type="button"
              onClick={() =>
                setCollapsed((current) => {
                  const next = new Set(current);
                  if (next.has(vendor.vendorId)) next.delete(vendor.vendorId);
                  else next.add(vendor.vendorId);
                  return next;
                })
              }
              className="sticky top-14 z-10 flex w-full items-center gap-3 bg-slate-50/95 px-4 py-2.5 text-left backdrop-blur"
              aria-expanded={!isCollapsed}
            >
              <ChevronDown className={cn('size-4 text-slate-400 transition-transform', isCollapsed && '-rotate-90')} />
              <span className="text-sm font-semibold tracking-wide text-slate-900 uppercase">{vendor.vendorName}</span>
              <Badge tone="gray">#{vendor.priority}</Badge>
              <span className="flex-1" />
              {selected.length > 0 && (
                <span className="tabular text-sm text-slate-600">
                  {selected.length} item{selected.length === 1 ? '' : 's'} · <b className="text-slate-900">{money(vendorTotal)}</b>
                </span>
              )}
            </button>
            {!isCollapsed && (
              <table className="w-full text-sm">
                <thead className="sr-only sm:not-sr-only">
                  <tr className="text-[11px] tracking-wide text-slate-400 uppercase">
                    <th className="py-1.5 pl-4 text-left font-medium">Product</th>
                    <th className="hidden px-2 text-right font-medium md:table-cell">MRP</th>
                    <th className="px-2 text-right font-medium">Price</th>
                    <th className="hidden px-2 text-right font-medium sm:table-cell">Disc</th>
                    <th className="px-2 text-center font-medium">Qty</th>
                    <th className="px-2 text-right font-medium">Total</th>
                    <th className="w-10 pr-2" />
                  </tr>
                </thead>
                {vendor.categories.map((category) => (
                  <tbody key={category.categoryId}>
                    <tr>
                      <td colSpan={7} className="px-4 pt-2 pb-1 text-xs font-semibold text-brand-800">
                        {category.categoryName}
                      </td>
                    </tr>
                    {category.products.map(({ product, index }) => (
                      <CatalogRow key={product.productId} draftKey={draftKey} product={product} index={index} />
                    ))}
                  </tbody>
                ))}
              </table>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** One product line. Subscribes only to its own quantity, so typing re-renders one row. */
const CatalogRow = memo(function CatalogRow({ draftKey, product, index }: { draftKey: string; product: CatalogProduct; index: number }) {
  const money = useMoney();
  const quantity = useDraftQuantity(draftKey, product.productId);
  const setQuantity = useBillDraftStore((state) => state.setQuantity);
  const line = calculateLine({ mrp: product.mrp, sellingPrice: product.sellingPrice, quantity });
  const label = `${product.productName} ${product.unit}`;
  const priceNote =
    product.locked && product.currentSellingPrice !== undefined
      ? `Price kept from the original bill. Current price: ${money(product.currentSellingPrice)}`
      : product.locked
        ? 'Price kept from the original bill'
        : undefined;

  return (
    <tr className={cn('border-t border-slate-100 transition-colors', quantity > 0 ? 'bg-brand-50/60' : 'hover:bg-slate-50')}>
      <td className="py-1.5 pl-4">
        <div className="flex items-center gap-1.5">
          <span className={cn('font-medium', quantity > 0 ? 'text-slate-900' : 'text-slate-700')}>{product.productName}</span>
          <span className="text-xs text-slate-500">{product.unit}</span>
          {product.locked && (
            <span title={priceNote} className="text-amber-600">
              <Lock className="size-3" aria-label={priceNote} />
            </span>
          )}
          {!product.available && <Badge tone="amber">Inactive</Badge>}
        </div>
      </td>
      <td className="tabular hidden px-2 text-right text-slate-500 md:table-cell">{money(product.mrp)}</td>
      <td className="tabular px-2 text-right text-slate-800">{money(product.sellingPrice)}</td>
      <td className="tabular hidden px-2 text-right text-xs text-emerald-700 sm:table-cell">
        {line.discountPercentage > 0 ? formatPercent(line.discountPercentage) : '—'}
      </td>
      <td className="px-2 py-1 text-center">
        <QuantityInput value={quantity} index={index} label={label} onChange={(next) => setQuantity(draftKey, product.productId, next)} />
      </td>
      <td className={cn('tabular px-2 text-right font-medium', quantity > 0 ? 'text-slate-900' : 'text-slate-300')}>{money(line.total)}</td>
      <td className="pr-2 text-right">
        {quantity > 0 && (
          <IconButton label={`Remove ${label}`} size="sm" tone="danger" onClick={() => setQuantity(draftKey, product.productId, 0)}>
            <X className="size-3.5" />
          </IconButton>
        )}
      </td>
    </tr>
  );
});
