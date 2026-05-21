/**
 * Pkg74: Live Stream signaling over LiveKit DataPackets.
 *
 * Mirrors Pkg73 (private call) for live streams. The host publishes
 * a `stream_ended` packet to every viewer in the LiveKit room with
 * sub-50ms latency. Supabase Realtime broadcast on
 * `live-stream-close-${id}` + the postgres_changes fallback are
 * RETAINED — both paths converge into the same modal in LiveStream.tsx.
 *
 * Money/audit path is UNCHANGED: live_streams UPDATE (is_active=false,
 * ended_at, total_coins_earned) runs first; this module just mirrors
 * the truth to viewers without a Supabase Realtime round-trip.
 *
 * Cost guards:
 *  - NO Supabase Realtime channels.
 *  - NO setInterval / polling.
 *  - NO cross-user profile reads.
 *  - Per-feature kill-switch: `app_settings.livekit_signaling_enabled.live`.
 *    When OFF, `publishStreamEnded` returns false instantly → host
 *    silently degrades to Supabase broadcast.
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
