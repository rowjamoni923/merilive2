/**
 * Pkg438 Phase C — Per-device flag for NativeHeartBurst on Reels double-tap.
 *
 * ON by default on Android — purely decorative, no Supabase mutation,
 * no risk to existing UI. Caller can disable via:
 *   localStorage.setItem('merilive:nativeHeartBurst', 'off')
 */
const KEY = 'merilive:nativeHeartBurst';

export function isNativeHeartBurstFlagOn(): boolean {
  try {
    if (typeof localStorage === 'undefined') return true;
    return localStorage.getItem(KEY) !== 'off';
  } catch { return true; }
}

export function setNativeHeartBurstFlag(on: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (on) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, 'off');
  } catch { /* ignore */ }
}
