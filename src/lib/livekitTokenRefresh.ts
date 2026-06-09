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
  /**
   * N3d follow-up — when running on the native plugin and the SDK has no
   * public token-swap API, force a brief reconnect to apply the fresh JWT.
   * Defaults to true on native (proactive rotation). The reconnect fires
   * ~30 s before the OLD token expires IF a fresh one was applied this
   * cycle. Web is unaffected (engine.client.token swap is sufficient).
   */
  forceNativeReconnectOnRotate?: boolean;
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
  let rotateReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let refreshing = false;
  let disposed = false;
  let nativeReconnectOnRotate = opts.forceNativeReconnectOnRotate;

  const scheduleNext = (validForSeconds: number) => {
    if (disposed) return;
    if (timer) clearTimeout(timer);
    const delayMs = Math.max(30_000, (validForSeconds - leadSeconds) * 1000);
    timer = setTimeout(() => {
      void doRefresh('scheduled');
    }, delayMs);
  };

  /**
   * N3d follow-up — livekit-android has no public client-side token-swap
   * API. We push the fresh token into `lastConnectArgs`, then trigger a
   * brief forced reconnect ~30 s before the OLD token expires so the new
   * JWT is actually adopted (Bigo/Agora `renewToken` is also reconnect-
   * driven on Android). Reconnect is skipped if the SDK organically
   * reconnects (Reconnecting event already swapped the JWT).
   */
  const scheduleNativeRotateReconnect = (validForSeconds: number) => {
    if (disposed) return;
    if (nativeReconnectOnRotate === false) return;
    if (rotateReconnectTimer) clearTimeout(rotateReconnectTimer);
    // Fire 30 s before token expiry, but never earlier than 60 s from now
    // (so a stable session at T-0 still has breathing room).
    const delayMs = Math.max(60_000, (validForSeconds - 30) * 1000);
    rotateReconnectTimer = setTimeout(() => {
      void forceNativeRotateReconnect();
    }, delayMs);
  };

  const forceNativeRotateReconnect = async () => {
    if (disposed) return;
    try {
      const mod = await import('@/plugins/NativeLiveKit');
      if (!mod.isNativeLiveKitAvailable()) return;
      const native = mod.NativeLiveKit as unknown as {
        getActiveSession: () => Promise<{ active: boolean }>;
        reconnectNow?: (opts?: Record<string, unknown>) => Promise<unknown>;
      };
      const session = await native.getActiveSession().catch(() => ({ active: false }));
      if (!session.active || disposed) return;
      if (typeof native.reconnectNow === 'function') {
        await native.reconnectNow({ reason: 'token-rotation' });
        console.info(`[${label}] forced native reconnect for token rotation`);
      }
    } catch (err) {
      console.warn(`[${label}] forced native reconnect failed:`, err);
    }
  };

  const applyTokenToRoom = (token: string, ttlSecondsForReconnect: number) => {
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
    // N3d — also push the new token to the native plugin so a future native
    // hard-reconnect uses it. No-op on web/iOS (gate returns false).
    void (async () => {
      try {
        const mod = await import('@/plugins/NativeLiveKit');
        if (!mod.isNativeLiveKitAvailable()) return;
        await mod.NativeLiveKit.refreshToken({ token });
        // Default to ON when we're on native + opts didn't override.
        if (nativeReconnectOnRotate === undefined) nativeReconnectOnRotate = true;
        scheduleNativeRotateReconnect(ttlSecondsForReconnect);
      } catch (err) {
        console.warn(`[${label}] native refreshToken failed:`, err);
      }
    })();
  };

  const doRefresh = async (reason: 'scheduled' | 'reconnecting') => {
    if (disposed || refreshing) return;
    if (room.state === ConnectionState.Disconnected) return;
    refreshing = true;
    try {
      const fresh = await refetch();
      if (!fresh?.token || disposed) return;
      const nextTtl = fresh.ttl ?? ttlSeconds;
      applyTokenToRoom(fresh.token, nextTtl);
      scheduleNext(nextTtl);
      if (reason === 'scheduled') {
        console.info(`[${label}] silent refresh ok, next in ${Math.round((nextTtl - leadSeconds) / 60)}min`);
      } else {
        console.info(`[${label}] token refreshed before reconnect`);
        // Organic reconnect in flight — cancel any pending rotation reconnect.
        if (rotateReconnectTimer) { clearTimeout(rotateReconnectTimer); rotateReconnectTimer = null; }
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
    // Also cancel any pending rotation reconnect — the SDK is already cycling.
    if (rotateReconnectTimer) { clearTimeout(rotateReconnectTimer); rotateReconnectTimer = null; }
    void doRefresh('reconnecting');
  };

  room.on(RoomEvent.Reconnecting, onReconnecting);
  room.on(RoomEvent.SignalReconnecting, onReconnecting);

  // F-5.4 — native plugin emits `lk:token-expired` when the SFU drops the
  // session with DisconnectReason.TOKEN_EXPIRED. Stale-JWT reconnect would
  // re-fail, so fetch a fresh token then trigger an immediate native reconnect.
  const onTokenExpired = () => {
    if (disposed) return;
    void (async () => {
      try {
        const fresh = await refetch();
        if (!fresh?.token || disposed) return;
        applyTokenToRoom(fresh.token, fresh.ttl ?? ttlSeconds);
        const mod = await import('@/plugins/NativeLiveKit');
        if (mod.isNativeLiveKitAvailable()) {
          await mod.NativeLiveKit.reconnectNow().catch(() => undefined);
          console.info(`[${label}] token-expired → reconnect issued`);
        }
        scheduleNext(fresh.ttl ?? ttlSeconds);
      } catch (err) {
        console.warn(`[${label}] token-expired handler failed:`, err);
      }
    })();
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('lk:token-expired', onTokenExpired);
  }

  scheduleNext(ttlSeconds);

  return () => {
    disposed = true;
    if (timer) clearTimeout(timer);
    timer = null;
    if (rotateReconnectTimer) clearTimeout(rotateReconnectTimer);
    rotateReconnectTimer = null;
    try {
      room.off(RoomEvent.Reconnecting, onReconnecting);
      room.off(RoomEvent.SignalReconnecting, onReconnecting);
    } catch {
      /* ignore */
    }
    if (typeof window !== 'undefined') {
      try { window.removeEventListener('lk:token-expired', onTokenExpired); } catch { /* noop */ }
    }
  };
}

