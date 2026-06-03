/**
 * Pkg420 — Zero-refresh instant page data.
 *
 * Drop-in replacement for `useState<T | null>(null)` on pages that fetch
 * server data in `useEffect`. Reads last-known value from localStorage
 * synchronously on mount so the page renders instantly with cached data,
 * while the page's existing `useEffect` quietly refreshes in the background.
 *
 * Usage:
 *   const [profile, setProfile] = usePersistedCache<Profile>(`profile:${userId}`, null);
 *   const [loading, setLoading] = useState(!profile); // skip spinner if cached
 *
 * Combined with the global QueryClient config (refetchOnMount=false,
 * staleTime=2min, placeholderData=prev) this gives users a "no spinner on
 * repeat visit" experience without rewriting 17 large pages to React Query.
 */
import { useCallback, useRef, useState } from 'react';

const PREFIX = 'merilive-pc:';
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

function readCache<T>(key: string): T | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { v: T; t: number };
    if (!parsed || typeof parsed.t !== 'number') return null;
    if (Date.now() - parsed.t > MAX_AGE_MS) return null;
    return parsed.v;
  } catch {
    return null;
  }
}

function writeCache<T>(key: string, value: T | null): void {
  try {
    if (typeof window === 'undefined') return;
    if (value === null || value === undefined) {
      window.localStorage.removeItem(PREFIX + key);
      return;
    }
    window.localStorage.setItem(
      PREFIX + key,
      JSON.stringify({ v: value, t: Date.now() }),
    );
  } catch {
    // quota or private mode — ignore, behaviour degrades to plain useState
  }
}

export function usePersistedCache<T>(
  key: string,
  initial: T | null = null,
): [T | null, (next: T | null | ((prev: T | null) => T | null)) => void, boolean] {
  // Read sync on first render so the very first paint already has data.
  const initialFromCache = useRef<T | null>(readCache<T>(key) ?? initial);
  const [value, setValueState] = useState<T | null>(initialFromCache.current);
  const hadCacheOnMount = useRef<boolean>(initialFromCache.current !== null);

  const setValue = useCallback(
    (next: T | null | ((prev: T | null) => T | null)) => {
      setValueState((prev) => {
        const resolved =
          typeof next === 'function' ? (next as (p: T | null) => T | null)(prev) : next;
        writeCache(key, resolved);
        return resolved;
      });
    },
    [key],
  );

  return [value, setValue, hadCacheOnMount.current];
}
