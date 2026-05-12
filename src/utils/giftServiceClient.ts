import { supabase } from "@/integrations/supabase/client";

export interface GiftServicePayload {
  receiverId: string;
  giftId: string;
  quantity?: number;
  streamId?: string | null;
  partyRoomId?: string | null;
  callId?: string | null;
}

export interface GiftServiceResponse {
  success: boolean;
  transactionId?: string;
  coinsSpent?: number;
  hostReceived?: number;
  hostPercent?: number;
  error?: string;
}

export async function callGiftService(payload: GiftServicePayload): Promise<GiftServiceResponse> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  if (!token) {
    throw new Error("No active session. Please sign in again.");
  }

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gift-service`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      "x-client-platform": "android-webview",
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let body: GiftServiceResponse = { success: false };
  try {
    body = text ? JSON.parse(text) : body;
  } catch {
    body = { success: false, error: text || `Gift request failed (${response.status})` };
  }

  if (!response.ok) {
    throw new Error(body.error || `Gift request failed (${response.status})`);
  }

  return body;
}