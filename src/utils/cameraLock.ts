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
  id: 'camera_lock_v4_optical_backward_0_8_20260701',
  // Match the user's Android camera reference: a small backward/zoom-out
  // step from the normal selfie baseline. Prefer 0.8x when the browser/OEM
  // exposes it; clamp to the hardware minimum and NEVER go above 1x.
  fixedZoomLevel: 0.8,
  maxNonMagnifyingZoom: 1,
  minZoomFloor: 0.05,
  fixedObjectPosition: 'center center',
} as const);

type ZoomCapability = { min?: number; max?: number; step?: number } | undefined;

function resolveLockedZoom(capability: ZoomCapability): number {
  const preferred = CAMERA_LOCK_POLICY.fixedZoomLevel;
  const ceiling = CAMERA_LOCK_POLICY.maxNonMagnifyingZoom; // never zoom in above 1x
  if (!capability || typeof capability !== 'object') return preferred;

  const min = Number.isFinite(capability.min)
    ? Math.max(Number(capability.min), CAMERA_LOCK_POLICY.minZoomFloor)
    : CAMERA_LOCK_POLICY.minZoomFloor;
  const max = Number.isFinite(capability.max) ? Number(capability.max) : ceiling;
  const upper = Math.min(max, ceiling);
  const raw = Math.min(Math.max(preferred, min), upper);
  const step = Number.isFinite(capability.step) && Number(capability.step) > 0
    ? Number(capability.step)
    : 0;
  if (!step) return raw;
  const stepped = min + Math.round((raw - min) / step) * step;
  return Math.min(Math.max(stepped, min), upper);
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

  const apply = async () => {
    const capabilities = anyTrack.getCapabilities?.() as { zoom?: ZoomCapability } | undefined;
    const lockedZoom = resolveLockedZoom(capabilities?.zoom);
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

  // Re-apply after first frames: Chrome/Android WebView may expose camera
  // zoom capabilities only after streaming starts, and OEM drivers can reset
  // zoom once the preview surface becomes active.
  [120, 500, 1200, 2200].forEach((delay) => {
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
