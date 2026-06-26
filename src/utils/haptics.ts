/**
 * Haptics — globally disabled by product decision.
 *
 * Users reported that random vibration on UI interaction (button taps, toasts,
 * gifts, calls, etc.) felt buggy and distracting. All helpers are now no-ops.
 * Kept as exports so existing call sites keep compiling.
 */

export function isHapticsEnabled(): boolean {
  return false;
}
export function setHapticsEnabled(_on: boolean) {
  /* no-op */
}
export function tapLight() {}
export function tapMedium() {}
export function tapHeavy() {}
export function tapSelection() {}
export function tapSuccess() {}
export function tapWarning() {}
export function tapError() {}
