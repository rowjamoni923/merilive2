/**
 * Pkg426 — JS bridge for native Android VAP (Tencent Video Animation Player).
 *
 * Drop-in companion to NativeSVGA.ts. Works for full-screen alpha-MP4 gift /
 * entry animations. ADDITIVE: nothing in the existing animation pipeline
 * imports this file — wiring is Phase 2.
 *
 * Falls through gracefully when:
 *   - running in Lovable web preview (Capacitor.isNativePlatform() === false)
 *   - running on iOS (plugin not yet registered for iOS)
 *   - older APK that pre-dates Pkg426 (Class.forName check returns false)
 *   - feature flag is OFF (see src/utils/vapNativeFlag.ts)
 *
 * In every fallback case, callers should use their existing WebView VAP
 * path (VAPPlayer.tsx / EntryVAPPlayer.tsx) — there is no degradation.
 */

import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface NativeVAPPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  play(opts: {
    url: string;
    loop?: number; // 0 = infinite, n = repeat count (default 1)
    fillScreen?: boolean;
    scaleMode?: 'fitCenter' | 'centerCrop' | 'fitXY';
  }): Promise<{ ok: boolean }>;
  stop(): Promise<void>;
  prefetch(opts: { url: string }): Promise<{ ok: boolean }>;
  addListener(
    event: 'vap:start' | 'vap:complete' | 'vap:error',
    cb: (data: { url: string; errorType?: number; errorMsg?: string }) => void,
  ): Promise<PluginListenerHandle>;
}

const NativeVAP = registerPlugin<NativeVAPPlugin>('NativeVAP');

let availabilityCache: boolean | null = null;

export async function isNativeVAPAvailable(): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return false;
  if (availabilityCache !== null) return availabilityCache;
  try {
    const res = await NativeVAP.isAvailable();
    availabilityCache = !!res?.available;
  } catch {
    availabilityCache = false;
  }
  return availabilityCache;
}

/**
 * Safe wrapper: prefetch + play with timeout. Returns true on success,
 * false on any failure so the caller can immediately fall back to
 * WebView VAP without further error handling.
 */
export async function tryNativeVAPPlay(opts: {
  url: string;
  loop?: number;
  fillScreen?: boolean;
  scaleMode?: 'fitCenter' | 'centerCrop' | 'fitXY';
  timeoutMs?: number;
}): Promise<boolean> {
  if (!(await isNativeVAPAvailable())) return false;
  try {
    const timeout = opts.timeoutMs ?? 3000;
    const racing = Promise.race([
      NativeVAP.play(opts),
      new Promise<{ ok: boolean }>((_, reject) =>
        setTimeout(() => reject(new Error('native vap timeout')), timeout),
      ),
    ]);
    const res = await racing;
    return !!res?.ok;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[NativeVAP] play failed, fallback to WebView VAP', err);
    return false;
  }
}

export async function tryNativeVAPPrefetch(url: string): Promise<void> {
  if (!(await isNativeVAPAvailable())) return;
  try {
    await NativeVAP.prefetch({ url });
  } catch {
    /* warmup is best-effort */
  }
}

export async function stopNativeVAP(): Promise<void> {
  if (!(await isNativeVAPAvailable())) return;
  try {
    await NativeVAP.stop();
  } catch {
    /* ignore */
  }
}

export default NativeVAP;
