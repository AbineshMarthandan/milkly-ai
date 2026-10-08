import { CalendarClock, ChevronLeft, ChevronRight, History, ListChecks, MapPinned, Search, Store } from 'lucide-react';
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { isAppError, toAppError } from '@/domain/errors/AppError';
import type { Bill, Customer } from '@/domain/models';
import type { BillDraftInput } from '@/domain/services';
import { quantitiesFromBill } from '@/domain/services/billing/billDocument';
import { indexCatalog } from '@/domain/services/billing/catalog';
import { toLocalIsoDate } from '@/domain/services/dates';
import { sortByPriority } from '@/domain/services/ordering';
import { Button, IconButton } from '@/components/common/Button';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/common/Feedback';
import { Card } from '@/components/common/Layout';
import { usePrintBill } from '@/components/billing/PrintProvider';
import { Combobox, type ComboOption } from '@/components/forms/Combobox';
import { Field, Input } from '@/components/forms/Field';
import { useConfirm } from '@/components/modals/ConfirmProvider';
import { useMoney } from '@/hooks/useAppSettings';
import { useServices } from '@/hooks/useSession';
import { cn } from '@/utils/cn';
import { formatDate } from '@/utils/format';
import { sessionManager } from '@/app/store/sessionManager';
import { useMasterList } from '../shared/masterData';
import { useBillDraftStore, useDraft } from './billDraftStore';
import { BillSummary } from './BillSummary';
import { CatalogTable } from './CatalogTable';
import { useBillingCatalog, useDraftTotals, useFinalizeBill, useUpdateBill } from './useBilling';

interface BillEditorProps {
  draftKey: string;
  mode: 'create' | 'edit';
}

/**
 * Route → customer → products billing screen. All arithmetic comes from the
 * domain billing functions; this component only collects input and wires the
 * Save / Print / Save & Print / Cancel actions.
 */
