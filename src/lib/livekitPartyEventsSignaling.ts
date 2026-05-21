/**
 * Pkg80: Party Room ephemeral events over LiveKit DataPackets.
 *
 * Replaces (NO dual-path per Pkg78 policy):
 *   - `join_broadcast_party_${roomId}` Supabase Realtime channel
 *     → event `participant_joined`
 *   - `.on('broadcast', { event: 'seat_action' })` listener on
 *     `party-room-all-${roomId}` (the postgres_changes subscriptions on
 *     that same channel STAY — DB is source of truth for participants,
 *     seat_requests, and party_room_messages persistence/history).
 *
 * Two ephemeral event types (no DB persistence on this path):
 *   - 'participant_joined' — pre-rendered self-profile + entry animation
 *      URLs so receivers can show Bigo-style join banner without an extra
 *      `profiles_public` round-trip. The postgres_changes INSERT on
 *      `party_room_participants` remains the safety net.
 *   - 'seat_action'        — host approve / reject seat request +
 *      requester self-submit notification. The seat row is already
 *      written to `seat_requests` / `party_room_participants` BEFORE this
 *      publish, so receivers get instant UI; postgres_changes converges
 *      the canonical state.
 *
 * Cost guards ($1400 protection — NEVER violate):
 *  - NO new Supabase Realtime channels (reuses LiveKit Room already
 *    maintained by usePartyRoomWebRTC).
 *  - NO setInterval / polling.
 *  - NO cross-user profile reads (sender packs display metadata into
 *    the envelope; receivers render directly).
 *  - Per-feature kill-switch: `app_settings.livekit_signaling_enabled.presence`.
 *    When OFF, `publishPartyEvent` returns false instantly.
 *  - 400ms client dedupe via shared `isDuplicateEnvelope`.
 *  - Scope-strict — envelope must declare `id === roomId` to match.
 */
import { Room, RoomEvent, type RemoteParticipant } from 'livekit-client';
import {
  buildEnvelope,
  decodeEnvelope,
  encodeEnvelope,
  isDuplicateEnvelope,
  isLiveKitEnabled,
} from './livekitSignaling';

export type PartyEventType =
  | 'participant_joined'
  | 'seat_action';

export interface ParticipantJoinedPayload {
  type: 'participant_joined';
  roomId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  userLevel: number;
  entranceAnimationUrl?: string | null;
  entranceSoundUrl?: string | null;
  entryNameBarUrl?: string | null;
  vehicleAnimationUrl?: string | null;
  timestamp: number;
}

export interface SeatActionPayload {
  type: 'seat_action';
  roomId: string;
  /** new_request = requester sending, approved/rejected = host sending */
  action: 'new_request' | 'approved' | 'rejected';
  requester_id: string;
  /** required for new_request + approved */
  seat_position?: number;
  /** display name for the host-side new-request toast (optional) */
  requester_name?: string;
  /** seat_requests row id (set for approved/rejected) */
  request_id?: string;
  timestamp: number;
}

export type PartyEventPayload = ParticipantJoinedPayload | SeatActionPayload;

export interface PartyEventDetail<P extends PartyEventPayload = PartyEventPayload> {
  payload: P;
  /** LiveKit participant identity that published the packet */
  sender?: string;
}

interface Entry {
  room: Room;
  handler: (
    payload: Uint8Array,
    participant?: RemoteParticipant,
  ) => void;
}

const registry = new Map<string, Entry>();

function makeHandler(roomId: string) {
  return (payload: Uint8Array, participant?: RemoteParticipant) => {
    const env = decodeEnvelope(payload);
    if (!env || env.f !== 'party_event') return;
    if (isDuplicateEnvelope(env.id)) return;

    const p = (env.p ?? {}) as Partial<PartyEventPayload>;

    // Strict roomId guard — never leak a sibling party's events.
    if (!p || (p as any).roomId !== roomId) return;
    if (env.t !== p.type) return;

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent<PartyEventDetail>('livekit-party-event', {
          detail: {
            payload: p as PartyEventPayload,
            sender: participant?.identity,
          },
        }),
      );
    }
  };
}

/** Bind a party LiveKit Room. Idempotent (re-registers cleanly). */
export function registerPartyEventsRoom(
  roomId: string | null | undefined,
  room: Room | null | undefined,
) {
  if (!roomId || !room) return;
  unregisterPartyEventsRoom(roomId);

  const handler = makeHandler(roomId);
  try {
    room.on(RoomEvent.DataReceived, handler);
  } catch {
    return;
  }
  registry.set(roomId, { room, handler });
}

export function unregisterPartyEventsRoom(roomId: string | null | undefined) {
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
 * Publish a party event packet. Always safe — never throws.
 * Returns `true` only when actually sent over LiveKit.
 *
 * Caller MUST have already persisted the corresponding DB row
 * (seat_requests / party_room_participants) BEFORE invoking this.
 */
export async function publishPartyEvent(
  roomId: string,
  payload: PartyEventPayload,
): Promise<boolean> {
  if (!roomId) return false;
  const entry = registry.get(roomId);
  if (!entry) return false;
  const room = entry.room;
  if (!room || room.state !== 'connected') return false;

  let allowed = false;
  try {
    allowed = await isLiveKitEnabled('presence');
  } catch {
    allowed = false;
  }
  if (!allowed) return false;

  try {
    const env = buildEnvelope<PartyEventPayload>(
      'party_event' as any, // family is "party_event"; kill-switch is 'presence'
      payload.type,
      { ...payload, roomId, timestamp: payload.timestamp ?? Date.now() },
      room.localParticipant?.identity,
    );
    const bytes = encodeEnvelope(env);
    await room.localParticipant.publishData(bytes, { reliable: true });
    return true;
  } catch (err) {
    console.warn('[Pkg80] publishPartyEvent failed:', err);
    return false;
  }
}

/** Test-only — clears the registry between specs. */
export function __resetPartyEventsRegistryForTests() {
  for (const [id] of registry) unregisterPartyEventsRoom(id);
}
