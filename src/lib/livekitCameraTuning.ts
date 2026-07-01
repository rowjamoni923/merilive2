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
 * `contentHint='motion'` — tells LiveKit (Android native) to prefer framerate over fidelity
 * during congestion (right call for live faces + beauty filter motion).
 */
import type { LocalVideoTrack, LocalTrackPublication, Room } from 'livekit-client';
import { Track } from 'livekit-client';

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
  return {
    width: { ideal: target.width, min: Math.min(360, target.width) },
    height: { ideal: target.height, min: Math.min(640, target.height) },
    frameRate: { ideal: target.frameRate, min: 24 },
    // No internal UA crop. The renderer owns visual fill; capture must keep the
    // widest hardware FOV so faces do not look digitally zoomed-in.
    resizeMode: 'none' as ConstrainDOMString,
    // 'user' = front camera (default for Live/PartyRoom/PrivateCall).
    facingMode: { ideal: 'user' },
  };
}

/**
 * After publish, tag every camera track with `contentHint='motion'`.
 * Best perceptual setting for live faces with beauty filters / motion.
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
        try { (mst as any).contentHint = 'motion'; } catch { /* ignore */ }
      }
    });
  } catch {
    /* ignore */
  }
}
