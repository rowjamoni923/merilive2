/**
 * Unified BGM Mixer — one API for HOST background music on Android + Web.
 *
 * Android → NativeBgmMixer (MediaPlayer + AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK,
 *           coexists with Spotify/YouTube; viewers hear via mic bridge).
 * Web     → webBgmMixer (HTMLAudioElement + WebAudio → LiveKit
 *           ScreenShareAudio track; other tabs coexist automatically).
 *
 * Usage from a host page:
 *   import { bgm, setBgmRoom } from '@/lib/bgmMixer';
 *   setBgmRoom(room);                              // after LiveKit connect
 *   await bgm.play({ url: musicUrl, loop: true }); // Play button
 *   await bgm.setVolume(0.5);
 *   await bgm.stop();                              // Stop / leave room
 *   setBgmRoom(null);                              // on disconnect
 */

import { Capacitor } from '@capacitor/core';
import { bgmMixer as nativeBgm } from '@/plugins/NativeBgmMixer';
import { webBgmMixer, setBgmLiveKitRoom } from '@/lib/webBgmMixer';
import type { Room } from 'livekit-client';

const isAndroid = () => Capacitor.getPlatform() === 'android' && Capacitor.isNativePlatform();

export const bgm = {
  async play(opts: { url: string; loop?: boolean; volume?: number }) {
    if (isAndroid()) return nativeBgm.play({ url: opts.url, loop: opts.loop, volume: opts.volume });
    return webBgmMixer.play(opts);
  },
  async pause() { isAndroid() ? await nativeBgm.pause() : await webBgmMixer.pause(); },
  async resume() { isAndroid() ? await nativeBgm.resume() : await webBgmMixer.resume(); },
  async stop() { isAndroid() ? await nativeBgm.stop() : await webBgmMixer.stop(); },
  async setVolume(v: number) { isAndroid() ? await nativeBgm.setVolume(v) : await webBgmMixer.setVolume(v); },
  async isPlaying(): Promise<boolean> {
    return isAndroid() ? await nativeBgm.isPlaying() : await webBgmMixer.isPlaying();
  },
};

/** Register the current LiveKit Room so web BGM can publish music to viewers. */
export function setBgmRoom(room: Room | null) {
  if (!isAndroid()) setBgmLiveKitRoom(room);
  // Android doesn't need this — the mic bridges music to viewers.
}
