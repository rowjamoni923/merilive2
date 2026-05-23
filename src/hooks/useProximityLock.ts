/**
 * Pkg266 — useProximityLock hook.
 *
 * Mount-scoped proximity wake lock for AUDIO-only calls. Auto-releases on
 * unmount. Caller passes `enabled` (e.g. only true when call is audio +
 * connected + not on speaker).
 */
import { useEffect } from "react";
import { acquireProximityLock } from "@/plugins/ProximityLock";

export function useProximityLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let release: null | (() => Promise<void>) = null;
    let cancelled = false;
    (async () => {
      const r = await acquireProximityLock();
      if (cancelled) await r();
      else release = r;
    })();
    return () => {
      cancelled = true;
      if (release) release().catch(() => {});
    };
  }, [enabled]);
}
