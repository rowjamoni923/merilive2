/**
 * 🗂️ App Settings Cache (Pkg D)
 *
 * Shared in-memory cache + in-flight dedupe for single-key `app_settings` reads.
 *
 * Problem we solve:
 *   ~40 components directly query `from('app_settings').select('setting_value').eq('setting_key', ...).maybeSingle()`
 *   On a single page navigation (Index → LiveStream → PartyRoom) the same keys
 *   (`call_rates`, `gift_commission`) are refetched 3-5 times across mounted
 *   components, each one a network roundtrip + RLS check.
 *
 * What this does:
 *   - Per-key Map cache with 60s TTL
 *   - In-flight Promise dedupe (concurrent callers share one network request)
 *   - Invalidate on `admin-table-update` window event for `app_settings`
 *   - Drop-in replacement for `supabase.from('app_settings').select(...).eq('setting_key', k).maybeSingle()`
 *
 * Returns the raw `setting_value` (jsonb) or null. Callers parse/normalize.
 *
 * NOT a replacement for `useGlobalSettings` — that hook owns the full
 * settings object + cross-table joins. This is for ad-hoc single-key reads.
 */

import { supabase } from '@/integrations/supabase/client';

const TTL_MS = 60_000;

interface CacheEntry {
  value: unknown;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();
let invalidationListenerAttached = false;

function ensureInvalidationListener() {
  if (invalidationListenerAttached || typeof window === 'undefined') return;
  invalidationListenerAttached = true;

  const onAdminUpdate = (event: Event) => {
    const detail = (event as CustomEvent<{ table?: string; payload?: any }>).detail;
    if (!detail || detail.table !== 'app_settings') return;
    // Targeted invalidation if payload exposes the key, otherwise flush all.
    const payloadKey = detail.payload?.setting_key;
    if (typeof payloadKey === 'string' && payloadKey.length > 0) {
      cache.delete(payloadKey);
    } else {
      cache.clear();
    }
  };

  window.addEventListener('admin-table-update', onAdminUpdate);
}

/**
 * Get a single `app_settings.setting_value` by key.
 * Returns the parsed jsonb value or `null` if the row does not exist.
 *
 * @param key   The `setting_key` to fetch.
 * @param opts.maxAgeMs  Optional override for the freshness window (default 60s).
 *                       Pass 0 to force a network fetch.
 */
export async function getAppSetting<T = unknown>(
  key: string,
  opts: { maxAgeMs?: number } = {}
): Promise<T | null> {
  ensureInvalidationListener();

  const maxAge = typeof opts.maxAgeMs === 'number' ? opts.maxAgeMs : TTL_MS;
  const cached = cache.get(key);
  if (cached && maxAge > 0 && Date.now() - cached.fetchedAt < maxAge) {
    return (cached.value as T | null) ?? null;
  }

  const existing = inflight.get(key);
  if (existing) return existing as Promise<T | null>;

  const promise = (async () => {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', key)
        .maybeSingle();
      if (error) throw error;
      const value = (data?.setting_value ?? null) as T | null;
      cache.set(key, { value, fetchedAt: Date.now() });
      return value;
    } catch (err) {
      // Don't poison cache on failure — let the next caller retry.
      console.error('[appSettingsCache] fetch failed for', key, err);
      return null;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise as Promise<T | null>;
}

/**
 * Imperatively invalidate one key or the whole cache.
 * Useful after admin-side mutations where the local writer wants the next
 * read to hit the network immediately.
 */
export function invalidateAppSetting(key?: string) {
  if (key) {
    cache.delete(key);
    inflight.delete(key);
  } else {
    cache.clear();
    inflight.clear();
  }
}
