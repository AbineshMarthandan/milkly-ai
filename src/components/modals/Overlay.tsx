import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';
import { IconButton } from '../common/Button';

interface OverlayProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Prevent closing via backdrop/Escape while something is saving. */
  dismissible?: boolean;
}

const MODAL_WIDTHS = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };
const DRAWER_WIDTHS = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-xl', xl: 'max-w-3xl' };

function Header({ title, description, onClose, dismissible }: Pick<OverlayProps, 'title' | 'description' | 'onClose' | 'dismissible'>) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
      <div className="min-w-0">
        <DialogTitle className="text-base font-semibold text-slate-900">{title}</DialogTitle>
        {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
      </div>
      <IconButton label="Close" onClick={onClose} disabled={dismissible === false}>
        <X className="size-4" />
      </IconButton>
    </div>
  );
}

/** Centered dialog. */
export function Modal({ open, onClose, title, description, children, footer, size = 'md', dismissible = true }: OverlayProps) {
  return (
    <Dialog open={open} onClose={() => dismissible && onClose()} className="relative z-50">
      <DialogBackdrop transition className="fixed inset-0 bg-slate-900/40 transition duration-150 data-closed:opacity-0" />
      <div className="fixed inset-0 flex items-end justify-center overflow-y-auto p-0 sm:items-center sm:p-4">
        <DialogPanel
          transition
          className={cn(
            'flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl transition duration-150 sm:rounded-2xl',
            'data-closed:translate-y-4 data-closed:opacity-0 sm:data-closed:translate-y-0 sm:data-closed:scale-95',
            MODAL_WIDTHS[size],
          )}
        >
          <Header title={title} description={description} onClose={onClose} dismissible={dismissible} />
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">{footer}</div>}
        </DialogPanel>
      </div>
    </Dialog>
  );
}

/** Side panel, used for create/edit forms. */
export function Drawer({ open, onClose, title, description, children, footer, size = 'md', dismissible = true }: OverlayProps) {
  return (
    <Dialog open={open} onClose={() => dismissible && onClose()} className="relative z-50">
      <DialogBackdrop transition className="fixed inset-0 bg-slate-900/40 transition duration-200 data-closed:opacity-0" />
      <div className="fixed inset-0 flex justify-end">
        <DialogPanel
          transition
          className={cn(
            'flex h-full w-full flex-col bg-white shadow-xl transition duration-200 ease-out data-closed:translate-x-full',
            DRAWER_WIDTHS[size],
          )}
        >
          <Header title={title} description={description} onClose={onClose} dismissible={dismissible} />
          <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">{footer}</div>}
        </DialogPanel>
      </div>
    </Dialog>
  );
}
