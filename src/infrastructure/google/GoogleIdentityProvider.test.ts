import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleIdentityProvider } from './GoogleIdentityProvider';

const KEY = 'milkly.googleSession.v1';
const CLIENT = 'client-1.apps.googleusercontent.com';
const identity = { email: 'owner@example.com', name: 'Owner' };

function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, value),
  };
}

const store = (expiresAt: number, clientId = CLIENT) =>
  sessionStorage.setItem(KEY, JSON.stringify({ clientId, token: 'token-1', expiresAt, identity }));

/** A page refresh keeps this tab signed in while its Google token is still valid. */
describe('Google sign-in across page refreshes', () => {
  beforeEach(() => {
    vi.stubGlobal('sessionStorage', memoryStorage());
    vi.stubGlobal('window', {});
  });
  afterEach(() => vi.unstubAllGlobals());

  it('restores a valid session and its token', async () => {
    store(Date.now() + 30 * 60_000);
    const provider = new GoogleIdentityProvider(CLIENT);
    expect(provider.restoreSession()).toEqual(identity);
    expect(provider.currentIdentity).toEqual(identity);
    await expect(provider.getAccessToken()).resolves.toBe('token-1');
  });

  it('ignores and removes an expired session', () => {
    store(Date.now() + 30_000);
    expect(new GoogleIdentityProvider(CLIENT).restoreSession()).toBeNull();
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('ignores a session from another OAuth client', () => {
    store(Date.now() + 30 * 60_000, 'other.apps.googleusercontent.com');
    expect(new GoogleIdentityProvider(CLIENT).restoreSession()).toBeNull();
  });

  it('forgets the session on sign-out and when Google rejects the token', async () => {
    store(Date.now() + 30 * 60_000);
    const provider = new GoogleIdentityProvider(CLIENT);
    provider.restoreSession();
    provider.invalidateToken();
    expect(sessionStorage.getItem(KEY)).toBeNull();

    store(Date.now() + 30 * 60_000);
    provider.restoreSession();
    await provider.signOut();
    expect(sessionStorage.getItem(KEY)).toBeNull();
    await expect(provider.getAccessToken()).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  });
});
