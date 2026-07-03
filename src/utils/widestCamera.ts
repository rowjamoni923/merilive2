export const maybeUpgradeToWidestCamera = async (
  initialStream: MediaStream,
  facingMode: 'user' | 'environment',
  source = 'camera',
): Promise<MediaStream> => {
  void facingMode;
  void source;
  // Web camera policy: do not swap to another lens/device automatically.
  // The user asked to keep the camera as-is and only change the visible frame.
  return initialStream;
};