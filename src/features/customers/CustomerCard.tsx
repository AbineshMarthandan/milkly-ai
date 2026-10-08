import { FilePlus2, MapPin, Phone, User } from 'lucide-react';
import { Link } from 'react-router';
import type { Customer } from '@/domain/models';
import { ItemCard, type CardAction } from '@/components/explorer/Explorer';

interface CustomerCardProps {
  customer: Customer;
  /** Names of the vendors this store is supplied with (empty = all). */
  vendorNames: string[];
  /** Shown under the name when the card appears outside its route folder. */
  context?: string;
  actions: readonly CardAction[];
  onOpen?: () => void;
  canBill: boolean;
}

/** A store as a card: contact details, delivery stop, supplied vendors and a quick "bill" link. */
export function CustomerCard({ customer, vendorNames, context, actions, onOpen, canBill }: CustomerCardProps) {
  return (
    <ItemCard
      name={customer.storeName}
      title={customer.storeName}
      subtitle={context}
      inactive={!customer.isActive}
      actions={actions}
      onOpen={onOpen}
      badge={<span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-800">Stop {customer.priority}</span>}
      footer={
        <>
          <span className="font-mono">{customer._id}</span>
          {canBill && customer.isActive && (
            <Link
              to={`/billing/new?route=${encodeURIComponent(customer.routeId)}&customer=${encodeURIComponent(customer._id)}`}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50"
            >
              <FilePlus2 className="size-3.5" /> Create bill
            </Link>
          )}
        </>
      }
    >
      <ul className="space-y-1.5 text-sm text-slate-600">
        {customer.contactPerson && (
          <li className="flex items-center gap-2">
            <User className="size-3.5 shrink-0 text-slate-400" aria-hidden /> {customer.contactPerson}
          </li>
        )}
        {customer.phone && (
          <li className="flex items-center gap-2">
            <Phone className="size-3.5 shrink-0 text-slate-400" aria-hidden />
            <a href={`tel:${customer.phone.replace(/\s+/g, '')}`} className="relative z-10 hover:text-brand-700 hover:underline">
              {customer.phone}
            </a>
          </li>
        )}
        {customer.address && (
          <li className="flex items-start gap-2">
            <MapPin className="mt-0.5 size-3.5 shrink-0 text-slate-400" aria-hidden />
            <span className="line-clamp-2">{customer.address}</span>
          </li>
        )}
      </ul>
      <div className="mt-3 flex flex-wrap gap-1">
        {vendorNames.length ? (
          vendorNames.map((name) => (
            <span key={name} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
              {name}
            </span>
          ))
        ) : (
          <span className="text-[11px] text-slate-400">Supplied by all vendors</span>
        )}
      </div>
    </ItemCard>
  );
}
