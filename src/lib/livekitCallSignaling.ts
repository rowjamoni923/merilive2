/**
 * Pkg73: Private-call signaling over LiveKit DataPackets.
 *
 * Layers on top of Pkg72 (`livekitSignaling.ts`) WITHOUT replacing the
 * existing Supabase broadcast path — Supabase remains the always-on
 * fallback. LiveKit becomes the PRIMARY notifier once both peers have
 * joined the call's LiveKit room (which they always do for the actual
 * media stream).
 *
 * Money/audit path is UNCHANGED: `end_private_call` RPC still runs in
 * parallel from `usePrivateCall.endCall`. This module only mirrors the
 * already-persisted "call ended" truth to the peer with sub-50ms latency
 * via WebRTC datachannel (no Supabase Realtime round-trip).
 *
 * Cost guards:
 *  - NO Supabase Realtime channels.
 *  - NO setInterval / polling.
 *  - NO cross-user profile reads.
 *  - Per-feature kill-switch: `app_settings.livekit_signaling_enabled.call`.
 *    When OFF, `publishCallEnded` returns false instantly → caller path
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

export interface CallEndedPayload {
  callId: string;
  endedBy: string;
  reason?: string;
  duration?: number;
}

export interface CallEndedDetail extends CallEndedPayload {
  sender?: string;
}

interface Entry {
  room: Room;
  handler: (
    payload: Uint8Array,
    participant?: RemoteParticipant,
  ) => void;
}

// callId → Room + DataReceived handler
const registry = new Map<string, Entry>();

function makeHandler(callId: string) {
  return (payload: Uint8Array, participant?: RemoteParticipant) => {
    const env = decodeEnvelope(payload);
    if (!env || env.f !== 'call') return;
    if (isDuplicateEnvelope(env.id)) return;
    if (env.t !== 'call_ended') return;

    const p = (env.p ?? {}) as Partial<CallEndedPayload>;
    // Bind to this call only — ignore stray packets from other rooms.
    if (p.callId && p.callId !== callId) return;

    const detail: CallEndedDetail = {
      callId,
      endedBy: p.endedBy || env.s || 'unknown',
      reason: p.reason,
      duration: p.duration,
      sender: participant?.identity,
    };

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent<CallEndedDetail>('livekit-call-ended', { detail }),
      );
    }
  };
}

/** Bind a callId to its LiveKit Room so we can publish/receive Pkg73 packets. */
export function registerCallRoom(callId: string | null | undefined, room: Room | null | undefined) {
  if (!callId || !room) return;
  // Drop any stale entry for the same callId (e.g. reconnect).
  unregisterCallRoom(callId);

  const handler = makeHandler(callId);
  try {
    room.on(RoomEvent.DataReceived, handler);
  } catch {
    return;
  }
  registry.set(callId, { room, handler });
}

export function unregisterCallRoom(callId: string | null | undefined) {
  if (!callId) return;
  const entry = registry.get(callId);
  if (!entry) return;
  try {
    entry.room.off(RoomEvent.DataReceived, entry.handler);
  } catch {
    // ignore — room may already be disconnected
  }
  registry.delete(callId);
}

/**
 * Publish a `call_ended` packet to the peer.
 * Returns `true` only when actually sent. Never throws.
 * Always safe to call in parallel with the Supabase broadcast path.
 */
export async function publishCallEnded(
  callId: string,
  payload: Omit<CallEndedPayload, 'callId'>,
): Promise<boolean> {
  if (!callId) return false;
  const entry = registry.get(callId);
  if (!entry) return false;
  const room = entry.room;
  if (!room || room.state !== 'connected') return false;

  // Hard kill-switch check (cached 10s) — instant rollback.
  let allowed = false;
  try {
    allowed = await isLiveKitEnabled('call');
  } catch {
    allowed = false;
  }
  if (!allowed) return false;

  try {
    const env = buildEnvelope<CallEndedPayload>(
      'call',
      'call_ended',
      { callId, ...payload },
      room.localParticipant?.identity,
    );
    const bytes = encodeEnvelope(env);
    await room.localParticipant.publishData(bytes, { reliable: true });
    return true;
  } catch (err) {
    console.warn('[Pkg73] publishCallEnded failed:', err);
    return false;
  }
}

/** Test-only — clears the registry between specs. */
export function __resetCallSignalingRegistryForTests() {
  for (const [id] of registry) unregisterCallRoom(id);
}
