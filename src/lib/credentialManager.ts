/**
 * Pkg251 — Credential Manager JS bridge.
 *
 * Usage:
 *   const { idToken } = await signInWithGoogle();
 *   await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
 *
 * `serverClientId` is the OAuth 2.0 Web Client ID from Google Cloud Console
 * (NOT the Android client ID). Set VITE_GOOGLE_WEB_CLIENT_ID in env, or
 * pass override.
 */
import { registerPlugin, Capacitor } from '@capacitor/core';

interface CredentialManagerPlugin {
  signInWithGoogle(opts: {
    serverClientId: string;
    nonce?: string;
    filterByAuthorized?: boolean;
  }): Promise<GoogleCredential>;
  signInWithGoogleButton(opts: { serverClientId: string; nonce?: string }): Promise<GoogleCredential>;
  signOut(): Promise<void>;
}

export interface GoogleCredential {
  idToken: string;
  id?: string;
  displayName?: string;
  givenName?: string;
  familyName?: string;
  profilePictureUri?: string;
}

const Native = registerPlugin<CredentialManagerPlugin>('CredentialManager');
const isAndroid = () => Capacitor.getPlatform() === 'android';

function resolveClientId(override?: string): string {
  const id = override
    || (import.meta as any).env?.VITE_GOOGLE_WEB_CLIENT_ID
    || (window as any).__GOOGLE_WEB_CLIENT_ID;
  if (!id) throw new Error('Missing VITE_GOOGLE_WEB_CLIENT_ID (Google OAuth Web Client ID).');
  return id as string;
}

export async function signInWithGoogleNative(opts: {
  serverClientId?: string;
  nonce?: string;
  forcePicker?: boolean;
} = {}): Promise<GoogleCredential> {
  if (!isAndroid()) throw new Error('Native Google Sign-In only available on Android');
  const serverClientId = resolveClientId(opts.serverClientId);
  if (opts.forcePicker) {
    return Native.signInWithGoogleButton({ serverClientId, nonce: opts.nonce });
  }
  return Native.signInWithGoogle({
    serverClientId,
    nonce: opts.nonce,
    filterByAuthorized: true,
  });
}

export async function signOutCredentialManager() {
  if (!isAndroid()) return;
  try { await Native.signOut(); } catch { /* no-op */ }
}
