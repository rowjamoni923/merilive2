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
}

function normalizeRpcGiftResponse(result: any): GiftServiceResponse {
  if (!result?.success) {
    return { success: false, error: result?.error || 'Gift failed' };
  }

  return {
    success: true,
    senderId: result.sender_id,
    transactionId: result.transaction_id,
    coinsSpent: Number(result.coins_spent ?? result.total_cost ?? 0),
    hostReceived: Number(result.beans_earned ?? result.beans_received ?? 0),
    hostPercent: result.host_percent,
    newBalance: result.new_balance ?? result.new_sender_balance ?? null,
    diamondBonus: Number(result.diamond_bonus ?? 0),
    isLucky: Boolean(result.is_lucky ?? false),
  };
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

  let accessToken = await getAccessToken(false);
  if (!accessToken) accessToken = await getAccessToken(true);
  if (!accessToken) throw new Error("No active session. Please sign in again.");

  let response: Response;
  try {
    response = await doRequest(accessToken, stablePayload);
  } catch (error) {
    console.warn('[GiftServiceClient] Edge fetch failed; falling back to RPC:', error);
    return callGiftRpcFallback(stablePayload);
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
        return callGiftRpcFallback(stablePayload);
      }
    }
  }

  let data: GiftServiceResponse | null = null;
  try { data = await response.json(); } catch { data = null; }

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Your session expired. Please sign in again to send gifts.");
    }
    if (response.status === 502 || response.status === 503 || response.status === 504) {
      console.warn('[GiftServiceClient] Edge temporarily unavailable; falling back to RPC:', response.status);
      return callGiftRpcFallback(stablePayload);
    }
    throw new Error(data?.error || `Gift request failed (${response.status})`);
  }

  return data ?? { success: false };
}
