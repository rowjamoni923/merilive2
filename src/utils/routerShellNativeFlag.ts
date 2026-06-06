// Pkg434 NativeRouterShell opt-in. OFF by default.
// Enable: localStorage.setItem('routerShell:native', 'on')
const KEY = 'routerShell:native';

export const isNativeRouterShellEnabled = (): boolean => {
  try {
    // Developer Options dial — highest priority.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getNativeFlag } = require('@/utils/nativeFlags') as typeof import('@/utils/nativeFlags');
    if (getNativeFlag('nativeRouterShell')) return true;
  } catch { /* noop */ }
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(KEY) === 'on';
  } catch {
    return false;
  }
};

export const setNativeRouterShellEnabled = (on: boolean): void => {
  try {
    if (on) localStorage.setItem(KEY, 'on');
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
};
