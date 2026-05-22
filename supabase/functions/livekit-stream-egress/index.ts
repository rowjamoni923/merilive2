// Pkg114: LiveKit Stream Egress — push host's live room to RTMP(S) endpoints
// (YouTube Live / Facebook Live / Twitch / custom).
//
// Auth: Supabase JWT. Host-only: caller must own the live_streams row.
// Body: { action: 'start', streamId, urls: string[], layout?, audioOnly? }
//       { action: 'stop',  egressId }
//
// Kill-switch: app_settings.livekit_signaling_enabled.stream_egress === true
import { createClient } from "npm:@supabase/supabase-js@2";
import { EgressClient } from "npm:livekit-server-sdk@2.9.4";

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

/**
 * Detect provider from RTMP URL host.
 * Public so behavior is testable and consistent with the client-side display.
 */
export function detectProvider(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host.includes("youtube") || host.includes("googlevideo")) return "youtube";
    if (host.includes("facebook") || host.includes("fbcdn")) return "facebook";
    if (host.includes("twitch")) return "twitch";
    if (host.includes("kick")) return "kick";
    if (host.includes("trovo")) return "trovo";
    return "custom";
  } catch {
    return "custom";
  }
}

/**
 * Mask stream key in an RTMP URL.
 * rtmp://a.rtmp.youtube.com/live2/abcd-1234-key → rtmp://a.rtmp.youtube.com/live2/abcd•••key
 */
export function maskRtmpUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname || "";
    const lastSlash = path.lastIndexOf("/");
    if (lastSlash < 0 || lastSlash === path.length - 1) return `${u.protocol}//${u.host}${path}`;
    const base = path.slice(0, lastSlash + 1);
    const key = path.slice(lastSlash + 1);
    if (key.length <= 6) return `${u.protocol}//${u.host}${base}••••`;
    const masked = `${key.slice(0, 4)}•••${key.slice(-3)}`;
    return `${u.protocol}//${u.host}${base}${masked}`;
  } catch {
    return "invalid_url";
  }
}

export function isValidRtmpUrl(url: string): boolean {
  if (typeof url !== "string" || url.length === 0 || url.length > 500) return false;
  return /^rtmps?:\/\/[^\s]+\/[^\s]+\/[^\s]+/i.test(url);
}

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
    let enabled = false;
    try {
      const v = setting?.setting_value ? JSON.parse(setting.setting_value) : {};
      enabled = v?.stream_egress === true;
    } catch { enabled = false; }
    if (!enabled) return json(403, { error: "stream_egress_disabled" });

    const body = await req.json().catch(() => ({}));
    const action = body?.action as string | undefined;

    if (action === "start") {
      const { streamId, urls, layout, audioOnly } = body as {
        streamId?: string;
        urls?: string[];
        layout?: string;
        audioOnly?: boolean;
      };
      if (!streamId) return json(400, { error: "streamId_required" });
      if (!Array.isArray(urls) || urls.length === 0) {
        return json(400, { error: "urls_required" });
      }
      if (urls.length > 5) return json(400, { error: "too_many_urls" });
      const cleanUrls = urls.map((u) => String(u).trim());
      for (const u of cleanUrls) {
        if (!isValidRtmpUrl(u)) return json(400, { error: "invalid_rtmp_url", url: u });
      }

      const { data: stream, error: streamErr } = await admin
        .from("live_streams")
        .select("id, host_id, room_name, is_active")
        .eq("id", streamId)
        .maybeSingle();
      if (streamErr || !stream) return json(404, { error: "stream_not_found" });
      if (stream.host_id !== userId) return json(403, { error: "not_stream_host" });
      if (!stream.is_active) return json(409, { error: "stream_not_active" });

      const roomName = stream.room_name ?? `live_${streamId}`;

      const egress = new EgressClient(httpUrl, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

      let info;
      try {
        // RoomCompositeEgress with stream output. RTMP/RTMPS protocol.
        info = await egress.startRoomCompositeEgress(
          roomName,
          { stream: { protocol: 1 /* RTMP */, urls: cleanUrls } as never },
          {
            layout: layout ?? "speaker",
            audioOnly: !!audioOnly,
          },
        );
      } catch (e) {
        const msg = (e as Error).message ?? "stream_egress_start_failed";
        console.error("[Pkg114] startRoomCompositeEgress stream failed:", msg);
        return json(502, { error: "stream_egress_start_failed", detail: msg });
      }

      const maskedUrls = cleanUrls.map(maskRtmpUrl);
      const providers = cleanUrls.map(detectProvider);

      const { data: row } = await admin
        .from("stream_simulcasts")
        .insert({
          stream_id: streamId,
          host_id: userId,
          room_name: roomName,
          egress_id: info.egressId,
          rtmp_urls_masked: maskedUrls,
          providers,
          status: "starting",
        })
        .select("id")
        .single();

      return json(200, {
        egressId: info.egressId,
        simulcastId: row?.id ?? null,
        providers,
        rtmpUrlsMasked: maskedUrls,
      });
    }

    if (action === "stop") {
      const { egressId } = body as { egressId?: string };
      if (!egressId) return json(400, { error: "egressId_required" });

      const { data: row } = await admin
        .from("stream_simulcasts")
        .select("id, host_id")
        .eq("egress_id", egressId)
        .maybeSingle();
      if (!row) return json(404, { error: "simulcast_not_found" });
      if (row.host_id !== userId) return json(403, { error: "not_simulcast_owner" });

      try {
        const egress = new EgressClient(httpUrl, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
        await egress.stopEgress(egressId);
      } catch (e) {
        console.warn("[Pkg114] stopEgress failed (continuing):", (e as Error).message);
      }

      await admin
        .from("stream_simulcasts")
        .update({ status: "stopping", ended_at: new Date().toISOString() })
        .eq("id", row.id);

      return json(200, { ok: true });
    }

    return json(400, { error: "unknown_action" });
  } catch (e) {
    console.error("livekit-stream-egress error:", e);
    return json(500, { error: (e as Error).message ?? "internal_error" });
  }
});
