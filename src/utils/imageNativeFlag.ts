/**
 * Pkg428 — Feature flag for the native Glide image loader.
 *
 * Three-tier dial identical to Pkg426 (VAP) and Pkg427 (Reels):
 *
 *   1. localStorage override `image:native:enabled` (`'1'` / `'0'`) — per
 *      device, instant smoke-test.
 *   2. app_settings.image_native_enabled (boolean) — global kill switch,
 *      flips instantly via admin panel + Pkg378 broadcast bump.
 *   3. app_settings.image_native_rollout_percent (0..100) — staged rollout.
 *      Sticky per-device via the same bucket as Pkg426/427 so a device that
 *      already got VAP/Reels native also gets image native (consistent
 *      perceived performance, no zig-zag testing).
 *
 * Default: OFF. Existing <img> / CSS background-image path stays the only
 * code path until this flag is enabled. ADDITIVE — zero regression.
 *
 * The *interceptor* (server cached images for every <img>) is a SEPARATE,
 * stricter sub-flag — `image:native:interceptor`. Prefetch can run safely
 * everywhere; interceptor rewrites every image response and should ship
 * only after smoke-testing.
 */

import { Capacitor } from '@capacitor/core';

const LOCAL_KEY = 'image:native:enabled';
const LOCAL_INTERCEPTOR_KEY = 'image:native:interceptor';
const LOCAL_BUCKET_KEY = 'vap:native:bucket'; // shared with Pkg426/427

let cachedRemoteEnabled: boolean | null = null;
let cachedRemoteRolloutPercent: number | null = null;
let cachedRemoteInterceptor: boolean | null = null;

export function setLocalNativeImageOverride(value: boolean | null): void {
  try {
    if (value === null) localStorage.removeItem(LOCAL_KEY);
    else localStorage.setItem(LOCAL_KEY, value ? '1' : '0');
  } catch { /* private mode */ }
}

export function getLocalNativeImageOverride(): boolean | null {
  try {
    const v = localStorage.getItem(LOCAL_KEY);
    if (v === '1') return true;
    if (v === '0') return false;
    return null;
  } catch { return null; }
}

export function setLocalImageInterceptorOverride(value: boolean | null): void {
  try {
    if (value === null) localStorage.removeItem(LOCAL_INTERCEPTOR_KEY);
    else localStorage.setItem(LOCAL_INTERCEPTOR_KEY, value ? '1' : '0');
  } catch { /* noop */ }
}

export function getLocalImageInterceptorOverride(): boolean | null {
  try {
    const v = localStorage.getItem(LOCAL_INTERCEPTOR_KEY);
    if (v === '1') return true;
    if (v === '0') return false;
    return null;
  } catch { return null; }
}

export function setRemoteNativeImageConfig(opts: {
  enabled?: boolean | null;
  rolloutPercent?: number | null;
  interceptor?: boolean | null;
}): void {
  if (opts.enabled !== undefined) cachedRemoteEnabled = opts.enabled;
  if (opts.rolloutPercent !== undefined) {
    cachedRemoteRolloutPercent =
      opts.rolloutPercent == null
        ? null
        : Math.max(0, Math.min(100, Math.round(opts.rolloutPercent)));
  }
  if (opts.interceptor !== undefined) cachedRemoteInterceptor = opts.interceptor;
}

function getStableBucket(): number {
  try {
    const cached = localStorage.getItem(LOCAL_BUCKET_KEY);
    if (cached != null) {
      const n = parseInt(cached, 10);
      if (Number.isFinite(n) && n >= 0 && n < 100) return n;
    }
    const bucket = Math.floor(Math.random() * 100);
    localStorage.setItem(LOCAL_BUCKET_KEY, String(bucket));
    return bucket;
  } catch { return 50; }
}

export function isNativeImageFlagEnabled(): boolean {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    return false;
  }
  // Developer Options dial (smtv923@gmail.com) — highest priority. When the
  // dev toggles `nativeImageLoader` ON, we activate Pkg428 regardless of
  // localStorage smoke-test override or remote rollout.
  try {
    // Lazy import avoids a circular dep at module init.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getNativeFlag } = require('@/utils/nativeFlags') as typeof import('@/utils/nativeFlags');
    if (getNativeFlag('nativeImageLoader')) return true;
  } catch { /* nativeFlags unavailable — fall through */ }
  const override = getLocalNativeImageOverride();
  if (override !== null) return override;
  if (cachedRemoteEnabled === false) return false;
  if (cachedRemoteEnabled === true && cachedRemoteRolloutPercent == null) return true;
  if (cachedRemoteRolloutPercent == null) return false;
  return getStableBucket() < cachedRemoteRolloutPercent;
}


/** Interceptor (rewrites every <img> response). Requires base flag ON. */
export function isImageInterceptorEnabled(): boolean {
  if (!isNativeImageFlagEnabled()) return false;
  const override = getLocalImageInterceptorOverride();
  if (override !== null) return override;
  return cachedRemoteInterceptor === true;
}
