import { registerPlugin } from '@capacitor/core';

export interface NativeSpeedOptimizerPlugin {
  getMemoryStatus(): Promise<{
    availableMB: number;
    totalMB: number;
    thresholdMB: number;
    lowMemory: boolean;
    appUsedMB: number;
    appMaxMB: number;
  }>;
  /** Recursively clears app cache + code-cache + external-cache; returns bytes freed. */
  clearNativeCache(): Promise<{ freedBytes: number; freedMB: number }>;
  /** ComponentCallbacks2 trim levels: 5/10/15/20/40/60/80. */
  trimMemory(options?: { level?: number }): Promise<{ level: number }>;
}

const NativeSpeedOptimizer = registerPlugin<NativeSpeedOptimizerPlugin>('NativeSpeedOptimizer');

export default NativeSpeedOptimizer;
