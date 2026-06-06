/**
 * Pkg435 — Feature flag for Native Video Pre-cache (Phase A #1).
 *
 * Controls the background warming layer that ExoPlayer's SimpleCache uses
 * to disk-cache the next N reels (and recent reels) so that scrolling
 * shows the FIRST FRAME in 0 ms instead of the current 1-3 s
 * "video icon" buffering spinner. Cache is keyed by URL and persists
 * across app launches (LRU eviction at 256 MB — same shared cache the
 * Native Reels Player uses).
 *
 * Same three-tier dial as Pkg426 / Pkg427:
 *
 *   1. Developer Options toggle (`videoPrecache` flag in nativeFlags)
 *   2. Per-device localStorage override (`video-precache:native:enabled`)
 *   3. Default: OFF on web, OFF on Android until the user enables it
 *      (zero-risk rollout — broken prefetch is invisible to users since
 *      it's purely a warm-up, never blocks playback).
 *
 * ADDITIVE — any failure path (plugin missing, network error, cache full)
 * is silently swallowed and the existing playback path is unaffected.
 */

import { Capacitor } from '@capacitor/core';

const LOCAL_KEY = 'video-precache:native:enabled';

export function setLocalVideoPrecacheOverride(value: boolean | null): void {
  try {
    if (value === null) localStorage.removeItem(LOCAL_KEY);
    else localStorage.setItem(LOCAL_KEY, value ? '1' : '0');
  } catch {
    /* private mode */
  }
}

export function getLocalVideoPrecacheOverride(): boolean | null {
  try {
    const v = localStorage.getItem(LOCAL_KEY);
    if (v === '1') return true;
    if (v === '0') return false;
    return null;
  } catch {
    return null;
  }
}

export function isVideoPrecacheEnabled(): boolean {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    return false;
  }
  // Developer Options dial — highest priority.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getNativeFlag } = require('@/utils/nativeFlags') as typeof import('@/utils/nativeFlags');
    if (getNativeFlag('videoPrecache')) return true;
  } catch {
    /* noop */
  }
  const override = getLocalVideoPrecacheOverride();
  if (override !== null) return override;
  return false;
}
