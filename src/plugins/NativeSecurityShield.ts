import { registerPlugin } from '@capacitor/core';

export interface NativeSecurityShieldPlugin {
  checkSecurityStatus(): Promise<{
    isRooted: boolean;
    isEmulator: boolean;
    isDebuggerConnected: boolean;
  }>;
  enableScreenProtection(): Promise<void>;
}

const NativeSecurityShield = registerPlugin<NativeSecurityShieldPlugin>('NativeSecurityShield');

export default NativeSecurityShield;