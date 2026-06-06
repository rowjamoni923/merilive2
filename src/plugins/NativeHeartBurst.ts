/**
 * Pkg438 Phase C — JS bridge for NativeHeartBurst (Android-only).
 *
 * Renders animated heart sprites above the WebView at a touch point
 * for the Reels double-tap like gesture. Decoration only — the React
 * `handleLike` call is independent and stays in Reels.tsx.
 *
 * No-op on web / iOS / older APKs.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

export interface NativeHeartBurstPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  burst(opts: { x: number; y: number; count?: number; size?: number }): Promise<{ ok: boolean }>;
  clear(): Promise<void>;
}

const NativeHeartBurst = registerPlugin<NativeHeartBurstPlugin>('NativeHeartBurst');

let availabilityCache: boolean | null = null;

export async function isNativeHeartBurstAvailable(): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return false;
  if (availabilityCache !== null) return availabilityCache;
  try {
    const res = await NativeHeartBurst.isAvailable();
    availabilityCache = !!res?.available;
  } catch { availabilityCache = false; }
  return availabilityCache;
}

export async function tryHeartBurst(
  x: number,
  y: number,
  opts: { count?: number; size?: number } = {},
): Promise<boolean> {
  if (!(await isNativeHeartBurstAvailable())) return false;
  try {
    await NativeHeartBurst.burst({ x, y, count: opts.count ?? 6, size: opts.size ?? 64 });
    return true;
  } catch { return false; }
}

export default NativeHeartBurst;
