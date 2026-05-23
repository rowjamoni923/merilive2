/**
 * Pkg265 — useScreenLock hook.
 *
 * Mount-scoped wake-lock + optional brightness boost. Auto-releases on
 * unmount and on Capacitor app-pause; re-acquires on resume.
 */
import { useEffect } from "react";
import { App } from "@capacitor/app";
import { acquireScreenLock, type ScreenLockOptions } from "@/plugins/ScreenControl";

export function useScreenLock(enabled: boolean, opts: ScreenLockOptions = {}) {
  useEffect(() => {
    if (!enabled) return;
    let release: null | (() => Promise<void>) = null;
    let cancelled = false;

    (async () => {
      const r = await acquireScreenLock(opts);
      if (cancelled) {
        await r();
      } else {
        release = r;
      }
    })();

    let stateListener: { remove: () => void } | null = null;
    (async () => {
      const handle = await App.addListener("appStateChange", async (s) => {
        if (s.isActive && !release && !cancelled) {
          const r = await acquireScreenLock(opts);
          if (cancelled) await r();
          else release = r;
        } else if (!s.isActive && release) {
          const r = release;
          release = null;
          await r();
        }
      });
      stateListener = handle;
    })().catch(() => { /* ignore on web */ });

    return () => {
      cancelled = true;
      if (release) release().catch(() => {});
      if (stateListener) stateListener.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, opts.brightness]);
}
