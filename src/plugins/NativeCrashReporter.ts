import { registerPlugin } from '@capacitor/core';

export interface NativeCrashReporterPlugin {
  logEvent(options: { message: string }): Promise<void>;
  recordError(options: { message: string; stack?: string; context?: string }): Promise<void>;
  setUserIdentifier(options: { userId: string }): Promise<void>;
  setAttribute(options: { key: string; value: string }): Promise<void>;
  getDeviceDiagnostics(): Promise<{
    brand: string;
    model: string;
    manufacturer: string;
    androidVersion: string;
    sdkInt: number;
    device: string;
    hardware: string;
    usedMemoryMB: number;
    maxMemoryMB: number;
  }>;
}

const NativeCrashReporter = registerPlugin<NativeCrashReporterPlugin>('NativeCrashReporter');

export default NativeCrashReporter;
