/**
 * Pkg432 — Runtime kill-switch for NativeChatUI overlay.
 *
 * Default OFF — existing Chat.tsx React UI remains the canonical path for
 * web, iOS, older APKs, and the un-opted-in Android cohort. Flip on via
 * `localStorage.setItem('chatui:native', 'on')` to opt in.
 */
const FLAG_KEY = 'chatui:native';

export function isChatUINativeEnabled(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(FLAG_KEY) === 'on';
  } catch {
    return false;
  }
}

export function setChatUINativeEnabled(on: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (on) localStorage.setItem(FLAG_KEY, 'on');
    else localStorage.removeItem(FLAG_KEY);
  } catch {
    /* quota / privacy mode — ignore */
  }
}
