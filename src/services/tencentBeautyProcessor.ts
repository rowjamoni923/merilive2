/**
 * TencentBeautyProcessor — Now redirects to MediaPipe Beauty Processor
 * 
 * Kept for backward compatibility. All beauty processing
 * is now handled by Google MediaPipe (free, no license key).
 */

import {
  startBeautyProcessing,
  stopBeautyProcessing,
  setBeautyParams,
  setBeautyEnabled,
  mapUIToParams,
  isBeautyEnabled,
  destroyMediaPipeBeauty,
} from './mediapipeBeautyProcessor';

/**
 * Process a camera MediaStreamTrack through MediaPipe Beauty.
 * Returns the processed track, or the original track if beauty is unavailable.
 */
export async function processTrackWithBeauty(
  videoTrack: MediaStreamTrack
): Promise<MediaStreamTrack> {
  try {
    if (!isBeautyEnabled()) {
      return videoTrack;
    }

    const inputStream = new MediaStream([videoTrack]);
    const outputStream = await startBeautyProcessing(inputStream);
    const outTrack = outputStream.getVideoTracks()[0];
    
    if (outTrack && outTrack.readyState === 'live') {
      console.log('[BeautyProcessor] ✅ MediaPipe beauty processing active');
      return outTrack;
    }

    return videoTrack;
  } catch (err) {
    console.warn('[BeautyProcessor] MediaPipe beauty failed, using original track:', err);
    return videoTrack;
  }
}

/**
 * Map UI BeautySettings (0-100 scale) to processor parameters
 */
export function mapUISettingsToTencentSDK(uiSettings: {
  smoothness?: number;
  whitening?: number;
  faceSlim?: number;
  chinSlim?: number;
  eyeEnlarge?: number;
  noseNarrow?: number;
}): any {
  return mapUIToParams(uiSettings as any);
}

/**
 * Update beauty settings from UI (0-100 scale)
 */
export function updateBeautyFromUI(uiSettings: {
  smoothness?: number;
  whitening?: number;
  faceSlim?: number;
  chinSlim?: number;
  eyeEnlarge?: number;
  noseNarrow?: number;
}) {
  setBeautyEnabled(true);
  setBeautyParams(mapUIToParams(uiSettings as any));
}

/**
 * Update beauty settings directly
 */
export function updateBeautySettings(settings: any) {
  setBeautyParams(settings);
}

/**
 * Destroy the beauty processor
 */
export function destroyBeautyProcessor() {
  stopBeautyProcessing();
  destroyMediaPipeBeauty();
}

/**
 * Check if beauty processor is active
 */
export function isBeautyProcessorActive(): boolean {
  return isBeautyEnabled();
}
