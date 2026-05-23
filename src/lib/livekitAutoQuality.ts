/**
 * Pkg195 — Auto-degrade subscribed video quality on poor connection.
 *
 * Bridges Pkg101 (ConnectionQuality) → Pkg193 (setRemoteVideoQuality).
 * Listens to `livekit-connection-quality` (own local quality) and clamps
 * every subscribed remote camera track to a sensible layer:
 *
 *   excellent / good  → HIGH
 *   poor              → LOW   (480p-ish)
 *   lost / unknown    → leave as-is (avoid oscillation while reconnecting)
 *
 * Adds hysteresis: only re-applies on quality transitions, and only after
 * `holdMs` of stable readings to dampen flapping. Plays well alongside
 * adaptiveStream (Pkg194) — manual clamp wins until released.
 *
 * Pure listener — no Supabase, no polling, $1400-rule safe.
 */

import { VideoQuality } from 'livekit-client';
import {
  setRemoteVideoQuality,
  type TrackSourceKey,
} from './livekitRemoteTrackControl';
import {
  type ConnectionQualityDetail,
  type Quality,
  type QualityScope,
} from './livekitConnectionQuality';
import { _getRegisteredRoom } from './livekitStreams';

const QUALITY_EVENT = 'livekit-connection-quality';

export interface AutoQualityOptions {
  scope: QualityScope;
  id: string;
  /** Stable-quality dwell time before applying a downgrade/upgrade (default 4000 ms). */
  holdMs?: number;
  /** Track sources to clamp (default: ['camera']). */
  sources?: TrackSourceKey[];
  /** Set true to disable upgrades (only ever clamp down). */
  noUpgrade?: boolean;
}

interface RunState {
  pendingQuality: Quality | null;
  appliedQuality: Quality | null;
  timer: ReturnType<typeof setTimeout> | null;
  handler: (e: Event) => void;
}

const running = new Map<string, RunState>();
const key = (scope: QualityScope, id: string) => `${scope}_${id}`;

function targetLayer(q: Quality): VideoQuality | null {
  switch (q) {
    case 'excellent':
    case 'good':
      return VideoQuality.HIGH;
    case 'poor':
      return VideoQuality.LOW;
    default:
      return null; // lost / unknown — do nothing
  }
}

function applyToAllRemotes(
  scope: QualityScope,
  id: string,
  layer: VideoQuality,
  sources: TrackSourceKey[],
) {
  const room = _getRegisteredRoom(scope, id);
  if (!room) return;
  room.remoteParticipants.forEach((p) => {
    if (!p?.identity) return;
    for (const src of sources) {
      try {
        setRemoteVideoQuality(scope, id, p.identity, src, layer);
      } catch {
        /* ignore single-track failure */
      }
    }
  });
}

export function startAutoQuality(opts: AutoQualityOptions): () => void {
  const holdMs = opts.holdMs ?? 4000;
  const sources = opts.sources ?? ['camera'];
  const k = key(opts.scope, opts.id);

  stopAutoQuality(opts.scope, opts.id);

  const state: RunState = {
    pendingQuality: null,
    appliedQuality: null,
    timer: null,
    handler: () => {},
  };

  state.handler = (evt: Event) => {
    const e = evt as CustomEvent<ConnectionQualityDetail>;
    const d = e.detail;
    if (!d || d.scope !== opts.scope || d.id !== opts.id) return;
    const q = d.local;
    if (q === state.pendingQuality) return;
    state.pendingQuality = q;

    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }

    state.timer = setTimeout(() => {
      state.timer = null;
      if (state.pendingQuality !== q) return; // changed again
      const layer = targetLayer(q);
      if (layer == null) return;
      // Skip upgrades if asked.
      if (
        opts.noUpgrade &&
        state.appliedQuality === 'poor' &&
        (q === 'good' || q === 'excellent')
      ) {
        return;
      }
      if (state.appliedQuality === q) return;
      applyToAllRemotes(opts.scope, opts.id, layer, sources);
      state.appliedQuality = q;
    }, holdMs);
  };

  if (typeof window !== 'undefined') {
    window.addEventListener(QUALITY_EVENT, state.handler as EventListener);
  }
  running.set(k, state);

  return () => stopAutoQuality(opts.scope, opts.id);
}

export function stopAutoQuality(scope: QualityScope, id: string): void {
  const k = key(scope, id);
  const state = running.get(k);
  if (!state) return;
  if (state.timer) clearTimeout(state.timer);
  if (typeof window !== 'undefined') {
    window.removeEventListener(QUALITY_EVENT, state.handler as EventListener);
  }
  running.delete(k);
}

export function isAutoQualityActive(scope: QualityScope, id: string): boolean {
  return running.has(key(scope, id));
}
