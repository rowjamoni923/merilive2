/**
 * Pkg430 — useNativeStorage
 *
 * Tiny React hook for cached reads with native SQLite fallback to
 * localStorage. Intended pattern:
 *
 *   const { value, set } = useNativeStorage<Profile>('profiles', userId, 5*60*1000);
 *
 * Cold read returns `null`. Once the native get resolves, `value` updates.
 * Writes go to both the native store (TTL-aware) and the in-memory state
 * so callers see them immediately. Falls back to localStorage when the
 * native plugin isn't available so web/iOS callers still get persistence.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { isStorageNativeEnabled } from '@/utils/storageNativeFlag';
import { nsGetJSON, nsSetJSON, nsRemove } from '@/plugins/NativeStorage';

const LS_PREFIX = 'merilive-ns:';

function lsKey(ns: string, key: string) {
  return `${LS_PREFIX}${ns}:${key}`;
}

function lsRead<T>(ns: string, key: string): T | null {
  try {
    const raw = localStorage.getItem(lsKey(ns, key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { v: T; e: number };
    if (parsed.e && parsed.e < Date.now()) {
      localStorage.removeItem(lsKey(ns, key));
      return null;
    }
    return parsed.v;
  } catch {
    return null;
  }
}

function lsWrite<T>(ns: string, key: string, value: T, ttlMs: number) {
  try {
    const e = ttlMs > 0 ? Date.now() + ttlMs : 0;
    localStorage.setItem(lsKey(ns, key), JSON.stringify({ v: value, e }));
  } catch {
    /* quota ignore */
  }
}

export function useNativeStorage<T>(namespace: string, key: string, ttlMs = 0) {
  const native = isStorageNativeEnabled();
  // Synchronous localStorage seed so the first render isn't always null
  // on web / gated-off Android (matches the Pkg420/421 instant-data spec).
  const seed = useRef<T | null>(native ? null : lsRead<T>(namespace, key));
  const [value, setValue] = useState<T | null>(seed.current);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    (async () => {
      if (native) {
        const v = await nsGetJSON<T>(namespace, key);
        if (!cancelled.current && v != null) setValue(v);
      }
    })();
    return () => { cancelled.current = true; };
  }, [namespace, key, native]);

  const set = useCallback(async (v: T) => {
    setValue(v);
    if (native) await nsSetJSON(namespace, key, v, ttlMs);
    else lsWrite(namespace, key, v, ttlMs);
  }, [namespace, key, ttlMs, native]);

  const clear = useCallback(async () => {
    setValue(null);
    if (native) await nsRemove(namespace, key);
    else { try { localStorage.removeItem(lsKey(namespace, key)); } catch { /* ignore */ } }
  }, [namespace, key, native]);

  return { value, set, clear };
}
