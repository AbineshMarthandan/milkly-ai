import { EyeOff } from 'lucide-react';
import { Badge } from '@/components/common/Layout';
import { ItemCard, type CardAction } from '@/components/explorer/Explorer';
import type { Product } from '@/domain/models';
import { calculateLine } from '@/domain/services/billing/calculations';
import { roundMoney } from '@/domain/services/money';
import { useMoney } from '@/hooks/useAppSettings';
import { cn } from '@/utils/cn';
import { formatPercent } from '@/utils/format';

interface ProductCardProps {
  product: Product;
  /** Shown under the name when the card appears outside its category folder. */
  context?: string;
  actions: readonly CardAction[];
  onOpen?: () => void;
  /** Set when the product is active but its vendor or category was deleted. */
  billingBlocker?: string | null;
}

/** A product as a card: selling price first, then MRP, discount, purchase price and margin. */
export function ProductCard({ product, context, actions, onOpen, billingBlocker }: ProductCardProps) {
  const money = useMoney();
  const { discountPercentage } = calculateLine({ mrp: product.mrp, sellingPrice: product.sellingPrice, quantity: 1 });
  const margin = roundMoney(product.sellingPrice - product.purchasePrice);

  return (
    <ItemCard
      name={`${product.productName} ${product.unit}`}
      title={
        <>
          {product.productName} <span className="font-normal text-slate-500">{product.unit}</span>
        </>
      }
      subtitle={context}
      inactive={!product.isActive}
      className={billingBlocker ? 'border-amber-300 bg-amber-50/40' : undefined}
      badge={billingBlocker ? <Badge tone="amber">Not on bills</Badge> : undefined}
      actions={actions}
      onOpen={onOpen}
      footer={
        <>
          <span className="font-mono">{product._id}</span>
          <span>Order #{product.priority}</span>
        </>
      }
    >
      <div className="flex items-end justify-between gap-2">
        <div>
          <div className="text-2xl font-semibold tracking-tight text-slate-900">{money(product.sellingPrice)}</div>
          <div className="text-xs text-slate-500">
            MRP <span className={cn(discountPercentage > 0 && 'line-through')}>{money(product.mrp)}</span>
          </div>
        </div>
        {discountPercentage > 0 && <Badge tone="green">{formatPercent(discountPercentage)} off</Badge>}
      </div>
      {billingBlocker && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-800">
          <EyeOff className="size-3.5 shrink-0" aria-hidden />
          {billingBlocker} — restore it to bill this product again.
        </p>
      )}
      <dl className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs">
        <div>
          <dt className="text-slate-500">Purchase</dt>
          <dd className="tabular font-medium text-slate-800">{money(product.purchasePrice)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Margin / unit</dt>
          <dd className={cn('tabular font-medium', margin < 0 ? 'text-rose-600' : 'text-slate-800')}>{money(margin)}</dd>
        </div>
      </dl>
    </ItemCard>
  );
}
