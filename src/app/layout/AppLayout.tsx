import { Dialog, DialogBackdrop, DialogPanel, Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { ChevronDown, Download, LogOut, Menu as MenuIcon, Milk, RefreshCw, Sheet, WifiOff, X } from 'lucide-react';
import { Suspense, useState } from 'react';
import { NavLink, Outlet } from 'react-router';
import { toast } from 'sonner';
import { ROLE_LABELS } from '@/domain/models';
import { FullPageSpinner } from '@/components/common/Feedback';
import { IconButton } from '@/components/common/Button';
import { PrintProvider } from '@/components/billing/PrintProvider';
import { useAppSettings } from '@/hooks/useAppSettings';
import { useCan, useCurrentUser } from '@/hooks/useSession';
import { cn } from '@/utils/cn';
import { sessionManager } from '../store/sessionManager';
import { useSessionStore } from '../store/sessionStore';
import { useInstallPrompt, useOnlineStatus } from '../pwa/pwa';
import { NAVIGATION } from './navigation';
import { ReauthDialog } from './ReauthDialog';

function Brand() {
  const { data } = useAppSettings();
  return (
    <div className="flex items-center gap-2.5 px-4 py-4">
      <div className="flex size-9 items-center justify-center rounded-lg bg-brand-700 text-white shadow-sm">
        <Milk className="size-5" aria-hidden />
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-slate-900">{data?.data.businessName ?? 'Milkly AI'}</div>
        <div className="text-xs text-slate-500">Billing & distribution</div>
      </div>
    </div>
  );
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const can = useCan();
  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-6" aria-label="Main">
      {NAVIGATION.map((section, index) => {
        const items = section.items.filter((item) => can(item.permission));
        if (!items.length) return null;
        return (
          <div key={section.title ?? index}>
            {section.title && (
              <div className="mb-1.5 px-2 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">{section.title}</div>
            )}
            <ul className="space-y-0.5">
              {items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                        isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                      )
                    }
                  >
                    <item.icon className="size-4 shrink-0" aria-hidden />
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function UserMenu() {
  const user = useCurrentUser();
  if (!user) return null;
  const initials = (user.displayName.match(/\p{L}+/gu) ?? [user.email])
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <Menu>
      <MenuButton className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-100">
        <span className="flex size-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800">{initials}</span>
        <span className="hidden min-w-0 sm:block">
          <span className="block max-w-40 truncate text-sm font-medium text-slate-800">{user.displayName}</span>
          <span className="block text-xs text-slate-500">{ROLE_LABELS[user.role]}</span>
        </span>
        <ChevronDown className="size-4 text-slate-400" aria-hidden />
      </MenuButton>
      <MenuItems
        anchor="bottom end"
        transition
        className="z-50 mt-1 w-60 rounded-lg border border-slate-200 bg-white p-1 text-sm shadow-lg transition data-closed:opacity-0"
      >
        <div className="px-3 py-2">
          <div className="truncate font-medium text-slate-800">{user.displayName}</div>
          <div className="truncate text-xs text-slate-500">{user.email}</div>
        </div>
        <div className="my-1 h-px bg-slate-100" />
        <MenuItem>
          <button
            type="button"
            onClick={() => void sessionManager.signOut()}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-slate-700 data-focus:bg-slate-100"
          >
            <LogOut className="size-4" /> Sign out
          </button>
        </MenuItem>
      </MenuItems>
    </Menu>
  );
}

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const dataSource = useSessionStore((state) => state.dataSource);
  const online = useOnlineStatus();
  const { canInstall, install } = useInstallPrompt();

  const refresh = async () => {
    setRefreshing(true);
    try {
      await sessionManager.refreshData();
      toast.success('Data refreshed');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <PrintProvider>
      <div className="min-h-screen">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
          <Brand />
          <SidebarNav />
        </aside>

        <Dialog open={mobileOpen} onClose={setMobileOpen} className="relative z-50 lg:hidden">
          <DialogBackdrop transition className="fixed inset-0 bg-slate-900/40 transition data-closed:opacity-0" />
          <DialogPanel transition className="fixed inset-y-0 left-0 flex w-72 flex-col bg-white shadow-xl transition data-closed:-translate-x-full">
            <div className="flex items-center justify-between pr-3">
              <Brand />
              <IconButton label="Close menu" onClick={() => setMobileOpen(false)}>
                <X className="size-5" />
              </IconButton>
            </div>
            <SidebarNav onNavigate={() => setMobileOpen(false)} />
          </DialogPanel>
        </Dialog>

        <div className="lg:pl-64">
          {!online && (
            <div role="status" className="flex items-center justify-center gap-2 bg-slate-800 px-4 py-1.5 text-center text-xs text-white">
              <WifiOff className="size-3.5 shrink-0" aria-hidden />
              You’re offline. You can keep entering a bill — saving and loading data need a connection.
            </div>
          )}
          <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
            <IconButton label="Open menu" className="lg:hidden" onClick={() => setMobileOpen(true)}>
              <MenuIcon className="size-5" />
            </IconButton>
            <div className="flex-1" />
            {dataSource && (
              <span className="hidden items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600 md:inline-flex">
                <Sheet className="size-3.5 text-emerald-600" />
                {dataSource.label}
              </span>
            )}
            {canInstall && (
              <button
                type="button"
                onClick={() => void install()}
                className="hidden items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-800 hover:bg-brand-100 sm:inline-flex"
              >
                <Download className="size-3.5" aria-hidden /> Install app
              </button>
            )}
            <IconButton label="Refresh data" onClick={() => void refresh()} disabled={refreshing || !online}>
              <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
            </IconButton>
            <UserMenu />
          </header>
          <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
            <Suspense fallback={<FullPageSpinner />}>
              <Outlet />
            </Suspense>
          </main>
        </div>
        <ReauthDialog />
      </div>
    </PrintProvider>
  );
}
