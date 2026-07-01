/**
 * Pkg204 — HD camera tuning shared across Live / PrivateCall / PartyRoom.
 *
 * Why: LiveKit accepts a plain `{width,height,frameRate}` for
 * `videoCaptureDefaults.resolution`, which becomes an EXACT
 * MediaTrackConstraints under the hood. On low-end Androids that lack the
 * exact mode, getUserMedia THROWS — host can never go live.
 *
 * Bigo/TikTok/Chamet style: ask for `ideal` (target), `min` (floor), let
 * the OS pick the closest hardware mode. Combined with LiveKit's adaptive
 * bitrate + simulcast, this maximizes effective resolution per device.
 *
 * Also exposes `applyMotionHint` to tag published camera tracks with
 * `contentHint='detail'` — tells the browser encoder to preserve portrait face
 * sharpness instead of softening edges under motion/congestion.
 */
import type { LocalVideoTrack, LocalTrackPublication, Room } from 'livekit-client';
import { Track } from 'livekit-client';
import { buildPortraitVideoConstraint } from '@/utils/portraitCameraConstraints';

export interface HDResolution {
  width: number;
  height: number;
  frameRate: number;
}

/**
 * Build adaptive MediaTrackConstraints from a target portrait resolution.
 * `ideal` = what we want, `min` = floor below which we'd rather fail.
 */
export function buildHDCameraConstraints(target: HDResolution): MediaTrackConstraints {
  return buildPortraitVideoConstraint({ width: target.width, height: target.height, frameRate: target.frameRate, facingMode: 'user' });
}

/**
 * After publish, tag every camera track with `contentHint='detail'`.
 * Best perceptual setting for HD portrait faces with beauty filters.
 */
export function applyMotionHint(room: Room | null | undefined): void {
  if (!room?.localParticipant) return;
  try {
    room.localParticipant.trackPublications.forEach((pub: LocalTrackPublication) => {
      if (pub.kind !== Track.Kind.Video) return;
      if (pub.source !== Track.Source.Camera) return;
      const t = pub.track as LocalVideoTrack | undefined;
      const mst = t?.mediaStreamTrack;
      if (mst && 'contentHint' in mst) {
        // 'detail' = prioritize spatial resolution over frame rate.
        // Right call for HD portrait faces + beauty filters (Chamet/Bigo parity).
        // 'motion' softens edges on faces which reads as "blurry" to users.
        try { (mst as any).contentHint = 'detail'; } catch { /* ignore */ }
      }
    });
  } catch {
    /* ignore */
  }
}
