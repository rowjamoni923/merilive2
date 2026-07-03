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
  // Web zoom-out rule: do NOT request any width/height/aspect ratio/zoom.
  // The browser should keep the camera's natural sensor framing; the UI layer
  // is responsible for placing that unmodified feed inside a vertical frame.
  return {
    ...withSource(options),
    ...(options.frameRate ? { frameRate: { ideal: options.frameRate } } : {}),
  } as unknown as MediaTrackConstraints;
};

export const buildPortraitVideoFallbacks = (options: PortraitConstraintOptions = {}): MediaTrackConstraints[] => [
  buildPortraitVideoConstraint(options),
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