/**
 * Pkg438 — Per-device flag to enable the NativeGiftAnimation pipeline.
 *
 * OFF by default to keep the existing FullScreenGiftAnimation / FlyingGiftAnimation
 * / VAPPlayer WebView path active. Phase B will wire a JS dispatcher that
 * mirrors gift events into the native plugin when this flag is true.
 *
 * Storage: localStorage key `merilive:nativeGiftAnim`. Values: 'on' | 'off'.
 * Reading is sync — safe to call during render.
 */
const KEY = 'merilive:nativeGiftAnim';

export function isNativeGiftAnimFlagOn(): boolean {
  try {
    return typeof localStorage !== 'undefined' &&
      localStorage.getItem(KEY) === 'on';
  } catch {
    return false;
  }
}

export function setNativeGiftAnimFlag(on: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (on) localStorage.setItem(KEY, 'on');
    else localStorage.removeItem(KEY);
  } catch { /* ignore quota */ }
}
