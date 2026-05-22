// Pkg111: LiveKit Egress — start/stop room composite recording for a live stream.
// Auth: Supabase JWT. Host-only: caller must own the live_streams row.
// Body: { action: 'start', streamId, layout?, audioOnly? }
//       { action: 'stop', egressId }
// Returns start: { egressId, recordingId }
//
// Requires LiveKit Cloud Egress + S3 bucket. Env:
//   LIVEKIT_EGRESS_S3_BUCKET
//   LIVEKIT_EGRESS_S3_REGION
//   LIVEKIT_EGRESS_S3_ACCESS_KEY
//   LIVEKIT_EGRESS_S3_SECRET
//   LIVEKIT_EGRESS_S3_ENDPOINT     (optional — e.g. for Cloudflare R2 / MinIO)
//   LIVEKIT_EGRESS_S3_PUBLIC_BASE  (optional — public CDN prefix; if set, recording_url
//                                    is computed as `${base}/${filename}`)
// Kill-switch: app_settings.livekit_signaling_enabled.egress === true
import { createClient } from "npm:@supabase/supabase-js@2";
import { EgressClient, EncodedFileType } from "npm:livekit-server-sdk@2.9.4";

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

// Pkg151: layout whitelist mirrors livekit-egress-ops (Pkg136).
const ALLOWED_LAYOUTS = new Set([
  "speaker", "speaker-dark", "speaker-light",
  "grid", "grid-dark", "grid-light",
  "single-speaker", "single-speaker-dark", "single-speaker-light",
]);
function sanitizeLayout(v: unknown): string {
  return typeof v === "string" && ALLOWED_LAYOUTS.has(v) ? v : "speaker";
}

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
    let egressEnabled = false;
    try {
      const v = setting?.setting_value ? JSON.parse(setting.setting_value) : {};
      egressEnabled = v?.egress === true;
    } catch { egressEnabled = false; }
    if (!egressEnabled) return json(200, { success: false, skipped: true, reason: "egress_disabled" });

    const body = await req.json().catch(() => ({}));
    const action = body?.action as string | undefined;

    if (action === "start") {
      if (!s3Configured()) return json(500, { error: "egress_s3_not_configured" });

      const { streamId, layout, audioOnly } = body as {
        streamId?: string; layout?: string; audioOnly?: boolean;
      };
      if (!streamId) return json(400, { error: "streamId_required" });

      const { data: stream, error: streamErr } = await admin
        .from("live_streams")
        .select("id, host_id, room_name, is_active, egress_id")
        .eq("id", streamId)
        .maybeSingle();
      if (streamErr || !stream) return json(404, { error: "stream_not_found" });
      if (stream.host_id !== userId) return json(403, { error: "not_stream_host" });
      if (!stream.is_active) return json(409, { error: "stream_not_active" });
      if (stream.egress_id) {
        return json(200, { egressId: stream.egress_id, alreadyRecording: true });
      }

      const roomName = stream.room_name ?? `live_${streamId}`;
      const filename = `recordings/${stream.host_id}/${streamId}/${Date.now()}.mp4`;

      const egress = new EgressClient(httpUrl, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

      const fileOutput: Record<string, unknown> = {
        fileType: EncodedFileType.MP4,
        filepath: filename,
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
        // RoomCompositeEgress mixes all participants into a single MP4.
        info = await egress.startRoomCompositeEgress(
          roomName,
          { file: fileOutput as never },
          {
            layout: sanitizeLayout(layout),
            audioOnly: !!audioOnly,
          },
        );
      } catch (e) {
        const msg = (e as Error).message ?? "egress_start_failed";
        console.error("[Pkg111] startRoomCompositeEgress failed:", msg);
        return json(502, { error: "egress_start_failed", detail: msg });
      }

      const publicUrl = S3_PUBLIC_BASE ? `${S3_PUBLIC_BASE}/${filename}` : null;

      const { data: recRow } = await admin
        .from("stream_recordings")
        .insert({
          stream_id: streamId,
          host_id: userId,
          room_name: roomName,
          egress_id: info.egressId,
          output_type: "s3",
          file_url: publicUrl,
          status: "starting",
        })
        .select("id")
        .single();

      await admin
        .from("live_streams")
        .update({
          egress_id: info.egressId,
          recording_url: publicUrl,
          recording_status: "starting",
        })
        .eq("id", streamId);

      return json(200, {
        egressId: info.egressId,
        recordingId: recRow?.id ?? null,
        fileUrl: publicUrl,
      });
    }

    if (action === "stop") {
      const { egressId } = body as { egressId?: string };
      if (!egressId) return json(400, { error: "egressId_required" });

      // Verify host owns this recording
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
        console.warn("[Pkg111] stopEgress failed (continuing):", (e as Error).message);
      }

      await admin
        .from("stream_recordings")
        .update({ status: "stopping", ended_at: new Date().toISOString() })
        .eq("id", recRow.id);

      if (recRow.stream_id) {
        await admin
          .from("live_streams")
          .update({ recording_status: "stopping" })
          .eq("id", recRow.stream_id);
      }

      return json(200, { ok: true });
    }

    return json(400, { error: "unknown_action" });
  } catch (e) {
    console.error("livekit-egress error:", e);
    return json(500, { error: (e as Error).message ?? "internal_error" });
  }
});
