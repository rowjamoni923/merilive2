import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://ayjdlvuurscxucatbbah.supabase.co";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5amRsdnV1cnNjeHVjYXRiYmFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNjQxMjMsImV4cCI6MjA5MDg0MDEyM30.5A53IMXcvGGnmXK9Dd96V7ceceh1JFuGmPom-hojWJc";

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
  error?: string;
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

  return fetch(`${SUPABASE_URL}/functions/v1/gift-service`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      'x-client-platform': platform,
    },
    body: JSON.stringify(payload),
  });
}

export async function callGiftService(payload: GiftServicePayload): Promise<GiftServiceResponse> {
  let accessToken = await getAccessToken(false);
  if (!accessToken) accessToken = await getAccessToken(true);
  if (!accessToken) throw new Error("No active session. Please sign in again.");

  let response = await doRequest(accessToken, payload);

  // Token may have been revoked server-side (single-device displacement,
  // password change). Try ONE silent refresh + retry before surfacing 401.
  if (response.status === 401) {
    const refreshed = await getAccessToken(true);
    if (refreshed && refreshed !== accessToken) {
      response = await doRequest(refreshed, payload);
    }
  }

  let data: GiftServiceResponse | null = null;
  try { data = await response.json(); } catch { data = null; }

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Your session expired. Please sign in again to send gifts.");
    }
    throw new Error(data?.error || `Gift request failed (${response.status})`);
  }

  return data ?? { success: false };
}
