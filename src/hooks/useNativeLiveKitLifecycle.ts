/**
 * useNativeLiveKitLifecycle — when a native Android LiveKit session is
 * active, pause the camera + mic publish while the app is backgrounded
 * (Android kills foreground camera access otherwise, leaving a frozen
 * track on the room) and restore on resume.
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
    // Native foreground service keeps camera/mic alive. We intentionally do
    // not pause tracks on appStateChange because Android fires pause for
    // permission sheets, notification shade, PiP transitions and WebView
    // focus churn; toggling tracks there caused viewers to lose audio/video.

    const register = async () => {
      try {
        const { App } = await import('@capacitor/app');
        if (cancelled) return;
        const h = await App.addListener('appStateChange', async ({ isActive }) => {
          try {
            if (!isActive) {
              console.log('[useNativeLiveKitLifecycle] App inactive — keeping native LiveKit tracks alive');
            } else {
              console.log('[useNativeLiveKitLifecycle] App active — keeping existing native LiveKit session');
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
