/**
 * ============================================================================
 * PERMANENT CAMERA LOCK POLICY (DO NOT MODIFY)
 * ============================================================================
 * This module enforces a hard zoom lock for all camera streams.
 * Target behavior:
 * - Camera zoom remains fixed (no zoom in/out)
 * - Camera framing/position remains stable
 * - Re-applies lock with retries for aggressive device drivers
 *
 * Policy ID: camera_lock_v1_20260304
 * ============================================================================
 */

export const CAMERA_LOCK_POLICY = Object.freeze({
  id: 'camera_lock_v1_20260304',
  fixedZoomLevel: 1,
  fixedObjectPosition: 'center center',
} as const);

type ZoomCapability = { min?: number; max?: number } | undefined;

function resolveLockedZoom(capability: ZoomCapability): number {
  const target = CAMERA_LOCK_POLICY.fixedZoomLevel;
  if (!capability || typeof capability !== 'object') return target;

  const min = Number.isFinite(capability.min) ? Number(capability.min) : target;
  const max = Number.isFinite(capability.max) ? Number(capability.max) : target;
  return Math.min(Math.max(target, min), max);
}

export async function enforcePermanentTrackLock(
  track: MediaStreamTrack | null | undefined,
  source = 'unknown'
): Promise<void> {
  if (!track || track.kind !== 'video' || track.readyState === 'ended') return;

  const anyTrack = track as MediaStreamTrack & {
    getCapabilities?: () => { zoom?: ZoomCapability };
    applyConstraints: (constraints: MediaTrackConstraints) => Promise<void>;
  };

  const capabilities = anyTrack.getCapabilities?.() as { zoom?: ZoomCapability } | undefined;
  const hasZoomControl = typeof capabilities?.zoom !== 'undefined';
  if (!hasZoomControl) return;

  const lockedZoom = resolveLockedZoom(capabilities?.zoom);

  const apply = async () => {
    try {
      await anyTrack.applyConstraints({
        advanced: [{ zoom: lockedZoom } as unknown as MediaTrackConstraintSet],
      });
    } catch {
      try {
        await anyTrack.applyConstraints({ zoom: lockedZoom } as unknown as MediaTrackConstraints);
      } catch (error) {
        console.warn('[CameraLock] zoom lock apply failed:', source, error);
      }
    }
  };

  await apply();

  // Re-apply quickly in case OEM camera pipeline overwrites zoom after startup
  [120, 500, 1200].forEach((delay) => {
    setTimeout(() => {
      if (track.readyState === 'live') {
        void apply();
      }
    }, delay);
  });
}

export async function enforcePermanentCameraLock(
  stream: MediaStream | null | undefined,
  source = 'unknown'
): Promise<void> {
  if (!stream) return;

  const videoTracks = stream.getVideoTracks();
  if (!videoTracks.length) return;

  await Promise.allSettled(
    videoTracks.map((track) => enforcePermanentTrackLock(track, source))
  );
}
