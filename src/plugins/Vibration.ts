/**
 * Pkg254 — Vibrator pattern library.
 *
 * Thin JS wrapper around the native VibrationPlugin (Android).
 * On web/iOS falls back to navigator.vibrate (web) or no-op (iOS).
 *
 * Respects a single user toggle stored in localStorage:
 *   merilive_haptics_enabled = "0" disables ALL haptics.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

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

interface VibrationPluginShape {
  hasVibrator(): Promise<{ supported: boolean; amplitudeControl: boolean }>;
  cancel(): Promise<void>;
  tick(opts?: { durationMs?: number; amplitude?: number }): Promise<void>;
  pattern(opts: { pattern: number[]; repeat?: number }): Promise<void>;
  preset(opts: { name: VibrationPreset }): Promise<void>;
}

const Native = registerPlugin<VibrationPluginShape>('Vibration');

const PREFS_KEY = 'merilive_haptics_enabled';

export function isHapticsEnabled(): boolean {
  try { return localStorage.getItem(PREFS_KEY) !== '0'; } catch { return true; }
}

export function setHapticsEnabled(enabled: boolean) {
  try { localStorage.setItem(PREFS_KEY, enabled ? '1' : '0'); } catch {}
}

function isAndroid() { return Capacitor.getPlatform() === 'android'; }

const WEB_PRESETS: Record<VibrationPreset, number[]> = {
  tick: [18],
  success: [25, 60, 25],
  error: [60, 80, 60, 80, 60],
  warning: [40, 100, 40],
  gift: [15, 40, 15, 40, 25, 40, 35],
  pkWin: [30, 50, 30, 50, 80, 80, 120],
  pkLose: [120, 80, 60],
  message: [25, 50, 25],
  mention: [35, 60, 35, 60, 35],
  callRing: [800, 600, 800, 600],
  callConnect: [60, 40, 60],
  callEnd: [100],
};

export async function hapticTick(durationMs = 18) {
  if (!isHapticsEnabled()) return;
  try {
    if (isAndroid()) await Native.tick({ durationMs });
    else if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(durationMs);
  } catch {}
}

export async function hapticPreset(name: VibrationPreset) {
  if (!isHapticsEnabled()) return;
  try {
    if (isAndroid()) await Native.preset({ name });
    else if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(WEB_PRESETS[name]);
  } catch {}
}

export async function hapticPattern(pattern: number[], repeat = -1) {
  if (!isHapticsEnabled()) return;
  try {
    if (isAndroid()) await Native.pattern({ pattern, repeat });
    else if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(pattern);
  } catch {}
}

export async function hapticCancel() {
  try {
    if (isAndroid()) await Native.cancel();
    else if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(0);
  } catch {}
}
