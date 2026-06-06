/**
 * Pkg438 — Per-device flag to enable the NativeEntryAnimation pipeline.
 *
 * OFF by default to keep the existing EntryBarAnimation / UnifiedEntryAnimation
 * / PremiumEntryAnimation WebView path active. Phase B will add a JS
 * dispatcher that mirrors entry events into the native plugin when this
 * flag is true.
 *
 * Storage: localStorage key `merilive:nativeEntryAnim`. Values: 'on' | 'off'.
 */
const KEY = 'merilive:nativeEntryAnim';

export function isNativeEntryAnimFlagOn(): boolean {
  try {
    return typeof localStorage !== 'undefined' &&
      localStorage.getItem(KEY) === 'on';
  } catch {
    return false;
  }
}

export function setNativeEntryAnimFlag(on: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (on) localStorage.setItem(KEY, 'on');
    else localStorage.removeItem(KEY);
  } catch { /* ignore quota */ }
}
