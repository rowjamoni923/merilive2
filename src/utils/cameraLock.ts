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
  id: 'camera_lock_v3_backward_min_zoom_20260701',
  // Widest possible FOV. We snap to the hardware minimum zoom (e.g. 0.5x on
  // ultra-wide capable devices, else 1x). Never zoom IN past 1x.
  fixedZoomLevel: 1,
  minZoomFloor: 0.05,
  fixedObjectPosition: 'center center',
} as const);

type ZoomCapability = { min?: number; max?: number; step?: number } | undefined;

function resolveLockedZoom(capability: ZoomCapability): number {
  const ceiling = CAMERA_LOCK_POLICY.fixedZoomLevel; // never above 1x
  if (!capability || typeof capability !== 'object') return ceiling;

  const min = Number.isFinite(capability.min)
    ? Math.max(Number(capability.min), CAMERA_LOCK_POLICY.minZoomFloor)
    : ceiling;
  // Always target the widest FOV the hardware allows, capped at 1x.
  return Math.min(min, ceiling);
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
        zoom: lockedZoom,
        advanced: [{ zoom: lockedZoom } as unknown as MediaTrackConstraintSet],
      } as unknown as MediaTrackConstraints);
    } catch {
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
