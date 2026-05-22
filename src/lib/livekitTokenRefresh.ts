/**
 * Pkg189 — LiveKit token auto-refresh scheduler.
 *
 * LiveKit access tokens are issued with a fixed TTL (currently 6h, see
 * `supabase/functions/livekit-token/index.ts`). The SFU validates the JWT at
 * connect time and at every reconnect attempt. If the SDK silently reconnects
 * after the token has expired, the rejoin fails and the user is dropped.
 *
 * This helper:
 *   1. Schedules a silent token fetch 10 minutes before expiry.
 *   2. Pushes the fresh JWT into the live `Room` instance so any future
 *      reconnect uses it. The SDK exposes `room.engine.client.token` (string
 *      property) — we update it best-effort.
 *   3. On `RoomEvent.SignalReconnecting` / `Reconnecting`, immediately refetches
 *      a new token so the in-flight reconnect carries a valid JWT.
 *
 * Zero behavior change for short sessions (<5h50m). For long sessions the
 * refresh is invisible to the user — no UI flash, no disconnect.
 *
 * Usage (attach AFTER `room.connect(...)` resolves):
 *   const detach = attachLiveKitTokenRefresh(room, refetchToken, ttlSeconds);
 *   // on cleanup: detach();
 */

import { Room, RoomEvent, ConnectionState } from 'livekit-client';

export type RefetchTokenFn = () => Promise<{
  token: string;
  url?: string;
  ttl?: number;
} | null>;

interface AttachOptions {
  /** Refresh window before expiry (seconds). Default 600 (10 min). */
  refreshLeadSeconds?: number;
  /** Optional label for debug logs. */
  label?: string;
}

export function attachLiveKitTokenRefresh(
  room: Room,
  refetch: RefetchTokenFn,
  ttlSeconds: number,
  opts: AttachOptions = {}
): () => void {
  const leadSeconds = Math.max(60, opts.refreshLeadSeconds ?? 600);
  const label = opts.label ?? 'lk-token-refresh';

  let timer: ReturnType<typeof setTimeout> | null = null;
  let refreshing = false;
  let disposed = false;

  const scheduleNext = (validForSeconds: number) => {
    if (disposed) return;
    if (timer) clearTimeout(timer);
    const delayMs = Math.max(30_000, (validForSeconds - leadSeconds) * 1000);
    timer = setTimeout(() => {
      void doRefresh('scheduled');
    }, delayMs);
  };

  const applyTokenToRoom = (token: string) => {
    try {
      // livekit-client internals: room.engine.client carries the JWT used on
      // every reconnect attempt. Updating it is safe (string assignment) and
      // takes effect on the next signal-channel handshake.
      const engineClient = (room as unknown as {
        engine?: { client?: { token?: string } };
      }).engine?.client;
      if (engineClient && typeof engineClient.token === 'string') {
        engineClient.token = token;
      }
    } catch (err) {
      console.warn(`[${label}] failed to apply token to room:`, err);
    }
  };

  const doRefresh = async (reason: 'scheduled' | 'reconnecting') => {
    if (disposed || refreshing) return;
    if (room.state === ConnectionState.Disconnected) return;
    refreshing = true;
    try {
      const fresh = await refetch();
      if (!fresh?.token || disposed) return;
      applyTokenToRoom(fresh.token);
      const nextTtl = fresh.ttl ?? ttlSeconds;
      scheduleNext(nextTtl);
      if (reason === 'scheduled') {
        console.info(`[${label}] silent refresh ok, next in ${Math.round((nextTtl - leadSeconds) / 60)}min`);
      } else {
        console.info(`[${label}] token refreshed before reconnect`);
      }
    } catch (err) {
      console.warn(`[${label}] refresh failed:`, err);
      // Retry sooner on failure.
      scheduleNext(leadSeconds * 2);
    } finally {
      refreshing = false;
    }
  };

  const onReconnecting = () => {
    // Reconnect handshake will re-send the token; make sure it's fresh.
    void doRefresh('reconnecting');
  };

  room.on(RoomEvent.Reconnecting, onReconnecting);
  room.on(RoomEvent.SignalReconnecting, onReconnecting);

  scheduleNext(ttlSeconds);

  return () => {
    disposed = true;
    if (timer) clearTimeout(timer);
    timer = null;
    try {
      room.off(RoomEvent.Reconnecting, onReconnecting);
      room.off(RoomEvent.SignalReconnecting, onReconnecting);
    } catch {
      /* ignore */
    }
  };
}
