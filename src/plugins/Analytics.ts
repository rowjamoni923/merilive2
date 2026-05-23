import { registerPlugin, Capacitor } from '@capacitor/core';

export interface AnalyticsPlugin {
  logEvent(opts: { name: string; params?: Record<string, string | number | boolean> }): Promise<void>;
  setUserId(opts: { userId: string | null }): Promise<void>;
  setUserProperty(opts: { key: string; value: string | null }): Promise<void>;
  log(opts: { message: string }): Promise<void>;
  recordError(opts: { message: string; stack?: string }): Promise<void>;
  setEnabled(opts: { enabled: boolean }): Promise<void>;
}

const Native = registerPlugin<AnalyticsPlugin>('Analytics');

const isNative = () =>
  typeof Capacitor !== 'undefined' &&
  Capacitor.isNativePlatform?.() &&
  Capacitor.getPlatform?.() === 'android';

/** Safe wrapper — silently no-op on web/iOS so call sites stay clean. */
export const Analytics = {
  async logEvent(name: string, params?: Record<string, string | number | boolean>) {
    if (!isNative()) return;
    try { await Native.logEvent({ name, params }); } catch {}
  },
  async setUserId(userId: string | null) {
    if (!isNative()) return;
    try { await Native.setUserId({ userId }); } catch {}
  },
  async setUserProperty(key: string, value: string | null) {
    if (!isNative()) return;
    try { await Native.setUserProperty({ key, value }); } catch {}
  },
  async log(message: string) {
    if (!isNative()) return;
    try { await Native.log({ message }); } catch {}
  },
  async recordError(message: string, stack?: string) {
    if (!isNative()) return;
    try { await Native.recordError({ message, stack }); } catch {}
  },
  async setEnabled(enabled: boolean) {
    if (!isNative()) return;
    try { await Native.setEnabled({ enabled }); } catch {}
  },
};
