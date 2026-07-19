/**
 * Pkg76: Gift animation broadcast over LiveKit DataPackets.
 *
 * Highest-fanout signal in the platform. One sender publishes a single
 * `gift_sent` envelope; LiveKit fans it out to every viewer / party
 * participant in the same Room with sub-50ms latency.
 *
 * This REPLACES (in parallel — both paths run until Pkg81) the existing
 * Supabase Realtime broadcast channels:
 *   - `gift_broadcast_${streamId}`        (live streams)
 *   - `party-gifts-instant-${roomId}`     (party rooms)
 *
 * Money/audit path is UNCHANGED:
 *   1. Client calls `process_gift_transaction` RPC (Supabase, atomic, FOR UPDATE).
 *   2. THEN this module mirrors the visual animation to all peers.
 *
 * Cost guards ($1400 protection):
 *  - NO new Supabase Realtime channels (reuses the LiveKit Room that
 *    useLiveKitClient / usePartyRoomNativeLiveKit already maintains).
 *  - NO setInterval / polling.
 *  - NO cross-user profile reads (sender packs all display metadata
 *    into the envelope; receivers render directly).
 *  - Per-feature kill-switch: `app_settings.livekit_signaling_enabled.gift`.
 *    When OFF, `publishGiftSent` returns false instantly → sender silently
 *    degrades to Supabase broadcast.
 *  - 400ms client dedupe via shared `isDuplicateEnvelope`.
 */
import { Room, RoomEvent, type RemoteParticipant } from 'livekit-client';
import {
  buildEnvelope,
  decodeEnvelope,
  encodeEnvelope,
  isDuplicateEnvelope,
  isLiveKitEnabledSync,
} from './livekitSignaling';
import { nativeLiveKitController } from './nativeLiveKitController';

export type GiftScope = 'live' | 'party' | 'call';

/**
 * Visual gift payload — everything a receiver needs to render the flying
 * gift, beans counter bump, and chat row WITHOUT reading any extra rows
 * from Supabase. Sender packs once, fanned out by LiveKit.
 */
export interface GiftSentPayload {
  scope: GiftScope;
  id: string;                // streamId or roomId
  senderId: string;
  senderName?: string;
  senderAvatar?: string;
  senderLevel?: number;
  receiverId?: string;
  giftId?: string;
  giftKey?: string;
  giftName?: string;
  giftIcon?: string;
  giftIconUrl?: string;
  giftAnimationUrl?: string;
  giftAnimationFormat?: string | null;
  giftAnimationConfigUrl?: string | null;
  giftSoundUrl?: string;
  giftCoins?: number;        // unit diamonds
  count?: number;
  totalDiamonds?: number;       // unit × count
  receiverBeans?: number;    // optimistic beans credit for receiver
  /** Lucky-gift diamond bonus paid to the sender on this send. 0 when no win. */
  luckyBonus?: number;
  timestamp?: number;
}


export interface GiftSentDetail extends GiftSentPayload {
  sender?: string;           // LiveKit participant identity that published
}

interface Entry {
  room: Room;
  handler: (
    payload: Uint8Array,
    participant?: RemoteParticipant,
  ) => void;
}

// `${scope}:${id}` → Room + DataReceived handler
const registry = new Map<string, Entry>();
const nativeRegistry = new Set<string>();
let nativeUnsubscribe: (() => void) | null = null;

function keyFor(scope: GiftScope, id: string): string {
  return `${scope}:${id}`;
}

function makeHandler(scope: GiftScope, id: string) {
  return (payload: Uint8Array, participant?: RemoteParticipant) => {
    const env = decodeEnvelope(payload);
    if (!env || env.f !== 'gift') return;
    if (isDuplicateEnvelope(env.id)) return;
    if (env.t !== 'gift_sent') return;

    const p = (env.p ?? {}) as Partial<GiftSentPayload>;
    // Strict scope+id match — never leak a live-stream gift into a party room
    // that happens to share the same suffix.
    if (p.scope !== scope) return;
    if (p.id && p.id !== id) return;

    const detail: GiftSentDetail = {
      ...(p as GiftSentPayload),
      scope,
      id,
      senderId: p.senderId || env.s || 'unknown',
      sender: participant?.identity,
    };

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent<GiftSentDetail>('livekit-gift-sent', { detail }),
      );
    }
  };
}

