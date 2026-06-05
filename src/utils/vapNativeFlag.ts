/**
 * Pkg426 — Feature flag for native Android VAP player.
 *
 * Default: OFF. Native VAP plugin ships in the APK but every existing
 * animation component continues to use the WebView VAP path until this
 * flag is enabled. Three independent dials, OR-evaluated:
 *
 *   1. Per-device localStorage override (`vap:native:enabled` = '1' / '0')
 *      — fastest dial, lets the user enable on their own device for
 *      smoke-testing before app-wide rollout.
 *
 *   2. app_settings.vap_native_enabled (boolean) — global kill / enable
 *      switch, flips instantly via admin panel + Pkg378 broadcast bump
 *      (no APK rebuild required).
 *
 *   3. app_settings.vap_native_rollout_percent (0..100) — staged rollout.
 *      Sticky per-device via SHA-256(deviceId) modulo bucket; the same
 *      device always lands in the same bucket so rollout = monotonic.
 *
 * Phase-1 ships all three dials wired to localStorage + app_settings
 * cache, but the existing animation pipeline does NOT consult the flag
 * yet — wiring is Phase 2 per user mandate (additive, zero regression).
 */

import { Capacitor } from '@capacitor/core';

const LOCAL_KEY = 'vap:native:enabled';
const LOCAL_BUCKET_KEY = 'vap:native:bucket';

let cachedRemoteEnabled: boolean | null = null;
let cachedRemoteRolloutPercent: number | null = null;

export function setLocalNativeVAPOverride(value: boolean | null): void {
  try {
    if (value === null) localStorage.removeItem(LOCAL_KEY);
    else localStorage.setItem(LOCAL_KEY, value ? '1' : '0');
  } catch {
    /* private mode etc. */
  }
}

export function getLocalNativeVAPOverride(): boolean | null {
  try {
    const v = localStorage.getItem(LOCAL_KEY);
    if (v === '1') return true;
    if (v === '0') return false;
    return null;
  } catch {
    return null;
  }
}

export function setRemoteNativeVAPConfig(opts: {
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
    return 50; // deterministic-ish fallback so we don't oscillate
  }
}

/**
 * Final gate. Cheap synchronous check — call freely on every animation
 * play decision. Native-platform check is the first short-circuit so web
 * + iOS callers never even reach the rollout math.
 */
export function isNativeVAPFlagEnabled(): boolean {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return false;

  // 1) Per-device override wins (true → force on, false → force off).
  const override = getLocalNativeVAPOverride();
  if (override !== null) return override;

  // 2) Hard kill switch.
  if (cachedRemoteEnabled === false) return false;

  // 3) Staged rollout. If admin hasn't set a percent yet, default OFF
  //    (matches Pkg426 zero-risk mandate — opt-in only).
  if (cachedRemoteEnabled === true && cachedRemoteRolloutPercent == null) return true;
  if (cachedRemoteRolloutPercent == null) return false;
  return getStableBucket() < cachedRemoteRolloutPercent;
}
