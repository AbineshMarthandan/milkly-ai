import { useSyncExternalStore } from 'react';

/**
 * PWA helpers: the browser's "install app" prompt and online/offline status.
 * The install event can fire before React mounts, so this module is imported
 * from `main.tsx` and starts listening immediately.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const installListeners = new Set<() => void>();
const notifyInstall = () => installListeners.forEach((listener) => listener());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault(); // show our own "Install app" button instead of the mini-infobar
    deferredPrompt = event as BeforeInstallPromptEvent;
    notifyInstall();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notifyInstall();
  });
}

function subscribeInstall(listener: () => void) {
  installListeners.add(listener);
  return () => installListeners.delete(listener);
}

/** `canInstall` is true when the browser offers installation (Chrome, Edge, Android). */
export function useInstallPrompt() {
  const canInstall = useSyncExternalStore(subscribeInstall, () => deferredPrompt !== null, () => false);
  const install = async () => {
    const prompt = deferredPrompt;
    if (!prompt) return false;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    deferredPrompt = null;
    notifyInstall();
    return outcome === 'accepted';
  };
  return { canInstall, install };
}

function subscribeOnline(listener: () => void) {
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => {
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}
