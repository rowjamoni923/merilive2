/**
 * Pkg438 — Per-device flag to enable the NativeEntryAnimation pipeline.
 *
 * Phase 7 (2026-06-09): Default flipped to AUTO-ON for Android. Explicit
 * 'off' in either localStorage key still wins so QA can force the WebView
 * path back if a device regresses. Web / iOS / older APKs without the
 * plugin still no-op via `isNativeEntryAnimationAvailable()` in the
 * dispatcher, so flipping the default is safe.
 *
 * Storage: localStorage key `merilive:nativeEntryAnim`. Values:
 *   - 'on'   : force ON (any platform that has the plugin)
 *   - 'off'  : force OFF (back to WebView path)
 *   - unset  : auto — ON on Android, OFF elsewhere
 */
import { Capacitor } from '@capacitor/core';

const KEY = 'merilive:nativeEntryAnim';
const DEV_KEY = 'native-flag:nativeEntryAnim';

function read(key: string): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function isNativeEntryAnimFlagOn(): boolean {
  const a = read(KEY);
  const b = read(DEV_KEY);
  if (a === 'off' || b === 'off') return false;
  if (a === 'on' || b === 'on') return true;
  // Auto-default: ON for Android native, OFF elsewhere.
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

export function setNativeEntryAnimFlag(on: boolean | 'auto'): void {
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
