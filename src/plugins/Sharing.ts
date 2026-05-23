import { registerPlugin, Capacitor } from '@capacitor/core';

export interface SharedPayload {
  text?: string;
  subject?: string;
  uris?: string[];
  mime?: string;
}

interface SharingPlugin {
  consumeIncoming(): Promise<{ payload: SharedPayload | null }>;
  hasIncoming(): Promise<{ value: boolean }>;
  readUri(opts: { uri: string }): Promise<{ base64: string; mime: string; name?: string; size?: number }>;
}

const Native = registerPlugin<SharingPlugin>('Sharing');

const isAndroidNative = () =>
  typeof Capacitor !== 'undefined' &&
  Capacitor.isNativePlatform?.() &&
  Capacitor.getPlatform?.() === 'android';

export const Sharing = {
  async consumeIncoming(): Promise<SharedPayload | null> {
    if (!isAndroidNative()) return null;
    try {
      const { payload } = await Native.consumeIncoming();
      return payload || null;
    } catch {
      return null;
    }
  },
  async hasIncoming(): Promise<boolean> {
    if (!isAndroidNative()) return false;
    try { return (await Native.hasIncoming()).value; } catch { return false; }
  },
};
