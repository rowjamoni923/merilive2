import { registerPlugin, Capacitor, type PluginListenerHandle } from '@capacitor/core';

/**
 * Pkg257 — MediaSession bridge.
 * JS owns playback; this plugin reflects state to the OS lock screen,
 * Bluetooth headset, Wear OS, Android Auto, and Google Assistant.
 */
export interface MediaSessionPlugin {
  setMetadata(opts: {
    title: string;
    artist?: string;
    album?: string;
    duration?: number; // ms
    artworkUrl?: string;
  }): Promise<void>;
  setPlaybackState(opts: {
    state: 'playing' | 'paused' | 'stopped' | 'buffering';
    position?: number; // ms
    speed?: number;
  }): Promise<void>;
  release(): Promise<void>;
  addListener(
    event: 'action',
    cb: (e: { action: 'play' | 'pause' | 'stop' | 'next' | 'previous' | 'seek'; data?: { position?: number } }) => void
  ): Promise<PluginListenerHandle>;
}

const Native = registerPlugin<MediaSessionPlugin>('MediaSession');

export const isMediaSessionNative = () => Capacitor.getPlatform() === 'android';

/** Set lock-screen metadata. Safe to call on any platform. */
export async function setMediaMetadata(opts: Parameters<MediaSessionPlugin['setMetadata']>[0]) {
  if (isMediaSessionNative()) {
    try { await Native.setMetadata(opts); } catch {}
  }
  // Web fallback — browser Media Session API
  if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
    try {
      // @ts-ignore
      navigator.mediaSession.metadata = new (window as any).MediaMetadata({
        title: opts.title,
        artist: opts.artist || '',
        album: opts.album || '',
        artwork: opts.artworkUrl ? [{ src: opts.artworkUrl, sizes: '512x512', type: 'image/jpeg' }] : [],
      });
    } catch {}
  }
}

export async function setMediaPlaybackState(
  opts: Parameters<MediaSessionPlugin['setPlaybackState']>[0]
) {
  if (isMediaSessionNative()) {
    try { await Native.setPlaybackState(opts); } catch {}
  }
  if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
    try {
      // @ts-ignore
      navigator.mediaSession.playbackState =
        opts.state === 'playing' ? 'playing' : opts.state === 'paused' ? 'paused' : 'none';
    } catch {}
  }
}

export async function releaseMediaSession() {
  if (isMediaSessionNative()) {
    try { await Native.release(); } catch {}
  }
}

export type MediaSessionAction = 'play' | 'pause' | 'stop' | 'next' | 'previous' | 'seek';

/** Subscribe to lock-screen / headset / Auto / Assistant button presses. */
export async function onMediaSessionAction(
  cb: (action: MediaSessionAction, data?: { position?: number }) => void
): Promise<() => void> {
  const handles: Array<{ remove: () => void }> = [];

  if (isMediaSessionNative()) {
    const h = await Native.addListener('action', (e) => cb(e.action, e.data));
    handles.push(h);
  }

  if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
    const actions: MediaSessionAction[] = ['play', 'pause', 'stop', 'next', 'previous', 'seek'];
    const webMap: Record<MediaSessionAction, string> = {
      play: 'play', pause: 'pause', stop: 'stop',
      next: 'nexttrack', previous: 'previoustrack', seek: 'seekto',
    };
    actions.forEach((a) => {
      try {
        // @ts-ignore
        navigator.mediaSession.setActionHandler(webMap[a] as any, (details: any) => {
          cb(a, a === 'seek' ? { position: Math.round((details?.seekTime || 0) * 1000) } : undefined);
        });
      } catch {}
    });
    handles.push({
      remove: () => actions.forEach((a) => {
        // @ts-ignore
        try { navigator.mediaSession.setActionHandler(webMap[a] as any, null); } catch {}
      }),
    });
  }

  return () => handles.forEach((h) => h.remove());
}
