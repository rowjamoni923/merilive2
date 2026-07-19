/**
 * Pkg427 — JS bridge for native Android Reels Player (ExoPlayer / Media3).
 *
 * Drop-in companion to NativeVAP.ts. Replaces the WebView <video> tag in
 * Reels.tsx with a hardware-accelerated ExoPlayer surface for buttery-
 * smooth full-screen reels. ADDITIVE — Reels.tsx only switches to this
 * path when `reelsNativeFlag` resolves true; otherwise it keeps the
 * existing <video> path byte-for-byte.
 *
 * Falls through gracefully when:
 *   - running in Lovable web preview (Capacitor.isNativePlatform() === false)
 *   - running on iOS (plugin not yet registered for iOS)
 *   - older APK that pre-dates Pkg427 (Class.forName check returns false)
 *   - feature flag is OFF (see src/utils/reelsNativeFlag.ts)
 */

import {
  Capacitor,
  registerPlugin,
  type PluginListenerHandle,
} from '@capacitor/core';

export interface NativeReelsPlayerPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  play(opts: {
    url: string;
    muted?: boolean;
    loop?: boolean;
    autoplay?: boolean;
  }): Promise<{ ok: boolean }>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  setMuted(opts: { muted: boolean }): Promise<void>;
  seek(opts: { positionMs: number }): Promise<void>;
  stop(): Promise<void>;
  dispose(): Promise<void>;
  prefetch(opts: { url: string; bytes?: number }): Promise<{ ok: boolean; url?: string }>;
  prefetchBatch(opts: {
    urls: string[];
    bytesPerUrl?: number;
  }): Promise<{ ok: boolean; queued: number }>;
  cancelPrefetch(): Promise<{ ok: boolean }>;
  cacheStats(): Promise<{ bytes: number; maxBytes: number }>;
  addListener(
    event: 'reel:ready' | 'reel:complete' | 'reel:error' | 'reel:playing',
    cb: (data: {
      durationMs?: number;
      isPlaying?: boolean;
      errorCode?: number;
      errorMsg?: string;
    }) => void,
  ): Promise<PluginListenerHandle>;
}

const NativeReelsPlayer = registerPlugin<NativeReelsPlayerPlugin>(
  'NativeReelsPlayer',
);

let availabilityCache: boolean | null = null;

export async function isNativeReelsPlayerAvailable(): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    return false;
  }
  if (availabilityCache !== null) return availabilityCache;
  try {
    const res = await NativeReelsPlayer.isAvailable();
    availabilityCache = !!res?.available;
  } catch {
    availabilityCache = false;
  }
  return availabilityCache;
}

export async function tryNativeReelsPlay(opts: {
  url: string;
  muted?: boolean;
  loop?: boolean;
  autoplay?: boolean;
  timeoutMs?: number;
}): Promise<boolean> {
  if (!(await isNativeReelsPlayerAvailable())) return false;
  try {
    const timeout = opts.timeoutMs ?? 3000;
    const racing = Promise.race([
      NativeReelsPlayer.play(opts),
      new Promise<{ ok: boolean }>((_, reject) =>
        setTimeout(() => reject(new Error('native reels timeout')), timeout),
      ),
    ]);
    const res = await racing;
    return !!res?.ok;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[NativeReelsPlayer] play failed, fallback to <video>', err);
    return false;
  }
}

export async function tryNativeReelsPrefetch(
  url: string,
  bytes?: number,
): Promise<void> {
  if (!(await isNativeReelsPlayerAvailable())) return;
  try {
    await NativeReelsPlayer.prefetch({ url, bytes });
  } catch {
    /* warmup is best-effort */
  }
}

/**
 * Pkg435 — Queue a batch of upcoming reel URLs for background warming.
 * Cancels any in-flight batch first (latest scroll position wins) and
 * skips URLs that are already fully cached. Best-effort, no-throw.
 */
export async function tryNativeReelsPrefetchBatch(
  urls: string[],
  bytesPerUrl?: number,
): Promise<{ ok: boolean; queued: number }> {
  if (!urls?.length) return { ok: false, queued: 0 };
  if (!(await isNativeReelsPlayerAvailable())) return { ok: false, queued: 0 };
  try {
    const res = await NativeReelsPlayer.prefetchBatch({ urls, bytesPerUrl });
    return { ok: !!res?.ok, queued: Number(res?.queued ?? 0) };
  } catch {
    return { ok: false, queued: 0 };
  }
}

export async function cancelNativeReelsPrefetch(): Promise<void> {
  if (!(await isNativeReelsPlayerAvailable())) return;
  try {
    await NativeReelsPlayer.cancelPrefetch();
  } catch {
    /* ignore */
  }
}

export async function getNativeReelsCacheStats(): Promise<
  { bytes: number; maxBytes: number } | null
> {
  if (!(await isNativeReelsPlayerAvailable())) return null;
  try {
    const res = await NativeReelsPlayer.cacheStats();
    return { bytes: Number(res?.bytes ?? 0), maxBytes: Number(res?.maxBytes ?? 0) };
  } catch {
    return null;
  }
}

export async function stopNativeReels(): Promise<void> {
  if (!(await isNativeReelsPlayerAvailable())) return;
  try {
    await NativeReelsPlayer.stop();
  } catch {
    /* ignore */
  }
}

export async function disposeNativeReels(): Promise<void> {
  if (!(await isNativeReelsPlayerAvailable())) return;
  try {
    await NativeReelsPlayer.dispose();
  } catch {
    /* ignore */
  }
}

export default NativeReelsPlayer;
