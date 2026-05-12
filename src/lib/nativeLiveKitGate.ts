/**
 * nativeLiveKitGate — single source of truth for "should we use the
 * native Android LiveKit publisher?" decision.
 *
 * Used by Live broadcaster (GoLive) + Private Call (CallProvider) to
 * gate the native publish path. Web + iOS callers always get `false`
 * and continue with their existing livekit-client / Agora flow.
 *
 * A runtime kill-switch is supported via `app_settings.native_livekit_enabled`
 * (read by callers). Default = ON when the platform check passes.
 */
import { isNativeLiveKitAvailable } from '@/plugins/NativeLiveKit';

export type NativeLiveKitFeature = 'live-broadcast' | 'private-call';

interface GateInput {
  feature: NativeLiveKitFeature;
  /** Optional admin kill-switch from app_settings. Undefined = treat as enabled. */
  killSwitch?: boolean;
}

export function shouldUseNativeLiveKit({ killSwitch }: GateInput): boolean {
  if (killSwitch === false) return false;
  return isNativeLiveKitAvailable();
}

export { isNativeLiveKitAvailable };
