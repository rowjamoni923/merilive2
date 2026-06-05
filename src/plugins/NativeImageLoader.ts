/**
 * Pkg428 — JS bridge for the native Android Glide-backed image loader.
 *
 * All methods are no-ops on web / iOS / older APKs that don't register the
 * plugin (registerPlugin returns a proxy that throws "unimplemented" — we
 * catch + return safe defaults so callers can fire-and-forget).
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

export interface NativeImageLoaderPlugin {
  prefetch(opts: { urls: string[] }): Promise<{ prefetched: number; requested?: number }>;
  clearCache(): Promise<void>;
  getCacheStats(): Promise<{ bytes: number; count: number }>;
  setInterceptorEnabled(opts: { enabled: boolean }): Promise<{ installed: boolean }>;
}

const Native = registerPlugin<NativeImageLoaderPlugin>('NativeImageLoader');

function isAndroidNative(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export async function prefetchImages(urls: string[]): Promise<number> {
  if (!isAndroidNative()) return 0;
  const clean = (urls || []).filter(
    (u) => typeof u === 'string' && (u.startsWith('https://') || u.startsWith('http://'))
  );
  if (clean.length === 0) return 0;
  try {
    const r = await Native.prefetch({ urls: clean });
    return r?.prefetched ?? 0;
  } catch {
    return 0;
  }
}

export async function clearImageCache(): Promise<void> {
  if (!isAndroidNative()) return;
  try { await Native.clearCache(); } catch { /* noop */ }
}

export async function getImageCacheStats(): Promise<{ bytes: number; count: number }> {
  if (!isAndroidNative()) return { bytes: 0, count: 0 };
  try { return await Native.getCacheStats(); } catch { return { bytes: 0, count: 0 }; }
}

export async function setImageInterceptorEnabled(enabled: boolean): Promise<boolean> {
  if (!isAndroidNative()) return false;
  try {
    const r = await Native.setInterceptorEnabled({ enabled });
    return r?.installed === true;
  } catch {
    return false;
  }
}

export default Native;
