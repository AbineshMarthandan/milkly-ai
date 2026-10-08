import { useEffect } from 'react';
import { toast } from 'sonner';
import { registerSW } from 'virtual:pwa-register';

const UPDATE_CHECK_MS = 60 * 60 * 1000;

/**
 * Registers the service worker (production builds only). A new version never
 * reloads the page by itself — a half-entered bill must not vanish — the user
 * chooses when to update. Bill drafts survive the reload anyway.
 */
export function PwaRegistration() {
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    const updateServiceWorker = registerSW({
      onNeedRefresh() {
        toast('A new version of Milkly is available', {
          description: 'Update when convenient — unsaved bill drafts are kept.',
          duration: Infinity,
          action: { label: 'Update', onClick: () => void updateServiceWorker(true) },
        });
      },
      onOfflineReady() {
        toast.success('Milkly is installed for offline use');
      },
      onRegisteredSW(_url, registration) {
        if (registration) setInterval(() => void registration.update(), UPDATE_CHECK_MS);
      },
    });
  }, []);
  return null;
}
