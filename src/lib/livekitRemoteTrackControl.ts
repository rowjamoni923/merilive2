/**
 * Pkg193 — Sub-participant advanced control (Item #5 of 12).
 *
 * Per-remote-publication fine-grained controls on the *subscriber* side,
 * complementing the host-side `livekitTrackPermissions` (Pkg105) module.
 *
 * APIs wrapped (all from `livekit-client` `RemoteTrackPublication`):
 *   - `setSubscribed(true|false)` — explicit per-track subscribe/unsubscribe.
 *     Stronger than `livekitSelectiveSubscription` autopilot — lets the UI
 *     pin/unpin a single remote track regardless of room defaults.
 *   - `setEnabled(true|false)` — pause/resume *decoding* without leaving the
 *     subscription. Saves CPU/bandwidth instantly without re-negotiation.
 *   - `setVideoQuality('low'|'medium'|'high')` — switch simulcast layer for
 *     a specific remote publication (e.g. demote off-screen tiles to low).
 *   - `setVideoDimensions({width, height})` — request a layer that fits a
 *     given target box (more precise than quality buckets).
 *   - `setVideoFPS(n)` — clamp received frame rate (battery saver).
 *
 * Reuses the Pkg121 scope/id registry via `_getRegisteredRoom`. No new
 * Supabase channels, no polling. $1400-rule safe.
 */
import {
  Track,
  type RemoteTrackPublication,
  type VideoQuality,
} from 'livekit-client';
import { _getRegisteredRoom, type StreamScope } from './livekitStreams';

export type TrackSourceKey =
  | 'camera'
  | 'microphone'
  | 'screen_share'
  | 'screen_share_audio';

const SOURCE_MAP: Record<TrackSourceKey, Track.Source> = {
  camera: Track.Source.Camera,
  microphone: Track.Source.Microphone,
  screen_share: Track.Source.ScreenShare,
  screen_share_audio: Track.Source.ScreenShareAudio,
};

function getRemotePub(
  scope: StreamScope,
  id: string,
  identity: string,
  source: TrackSourceKey,
): RemoteTrackPublication | null {
  const room = _getRegisteredRoom(scope, id);
  if (!room) return null;
  const remote = room.remoteParticipants.get(identity);
  if (!remote) return null;
  return remote.getTrackPublication(SOURCE_MAP[source]) as RemoteTrackPublication | null;
}

/** Explicit subscribe/unsubscribe for a single remote publication. */
export function setRemoteTrackSubscribed(
  scope: StreamScope,
  id: string,
  identity: string,
  source: TrackSourceKey,
  subscribed: boolean,
): boolean {
  const pub = getRemotePub(scope, id, identity, source);
  if (!pub) return false;
  try {
    pub.setSubscribed(subscribed);
    return true;
  } catch (e) {
    console.warn('[Pkg193] setRemoteTrackSubscribed failed', e);
    return false;
  }
}

/**
 * Pause/resume decoding for a remote publication. Track stays subscribed —
 * the SFU keeps streaming, only client-side decode is suspended (saves
 * CPU/battery instantly; resumes with no re-negotiation latency).
 */
export function setRemoteTrackEnabled(
  scope: StreamScope,
  id: string,
  identity: string,
  source: TrackSourceKey,
  enabled: boolean,
): boolean {
  const pub = getRemotePub(scope, id, identity, source);
  if (!pub) return false;
  try {
    pub.setEnabled(enabled);
    return true;
  } catch (e) {
    console.warn('[Pkg193] setRemoteTrackEnabled failed', e);
    return false;
  }
}

/** Switch simulcast layer for a remote video publication. */
export function setRemoteVideoQuality(
  scope: StreamScope,
  id: string,
  identity: string,
  source: TrackSourceKey,
  quality: VideoQuality,
): boolean {
  const pub = getRemotePub(scope, id, identity, source);
  if (!pub) return false;
  try {
    pub.setVideoQuality(quality);
    return true;
  } catch (e) {
    console.warn('[Pkg193] setRemoteVideoQuality failed', e);
    return false;
  }
}

/** Request the layer best matching a target render box. */
export function setRemoteVideoDimensions(
  scope: StreamScope,
  id: string,
  identity: string,
  source: TrackSourceKey,
  width: number,
  height: number,
): boolean {
  const pub = getRemotePub(scope, id, identity, source);
  if (!pub) return false;
  try {
    pub.setVideoDimensions({ width, height });
    return true;
  } catch (e) {
    console.warn('[Pkg193] setRemoteVideoDimensions failed', e);
    return false;
  }
}

/** Clamp received FPS for a remote video publication (battery saver). */
export function setRemoteVideoFPS(
  scope: StreamScope,
  id: string,
  identity: string,
  source: TrackSourceKey,
  fps: number,
): boolean {
  const pub = getRemotePub(scope, id, identity, source);
  if (!pub) return false;
  try {
    pub.setVideoFPS(fps);
    return true;
  } catch (e) {
    console.warn('[Pkg193] setRemoteVideoFPS failed', e);
    return false;
  }
}

/** Inspect current subscription state for a remote publication. */
export function getRemoteTrackInfo(
  scope: StreamScope,
  id: string,
  identity: string,
  source: TrackSourceKey,
): {
  subscribed: boolean;
  enabled: boolean;
  videoQuality?: VideoQuality;
} | null {
  const pub = getRemotePub(scope, id, identity, source);
  if (!pub) return null;
  return {
  };
}
