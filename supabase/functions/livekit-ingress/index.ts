// Pkg109: LiveKit RTMP/WHIP Ingress issuer
// Auth: Supabase JWT (host only).
// Body: { streamId: string, action: 'create' | 'delete', inputType?: 'rtmp' | 'whip' }
// Returns (create): { ingressId, url, streamKey, inputType }
// Returns (delete): { ok: true }
//
// Gate: app_settings.livekit_signaling_enabled.ingress === true
// One ingress per live_streams row (idempotent — returns existing on re-create).
import { createClient } from "npm:@supabase/supabase-js@2";
import { IngressClient, IngressInput, IngressAudioEncodingPreset, IngressVideoEncodingPreset } from "npm:livekit-server-sdk@2.9.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-client-platform",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LIVEKIT_URL = Deno.env.get("LIVEKIT_URL") ?? "";
const LIVEKIT_API_KEY = Deno.env.get("LIVEKIT_API_KEY") ?? "";
const LIVEKIT_API_SECRET = Deno.env.get("LIVEKIT_API_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const httpUrl = LIVEKIT_URL.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "missing_authorization" });

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return json(401, { error: "unauthorized" });

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Kill-switch
    const { data: setting } = await admin
      .from("app_settings")
      .select("setting_value")
      .eq("setting_key", "livekit_signaling_enabled")
      .maybeSingle();
    let ingressEnabled = false;
    try {
      const v = setting?.setting_value ? JSON.parse(setting.setting_value) : {};
      ingressEnabled = v?.ingress === true;
    } catch { ingressEnabled = false; }
    if (!ingressEnabled) return json(403, { error: "ingress_disabled" });

    const body = await req.json().catch(() => ({}));
    const { streamId, action, inputType } = body as {
      streamId?: string; action?: "create" | "delete"; inputType?: "rtmp" | "whip";
    };
    if (!streamId || !action) return json(400, { error: "streamId_and_action_required" });

    // Load stream + verify ownership
    const { data: stream, error: streamErr } = await admin
      .from("live_streams")
      .select("id, host_id, room_name, ingress_id, rtmp_url, stream_key, ingress_type, is_active")
      .eq("id", streamId)
      .maybeSingle();
    if (streamErr || !stream) return json(404, { error: "stream_not_found" });
    if (stream.host_id !== userId) return json(403, { error: "not_stream_host" });

    const ingressClient = new IngressClient(httpUrl, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

    if (action === "delete") {
      if (stream.ingress_id) {
        try { await ingressClient.deleteIngress(stream.ingress_id); }
        catch (e) { console.warn("deleteIngress failed (continuing):", (e as Error).message); }
      }
      await admin.from("live_streams").update({
        ingress_id: null, rtmp_url: null, stream_key: null, ingress_type: null,
      }).eq("id", streamId);
      return json(200, { ok: true });
    }

    // action === 'create' — idempotent
    if (stream.ingress_id && stream.rtmp_url && stream.stream_key) {
      return json(200, {
        ingressId: stream.ingress_id,
        url: stream.rtmp_url,
        streamKey: stream.stream_key,
        inputType: stream.ingress_type ?? "rtmp",
        reused: true,
      });
    }

    const roomName = stream.room_name ?? `live_${streamId}`;
    const wantWhip = inputType === "whip";
    const inputEnum = wantWhip ? IngressInput.WHIP_INPUT : IngressInput.RTMP_INPUT;

    const info = await ingressClient.createIngress(inputEnum, {
      name: `live-${streamId}`,
      roomName,
      participantIdentity: userId,
      participantName: "Host (RTMP)",
      audio: { preset: IngressAudioEncodingPreset.OPUS_STEREO_96KBPS },
      video: { preset: IngressVideoEncodingPreset.H264_1080P_30FPS_3_LAYERS },
    });

    const rtmpUrl = info.url ?? "";
    const streamKey = info.streamKey ?? "";
    const ingressId = info.ingressId ?? "";

    await admin.from("live_streams").update({
      rtmp_url: rtmpUrl,
      stream_key: streamKey,
      ingress_type: wantWhip ? "whip" : "rtmp",
    }).eq("id", streamId);

    return json(200, {
      ingressId, url: rtmpUrl, streamKey, inputType: wantWhip ? "whip" : "rtmp",
    });
  } catch (e) {
    console.error("livekit-ingress error:", e);
    return json(500, { error: (e as Error).message ?? "internal_error" });
  }
});
