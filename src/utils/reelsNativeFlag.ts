/**
 * Pkg427 — Feature flag for native Android Reels Player (ExoPlayer).
 *
 * Same three-tier dial as vapNativeFlag (Pkg426):
 *
 *   1. Per-device localStorage override (`reels:native:enabled` = '1' / '0')
 *      — fastest dial, lets the user enable on their own device for
 *      smoke-testing before app-wide rollout.
 *   2. app_settings.reels_native_enabled (boolean) — global kill / enable
 *      switch, flips instantly via admin panel + Pkg378 broadcast bump.
 *   3. app_settings.reels_native_rollout_percent (0..100) — staged rollout.
 *      Sticky per-device via the same bucket as Pkg426 so a device that
 *      already got VAP native also gets reels native (consistent feel).
 *
 * Default: OFF. Existing WebView <video> path in Reels.tsx keeps running
 * until this flag is enabled. ADDITIVE — zero regression.
 */

import { Capacitor } from '@capacitor/core';

const LOCAL_KEY = 'reels:native:enabled';
// Re-uses the Pkg426 bucket — if a device is in bucket 12 for VAP, the
// same device is in bucket 12 for reels. Keeps the staged rollout
// predictable for QA.
const LOCAL_BUCKET_KEY = 'vap:native:bucket';

let cachedRemoteEnabled: boolean | null = null;
let cachedRemoteRolloutPercent: number | null = null;

export function setLocalNativeReelsOverride(value: boolean | null): void {
  try {
    if (value === null) localStorage.removeItem(LOCAL_KEY);
    else localStorage.setItem(LOCAL_KEY, value ? '1' : '0');
  } catch {
    /* private mode etc. */
  }
}

export function getLocalNativeReelsOverride(): boolean | null {
  try {
    const v = localStorage.getItem(LOCAL_KEY);
    if (v === '1') return true;
    if (v === '0') return false;
    return null;
  } catch {
    return null;
  }
}

export function setRemoteNativeReelsConfig(opts: {
  enabled?: boolean | null;
  rolloutPercent?: number | null;
}): void {
  if (opts.enabled !== undefined) cachedRemoteEnabled = opts.enabled;
  if (opts.rolloutPercent !== undefined) {
    cachedRemoteRolloutPercent =
      opts.rolloutPercent == null
        ? null
        : Math.max(0, Math.min(100, Math.round(opts.rolloutPercent)));
  }
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
  } catch {
    return 50;
  }
}

export function isNativeReelsFlagEnabled(): boolean {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    return false;
  }
  const override = getLocalNativeReelsOverride();
  if (override !== null) return override;
  if (cachedRemoteEnabled === false) return false;
  if (cachedRemoteEnabled === true && cachedRemoteRolloutPercent == null) {
    return true;
  }
  if (cachedRemoteRolloutPercent == null) return false;
  return getStableBucket() < cachedRemoteRolloutPercent;
}
