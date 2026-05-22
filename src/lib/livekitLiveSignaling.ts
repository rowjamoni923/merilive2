/**
 * Pkg74: Live Stream signaling over LiveKit DataPackets.
 *
 * Mirrors Pkg73 (private call) for live streams. The host publishes
 * a `stream_ended` packet to every viewer in the LiveKit room with
 * sub-50ms latency.
 *
 * LiveKit-Purist (Pkg78+): the Supabase Realtime `live-stream-close-${id}`
 * broadcast + `live_streams` postgres_changes subscription have been
 * REMOVED. This LiveKit DataPacket is now the SOLE instant path. The
 * only durable fallback is the 30s viewer-side stale-stream poll
 * (`cleanup_stale_live_streams` RPC + `live_streams.is_active` check)
 * which covers host-crash / network-drop edge cases.
 *
 * Money/audit path is UNCHANGED: `live_streams` UPDATE
 * (is_active=false, ended_at, total_coins_earned) runs FIRST; this
 * module mirrors the truth to viewers without a Supabase round-trip.
 *
 * Cost guards:
 *  - NO Supabase Realtime channels.
 *  - NO setInterval / polling.
 *  - NO cross-user profile reads.
 *  - Per-feature kill-switch: `app_settings.livekit_signaling_enabled.live`.
 *    When OFF, `publishStreamEnded` returns false instantly. Viewers
 *    then learn via the 30s stale-stream safety poll instead.
 */
import { Room, RoomEvent, type RemoteParticipant } from 'livekit-client';
import {
  buildEnvelope,
  decodeEnvelope,
  encodeEnvelope,
  isDuplicateEnvelope,
  isLiveKitEnabled,
} from './livekitSignaling';

export interface StreamEndedPayload {
  streamId: string;
  endedBy: string;
  hostName?: string;
  reason?: string;
}

export interface StreamEndedDetail extends StreamEndedPayload {
  sender?: string;
}

interface Entry {
  room: Room;
  handler: (
    payload: Uint8Array,
    participant?: RemoteParticipant,
  ) => void;
}

// streamId → Room + DataReceived handler
const registry = new Map<string, Entry>();

function makeHandler(streamId: string) {
  return (payload: Uint8Array, participant?: RemoteParticipant) => {
    const env = decodeEnvelope(payload);
    if (!env || env.f !== 'live') return;
    if (isDuplicateEnvelope(env.id)) return;
    if (env.t !== 'stream_ended') return;

    const p = (env.p ?? {}) as Partial<StreamEndedPayload>;
    if (p.streamId && p.streamId !== streamId) return;

    const detail: StreamEndedDetail = {
      streamId,
      endedBy: p.endedBy || env.s || 'unknown',
      hostName: p.hostName,
      reason: p.reason,
      sender: participant?.identity,
    };

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent<StreamEndedDetail>('livekit-stream-ended', { detail }),
      );
    }
  };
}

/** Bind a streamId to its LiveKit Room so we can publish/receive Pkg74 packets. */
export function registerStreamRoom(
  streamId: string | null | undefined,
  room: Room | null | undefined,
) {
  if (!streamId || !room) return;
  unregisterStreamRoom(streamId);

  const handler = makeHandler(streamId);
  try {
    room.on(RoomEvent.DataReceived, handler);
  } catch {
    return;
  }
  registry.set(streamId, { room, handler });
}

export function unregisterStreamRoom(streamId: string | null | undefined) {
  if (!streamId) return;
  const entry = registry.get(streamId);
  if (!entry) return;
  try {
    entry.room.off(RoomEvent.DataReceived, entry.handler);
  } catch {
    // ignore — room may already be disconnected
  }
  registry.delete(streamId);
}

/**
 * Publish a `stream_ended` packet to every viewer.
 * Returns `true` only when actually sent. Never throws.
 * Always safe to call in parallel with the Supabase broadcast path.
 */
export async function publishStreamEnded(
  streamId: string,
  payload: Omit<StreamEndedPayload, 'streamId'>,
): Promise<boolean> {
  if (!streamId) return false;
  const entry = registry.get(streamId);
  if (!entry) return false;
  const room = entry.room;
  if (!room || room.state !== 'connected') return false;

  let allowed = false;
  try {
    allowed = await isLiveKitEnabled('live');
  } catch {
    allowed = false;
  }
  if (!allowed) return false;

  try {
    const env = buildEnvelope<StreamEndedPayload>(
      'live',
      'stream_ended',
      { streamId, ...payload },
      room.localParticipant?.identity,
    );
    const bytes = encodeEnvelope(env);
    await room.localParticipant.publishData(bytes, { reliable: true });
    return true;
  } catch (err) {
    console.warn('[Pkg74] publishStreamEnded failed:', err);
    return false;
  }
}

/** Test-only — clears the registry between specs. */
export function __resetLiveSignalingRegistryForTests() {
  for (const [id] of registry) unregisterStreamRoom(id);
}
