export type CameraFacingMode = 'user' | 'environment';

type PortraitConstraintOptions = {
  facingMode?: CameraFacingMode;
  deviceId?: string;
  width?: number;
  height?: number;
  frameRate?: number;
};

const withSource = (options: PortraitConstraintOptions) => {
  if (options.deviceId) return { deviceId: { exact: options.deviceId } };
  return { facingMode: { ideal: options.facingMode ?? 'user' } };
};

export const buildPortraitVideoConstraint = (options: PortraitConstraintOptions = {}): MediaTrackConstraints => {
  // Pro live-streaming rule (Bigo / Chamet / TikTok Live pattern):
  // Ask for the sensor's NATIVE portrait aspect (3:4 = 1440x1920). Nearly every
  // Android front-camera sensor is 4:3 physically; asking for 9:16 forces
  // Chromium/WebView to center-crop ~25% of the horizontal FOV, which is
  // exactly what makes the face look "zoomed in". Capturing at native 3:4 and
  // then letting `object-fit: cover` fit it to the 9:16 UI keeps the widest
  // physical field of view — the face sits back where it should.
  //   - resizeMode:none  → refuse UA crop-and-scale
  //   - zoom:0 hint      → widest zoom on APIs that support ImageCapture zoom
  //   - Native minZoom   → applied by LiveKitPlugin.kt (Android) on attachLocal
  const width = options.width ?? 1440;
  const height = options.height ?? 1920;
  return {
    ...withSource(options),
    width: { ideal: width },
    height: { ideal: height },
    aspectRatio: { ideal: width / height },
    frameRate: { ideal: options.frameRate ?? 30, min: 24 },
    resizeMode: 'none',
    zoom: { ideal: 0 },
    advanced: [{ zoom: 0 } as unknown as MediaTrackConstraintSet],
  } as unknown as MediaTrackConstraints;
};

export const buildPortraitVideoFallbacks = (options: PortraitConstraintOptions = {}): MediaTrackConstraints[] => [
  // Native sensor aspect (3:4 portrait) — widest FOV, no WebRTC center-crop.
  buildPortraitVideoConstraint({ ...options, width: 1440, height: 1920, frameRate: 30 }),
  buildPortraitVideoConstraint({ ...options, width: 1080, height: 1440, frameRate: 30 }),
  buildPortraitVideoConstraint({ ...options, width: 720, height: 960, frameRate: 30 }),
];

export const isPortraitCameraTrack = (track: MediaStreamTrack | null | undefined): boolean => {
  const settings = track?.getSettings?.();
  const width = Number(settings?.width ?? 0);
  const height = Number(settings?.height ?? 0);
  if (!width || !height) return true;
  return height > width;
};

export const stopMediaStream = (stream: MediaStream | null | undefined) => {
  stream?.getTracks().forEach((track) => {
    try { track.stop(); } catch { /* ignore */ }
  });
};