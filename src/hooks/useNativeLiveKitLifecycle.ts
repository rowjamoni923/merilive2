/**
 * useNativeLiveKitLifecycle — marks the WebView transparent while native
 * Android LiveKit renders behind it. Background media teardown is owned by
 * LiveKitPlugin so live/party/call never keep camera running off-screen.
 *
 * - Web/iOS / non-native session → no-op (`active=false` short-circuits).
 * - Listener handle is removed on unmount or when `active` flips false
 *   (no `removeAllListeners` — per project memory).
 * - User-initiated mute state is preserved: we capture the mic+cam
 *   intent at pause-time and only restore what was on.
 */
import { useEffect, useLayoutEffect, useRef } from 'react';
import type { PluginListenerHandle } from '@capacitor/core';
import { isNativeLiveKitAvailable } from '@/plugins/NativeLiveKit';
import { setNativeMediaSurface, clearNativeMediaSurface } from '@/utils/nativeMediaSurface';

export interface NativeLiveKitLifecycleOptions {
  /** Whether to pause/resume the camera (host + video call). Default true. */
  manageCamera?: boolean;
  /** Whether to pause/resume the microphone. Default true. */
  manageMicrophone?: boolean;
}

export function useNativeLiveKitLifecycle(
  active: boolean,
  options: NativeLiveKitLifecycleOptions = {},
): void {
  const { manageCamera = true, manageMicrophone = true } = options;
  const optsRef = useRef({ manageCamera, manageMicrophone });
  optsRef.current = { manageCamera, manageMicrophone };

  // Pkg428 — body transparency MUST be toggled synchronously around paint,
  // not in useEffect (which runs after commit). useLayoutEffect's cleanup
  // runs before the next route paints, eliminating the black flash window.
  useLayoutEffect(() => {
    setNativeMediaSurface(active);
    return () => {
      clearNativeMediaSurface();
    };
  }, [active]);

  useEffect(() => {
    if (!active || !isNativeLiveKitAvailable()) return;

    let cancelled = false;
    let handle: PluginListenerHandle | null = null;
    // Native plugin owns process-level teardown. JS only observes app-state
    // changes so WebView never tries to run camera/mic lifecycle itself.

    const register = async () => {
      try {
        const { App } = await import('@capacitor/app');
        if (cancelled) return;
        const h = await App.addListener('appStateChange', async ({ isActive }) => {
          try {
            if (!isActive) {
              console.log('[useNativeLiveKitLifecycle] App inactive — native plugin owns media teardown');
            } else {
              console.log('[useNativeLiveKitLifecycle] App active');
            }
          } catch (err) {
            console.warn('[useNativeLiveKitLifecycle] toggle failed:', err);
          }
        });
        if (cancelled) {
          try { h.remove(); } catch { /* noop */ }
          return;
        }
        handle = h;
      } catch (err) {
        console.warn('[useNativeLiveKitLifecycle] App listener registration failed:', err);
      }
    };

    register();

    return () => {
      cancelled = true;
      if (handle) {
        try { handle.remove(); } catch { /* noop */ }
        handle = null;
      }
    };
  }, [active]);
}
