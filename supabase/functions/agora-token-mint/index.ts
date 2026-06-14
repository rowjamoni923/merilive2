// Agora RTC token mint + credential validation
// POST { channelName: string, uid?: number, role?: "publisher"|"subscriber", expireSeconds?: number }
// Returns { token, appId, uid, channelName, expiresAt }
import { RtcTokenBuilder, RtcRole } from "npm:agora-token@2.0.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const APP_ID = Deno.env.get("AGORA_APP_ID");
    const APP_CERT = Deno.env.get("AGORA_APP_CERTIFICATE");
    if (!APP_ID || !APP_CERT) {
      return new Response(
        JSON.stringify({ error: "AGORA_APP_ID or AGORA_APP_CERTIFICATE not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let body: any = {};
    if (req.method === "POST") {
      try { body = await req.json(); } catch { body = {}; }
    }

    const channelName: string = String(body.channelName ?? "diagnostic-test");
    const uid: number = Number.isFinite(Number(body.uid)) ? Number(body.uid) : 0;
    const roleStr: string = body.role === "subscriber" ? "subscriber" : "publisher";
    const role = roleStr === "subscriber" ? RtcRole.SUBSCRIBER : RtcRole.PUBLISHER;
    const expireSeconds: number = Math.max(60, Math.min(86400, Number(body.expireSeconds ?? 3600)));

    const currentTs = Math.floor(Date.now() / 1000);
    const privilegeExpire = currentTs + expireSeconds;

    const token = RtcTokenBuilder.buildTokenWithUid(
      APP_ID,
      APP_CERT,
      channelName,
      uid,
      role,
      privilegeExpire,
      privilegeExpire,
    );

    return new Response(
      JSON.stringify({
        ok: true,
        appId: APP_ID,
        appIdLength: APP_ID.length,
        certLength: APP_CERT.length,
        channelName,
        uid,
        role: roleStr,
        token,
        tokenPrefix: token.slice(0, 12),
        expiresAt: new Date(privilegeExpire * 1000).toISOString(),
        sdkHint: "Use this token with AgoraRTC.join(appId, channelName, token, uid). Valid App ID/Cert always mint a token; full validation requires an actual join.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e?.message ?? e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
