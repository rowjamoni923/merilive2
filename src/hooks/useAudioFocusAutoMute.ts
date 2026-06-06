/**
 * Pkg444 (Phase 6) — Auto-mute mic on transient audio-focus loss.
 *
 * Bridges the `audio-focus-change` window CustomEvent emitted by
 * `useNativeAudioFocus` (Phase 5) into a UI-level mic toggle.
 *
 * Behaviour:
 *   - On AUDIOFOCUS_LOSS_TRANSIENT / LOSS_TRANSIENT_CAN_DUCK / LOSS
 *     (incoming phone call, alarm, voice assistant): snapshot the
 *     user's current mic state and force-mute via `setMicEnabled(false)`.
 *   - On AUDIOFOCUS_GAIN: restore the snapshotted state (only if we
 *     were the ones who muted).
 *
 * The user's own taps on Mute/Unmute clear the snapshot so we never
 * un-mute against their explicit choice.
 *
 * Web platforms never receive these events (native plugin is a no-op),
 * so the hook is safe to mount unconditionally.
 */
import { useEffect, useRef } from 'react';
import {
  AUDIO_FOCUS_CHANGE_EVENT,
  type AudioFocusIntent,
} from '@/hooks/useNativeAudioFocus';
import type { FocusChange } from '@/plugins/AudioFocus';

interface UseAudioFocusAutoMuteOptions {
  /** When false the hook is dormant (no event subscription). */
  enabled: boolean;
  /** Current mic state — used to snapshot pre-loss state. */
  isMicEnabled: boolean;
  /** Callback to mute/unmute mic. Must be stable or wrapped in useCallback. */
  setMicEnabled: (enabled: boolean) => void | Promise<void>;
  /** Optional: only react when the active intent matches (default: any). */
  intent?: AudioFocusIntent;
}

const LOSS_CHANGES: ReadonlyArray<FocusChange> = [
  'loss',
  'loss_transient',
  'loss_transient_can_duck',
];

export function useAudioFocusAutoMute({
  enabled,
  isMicEnabled,
  setMicEnabled,
  intent,
}: UseAudioFocusAutoMuteOptions): void {
  // Latest values without re-subscribing.
  const isMicEnabledRef = useRef(isMicEnabled);
  const setMicEnabledRef = useRef(setMicEnabled);
  const restoreToRef = useRef<boolean | null>(null); // null = no auto-mute in flight

  useEffect(() => { isMicEnabledRef.current = isMicEnabled; }, [isMicEnabled]);
  useEffect(() => { setMicEnabledRef.current = setMicEnabled; }, [setMicEnabled]);

  // If the user manually toggles mic while we hold a snapshot, drop the
  // snapshot — they've taken back control.
  useEffect(() => {
    if (restoreToRef.current === null) return;
    // Manual mute during auto-mute window: keep muted, drop snapshot.
    // Manual unmute during auto-mute window: same — they want sound back now.
    restoreToRef.current = null;
  }, [isMicEnabled]);

  useEffect(() => {
    if (!enabled) return;

    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ change: FocusChange; intent: AudioFocusIntent }>).detail;
      if (!detail) return;
      if (intent && detail.intent !== intent) return;

      if (LOSS_CHANGES.includes(detail.change)) {
        // Only snapshot once per loss window.
        if (restoreToRef.current === null) {
          restoreToRef.current = isMicEnabledRef.current;
          if (isMicEnabledRef.current) {
            try { void setMicEnabledRef.current(false); } catch { /* ignore */ }
          }
        }
        return;
      }

      if (detail.change === 'gain') {
        const restore = restoreToRef.current;
        restoreToRef.current = null;
        if (restore === true && isMicEnabledRef.current === false) {
          try { void setMicEnabledRef.current(true); } catch { /* ignore */ }
        }
      }
    };

    window.addEventListener(AUDIO_FOCUS_CHANGE_EVENT, handler as EventListener);
    return () => {
      window.removeEventListener(AUDIO_FOCUS_CHANGE_EVENT, handler as EventListener);
      restoreToRef.current = null;
    };
  }, [enabled, intent]);
}

export default useAudioFocusAutoMute;
