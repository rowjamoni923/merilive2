/**
 * Pkg267 — Audio focus + routing bridge.
 *
 * - requestAudioFocus({usage}) — politely tells Spotify/YouTube/Podcasts
 *   to pause while we own audio (call or live).
 * - abandonAudioFocus() — they auto-resume.
 * - setAudioMode("in_communication"|"ringtone"|"normal")
 * - setSpeakerOn(), setBluetoothScoOn(), getAudioRoute()
 * - onAudioFocusChange(cb) — fires on incoming phone call etc.
 *
 * Web has no equivalent — all calls become no-ops.
 *
 * Usage during a private call:
 *   const release = await acquireCallAudio();   // focus + in_comm mode
 *   // ... call lifecycle ...
 *   await release();                            // abandon + normal mode
 */
import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export type AudioFocusUsage = "call" | "media";
export type AudioMode = "normal" | "in_communication" | "ringtone";
export type AudioRoute = "earpiece" | "speaker" | "bluetooth" | "wired";
export type FocusChange = "gain" | "loss" | "loss_transient" | "loss_transient_can_duck" | "unknown";

interface AudioFocusShape {
  requestFocus(opts: { usage?: AudioFocusUsage }): Promise<{ granted: boolean; delayed: boolean }>;
  abandonFocus(): Promise<void>;
  setMode(opts: { mode: AudioMode }): Promise<void>;
  setSpeakerOn(opts: { on: boolean }): Promise<{ on: boolean }>;
  setBluetoothScoOn(opts: { on: boolean }): Promise<{ on: boolean }>;
  getRoute(): Promise<{ route: AudioRoute }>;
  addListener(event: "focusChange", cb: (e: { change: FocusChange }) => void): Promise<PluginListenerHandle>;
}

const AudioFocus = registerPlugin<AudioFocusShape>("AudioFocus");

export function isAudioFocusNative(): boolean {
  return Capacitor.getPlatform() === "android";
}

export async function requestAudioFocus(usage: AudioFocusUsage = "call"): Promise<boolean> {
  if (!isAudioFocusNative()) return true;
  try {
    const r = await AudioFocus.requestFocus({ usage });
    return r.granted || r.delayed;
  } catch { return false; }
}

export async function abandonAudioFocus(): Promise<void> {
  if (!isAudioFocusNative()) return;
  try { await AudioFocus.abandonFocus(); } catch { /* ignore */ }
}

export async function setAudioMode(mode: AudioMode): Promise<void> {
  if (!isAudioFocusNative()) return;
  try { await AudioFocus.setMode({ mode }); } catch { /* ignore */ }
}

export async function setSpeakerOn(on: boolean): Promise<boolean> {
  if (!isAudioFocusNative()) return on;
  try { const r = await AudioFocus.setSpeakerOn({ on }); return r.on; } catch { return on; }
}

export async function setBluetoothScoOn(on: boolean): Promise<boolean> {
  if (!isAudioFocusNative()) return on;
  try { const r = await AudioFocus.setBluetoothScoOn({ on }); return r.on; } catch { return on; }
}

export async function getAudioRoute(): Promise<AudioRoute> {
  if (!isAudioFocusNative()) return "earpiece";
  try { const r = await AudioFocus.getRoute(); return r.route; } catch { return "earpiece"; }
}

export async function onAudioFocusChange(cb: (change: FocusChange) => void): Promise<() => void> {
  if (!isAudioFocusNative()) return () => {};
  try {
    const handle = await AudioFocus.addListener("focusChange", (e) => cb(e.change));
    return () => { handle.remove(); };
  } catch {
    return () => {};
  }
}

/**
 * Convenience: full call-audio lifecycle. Grabs focus, sets in_communication
 * mode, returns a release()-fn that abandons focus + restores normal mode.
 */
export async function acquireCallAudio(): Promise<() => Promise<void>> {
  await requestAudioFocus("call");
  await setAudioMode("in_communication");
  let released = false;
  return async () => {
    if (released) return;
    released = true;
    await abandonAudioFocus();
    await setAudioMode("normal");
  };
}

/**
 * Convenience: media (live stream / playback) audio focus. Doesn't change
 * the audio mode — just signals to other media apps to pause.
 */
export async function acquireMediaAudio(): Promise<() => Promise<void>> {
  await requestAudioFocus("media");
  let released = false;
  return async () => {
    if (released) return;
    released = true;
    await abandonAudioFocus();
  };
}
