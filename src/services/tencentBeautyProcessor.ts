/**
 * BEAUTY PROCESSOR — REMOVED (Pkg200 prep)
 *
 * পুরো বর্তমান beauty pipeline (Tencent / MediaPipe / DeepAR) সরানো হইছে।
 * GPUPixel-based new engine আসছে। এই file শুধু no-op stub রাখে যাতে
 * existing call-sites compile করে।
 */

import type { LocalVideoTrack } from 'livekit-client';

export async function processTrackWithBeauty<T = LocalVideoTrack>(track: T): Promise<T> {
  return track;
}

export function destroyBeautyProcessor(): void {
  // no-op
}

export function isBeautyAvailable(): boolean {
  return false;
}