function dispatchGiftEnvelope(scope: GiftScope, id: string, payload: Uint8Array, participantIdentity?: string) {
  if (typeof window === 'undefined') return;
  const env = decodeEnvelope(payload);
  if (!env || env.f !== 'gift') return;
  if (isDuplicateEnvelope(env.id)) return;
  if (env.t !== 'gift_sent') return;

  const p = (env.p ?? {}) as Partial<GiftSentPayload>;
  if (p.scope !== scope) return;
  if (p.id && p.id !== id) return;

  window.dispatchEvent(new CustomEvent<GiftSentDetail>('livekit-gift-sent', {
    detail: { ...(p as GiftSentPayload), scope, id, senderId: p.senderId || env.s || 'unknown', sender: participantIdentity },
  }));
}

/** Bind a (scope,id) tuple to its LiveKit Room. */
export function registerGiftRoom(
  scope: GiftScope,
  id: string | null | undefined,
  room: Room | null | undefined,
) {
  if (!id || !room) return;
  unregisterGiftRoom(scope, id);

  const handler = makeHandler(scope, id);
  try {
    room.on(RoomEvent.DataReceived, handler);
  } catch {
    return;
  }
  registry.set(keyFor(scope, id), { room, handler });
}

export function unregisterGiftRoom(
  scope: GiftScope,
  id: string | null | undefined,
) {
  if (!id) return;
  const k = keyFor(scope, id);
  const entry = registry.get(k);
  if (!entry) return;
  try {
    entry.room.off(RoomEvent.DataReceived, entry.handler);
  } catch {
    // ignore — room may already be disconnected
  }
  registry.delete(k);
}

export function registerNativeGiftRoom(scope: GiftScope, id: string | null | undefined) {
  if (!id || typeof window === 'undefined') return;
  nativeRegistry.add(keyFor(scope, id));
  if (nativeUnsubscribe) return;
  nativeUnsubscribe = nativeLiveKitController.onDataReceived((payload, participantIdentity) => {
    for (const k of nativeRegistry) {
      const [scope, id] = k.split(':') as [GiftScope, string];
      dispatchGiftEnvelope(scope, id, payload, participantIdentity);
    }
  });
}

export function unregisterNativeGiftRoom(scope: GiftScope, id: string | null | undefined) {
  if (!id) return;
  nativeRegistry.delete(keyFor(scope, id));
  if (nativeRegistry.size === 0 && nativeUnsubscribe) {
    nativeUnsubscribe();
    nativeUnsubscribe = null;
  }
}

/**
 * Publish a `gift_sent` packet to every participant in the room.
 * Returns `true` only when actually sent. Never throws.
 * Always safe to call in parallel with the Supabase broadcast path.
 */
export async function publishGiftSent(
  scope: GiftScope,
  id: string,
  payload: Omit<GiftSentPayload, 'scope' | 'id'>,
): Promise<boolean> {
  if (!id) return false;
  const entry = registry.get(keyFor(scope, id));
  const room = entry?.room;
  if ((!room || room.state !== 'connected') && !nativeRegistry.has(keyFor(scope, id))) return false;

  const allowed = isLiveKitEnabledSync('gift');
  if (!allowed) return false;

  try {
    const env = buildEnvelope<GiftSentPayload>(
      'gift',
      'gift_sent',
      {
        ...(payload as GiftSentPayload),
        scope,
        id,
        timestamp: payload.timestamp ?? Date.now(),
      },
      room?.localParticipant?.identity ?? payload.senderId,
    );
    const bytes = encodeEnvelope(env);
    if (!room || room.state !== 'connected') {
      return nativeLiveKitController.sendData(bytes, { reliable: true, topic: 'gift' });
    }
    // Reliable: gift visuals must not drop, but ordering with media is
    // not required — sub-50ms is what matters.
    await room.localParticipant.publishData(bytes, { reliable: true });
    return true;
  } catch (err) {
    console.warn('[Pkg76] publishGiftSent failed:', err);
    return false;
  }
}

/** Test-only — clears the registry between specs. */
export function __resetGiftSignalingRegistryForTests() {
  for (const [k] of registry) {
    const [scope, id] = k.split(':') as [GiftScope, string];
    unregisterGiftRoom(scope, id);
  }
}
