import { registerPlugin, Capacitor, type PluginListenerHandle } from '@capacitor/core';

export interface NativeBgmMixerPlugin {
  play(opts: { path?: string; url?: string; loop?: boolean; volume?: number }): Promise<{ playing: boolean; durationMs: number }>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
  setVolume(opts: { volume: number }): Promise<void>;
  isPlaying(): Promise<{ playing: boolean }>;
  addListener(event: 'completed' | 'error', cb: (data: any) => void): Promise<PluginListenerHandle>;
}

const NativeBgmMixer = registerPlugin<NativeBgmMixerPlugin>('NativeBgmMixer');

const isAndroid = () => Capacitor.getPlatform() === 'android' && Capacitor.isNativePlatform();

/**
 * In-app background music for HOST during Live / Party / Video-Party.
 *
 * Behaviour (Chamet / Bigo parity):
 *  - Uses USAGE_MEDIA + AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK → Spotify /
 *    YouTube / other apps keep playing at reduced volume instead of being
 *    hard-paused when host taps "Play music".
 *  - Playback exits the phone speaker; LiveKit's mic captures the ambient
 *    audio and forwards it to remote viewers (same trick professional
 *    live-streaming apps use — no software mixing / no LiveKit publish
 *    surgery required).
 *
 * Web / iOS: all methods no-op safely (return sensible defaults).
 */
export const bgmMixer = {
  async play(opts: { url?: string; path?: string; loop?: boolean; volume?: number }) {
    if (!isAndroid()) return { playing: false, durationMs: 0 };
    try { return await NativeBgmMixer.play(opts); }
    catch { return { playing: false, durationMs: 0 }; }
  },
  async pause() { if (isAndroid()) { try { await NativeBgmMixer.pause(); } catch {} } },
  async resume() { if (isAndroid()) { try { await NativeBgmMixer.resume(); } catch {} } },
  async stop() { if (isAndroid()) { try { await NativeBgmMixer.stop(); } catch {} } },
  async setVolume(volume: number) {
    if (!isAndroid()) return;
    try { await NativeBgmMixer.setVolume({ volume: Math.max(0, Math.min(1, volume)) }); } catch {}
  },
  async isPlaying() {
    if (!isAndroid()) return false;
    try { return (await NativeBgmMixer.isPlaying()).playing; } catch { return false; }
  },
  onCompleted(cb: () => void) {
    if (!isAndroid()) return { remove: async () => {} } as PluginListenerHandle;
    let handle: PluginListenerHandle | null = null;
    NativeBgmMixer.addListener('completed', () => cb()).then(h => { handle = h; }).catch(() => {});
    return { remove: async () => { try { await handle?.remove(); } catch {} } } as PluginListenerHandle;
  },
  onError(cb: (msg: string) => void) {
    if (!isAndroid()) return { remove: async () => {} } as PluginListenerHandle;
    let handle: PluginListenerHandle | null = null;
    NativeBgmMixer.addListener('error', (d) => cb(d?.message ?? 'bgm error')).then(h => { handle = h; }).catch(() => {});
    return { remove: async () => { try { await handle?.remove(); } catch {} } } as PluginListenerHandle;
  },
};

export default NativeBgmMixer;
