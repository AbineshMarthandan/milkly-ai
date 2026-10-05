import { Milk } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

/** Centered card layout for sign-in and setup screens. */
export function AuthShell({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-brand-50 via-slate-50 to-sky-50 px-4 py-10">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-xl bg-brand-700 text-white shadow-md">
          <Milk className="size-6" aria-hidden />
        </div>
        <div>
          <div className="text-lg font-semibold text-slate-900">Milkly AI</div>
          <div className="text-xs text-slate-500">Multi-vendor billing & distribution</div>
        </div>
      </div>
      <div className={cn('w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8', wide ? 'max-w-2xl' : 'max-w-md')}>{children}</div>
    </div>
  );
}
