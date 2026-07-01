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
  // Pro live-streaming apps (Chamet/Bigo/Poppo) capture at TRUE 9:16 portrait.
  // On typical 4:3 phone sensors this crops top/bottom (extra head-room) but
  // preserves the FULL sensor WIDTH — giving the widest possible field of view
  // on the horizontal axis, which is what the user perceives as "zoomed out".
  // Capturing 3:4 and then letting object-cover crop the sides inside a 9:16
  // preview shell is what causes the "face too close / zoomed in" complaint.
  const width = options.width ?? 1080;
  const height = options.height ?? 1920;
  return {
    ...withSource(options),
    width: { ideal: width },
    height: { ideal: height },
    aspectRatio: { ideal: width / height },
    frameRate: { ideal: options.frameRate ?? 30, min: 24 },
  } as unknown as MediaTrackConstraints;
};

export const buildPortraitVideoFallbacks = (options: PortraitConstraintOptions = {}): MediaTrackConstraints[] => [
  buildPortraitVideoConstraint({ ...options, width: 1080, height: 1920, frameRate: 30 }),
  buildPortraitVideoConstraint({ ...options, width: 720, height: 1280, frameRate: 30 }),
  buildPortraitVideoConstraint({ ...options, width: 540, height: 960, frameRate: 30 }),
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