/**
 * Pkg207 — Native Android Picture-in-Picture lifecycle hook.
 *
 * The native LiveKitPlugin already exposes `enterPictureInPicture`,
 * `setAutoPipOnLeaveHint`, and emits `pip-changed` events (Step 29).
 * This hook wires those into a React component so calls / live streams
 * auto-shrink to a floating window when the user taps the home button
 * — WhatsApp / Google Meet / YouTube parity.
 *
 * Usage:
 *   const { inPip, supported, enterPip } = useNativeAndroidPip({
 *     active: callStatus === 'connected',
 *     aspect: '9:16',
 *   });
 *
 * - `active=false` (default) leaves PiP disabled — safe no-op on web.
 * - Auto-enables `setAutoPipOnLeaveHint` while `active=true`, disables
 *   on unmount / when `active` flips back to false.
 * - `inPip` flips true while the activity is in the floating window —
 *   use it to collapse heavy UI (chat panels, gift wheels, etc.).
 */
import { useCallback, useEffect, useState } from 'react';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { NativeLiveKit, isNativeLiveKitAvailable } from '@/plugins/NativeLiveKit';

type Aspect = '9:16' | '16:9' | '1:1' | string;

interface Options {
  /** Turn auto-PiP on while this is true. Default false. */
  active?: boolean;
  /** PiP window aspect ratio. Default '9:16' (portrait video call). */
  aspect?: Aspect;
}

interface Result {
  /** Native PiP is supported on this device + API level. */
  supported: boolean;
  /** Activity is currently in the floating PiP window. */
  inPip: boolean;
  /** Manually shrink right now (wire to a "minimise" button). */
  enterPip: () => Promise<boolean>;
}

export function useNativeAndroidPip({ active = false, aspect = '9:16' }: Options = {}): Result {
  const [supported, setSupported] = useState(false);
  const [inPip, setInPip] = useState(false);

  const enabled = Capacitor.getPlatform() === 'android' && isNativeLiveKitAvailable();

  // Initial support probe.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void NativeLiveKit.isPictureInPictureSupported()
      .then((r) => {
        if (cancelled) return;
        setSupported(!!r.supported);
        setInPip(!!r.inPip);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [enabled]);

  // Live pip-changed subscription.
  useEffect(() => {
    if (!enabled) return;
    let handle: PluginListenerHandle | null = null;
    NativeLiveKit.addListener('pip-changed', (e) => {
      setInPip(!!e.isInPip);
    }).then((h) => { handle = h; }).catch(() => {});
    return () => { handle?.remove?.(); };
  }, [enabled]);

  // Auto-enter on home button while active.
  useEffect(() => {
    if (!enabled || !supported) return;
    let cancelled = false;
    void NativeLiveKit.setAutoPipOnLeaveHint({ enabled: active, aspect })
      .catch(() => {});
    return () => {
      if (cancelled) return;
      cancelled = true;
      void NativeLiveKit.setAutoPipOnLeaveHint({ enabled: false, aspect })
        .catch(() => {});
    };
  }, [enabled, supported, active, aspect]);

  const enterPip = useCallback(async (): Promise<boolean> => {
    if (!enabled || !supported) return false;
    try {
      const r = await NativeLiveKit.enterPictureInPicture({ aspect });
      return !!r.entered;
    } catch {
      return false;
    }
  }, [enabled, supported, aspect]);

  return { supported, inPip, enterPip };
}
