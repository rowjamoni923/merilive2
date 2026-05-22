/**
 * Pkg101: Connection Quality detection via LiveKit `RoomEvent.ConnectionQualityChanged`.
 *
 * LiveKit's SFU continuously measures each participant's network quality
 * (Excellent / Good / Poor / Lost / Unknown) and emits ConnectionQualityChanged.
 * We piggy-back on the EXISTING Room (call/live/party) registered by
 * Pkg73/74/75 — no new Supabase channels, no polling, no profile reads.
 *
 * Standard pattern used by Bigo / Tango / Zoom / Google Meet — shows the
 * network bars indicator on each video tile and lets viewers know when
 * their own connection is degrading.
 *
 * Dispatches a `livekit-connection-quality` CustomEvent with:
 *   { scope, id, local: Quality, remotes: Record<identity, Quality> }
 *
 * Consumers: useConnectionQuality(scope, id).
 *
 * Cost guards: NO Supabase channels, NO polls, NO cross-user profile reads.
 * Kill-switch (informational): app_settings.livekit_signaling_enabled.presence
 */
import {
  Room,
  RoomEvent,
  ConnectionQuality,
  type Participant,
} from 'livekit-client';
import { isLiveKitEnabled } from './livekitSignaling';

export type QualityScope = 'call' | 'live' | 'party';
export type Quality = 'excellent' | 'good' | 'poor' | 'lost' | 'unknown';

export interface ConnectionQualityDetail {
  scope: QualityScope;
  id: string;
  local: Quality;
  remotes: Record<string, Quality>;
}

interface Entry {
  room: Room;
  handler: (quality: ConnectionQuality, participant: Participant) => void;
  remotes: Map<string, Quality>;
  local: Quality;
}

const registry = new Map<string, Entry>();
const key = (scope: QualityScope, id: string) => `${scope}_${id}`;

function mapQuality(q: ConnectionQuality | undefined | null): Quality {
  switch (q) {
    case ConnectionQuality.Excellent: return 'excellent';
    case ConnectionQuality.Good: return 'good';
    case ConnectionQuality.Poor: return 'poor';
    case ConnectionQuality.Lost: return 'lost';
    default: return 'unknown';
  }
}

function dispatch(scope: QualityScope, id: string, entry: Entry) {
  if (typeof window === 'undefined') return;
  const remotes: Record<string, Quality> = {};
  for (const [identity, q] of entry.remotes) remotes[identity] = q;
  window.dispatchEvent(
    new CustomEvent<ConnectionQualityDetail>('livekit-connection-quality', {
      detail: { scope, id, local: entry.local, remotes },
    }),
  );
}

export function registerConnectionQualityRoom(
  scope: QualityScope,
  id: string | null | undefined,
  room: Room | null | undefined,
) {
  if (!id || !room) return;
  unregisterConnectionQualityRoom(scope, id);

  const entry: Entry = { room, handler: () => {}, remotes: new Map(), local: 'unknown' };

  entry.handler = (quality: ConnectionQuality, participant: Participant) => {
    const q = mapQuality(quality);
    const localIdentity = room.localParticipant?.identity;
    if (participant?.identity && participant.identity === localIdentity) {
      entry.local = q;
    } else if (participant?.identity) {
      entry.remotes.set(participant.identity, q);
    }
    dispatch(scope, id, entry);
  };

  try {
    room.on(RoomEvent.ConnectionQualityChanged, entry.handler);
  } catch {
    return;
  }

  // Seed local quality from the room snapshot (may already be measured).
  try {
    entry.local = mapQuality(room.localParticipant?.connectionQuality);
    room.remoteParticipants.forEach((p) => {
      if (p?.identity) entry.remotes.set(p.identity, mapQuality(p.connectionQuality));
    });
  } catch { /* ignore */ }

  registry.set(key(scope, id), entry);
  dispatch(scope, id, entry);

  isLiveKitEnabled('presence').catch(() => {});
}

export function unregisterConnectionQualityRoom(
  scope: QualityScope,
  id: string | null | undefined,
) {
  if (!id) return;
  const k = key(scope, id);
  const entry = registry.get(k);
  if (!entry) return;
  try {
    entry.room.off(RoomEvent.ConnectionQualityChanged, entry.handler);
  } catch { /* room may already be disconnected */ }
  registry.delete(k);
}

export function getConnectionQuality(
  scope: QualityScope,
  id: string | null | undefined,
): { local: Quality; remotes: Record<string, Quality> } {
  if (!id) return { local: 'unknown', remotes: {} };
  const entry = registry.get(key(scope, id));
  if (!entry) return { local: 'unknown', remotes: {} };
  const remotes: Record<string, Quality> = {};
  for (const [i, q] of entry.remotes) remotes[i] = q;
  return { local: entry.local, remotes };
}

export function __resetConnectionQualityRegistryForTests() {
  for (const [k] of registry) {
    const [scope, ...rest] = k.split('_');
    unregisterConnectionQualityRoom(scope as QualityScope, rest.join('_'));
  }
}
