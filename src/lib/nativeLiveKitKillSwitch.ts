/**
 * nativeLiveKitKillSwitch — module-level cache + admin-broadcast sync
 * for the admin-controlled `app_settings.native_livekit_enabled` flag.
 *
 * Default = ENABLED. Admin can flip the flag in app_settings to instantly
 * disable the native Android LiveKit publish path across all clients
 * without a redeploy. Web/iOS callers ignore this entirely (the platform
 * gate short-circuits first).
 *
 * Lazy initialization: first call to `getNativeLiveKitKillSwitch()` kicks
 * off a one-shot fetch + Pkg37 admin-broadcast listener. Until the fetch resolves
 * we return `true` (fail-open) so we never block native sessions on
 * settings load latency.
 */
import { supabase } from '@/integrations/supabase/client';

const SETTING_KEY = 'native_livekit_enabled';

let cachedEnabled = true; // fail-open default
let initialized = false;
let initPromise: Promise<void> | null = null;

function parseSettingValue(raw: unknown): boolean {
  if (raw === null || raw === undefined) return true;
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return raw !== 0;
  if (typeof raw === 'string') {
    const v = raw.trim().toLowerCase();
    if (v === 'false' || v === '0' || v === 'off' || v === 'disabled') return false;
    return true;
  }
  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if ('enabled' in obj) return parseSettingValue(obj.enabled);
    if ('value' in obj) return parseSettingValue(obj.value);
  }
  return true;
}

async function fetchOnce(): Promise<void> {
  try {
    const { data } = await supabase
      .from('app_settings')
      .select('setting_value')
      .eq('setting_key', SETTING_KEY)
      .maybeSingle();
    if (data) cachedEnabled = parseSettingValue((data as { setting_value: unknown }).setting_value);
  } catch {
    // network/RLS error → keep fail-open default
  }
}

function subscribe(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('admin-table-update', (event) => {
    const table = (event as CustomEvent<{ table?: string }>).detail?.table;
    if (!table || table === 'app_settings') void fetchOnce();
  });
}

function ensureInit(): void {
  if (initialized) return;
  initialized = true;
  initPromise = fetchOnce().then(subscribe);
}

/** Synchronous getter used by the gate. Triggers lazy init on first call. */
export function getNativeLiveKitKillSwitch(): boolean {
  ensureInit();
  return cachedEnabled;
}

/** Optional: await this if a caller wants the first DB fetch to complete. */
export function whenNativeLiveKitKillSwitchReady(): Promise<void> {
  ensureInit();
  return initPromise ?? Promise.resolve();
}
