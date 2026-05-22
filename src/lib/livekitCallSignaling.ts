/**
 * Pkg73 + Pkg84: Private-call signaling over LiveKit DataPackets.
 *
 * Pkg84 (LiveKit-Purist): Supabase Realtime FULLY REMOVED from in-room
 * private-call signaling. Pre-room invite delivery is FCM-only via the
 * `call-deliver` edge function (industry standard — Bigo / Tango / Zoom /
 * WhatsApp / LiveKit's own example all use FCM/VoIP push for the ring,
 * then the media SDK for everything after accept).
 *
 * Once both peers are in the same LiveKit Room, all signaling — `call_ended`
 * (Pkg73) AND `call_accepted` (Pkg84 new) — flows over reliable DataPackets
 * with sub-50ms latency.
 *
 * Cost guards:
 *  - NO Supabase Realtime channels.
 *  - NO setInterval / polling.
 *  - NO cross-user profile reads.
 *  - Per-feature kill-switch: `app_settings.livekit_signaling_enabled.call`.
 *    When OFF, publish helpers return false instantly → caller fallback path
 *    relies on the 5s `private_calls` REST poll already running.
 */
import { Room, RoomEvent, type RemoteParticipant } from 'livekit-client';
import {
  buildEnvelope,
  decodeEnvelope,
  encodeEnvelope,
  isDuplicateEnvelope,
  isLiveKitEnabled,
} from './livekitSignaling';
import { nativeLiveKitController } from './nativeLiveKitController';

export interface CallEndedPayload {
  callId: string;
  endedBy: string;
  reason?: string;
  duration?: number;
}

export interface CallEndedDetail extends CallEndedPayload {
  sender?: string;
}

export interface CallAcceptedPayload {
  callId: string;
  acceptedBy: string;
  at?: number;
}

export interface CallAcceptedDetail extends CallAcceptedPayload {
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
const nativeRegistry = new Set<string>();
let nativeUnsubscribe: (() => void) | null = null;

function makeHandler(callId: string) {
  return (payload: Uint8Array, participant?: RemoteParticipant) => {
    const env = decodeEnvelope(payload);
    if (!env || env.f !== 'call') return;
    if (isDuplicateEnvelope(env.id)) return;

    // call_ended (Pkg73)
    if (env.t === 'call_ended') {
      const p = (env.p ?? {}) as Partial<CallEndedPayload>;
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
      return;
    }

    // call_accepted (Pkg84) — host → caller post-accept handshake
    if (env.t === 'call_accepted') {
      const p = (env.p ?? {}) as Partial<CallAcceptedPayload>;
      if (p.callId && p.callId !== callId) return;
      const detail: CallAcceptedDetail = {
        callId,
        acceptedBy: p.acceptedBy || env.s || 'unknown',
        at: p.at,
        sender: participant?.identity,
      };
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent<CallAcceptedDetail>('livekit-call-accepted', { detail }),
        );
      }
      return;
    }
  };
}

function dispatchCallEnvelope(callId: string, payload: Uint8Array, participantIdentity?: string) {
  const env = decodeEnvelope(payload);
  if (!env || env.f !== 'call') return;
  if (isDuplicateEnvelope(env.id)) return;

  if (env.t === 'call_ended') {
    const p = (env.p ?? {}) as Partial<CallEndedPayload>;
    if (p.callId && p.callId !== callId) return;
    window.dispatchEvent(new CustomEvent<CallEndedDetail>('livekit-call-ended', {
      detail: {
        callId,
        endedBy: p.endedBy || env.s || 'unknown',
        reason: p.reason,
        duration: p.duration,
        sender: participantIdentity,
      },
    }));
    return;
  }

  if (env.t === 'call_accepted') {
    const p = (env.p ?? {}) as Partial<CallAcceptedPayload>;
    if (p.callId && p.callId !== callId) return;
    window.dispatchEvent(new CustomEvent<CallAcceptedDetail>('livekit-call-accepted', {
      detail: {
        callId,
        acceptedBy: p.acceptedBy || env.s || 'unknown',
        at: p.at,
        sender: participantIdentity,
      },
    }));
  }
}

/** Bind a callId to its LiveKit Room so we can publish/receive Pkg73/84 packets. */
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

async function tryPublish(
  room: Room,
  family: 'call',
  type: 'call_ended' | 'call_accepted',
  payload: Record<string, unknown>,
): Promise<boolean> {
  if (!room || room.state !== 'connected') return false;
  try {
    const env = buildEnvelope(
      family,
      type,
      payload,
      room.localParticipant?.identity,
    );
    const bytes = encodeEnvelope(env);
    await room.localParticipant.publishData(bytes, { reliable: true });
    return true;
  } catch (err) {
    console.warn(`[Pkg73/84] publish ${type} failed:`, err);
    return false;
  }
}

/**
 * Publish a `call_ended` packet to the peer.
 * Returns `true` only when actually sent. Never throws.
 */
export async function publishCallEnded(
  callId: string,
  payload: Omit<CallEndedPayload, 'callId'>,
): Promise<boolean> {
  if (!callId) return false;
  const entry = registry.get(callId);
  if (!entry) return false;

  let allowed = false;
  try { allowed = await isLiveKitEnabled('call'); } catch { allowed = false; }
  if (!allowed) return false;

  return tryPublish(entry.room, 'call', 'call_ended', { callId, ...payload });
}

/**
 * Pkg84: Publish a `call_accepted` packet from host → caller right after the
 * host accepts the call. Retries until LiveKit Room is connected & registered
 * (host joins the Room only AFTER accepting, so a brief gap is expected).
 * Returns `true` once a packet successfully publishes. Falls back silently
 * to the caller's 5s REST poll on `private_calls.status` if all retries miss.
 */
export async function publishCallAccepted(
  callId: string,
  payload: Omit<CallAcceptedPayload, 'callId'>,
  opts: { retries?: number; gapMs?: number } = {},
): Promise<boolean> {
  if (!callId) return false;
  const retries = opts.retries ?? 20; // 20 × 250ms = 5s ceiling
  const gapMs = opts.gapMs ?? 250;

  let allowed = false;
  try { allowed = await isLiveKitEnabled('call'); } catch { allowed = false; }
  if (!allowed) return false;

  for (let i = 0; i < retries; i++) {
    const entry = registry.get(callId);
    if (entry && entry.room.state === 'connected') {
      const ok = await tryPublish(entry.room, 'call', 'call_accepted', {
        callId,
        at: Date.now(),
        ...payload,
      });
      if (ok) return true;
    }
    await new Promise((r) => setTimeout(r, gapMs));
  }
  return false;
}

/** Test-only — clears the registry between specs. */
export function __resetCallSignalingRegistryForTests() {
  for (const [id] of registry) unregisterCallRoom(id);
}
