import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { ChevronRight, Folder, FolderPlus, MoreVertical, Plus, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '@/utils/cn';

/**
 * Building blocks for the folder-style master-data screens: vendors and
 * routes are folders, categories are sub-folders, products and stores are
 * cards inside them.
 */

// ---------------------------------------------------------------- folder accents

/** Decorative identity tints for folders (not data encoding). */
const ACCENTS = [
  { tile: 'bg-teal-50', icon: 'text-teal-600', ring: 'hover:border-teal-300' },
  { tile: 'bg-sky-50', icon: 'text-sky-600', ring: 'hover:border-sky-300' },
  { tile: 'bg-amber-50', icon: 'text-amber-600', ring: 'hover:border-amber-300' },
  { tile: 'bg-violet-50', icon: 'text-violet-600', ring: 'hover:border-violet-300' },
  { tile: 'bg-rose-50', icon: 'text-rose-600', ring: 'hover:border-rose-300' },
  { tile: 'bg-emerald-50', icon: 'text-emerald-600', ring: 'hover:border-emerald-300' },
  { tile: 'bg-indigo-50', icon: 'text-indigo-600', ring: 'hover:border-indigo-300' },
  { tile: 'bg-orange-50', icon: 'text-orange-600', ring: 'hover:border-orange-300' },
] as const;

export type Accent = (typeof ACCENTS)[number];

/** Stable accent for an item, from its position in priority order. */
export function accentFor(index: number): Accent {
  return ACCENTS[((index % ACCENTS.length) + ACCENTS.length) % ACCENTS.length];
}

// ---------------------------------------------------------------- breadcrumbs

export interface Crumb {
  label: ReactNode;
  to?: string;
}

export function Breadcrumbs({ items }: { items: readonly Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-2">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-slate-500">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={index} className="flex items-center gap-1">
              {index > 0 && <ChevronRight className="size-3.5 text-slate-300" aria-hidden />}
              {item.to && !last ? (
                <Link to={item.to} className="rounded px-1 hover:bg-slate-100 hover:text-slate-800">
                  {item.label}
                </Link>
              ) : (
                <span className={cn('px-1', last && 'font-medium text-slate-800')} aria-current={last ? 'page' : undefined}>
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// ---------------------------------------------------------------- actions menu

export interface CardAction {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  tone?: 'default' | 'danger' | 'brand';
}

/** "⋮" menu on a folder or card. Sits above the card's click target. */
export function CardMenu({ label, actions }: { label: string; actions: readonly CardAction[] }) {
  if (!actions.length) return null;
  return (
    <Menu>
      <MenuButton
        aria-label={`Actions for ${label}`}
        title="Actions"
        className="relative z-10 inline-flex size-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 data-open:bg-slate-100"
      >
        <MoreVertical className="size-4" />
      </MenuButton>
      <MenuItems
        anchor="bottom end"
        transition
        className="z-50 mt-1 w-48 rounded-lg border border-slate-200 bg-white p-1 text-sm shadow-lg transition data-closed:opacity-0"
      >
        {actions.map((action) => (
          <MenuItem key={action.label}>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                action.onSelect();
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left data-focus:bg-slate-100',
                action.tone === 'danger' ? 'text-rose-600' : action.tone === 'brand' ? 'text-brand-700' : 'text-slate-700',
              )}
            >
              <action.icon className="size-4" aria-hidden />
              {action.label}
            </button>
          </MenuItem>
        ))}
      </MenuItems>
    </Menu>
  );
}

// ---------------------------------------------------------------- grids

export function CardGrid({ children, dense, className }: { children: ReactNode; dense?: boolean; className?: string }) {
  return (
    <div
      className={cn(
        'grid gap-3',
        dense ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6' : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionHeading({ title, count, actions, to }: { title: ReactNode; count?: number; actions?: ReactNode; to?: string }) {
  const label = (
    <>
      {title}
      {count !== undefined && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">{count}</span>}
    </>
  );
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 className="flex items-center text-sm font-semibold text-slate-800">
        {to ? (
          <Link to={to} className="flex items-center hover:text-brand-700 hover:underline">
            {label}
          </Link>
        ) : (
          label
        )}
      </h2>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- folder tile

interface FolderTileProps {
  name: string;
  to: string;
  accent: Accent;
  /** e.g. "4 categories · 12 products" */
  meta?: ReactNode;
  /** Top-right badge, e.g. "#1" or a route code. */
  badge?: ReactNode;
  inactive?: boolean;
  actions?: readonly CardAction[];
  /** Extra content under the name, e.g. sub-folder chips. */
  children?: ReactNode;
}

/** A folder that opens on click. The whole tile is one link; the menu sits above it. */
export function FolderTile({ name, to, accent, meta, badge, inactive, actions = [], children }: FolderTileProps) {
  return (
    <div
      className={cn(
        'group relative flex min-h-36 flex-col rounded-2xl border bg-white p-4 shadow-xs transition',
        'hover:-translate-y-0.5 hover:shadow-md focus-within:ring-2 focus-within:ring-brand-500/40',
        inactive ? 'border-dashed border-slate-300 opacity-70' : cn('border-slate-200', accent.ring),
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className={cn('flex size-12 items-center justify-center rounded-xl', accent.tile)}>
          <Folder className={cn('size-7 transition-transform group-hover:scale-110', accent.icon)} fill="currentColor" fillOpacity={0.18} aria-hidden />
        </div>
        <div className="flex items-center gap-1">
          {inactive && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">Inactive</span>}
          {badge && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{badge}</span>}
          <CardMenu label={name} actions={actions} />
        </div>
      </div>
      <h3 className="mt-3 truncate text-base font-semibold text-slate-900">
        <Link to={to} className="after:absolute after:inset-0 after:rounded-2xl focus:outline-none">
          {name}
        </Link>
      </h3>
      {meta && <p className="mt-0.5 text-xs text-slate-500">{meta}</p>}
      {children && <div className="relative mt-3">{children}</div>}
    </div>
  );
}

/** Dashed "new item" tile placed at the end of a grid. */
export function AddTile({ label, onClick, folder, className }: { label: string; onClick: () => void; folder?: boolean; className?: string }) {
  const Icon = folder ? FolderPlus : Plus;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-h-36 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 p-4 text-sm font-medium text-slate-500 transition',
        'hover:border-brand-400 hover:bg-brand-50/50 hover:text-brand-700',
        className,
      )}
    >
      <Icon className="size-6" aria-hidden />
      {label}
    </button>
  );
}

// ---------------------------------------------------------------- item card shell

interface ItemCardProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Plain-text name for menus and accessible labels. */
  name: string;
  inactive?: boolean;
  actions?: readonly CardAction[];
  /** Click anywhere on the card (e.g. open the editor). */
  onOpen?: () => void;
  badge?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function ItemCard({ title, subtitle, name, inactive, actions = [], onOpen, badge, children, footer, className }: ItemCardProps) {
  return (
    <article
      className={cn(
        'relative flex flex-col rounded-2xl border bg-white p-4 shadow-xs transition',
        onOpen && 'cursor-pointer hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md focus-within:ring-2 focus-within:ring-brand-500/40',
        inactive ? 'border-dashed border-slate-300 opacity-70' : 'border-slate-200',
        className,
      )}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-slate-900">
            {onOpen ? (
              <button type="button" onClick={onOpen} className="text-left after:absolute after:inset-0 after:rounded-2xl focus:outline-none">
                {title}
              </button>
            ) : (
              title
            )}
          </h3>
          {subtitle && <p className="mt-0.5 truncate text-xs text-slate-500">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {inactive && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">Inactive</span>}
          {badge}
          <CardMenu label={name} actions={actions} />
        </div>
      </header>
      {children && <div className="mt-3 flex-1">{children}</div>}
      {footer && <footer className="relative z-10 mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5 text-[11px] text-slate-400">{footer}</footer>}
    </article>
  );
}

/** Placeholder grid while folders or cards load. */
export function GridSkeleton({ count = 8, dense }: { count?: number; dense?: boolean }) {
  return (
    <CardGrid dense={dense}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="min-h-36 animate-pulse rounded-2xl border border-slate-200 bg-white p-4" aria-hidden>
          <div className="size-12 rounded-xl bg-slate-200/70" />
          <div className="mt-4 h-4 w-2/3 rounded bg-slate-200/70" />
          <div className="mt-2 h-3 w-1/3 rounded bg-slate-200/70" />
        </div>
      ))}
    </CardGrid>
  );
}
