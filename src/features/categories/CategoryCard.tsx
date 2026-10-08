import { ArrowRight, Tags } from 'lucide-react';
import { Link } from 'react-router';
import type { Category } from '@/domain/models';
import { ItemCard, type Accent, type CardAction } from '@/components/explorer/Explorer';
import { plural } from '../shared/catalog';

interface CategoryCardProps {
  category: Category;
  productCount: number;
  accent: Accent;
  /** Vendor name, shown when the card appears outside its vendor folder (search results). */
  context?: string;
  actions: readonly CardAction[];
  onOpen?: () => void;
}

/** A category as a card, with a shortcut to its products. */
export function CategoryCard({ category, productCount, accent, context, actions, onOpen }: CategoryCardProps) {
  return (
    <ItemCard
      name={category.categoryName}
      title={
        <span className="flex items-center gap-2.5">
          <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${accent.tile}`}>
            <Tags className={`size-5 ${accent.icon}`} aria-hidden />
          </span>
          <span className="truncate">{category.categoryName}</span>
        </span>
      }
      subtitle={context}
      badge={<span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">Priority #{category.priority}</span>}
      inactive={!category.isActive}
      actions={actions}
      onOpen={onOpen}
      footer={
        <>
          <span className="font-mono">{category._id}</span>
          <Link
            to={`/masters/products/${category.vendorId}?category=${encodeURIComponent(category._id)}`}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50"
          >
            {plural(productCount, 'product')} <ArrowRight className="size-3.5" />
          </Link>
        </>
      }
    />
  );
}
