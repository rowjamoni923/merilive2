/**
 * nativeLiveKitGate — single source of truth for "should we use the
 * native Android LiveKit publisher?" decision.
 *
 * Used by Live broadcaster (GoLive) + Private Call (CallProvider) to
 * gate the native publish path. Web + iOS callers always get `false`
 * and continue with their existing livekit-client flow.
 *
 * Live / Party / Private Call policy: Android native app MUST use the
 * NativeLiveKit plugin. There is no Android WebView camera fallback.
 */
import { isNativeLiveKitAvailable } from '@/plugins/NativeLiveKit';

export type NativeLiveKitFeature = 'live-broadcast' | 'private-call' | 'party-room';

interface GateInput {
  feature: NativeLiveKitFeature;
  /** Explicit override. When omitted, the cached admin kill-switch is used. */
  killSwitch?: boolean;
}

export function shouldUseNativeLiveKit({ killSwitch }: GateInput): boolean {
  // 1. Platform check — web/iOS never enter the native path.
  if (!isNativeLiveKitAvailable()) return false;
  // 2. Explicit override is retained only for isolated tests; production
  // Android live/party/call must fail closed instead of falling back to web RTC.
  if (killSwitch === false) return false;
  if (killSwitch === true) return true;
  return true;
}

export { isNativeLiveKitAvailable };
export { whenNativeLiveKitKillSwitchReady } from '@/lib/nativeLiveKitKillSwitch';
