/**
 * useRtcLifecycle — STUB (Step 1 rebuild, 2026-06-14).
 *
 * Returns a permanently-foreground state so CameraPausedOverlay never
 * shows. The new plugin (Step 2) will surface its own lifecycle events
 * if needed.
 */

export interface RtcLifecycleState {
  foreground: boolean;
  hasBackgrounded: boolean;
}

export function useRtcLifecycle(): RtcLifecycleState {
  return { foreground: true, hasBackgrounded: false };
}
