/**
 * Pkg72: LiveKit DataChannel Foundation
 *
 * Pure (non-React) helpers for the LiveKit signaling migration:
 *  - JSON envelope format (versioned, dedupe-able)
 *  - Per-feature kill-switch reader (cached, instant rollback)
 *  - 400ms client-side dedupe cache (matches Pkg38 cost guard)
 *
 * NO Supabase Realtime usage here. NO setInterval. NO cross-user profile reads.
 * Money/audit must ALWAYS go through a Supabase RPC FIRST — this lib only
 * broadcasts already-persisted truth.
 */
import { supabase } from '@/integrations/supabase/client';

export type LiveKitFeature =
  | 'call'
  | 'live'
  | 'party'
  | 'gift'
  | 'chat'
  | 'presence'
  | 'game'
  | 'pk';

export interface SignalEnvelope<T = unknown> {
  /** Envelope version — bump when shape changes. */
  v: 1;
  /** Feature scope (matches kill-switch key). */
  f: LiveKitFeature;
  /** Message type within the feature (e.g. 'gift', 'mute', 'seat_join'). */
  t: string;
  /** Unix ms when sender created the message. */
  ts: number;
  /** Stable id for dedupe across reconnect / multi-publish. */
  id: string;
  /** Sender's auth user id (server-trusted via JWT at room join). */
  s?: string;
  /** Feature-specific payload. */
  p: T;
}

// ─── Kill-switch reader ───────────────────────────────────────────────────
// Cached for 10s so we never thrash the DB. Pkg37 admin_broadcast push
// will invalidate via window event when admin flips a key.

const KILL_SWITCH_TTL_MS = 10_000;
const DEFAULT_FLAGS: Record<LiveKitFeature, boolean> = {
  call: true,
  live: true,
  party: true,
  gift: true,
  chat: true,
  presence: true,
  game: true,
  pk: true,
};

let cachedFlags: Record<LiveKitFeature, boolean> | null = null;
let cachedAt = 0;
let inFlight: Promise<Record<LiveKitFeature, boolean>> | null = null;

async function fetchFlags(): Promise<Record<LiveKitFeature, boolean>> {
  try {
    const { data } = await supabase
      .from('app_settings')
      .select('setting_value')
      .eq('setting_key', 'livekit_signaling_enabled')
      .maybeSingle();

    const raw = (data?.setting_value ?? '').toString().trim();
    if (!raw) return { ...DEFAULT_FLAGS };

    const parsed = JSON.parse(raw);
    return {
      call: parsed.call !== false,
      live: parsed.live !== false,
      party: parsed.party !== false,
      gift: parsed.gift !== false,
      chat: parsed.chat !== false,
      presence: parsed.presence !== false,
      game: parsed.game !== false,
      pk: parsed.pk !== false,
    };
  } catch {
    return { ...DEFAULT_FLAGS };
  }
}

export async function getLiveKitFlags(): Promise<Record<LiveKitFeature, boolean>> {
  const now = Date.now();
  if (cachedFlags && now - cachedAt < KILL_SWITCH_TTL_MS) return cachedFlags;
  if (inFlight) return inFlight;

  inFlight = fetchFlags()
    .then((flags) => {
      cachedFlags = flags;
      cachedAt = Date.now();
      return flags;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** Synchronous check — returns last-known value (defaults to ON). */
export function isLiveKitEnabledSync(feature: LiveKitFeature): boolean {
  if (!cachedFlags) {
    // Fire-and-forget warmup; until first fetch returns we default to ON
    // (parity with the new path; if the server returns OFF the next call
    // will see it within KILL_SWITCH_TTL_MS).
    void getLiveKitFlags();
    return true;
  }
  return cachedFlags[feature] !== false;
}

export async function isLiveKitEnabled(feature: LiveKitFeature): Promise<boolean> {
  const flags = await getLiveKitFlags();
  return flags[feature] !== false;
}

/** Force-invalidate the cache — called by Pkg37 admin_broadcast push. */
export function invalidateLiveKitFlags() {
  cachedFlags = null;
  cachedAt = 0;
}

if (typeof window !== 'undefined') {
  // Pkg37/52/53 admin_broadcast singleton dispatches `admin-table-update`
  // with detail.table = the changed table. Invalidate only when app_settings
  // changes so an admin kill-switch flip propagates within ~1s.
  window.addEventListener('admin-table-update', (ev: Event) => {
    const detail = (ev as CustomEvent<{ table?: string }>).detail;
    if (detail?.table === 'app_settings') invalidateLiveKitFlags();
  });
}

// ─── Envelope helpers ─────────────────────────────────────────────────────

let envelopeSeq = 0;
function nextId() {
  envelopeSeq = (envelopeSeq + 1) % 1_000_000;
  return `${Date.now().toString(36)}-${envelopeSeq.toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export function buildEnvelope<T>(
  feature: LiveKitFeature,
  type: string,
  payload: T,
  senderId?: string,
): SignalEnvelope<T> {
  return {
    v: 1,
    f: feature,
    t: type,
    ts: Date.now(),
    id: nextId(),
    s: senderId,
    p: payload,
  };
}

export function encodeEnvelope(env: SignalEnvelope): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(env));
}

export function decodeEnvelope(bytes: Uint8Array): SignalEnvelope | null {
  try {
    const text = new TextDecoder().decode(bytes);
    const obj = JSON.parse(text);
    if (
      obj &&
      obj.v === 1 &&
      typeof obj.f === 'string' &&
      typeof obj.t === 'string' &&
      typeof obj.id === 'string' &&
      typeof obj.ts === 'number'
    ) {
      return obj as SignalEnvelope;
    }
    return null;
  } catch {
    return null;
  }
}

// ─── 400ms dedupe cache (matches Pkg38 client guard) ──────────────────────

const DEDUPE_WINDOW_MS = 400;
const dedupeCache = new Map<string, number>();

/** Returns true if this envelope id was already seen within the dedupe window. */
export function isDuplicateEnvelope(id: string): boolean {
  const now = Date.now();
  const seen = dedupeCache.get(id);
  if (seen && now - seen < DEDUPE_WINDOW_MS) return true;
  dedupeCache.set(id, now);

  // Light GC: every 200 inserts, prune entries older than the window.
  if (dedupeCache.size > 200) {
    for (const [k, t] of dedupeCache) {
      if (now - t >= DEDUPE_WINDOW_MS) dedupeCache.delete(k);
    }
  }
  return false;
}

export const __test = {
  DEFAULT_FLAGS,
  DEDUPE_WINDOW_MS,
  KILL_SWITCH_TTL_MS,
};
