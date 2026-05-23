import { registerPlugin, Capacitor } from '@capacitor/core';

export interface BackgroundSyncPlugin {
  enable(options: {
    supabaseUrl: string;
    anonKey: string;
    accessToken: string;
    userId: string;
    intervalMinutes?: number;
  }): Promise<{ enabled: boolean; intervalMinutes: number }>;
  refreshToken(options: { accessToken: string }): Promise<void>;
  disable(): Promise<void>;
  getStatus(): Promise<{ hasCredentials: boolean; lastUnreadTotal: number; lastSyncAt: number }>;
}

const noop: BackgroundSyncPlugin = {
  async enable() { return { enabled: false, intervalMinutes: 0 }; },
  async refreshToken() { /* noop */ },
  async disable() { /* noop */ },
  async getStatus() { return { hasCredentials: false, lastUnreadTotal: 0, lastSyncAt: 0 }; },
};

const isAndroidNative = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

export const BackgroundSync: BackgroundSyncPlugin = isAndroidNative
  ? registerPlugin<BackgroundSyncPlugin>('BackgroundSync')
  : noop;
