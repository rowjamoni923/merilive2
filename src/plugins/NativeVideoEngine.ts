import { registerPlugin } from '@capacitor/core';

export interface NativeVideoEnginePlugin {
  getVersion(): Promise<{ version: string }>;
  processFrame(options: { frameData: string }): Promise<void>;
}

const NativeVideoEngine = registerPlugin<NativeVideoEnginePlugin>('NativeVideoEngine');

export default NativeVideoEngine;