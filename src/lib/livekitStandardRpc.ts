/**
 * Pkg141: Concrete RPC methods on top of Pkg120
 *
 * Standard set of peer-to-peer RPC methods that ride the Pkg120 wrapper.
 * Designed to be safe defaults so feature code can call them by name without
 * re-implementing the registration / serialization plumbing every time.
 *
 * Standard methods:
 *   - "mute_me"         host → speaker: politely request peer to mute their mic
 *   - "kick_request"    host → audience: pre-announce a kick (peer can prompt)
 *                       — actual kick still goes through Pkg99/127 server RPC
 *   - "approve_seat"    host → audience: tell peer their seat request was approved
 *   - "deny_seat"       host → audience: tell peer their seat request was denied
 *   - "raise_hand_ack"  audience → host: confirm the host saw their raised hand
 *   - "ping"            anyone → anyone: liveness probe, replies "pong"
 *
 * Every method returns a JSON string `{ok:true}` or `{ok:false, reason}`.
 * Throwing rejects; the caller's performRpc() rejects with the same error.
 *
 * Wired automatically once `installStandardRpcMethods(scope, id)` runs after
 * Room registration. Returns an unregister function — call on unmount.
 *
 * Kill-switch: rides Pkg120 `rpc` (default ON). Money/audit NEVER through RPC.
 */
import { useEffect } from 'react';
import {
  performRpc,
  registerRpcMethod,
  _isRoomRegistered,
  type RpcScope,
} from './livekitRpc';

export type StandardRpcMethod =
  | 'mute_me'
  | 'kick_request'
  | 'approve_seat'
  | 'deny_seat'
  | 'raise_hand_ack'
  | 'ping';

export interface StandardRpcHandlers {
  /** Host requested you mute your mic. Return true to comply, false to refuse. */
  onMuteMe?: (callerIdentity: string) => Promise<boolean> | boolean;
  /** Host announced an incoming kick. UI may show a banner; reply ignored. */
  onKickRequest?: (callerIdentity: string, reason: string) => void | Promise<void>;
  /** Host approved your seat request. */
  onApproveSeat?: (callerIdentity: string, seatIndex: number | null) => void | Promise<void>;
  /** Host denied your seat request. */
  onDenySeat?: (callerIdentity: string, reason: string) => void | Promise<void>;
  /** Audience member is confirming their raised hand. Host-side only. */
  onRaiseHandAck?: (callerIdentity: string) => void | Promise<void>;
}

const ok = (extra: Record<string, unknown> = {}) => JSON.stringify({ ok: true, ...extra });
const fail = (reason: string) => JSON.stringify({ ok: false, reason });

/**
 * Install handlers for the standard RPC method set on a registered Room.
 * Safe to call even if some handlers are omitted — missing handlers reply
 * `{ok:false, reason:'no_handler'}` so the caller still gets a clean response.
 */
export function installStandardRpcMethods(
  scope: RpcScope,
  id: string,
  handlers: StandardRpcHandlers = {},
): () => void {
  if (!_isRoomRegistered(scope, id)) {
    console.warn(`[Pkg141] installStandardRpcMethods called before Room registered for ${scope}:${id}`);
    return () => {};
  }

  const disposers: Array<() => void> = [];

  disposers.push(
    registerRpcMethod(scope, id, 'mute_me', async ({ callerIdentity }) => {
      if (!handlers.onMuteMe) return fail('no_handler');
      const accepted = await handlers.onMuteMe(callerIdentity);
      return accepted ? ok() : fail('refused');
    }),
  );

  disposers.push(
    registerRpcMethod(scope, id, 'kick_request', async ({ callerIdentity, payload }) => {
      const reason = safeReason(payload);
      try {
        await handlers.onKickRequest?.(callerIdentity, reason);
      } catch {
        /* swallow — informational signal */
      }
      return ok();
    }),
  );

  disposers.push(
    registerRpcMethod(scope, id, 'approve_seat', async ({ callerIdentity, payload }) => {
      const seatIndex = safeSeatIndex(payload);
      try {
        await handlers.onApproveSeat?.(callerIdentity, seatIndex);
      } catch {
        /* ignore */
      }
      return ok({ seatIndex });
    }),
  );

  disposers.push(
    registerRpcMethod(scope, id, 'deny_seat', async ({ callerIdentity, payload }) => {
      const reason = safeReason(payload);
      try {
        await handlers.onDenySeat?.(callerIdentity, reason);
      } catch {
        /* ignore */
      }
      return ok();
    }),
  );

  disposers.push(
    registerRpcMethod(scope, id, 'raise_hand_ack', async ({ callerIdentity }) => {
      try {
        await handlers.onRaiseHandAck?.(callerIdentity);
      } catch {
        /* ignore */
      }
      return ok();
    }),
  );

  disposers.push(
    registerRpcMethod(scope, id, 'ping', () => JSON.stringify({ ok: true, pong: Date.now() })),
  );

  return () => {
    disposers.forEach((d) => {
      try { d(); } catch { /* ignore */ }
    });
  };
}

