// Pkg441 — Thermal & Battery TS facade
import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export type ThermalStatus =
  | 'none' | 'light' | 'moderate' | 'severe' | 'critical' | 'emergency' | 'shutdown' | 'unknown';

export interface ThermalSnapshot {
  status: ThermalStatus;
  statusCode: number;
  supported: boolean;
}

export interface BatterySnapshot {
  /** 0..100, or -1 if unknown */
  level: number;
  isCharging: boolean;
  pluggedSource: 'ac' | 'usb' | 'wireless' | 'none' | 'unknown';
  powerSaveMode: boolean;
  isLowRamDevice: boolean;
}

export interface DeviceCapabilities {
  isLowRamDevice: boolean;
  memoryClassMb: number;
  largeMemoryClassMb: number;
  sdkInt: number;
  model: string;
  manufacturer: string;
}

export interface ThermalBatteryPlugin {
  getThermalStatus(): Promise<ThermalSnapshot>;
  getBatteryStatus(): Promise<BatterySnapshot>;
  getDeviceCapabilities(): Promise<DeviceCapabilities>;
  addListener(
    eventName: 'thermalChange',
    listenerFunc: (snap: ThermalSnapshot) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
  ): Promise<PluginListenerHandle>;
  addListener(
  ): Promise<PluginListenerHandle>;
}

export const ThermalBattery = registerPlugin<ThermalBatteryPlugin>('ThermalBattery', {
  web: {
    async getThermalStatus(): Promise<ThermalSnapshot> {
      return { status: 'none', statusCode: 0, supported: false };
    },
    async getBatteryStatus(): Promise<BatterySnapshot> {
      try {
        const nav = typeof navigator !== 'undefined' ? (navigator as unknown as { getBattery?: () => Promise<any> }) : null;
        const bat = nav?.getBattery ? await nav.getBattery() : null;
        return {
          level: bat ? Math.round((bat.level ?? 0) * 100) : -1,
          isCharging: !!bat?.charging,
          pluggedSource: 'unknown',
          powerSaveMode: false,
          isLowRamDevice: false,
        };
      } catch {
        return { level: -1, isCharging: false, pluggedSource: 'unknown', powerSaveMode: false, isLowRamDevice: false };
      }
    },
    async getDeviceCapabilities(): Promise<DeviceCapabilities> {
      return {
        memoryClassMb: 0,
        largeMemoryClassMb: 0,
        sdkInt: 0,
        model: '',
        manufacturer: '',
      };
    },
    async addListener() {
      return { remove: async () => {} } as PluginListenerHandle;
    },
  },
});
