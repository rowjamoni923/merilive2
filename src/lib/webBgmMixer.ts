/**
 * Web BGM Mixer — Chamet/Bigo-parity background music for Live / Party /
 * Video-Party hosts on the WEB (browser) side.
 *
 * Strategy:
 *  - Play music locally via <audio>. Host hears it through speaker/headset.
 *  - Route the same <audio> through a WebAudio graph into a
 *    MediaStreamAudioDestinationNode → gives a MediaStreamTrack (music).
 *  - Publish that track to the connected LiveKit Room as a SECOND audio
 *    source (`Track.Source.ScreenShareAudio` slot — reserved for
 *    non-microphone audio). Remote viewers hear the music mixed with the
 *    host mic — no browser-level mic ducking, no other-tab pause.
 *  - Other browser tabs (Spotify Web, YouTube) keep playing independently
 *    because we never take exclusive audio focus — the browser doesn't
 *    grant one to a tab.
 *
 * Register the LiveKit Room from the host page:
 *   import { setBgmLiveKitRoom } from '@/lib/webBgmMixer';
 *   setBgmLiveKitRoom(room);   // when connected
 *   setBgmLiveKitRoom(null);   // on disconnect
 */

import { Track, LocalAudioTrack, type Room } from 'livekit-client';

let currentRoom: Room | null = null;
let audioEl: HTMLAudioElement | null = null;
let ctx: AudioContext | null = null;
let srcNode: MediaElementAudioSourceNode | null = null;
let destNode: MediaStreamAudioDestinationNode | null = null;
let publishedTrack: LocalAudioTrack | null = null;
let volume = 0.8;
let looping = true;

export function setBgmLiveKitRoom(room: Room | null) {
  currentRoom = room;
  if (!room && publishedTrack) {
    // Room gone — drop the published track.
    void unpublishTrack();
  }
}

async function unpublishTrack() {
  try {
    if (publishedTrack && currentRoom?.localParticipant) {
      await currentRoom.localParticipant.unpublishTrack(publishedTrack, true);
    }
  } catch { /* ignore */ }
  try { publishedTrack?.stop(); } catch { /* ignore */ }
  publishedTrack = null;
}

function teardown() {
  void unpublishTrack();
  try { audioEl?.pause(); } catch { /* ignore */ }
  try { srcNode?.disconnect(); } catch { /* ignore */ }
  try { destNode?.disconnect(); } catch { /* ignore */ }
  audioEl = null; srcNode = null; destNode = null;
}

export const webBgmMixer = {
  async play(opts: { url: string; loop?: boolean; volume?: number }): Promise<{ playing: boolean; durationMs: number }> {
    if (typeof window === 'undefined') return { playing: false, durationMs: 0 };
    looping = opts.loop ?? true;
    volume = Math.max(0, Math.min(1, opts.volume ?? 0.8));

    teardown();

    try {
      const el = new Audio(opts.url);
      el.crossOrigin = 'anonymous';
      el.loop = looping;
      el.volume = volume;
      el.preload = 'auto';
      audioEl = el;

      // Wait for metadata so duration is available.
      await new Promise<void>((resolve, reject) => {
        el.addEventListener('loadedmetadata', () => resolve(), { once: true });
        el.addEventListener('error', () => reject(new Error('audio load failed')), { once: true });
      });

      // Build WebAudio graph → MediaStreamTrack.
      const AC = (window.AudioContext || (window as any).webkitAudioContext);
      const ac = new AC();
      ctx = ac;
      const src = ac.createMediaElementSource(el);
      const dest = ac.createMediaStreamDestination();
      // Fan out: local speaker AND MediaStream (for LiveKit publish).
      src.connect(ac.destination);
      src.connect(dest);
      srcNode = src;
      destNode = dest;

      await el.play();

      // If a LiveKit room is registered, publish the music track so viewers hear it.
      if (currentRoom?.localParticipant) {
        try {
          const mst = dest.stream.getAudioTracks()[0];
          if (mst) {
            const lat = new LocalAudioTrack(mst, undefined, false);
            await currentRoom.localParticipant.publishTrack(lat, {
              source: Track.Source.ScreenShareAudio,
              name: 'bgm',
              dtx: false,
              red: false,
              stopMicTrackOnMute: false,
            });
            publishedTrack = lat;
          }
        } catch (e) {
          // Local playback still works even if publish fails.
          console.warn('[webBgmMixer] publish failed', e);
        }
      }

      return { playing: true, durationMs: Math.round((el.duration || 0) * 1000) };
    } catch (e) {
      teardown();
      throw e;
    }
  },
  async pause() { try { audioEl?.pause(); } catch { /* ignore */ } },
  async resume() { try { await audioEl?.play(); } catch { /* ignore */ } },
  async stop() { teardown(); },
  async setVolume(v: number) {
    volume = Math.max(0, Math.min(1, v));
    if (audioEl) audioEl.volume = volume;
  },
  async isPlaying() { return !!audioEl && !audioEl.paused; },
};
