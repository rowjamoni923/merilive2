/**
 * Pkg438 — Per-device flag to enable the NativeGiftAnimation pipeline.
 *
 * Phase 7 (2026-06-09): Default flipped to AUTO-ON for Android. Explicit
 * 'off' in either localStorage key still wins so QA can force the WebView
 * path back if a device regresses. Web / iOS / older APKs without the
 * plugin still no-op via `isNativeGiftAnimationAvailable()` in the
 * dispatcher, so flipping the default is safe.
 *
 * Storage: localStorage key `merilive:nativeGiftAnim`. Values:
 *   - 'on'   : force ON (any platform that has the plugin)
 *   - 'off'  : force OFF (back to WebView path)
 *   - unset  : auto — ON on Android, OFF elsewhere
 *
 * Reading is sync — safe to call during render.
 */
import { Capacitor } from '@capacitor/core';

const KEY = 'merilive:nativeGiftAnim';
const DEV_KEY = 'native-flag:nativeGiftAnim';

function read(key: string): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function isNativeGiftAnimFlagOn(): boolean {
  const a = read(KEY);
  const b = read(DEV_KEY);
  if (a === 'off' || b === 'off') return false;
  if (a === 'on' || b === 'on') return true;
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

export function setNativeGiftAnimFlag(on: boolean | 'auto'): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (on === 'auto') {
      localStorage.removeItem(KEY);
      localStorage.removeItem(DEV_KEY);
      return;
    }
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch { /* ignore quota */ }
}
