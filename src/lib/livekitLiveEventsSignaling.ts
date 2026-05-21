/**
 * Pkg82a: Live Stream ephemeral viewer-presence events over LiveKit DataPackets.
 *
 * Replaces (NO dual-path per Pkg78 policy, NO postgres_changes fallback per
 * Pkg81 LiveKit-Purist Policy) THREE Supabase Realtime channels in
 * src/pages/LiveStream.tsx:
 *
 *   1. `join_broadcast_${streamId}`           Supabase broadcast viewer_joined
 *   2. `stream_viewers_entrance_${streamId}`  postgres_changes on stream_viewers
 *   3. `stream_viewers_realtime_${streamId}`  postgres_changes on stream_viewers
 *
 * Two ephemeral event types:
 *   - 'viewer_joined' — pre-rendered self-profile + entry animation URLs so
 *      receivers can render Bigo-style join banner + entrance animation +
 *      viewer-list patch in <50ms without any extra `profiles_public` /
 *      `stream_viewers` round-trip.
 *   - 'viewer_left'   — translated from LiveKit `RoomEvent.ParticipantDisconnected`
 *      on every client (no publish needed — local LiveKit event).
 *
 * Persistence (durable `stream_viewers` rows for entrance-history / level
 * credit / late-join snapshot) stays on Supabase RPC — only the realtime
 * SUBSCRIPTION is removed.
 *
 * Cost guards ($1400 protection — NEVER violate):
 *  - NO new Supabase Realtime channels (reuses LiveKit Room maintained by
 *    useLiveKitClient).
 *  - NO setInterval / polling.
 *  - NO cross-user profile reads (sender packs all display metadata into
 *    the envelope; receivers render directly).
 *  - Per-feature kill-switch: `app_settings.livekit_signaling_enabled.presence`.
 *    When OFF, `publishLiveEvent` returns false instantly.
 *  - 400ms client dedupe via shared `isDuplicateEnvelope`.
 *  - Scope-strict — envelope must declare `streamId === streamId` to match.
 */
import { Room, RoomEvent, type RemoteParticipant } from 'livekit-client';
import {
  buildEnvelope,
  decodeEnvelope,
  encodeEnvelope,
  isDuplicateEnvelope,
  isLiveKitEnabled,
} from './livekitSignaling';

export type LiveEventType = 'viewer_joined' | 'viewer_left';

export interface ViewerJoinedPayload {
  type: 'viewer_joined';
  streamId: string;
  userId: string;
  appUid?: string | null;
  userName: string;
  userAvatar?: string | null;
  userLevel: number;
  entranceAnimationUrl?: string | null;
  entranceSoundUrl?: string | null;
  entryNameBarUrl?: string | null;
  vehicleAnimationUrl?: string | null;
  timestamp: number;
}

export interface ViewerLeftPayload {
  type: 'viewer_left';
  streamId: string;
  userId: string;
  timestamp: number;
}

export type LiveEventPayload = ViewerJoinedPayload | ViewerLeftPayload;

export interface LiveEventDetail<P extends LiveEventPayload = LiveEventPayload> {
  payload: P;
  sender?: string;
}

interface Entry {
  room: Room;
  handler: (payload: Uint8Array, participant?: RemoteParticipant) => void;
  leftHandler: (participant: RemoteParticipant) => void;
}

const registry = new Map<string, Entry>();

const FAMILY = 'live' as const;
const LIVE_EVENT_TYPES: ReadonlySet<string> = new Set<LiveEventType>([
  'viewer_joined',
  'viewer_left',
]);

function dispatchLiveEvent(payload: LiveEventPayload, sender?: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<LiveEventDetail>('livekit-live-event', {
      detail: { payload, sender },
    }),
  );
}

function makeHandler(streamId: string) {
  return (payload: Uint8Array, participant?: RemoteParticipant) => {
    const env = decodeEnvelope(payload);
    if (!env || env.f !== FAMILY) return;
    if (!LIVE_EVENT_TYPES.has(env.t)) return;
    if (isDuplicateEnvelope(env.id)) return;

    const p = (env.p ?? {}) as Partial<LiveEventPayload>;
    if (!p || (p as any).streamId !== streamId) return;
    if (env.t !== p.type) return;

    dispatchLiveEvent(p as LiveEventPayload, participant?.identity);
  };
}

/** Bind a live LiveKit Room. Idempotent. */
export function registerLiveEventsRoom(
  streamId: string | null | undefined,
  room: Room | null | undefined,
) {
  if (!streamId || !room) return;
  unregisterLiveEventsRoom(streamId);

  const handler = makeHandler(streamId);
  const leftHandler = (participant: RemoteParticipant) => {
    const userId = participant?.identity;
    if (!userId) return;
    dispatchLiveEvent({
      type: 'viewer_left',
      streamId,
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
  registry.set(streamId, { room, handler, leftHandler });
}

export function unregisterLiveEventsRoom(streamId: string | null | undefined) {
  if (!streamId) return;
  const entry = registry.get(streamId);
  if (!entry) return;
  try {
    entry.room.off(RoomEvent.DataReceived, entry.handler);
    entry.room.off(RoomEvent.ParticipantDisconnected, entry.leftHandler);
  } catch {
    // ignore
  }
  registry.delete(streamId);
}

/**
 * Publish a live event packet. Safe — never throws.
 * Returns true only when actually sent over LiveKit.
 * Caller MUST persist the corresponding `stream_viewers` row BEFORE
 * invoking this (postgres is source of truth for durable state).
 */
export async function publishLiveEvent(
  streamId: string,
  payload: LiveEventPayload,
): Promise<boolean> {
  if (!streamId) return false;
  const entry = registry.get(streamId);
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
    const env = buildEnvelope<LiveEventPayload>(
      FAMILY,
      payload.type,
      { ...payload, streamId, timestamp: payload.timestamp ?? Date.now() },
      room.localParticipant?.identity,
    );
    const bytes = encodeEnvelope(env);
    await room.localParticipant.publishData(bytes, { reliable: true });
    return true;
  } catch (err) {
    console.warn('[Pkg82a] publishLiveEvent failed:', err);
    return false;
  }
}

/** Convenience wrapper for viewer_joined publish. */
export async function publishViewerJoined(
  streamId: string,
  payload: Omit<ViewerJoinedPayload, 'type' | 'streamId' | 'timestamp'>,
): Promise<boolean> {
  return publishLiveEvent(streamId, {
    type: 'viewer_joined',
    streamId,
    timestamp: Date.now(),
    ...payload,
  });
}

/** Test-only — clears the registry between specs. */
export function __resetLiveEventsRegistryForTests() {
  for (const [id] of registry) unregisterLiveEventsRoom(id);
}
