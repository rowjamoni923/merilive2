import { registerPlugin, Capacitor } from '@capacitor/core';

export interface BiometricAvailability {
  available: boolean;
  biometricOnly: boolean;
  deviceCredential: boolean;
  reason: string;
}

export interface BiometricAuthOptions {
  title?: string;
  subtitle?: string;
  reason?: string;
  allowDeviceCredential?: boolean;
}

export interface BiometricAuthResult {
  success: boolean;
  code?: number;
  message?: string;
}

export interface BiometricAuthPlugin {
  isAvailable(): Promise<BiometricAvailability>;
  authenticate(opts: BiometricAuthOptions): Promise<BiometricAuthResult>;
}

const Stub: BiometricAuthPlugin = {
  async isAvailable() {
    return { available: false, biometricOnly: false, deviceCredential: false, reason: 'web' };
  },
  async authenticate() {
    return { success: false, message: 'unsupported' };
  },
};

export const BiometricAuth: BiometricAuthPlugin =
  Capacitor.isNativePlatform()
    ? registerPlugin<BiometricAuthPlugin>('BiometricAuth')
    : Stub;
