/**
 * Pkg144 — Pre-join device preferences (Phase 1 #1)
 *
 * Persists the user's chosen camera / microphone / speaker so the next
 * live/call/party session opens with the same devices automatically.
 *
 * Storage is localStorage only — no Supabase channels, no DB writes,
 * no cross-user reads. $1400-rule safe by construction.
 */

const STORAGE_KEY = 'merilive_prejoin_devices_v1';

export type DeviceKind = 'audioinput' | 'videoinput' | 'audiooutput';

export interface DevicePreferences {
  audioinput?: string;
  videoinput?: string;
  audiooutput?: string;
}

const isBrowser = () => typeof window !== 'undefined' && typeof localStorage !== 'undefined';

export function getDevicePreferences(): DevicePreferences {
  if (!isBrowser()) return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return {
      audioinput: typeof parsed.audioinput === 'string' ? parsed.audioinput : undefined,
      videoinput: typeof parsed.videoinput === 'string' ? parsed.videoinput : undefined,
      audiooutput: typeof parsed.audiooutput === 'string' ? parsed.audiooutput : undefined,
    };
  } catch {
    return {};
  }
}

export function setDevicePreferences(prefs: DevicePreferences) {
  if (!isBrowser()) return;
  try {
    const current = getDevicePreferences();
    const next = { ...current, ...prefs };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    // Let any open LiveKit Rooms react immediately.
    window.dispatchEvent(new CustomEvent('merilive-device-prefs-changed', { detail: next }));
  } catch {
    /* ignore quota */
  }
}

export function clearDevicePreferences() {
  if (!isBrowser()) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('merilive-device-prefs-changed', { detail: {} }));
  } catch {
    /* ignore */
  }
}

/**
 * Enumerate available input/output devices. Requires that getUserMedia
 * permission has already been granted (otherwise labels come back empty).
 */
export async function enumerateMediaDevices(): Promise<{
  audioinput: MediaDeviceInfo[];
  videoinput: MediaDeviceInfo[];
  audiooutput: MediaDeviceInfo[];
}> {
  const empty = { audioinput: [], videoinput: [], audiooutput: [] };
  if (!isBrowser() || !navigator.mediaDevices?.enumerateDevices) return empty;
  try {
    const list = await navigator.mediaDevices.enumerateDevices();
    return {
      audioinput: list.filter((d) => d.kind === 'audioinput'),
      videoinput: list.filter((d) => d.kind === 'videoinput'),
      audiooutput: list.filter((d) => d.kind === 'audiooutput'),
    };
  } catch {
    return empty;
  }
}
