/**
 * Pkg444 (Phase 5) — Native Audio Focus binding hook.
 *
 * Wraps the Pkg267 AudioFocus plugin so any screen can declare its
 * audio intent with a single line. The hook owns the full lifecycle
 * (request on mount / abandon on unmount), keeps Spotify/YouTube
 * politely paused while we own audio, and bridges Android's
 * AUDIOFOCUS_LOSS_TRANSIENT (e.g. incoming phone call) to a window
 * event so live/call surfaces can mute mic + pause music until focus
 * is regained.
 *
 * Web platforms: every plugin call short-circuits to a no-op, so the
 * hook is safe to call from any surface unconditionally.
 */
import { useEffect } from 'react';
import {
  requestAudioFocus,
  abandonAudioFocus,
  setAudioMode,
  onAudioFocusChange,
  type AudioMode,
  type FocusChange,
} from '@/plugins/AudioFocus';

export type AudioFocusIntent =
  | 'call'      // private call — in_communication mode, earpiece routing
  | 'media'     // live stream / party / reel playback — normal mode
  | 'ringtone'; // incoming call ringing — ringtone mode, no focus request

export const AUDIO_FOCUS_CHANGE_EVENT = 'audio-focus-change';

interface UseNativeAudioFocusOptions {
  /** When false the hook does nothing. */
  enabled: boolean;
  /** Audio intent for this screen. */
  intent: AudioFocusIntent;
}

function intentToMode(intent: AudioFocusIntent): AudioMode {
  switch (intent) {
    case 'call':     return 'in_communication';
    case 'ringtone': return 'ringtone';
    case 'media':
    default:         return 'normal';
  }
}

/**
 * Acquire native audio focus + mode for the lifetime of the component.
 * Safe to mount/unmount repeatedly — every call releases on cleanup.
 *
 * Dispatches `audio-focus-change` window CustomEvent on every native
 * AudioManager focus transition (gain / loss / loss_transient /
 * loss_transient_can_duck). Consumers (LiveKit mic, ringtone player)
 * should mute on loss_transient* and restore on gain.
 */
export function useNativeAudioFocus({ enabled, intent }: UseNativeAudioFocusOptions): void {
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    (async () => {
      try {
        // Ringtone intent only changes mode — we do NOT steal focus from
        // whatever is currently playing (caller can still hear music until
        // they accept).
        if (intent !== 'ringtone') {
          await requestAudioFocus(intent === 'call' ? 'call' : 'media');
        }
        await setAudioMode(intentToMode(intent));
        if (cancelled) {
          await abandonAudioFocus();
          await setAudioMode('normal');
          return;
        }
        unsubscribe = await onAudioFocusChange((change: FocusChange) => {
          try {
            window.dispatchEvent(
              new CustomEvent<{ change: FocusChange; intent: AudioFocusIntent }>(
                AUDIO_FOCUS_CHANGE_EVENT,
                { detail: { change, intent } },
              ),
            );
          } catch { /* ignore */ }
        });
      } catch {
        /* ignore — best-effort */
      }
    })();

    return () => {
      cancelled = true;
      try { unsubscribe?.(); } catch { /* ignore */ }
      void (async () => {
        try {
          if (intent !== 'ringtone') await abandonAudioFocus();
          await setAudioMode('normal');
        } catch { /* ignore */ }
      })();
    };
  }, [enabled, intent]);
}

export default useNativeAudioFocus;
