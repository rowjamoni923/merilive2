import { registerPlugin } from '@capacitor/core';

export interface NativeAudioEnginePlugin {
  /** Pass the AudioRecord/AudioTrack session id from LiveKit local participant. */
  enableProfessionalAudio(options: { sessionId: number }): Promise<{
    sessionId: number;
    echoCancellation: boolean;
    noiseSuppression: boolean;
    autoGainControl: boolean;
  }>;
  /** type: normal | reverb_hall | reverb_room | reverb_plate | bass_boost | equalizer */
  setAudioEffect(options: {
    sessionId: number;
    type: 'normal' | 'reverb_hall' | 'reverb_room' | 'reverb_plate' | 'bass_boost' | 'equalizer';
    level?: number; // 0..100
  }): Promise<{ sessionId: number; type: string; level: number }>;
  releaseSession(options: { sessionId: number }): Promise<void>;
}

const NativeAudioEngine = registerPlugin<NativeAudioEnginePlugin>('NativeAudioEngine');

export default NativeAudioEngine;
