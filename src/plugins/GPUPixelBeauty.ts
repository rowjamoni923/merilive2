/**
 * Camera rebuild 2026-06-14: native beauty is disabled by design.
 * Streaming media must use exactly one LiveKit camera track. Face Verification
 * alone uses NativeCamera/CameraX. Keep this compatibility shim so existing UI
 * panels do not crash, but every method is a no-op.
 */

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

export const isNativeBeautyAvailable = () => false;

export const GPUPixelBeauty: GPUPixelBeautyPlugin = fallback;

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
let initRetryCount = 0;
export async function ensureBeautyInit(): Promise<boolean> {
  void initialized;
  void initRetryCount;
  return false;
}

export function resetBeautyInit(): void {
  initialized = false;
  initRetryCount = 0;
}

export async function applyProBeauty(levels: ProBeautyLevels) {
  void levels;
}

export async function setBeautyEnabled(enabled: boolean) {
  void enabled;
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

/**
 * Default = ON. Broadcast injection must be live by default so that when
 * a host enables Beauty in the panel, viewers actually see the processed
 * stream. Operators can opt out by calling setBroadcastBeautyFlag(false).
 */
export function isBroadcastBeautyEnabled(): boolean {
  try {
    const v = localStorage.getItem(BROADCAST_FLAG_KEY);
    if (v === '0') return false;
    return true;
  } catch { return true; }
}
export function setBroadcastBeautyFlag(enabled: boolean) {
  try { localStorage.setItem(BROADCAST_FLAG_KEY, enabled ? '1' : '0'); } catch { /* ignore */ }
}

/**
 * Push current beauty levels into LiveKit's outgoing camera track via the
 * native GPUPixelBeautyProcessor. No-op on web. enabled=false always runs
 * (detach must not be gated by the flag).
 */
export async function applyBroadcastBeauty(levels: ProBeautyLevels, enabled: boolean) {
  void levels;
  void enabled;
}


