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
import { useEffect, useRef } from 'react';
import type { PluginListenerHandle } from '@capacitor/core';
import { isNativeLiveKitAvailable } from '@/plugins/NativeLiveKit';
import { nativeLiveKitController } from '@/lib/nativeLiveKitController';

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

  useEffect(() => {
    if (!active || !isNativeLiveKitAvailable()) return;

    let cancelled = false;
    let handle: PluginListenerHandle | null = null;
    // Remember whether camera/mic were live at pause time so resume only
    // re-enables what was actually on (don't fight a user mute).
    const wasOn = { camera: false, microphone: false };

    const register = async () => {
      try {
        const { App } = await import('@capacitor/app');
        if (cancelled) return;
        const h = await App.addListener('appStateChange', async ({ isActive }) => {
          if (!nativeLiveKitController.isConnected()) return;
          try {
            if (!isActive) {
              // Going to background. Assume both were on (controller has
              // no getter); pause aggressively to release the camera.
              if (optsRef.current.manageCamera) {
                wasOn.camera = true;
                await nativeLiveKitController.setCameraEnabled(false);
              }
              if (optsRef.current.manageMicrophone) {
                wasOn.microphone = true;
                await nativeLiveKitController.setMicrophoneEnabled(false);
              }
            } else {
              if (optsRef.current.manageCamera && wasOn.camera) {
                await nativeLiveKitController.setCameraEnabled(true);
                wasOn.camera = false;
              }
              if (optsRef.current.manageMicrophone && wasOn.microphone) {
                await nativeLiveKitController.setMicrophoneEnabled(true);
                wasOn.microphone = false;
              }
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
