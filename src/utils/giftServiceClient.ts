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

  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (sessionErr || !accessToken) {
    throw new Error("No active session. Please sign in again.");
  }

  // Pkg306 audit: header was hardcoded "android-webview" — wrong for web.
  const isNative = typeof (globalThis as any)?.Capacitor?.isNativePlatform === 'function'
    && (globalThis as any).Capacitor.isNativePlatform();
  const platform = isNative ? 'android-webview' : 'web';

  // Explicit fetch guarantees the Edge Function receives the current user JWT.
  // functions.invoke can fall back to anon when auth storage is still settling on native/webview.
  const response = await fetch(`${SUPABASE_URL}/functions/v1/gift-service`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      'x-client-platform': platform,
    },
    body: JSON.stringify(payload),
  });

  let data: GiftServiceResponse | null = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(data?.error || `Gift request failed (${response.status})`);
  }

  return data ?? { success: false };
}
