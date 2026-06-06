import { registerPlugin, Capacitor } from '@capacitor/core';

export interface NativeLottiePlugin {
  play(opts: { url: string; loop?: boolean }): Promise<{ ok: boolean }>;
  stop(): Promise<void>;
}

const NativeLottie = registerPlugin<NativeLottiePlugin>('NativeLottie');

export const isNativeLottieAvailable = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

export default NativeLottie;
