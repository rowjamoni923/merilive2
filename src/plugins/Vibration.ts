/**
 * Vibration — globally disabled by product decision.
 *
 * All preset/pattern/tick calls are no-ops. Exports preserved so existing
 * import sites keep compiling.
 */

export type VibrationPreset =
  | 'tick'
  | 'success'
  | 'error'
  | 'warning'
  | 'gift'
  | 'pkWin'
  | 'pkLose'
  | 'message'
  | 'mention'
  | 'callRing'
  | 'callConnect'
  | 'callEnd';

export function isHapticsEnabled(): boolean {
  return false;
}
export function setHapticsEnabled(_enabled: boolean) {
  /* no-op */
}
export async function hapticTick(_durationMs = 18) {}
export async function hapticPreset(_name: VibrationPreset) {}
export async function hapticPattern(_pattern: number[], _repeat = -1) {}
export async function hapticCancel() {}
