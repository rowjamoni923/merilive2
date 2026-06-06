/**
 * Pkg430 — storageNativeFlag
 *
 * Runtime kill-switch for NativeStoragePlugin usage. Default ON for
 * Android (native plugin available) but every call site MUST still
 * tolerate a `false` return — the native bridge can be missing on
 * old APKs, iOS, web, or when a future remote-config flips this off.
 *
 * Override locally:
 *   localStorage.setItem('storage:native', 'off')  // force off
 *   localStorage.setItem('storage:native', 'on')   // force on
 */
import { isNativeStorageAvailable } from '@/plugins/NativeStorage';

export function isStorageNativeEnabled(): boolean {
  try {
    const v = localStorage.getItem('storage:native');
    if (v === 'off') return false;
    if (v === 'on') return isNativeStorageAvailable();
  } catch {
    /* ignore */
  }
  return isNativeStorageAvailable();
}
