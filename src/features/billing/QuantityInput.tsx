import { Minus, Plus } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';
import { roundQuantity } from '@/domain/services/money';
import { cn } from '@/utils/cn';

interface QuantityInputProps {
  value: number;
  onChange: (value: number) => void;
  /** Row position, used for ↑/↓/Enter navigation between rows. */
  index: number;
  label: string;
  disabled?: boolean;
}

const QTY_SELECTOR = 'input[data-qty-index]';

/** Moves focus to the quantity input of another catalogue row. */
function focusRow(from: HTMLInputElement, offset: number) {
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>(QTY_SELECTOR));
  const position = inputs.indexOf(from);
  const target = inputs[position + offset];
  if (target) {
    target.focus();
    target.select();
  }
}

/**
 * Fast quantity entry: type a number, Enter/↓ for the next product, ↑ for the
 * previous one, +/− to step. Negative values cannot be entered.
 */
export function QuantityInput({ value, onChange, index, label, disabled }: QuantityInputProps) {
  const [text, setText] = useState(value ? String(value) : '');
  const [syncedValue, setSyncedValue] = useState(value);

  // Sync when the draft changes elsewhere (Repeat last bill, Clear, step
  // buttons) — derived during render, keeping "2." while the user types "2.5".
  if (value !== syncedValue) {
    setSyncedValue(value);
    if (Number(text || 0) !== value) setText(value ? String(value) : '');
  }

  const commit = (raw: string) => {
    if (!/^\d*\.?\d{0,3}$/.test(raw)) return; // digits only, up to 3 decimals, never negative
    setText(raw);
    onChange(roundQuantity(Number(raw || 0)));
  };

  const step = (delta: number) => onChange(Math.max(0, roundQuantity(value + delta)));

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === 'ArrowDown') {
      event.preventDefault();
      focusRow(event.currentTarget, 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusRow(event.currentTarget, -1);
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      step(1);
    } else if (event.key === '-') {
      event.preventDefault();
      step(-1);
    }
  };

  return (
    <div className={cn('inline-flex items-center rounded-lg border bg-white', value > 0 ? 'border-brand-400' : 'border-slate-300')}>
      <button
        type="button"
        tabIndex={-1}
        aria-label={`Decrease ${label}`}
        disabled={disabled || value <= 0}
        onClick={() => step(-1)}
        className="flex size-8 items-center justify-center rounded-l-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30"
      >
        <Minus className="size-3.5" />
      </button>
      <input
        data-qty-index={index}
        aria-label={`Quantity of ${label}`}
        inputMode="decimal"
        autoComplete="off"
        value={text}
        disabled={disabled}
        placeholder="0"
        onChange={(event) => commit(event.target.value.trim())}
        onFocus={(event) => event.currentTarget.select()}
        onKeyDown={onKeyDown}
        className="tabular h-8 w-14 border-x border-slate-200 text-center text-sm font-medium text-slate-900 placeholder:text-slate-300 focus:outline-none"
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={`Increase ${label}`}
        disabled={disabled}
        onClick={() => step(1)}
        className="flex size-8 items-center justify-center rounded-r-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}
