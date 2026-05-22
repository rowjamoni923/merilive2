/**
 * Live stream filter/beauty sync over the existing LiveKit Room.
 * Replaces the legacy `stream_filters_${streamId}` Supabase broadcast channel.
 */
import { Room, RoomEvent, type RemoteParticipant } from 'livekit-client';
import {
  buildEnvelope,
  decodeEnvelope,
  encodeEnvelope,
  isDuplicateEnvelope,
  isLiveKitEnabled,
} from './livekitSignaling';

export interface LiveFilterPayload {
  streamId: string;
  state: unknown;
  timestamp: number;
}

interface Entry {
  room: Room;
  handler: (payload: Uint8Array, participant?: RemoteParticipant) => void;
}

const FAMILY = 'live' as const;
const TYPE = 'filter_update';
const registry = new Map<string, Entry>();

function dispatchFilterUpdate(payload: LiveFilterPayload, sender?: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('livekit-live-filter', {
      detail: { payload, sender },
    }),
  );
}

function makeHandler(streamId: string) {
  return (payload: Uint8Array, participant?: RemoteParticipant) => {
    const env = decodeEnvelope(payload);
    if (!env || env.f !== FAMILY || env.t !== TYPE) return;
    if (isDuplicateEnvelope(env.id)) return;

    const p = (env.p ?? {}) as Partial<LiveFilterPayload>;
    if (!p || p.streamId !== streamId) return;
    dispatchFilterUpdate(p as LiveFilterPayload, participant?.identity);
  };
}

export function registerLiveFilterRoom(streamId: string | null | undefined, room: Room | null | undefined) {
  if (!streamId || !room) return;
  unregisterLiveFilterRoom(streamId);

  const handler = makeHandler(streamId);
  try {
    room.on(RoomEvent.DataReceived, handler);
  } catch {
    return;
  }
  registry.set(streamId, { room, handler });
}

export function unregisterLiveFilterRoom(streamId: string | null | undefined) {
  if (!streamId) return;
  const entry = registry.get(streamId);
  if (!entry) return;
  try {
    entry.room.off(RoomEvent.DataReceived, entry.handler);
  } catch {
    // ignore
  }
  registry.delete(streamId);
}

export async function publishLiveFilterUpdate(streamId: string, state: unknown): Promise<boolean> {
  const entry = registry.get(streamId);
  if (!entry || entry.room.state !== 'connected') return false;

  let allowed = false;
  try {
    allowed = await isLiveKitEnabled('live');
  } catch {
    allowed = false;
  }
  if (!allowed) return false;

  try {
    const env = buildEnvelope<LiveFilterPayload>(
      FAMILY,
      TYPE,
      { streamId, state, timestamp: Date.now() },
      entry.room.localParticipant?.identity,
    );
    await entry.room.localParticipant.publishData(encodeEnvelope(env), { reliable: true });
    return true;
  } catch (err) {
    console.warn('[LiveFilter] publish failed:', err);
    return false;
  }
}

export function __resetLiveFilterRegistryForTests() {
  for (const [id] of registry) unregisterLiveFilterRoom(id);
}