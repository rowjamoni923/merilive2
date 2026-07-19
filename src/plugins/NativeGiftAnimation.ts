/**
 * Pkg438 — JS bridge for NativeGiftAnimation (Android-only).
 *
 * Unified professional native overlay that plays VAP / SVGA / Lottie /
 * MP4 / image gifts above the WebView with a priority queue, audio
 * mixer, and lifecycle management. Falls through to no-op on web / iOS
 * / older APKs (caller should keep the existing WebView path).
 */
import {
  Capacitor,
  registerPlugin,
  type PluginListenerHandle,
} from '@capacitor/core';

export type NativeGiftType = 'vap' | 'svga' | 'lottie' | 'mp4' | 'image';

export interface NativeGiftEnqueueOptions {
  /** Stable id; defaults to a random uuid. Used by `cancel`. */
  id?: string;
  /** Media type. Auto-inferred from URL extension when omitted. */
  type?: NativeGiftType;
  /** Asset URL (remote https or `file://` already on disk). */
  url: string;
  /** Optional gift sound URL — routed through the shared GiftAudioMixer. */
  soundUrl?: string;
  /** Coin value (drives priority ordering when ties on `priority`). */
  diamonds?: number;
  /** Higher wins (default 0). Range -1000..1000. */
  priority?: number;
  /** Watchdog timeout in ms (default 12000, max 60000). */
  timeoutMs?: number;
}

export interface NativeGiftAnimationPlugin {
  isAvailable(): Promise<{
    available: boolean;
    svga: boolean;
    lottie: boolean;
    maxConcurrent: number;
  }>;
  enqueue(opts: NativeGiftEnqueueOptions): Promise<{ id: string; queued: boolean }>;
  cancel(opts: { id: string }): Promise<{ ok: boolean }>;
  clearAll(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  prefetch(opts: { url: string }): Promise<{ ok: boolean }>;
  prefetchBatch(opts: { urls: string[] }): Promise<{ ok: boolean; queued: number }>;
  stats(): Promise<{
    queued: number;
    active: number;
    paused: boolean;
    cacheBytes: number;
  }>;
  addListener(
    event: 'gift:start' | 'gift:complete' | 'gift:error' | 'gift:queued',
    cb: (data: {
      id?: string;
      url?: string;
      type?: string;
      queueSize?: number;
      errorMsg?: string;
    }) => void,
  ): Promise<PluginListenerHandle>;
}

const NativeGiftAnimation = registerPlugin<NativeGiftAnimationPlugin>(
  'NativeGiftAnimation',
);

let availabilityCache: { ok: boolean; meta?: any } | null = null;

export async function isNativeGiftAnimationAvailable(): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return false;
  if (availabilityCache) return availabilityCache.ok;
  try {
    const res = await NativeGiftAnimation.isAvailable();
    availabilityCache = { ok: !!res?.available, meta: res };
  } catch {
    availabilityCache = { ok: false };
  }
  return availabilityCache.ok;
}

export async function tryEnqueueNativeGift(
  opts: NativeGiftEnqueueOptions,
): Promise<{ ok: boolean; id?: string }> {
  if (!(await isNativeGiftAnimationAvailable())) return { ok: false };
  try {
    const res = await NativeGiftAnimation.enqueue(opts);
    return { ok: !!res?.queued, id: res?.id };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[NativeGiftAnimation] enqueue failed', err);
    return { ok: false };
  }
}

export async function tryPrefetchNativeGift(url: string): Promise<void> {
  if (!(await isNativeGiftAnimationAvailable())) return;
  try { await NativeGiftAnimation.prefetch({ url }); } catch { /* best-effort */ }
}

export async function tryPrefetchNativeGiftBatch(urls: string[]): Promise<number> {
  if (!urls?.length) return 0;
  if (!(await isNativeGiftAnimationAvailable())) return 0;
  try {
    const res = await NativeGiftAnimation.prefetchBatch({ urls });
    return Number(res?.queued ?? 0);
  } catch { return 0; }
}

export async function cancelNativeGift(id: string): Promise<boolean> {
  if (!(await isNativeGiftAnimationAvailable())) return false;
  try { return !!(await NativeGiftAnimation.cancel({ id }))?.ok; } catch { return false; }
}

export async function clearAllNativeGifts(): Promise<void> {
  if (!(await isNativeGiftAnimationAvailable())) return;
  try { await NativeGiftAnimation.clearAll(); } catch { /* ignore */ }
}

export default NativeGiftAnimation;
