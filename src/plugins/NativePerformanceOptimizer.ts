import { registerPlugin } from '@capacitor/core';

export interface NativePerformanceOptimizerPlugin {
  optimizeForStreaming(): Promise<{
    status: string;
    isPowerSaveMode: boolean;
  }>;
}

const NativePerformanceOptimizer = registerPlugin<NativePerformanceOptimizerPlugin>('NativePerformanceOptimizer');

export default NativePerformanceOptimizer;