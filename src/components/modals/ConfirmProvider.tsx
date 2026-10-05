import { AlertTriangle, Info } from 'lucide-react';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Button } from '../common/Button';
import { Field, Textarea } from '../forms/Field';
import { Modal } from './Overlay';

export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  /** Ask for a text answer (e.g. a cancellation reason). */
  input?: { label: string; placeholder?: string; required?: boolean };
}

/** `false` when dismissed; `true` (or the entered text when `input` is set) when confirmed. */
type ConfirmResult = boolean | string;
type ConfirmFn = {
  (options: ConfirmOptions & { input: NonNullable<ConfirmOptions['input']> }): Promise<string | false>;
  (options: ConfirmOptions): Promise<boolean>;
};

const ConfirmContext = createContext<ConfirmFn | null>(null);

/** Promise-based confirmation dialogs: `if (await confirm({...})) …`. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string>();
  const resolver = useRef<((result: ConfirmResult) => void) | null>(null);

  const confirm = useCallback(
    (next: ConfirmOptions) =>
      new Promise<ConfirmResult>((resolve) => {
        resolver.current?.(false);
        resolver.current = resolve;
        setText('');
        setError(undefined);
        setOptions(next);
      }),
    [],
  ) as ConfirmFn;

  const close = (result: ConfirmResult) => {
    resolver.current?.(result);
    resolver.current = null;
    setOptions(null);
  };

  const accept = () => {
    if (options?.input) {
      if (options.input.required && !text.trim()) {
        setError(`${options.input.label} is required`);
        return;
      }
      close(text.trim());
    } else {
      close(true);
    }
  };

  const tone = options?.tone ?? 'primary';
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={options !== null}
        onClose={() => close(false)}
        size="sm"
        title={
          <span className="flex items-center gap-2">
            {tone === 'danger' ? (
              <AlertTriangle className="size-5 text-rose-600" aria-hidden />
            ) : (
              <Info className="size-5 text-brand-700" aria-hidden />
            )}
            {options?.title}
          </span>
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => close(false)}>
              {options?.cancelLabel ?? 'Cancel'}
            </Button>
            <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={accept} autoFocus={!options?.input}>
              {options?.confirmLabel ?? 'Confirm'}
            </Button>
          </>
        }
      >
        {options?.description && <div className="text-sm text-slate-600">{options.description}</div>}
        {options?.input && (
          <Field label={options.input.label} required={options.input.required} error={error} className="mt-4">
            {(props) => (
              <Textarea
                {...props}
                autoFocus
                value={text}
                placeholder={options.input?.placeholder}
                onChange={(event) => setText(event.target.value)}
              />
            )}
          </Field>
        )}
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return confirm;
}
