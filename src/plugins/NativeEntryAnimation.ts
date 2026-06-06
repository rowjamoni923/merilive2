/**
 * Pkg438 — JS bridge for NativeEntryAnimation (Android-only).
 *
 * Native overlay that plays entry-bar banners (user-entered-room,
 * VIP grand entrance, noble entry, level-up) above the WebView via
 * Tencent VAP / Airbnb Lottie / static image with priority queue.
 * Falls through to no-op on web / iOS / older APKs.
 */
import {
  Capacitor,
  registerPlugin,
  type PluginListenerHandle,
} from '@capacitor/core';

export type NativeEntryType = 'vap' | 'lottie' | 'image';

export interface NativeEntryEnqueueOptions {
  id?: string;
  type?: NativeEntryType;
  url: string;
  soundUrl?: string;
  /** Suggested values: noble=400, vip=300, level=lvl, basic=0. Range -1000..1000. */
  priority?: number;
  /** 'top' (default) or 'bottom'. */
  anchor?: 'top' | 'bottom';
  /** Watchdog timeout in ms (default 10000, max 30000). */
  timeoutMs?: number;
}

export interface NativeEntryAnimationPlugin {
  isAvailable(): Promise<{ available: boolean; lottie: boolean }>;
  enqueue(opts: NativeEntryEnqueueOptions): Promise<{ id: string; queued: boolean }>;
  cancel(opts: { id: string }): Promise<{ ok: boolean }>;
  clearAll(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  prefetch(opts: { url: string }): Promise<{ ok: boolean }>;
  addListener(
    event: 'entry:start' | 'entry:complete' | 'entry:error' | 'entry:queued',
    cb: (data: {
      id?: string;
      url?: string;
      type?: string;
      queueSize?: number;
      reason?: string;
      errorMsg?: string;
    }) => void,
  ): Promise<PluginListenerHandle>;
}

const NativeEntryAnimation = registerPlugin<NativeEntryAnimationPlugin>(
  'NativeEntryAnimation',
);

let availabilityCache: boolean | null = null;

export async function isNativeEntryAnimationAvailable(): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return false;
  if (availabilityCache !== null) return availabilityCache;
  try {
    const res = await NativeEntryAnimation.isAvailable();
    availabilityCache = !!res?.available;
  } catch { availabilityCache = false; }
  return availabilityCache;
}

export async function tryEnqueueNativeEntry(
  opts: NativeEntryEnqueueOptions,
): Promise<{ ok: boolean; id?: string }> {
  if (!(await isNativeEntryAnimationAvailable())) return { ok: false };
  try {
    const res = await NativeEntryAnimation.enqueue(opts);
    return { ok: !!res?.queued, id: res?.id };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[NativeEntryAnimation] enqueue failed', err);
    return { ok: false };
  }
}

export async function tryPrefetchNativeEntry(url: string): Promise<void> {
  if (!(await isNativeEntryAnimationAvailable())) return;
  try { await NativeEntryAnimation.prefetch({ url }); } catch { /* best-effort */ }
}

export async function cancelNativeEntry(id: string): Promise<boolean> {
  if (!(await isNativeEntryAnimationAvailable())) return false;
  try { return !!(await NativeEntryAnimation.cancel({ id }))?.ok; } catch { return false; }
}

export async function clearAllNativeEntries(): Promise<void> {
  if (!(await isNativeEntryAnimationAvailable())) return;
  try { await NativeEntryAnimation.clearAll(); } catch { /* ignore */ }
}

export default NativeEntryAnimation;
