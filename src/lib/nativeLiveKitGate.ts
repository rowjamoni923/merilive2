/**
 * nativeLiveKitGate — single source of truth for "should we use the
 * native Android LiveKit publisher?" decision.
 *
 * Used by Live broadcaster (GoLive) + Private Call (CallProvider) to
 * gate the native publish path. Web + iOS callers always get `false`
 * and continue with their existing livekit-client flow.
 *
 * A runtime kill-switch is supported via `app_settings.native_livekit_enabled`
 * (read by callers). Default = ON when the platform check passes.
 */
import { isNativeLiveKitAvailable } from '@/plugins/NativeLiveKit';
import { getNativeLiveKitKillSwitch } from '@/lib/nativeLiveKitKillSwitch';

export type NativeLiveKitFeature = 'live-broadcast' | 'private-call';

interface GateInput {
  feature: NativeLiveKitFeature;
  /** Explicit override. When omitted, the cached admin kill-switch is used. */
  killSwitch?: boolean;
}

export function shouldUseNativeLiveKit({ killSwitch }: GateInput): boolean {
  // 1. Platform check — web/iOS never enter the native path.
  if (!isNativeLiveKitAvailable()) return false;
  // 2. Explicit override wins (used by tests / forced fallback).
  if (killSwitch === false) return false;
  if (killSwitch === true) return true;
  // 3. Admin runtime kill-switch from app_settings.native_livekit_enabled.
  return getNativeLiveKitKillSwitch();
}

export { isNativeLiveKitAvailable };
export { whenNativeLiveKitKillSwitchReady } from '@/lib/nativeLiveKitKillSwitch';
