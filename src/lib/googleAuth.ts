/**
 * Pkg251 — Sign in with Google via Credential Manager → Supabase.
 *
 * Returns { user, error }. Caller handles UI.
 *
 * Nonce is generated client-side; Supabase passes it through and Google
 * signs it into the JWT, mitigating replay.
 */
import { signInWithGoogleNative, signOutCredentialManager } from '@/lib/credentialManager';
import { supabase } from '@/integrations/supabase/client';

function randomNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function signInWithGoogleSupabase(opts: { forcePicker?: boolean } = {}) {
  const rawNonce = randomNonce();
  const hashedNonce = await sha256Hex(rawNonce);
  const cred = await signInWithGoogleNative({ nonce: hashedNonce, forcePicker: opts.forcePicker });
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: cred.idToken,
    nonce: rawNonce,
  });
  return { data, error, profile: cred };
}

export async function signOutGoogleAll() {
  await Promise.allSettled([
    signOutCredentialManager(),
    supabase.auth.signOut(),
  ]);
}
