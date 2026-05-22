/**
 * Pkg80: Party Room ephemeral events over LiveKit DataPackets.
 *
 * Replaces (NO dual-path per Pkg78 policy):
 *   - `join_broadcast_party_${roomId}` Supabase Realtime channel
 *     → event `participant_joined`
 *   - `.on('broadcast', { event: 'seat_action' })` listener on
 *     `party-room-all-${roomId}`. No party-room postgres_changes fallback
 *     remains; DB rows are only persistence/history for REST snapshots.
 *
 * Two ephemeral event types (no DB persistence on this path):
 *   - 'participant_joined' — pre-rendered self-profile + entry animation
 *      URLs so receivers can show Bigo-style join banner without an extra
 *      `profiles_public` round-trip.
 *   - 'seat_action'        — host approve / reject seat request +
 *      requester self-submit notification. The seat row is already
 *      written to `seat_requests` / `party_room_participants` BEFORE this
 *      publish, so receivers get instant UI while late joiners read REST.
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
  | 'participant_left'
  | 'seat_action'
  | 'room_state_changed';

/**
 * Pkg81b: ParticipantDisconnected is a LOCAL LiveKit RoomEvent — every
 * remote client fires it independently when a participant leaves. No
 * DataPacket needs to be published; we only translate the LiveKit event
 * into the same `livekit-party-event` window event so PartyRoom /
 * UnifiedPartyRoom can converge their handlers.
 */
export interface ParticipantLeftPayload {
  type: 'participant_left';
  roomId: string;
  /** LiveKit participant identity (usually the user's profile id). */
  userId: string;
  timestamp: number;
}

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

/**
 * Pkg81: replaces 3 Supabase Realtime channels in PartyRoom.tsx:
 *   - `party-room-bg-${roomId}`     (party_rooms.background_id UPDATE)
 *   - `party-room-status-${roomId}` (party_rooms.active_seats / is_active UPDATE)
 *   - active_seats half of `party-room-all-${roomId}`
 *
 * Sender = host (only host can change bg/seats). Receiver = every participant.
 * Late-join state comes from the existing party_rooms SELECT on mount —
 * no postgres_changes subscription required.
 */
export interface RoomStateChangedPayload {
  type: 'room_state_changed';
  roomId: string;
  /** Pre-resolved background row so receivers skip a `party_room_backgrounds` round-trip. */
  background?: {
    id: string;
    image_url?: string | null;
    gradient_css?: string | null;
  } | null;
  /** Direct background_url (when host picks a free preset that doesn't have a backgrounds row). */
  background_url?: string | null;
  active_seats?: number;
  is_active?: boolean;
  timestamp: number;
}

export type PartyEventPayload =
  | ParticipantJoinedPayload
  | ParticipantLeftPayload
  | SeatActionPayload
  | RoomStateChangedPayload;

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
  /** Pkg81b: LiveKit RoomEvent.ParticipantDisconnected → participant_left */
  leftHandler?: (participant: RemoteParticipant) => void;
}

const registry = new Map<string, Entry>();

const FAMILY = 'party' as const;
const PARTY_EVENT_TYPES: ReadonlySet<string> = new Set<PartyEventType>([
  'participant_joined',
  'participant_left',
  'seat_action',
  'room_state_changed',
]);

function dispatchPartyEvent(payload: PartyEventPayload, sender?: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<PartyEventDetail>('livekit-party-event', {
      detail: { payload, sender },
    }),
  );
}

function makeHandler(roomId: string) {
  return (payload: Uint8Array, participant?: RemoteParticipant) => {
    const env = decodeEnvelope(payload);
    if (!env || env.f !== FAMILY) return;
    if (!PARTY_EVENT_TYPES.has(env.t)) return;
    if (isDuplicateEnvelope(env.id)) return;

    const p = (env.p ?? {}) as Partial<PartyEventPayload>;

    if (!p || (p as any).roomId !== roomId) return;
    if (env.t !== p.type) return;

    dispatchPartyEvent(p as PartyEventPayload, participant?.identity);
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
  const leftHandler = (participant: RemoteParticipant) => {
    const userId = participant?.identity;
    if (!userId) return;
    dispatchPartyEvent({
      type: 'participant_left',
      roomId,
      userId,
      timestamp: Date.now(),
    });
  };
  try {
    room.on(RoomEvent.DataReceived, handler);
    room.on(RoomEvent.ParticipantDisconnected, leftHandler);
  } catch {
    return;
  }
  registry.set(roomId, { room, handler, leftHandler });
}

export function unregisterPartyEventsRoom(roomId: string | null | undefined) {
  if (!roomId) return;
  const entry = registry.get(roomId);
  if (!entry) return;
  try {
    entry.room.off(RoomEvent.DataReceived, entry.handler);
    if (entry.leftHandler) entry.room.off(RoomEvent.ParticipantDisconnected, entry.leftHandler);
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
      FAMILY,
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

/**
 * Pkg81 helper — convenience wrapper for the host-only `room_state_changed`
 * publish. Always safe to call from any code path (no-op when caller is not
 * the host LiveKit publisher / room not registered / kill-switch off).
 */
export async function publishRoomStateChanged(
  roomId: string,
  patch: Omit<RoomStateChangedPayload, 'type' | 'roomId' | 'timestamp'>,
): Promise<boolean> {
  return publishPartyEvent(roomId, {
    type: 'room_state_changed',
    roomId,
    timestamp: Date.now(),
    ...patch,
  });
}

/** Test-only — clears the registry between specs. */
export function __resetPartyEventsRegistryForTests() {
  for (const [id] of registry) unregisterPartyEventsRoom(id);
}
