/**
 * Pkg75: Party Room signaling over LiveKit DataPackets.
 *
 * Mirrors Pkg73 (private call) and Pkg74 (live stream) for party rooms.
 * The host publishes a `room_closed` packet to every participant in the
 * LiveKit room with sub-50ms latency.
 *
 * LiveKit-Purist update (Pkg78 / Pkg81b / Pkg87):
 *   - `party-room-close-${roomId}` Supabase broadcast — REMOVED.
 *   - `party_rooms` postgres_changes subscription — REMOVED.
 *   - Sole durable safety nets for viewers:
 *       1. LiveKit `RoomEvent.ParticipantDisconnected` (host leaves Room).
 *       2. 20s `party_rooms.is_active` REST poll in PartyRoom.tsx.
 *
 * Host leave flow (PartyRoom.tsx leaveRoom):
 *   1. AWAIT publishPartyClosed (so viewers learn within ~50ms while the
 *      host LiveKit Room is still `connected`).
 *   2. party_rooms UPDATE (is_active=false, ended_at).
 *   3. party_room_participants left_at update.
 *   4. cleanupWebRTC disconnects the Room.
 *
 * Cost guards ($1400 protection):
 *  - NO new Supabase Realtime channels (uses the LiveKit Room that
 *    usePartyRoomWebRTC already maintains for audio/video).
 *  - NO setInterval / polling inside this module.
 *  - NO cross-user profile reads.
 *  - Per-feature kill-switch: `app_settings.livekit_signaling_enabled.party`.
 *    When OFF, `publishPartyClosed` returns false instantly → viewers fall
 *    back to LiveKit `ParticipantDisconnected` + 20s status poll.
 */
import { Room, RoomEvent, type RemoteParticipant } from 'livekit-client';
import {
  buildEnvelope,
  decodeEnvelope,
  encodeEnvelope,
  isDuplicateEnvelope,
  isLiveKitEnabled,
} from './livekitSignaling';

export interface PartyClosedPayload {
  roomId: string;
  hostId: string;
  closedAt: string;
  reason?: string;
}

export interface PartyClosedDetail extends PartyClosedPayload {
  sender?: string;
}

interface Entry {
  room: Room;
  handler: (
    payload: Uint8Array,
    participant?: RemoteParticipant,
  ) => void;
}

// roomId → Room + DataReceived handler
const registry = new Map<string, Entry>();

function makeHandler(roomId: string) {
  return (payload: Uint8Array, participant?: RemoteParticipant) => {
    const env = decodeEnvelope(payload);
    if (!env || env.f !== 'party') return;
    if (isDuplicateEnvelope(env.id)) return;
    if (env.t !== 'room_closed') return;

    const p = (env.p ?? {}) as Partial<PartyClosedPayload>;
    if (p.roomId && p.roomId !== roomId) return;

    const detail: PartyClosedDetail = {
      roomId,
      hostId: p.hostId || env.s || 'unknown',
      closedAt: p.closedAt || new Date().toISOString(),
      reason: p.reason,
      sender: participant?.identity,
    };

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent<PartyClosedDetail>('livekit-party-closed', { detail }),
      );
    }
  };
}

/** Bind a party roomId to its LiveKit Room so we can publish/receive Pkg75 packets. */
export function registerPartyRoom(
  roomId: string | null | undefined,
  room: Room | null | undefined,
) {
  if (!roomId || !room) return;
  unregisterPartyRoom(roomId);

  const handler = makeHandler(roomId);
  try {
    room.on(RoomEvent.DataReceived, handler);
  } catch {
    return;
  }
  registry.set(roomId, { room, handler });
}

export function unregisterPartyRoom(roomId: string | null | undefined) {
  if (!roomId) return;
  const entry = registry.get(roomId);
  if (!entry) return;
  try {
    entry.room.off(RoomEvent.DataReceived, entry.handler);
  } catch {
    // ignore — room may already be disconnected
  }
  registry.delete(roomId);
}

/**
 * Publish a `room_closed` packet to every participant.
 * Returns `true` only when actually sent. Never throws.
 * Always safe to call in parallel with the Supabase broadcast path.
 */
export async function publishPartyClosed(
  roomId: string,
  payload: Omit<PartyClosedPayload, 'roomId'>,
): Promise<boolean> {
  if (!roomId) return false;
  const entry = registry.get(roomId);
  if (!entry) return false;
  const room = entry.room;
  if (!room || room.state !== 'connected') return false;

  let allowed = false;
  try {
    allowed = await isLiveKitEnabled('party');
  } catch {
    allowed = false;
  }
  if (!allowed) return false;

  try {
    const env = buildEnvelope<PartyClosedPayload>(
      'party',
      'room_closed',
      { roomId, ...payload },
      room.localParticipant?.identity,
    );
    const bytes = encodeEnvelope(env);
    await room.localParticipant.publishData(bytes, { reliable: true });
    return true;
  } catch (err) {
    console.warn('[Pkg75] publishPartyClosed failed:', err);
    return false;
  }
}

/** Test-only — clears the registry between specs. */
export function __resetPartySignalingRegistryForTests() {
  for (const [id] of registry) unregisterPartyRoom(id);
}
