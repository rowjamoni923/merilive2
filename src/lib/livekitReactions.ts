/**
 * Pkg132: LiveKit Floating Reactions
 * --------------------------------------------------------------
 * Quick ephemeral emoji reactions (👍 ❤️ 😂 🎉 🔥 👏 …) that float over
 * a call/live/party view. Industry-standard pattern (Zoom Meeting Reactions,
 * Google Meet, LinkedIn Live, TikTok hearts).
 *
 * LiveKit-Purist:
 *  - Pure client lib — ZERO new edge fn, migration, Supabase channels, polls,
 *    or cross-user DB reads.
 *  - Reuses the LiveKit Room that useLiveKitCall / useLiveKitClient /
 *    usePartyRoomWebRTC already maintain.
 *  - Kill-switch: `app_settings.livekit_signaling_enabled.reactions`
 *    (default ON; admin can flip OFF for instant rollback).
 *  - 400ms client dedupe via shared `isDuplicateEnvelope`.
 *  - Local client-side rate limit (max 10 reactions / 1.5s) so a runaway
 *    finger-tap loop can't flood the SFU.
 *
 * NOT for gifts (Pkg76 handles money/audit + animation). Reactions are
 * purely visual, costless, ephemeral. Never persisted.
 *
 * API:
 *   - publishReaction(scope, id, emoji, opts?) → Promise<boolean>
 *   - registerReactionRoom(scope, id, room)    (auto-wired by Pkg72 hooks)
 *   - unregisterReactionRoom(scope, id)
 *   - useReactions(scope, id, ttlMs?)          → ReactionEntry[]
 */
import { useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, type RemoteParticipant } from 'livekit-client';
import {
  buildEnvelope,
  decodeEnvelope,
  encodeEnvelope,
  isDuplicateEnvelope,
  isLiveKitEnabled,
} from './livekitSignaling';
import { nativeLiveKitController } from './nativeLiveKitController';

export type ReactionScope = 'live' | 'party' | 'call';

export interface ReactionPayload {
  scope: ReactionScope;
  id: string;
  senderId: string;
  emoji: string;
  /** Optional sender-supplied client time so receivers can stagger animations. */
  timestamp?: number;
}

export interface ReactionEntry {
  /** Unique per emit (envelope id) — safe React key. */
  key: string;
  emoji: string;
  senderId: string;
  senderIdentity?: string;
  at: number;
}

interface Entry {
  room: Room;
  handler: (payload: Uint8Array, participant?: RemoteParticipant) => void;
}

const registry = new Map<string, Entry>();
const nativeRegistry = new Set<string>();
let nativeUnsubscribe: (() => void) | null = null;

// Local rate limit — applies to *outgoing* reactions only.
const RATE_LIMIT_WINDOW_MS = 1500;
const RATE_LIMIT_MAX = 10;
const recentSendTimes: number[] = [];

// Hard cap on emoji length to keep envelopes tiny.
const MAX_EMOJI_LEN = 16;

function keyFor(scope: ReactionScope, id: string): string {
  return `${scope}:${id}`;
}

function dispatchReaction(
  scope: ReactionScope,
  id: string,
  payload: Uint8Array,
  participantIdentity?: string,
) {
  if (typeof window === 'undefined') return;
  const env = decodeEnvelope(payload);
  if (!env || env.f !== 'reactions') return;
  if (env.t !== 'reaction') return;
  if (isDuplicateEnvelope(env.id)) return;

  const p = (env.p ?? {}) as Partial<ReactionPayload>;
  if (p.scope !== scope) return;
  if (p.id && p.id !== id) return;

  const emoji = typeof p.emoji === 'string' ? p.emoji.slice(0, MAX_EMOJI_LEN) : '';
  if (!emoji) return;

  const detail: ReactionEntry = {
    key: env.id,
    emoji,
    senderId: p.senderId || env.s || 'unknown',
    senderIdentity: participantIdentity,
    at: typeof p.timestamp === 'number' ? p.timestamp : Date.now(),
  };

  window.dispatchEvent(
    new CustomEvent<ReactionEntry & { scope: ReactionScope; id: string }>(
      'livekit-reaction',
      { detail: { ...detail, scope, id } },
    ),
  );
}

function makeHandler(scope: ReactionScope, id: string) {
  return (payload: Uint8Array, participant?: RemoteParticipant) => {
    dispatchReaction(scope, id, payload, participant?.identity);
  };
}

/** Bind a (scope,id) tuple to its LiveKit Room. */
export function registerReactionRoom(
  scope: ReactionScope,
  id: string | null | undefined,
  room: Room | null | undefined,
) {
  if (!id || !room) return;
  unregisterReactionRoom(scope, id);
  const handler = makeHandler(scope, id);
  try {
    room.on(RoomEvent.DataReceived, handler);
  } catch {
    return;
  }
  registry.set(keyFor(scope, id), { room, handler });
}

