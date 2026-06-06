/**
 * Pkg430 — NativeStorage JS bridge
 *
 * Thin typed wrapper around the Android NativeStoragePlugin. On any
 * platform without the native plugin (web, iOS, older APK, gated-off)
 * every method is a graceful no-op / cache-miss so callers never need
 * platform branches. Pair with `storageNativeFlag` for kill-switching.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

export interface NativeStorageBatchItem {
  key: string;
  value: string;
}

export interface NativeStoragePlugin {
  set(opts: { namespace: string; key: string; value: string; ttlMs?: number }): Promise<void>;
  get(opts: { namespace: string; key: string }): Promise<{ hit: boolean; value?: string; expires?: number }>;
  remove(opts: { namespace: string; key: string }): Promise<void>;
  clearNamespace(opts: { namespace: string }): Promise<{ deleted: number }>;
  batchSet(opts: { namespace: string; items: NativeStorageBatchItem[]; ttlMs?: number }): Promise<void>;
  batchGet(opts: { namespace: string; keys: string[] }): Promise<{ items: Array<{ key: string; value: string; expires: number }> }>;
  evictExpired(): Promise<{ deleted: number }>;
  stats(): Promise<{ rows: number; sizeBytes: number; version: number }>;
  clearAll(): Promise<{ deleted: number }>;
}

const Native = registerPlugin<NativeStoragePlugin>('NativeStorage');

export const isNativeStorageAvailable = (): boolean =>
  Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('NativeStorage');

// ---------------- safe wrappers ----------------

export async function nsSet(namespace: string, key: string, value: string, ttlMs = 0): Promise<void> {
  if (!isNativeStorageAvailable()) return;
  try { await Native.set({ namespace, key, value, ttlMs }); } catch { /* silent */ }
}

export async function nsSetJSON(namespace: string, key: string, value: unknown, ttlMs = 0): Promise<void> {
  try { await nsSet(namespace, key, JSON.stringify(value), ttlMs); } catch { /* silent */ }
}

export async function nsGet(namespace: string, key: string): Promise<string | null> {
  if (!isNativeStorageAvailable()) return null;
  try {
    const r = await Native.get({ namespace, key });
    return r.hit && typeof r.value === 'string' ? r.value : null;
  } catch { return null; }
}

export async function nsGetJSON<T = unknown>(namespace: string, key: string): Promise<T | null> {
  const raw = await nsGet(namespace, key);
  if (raw == null) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

export async function nsRemove(namespace: string, key: string): Promise<void> {
  if (!isNativeStorageAvailable()) return;
  try { await Native.remove({ namespace, key }); } catch { /* silent */ }
}

export async function nsClearNamespace(namespace: string): Promise<number> {
  if (!isNativeStorageAvailable()) return 0;
  try { return (await Native.clearNamespace({ namespace })).deleted ?? 0; } catch { return 0; }
}

export async function nsBatchSet(namespace: string, items: NativeStorageBatchItem[], ttlMs = 0): Promise<void> {
  if (!isNativeStorageAvailable() || items.length === 0) return;
  try { await Native.batchSet({ namespace, items, ttlMs }); } catch { /* silent */ }
}

export async function nsBatchGet(namespace: string, keys: string[]): Promise<Record<string, string>> {
  if (!isNativeStorageAvailable() || keys.length === 0) return {};
  try {
    const r = await Native.batchGet({ namespace, keys });
    const out: Record<string, string> = {};
    for (const it of r.items ?? []) out[it.key] = it.value;
    return out;
  } catch { return {}; }
}

export async function nsEvictExpired(): Promise<number> {
  if (!isNativeStorageAvailable()) return 0;
  try { return (await Native.evictExpired()).deleted ?? 0; } catch { return 0; }
}

export async function nsStats(): Promise<{ rows: number; sizeBytes: number; version: number } | null> {
  if (!isNativeStorageAvailable()) return null;
  try { return await Native.stats(); } catch { return null; }
}

export async function nsClearAll(): Promise<number> {
  if (!isNativeStorageAvailable()) return 0;
  try { return (await Native.clearAll()).deleted ?? 0; } catch { return 0; }
}

export default Native;
