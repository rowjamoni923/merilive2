/**
 * useRtcLifecycle — JS-side bridge for Phase 2A's `app-foreground` event.
 *
 * The native LiveKit plugin (Android) emits `app-foreground { foreground:boolean }`
 * via ProcessLifecycleOwner after a ~700 ms debounce, so it only fires on TRUE
 * background transitions (lock screen, recents, home — never on permission
 * sheets, the notification shade, focus loss, or PiP).
 *
 * When `pauseCameraOnBackground` is enabled (Private Call default), the plugin
 * also mutes/restores the camera track around this event. This hook surfaces
 * that state to React so screens can render a "Camera paused" overlay without
 * each call site duplicating Capacitor plugin listener boilerplate.
 *
 * Safe on web / iOS — the underlying `addListener` is a no-op and the hook
 * stays in its initial `foreground = true, cameraPaused = false` state.
 */
import { useEffect, useState } from 'react';
import { NativeLiveKit } from '@/plugins/NativeLiveKit';
import type { PluginListenerHandle } from '@capacitor/core';

export interface RtcLifecycleState {
  /** True when the app is in the foreground (default true on web/iOS). */
  foreground: boolean;
  /** True after we transitioned to background at least once — useful to
   *  decide whether the overlay should animate-in or just snap to visible. */
  hasBackgrounded: boolean;
}

export function useRtcLifecycle(): RtcLifecycleState {
  const [state, setState] = useState<RtcLifecycleState>({
    foreground: true,
    hasBackgrounded: false,
  });

  useEffect(() => {
    let handle: PluginListenerHandle | null = null;
    let cancelled = false;

    NativeLiveKit.addListener('app-foreground', (e: { foreground: boolean }) => {
      setState((prev) => ({
        foreground: !!e.foreground,
        hasBackgrounded: prev.hasBackgrounded || !e.foreground,
      }));
    })
      .then((h) => {
        if (cancelled) h.remove();
        else handle = h;
      })
      .catch(() => {
        /* not implemented on web/iOS — keep defaults */
      });

    return () => {
      cancelled = true;
      try { handle?.remove(); } catch { /* noop */ }
      handle = null;
    };
  }, []);

  return state;
}
