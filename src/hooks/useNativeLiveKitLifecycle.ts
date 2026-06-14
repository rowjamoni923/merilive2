/**
 * useNativeLiveKitLifecycle — STUB (Step 1 rebuild, 2026-06-14).
 *
 * The native plugin previously orchestrated WebView transparency + media
 * pause/resume around app-state changes. With the new minimal plugin
 * (Step 2) lifecycle is handled inside Kotlin, so this hook is a no-op.
 */

export interface NativeLiveKitLifecycleOptions {
  manageCamera?: boolean;
  manageMicrophone?: boolean;
}

export function useNativeLiveKitLifecycle(
  _active: boolean,
  _options: NativeLiveKitLifecycleOptions = {},
): void { /* no-op */ }
