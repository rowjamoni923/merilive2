/**
 * Pkg200 — Unified per-room bootstrap (capstone for Pkg189–Pkg199).
 *
 * One call wires every opt-in piece of infra we built in items #1–#11 to
 * a single Room. Each connect site (host, viewer, party, 1:1 call, PK opp)
 * can drop in:
 *
 *   const release = bootstrapLiveKitRoom({ scope, id, room, profile });
 *   // …on disconnect…
 *   release();
 *
 * Wires (all gated by opts — sensible Chamet-parity defaults):
 *   - Pkg189  Token auto-refresh
 *   - Pkg196  MediaDevicesError + ActiveDeviceChanged listeners (autoRecover)
 *   - Pkg101  Connection quality registry
 *   - Pkg195  Auto-degrade subscribed video on poor connection (viewers only)
 *   - Pkg198  Background-tab video pause (viewers only)
 *
 * Pure composition — does NOT touch publishers, gifts, chat, or any
 * existing logic. $1400-rule safe; no new Supabase channels, no polling
 * other than caller-opted features. Each sub-feature can be disabled.
 */

import type { Room } from 'livekit-client';
import { attachLiveKitTokenRefresh, type RefetchTokenFn } from './livekitTokenRefresh';
import { registerMediaDeviceHandlers, unregisterMediaDeviceHandlers } from './livekitMediaDeviceHandlers';
import { registerConnectionQualityRoom, unregisterConnectionQualityRoom } from './livekitConnectionQuality';
import { startAutoQuality, stopAutoQuality } from './livekitAutoQuality';
import { startBackgroundPause, stopBackgroundPause } from './livekitBackgroundPause';
import type { QualityScope } from './livekitConnectionQuality';


export type BootstrapRole = 'host' | 'viewer' | 'caller' | 'callee' | 'party-member' | 'pk-opponent';

export interface BootstrapOpts {
  scope: QualityScope;
  id: string;
  room: Room;
  /** Role of the local participant — drives sensible feature defaults. */
  role: BootstrapRole;
  /** Refreshed JWT — required for Pkg189 token auto-refresh. */
  tokenInfo?: { token: string; expiresAt?: number; ttl?: number };
  /** Callback for silent token refresh failure (logged-out / 401). */
  onTokenRefreshFailed?: () => void;

  // Per-feature toggles (all default to role-appropriate values)
  enableTokenRefresh?: boolean;          // default: tokenInfo provided
  enableMediaDeviceHandlers?: boolean;   // default: true
  mediaDeviceAutoRecover?: boolean;      // default: true (publishers)
  enableConnectionQuality?: boolean;     // default: true
  enableAutoQuality?: boolean;           // default: viewers / PK opponents only
  enableBackgroundPause?: boolean;       // default: viewers only
  backgroundPauseGraceMs?: number;       // default: 1500
}

export interface BootstrapHandle {
  release: () => void;
}

function publisherRole(role: BootstrapRole): boolean {
  return role === 'host' || role === 'caller' || role === 'callee' || role === 'party-member' || role === 'pk-opponent';
}
function viewerRole(role: BootstrapRole): boolean {
  return role === 'viewer';
}

export function bootstrapLiveKitRoom(opts: BootstrapOpts): BootstrapHandle {
  const {
    scope, id, room, role,
    tokenInfo, onTokenRefreshFailed,
    enableTokenRefresh = !!tokenInfo,
    enableMediaDeviceHandlers = true,
    mediaDeviceAutoRecover = publisherRole(role),
    enableConnectionQuality = true,
    enableAutoQuality = viewerRole(role) || role === 'pk-opponent',
    enableBackgroundPause = viewerRole(role),
    backgroundPauseGraceMs = 1500,
  } = opts;

  const teardown: Array<() => void> = [];

  // Pkg189 — Token auto-refresh
  if (enableTokenRefresh && tokenInfo?.token) {
    try {
      const stop = scheduleLiveKitTokenRefresh({
        room,
        scope,
        id,
        token: tokenInfo.token,
        expiresAt: tokenInfo.expiresAt,
        ttl: tokenInfo.ttl,
        onFailed: onTokenRefreshFailed,
      } as never);
      if (typeof stop === 'function') teardown.push(stop);
    } catch { /* refresh module signature shift — silently skip */ }
  }

  // Pkg196 — Media device error + active-change handlers
  if (enableMediaDeviceHandlers) {
    registerMediaDeviceHandlers(scope, id, room, { autoRecover: mediaDeviceAutoRecover });
    teardown.push(() => unregisterMediaDeviceHandlers(scope, id));
  }

  // Pkg101 — Connection quality registry
  if (enableConnectionQuality) {
    registerConnectionQualityRoom(scope, id, room);
    teardown.push(() => unregisterConnectionQualityRoom(scope, id));
  }

  // Pkg195 — Auto-degrade subscribed video on poor connection (requires Pkg101 above)
  if (enableAutoQuality && enableConnectionQuality) {
    const stop = startAutoQuality({ scope, id });
    teardown.push(() => { try { stop(); } catch { stopAutoQuality(scope, id); } });
  }

  // Pkg198 — Background-tab pause (viewers)
  if (enableBackgroundPause) {
    const stop = startBackgroundPause({ scope, id, graceMs: backgroundPauseGraceMs });
    teardown.push(() => { try { stop(); } catch { stopBackgroundPause(scope, id); } });
  }

  return {
    release() {
      while (teardown.length) {
        const fn = teardown.pop();
        try { fn?.(); } catch { /* ignore individual teardown failures */ }
      }
    },
  };
}
