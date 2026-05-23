import { registerPlugin, Capacitor } from '@capacitor/core';

/**
 * Pkg258 — Keystore-backed AES256-GCM key/value store.
 * Use for refresh tokens, biometric pepper, sensitive flags.
 * Web fallback = localStorage (NOT encrypted) — only enable sensitive
 * writes on native, or treat web as a graceful no-op.
 */
export interface SecureStoragePlugin {
  set(opts: { key: string; value: string }): Promise<void>;
  get(opts: { key: string }): Promise<{ value: string | null }>;
  remove(opts: { key: string }): Promise<void>;
  clear(): Promise<void>;
  keys(): Promise<{ keys: string[] }>;
}

const Native = registerPlugin<SecureStoragePlugin>('SecureStorage');

export const isSecureStorageNative = () => Capacitor.getPlatform() === 'android';

const WEB_PREFIX = 'merilive_secure_kv__';

export async function secureSet(key: string, value: string) {
  if (isSecureStorageNative()) {
    await Native.set({ key, value });
    return;
  }
  try { localStorage.setItem(WEB_PREFIX + key, value); } catch {}
}

export async function secureGet(key: string): Promise<string | null> {
  if (isSecureStorageNative()) {
    try { return (await Native.get({ key })).value; } catch { return null; }
  }
  try { return localStorage.getItem(WEB_PREFIX + key); } catch { return null; }
}

export async function secureRemove(key: string) {
  if (isSecureStorageNative()) {
    try { await Native.remove({ key }); } catch {}
    return;
  }
  try { localStorage.removeItem(WEB_PREFIX + key); } catch {}
}

export async function secureClear() {
  if (isSecureStorageNative()) {
    try { await Native.clear(); } catch {}
    return;
  }
  try {
    Object.keys(localStorage).forEach((k) => {
      if (k.startsWith(WEB_PREFIX)) localStorage.removeItem(k);
    });
  } catch {}
}

export async function secureKeys(): Promise<string[]> {
  if (isSecureStorageNative()) {
    try { return (await Native.keys()).keys; } catch { return []; }
  }
  try {
    return Object.keys(localStorage)
      .filter((k) => k.startsWith(WEB_PREFIX))
      .map((k) => k.slice(WEB_PREFIX.length));
  } catch { return []; }
}
