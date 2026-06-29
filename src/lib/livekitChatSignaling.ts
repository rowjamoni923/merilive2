/**
 * Pkg79: In-room chat over LiveKit DataPackets.
 *
 * Scopes:
 *   - 'call'  — private call chat (InCallChat). Ephemeral, no DB row.
 *   - 'live'  — live stream chat. Sender INSERTs `stream_chat` first
 *               (moderation/audit/persistence), THEN publishes packet.
 *   - 'party' — RESERVED for Pkg80 (party seats + chat split refactor).
 *
 * REPLACES (Pkg78+ "no dual-path" policy — Supabase Realtime is removed in
 * the same package the LiveKit version ships):
 *   - `call-chat-${callId}`        Supabase broadcast (call)
 *   - `stream_chat_${id}`          Supabase postgres_changes (live)
 *
 * Money/audit path is UNCHANGED — the live stream chat row still lives
 * in `stream_chat` for moderation. This module only mirrors the visual
 * bubble to every peer with sub-50ms latency.
 *
 * Cost guards ($1400 protection):
 *  - NO Supabase Realtime channels (reuses the LiveKit Room already
 *    maintained by useLiveKitClient / useLiveKitCall).
 *  - NO setInterval / polling.
 *  - NO cross-user profile reads (sender packs display metadata into
 *    the envelope; receivers render directly).
 *  - Per-feature kill-switch: `app_settings.livekit_signaling_enabled.chat`.
 *    When OFF, `publishChatMessage` returns false instantly.
 *  - 400ms client dedupe via shared `isDuplicateEnvelope`.
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
import { supabase } from '@/integrations/supabase/client';

export type ChatScope = 'call' | 'live' | 'party';

export interface ChatMessagePayload {
  scope: ChatScope;
  id: string;               // callId / streamId / roomId
  messageId: string;        // server row id OR a stable client id (call scope)
  userId: string;
  displayName?: string;
  avatarUrl?: string;
  userLevel?: number;
  isHost?: boolean;
  countryFlag?: string;
  message: string;
  messageType?: string;     // 'text' | 'gift' | 'system' | ...
  timestamp?: number;
}

export interface ChatMessageDetail extends ChatMessagePayload {
  sender?: string;          // LiveKit participant identity that published
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

function keyFor(scope: ChatScope, id: string): string {
  return `${scope}:${id}`;
}

function makeHandler(scope: ChatScope, id: string) {
  return (payload: Uint8Array, participant?: RemoteParticipant) => {
    const env = decodeEnvelope(payload);
    if (!env || env.f !== 'chat') return;
    if (isDuplicateEnvelope(env.id)) return;
    if (env.t !== 'chat_message') return;

    const p = (env.p ?? {}) as Partial<ChatMessagePayload>;
    if (p.scope !== scope) return;
    if (p.id && p.id !== id) return;
    if (!p.message || !p.userId || !p.messageId) return;

    const detail: ChatMessageDetail = {
      ...(p as ChatMessagePayload),
      scope,
      id,
      sender: participant?.identity,
    };

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent<ChatMessageDetail>('livekit-chat-message', { detail }),
      );
    }
  };
}

function dispatchChatEnvelope(scope: ChatScope, id: string, payload: Uint8Array, participantIdentity?: string) {
  if (typeof window === 'undefined') return;
  const env = decodeEnvelope(payload);
  if (!env || env.f !== 'chat') return;
  if (isDuplicateEnvelope(env.id)) return;
  if (env.t !== 'chat_message') return;

  const p = (env.p ?? {}) as Partial<ChatMessagePayload>;
  if (p.scope !== scope) return;
  if (p.id && p.id !== id) return;
  if (!p.message || !p.userId || !p.messageId) return;

  window.dispatchEvent(new CustomEvent<ChatMessageDetail>('livekit-chat-message', {
    detail: { ...(p as ChatMessagePayload), scope, id, sender: participantIdentity },
  }));
}

/** Bind a (scope,id) tuple to its LiveKit Room. */
export function registerChatRoom(
  scope: ChatScope,
  id: string | null | undefined,
  room: Room | null | undefined,
) {
  if (!id || !room) return;
  unregisterChatRoom(scope, id);

  const handler = makeHandler(scope, id);
  try {
    room.on(RoomEvent.DataReceived, handler);
  } catch {
    return;
  }
  registry.set(keyFor(scope, id), { room, handler });
}

export function unregisterChatRoom(
  scope: ChatScope,
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

export function registerNativeChatRoom(scope: ChatScope, id: string | null | undefined) {
  if (!id || typeof window === 'undefined') return;
  nativeRegistry.add(keyFor(scope, id));
  if (nativeUnsubscribe) return;
  nativeUnsubscribe = nativeLiveKitController.onDataReceived((payload, participantIdentity) => {
    for (const k of nativeRegistry) {
      const [scope, id] = k.split(':') as [ChatScope, string];
      dispatchChatEnvelope(scope, id, payload, participantIdentity);
    }
  });
}

export function unregisterNativeChatRoom(scope: ChatScope, id: string | null | undefined) {
  if (!id) return;
  nativeRegistry.delete(keyFor(scope, id));
  if (nativeRegistry.size === 0 && nativeUnsubscribe) {
    nativeUnsubscribe();
    nativeUnsubscribe = null;
  }
}

/**
 * Publish a `chat_message` packet to every participant.
 * Returns `true` only when actually sent. Never throws.
 */
export async function publishChatMessage(
  scope: ChatScope,
  id: string,
  payload: Omit<ChatMessagePayload, 'scope' | 'id'>,
): Promise<boolean> {
  if (!id || !payload.message || !payload.userId || !payload.messageId) {
    return false;
  }
  const entry = registry.get(keyFor(scope, id));
  const room = entry?.room;
  if ((!room || room.state !== 'connected') && !nativeRegistry.has(keyFor(scope, id))) return false;

  let allowed = false;
  try {
    allowed = await isLiveKitEnabled('chat');
  } catch {
    allowed = false;
  }
  if (!allowed) return false;

  try {
    const env = buildEnvelope<ChatMessagePayload>(
      'chat',
      'chat_message',
      {
        ...(payload as ChatMessagePayload),
        scope,
        id,
        timestamp: payload.timestamp ?? Date.now(),
      },
        room?.localParticipant?.identity ?? payload.userId,
    );
    const bytes = encodeEnvelope(env);
    if (!room || room.state !== 'connected') {
      return nativeLiveKitController.sendData(bytes, { reliable: true, topic: 'chat' });
    }
    await room.localParticipant.publishData(bytes, { reliable: true });
    return true;
  } catch (err) {
    console.warn('[Pkg79] publishChatMessage failed:', err);
    return false;
  }
}

/** Test-only — clears the registry between specs. */
export function __resetChatSignalingRegistryForTests() {
  for (const [k] of registry) {
    const [scope, id] = k.split(':') as [ChatScope, string];
    unregisterChatRoom(scope, id);
  }
}
