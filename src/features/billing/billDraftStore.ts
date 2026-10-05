import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { BillLine, EntityId, IsoDate } from '@/domain/models';
import { toLocalIsoDate } from '@/domain/services/dates';

/**
 * Bill drafts live only on this device until the user explicitly saves.
 * Drafts are never written to the database and never appear in Past Bills;
 * printing a draft does not change that. They are persisted locally so an
 * accidental refresh does not lose a half-entered bill. (Business data only —
 * no credentials.)
 */
export interface BillDraft {
  routeId: EntityId | null;
  customerId: EntityId | null;
  billDate: IsoDate;
  notes: string;
  quantities: Record<EntityId, number>;
  /** Set when editing a finalized bill. */
  editing: {
    billId: EntityId;
    billNumber: string;
    version: number;
    /** Lines of the saved bill; their snapshot prices are kept while editing. */
    lockedLines: BillLine[];
  } | null;
  updatedAt: number;
}

export const emptyDraft = (): BillDraft => ({
  routeId: null,
  customerId: null,
  billDate: toLocalIsoDate(),
  notes: '',
  quantities: {},
  editing: null,
  updatedAt: Date.now(),
});

interface DraftStore {
  drafts: Record<string, BillDraft>;
  /** Creates the draft if missing (or replaces it when `replace` is set). */
  ensure: (key: string, initial?: Partial<BillDraft>, replace?: boolean) => void;
  update: (key: string, patch: Partial<BillDraft>) => void;
  setQuantity: (key: string, productId: EntityId, quantity: number) => void;
  clearItems: (key: string) => void;
  discard: (key: string) => void;
}

export const useBillDraftStore = create<DraftStore>()(
  persist(
    (set) => ({
      drafts: {},
      ensure: (key, initial = {}, replace = false) =>
        set((state) =>
          state.drafts[key] && !replace ? state : { drafts: { ...state.drafts, [key]: { ...emptyDraft(), ...initial } } },
        ),
      update: (key, patch) =>
        set((state) => ({
          drafts: { ...state.drafts, [key]: { ...(state.drafts[key] ?? emptyDraft()), ...patch, updatedAt: Date.now() } },
        })),
      setQuantity: (key, productId, quantity) =>
        set((state) => {
          const draft = state.drafts[key] ?? emptyDraft();
          const quantities = { ...draft.quantities };
          if (quantity > 0) quantities[productId] = quantity;
          else delete quantities[productId];
          return { drafts: { ...state.drafts, [key]: { ...draft, quantities, updatedAt: Date.now() } } };
        }),
      clearItems: (key) =>
        set((state) => ({
          drafts: { ...state.drafts, [key]: { ...(state.drafts[key] ?? emptyDraft()), quantities: {}, notes: '', updatedAt: Date.now() } },
        })),
      discard: (key) =>
        set((state) => {
          const drafts = { ...state.drafts };
          delete drafts[key];
          return { drafts };
        }),
    }),
    {
      name: 'milkly.billDrafts.v1',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ drafts: state.drafts }),
    },
  ),
);

export function useDraft(key: string): BillDraft | undefined {
  return useBillDraftStore((state) => state.drafts[key]);
}

export function useDraftQuantity(key: string, productId: EntityId): number {
  return useBillDraftStore((state) => state.drafts[key]?.quantities[productId] ?? 0);
}
