import {
  Combobox as HeadlessCombobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from '@headlessui/react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { forwardRef, useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/utils/cn';
import { controlClass } from './Field';

export interface ComboOption {
  value: string;
  label: string;
  /** Secondary text, also searched. */
  description?: string;
  /** Right-aligned hint, e.g. an ID or badge. */
  meta?: ReactNode;
  disabled?: boolean;
}

export interface ComboboxProps {
  id?: string;
  options: readonly ComboOption[];
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  /** Show a clear (×) button. */
  clearable?: boolean;
  emptyText?: string;
  autoFocus?: boolean;
  className?: string;
  'aria-describedby'?: string;
}

const MAX_RENDERED = 150;

/** Searchable, keyboard-friendly select (type to filter, ↑/↓, Enter, Esc). */
export const Combobox = forwardRef<HTMLInputElement, ComboboxProps>(function Combobox(
  { id, options, value, onChange, placeholder = 'Search…', disabled, invalid, clearable, emptyText = 'No matches', autoFocus, className, ...aria },
  ref,
) {
  const [query, setQuery] = useState('');
  const selected = useMemo(() => options.find((option) => option.value === value) ?? null, [options, value]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = needle
      ? options.filter((option) => `${option.label} ${option.description ?? ''}`.toLowerCase().includes(needle))
      : options;
    return matches.slice(0, MAX_RENDERED);
  }, [options, query]);

  return (
    <HeadlessCombobox
      value={selected}
      onChange={(option: ComboOption | null) => onChange(option?.value ?? null)}
      onClose={() => setQuery('')}
      disabled={disabled}
      immediate
      by="value"
    >
      <div className={cn('relative', className)}>
        <ComboboxInput
          ref={ref}
          id={id}
          autoFocus={autoFocus}
          aria-invalid={invalid || undefined}
          aria-describedby={aria['aria-describedby']}
          className={cn(controlClass(invalid), 'h-9 pr-14')}
          displayValue={(option: ComboOption | null) => option?.label ?? ''}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
          autoComplete="off"
        />
        <div className="absolute inset-y-0 right-0 flex items-center pr-1">
          {clearable && selected && !disabled && (
            <button
              type="button"
              className="rounded p-1 text-slate-400 hover:text-slate-600"
              aria-label="Clear selection"
              onClick={() => onChange(null)}
            >
              <X className="size-3.5" />
            </button>
          )}
          <ComboboxButton className="rounded p-1 text-slate-400 hover:text-slate-600" aria-label="Show options">
            <ChevronsUpDown className="size-4" />
          </ComboboxButton>
        </div>
      </div>
      <ComboboxOptions
        anchor={{ to: 'bottom start', gap: 4 }}
        transition
        className={cn(
          'z-50 max-h-72 w-(--input-width) min-w-56 overflow-auto rounded-lg border border-slate-200 bg-white p-1 text-sm shadow-lg',
          'transition duration-100 ease-out empty:invisible data-closed:opacity-0',
        )}
      >
        {filtered.length === 0 ? (
          <div className="px-3 py-2 text-slate-500">{emptyText}</div>
        ) : (
          filtered.map((option) => (
            <ComboboxOption
              key={option.value}
              value={option}
              disabled={option.disabled}
              className="group flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 select-none data-disabled:cursor-not-allowed data-disabled:opacity-50 data-focus:bg-brand-50"
            >
              <Check className="invisible size-4 shrink-0 text-brand-700 group-data-selected:visible" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-slate-800 group-data-selected:font-medium">{option.label}</span>
                {option.description && <span className="block truncate text-xs text-slate-500">{option.description}</span>}
              </span>
              {option.meta && <span className="shrink-0 text-xs text-slate-400">{option.meta}</span>}
            </ComboboxOption>
          ))
        )}
      </ComboboxOptions>
    </HeadlessCombobox>
  );
});
