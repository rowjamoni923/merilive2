import { registerPlugin, Capacitor, type PluginListenerHandle } from '@capacitor/core';

/**
 * Pkg259 — Text-to-Speech bridge.
 * Use for: read DM aloud, accessibility announcements, low-vision mode.
 * Web fallback = window.speechSynthesis.
 */
export interface TextToSpeechPlugin {
  speak(opts: {
    text: string;
    lang?: string;
    rate?: number;   // 0.5 - 2.0
    pitch?: number;  // 0.5 - 2.0
    queue?: boolean; // false = flush, true = add
  }): Promise<{ id: string }>;
  stop(): Promise<void>;
  isSpeaking(): Promise<{ speaking: boolean }>;
  getLanguages(): Promise<{ languages: string[] }>;
  addListener(
    event: 'ready' | 'start' | 'done' | 'error',
    cb: (e: { ready?: boolean; id?: string }) => void
  ): Promise<PluginListenerHandle>;
}

const Native = registerPlugin<TextToSpeechPlugin>('TextToSpeech');

export const isTtsNative = () => Capacitor.getPlatform() === 'android';
const LS_KEY = 'merilive_tts_enabled';

export const isTtsEnabled = (): boolean => {
  try { return localStorage.getItem(LS_KEY) !== '0'; } catch { return true; }
};
export const setTtsEnabled = (on: boolean) => {
  try { localStorage.setItem(LS_KEY, on ? '1' : '0'); } catch {}
};

export interface SpeakOpts {
  lang?: string;
  rate?: number;
  pitch?: number;
  queue?: boolean;
}

export async function speak(text: string, opts: SpeakOpts = {}): Promise<void> {
  if (!isTtsEnabled() || !text) return;
  if (isTtsNative()) {
    try { await Native.speak({ text, ...opts }); } catch {}
    return;
  }
  // Web fallback
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    if (!opts.queue) window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (opts.lang) u.lang = opts.lang;
    if (opts.rate) u.rate = opts.rate;
    if (opts.pitch) u.pitch = opts.pitch;
    window.speechSynthesis.speak(u);
  } catch {}
}

export async function stopSpeaking() {
  if (isTtsNative()) { try { await Native.stop(); } catch {} return; }
  try { window.speechSynthesis?.cancel(); } catch {}
}

export async function getTtsLanguages(): Promise<string[]> {
  if (isTtsNative()) {
    try { return (await Native.getLanguages()).languages; } catch { return []; }
  }
  try {
    const voices = window.speechSynthesis?.getVoices() || [];
    return Array.from(new Set(voices.map((v) => v.lang)));
  } catch { return []; }
}