/** React hook variant — registers + cleans up on unmount. */
export function useStandardRpcMethods(
  scope: RpcScope,
  id: string | null | undefined,
  handlers: StandardRpcHandlers,
): void {
  useEffect(() => {
    if (!id) return;
    const dispose = installStandardRpcMethods(scope, id, handlers);
    return () => dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, id]);
}

// =============================================================================
// Typed callers
// =============================================================================

export interface StandardRpcReply {
  ok: boolean;
  reason?: string;
  [k: string]: unknown;
}

function parseReply(raw: string): StandardRpcReply {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as StandardRpcReply;
  } catch {
    /* fall through */
  }
  return { ok: false, reason: 'invalid_reply' };
}

async function call(
  scope: RpcScope,
  id: string,
  destinationIdentity: string,
  method: StandardRpcMethod,
  payload?: string,
  responseTimeout = 15000,
): Promise<StandardRpcReply> {
  try {
    const raw = await performRpc(scope, id, {
      destinationIdentity,
      method,
      payload,
      responseTimeout,
    });
    return parseReply(raw);
  } catch (err: any) {
    return { ok: false, reason: err?.message || 'rpc_error' };
  }
}

/** Host → speaker: ask peer to mute their mic. */
export function requestMuteMe(scope: RpcScope, id: string, destinationIdentity: string) {
  return call(scope, id, destinationIdentity, 'mute_me');
}

/** Host → audience: pre-announce kick so peer UI can show a banner. */
export function announceKick(scope: RpcScope, id: string, destinationIdentity: string, reason = '') {
  return call(scope, id, destinationIdentity, 'kick_request', JSON.stringify({ reason }));
}

/** Host → audience: approve seat. */
export function notifyApproveSeat(
  scope: RpcScope,
  id: string,
  destinationIdentity: string,
  seatIndex: number | null = null,
) {
  return call(scope, id, destinationIdentity, 'approve_seat', JSON.stringify({ seatIndex }));
}

/** Host → audience: deny seat. */
export function notifyDenySeat(
  scope: RpcScope,
  id: string,
  destinationIdentity: string,
  reason = '',
) {
  return call(scope, id, destinationIdentity, 'deny_seat', JSON.stringify({ reason }));
}

/** Audience → host: confirm raised hand. */
export function ackRaisedHand(scope: RpcScope, id: string, destinationIdentity: string) {
  return call(scope, id, destinationIdentity, 'raise_hand_ack');
}

/** Liveness probe. Returns elapsed ms when ok, null otherwise. */
export async function pingPeer(
  scope: RpcScope,
  id: string,
  destinationIdentity: string,
  responseTimeout = 8000,
): Promise<number | null> {
  const t0 = Date.now();
  const reply = await call(scope, id, destinationIdentity, 'ping', undefined, responseTimeout);
  if (!reply.ok) return null;
  return Date.now() - t0;
}

// =============================================================================
// helpers
// =============================================================================

function safeReason(payload: string): string {
  if (!payload) return '';
  try {
    const parsed = JSON.parse(payload);
    if (parsed && typeof parsed.reason === 'string') return parsed.reason.slice(0, 280);
  } catch {
    /* ignore */
  }
  return '';
}

function safeSeatIndex(payload: string): number | null {
  if (!payload) return null;
  try {
    const parsed = JSON.parse(payload);
    if (typeof parsed?.seatIndex === 'number' && Number.isFinite(parsed.seatIndex)) {
      return parsed.seatIndex;
    }
  } catch {
    /* ignore */
  }
  return null;
}
