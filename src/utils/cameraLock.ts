/**
 * ============================================================================
 * PERMANENT CAMERA LOCK POLICY (DO NOT MODIFY)
 * ============================================================================
 * This module enforces TRUE hardware zoom-out for all camera streams.
 * Target behavior:
 * - Use the camera's reported minimum zoom ratio (widest field of view)
 * - Never digitally zoom above 1x
 * - Re-apply after first frames because Android WebView exposes PTZ late
 *
 * Policy ID: camera_lock_v1_20260304
 * ============================================================================
 */

export const CAMERA_LOCK_POLICY = Object.freeze({
  id: 'camera_lock_v8_true_hardware_min_zoom_20260701',
  // Google/MDN camera APIs do not support negative zoom values. Real zoom-out
  // is the smallest ratio exposed by the device (often 0.5x/0.6x on ultra-wide,
  // or 1.0x when no wider lens is exposed to WebView).
  requestedZoomBehavior: 'hardware-minimum',
  maxNonMagnifyingZoom: 1,
  fallbackZoomWhenUnsupported: 1,
  fixedObjectPosition: 'center center',
} as const);



type ZoomCapability = { min?: number; max?: number; step?: number } | undefined;

function resolveLockedZoom(capability: ZoomCapability): number {
  const ceiling = CAMERA_LOCK_POLICY.maxNonMagnifyingZoom; // never zoom in above 1x
  if (!capability || typeof capability !== 'object') return CAMERA_LOCK_POLICY.fallbackZoomWhenUnsupported;

  const min = Number.isFinite(capability.min) ? Number(capability.min) : CAMERA_LOCK_POLICY.fallbackZoomWhenUnsupported;
  const max = Number.isFinite(capability.max) ? Number(capability.max) : ceiling;
  const upper = Math.min(max, ceiling);
  const raw = min <= upper ? min : upper;
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
    if (!capabilities?.zoom) return;
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
