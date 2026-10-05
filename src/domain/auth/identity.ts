/**
 * Authentication port. The domain only needs to know *who* the person is; how
 * they proved it (Google Identity Services today, a backend session tomorrow)
 * is an infrastructure detail behind this interface.
 */
export interface Identity {
  /** Lower-cased e-mail; the join key into the `users` collection. */
  email: string;
  name: string;
  pictureUrl?: string;
}

export interface IdentityProvider {
  readonly kind: 'google' | 'demo';
  /** Interactive sign-in. Must be called from a user gesture (it may open a popup). */
  signIn(options?: { loginHint?: string }): Promise<Identity>;
  /** Re-acquire credentials after expiry. Must be called from a user gesture. */
  reauthenticate(): Promise<void>;
  signOut(): Promise<void>;
}
