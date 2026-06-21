/**
 * useAutoPictureInPicture — professional auto-PiP for live/call/party screens.
 *
 * Behavior (matches Chamet/Bigo/Hollah Live):
 *   • While the user is in an active live/call/party room, pressing Home or
 *     switching apps automatically shrinks the app into a floating PiP window
 *     so the host's face / call partner stays visible.
 *   • When the user taps the PiP window or returns to the app, they land
 *     back exactly where they were (same route, same room, same connection).
 *
 * Implementation:
 *   • Uses the native `PictureInPicture` Capacitor plugin (Android 8+).
 *   • Listens to Capacitor `App` lifecycle — when the page goes background
 *     AND `enabled` is true, calls `PictureInPicture.enter(...)`.
 *   • On web/iOS or unsupported devices, the call is a safe no-op.
 *   • Re-entry is debounced so rapid background/foreground flips don't spam
 *     the activity (which would throw IllegalStateException).
 *
 * Usage:
 *   useAutoPictureInPicture({ enabled: callStatus === 'connected', aspect: { x: 9, y: 16 } });
 */
import { useEffect, useRef } from 'react';
import { App, type AppState } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { PictureInPicture } from '@/plugins/PictureInPicture';

export interface UseAutoPictureInPictureOptions {
  /** Master switch — typically `true` only while connected to the room/call. */
  enabled: boolean;
  /** Aspect ratio of the floating window. Defaults to 9:16 (portrait phone video). */
  aspect?: { x: number; y: number };
  /** Optional callback when PiP mode toggles. */
  onPipChange?: (isInPip: boolean) => void;
}

export function useAutoPictureInPicture(opts: UseAutoPictureInPictureOptions): void {
  const { enabled, aspect, onPipChange } = opts;
  const lastEnterAt = useRef(0);
  const enabledRef = useRef(enabled);
  const aspectRef = useRef(aspect);

  // Keep refs current so the long-lived listener always reads the latest values.
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);
  useEffect(() => { aspectRef.current = aspect; }, [aspect]);

  useEffect(() => {
    // No-op on web — auto-PiP is an Android-native feature.
    if (!Capacitor.isNativePlatform()) return;

    let appHandle: { remove: () => Promise<void> } | null = null;
    let pipHandle: { remove: () => Promise<void> } | null = null;
    let cancelled = false;

    const onAppState = (state: AppState) => {
      // We only act when going background while in a connected room.
      if (state.isActive) return;
      if (!enabledRef.current) return;

      // Debounce — Android throws IllegalStateException on rapid re-entry.
      const now = Date.now();
      if (now - lastEnterAt.current < 600) return;
      lastEnterAt.current = now;

      const a = aspectRef.current ?? { x: 9, y: 16 };
      void PictureInPicture.enter({ aspectX: a.x, aspectY: a.y })
        .catch(() => {
          // PiP refused (rotation race, activity finishing) — silent.
        });
    };

    void (async () => {
      try {
        // Skip wiring on devices where PiP is unavailable.
        const { supported } = await PictureInPicture.isSupported();
        if (!supported || cancelled) return;

        appHandle = await App.addListener('appStateChange', onAppState);

        if (onPipChange) {
          pipHandle = await PictureInPicture.addListener('pipModeChanged', (e) => {
            try { onPipChange(!!e?.isInPip); } catch { /* ignore */ }
          });
        }
      } catch {
        // ignore — plugin missing on older APK; safe no-op.
      }
    })();

    return () => {
      cancelled = true;
      void appHandle?.remove().catch(() => {});
      void pipHandle?.remove().catch(() => {});
    };
  }, [onPipChange]);
}

export default useAutoPictureInPicture;
