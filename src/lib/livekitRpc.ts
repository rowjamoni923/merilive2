/**
 * Pkg120: Participant ↔ Participant RPC over LiveKit
 *
 * Thin scope/id-keyed wrapper around livekit-client's room.registerRpcMethod
 * + localParticipant.performRpc. Lets any in-room participant request a
 * typed response from another participant — no Supabase round-trip.
 *
 * Use cases:
 *   - Moderator commands ("mute_me", "kick_request") with ack/reject
 *   - Seat-request ack ("approve_seat" → success / "seat_full")
 *   - "Raise hand" toggle with confirmation
 *   - Any UI action where the caller needs the peer's reply
 *
 * - NO Supabase Realtime channels, NO polls, NO cross-user DB reads.
 * - Kill-switch: app_settings.livekit_signaling_enabled.rpc (default ON when
 *   not explicitly set, since this is just a wrapper around an existing
 *   LiveKit transport — but admin can flip false to disable globally).
 * - Money/audit still goes through Supabase RPC first; this is for ephemeral
 *   peer-to-peer signaling only.
 */
import type { Room } from 'livekit-client';
import { isLiveKitEnabled } from './livekitSignaling';
import {
  tryRegisterNativeRpcMethod,
  tryUnregisterNativeRpcMethod,
  tryPerformNativeRpc,
} from './livekitNativeMessaging';

export type RpcScope = 'call' | 'live' | 'party';

interface RegEntry {
  room: Room;
  methods: Set<string>;
}

// scope:id → entry
const registry = new Map<string, RegEntry>();
const key = (scope: RpcScope, id: string) => `${scope}:${id}`;

export function registerRpcRoom(scope: RpcScope, id: string, room: Room) {
  if (!room) return;
  const k = key(scope, id);
  const existing = registry.get(k);
  if (existing && existing.room === room) return;
  // If a previous Room is being replaced, drop its registered methods.
  if (existing && existing.room !== room) {
    try {
      existing.methods.forEach((m) => existing.room.unregisterRpcMethod?.(m));
    } catch {
      /* ignore */
    }
  }
  registry.set(k, { room, methods: new Set() });
}

export function unregisterRpcRoom(scope: RpcScope, id: string) {
  const k = key(scope, id);
  const entry = registry.get(k);
  if (!entry) return;
  try {
    entry.methods.forEach((m) => entry.room.unregisterRpcMethod?.(m));
  } catch {
    /* ignore */
  }
  registry.delete(k);
}

export interface RpcHandlerContext {
  /** Caller's participant identity (server-trusted via LiveKit JWT). */
  callerIdentity: string;
  /** Method name. */
  method: string;
  /** Caller payload as string (caller serializes JSON if it wants structure). */
  payload: string;
  /** Time remaining (ms) before LiveKit times the request out. */
  responseTimeout: number;
}

/**
 * Register a handler for an RPC method on a specific scope/id Room.
 * Handler must resolve with a string (LiveKit RPC is string-typed); use
 * JSON.stringify for richer payloads. Throw to reject.
 *
 * Returns an unregister function — call it on component unmount.
 */
export function registerRpcMethod(
  scope: RpcScope,
  id: string,
  method: string,
  handler: (ctx: RpcHandlerContext) => Promise<string> | string,
): () => void {
  const entry = registry.get(key(scope, id));
  let nativeRegistered = false;

  // Always also attempt native registration so a session running on the
  // Android plugin (no JS Room) still serves RPCs. No-op on web/iOS.
  void tryRegisterNativeRpcMethod(method, async (ctx) => {
    const result = await handler({
      callerIdentity: ctx.callerIdentity,
      method: ctx.method,
      payload: ctx.payload,
      responseTimeout: ctx.responseTimeout,
    });
    return typeof result === 'string' ? result : JSON.stringify(result ?? '');
  }).then((ok) => { nativeRegistered = ok; });

  if (!entry) {
    // Pure native session — no JS Room ref. Native registration above is the
    // only handler; return a disposer that unregisters it.
    return () => {
      if (nativeRegistered) void tryUnregisterNativeRpcMethod(method);
    };
  }

  try {
    entry.room.registerRpcMethod(method, async (data: any) => {
      // Gate execution on kill-switch at call-time (cheap, 10s cached).
      const enabled = await isLiveKitEnabled('rpc');
      if (!enabled) throw new Error('rpc_disabled');
      return handler({
        callerIdentity: data.callerIdentity ?? data.requestId ?? '',
        method,
        payload: data.payload ?? '',
        responseTimeout: data.responseTimeout ?? 15000,
      });
    });
    entry.methods.add(method);
  } catch (err) {
    console.warn(`[Pkg120] registerRpcMethod(${method}) failed`, err);
  }
  return () => {
    try {
      entry.room.unregisterRpcMethod?.(method);
    } catch {
      /* ignore */
    }
    entry.methods.delete(method);
    if (nativeRegistered) void tryUnregisterNativeRpcMethod(method);
  };
}

export interface PerformRpcOptions {
  destinationIdentity: string;
  method: string;
  payload?: string;
  /** ms; LiveKit minimum effective timeout is ~8000ms. */
  responseTimeout?: number;
}

/**
 * Send an RPC to a specific participant and await their string reply.
 * Throws on timeout, peer not connected, peer threw, or kill-switch disabled.
 *
 * Tries the JS Room first; falls through to native plugin when no JS Room
 * is registered (pure-native Android session).
 */
export async function performRpc(
  scope: RpcScope,
  id: string,
  opts: PerformRpcOptions,
): Promise<string> {
  const enabled = await isLiveKitEnabled('rpc');
  if (!enabled) throw new Error('rpc_disabled');
  const entry = registry.get(key(scope, id));
  if (!entry) {
    // No JS Room — try native session.
    try {
      return await tryPerformNativeRpc({
        destinationIdentity: opts.destinationIdentity,
        method: opts.method,
        payload: opts.payload ?? '',
        responseTimeout: opts.responseTimeout ?? 15000,
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'native-unavailable') {
        throw new Error('room_not_registered');
      }
      throw err;
    }
  }
  return entry.room.localParticipant.performRpc({
    destinationIdentity: opts.destinationIdentity,
    method: opts.method,
    payload: opts.payload ?? '',
    responseTimeout: opts.responseTimeout ?? 15000,
  });
}

/** Test-only registry inspector. */
export function _isRoomRegistered(scope: RpcScope, id: string): boolean {
  return registry.has(key(scope, id));
}
