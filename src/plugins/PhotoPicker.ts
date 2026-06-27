import { registerPlugin, Capacitor } from '@capacitor/core';

export interface PickedMedia {
  base64: string;
  mime: string;
  name?: string;
  size?: number;
}

interface PhotoPickerPlugin {
  pickImage(opts?: { video?: boolean; crop?: boolean }): Promise<PickedMedia | Record<string, never>>;
  pickImages(opts?: { video?: boolean }): Promise<{ items: PickedMedia[] }>;
}

const Native = registerPlugin<PhotoPickerPlugin>('PhotoPicker');

const isAndroidNative = () =>
  typeof Capacitor !== 'undefined' &&
  Capacitor.isNativePlatform?.() &&
  Capacitor.getPlatform?.() === 'android';

/** Returns null on web/iOS so the caller falls back to <input type="file">. */
export const PhotoPicker = {
  /**
   * True only when the native plugin is actually registered in the running
   * APK. On web, iOS, or older APK builds that pre-date the plugin this
   * returns false so callers fall back to <input type="file"> instead of
   * silently doing nothing when the native handler isn't there.
   */
  isSupported: () => {
    if (!isAndroidNative()) return false;
    try { return Capacitor.isPluginAvailable?.('PhotoPicker') === true; }
    catch { return false; }
  },

  async pickImage(video = false, crop = false): Promise<PickedMedia | null> {
    if (!PhotoPicker.isSupported()) return null;
    try {
      const res = await Native.pickImage({ video, crop });

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
