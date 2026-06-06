import { registerPlugin } from '@capacitor/core';

export interface NativeAudioEnginePlugin {
  enableProfessionalAudio(): Promise<{
    echoCancellation: boolean;
    noiseSuppression: boolean;
    autoGainControl: boolean;
  }>;
  setAudioEffect(options: { type: 'reverb' | 'studio' | 'normal' }): Promise<void>;
}

const NativeAudioEngine = registerPlugin<NativeAudioEnginePlugin>('NativeAudioEngine');

export default NativeAudioEngine;