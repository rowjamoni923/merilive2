/**
 * Pkg433 — Runtime kill-switch for NativeFeed overlay.
 *
 * Default OFF — Index.tsx / Discover.tsx React grids remain canonical for
 * web, iOS, older APKs, and the un-opted-in Android cohort. Flip on via
 * `localStorage.setItem('feed:native', 'on')` to opt in.
 */
const FLAG_KEY = 'feed:native';

export function isFeedNativeEnabled(): boolean {
  try {
    // Developer Options dial — highest priority.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getNativeFlag } = require('@/utils/nativeFlags') as typeof import('@/utils/nativeFlags');
    if (getNativeFlag('nativeFeed')) return true;
  } catch { /* noop */ }
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(FLAG_KEY) === 'on';
  } catch {
    return false;
  }
}

export function setFeedNativeEnabled(on: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (on) localStorage.setItem(FLAG_KEY, 'on');
    else localStorage.removeItem(FLAG_KEY);
  } catch {
    /* quota / privacy — ignore */
  }
}
