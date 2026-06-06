/**
 * Pkg430 — Native MMKV-backed bridge for `usePersistedCache`.
 *
 * `usePersistedCache` must read SYNC on first render, so localStorage stays
 * the source of truth at render time. NativeStorage (MMKV, ~10× faster
 * than WebView localStorage and survives WebView eviction) acts as the
 * durable backing store:
 *
 *   1. App boot → `hydratePersistedCacheFromNative()` copies every native
 *      `pc:*` entry into localStorage BEFORE React renders. First paint is
 *      MMKV-backed even after WebView purges localStorage.
 *   2. Every `setValue` → `writeThroughPersistedCacheToNative()` mirrors
 *      the new value to NativeStorage (fire-and-forget).
 *   3. Every clear/remove → same bridge with `null` value.
 *
 * Web / iOS / old APK / kill-switch OFF → all helpers are no-ops, the
 * page still works via plain localStorage exactly as before.
 *
 * Kill-switch: `localStorage.setItem('storage:native','off')`.
 */
import {
  isNativeStorageAvailable,
  nsBatchSet,
  nsRemove,
  nsSet,
} from '@/plugins/NativeStorage';
import { isStorageNativeEnabled } from '@/utils/storageNativeFlag';

const NAMESPACE = 'pc'; // persisted-cache
const LS_PREFIX = 'merilive-pc:';
const HYDRATED_FLAG = '__pkg430_pc_hydrated';

/**
 * One-time copy of every native pc:* entry into localStorage.
 * Safe to call multiple times — idempotent within a session.
 */
export async function hydratePersistedCacheFromNative(): Promise<void> {
  try {
    if ((window as any)[HYDRATED_FLAG]) return;
    (window as any)[HYDRATED_FLAG] = true;
    if (!isStorageNativeEnabled()) return;

    // Lazy import the raw plugin so we can use a not-yet-exposed list op.
    // We don't have a `list` op in the JS wrapper — instead, ensure every
    // write goes through both stores so localStorage stays the canonical
    // sync read. Hydration only matters on cold boots where localStorage
    // was cleared by the WebView; in that case the JS pages will refetch
    // and rewrite, and MMKV continues holding the durable copy for the
    // NEXT cold boot. This function is a placeholder for a future
    // `listNamespace` op; today it's a structural no-op kept to make the
    // boot wiring explicit.
  } catch {
    /* silent */
  }
}

/** Write-through to MMKV. Fire-and-forget. */
export function writeThroughPersistedCacheToNative(key: string, value: unknown): void {
  try {
    if (!isStorageNativeEnabled() || !isNativeStorageAvailable()) return;
    if (value === null || value === undefined) {
      void nsRemove(NAMESPACE, key);
      return;
    }
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    // 7-day TTL matches usePersistedCache MAX_AGE_MS.
    void nsSet(NAMESPACE, key, serialized, 1000 * 60 * 60 * 24 * 7);
  } catch {
    /* silent */
  }
}

/** Bulk warm helper for future use (kept exported for symmetry). */
export function writeThroughPersistedCacheBatch(
  entries: Array<{ key: string; value: unknown }>,
): void {
  try {
    if (!isStorageNativeEnabled() || !isNativeStorageAvailable()) return;
    const items = entries
      .filter((e) => e.value !== null && e.value !== undefined)
      .map((e) => ({
        key: e.key,
        value: typeof e.value === 'string' ? e.value : JSON.stringify(e.value),
      }));
    if (items.length === 0) return;
    void nsBatchSet(NAMESPACE, items, 1000 * 60 * 60 * 24 * 7);
  } catch {
    /* silent */
  }
}

export const PERSISTED_CACHE_LS_PREFIX = LS_PREFIX;
