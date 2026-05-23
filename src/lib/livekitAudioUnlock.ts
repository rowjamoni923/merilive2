/**
 * Pkg201 — iOS Safari audio playback unlock (M2).
 *
 * On iOS Safari (and sometimes desktop Safari/Chrome with autoplay policy),
 * remote audio tracks cannot start playing until a user gesture has been
 * observed on the page. LiveKit's `Room.canPlaybackAudio` becomes `false`
 * in that state and `Room.startAudio()` must be called from inside a click
 * / touch handler.
 *
 * This module:
 *  - Subscribes to `RoomEvent.AudioPlaybackStatusChanged` on a registered
 *    Room (Pkg121 registry — `live` / `party` / `call` scopes).
 *  - Tracks current `canPlaybackAudio` state per `(scope,id)`.
 *  - Emits a `livekit-audio-playback-blocked` / `livekit-audio-playback-ok`
 *    window event so any overlay UI can react without prop-drilling.
 *  - Exposes a `unlockAudioPlayback(scope,id)` helper that MUST be called
 *    from inside a user gesture (click / touch). It wraps `room.startAudio()`
 *    and resolves with the new `canPlaybackAudio` value.
 *
 * Pure listener + on-demand unlock — no polling, no Supabase, no behaviour
 * change for non-iOS / non-Safari users (event simply never fires blocked).
 * $1400-rule safe.
 */

import { Room, RoomEvent } from 'livekit-client';
import { _getRegisteredRoom, type StreamScope } from './livekitStreams';

export type AudioUnlockScope = StreamScope;

interface RunState {
  room: Room;
  blocked: boolean;
  handler: () => void;
}

const runs = new Map<string, RunState>();

const k = (scope: AudioUnlockScope, id: string) => `${scope}_${id}`;

export const AUDIO_PLAYBACK_BLOCKED_EVENT = 'livekit-audio-playback-blocked';
export const AUDIO_PLAYBACK_OK_EVENT = 'livekit-audio-playback-ok';

export interface AudioPlaybackEventDetail {
  scope: AudioUnlockScope;
  id: string;
  canPlaybackAudio: boolean;
}

function emit(scope: AudioUnlockScope, id: string, canPlaybackAudio: boolean) {
  if (typeof window === 'undefined') return;
  const name = canPlaybackAudio ? AUDIO_PLAYBACK_OK_EVENT : AUDIO_PLAYBACK_BLOCKED_EVENT;
  window.dispatchEvent(
    new CustomEvent<AudioPlaybackEventDetail>(name, {
      detail: { scope, id, canPlaybackAudio },
    }),
  );
}

/**
 * Begin watching audio playback status on a registered Room.
 * Safe to call multiple times — stops existing watcher first.
 */
export function startAudioUnlockWatcher(scope: AudioUnlockScope, id: string): boolean {
  const room = _getRegisteredRoom(scope, id);
  if (!room) return false;

  stopAudioUnlockWatcher(scope, id);

  const state: RunState = {
    room,
    blocked: !room.canPlaybackAudio,
    handler: () => {
      const can = room.canPlaybackAudio;
      state.blocked = !can;
      emit(scope, id, can);
    },
  };

  room.on(RoomEvent.AudioPlaybackStatusChanged, state.handler);
  runs.set(k(scope, id), state);

  // Fire an initial event so UI mounts in the correct state.
  emit(scope, id, room.canPlaybackAudio);
  return true;
}

export function stopAudioUnlockWatcher(scope: AudioUnlockScope, id: string) {
  const key = k(scope, id);
  const state = runs.get(key);
  if (!state) return;
  try {
    state.room.off(RoomEvent.AudioPlaybackStatusChanged, state.handler);
  } catch {
    /* ignore */
  }
  runs.delete(key);
}

export function isAudioPlaybackBlocked(scope: AudioUnlockScope, id: string): boolean {
  const state = runs.get(k(scope, id));
  if (state) return state.blocked;
  const room = _getRegisteredRoom(scope, id);
  return room ? !room.canPlaybackAudio : false;
}

/**
 * MUST be called from inside a user-gesture handler (onClick / onTouchEnd).
 * Returns `true` if playback is now unlocked.
 */
export async function unlockAudioPlayback(
  scope: AudioUnlockScope,
  id: string,
): Promise<boolean> {
  const room = _getRegisteredRoom(scope, id);
  if (!room) return false;
  try {
    await room.startAudio();
  } catch (err) {
    console.warn('[livekitAudioUnlock] startAudio failed', err);
  }
  const can = room.canPlaybackAudio;
  const state = runs.get(k(scope, id));
  if (state) state.blocked = !can;
  emit(scope, id, can);
  return can;
}

/**
 * Convenience: try to unlock every currently-watched room. Useful when you
 * attach a single global "Tap to enable sound" overlay and want it to cover
 * all live rooms at once.
 */
export async function unlockAllAudioPlayback(): Promise<void> {
  await Promise.all(
    Array.from(runs.entries()).map(async ([, state]) => {
      try {
        await state.room.startAudio();
        const can = state.room.canPlaybackAudio;
        state.blocked = !can;
      } catch {
        /* ignore */
      }
    }),
  );
}
