/**
 * Pkg425 — JS bridge for native Android SVGA player.
 *
 * Falls through gracefully when:
 *   - running in web preview (Capacitor.isNativePlatform() === false)
 *   - running on iOS (plugin not yet registered for iOS)
 *   - native plugin not available in the installed APK (older build before Pkg425 rebuild)
 *
 * In all fallback cases, the web `SVGAPlayer.tsx` continues to work — there
 * is no degradation, only an upgrade for users on the new APK.
 */

import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface NativeSVGAPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  play(opts: { url: string; loop?: boolean; fillScreen?: boolean }): Promise<{ ok: boolean }>;
  stop(): Promise<void>;
  addListener(
    event: 'svga:complete',
    cb: (data: { url: string }) => void,
  ): Promise<PluginListenerHandle>;
}

const NativeSVGA = registerPlugin<NativeSVGAPlugin>('NativeSVGA');

let availabilityCache: boolean | null = null;

export async function isNativeSVGAAvailable(): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return false;
  if (availabilityCache !== null) return availabilityCache;
  try {
    const res = await NativeSVGA.isAvailable();
    availabilityCache = !!res?.available;
  } catch {
    availabilityCache = false;
  }
  return availabilityCache;
}

export default NativeSVGA;
