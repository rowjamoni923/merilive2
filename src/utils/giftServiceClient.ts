import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://ayjdlvuurscxucatbbah.supabase.co";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5amRsdnV1cnNjeHVjYXRiYmFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNjQxMjMsImV4cCI6MjA5MDg0MDEyM30.5A53IMXcvGGnmXK9Dd96V7ceceh1JFuGmPom-hojWJc";
const GIFT_EDGE_TIMEOUT_MS = 12_000;

export interface GiftServicePayload {
  receiverId: string;
  giftId: string;
  quantity?: number;
  streamId?: string | null;
  partyRoomId?: string | null;
  callId?: string | null;
  reelId?: string | null;
  /**
   * Optional caller-supplied idempotency key. If omitted, callGiftService
   * auto-generates a stable key for the lifetime of this single call (incl.
   * the 401 silent-refresh retry) so a dropped HTTP response cannot
   * double-charge the sender.
   */
  idempotencyKey?: string;
}

function generateIdempotencyKey(): string {
  try {
    const c: any = (globalThis as any).crypto;
    if (c?.randomUUID) return c.randomUUID();
  } catch {}
  return `gift_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

export interface GiftServiceResponse {
  success: boolean;
  senderId?: string;
  transactionId?: string;
  coinsSpent?: number;
  hostReceived?: number;
  hostPercent?: number;
  newBalance?: number | null;
  /** Lucky-gift diamond bonus paid to sender. 0 when no win or not a lucky gift. */
  diamondBonus?: number;
  isLucky?: boolean;
  error?: string;
  /** Structured failure code — callers can branch on this instead of parsing `error`. */
  code?: 'AUTH_EXPIRED' | string;
}

const AUTH_EXPIRED: GiftServiceResponse = {
  success: false,
  code: 'AUTH_EXPIRED',
  error: 'Your session expired. Please sign in again to send gifts.',
};

function normalizeRpcGiftResponse(result: any): GiftServiceResponse {
  if (!result?.success) {
    return { success: false, error: result?.error || 'Gift failed' };
  }

  return {
    success: true,
    senderId: result.sender_id,
    transactionId: result.transaction_id,
    coinsSpent: Number(result.diamonds_spent ?? result.total_cost ?? 0),
    hostReceived: Number(result.beans_earned ?? result.beans_received ?? 0),
    hostPercent: result.host_percent,
    newBalance: result.new_balance ?? result.new_sender_balance ?? null,
    diamondBonus: Number(result.diamond_bonus ?? 0),
    isLucky: Boolean(result.is_lucky ?? false),
  };
}

/**
 * Phase 4A — Confirm-by-idempotency.
 *
 * When the edge function aborts (12s timeout, transient 5xx, or network drop),
 * the server may have already processed the transaction. Polling
 * `gift_transactions` by idempotency_key lets us recover a silent success
 * instead of showing a false "Gift failed" toast AND refunding coins that
 * were actually spent. Read-only — never re-issues the charge.
 */
async function confirmGiftByIdempotencyKey(
  key: string,
  timeoutMs = 5000,
): Promise<GiftServiceResponse | null> {
  if (!key) return null;
  const deadline = Date.now() + timeoutMs;
  // Initial small delay so server has time to write the row.
  await new Promise(r => setTimeout(r, 250));
  while (Date.now() < deadline) {
    try {
      const { data, error } = await supabase
        .from('gift_transactions')
        .select('id, sender_id, diamond_amount, receiver_beans, total_diamonds')
        .eq('idempotency_key', key)
        .maybeSingle();
      if (!error && data) {
        return {
          success: true,
          senderId: (data as any).sender_id,
          transactionId: (data as any).id,
          coinsSpent: Number((data as any).total_diamonds ?? (data as any).diamond_amount ?? 0),
          hostReceived: Number((data as any).receiver_beans ?? 0),
          newBalance: null,
          diamondBonus: 0,
          isLucky: false,
        };
      }
    } catch {}
    await new Promise(r => setTimeout(r, 400));
  }
  return null;
}

async function callGiftRpcFallback(payload: GiftServicePayload): Promise<GiftServiceResponse> {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error('No active session. Please sign in again.');

  const { data, error } = await supabase.rpc('process_gift_transaction' as any, {
    p_sender_id: user.id,
    p_receiver_id: payload.receiverId,
    p_gift_id: payload.giftId,
    p_quantity: payload.quantity ?? 1,
    p_stream_id: payload.streamId ?? null,
    p_party_room_id: payload.partyRoomId ?? null,
    p_call_id: payload.callId ?? null,
    p_reel_id: payload.reelId ?? null,
    p_idempotency_key: payload.idempotencyKey ?? null,
  });

  if (error) throw new Error(error.message || 'Gift request failed');
  return normalizeRpcGiftResponse(data);
}


async function getAccessToken(forceRefresh: boolean): Promise<string | null> {
  if (forceRefresh) {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (!error && data?.session?.access_token) return data.session.access_token;
    } catch {}
    return null;
  }
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

async function doRequest(accessToken: string, payload: GiftServicePayload): Promise<Response> {
  const isNative = typeof (globalThis as any)?.Capacitor?.isNativePlatform === 'function'
    && (globalThis as any).Capacitor.isNativePlatform();
  const platform = isNative ? 'android-webview' : 'web';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GIFT_EDGE_TIMEOUT_MS);

  try {
    return await fetch(`${SUPABASE_URL}/functions/v1/gift-service`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        'x-client-platform': platform,
      },
      body: JSON.stringify(payload),
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function callGiftService(payload: GiftServicePayload): Promise<GiftServiceResponse> {
  // Stabilize idempotency key BEFORE any network attempt. The same key MUST be
  // sent on the silent 401 retry below so the server can recognize a replay.
  const stablePayload: GiftServicePayload = {
    ...payload,
    idempotencyKey: payload.idempotencyKey || generateIdempotencyKey(),
  };
  const idemKey = stablePayload.idempotencyKey!;

  // Phase 4A — silent recovery helper. Any "soft failure" path (timeout, 5xx,
  // network drop, RPC fallback returning empty error) checks the DB before
  // surfacing an error to the user, because the server may have committed.
  const tryConfirm = async (fallback: GiftServiceResponse): Promise<GiftServiceResponse> => {
    const confirmed = await confirmGiftByIdempotencyKey(idemKey);
    return confirmed ?? fallback;
  };
  const tryConfirmOrThrow = async (err: Error): Promise<GiftServiceResponse> => {
    const confirmed = await confirmGiftByIdempotencyKey(idemKey);
    if (confirmed) return confirmed;
    throw err;
  };

  let accessToken = await getAccessToken(false);
  if (!accessToken) accessToken = await getAccessToken(true);
  if (!accessToken) return AUTH_EXPIRED;

  let response: Response;
  try {
    response = await doRequest(accessToken, stablePayload);
  } catch (error) {
    console.warn('[GiftServiceClient] Edge fetch failed; falling back to RPC:', error);
    try {
      const rpc = await callGiftRpcFallback(stablePayload);
      if (!rpc.success) return tryConfirm(rpc);
      return rpc;
    } catch (e) {
      return tryConfirmOrThrow(e as Error);
    }
  }

  // Token may have been revoked server-side (single-device displacement,
  // password change). Try ONE silent refresh + retry before surfacing 401.
  if (response.status === 401) {
    const refreshed = await getAccessToken(true);
    if (refreshed && refreshed !== accessToken) {
      try {
        response = await doRequest(refreshed, stablePayload);
      } catch (error) {
        console.warn('[GiftServiceClient] Edge retry fetch failed; falling back to RPC:', error);
        try {
          const rpc = await callGiftRpcFallback(stablePayload);
          if (!rpc.success) return tryConfirm(rpc);
          return rpc;
        } catch (e) {
          return tryConfirmOrThrow(e as Error);
        }
      }
    }
  }

  let data: GiftServiceResponse | null = null;
  try { data = await response.json(); } catch { data = null; }

  if (!response.ok) {
    if (response.status === 401) {
      // Hard auth failure — session is gone server-side. Return a structured
      // response so callers surface a toast; throwing here would escape to
      // React error boundaries and blank the screen.
      return AUTH_EXPIRED;
    }
    if (response.status === 502 || response.status === 503 || response.status === 504) {
      console.warn('[GiftServiceClient] Edge temporarily unavailable; falling back to RPC:', response.status);
      try {
        const rpc = await callGiftRpcFallback(stablePayload);
        if (!rpc.success) return tryConfirm(rpc);
        return rpc;
      } catch (e) {
        return tryConfirmOrThrow(e as Error);
      }
    }
    // Unknown error status — server MIGHT have processed before crashing.
    // Silently confirm before throwing to the caller.
    return tryConfirmOrThrow(new Error(data?.error || `Gift request failed (${response.status})`));
  }

  // Edge returned 200 but body says success:false (RPC inside reported
  // failure). Confirm via DB before surfacing — covers the "Gift failed:
  // Gift failed" empty-error path the user has been seeing.
  if (data && data.success === false) {
    return tryConfirm(data);
  }

  return data ?? tryConfirm({ success: false, error: 'Empty response' });
}
