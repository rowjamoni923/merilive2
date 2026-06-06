import { registerPlugin } from '@capacitor/core';

export interface NativeVideoEnginePlugin {
  getVersion(): Promise<{ version: string; error?: string }>;
  /**
   * CPU brightness + saturation pass for snapshots/thumbnails (NOT live preview).
   * Live camera frames go through GPUPixelBeauty + LiveKit instead.
   */
  processFrame(options: {
    imageBase64: string;
    brightness?: number; // -100..100, default 0
    saturation?: number; // 0..200, default 100
  }): Promise<{ processedBase64: string; width: number; height: number }>;
}

const NativeVideoEngine = registerPlugin<NativeVideoEnginePlugin>('NativeVideoEngine');

export default NativeVideoEngine;
