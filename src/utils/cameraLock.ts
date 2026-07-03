/**
 * ============================================================================
 * CAMERA FRAMING POLICY
 * ============================================================================
 * Web must not force zoom, resolution, aspect ratio, or post-capture PTZ.
 * Camera streams stay exactly as the browser/device provides them; UI surfaces
 * place that natural feed inside a vertical frame with object-fit: contain.
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
  void track;
  void source;
  // Web camera policy: do not apply zoom/size constraints after capture.
  // Keep the browser-provided camera framing exactly as-is.
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