export function unregisterReactionRoom(
  scope: ReactionScope,
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

/** Native (Android) variant — mirrors Pkg76 pattern. */
export function registerNativeReactionRoom(
  scope: ReactionScope,
  id: string | null | undefined,
) {
  if (!id || typeof window === 'undefined') return;
  nativeRegistry.add(keyFor(scope, id));
  if (nativeUnsubscribe) return;
  nativeUnsubscribe = nativeLiveKitController.onDataReceived(
    (payload, participantIdentity) => {
      for (const k of nativeRegistry) {
        const [sc, sid] = k.split(':') as [ReactionScope, string];
        dispatchReaction(sc, sid, payload, participantIdentity);
      }
    },
  );
}

export function unregisterNativeReactionRoom(
  scope: ReactionScope,
  id: string | null | undefined,
) {
  if (!id) return;
  nativeRegistry.delete(keyFor(scope, id));
  if (nativeRegistry.size === 0 && nativeUnsubscribe) {
    nativeUnsubscribe();
    nativeUnsubscribe = null;
  }
}

function checkRateLimit(): boolean {
  const now = Date.now();
  while (recentSendTimes.length && now - recentSendTimes[0] > RATE_LIMIT_WINDOW_MS) {
    recentSendTimes.shift();
  }
  if (recentSendTimes.length >= RATE_LIMIT_MAX) return false;
  recentSendTimes.push(now);
  return true;
}

export interface PublishReactionOptions {
  /** Override sender id if local participant identity differs from auth id. */
  senderId?: string;
}

/**
 * Publish one floating-reaction envelope. Returns true only when actually sent.
 * Never throws. Silently no-ops on:
 *   - missing room or disconnected
 *   - kill-switch OFF
 *   - rate limit exceeded
 *   - empty/oversize emoji
 */
export async function publishReaction(
  scope: ReactionScope,
  id: string,
  emoji: string,
  opts: PublishReactionOptions = {},
): Promise<boolean> {
  if (!id) return false;
  const cleaned =
    typeof emoji === 'string' ? emoji.trim().slice(0, MAX_EMOJI_LEN) : '';
  if (!cleaned) return false;

  const entry = registry.get(keyFor(scope, id));
  const room = entry?.room;
  const hasNative = nativeRegistry.has(keyFor(scope, id));
  if ((!room || room.state !== 'connected') && !hasNative) return false;

  if (!checkRateLimit()) return false;

  let allowed = false;
  try {
    allowed = await isLiveKitEnabled('reactions');
  } catch {
    allowed = false;
  }
  if (!allowed) return false;

  try {
    const senderId =
      opts.senderId ||
      room?.localParticipant?.identity ||
      'unknown';
    const env = buildEnvelope<ReactionPayload>(
      'reactions',
      'reaction',
      { scope, id, senderId, emoji: cleaned, timestamp: Date.now() },
      senderId,
    );
    const bytes = encodeEnvelope(env);
    if (!room || room.state !== 'connected') {
      return nativeLiveKitController.sendData(bytes, {
        reliable: false,
        topic: 'reaction',
      });
    }
    // Unreliable: cheap visual fluff; one dropped heart is fine.
    await room.localParticipant.publishData(bytes, { reliable: false });
    return true;
  } catch (err) {
    console.warn('[Pkg132] publishReaction failed:', err);
    return false;
  }
}

// ─── React hook ───────────────────────────────────────────────────────────
// Returns a rolling buffer of recent reactions; entries auto-expire after `ttlMs`.

const DEFAULT_TTL_MS = 3500;
const MAX_BUFFER = 60;

export function useReactions(
  scope: ReactionScope | undefined,
  id: string | undefined,
  ttlMs: number = DEFAULT_TTL_MS,
): ReactionEntry[] {
  const [items, setItems] = useState<ReactionEntry[]>([]);
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    if (!scope || !id) {
      setItems([]);
      return;
    }
    const timers = timersRef.current;

    const onReaction = (ev: Event) => {
      const d = (ev as CustomEvent).detail as
        | (ReactionEntry & { scope?: string; id?: string })
        | undefined;
      if (!d || d.scope !== scope || d.id !== id) return;

      setItems((prev) => {
        const next = [...prev, d as ReactionEntry];
        return next.length > MAX_BUFFER ? next.slice(-MAX_BUFFER) : next;
      });

      const t = setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.key !== d.key));
        timers.delete(d.key);
      }, ttlMs);
      timers.set(d.key, t);
    };

    window.addEventListener('livekit-reaction', onReaction as EventListener);
    return () => {
      window.removeEventListener('livekit-reaction', onReaction as EventListener);
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, [scope, id, ttlMs]);

  return items;
}

/** Test-only — clears all in-memory registries between specs. */
export function __resetReactionsForTests() {
  for (const [k] of registry) {
    const [scope, id] = k.split(':') as [ReactionScope, string];
    unregisterReactionRoom(scope, id);
  }
  nativeRegistry.clear();
  if (nativeUnsubscribe) {
    nativeUnsubscribe();
    nativeUnsubscribe = null;
  }
  recentSendTimes.length = 0;
}

export const __test = {
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX,
  MAX_EMOJI_LEN,
  DEFAULT_TTL_MS,
};
