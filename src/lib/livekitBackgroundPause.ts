/**
 * Pkg198 — Background-tab video pause / resume.
 *
 * When the browser tab goes hidden (Page Visibility API) or the window
 * loses focus for an extended period, downloading remote video wastes
 * bandwidth, CPU, and battery — the user can't see it anyway. Bigo / Tango
 * pause incoming video in this case and resume immediately on focus.
 *
 * Implementation: leans on Pkg193 `setRemoteTrackEnabled` (decode pause —
 * keeps subscription so resume is instant). Audio stays enabled so the
 * user can still hear the host while tabbed out. Configurable per-room.
 *
 * Pure listener — no Supabase, no polling, $1400-rule safe.
 */

import { setRemoteTrackEnabled } from './livekitRemoteTrackControl';
import { _getRegisteredRoom } from './livekitStreams';
import type { QualityScope } from './livekitConnectionQuality';

export interface BgPauseOpts {
  scope: QualityScope;
  id: string;
  /** Grace period after tab hidden before pausing (ms, default 1500). */
  graceMs?: number;
  /** Also pause screen-share tracks? (default true) */
  includeScreenShare?: boolean;
  /** Pause audio too? Most apps keep audio. (default false) */
  pauseAudio?: boolean;
}

interface RunState {
  visibilityHandler: () => void;
  blurHandler: () => void;
  focusHandler: () => void;
  pauseTimer: ReturnType<typeof setTimeout> | null;
  paused: boolean;
  opts: BgPauseOpts;
}

const running = new Map<string, RunState>();
const key = (scope: QualityScope, id: string) => `${scope}_${id}`;

function forEachRemoteTrack(
  scope: QualityScope,
  id: string,
  cb: (identity: string, source: 'camera' | 'microphone' | 'screen_share' | 'screen_share_audio') => void,
) {
  const room = _getRegisteredRoom(scope, id);
  if (!room) return;
  room.remoteParticipants.forEach((p) => {
    if (!p?.identity) return;
    p.videoTrackPublications.forEach((pub) => {
      if (pub.source === 'screen_share') cb(p.identity, 'screen_share');
      else cb(p.identity, 'camera');
    });
    p.audioTrackPublications.forEach((pub) => {
      if (pub.source === 'screen_share_audio') cb(p.identity, 'screen_share_audio');
      else cb(p.identity, 'microphone');
    });
  });
}

function applyEnabled(state: RunState, enabled: boolean) {
  const { scope, id, includeScreenShare = true, pauseAudio = false } = state.opts;
  forEachRemoteTrack(scope, id, (identity, source) => {
    if (source === 'camera') {
      setRemoteTrackEnabled(scope, id, identity, 'camera', enabled);
    } else if (source === 'screen_share') {
      if (includeScreenShare) setRemoteTrackEnabled(scope, id, identity, 'screen_share', enabled);
    } else if (source === 'microphone' || source === 'screen_share_audio') {
      if (pauseAudio) setRemoteTrackEnabled(scope, id, identity, source, enabled);
    }
  });
  state.paused = !enabled;
}

export function startBackgroundPause(opts: BgPauseOpts): () => void {
  if (typeof document === 'undefined') return () => {};
  const k = key(opts.scope, opts.id);
  stopBackgroundPause(opts.scope, opts.id);

  const grace = opts.graceMs ?? 1500;

  const state: RunState = {
    visibilityHandler: () => {},
    blurHandler: () => {},
    focusHandler: () => {},
    pauseTimer: null,
    paused: false,
    opts,
  };

  const schedulePause = () => {
    if (state.pauseTimer || state.paused) return;
    state.pauseTimer = setTimeout(() => {
      state.pauseTimer = null;
      if (document.visibilityState === 'hidden' || !document.hasFocus()) {
        applyEnabled(state, false);
      }
    }, grace);
  };

  const resume = () => {
    if (state.pauseTimer) {
      clearTimeout(state.pauseTimer);
      state.pauseTimer = null;
    }
    if (state.paused) applyEnabled(state, true);
  };

  state.visibilityHandler = () => {
    if (document.visibilityState === 'hidden') schedulePause();
    else resume();
  };
  state.blurHandler = () => schedulePause();
  state.focusHandler = () => resume();

  document.addEventListener('visibilitychange', state.visibilityHandler);
  window.addEventListener('blur', state.blurHandler);
  window.addEventListener('focus', state.focusHandler);

  running.set(k, state);
  return () => stopBackgroundPause(opts.scope, opts.id);
}

export function stopBackgroundPause(scope: QualityScope, id: string): void {
  const k = key(scope, id);
  const state = running.get(k);
  if (!state) return;
  if (state.pauseTimer) clearTimeout(state.pauseTimer);
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', state.visibilityHandler);
    window.removeEventListener('blur', state.blurHandler);
    window.removeEventListener('focus', state.focusHandler);
  }
  // Always restore tracks on stop so a teardown doesn't leave them disabled.
  if (state.paused) {
    try { applyEnabled(state, true); } catch { /* room may be gone */ }
  }
  running.delete(k);
}

export function isBackgroundPauseActive(scope: QualityScope, id: string): boolean {
  return running.has(key(scope, id));
}

export function isCurrentlyPaused(scope: QualityScope, id: string): boolean {
  return !!running.get(key(scope, id))?.paused;
}
