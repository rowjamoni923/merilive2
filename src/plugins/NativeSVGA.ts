/**
 * Pkg425 — JS bridge for native Android SVGA player.
 * 
 * Extended in Pkg436 with disk caching and batch prefetching.
 */

import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface NativeSVGAPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  play(opts: { url: string; loop?: boolean; fillScreen?: boolean }): Promise<{ ok: boolean }>;
  stop(): Promise<void>;
  prefetch(opts: { url: string }): Promise<{ ok: boolean }>;
  prefetchBatch(opts: { urls: string[] }): Promise<{ ok: boolean }>;
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
