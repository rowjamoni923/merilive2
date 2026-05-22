// Pkg126: LiveKit HLS Egress — start/stop SEGMENTED (.m3u8 + .ts) recording
// for a live stream. Browser-native replay (no S3 download / no MP4 player).
//
// Auth: Supabase JWT. Host-only: caller must own the live_streams row.
// Body: { action: 'start', streamId, layout?, audioOnly?, segmentDuration? }
//       { action: 'stop',  egressId }
// Returns start: { egressId, recordingId, playlistUrl, alreadyRecording? }
//
// Reuses the SAME S3 bucket / creds as Pkg111 (LIVEKIT_EGRESS_S3_*).
// Files: HLS playlist + .ts segments written under
//        `hls/{host_id}/{streamId}/{ts}/index.m3u8` + `..._00000.ts ...`.
//
// Kill-switch: app_settings.livekit_signaling_enabled.hls_egress === true
import { createClient } from "npm:@supabase/supabase-js@2";
import { EgressClient, SegmentedFileProtocol } from "npm:livekit-server-sdk@2.9.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-client-platform",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LIVEKIT_URL = Deno.env.get("LIVEKIT_URL") ?? "";
const LIVEKIT_API_KEY = Deno.env.get("LIVEKIT_API_KEY") ?? "";
const LIVEKIT_API_SECRET = Deno.env.get("LIVEKIT_API_SECRET") ?? "";
const S3_BUCKET = Deno.env.get("LIVEKIT_EGRESS_S3_BUCKET") ?? "";
const S3_REGION = Deno.env.get("LIVEKIT_EGRESS_S3_REGION") ?? "";
const S3_ACCESS_KEY = Deno.env.get("LIVEKIT_EGRESS_S3_ACCESS_KEY") ?? "";
const S3_SECRET = Deno.env.get("LIVEKIT_EGRESS_S3_SECRET") ?? "";
const S3_ENDPOINT = Deno.env.get("LIVEKIT_EGRESS_S3_ENDPOINT") ?? "";
const S3_PUBLIC_BASE = (Deno.env.get("LIVEKIT_EGRESS_S3_PUBLIC_BASE") ?? "").replace(/\/+$/, "");

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const httpUrl = LIVEKIT_URL.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function s3Configured(): boolean {
  return !!(S3_BUCKET && S3_REGION && S3_ACCESS_KEY && S3_SECRET);
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
    let hlsEnabled = false;
    try {
      const v = setting?.setting_value ? JSON.parse(setting.setting_value) : {};
      hlsEnabled = v?.hls_egress === true;
    } catch { hlsEnabled = false; }
    if (!hlsEnabled) return json(403, { error: "hls_egress_disabled" });

    const body = await req.json().catch(() => ({}));
    const action = body?.action as string | undefined;

    if (action === "start") {
      if (!s3Configured()) return json(500, { error: "egress_s3_not_configured" });

      const { streamId, layout, audioOnly, segmentDuration } = body as {
        streamId?: string; layout?: string; audioOnly?: boolean; segmentDuration?: number;
      };
      if (!streamId) return json(400, { error: "streamId_required" });

      const { data: stream, error: streamErr } = await admin
        .from("live_streams")
        .select("id, host_id, room_name, is_active, hls_egress_id")
        .eq("id", streamId)
        .maybeSingle();
      if (streamErr || !stream) return json(404, { error: "stream_not_found" });
      if (stream.host_id !== userId) return json(403, { error: "not_stream_host" });
      if (!stream.is_active) return json(409, { error: "stream_not_active" });
      if (stream.hls_egress_id) {
        return json(200, { egressId: stream.hls_egress_id, alreadyRecording: true });
      }

      const roomName = stream.room_name ?? `live_${streamId}`;
      const ts = Date.now();
      const prefix = `hls/${stream.host_id}/${streamId}/${ts}/segment`;
      const playlistName = `hls/${stream.host_id}/${streamId}/${ts}/index.m3u8`;
      const segDur = Math.max(2, Math.min(10, Number(segmentDuration) || 4));

      const egress = new EgressClient(httpUrl, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

      const segmentOutput: Record<string, unknown> = {
        protocol: SegmentedFileProtocol.HLS_PROTOCOL,
        filenamePrefix: prefix,
        playlistName,
        segmentDuration: segDur,
        s3: {
          accessKey: S3_ACCESS_KEY,
          secret: S3_SECRET,
          region: S3_REGION,
          bucket: S3_BUCKET,
          ...(S3_ENDPOINT ? { endpoint: S3_ENDPOINT } : {}),
        },
      };

      let info;
      try {
        info = await egress.startRoomCompositeEgress(
          roomName,
          { segments: segmentOutput as never },
          {
            layout: layout ?? "speaker",
            audioOnly: !!audioOnly,
          },
        );
      } catch (e) {
        const msg = (e as Error).message ?? "hls_egress_start_failed";
        console.error("[Pkg126] startRoomCompositeEgress HLS failed:", msg);
        return json(502, { error: "hls_egress_start_failed", detail: msg });
      }

      const playlistUrl = S3_PUBLIC_BASE ? `${S3_PUBLIC_BASE}/${playlistName}` : null;

      const { data: recRow } = await admin
        .from("stream_recordings")
        .insert({
          stream_id: streamId,
          host_id: userId,
          room_name: roomName,
          egress_id: info.egressId,
          output_type: "s3",
          format: "hls",
          playlist_url: playlistUrl,
          status: "starting",
        })
        .select("id")
        .single();

      await admin
        .from("live_streams")
        .update({
          hls_egress_id: info.egressId,
          hls_playlist_url: playlistUrl,
          hls_status: "starting",
        })
        .eq("id", streamId);

      return json(200, {
        egressId: info.egressId,
        recordingId: recRow?.id ?? null,
        playlistUrl,
      });
    }

    if (action === "stop") {
      const { egressId } = body as { egressId?: string };
      if (!egressId) return json(400, { error: "egressId_required" });

      const { data: recRow } = await admin
        .from("stream_recordings")
        .select("id, host_id, stream_id")
        .eq("egress_id", egressId)
        .maybeSingle();
      if (!recRow) return json(404, { error: "recording_not_found" });
      if (recRow.host_id !== userId) return json(403, { error: "not_recording_owner" });

      try {
        const egress = new EgressClient(httpUrl, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
        await egress.stopEgress(egressId);
      } catch (e) {
        console.warn("[Pkg126] stopEgress (HLS) failed (continuing):", (e as Error).message);
      }

      await admin
        .from("stream_recordings")
        .update({ status: "stopping", ended_at: new Date().toISOString() })
        .eq("id", recRow.id);

      if (recRow.stream_id) {
        await admin
          .from("live_streams")
          .update({ hls_status: "stopping" })
          .eq("id", recRow.stream_id);
      }

      return json(200, { ok: true });
    }

    return json(400, { error: "unknown_action" });
  } catch (e) {
    console.error("livekit-hls-egress error:", e);
    return json(500, { error: (e as Error).message ?? "internal_error" });
  }
});
