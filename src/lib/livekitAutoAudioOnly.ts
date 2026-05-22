/**
 * Pkg154: Auto Audio-Only on Poor Connection.
 *
 * Industry-standard pattern (Bigo/Tango/Zoom/Google Meet): when the local
 * client's connection quality stays poor or lost for a sustained period,
 * automatically unsubscribe from ALL remote video tracks (audio kept) to
 * conserve bandwidth and keep the conversation alive. When connection
 * recovers (good/excellent for a sustained period), re-subscribe.
 *
 * Built on Pkg101 ConnectionQualityChanged events — ZERO new Supabase
 * channels, ZERO polls, ZERO cross-user profile reads. Honors the
 * `auto_audio_only` kill-switch (default ON, admin can flip OFF instantly).
 *
 * Hysteresis:
 *   - ENTER audio-only after 8s sustained 'poor' or 'lost'
 *   - EXIT audio-only after 5s sustained 'good' or 'excellent'
 *
 * Dispatches `window 'livekit-auto-audio-only'` with
 *   { scope, id, active, reason }
 * so UI can render a banner ("Switched to audio-only — poor network").
 */
import {
  Room,
  RoomEvent,
  Track,
  type RemoteParticipant,
  type RemoteTrackPublication,
} from 'livekit-client';
import { isLiveKitEnabled } from './livekitSignaling';
import type { QualityScope, Quality, ConnectionQualityDetail } from './livekitConnectionQuality';

const ENTER_MS = 8000;
const EXIT_MS = 5000;

interface Entry {
  scope: QualityScope;
  id: string;
  room: Room;
  active: boolean;
  enterTimer: ReturnType<typeof setTimeout> | null;
  exitTimer: ReturnType<typeof setTimeout> | null;
  qualityHandler: (e: Event) => void;
  trackHandler: (pub: RemoteTrackPublication, participant: RemoteParticipant) => void;
}

const registry = new Map<string, Entry>();
const key = (scope: QualityScope, id: string) => `${scope}_${id}`;

function dispatch(scope: QualityScope, id: string, active: boolean, reason: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('livekit-auto-audio-only', {
      detail: { scope, id, active, reason },
    }),
  );
}

function setRemoteVideoSubscribed(room: Room, subscribed: boolean) {
  try {
    room.remoteParticipants.forEach((p) => {
      p.trackPublications.forEach((pub) => {
        const rp = pub as RemoteTrackPublication;
        if (rp.kind !== Track.Kind.Video) return;
        if (rp.source === Track.Source.ScreenShare) return; // keep screen share
        try { rp.setSubscribed(subscribed); } catch { /* ignore */ }
      });
    });
  } catch { /* ignore */ }
}

function enterMode(entry: Entry, reason: string) {
  if (entry.active) return;
  entry.active = true;
  setRemoteVideoSubscribed(entry.room, false);
  dispatch(entry.scope, entry.id, true, reason);
}

function exitMode(entry: Entry, reason: string) {
  if (!entry.active) return;
  entry.active = false;
  setRemoteVideoSubscribed(entry.room, true);
  dispatch(entry.scope, entry.id, false, reason);
}

export function registerAutoAudioOnlyRoom(
  scope: QualityScope,
  id: string | null | undefined,
  room: Room | null | undefined,
) {
  if (!id || !room) return;
  unregisterAutoAudioOnlyRoom(scope, id);

  const entry: Entry = {
    scope,
    id,
    room,
    active: false,
    enterTimer: null,
    exitTimer: null,
    qualityHandler: () => {},
    trackHandler: () => {},
  };

  entry.qualityHandler = (e: Event) => {
    const ce = e as CustomEvent<ConnectionQualityDetail>;
    const d = ce?.detail;
    if (!d || d.scope !== scope || d.id !== id) return;
    const q: Quality = d.local;
    const bad = q === 'poor' || q === 'lost';
    const good = q === 'good' || q === 'excellent';

    if (bad) {
      if (entry.exitTimer) { clearTimeout(entry.exitTimer); entry.exitTimer = null; }
      if (!entry.active && !entry.enterTimer) {
        entry.enterTimer = setTimeout(() => {
          entry.enterTimer = null;
          enterMode(entry, `local_${q}`);
        }, ENTER_MS);
      }
    } else if (good) {
      if (entry.enterTimer) { clearTimeout(entry.enterTimer); entry.enterTimer = null; }
      if (entry.active && !entry.exitTimer) {
        entry.exitTimer = setTimeout(() => {
          entry.exitTimer = null;
          exitMode(entry, `local_${q}`);
        }, EXIT_MS);
      }
    }
    // 'unknown' → no transition
  };

  // When new remote video publication arrives while in audio-only mode,
  // immediately unsubscribe so it never starts using bandwidth.
  entry.trackHandler = (pub: RemoteTrackPublication) => {
    if (!entry.active) return;
    if (pub.kind !== Track.Kind.Video) return;
    if (pub.source === Track.Source.ScreenShare) return;
    try { pub.setSubscribed(false); } catch { /* ignore */ }
  };

  try {
    window.addEventListener('livekit-connection-quality', entry.qualityHandler);
  } catch { return; }
  try {
    room.on(RoomEvent.TrackPublished, entry.trackHandler);
  } catch { /* ignore */ }

  registry.set(key(scope, id), entry);

  // Kill-switch is informational only — fetched async, used to short-circuit
  // future transitions if disabled.
  isLiveKitEnabled('auto_audio_only').then((on) => {
    if (!on) {
      // If admin disabled while we were active, restore video.
      if (entry.active) exitMode(entry, 'kill_switch_off');
      // Replace handler with no-op so future events are ignored.
      try { window.removeEventListener('livekit-connection-quality', entry.qualityHandler); } catch { /* ignore */ }
      entry.qualityHandler = () => {};
    }
  }).catch(() => {});
}

export function unregisterAutoAudioOnlyRoom(
  scope: QualityScope,
  id: string | null | undefined,
) {
  if (!id) return;
  const k = key(scope, id);
  const entry = registry.get(k);
  if (!entry) return;
  if (entry.enterTimer) clearTimeout(entry.enterTimer);
  if (entry.exitTimer) clearTimeout(entry.exitTimer);
  try { window.removeEventListener('livekit-connection-quality', entry.qualityHandler); } catch { /* ignore */ }
  try { entry.room.off(RoomEvent.TrackPublished, entry.trackHandler); } catch { /* ignore */ }
  // Best-effort: re-subscribe before tear-down (in case room outlives us).
  if (entry.active) {
    try { setRemoteVideoSubscribed(entry.room, true); } catch { /* ignore */ }
  }
  registry.delete(k);
}

export function isAutoAudioOnlyActive(scope: QualityScope, id: string | null | undefined): boolean {
  if (!id) return false;
  return registry.get(key(scope, id))?.active === true;
}

export function __resetAutoAudioOnlyRegistryForTests() {
  for (const [k] of registry) {
    const [scope, ...rest] = k.split('_');
    unregisterAutoAudioOnlyRoom(scope as QualityScope, rest.join('_'));
  }
}
