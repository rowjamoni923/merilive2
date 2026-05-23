import { registerPlugin, Capacitor } from '@capacitor/core';

export interface PickedMedia {
  base64: string;
  mime: string;
  name?: string;
  size?: number;
}

interface PhotoPickerPlugin {
  pickImage(opts?: { video?: boolean }): Promise<PickedMedia | Record<string, never>>;
  pickImages(opts?: { video?: boolean }): Promise<{ items: PickedMedia[] }>;
}

const Native = registerPlugin<PhotoPickerPlugin>('PhotoPicker');

const isAndroidNative = () =>
  typeof Capacitor !== 'undefined' &&
  Capacitor.isNativePlatform?.() &&
  Capacitor.getPlatform?.() === 'android';

/** Returns null on web/iOS so the caller falls back to <input type="file">. */
export const PhotoPicker = {
  isSupported: () => isAndroidNative(),

  async pickImage(video = false): Promise<PickedMedia | null> {
    if (!isAndroidNative()) return null;
    try {
      const res = await Native.pickImage({ video });
      if (!('base64' in res)) return null;
      return res as PickedMedia;
    } catch {
      return null;
    }
  },

  async pickImages(video = false): Promise<PickedMedia[]> {
    if (!isAndroidNative()) return [];
    try {
      const { items } = await Native.pickImages({ video });
      return items || [];
    } catch {
      return [];
    }
  },

  /** Helper: convert a picked media to a Blob for upload. */
  toBlob(m: PickedMedia): Blob {
    const bin = atob(m.base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: m.mime });
  },
};
