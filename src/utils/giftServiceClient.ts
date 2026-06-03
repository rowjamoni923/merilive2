import { supabase } from "@/integrations/supabase/client";

export interface GiftServicePayload {
  receiverId: string;
  giftId: string;
  quantity?: number;
  streamId?: string | null;
  partyRoomId?: string | null;
  callId?: string | null;
  reelId?: string | null;
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

export async function callGiftService(payload: GiftServicePayload): Promise<GiftServiceResponse> {
  // Force a fresh user check — this triggers an auto refresh if the cached
  // access token has been revoked server-side (single-device displacement,
  // password change, etc.), avoiding a stale-token 401 from the edge fn.
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    throw new Error("No active session. Please sign in again.");
  }

  // Pkg306 audit: header was hardcoded "android-webview" — wrong for web.
  const isNative = typeof (globalThis as any)?.Capacitor?.isNativePlatform === 'function'
    && (globalThis as any).Capacitor.isNativePlatform();
  const platform = isNative ? 'android-webview' : 'web';

  // supabase.functions.invoke auto-attaches the (refreshed) access token.
  const { data, error } = await supabase.functions.invoke<GiftServiceResponse>('gift-service', {
    body: payload,
    headers: { 'x-client-platform': platform },
  });

  if (error) {
    // FunctionsHttpError exposes the response body via .context
    let serverMsg: string | undefined;
    try {
      const ctxResp = (error as any)?.context;
      if (ctxResp && typeof ctxResp.json === 'function') {
        const parsed = await ctxResp.json();
        serverMsg = parsed?.error;
      }
    } catch {
      // ignore
    }
    throw new Error(serverMsg || error.message || 'Gift request failed');
  }

  return data ?? { success: false };
}
