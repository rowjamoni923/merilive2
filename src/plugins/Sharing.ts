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
  /** Read a content:// URI shared into the app — returns a Blob ready for upload. */
  async readUriAsBlob(uri: string): Promise<{ blob: Blob; name: string; mime: string } | null> {
    if (!isAndroidNative()) return null;
    try {
      const { base64, mime, name } = await Native.readUri({ uri });
      const bin = atob(base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: mime });
      const ext = mime.split('/')[1] || 'bin';
      return { blob, mime, name: name || `share_${Date.now()}.${ext}` };
    } catch {
      return null;
    }
  },
};
