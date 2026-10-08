import { useCallback, useState } from 'react';

/** Open/close state for a create-or-edit drawer. `item === null` means "create". */
export function useDrawer<T>() {
  const [state, setState] = useState<{ open: boolean; item: T | null }>({ open: false, item: null });
  return {
    open: state.open,
    item: state.item,
    create: useCallback(() => setState({ open: true, item: null }), []),
    edit: useCallback((item: T) => setState({ open: true, item }), []),
    close: useCallback(() => setState((current) => ({ ...current, open: false })), []),
  };
}
