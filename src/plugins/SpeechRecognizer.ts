import { registerPlugin, Capacitor, type PluginListenerHandle } from '@capacitor/core';

/**
 * Pkg260 — On-device Speech-to-Text (android.speech.SpeechRecognizer).
 * Free, no API key. Streams partial + final.
 * Web fallback = window.SpeechRecognition (Chrome / Edge).
 */
export interface SpeechRecognizerPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  hasPermission(): Promise<{ granted: boolean }>;
  requestPermission(): Promise<{ granted: boolean }>;
  start(opts?: { lang?: string; partialResults?: boolean; maxResults?: number }): Promise<void>;
  stop(): Promise<void>;
  cancel(): Promise<void>;
  isListening(): Promise<{ listening: boolean }>;
  addListener(
    event: 'ready' | 'begin' | 'end' | 'rms' | 'partial' | 'result' | 'error',
    cb: (e: { matches?: string[]; isFinal?: boolean; rms?: number; code?: number; message?: string }) => void
  ): Promise<PluginListenerHandle>;
}

const Native = registerPlugin<SpeechRecognizerPlugin>('SpeechRecognizer');

export const isSttNative = () => Capacitor.getPlatform() === 'android';

export interface SttStartOpts {
  lang?: string;
  partialResults?: boolean;
  maxResults?: number;
}

export interface SttCallbacks {
  onPartial?: (text: string) => void;
  onResult?: (text: string, alternatives: string[]) => void;
  onError?: (code: number | string, message: string) => void;
  onRms?: (rms: number) => void;
  onBegin?: () => void;
  onEnd?: () => void;
}

let webRec: any = null;

export async function startSpeechRecognition(
  opts: SttStartOpts = {},
  cb: SttCallbacks = {}
): Promise<() => void> {
  const cleanups: Array<() => void> = [];

  if (isSttNative()) {
    const perm = await Native.requestPermission();
    if (!perm.granted) {
      cb.onError?.('no_permission', 'Microphone permission denied');
      return () => {};
    }
    const h1 = await Native.addListener('partial', (e) => {
      const t = e.matches?.[0] || '';
      if (t) cb.onPartial?.(t);
    });
    const h2 = await Native.addListener('result', (e) => {
      const matches = e.matches || [];
      if (matches.length) cb.onResult?.(matches[0], matches);
    });
    const h3 = await Native.addListener('error', (e) =>
      cb.onError?.(e.code ?? 'unknown', e.message || 'error'));
    const h4 = await Native.addListener('rms', (e) => cb.onRms?.(e.rms || 0));
    const h5 = await Native.addListener('begin', () => cb.onBegin?.());
    const h6 = await Native.addListener('end', () => cb.onEnd?.());
    cleanups.push(() => { h1.remove(); h2.remove(); h3.remove(); h4.remove(); h5.remove(); h6.remove(); });
    try { await Native.start(opts); } catch (e: any) {
      cb.onError?.('start_failed', e?.message || 'failed');
    }
    return async () => {
      try { await Native.cancel(); } catch {}
      cleanups.forEach((f) => f());
    };
  }

  // Web fallback
  const W = window as any;
  const Ctor = W.SpeechRecognition || W.webkitSpeechRecognition;
  if (!Ctor) {
    cb.onError?.('not_available', 'SpeechRecognition not supported');
    return () => {};
  }
  try {
    webRec = new Ctor();
    webRec.lang = opts.lang || navigator.language;
    webRec.interimResults = opts.partialResults !== false;
    webRec.maxAlternatives = opts.maxResults || 5;
    webRec.continuous = false;
    webRec.onstart = () => cb.onBegin?.();
    webRec.onend = () => cb.onEnd?.();
    webRec.onerror = (e: any) => cb.onError?.(e.error || 'unknown', e.error || 'error');
    webRec.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const text = res[0]?.transcript || '';
        if (res.isFinal) {
          const alts: string[] = [];
          for (let j = 0; j < res.length; j++) alts.push(res[j].transcript);
          cb.onResult?.(text, alts);
        } else {
          cb.onPartial?.(text);
        }
      }
    };
    webRec.start();
  } catch (e: any) {
    cb.onError?.('start_failed', e?.message || 'failed');
  }
  return () => {
    try { webRec?.stop(); } catch {}
    webRec = null;
  };
}

export async function stopSpeechRecognition() {
  if (isSttNative()) { try { await Native.stop(); } catch {} return; }
  try { webRec?.stop(); } catch {}
  webRec = null;
}
