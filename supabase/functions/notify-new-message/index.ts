import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface MessageNotificationRequest {
  conversationId: string;
  messageId: string;
  senderId: string;
  recipientId: string;
  messageContent: string;
  messageType?: string;
}

interface ServiceAccountCredentials {
  type: string;
  project_id: string;
  private_key: string;
  client_email: string;
}

// Generate JWT for FCM V1 authentication
async function getAccessToken(credentials: ServiceAccountCredentials): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 3600;

  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: credentials.client_email,
    sub: credentials.client_email,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
  };

  const encoder = new TextEncoder();
  const headerB64 = btoa(JSON.stringify(header)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const signatureInput = `${headerB64}.${payloadB64}`;

  const pemContents = credentials.private_key
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");

  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    encoder.encode(signatureInput)
  );

  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const jwt = `${signatureInput}.${signatureB64}`;

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenResponse.json();
  if (!tokenResponse.ok) {
    throw new Error(`Token exchange failed: ${tokenData.error_description || tokenData.error}`);
  }
  return tokenData.access_token;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const serviceAccountJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");

    if (!serviceAccountJson) {
      return new Response(
        JSON.stringify({ success: false, error: "FCM not configured" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { conversationId, messageId, senderId, recipientId, messageContent, messageType = 'text' }: MessageNotificationRequest = await req.json();

    // ── Pkg308 deep-audit: caller must be the sender ────────────────────────
    // Previously any authenticated client could call with arbitrary
    // senderId/recipientId/messageContent → spoof DM push notifications from
    // any user to any user.
    const authHeader = req.headers.get("authorization") || "";
    const bearer = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7) : "";
    const isServiceRoleCall = !!bearer && bearer === supabaseServiceKey;
    let callerUserId: string | null = null;
    if (!isServiceRoleCall && bearer) {
      try {
        // Prefer getClaims() — works with the asymmetric signing-keys system.
        // Fall back to getUser() for legacy HS256 tokens.
        const { data: c } = await supabase.auth.getClaims(bearer);
        callerUserId = (c?.claims?.sub as string) ?? null;
        if (!callerUserId) {
          const { data: u } = await supabase.auth.getUser(bearer);
          callerUserId = u?.user?.id ?? null;
        }
      } catch (e) {
        console.warn("[MsgPush] token validation failed:", e);
      }
    }
    if (!isServiceRoleCall && (!callerUserId || callerUserId !== senderId)) {
      console.warn("[MsgPush] Sender impersonation rejected", { callerUserId, senderId });
      return new Response(
        JSON.stringify({ success: false, error: "Forbidden" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    if (!conversationId || !messageId || !senderId || !recipientId) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required message notification fields" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // J2 dedup: prevent duplicate FCM push when sender's client retries.
    {
      const { error: dispatchErr } = await supabase
        .from("message_push_dispatches")
        .insert({ message_id: messageId });
      if (dispatchErr) {
        if (dispatchErr.code === "23505") {
          console.log(`[MsgPush] Skipping duplicate dispatch for message ${messageId}`);
          return new Response(
            JSON.stringify({ success: true, skipped: true, reason: "already_dispatched" }),
            { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        }
        console.warn("[MsgPush] Dispatch insert error (continuing):", dispatchErr);
      }
    }

    const { data: verifiedMessage, error: verifyError } = await supabase
      .from("messages")
      .select("id, conversation_id, sender_id, content, message_type, media_url")
      .eq("id", messageId)
      .eq("conversation_id", conversationId)
      .eq("sender_id", senderId)
      .maybeSingle();


    const { data: conversation, error: conversationError } = await supabase
      .from("conversations")
      .select("participant1_id, participant2_id")
      .eq("id", conversationId)
      .maybeSingle();
    const participants = [conversation?.participant1_id, conversation?.participant2_id];
    if (verifyError || conversationError || !verifiedMessage || !conversation || !participants.includes(senderId) || !participants.includes(recipientId)) {
      console.warn("[MsgPush] Message/conversation verification rejected", { conversationId, messageId, senderId, recipientId });
      return new Response(
        JSON.stringify({ success: false, error: "Message verification failed" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    // ────────────────────────────────────────────────────────────────────────

    console.log(`[MsgPush] New message from ${senderId} to ${recipientId}`);

    // Fetch sender profile and recipient device tokens in parallel
    const [senderResult, tokensResult] = await Promise.all([
      supabase.from("profiles").select("display_name, avatar_url").eq("id", senderId).single(),
      supabase.from("device_tokens").select("token, platform").eq("user_id", recipientId).eq("is_active", true),
    ]);

    const senderName = senderResult.data?.display_name || "Someone";
    const senderAvatar = senderResult.data?.avatar_url || "";
    const deviceTokens = tokensResult.data || [];

    if (deviceTokens.length === 0) {
      console.log("[MsgPush] No device tokens for recipient");
      return new Response(
        JSON.stringify({ success: false, error: "No device tokens" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Build notification content based on message type
    let body = String(verifiedMessage.content || messageContent || "");
    if (messageType === 'voice' || messageType === 'audio') body = "🎤 Voice message";
    else if (messageType === 'image') body = "📷 Photo";
    else if (messageType === 'video') body = "🎥 Video";
    else if (messageType === 'gift') body = "🎁 Sent you a gift!";
    else if (body.length > 100) body = body.substring(0, 97) + "...";

    // Pkg419 — DM photo push now uses message media_url as the big-picture
    // banner (was incorrectly using senderAvatar → users never saw the photo
    // they were sent). Falls back to senderAvatar for text/voice so the
    // notification still has a thumbnail.
    const messageMediaUrl = String(verifiedMessage.media_url || "");
    const isMediaMessage = messageType === "image" || messageType === "video";
    const pushImageUrl = isMediaMessage && messageMediaUrl
      ? messageMediaUrl
      : (senderAvatar || "");

    const credentials: ServiceAccountCredentials = JSON.parse(serviceAccountJson);
    const accessToken = await getAccessToken(credentials);
    const projectId = credentials.project_id;

    const results = await Promise.all(
      deviceTokens.map(async (device) => {
        try {
          // WhatsApp/Imo/Chamet pattern: data-only + priority:high.
          // Forces onMessageReceived() in ALL states (foreground / background /
          // killed) so our MeriFirebaseMessagingService can render rich
          // BigPictureStyle with emoji prefix + message photo (for image DMs)
          // on the correct merilive_messages channel (HIGH importance, sound,
          // vibration).
          const fcmMessage = {
            message: {
              token: device.token,
              data: {
                type: "message",
                title: senderName,
                body,
                image_url: pushImageUrl ?? "",
                media_url: messageMediaUrl ?? "",
                icon_emoji: messageType === "voice" ? "🎤"
                          : messageType === "image" ? "📷"
                          : messageType === "video" ? "🎥"
                          : messageType === "gift"  ? "🎁"
                          : "💬",
                conversationId,
                senderId,
                senderName: senderName ?? "",
                senderAvatar: senderAvatar ?? "",
                // Pkg425: was `messageType` (safe), kept as `msg_type` to make
                // it explicit this is NOT FCM-reserved `message_type`.
                msg_type: messageType ?? "text",
                click_action: "OPEN_CHAT",
              },
              android: {
                priority: "high" as const,
                ttl: "86400s",
                // No `notification` block on purpose — keep data-only so
                // killed-app onMessageReceived fires and renders via
                // CHANNEL_MESSAGES (= "merilive_messages") with sound.
              },
              apns: {
                headers: {
                  "apns-priority": "10",
                  "apns-push-type": "alert",
                },
                payload: {
                  aps: {
                    alert: { title: senderName, body },
                    sound: "default",
                    badge: 1,
                    "thread-id": conversationId,
                    "mutable-content": 1,
                  },
                  ...(pushImageUrl ? { fcm_options: { image: pushImageUrl } } : {}),
                },
              },
            },
          };


          const response = await fetch(
            `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
            {
              method: "POST",
                "Content-Type": "application/json",
                "Authorization": `Bearer ${accessToken}`,
              },
              body: JSON.stringify(fcmMessage),
            }
          );

          const result = await response.json();

          if (!response.ok) {
            if (result.error?.details?.some((d: { errorCode?: string }) =>
              d.errorCode === 'UNREGISTERED' || d.errorCode === 'INVALID_ARGUMENT'
            )) {
              await supabase.from("device_tokens").update({ is_active: false }).eq("token", device.token);
              console.log("[MsgPush] Marked invalid token as inactive");
            }
            return { success: false, error: result.error };
          }

          return { success: true, messageId: result.name };
        } catch (err) {
          console.error("[MsgPush] FCM send error:", err);
          return { success: false, error: String(err) };
        }
      })
    );

    const successCount = results.filter(r => r.success).length;
    console.log(`[MsgPush] Sent ${successCount}/${deviceTokens.length} push notifications`);

    return new Response(
      JSON.stringify({ success: successCount > 0, sent: successCount, total: deviceTokens.length }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[MsgPush] Error:", msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
