/**
 * GPUPixelBeauty — Pkg200 JS bridge for the native GPUPixel plugin (Android).
 *
 * On web the calls are no-ops so the same React code runs in browser preview
 * and in the installed APK. On Android they round-trip to the Kotlin plugin
 * which drives the C++ GPU beauty engine.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

export interface GPUPixelBeautyPlugin {
  init(): Promise<{ ok: boolean; alreadyInitialized?: boolean }>;
  setSmooth(o: { level: number }): Promise<void>;
  setWhite(o: { level: number }): Promise<void>;
  setThinFace(o: { level: number }): Promise<void>;
  setBigEye(o: { level: number }): Promise<void>;
  setLipstick(o: { level: number }): Promise<void>;
  setBlusher(o: { level: number }): Promise<void>;
  setEnabled(o: { enabled: boolean }): Promise<{ enabled: boolean }>;
  dispose(): Promise<void>;
}

const noop = async () => undefined as unknown as void;
const fallback: GPUPixelBeautyPlugin = {
  init: async () => ({ ok: false }),
  setSmooth: noop,
  setWhite: noop,
  setThinFace: noop,
  setBigEye: noop,
  setLipstick: noop,
  setBlusher: noop,
  setEnabled: async (o) => ({ enabled: o.enabled }),
  dispose: noop,
};

export const isNativeBeautyAvailable = () =>
  Capacitor.getPlatform() === 'android';

export const GPUPixelBeauty: GPUPixelBeautyPlugin = isNativeBeautyAvailable()
  ? registerPlugin<GPUPixelBeautyPlugin>('GPUPixelBeauty', { web: fallback })
  : fallback;

export interface ProBeautyLevels {
  smooth: number;   // 0..10
  white: number;
  thinFace: number;
  bigEye: number;
  lipstick: number;
  blusher: number;
}

export const DEFAULT_PRO_BEAUTY: ProBeautyLevels = {
  smooth: 6,
  white: 4,
  thinFace: 3,
  bigEye: 3,
  lipstick: 0,
  blusher: 0,
};

let initialized = false;
export async function ensureBeautyInit(): Promise<boolean> {
  if (!isNativeBeautyAvailable()) return false;
  if (initialized) return true;
  try {
    const r = await GPUPixelBeauty.init();
    initialized = !!r?.ok || !!r?.alreadyInitialized;
    return initialized;
  } catch {
    return false;
  }
}

export async function applyProBeauty(levels: ProBeautyLevels) {
  if (!isNativeBeautyAvailable()) return;
  await ensureBeautyInit();
  try {
    await Promise.all([
      GPUPixelBeauty.setSmooth({ level: levels.smooth }),
      GPUPixelBeauty.setWhite({ level: levels.white }),
      GPUPixelBeauty.setThinFace({ level: levels.thinFace }),
      GPUPixelBeauty.setBigEye({ level: levels.bigEye }),
      GPUPixelBeauty.setLipstick({ level: levels.lipstick }),
      GPUPixelBeauty.setBlusher({ level: levels.blusher }),
    ]);
  } catch {
    /* ignore individual setter failures */
  }
}

export async function setBeautyEnabled(enabled: boolean) {
  if (!isNativeBeautyAvailable()) return;
  await ensureBeautyInit();
  try { await GPUPixelBeauty.setEnabled({ enabled }); } catch { /* ignore */ }
}

const STORAGE_KEY = 'pkg200.beauty.levels.v1';
export function loadStoredLevels(): ProBeautyLevels {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PRO_BEAUTY };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_PRO_BEAUTY, ...parsed };
  } catch {
    return { ...DEFAULT_PRO_BEAUTY };
  }
}
export function persistLevels(levels: ProBeautyLevels) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(levels)); } catch { /* ignore */ }
}

// ---------------------------------------------------------------
// Pkg201 — Broadcast injection (feature-flag, OFF by default).
// ---------------------------------------------------------------

const BROADCAST_FLAG_KEY = 'pkg201.broadcast.enabled';

export function isBroadcastBeautyEnabled(): boolean {
  try { return localStorage.getItem(BROADCAST_FLAG_KEY) === '1'; } catch { return false; }
}
export function setBroadcastBeautyFlag(enabled: boolean) {
  try { localStorage.setItem(BROADCAST_FLAG_KEY, enabled ? '1' : '0'); } catch { /* ignore */ }
}

/**
 * Push current beauty levels into LiveKit's outgoing camera track via the
 * native GPUPixelBeautyProcessor. No-op on web or when the broadcast flag
 * is off. Calls NativeLiveKit.setBeautyBroadcast under the hood.
 */
export async function applyBroadcastBeauty(levels: ProBeautyLevels, enabled: boolean) {
  if (!isNativeBeautyAvailable()) return;
  if (enabled && !isBroadcastBeautyEnabled()) return;
  try {
    const NativeLiveKit = (await import('@/plugins/NativeLiveKit')).NativeLiveKit;
    await NativeLiveKit.setBeautyBroadcast({
      enabled,
      smooth: levels.smooth / 10,
      white: levels.white / 10,
      thinFace: levels.thinFace / 10,
      bigEye: levels.bigEye / 10,
      lipstick: levels.lipstick / 10,
    });
  } catch {
    /* native optional */
  }
}

