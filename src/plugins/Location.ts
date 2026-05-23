import { registerPlugin, Capacitor, type PluginListenerHandle } from '@capacitor/core';

/**
 * Pkg253 — FusedLocationProvider bridge.
 *
 * Opt-in only. Default returns city-precision (rounded to 0.01° ≈ 1.1km).
 * Pass { precise: true } only inside an explicit user-initiated flow
 * (e.g. "Find live hosts within 5km").
 */
export interface LocationFix {
  available: boolean;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  timestamp?: number;
  precise?: boolean;
}

export interface LocationPlugin {
  checkPermission(): Promise<{ granted: boolean }>;
  requestPermission(): Promise<{ granted: boolean }>;
  getCurrentLocation(options?: { precise?: boolean }): Promise<LocationFix>;
  watch(options?: { intervalMs?: number; precise?: boolean }, cb?: (fix: LocationFix) => void): Promise<PluginListenerHandle> | Promise<string>;
  clearWatch(): Promise<void>;
}

const noop: LocationPlugin = {
  async checkPermission() { return { granted: false }; },
  async requestPermission() { return { granted: false }; },
  async getCurrentLocation() { return { available: false }; },
  async watch() { return { remove: async () => {} } as PluginListenerHandle; },
  async clearWatch() { /* noop */ },
};

const isAndroidNative = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

export const Location: LocationPlugin = isAndroidNative
  ? registerPlugin<LocationPlugin>('Location')
  : noop;

/** Helper: one-shot city-precision lat/lng, or null if denied/failed. */
export const getCityFix = async (): Promise<LocationFix | null> => {
  try {
    const perm = await Location.checkPermission();
    if (!perm.granted) {
      const req = await Location.requestPermission();
      if (!req.granted) return null;
    }
    const fix = await Location.getCurrentLocation({ precise: false });
    return fix.available ? fix : null;
  } catch {
    return null;
  }
};
