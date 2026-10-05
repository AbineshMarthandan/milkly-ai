import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { DEFAULT_APP_SETTINGS } from '@/domain/models/settings';
import { formatMoney } from '@/utils/format';
import { queryKeys } from '@/constants/queryKeys';
import { useServices } from './useSession';

export function useAppSettings() {
  const services = useServices();
  return useQuery({
    queryKey: queryKeys.appSettings,
    queryFn: () => services.settings.getAppSettings(),
    staleTime: 10 * 60_000,
  });
}

/** Currency formatter bound to the business currency setting. */
export function useMoney(): (value: number) => string {
  const { data } = useAppSettings();
  const currency = data?.data.currency ?? DEFAULT_APP_SETTINGS.currency;
  return useCallback((value: number) => formatMoney(value, currency), [currency]);
}
