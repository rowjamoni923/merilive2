import { registerPlugin } from '@capacitor/core';

export interface BatteryOptimizationPlugin {
  isIgnoringBatteryOptimizations(): Promise<{ isIgnoring: boolean }>;
  requestIgnoreBatteryOptimizations(): Promise<void>;
  openAutostartSettings(): Promise<void>;
}

const BatteryOptimization = registerPlugin<BatteryOptimizationPlugin>('BatteryOptimization');

export default BatteryOptimization;