export function BillEditor({ draftKey, mode }: BillEditorProps) {
  const draft = useDraft(draftKey)!;
  const { update, clearItems, discard } = useBillDraftStore.getState();
  const services = useServices();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const printBill = usePrintBill();
  const money = useMoney();
  const finalize = useFinalizeBill();
  const updateBill = useUpdateBill();
  const [search, setSearch] = useState('');
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [repeating, setRepeating] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const customerRef = useRef<HTMLInputElement>(null);

  const routes = useMasterList('routes');
  const customers = useMasterList('customers');
  const { data: vendors = [] } = useMasterList('vendors');

  const route = routes.data?.find((candidate) => candidate._id === draft.routeId) ?? null;
  const customer = customers.data?.find((candidate) => candidate._id === draft.customerId) ?? null;
  const { catalog, isLoading, error, refetch } = useBillingCatalog(customer, draft.editing?.lockedLines);
  const { vendors: billVendors, totals } = useDraftTotals(catalog, draft.quantities);
  const { data: allProducts = [] } = useMasterList('products');

  // Quantities entered for products that are no longer on this store's list
  // (deleted, or under a deleted vendor/category) are never billed — say so.
  const catalogIds = useMemo(() => indexCatalog(catalog), [catalog]);
  const unavailable = useMemo(
    () =>
      customer && !isLoading
        ? Object.keys(draft.quantities)
            .filter((productId) => (draft.quantities[productId] ?? 0) > 0 && !catalogIds.has(productId))
            .map((productId) => {
              const product = allProducts.find((candidate) => candidate._id === productId);
              return product ? `${product.productName} ${product.unit}` : productId;
            })
        : [],
    [customer, isLoading, draft.quantities, catalogIds, allProducts],
  );
  const dropUnavailable = () => {
    const quantities = Object.fromEntries(Object.entries(draft.quantities).filter(([productId]) => catalogIds.has(productId)));
    update(draftKey, { quantities });
  };

  const routeOptions = useMemo<ComboOption[]>(() => {
    const list = sortByPriority(
      (routes.data ?? []).filter((candidate) => candidate.isActive || candidate._id === draft.routeId),
      (candidate) => candidate.routeName,
    );
    return list.map((candidate) => ({
      value: candidate._id,
      label: candidate.routeName,
      description: `${(customers.data ?? []).filter((c) => c.routeId === candidate._id && c.isActive).length} customers`,
      meta: candidate.routeCode,
    }));
  }, [routes.data, customers.data, draft.routeId]);

  /** Customers on the route in delivery (priority) order. */
  const routeCustomers = useMemo<Customer[]>(
    () =>
      sortByPriority(
        (customers.data ?? []).filter(
          (candidate) => candidate.routeId === draft.routeId && (candidate.isActive || candidate._id === draft.customerId),
        ),
        (candidate) => candidate.storeName,
      ),
    [customers.data, draft.routeId, draft.customerId],
  );
  const customerOptions = useMemo<ComboOption[]>(
    () =>
      routeCustomers.map((candidate) => ({
        value: candidate._id,
        label: candidate.storeName,
        description: [candidate.contactPerson, candidate.phone].filter(Boolean).join(' · ') || undefined,
        meta: `#${candidate.priority}`,
      })),
    [routeCustomers],
  );
  const customerIndex = routeCustomers.findIndex((candidate) => candidate._id === draft.customerId);

  const selectRoute = (routeId: string | null) => {
    update(draftKey, { routeId, customerId: null });
    if (routeId) setTimeout(() => customerRef.current?.focus(), 50);
  };
  const selectCustomer = (customerId: string | null) => update(draftKey, { customerId });

  const today = toLocalIsoDate();
  const canSubmit = Boolean(route && customer && totals.itemCount > 0);
  const blocker = !route ? 'Select a route to start.' : !customer ? 'Select a customer.' : totals.itemCount === 0 ? 'Add at least one product.' : undefined;

  const buildInput = useCallback(
    (): BillDraftInput => ({
      billDate: draft.billDate,
      routeId: draft.routeId ?? '',
      customerId: draft.customerId ?? '',
      notes: draft.notes,
      catalog,
      quantities: draft.quantities,
    }),
    [draft, catalog],
  );

  /** After a new bill is saved, move on to the next store on the route. */
  const advanceAfterSave = (bill: Bill) => {
    const next = routeCustomers[customerIndex + 1];
    update(draftKey, { customerId: next?._id ?? null, quantities: {}, notes: '' });
    setSearch('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => document.querySelector<HTMLInputElement>('input[data-qty-index]')?.focus(), 300);
    toast.success(`Bill ${bill.billNumber} saved — ${money(bill.grandTotal)}`, {
      description: next ? `Next store: ${next.storeName}` : 'That was the last store on this route.',
      action: { label: 'Print', onClick: () => printBill(bill) },
    });
  };

  const save = async (andPrint: boolean) => {
    if (!canSubmit || finalize.isPending || updateBill.isPending) return;
    try {
      if (mode === 'edit' && draft.editing) {
        const bill = await updateBill.mutateAsync({ id: draft.editing.billId, input: buildInput(), version: draft.editing.version });
        discard(draftKey);
        toast.success(`Bill ${bill.billNumber} updated`);
        navigate(`/billing/history/${bill._id}`, { replace: true });
        if (andPrint) printBill(bill);
      } else {
        const bill = await finalize.mutateAsync(buildInput());
        if (andPrint) printBill(bill);
        advanceAfterSave(bill);
      }
    } catch (cause) {
      // The mutation cache shows a friendly toast; the draft is kept. If the
      // products changed underneath us, reload them so the screen is current.
      if (isAppError(cause) && cause.code === 'STALE_DATA') void sessionManager.refreshData();
    }
  };

  /** Prints the current draft without saving it. */
  const printDraft = async () => {
    if (!canSubmit) return;
    setPrinting(true);
    try {
      const preview = await services.bills.buildDraftPreview(buildInput());
      printBill(
        mode === 'edit' && draft.editing
          ? { ...preview, billNumber: `${draft.editing.billNumber} (unsaved changes)` }
          : preview,
      );
    } catch (cause) {
      toast.error(toAppError(cause).userMessage);
      if (isAppError(cause) && cause.code === 'STALE_DATA') void sessionManager.refreshData();
    } finally {
      setPrinting(false);
    }
  };

  const cancel = async () => {
    if (mode === 'edit' && draft.editing) {
      const billId = draft.editing.billId;
      if (!(await confirm({ title: 'Discard changes?', description: 'The saved bill stays exactly as it was.', confirmLabel: 'Discard', tone: 'danger' }))) return;
      discard(draftKey);
      navigate(`/billing/history/${billId}`);
      return;
    }
    if (totals.itemCount === 0 && !draft.notes) {
      clearItems(draftKey);
      return;
    }
    if (await confirm({ title: 'Clear this bill?', description: 'All entered quantities will be removed. Nothing has been saved.', confirmLabel: 'Clear bill', tone: 'danger' })) {
      clearItems(draftKey);
    }
  };

  /** Copies quantities from the customer's most recent saved bill at today's prices. */
  const repeatLastBill = async () => {
    if (!customer) return;
    setRepeating(true);
    try {
      const last = await services.bills.findLastForCustomer(customer._id, today);
      if (!last) {
        toast.info(`No saved bill for ${customer.storeName} in the last 60 days.`);
        return;
      }
      if (
        totals.itemCount > 0 &&
        !(await confirm({ title: 'Replace quantities?', description: `Current quantities will be replaced with those from ${last.billNumber}.`, confirmLabel: 'Replace' }))
      ) {
        return;
      }
      const available = indexCatalog(catalog);
      const quantities = Object.fromEntries(Object.entries(quantitiesFromBill(last.vendors)).filter(([productId]) => available.has(productId)));
      update(draftKey, { quantities });
      toast.success(`Loaded ${Object.keys(quantities).length} items from ${last.billNumber} (${formatDate(last.billDate)}) at current prices.`);
    } catch (cause) {
      toast.error(toAppError(cause).userMessage);
    } finally {
      setRepeating(false);
    }
  };

  // Keyboard shortcuts: Ctrl/⌘+S save, Ctrl/⌘+Enter save & print, Ctrl/⌘+P print draft, "/" search.
  const onShortcut = useEffectEvent((event: KeyboardEvent) => {
    const mod = event.ctrlKey || event.metaKey;
    const typing = event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName);
    if (mod && event.key.toLowerCase() === 's') {
      event.preventDefault();
      void save(false);
    } else if (mod && event.key === 'Enter') {
      event.preventDefault();
      void save(true);
    } else if (mod && event.key.toLowerCase() === 'p') {
      event.preventDefault();
      void printDraft();
    } else if (event.key === '/' && !typing) {
      event.preventDefault();
      searchRef.current?.focus();
    }
  });
  useEffect(() => {
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, []);

  const suppliedVendors = customer?.vendorIds.length
    ? customer.vendorIds.map((id) => vendors.find((vendor) => vendor._id === id)?.vendorName ?? id).join(', ')
    : 'All vendors';

  return (
    <div className="grid gap-5 pb-24 lg:grid-cols-[minmax(0,1fr)_320px] lg:pb-0 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-5">
        <Card className="p-4">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]">
            <Field label="Route" required>
              {(props) => (
                <Combobox {...props} options={routeOptions} value={draft.routeId} onChange={selectRoute} placeholder="Search routes…" autoFocus={!draft.routeId} />
              )}
            </Field>
            <Field label="Customer / store" required hint={route && !customerOptions.length ? 'No active customers on this route.' : undefined}>
              {(props) => (
                <div className="flex gap-1">
                  <Combobox
                    {...props}
                    ref={customerRef}
                    className="flex-1"
                    options={customerOptions}
                    value={draft.customerId}
                    onChange={selectCustomer}
                    disabled={!route}
                    placeholder={route ? 'Search stores…' : 'Select a route first'}
                  />
                  <IconButton label="Previous store" disabled={customerIndex <= 0} onClick={() => selectCustomer(routeCustomers[customerIndex - 1]?._id ?? null)} className="h-9">
                    <ChevronLeft className="size-4" />
                  </IconButton>
                  <IconButton
                    label="Next store"
                    disabled={!route || customerIndex >= routeCustomers.length - 1}
                    onClick={() => selectCustomer(routeCustomers[customerIndex + 1]?._id ?? null)}
                    className="h-9"
                  >
                    <ChevronRight className="size-4" />
                  </IconButton>
                </div>
              )}
            </Field>
            <Field
              label="Bill date"
              required
              hint={
                draft.billDate !== today ? (
                  <span className="inline-flex items-center gap-1 text-amber-700">
                    <CalendarClock className="size-3.5" /> Not today
                  </span>
                ) : undefined
              }
            >
              {(props) => (
                <Input {...props} type="date" value={draft.billDate} onChange={(event) => event.target.value && update(draftKey, { billDate: event.target.value })} className="md:w-44" />
              )}
            </Field>
          </div>
          {customer && (
            <div className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="inline-flex items-center gap-1">
                  <Store className="size-3.5 text-slate-400" /> {customer._id}
                  {customer.contactPerson && ` · ${customer.contactPerson}`}
                  {customer.phone && ` · ${customer.phone}`}
                </span>
                <span className="inline-flex items-center gap-1">
                  <MapPinned className="size-3.5 text-slate-400" /> Stop {customerIndex + 1} of {routeCustomers.length}
                </span>
                <span>Supplies: {suppliedVendors}</span>
              </div>
              {mode === 'create' && (
                <Button variant="secondary" size="sm" icon={<History className="size-3.5" />} loading={repeating} onClick={() => void repeatLastBill()}>
                  Repeat last bill
                </Button>
              )}
            </div>
          )}
        </Card>

        {unavailable.length > 0 && (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span className="flex-1">
              <b>{unavailable.length === 1 ? '1 item' : `${unavailable.length} items`} in this draft won’t be billed</b> — no longer available for this
              store (deleted, or its vendor/category was deleted): {unavailable.slice(0, 4).join(', ')}
              {unavailable.length > 4 ? '…' : ''}
            </span>
            <Button size="sm" variant="secondary" onClick={dropUnavailable}>
              Remove from draft
            </Button>
          </div>
        )}

        <Card className="overflow-hidden">
          {!customer ? (
            <EmptyState
              icon={<Store className="size-6" />}
              title={route ? 'Select a customer' : 'Select a route and customer'}
              description="Products then appear grouped by vendor and category in priority order. Type quantities and press Enter to move down."
            />
          ) : isLoading ? (
            <TableSkeleton rows={8} columns={5} />
          ) : error ? (
            <ErrorState error={error} onRetry={() => void refetch()} />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
                <Input
                  ref={searchRef}
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search products…  ( / )"
                  aria-label="Search products"
                  leading={<Search className="size-4" />}
                  className="sm:w-72"
                />
                <Button
                  variant={selectedOnly ? 'primary' : 'secondary'}
                  size="sm"
                  icon={<ListChecks className="size-4" />}
                  onClick={() => setSelectedOnly((value) => !value)}
                  aria-pressed={selectedOnly}
                >
                  Selected only ({totals.itemCount})
                </Button>
                <div className="flex-1" />
                <Input
                  value={draft.notes}
                  onChange={(event) => update(draftKey, { notes: event.target.value })}
                  placeholder="Note on bill (optional)"
                  aria-label="Note on bill"
                  maxLength={500}
                  className="sm:w-64"
                />
              </div>
              <CatalogTable draftKey={draftKey} catalog={catalog} quantities={draft.quantities} search={search} selectedOnly={selectedOnly} />
            </>
          )}
        </Card>
      </div>

      <aside className="lg:sticky lg:top-20 lg:self-start">
        <BillSummary
          mode={mode}
          customerName={customer?.storeName}
          vendors={billVendors}
          totals={totals}
          canSubmit={canSubmit}
          blocker={blocker}
          saving={finalize.isPending || updateBill.isPending}
          printing={printing}
          onSave={() => void save(false)}
          onSaveAndPrint={() => void save(true)}
          onPrint={() => void printDraft()}
          onCancel={() => void cancel()}
        />
      </aside>

      {/* Phone/tablet: keep the total and Save reachable while scrolling the catalogue. */}
      <div className={cn('fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden', !customer && 'hidden')}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs text-slate-500">
              {totals.itemCount} items · {customer?.storeName}
            </div>
            <div className="tabular text-lg font-bold text-slate-900">{money(totals.grandTotal)}</div>
          </div>
          <Button disabled={!canSubmit} loading={finalize.isPending || updateBill.isPending} onClick={() => void save(false)}>
            {mode === 'edit' ? 'Save changes' : 'Save bill'}
          </Button>
        </div>
      </div>
    </div>
  );
}

