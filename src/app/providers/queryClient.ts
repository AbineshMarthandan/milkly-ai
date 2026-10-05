import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { isAppError, toAppError } from '@/domain/errors/AppError';
import { useSessionStore } from '../store/sessionStore';

const NON_RETRYABLE = new Set([
  'AUTH_REQUIRED',
  'AUTH_EXPIRED',
  'PERMISSION_DENIED',
  'SHEETS_PERMISSION_DENIED',
  'NOT_FOUND',
  'VALIDATION',
  'SHEET_MISSING',
  'SCHEMA_MISMATCH',
  'SPREADSHEET_NOT_FOUND',
  'CONFIG_INVALID',
]);

function handleAuthExpiry(error: unknown): boolean {
  if (isAppError(error) && error.code === 'AUTH_EXPIRED') {
    useSessionStore.setState({ reauthRequired: true });
    return true;
  }
  return false;
}

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: {
      /** Skip the automatic error toast (the caller shows the error itself). */
      silentError?: boolean;
    };
  }
}

/**
 * Caching policy tuned for Google Sheets quotas (60 reads/min/user):
 * - master data stays fresh for 5 minutes and is reused by every screen;
 * - no refetch on window focus (would burn quota for little benefit);
 * - transient errors retry once, permanent ones never.
 */
export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleAuthExpiry }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (handleAuthExpiry(error) || mutation.meta?.silentError) return;
      toast.error(toAppError(error).userMessage);
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 5 * 60_000,
      gcTime: 30 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => failureCount < 1 && !(isAppError(error) && NON_RETRYABLE.has(error.code)),
    },
    mutations: { retry: false },
  },
});
