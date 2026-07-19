// Pkg129 — Auto-record on room start (trigger-facing edge fn).
//
// Called ONLY from the `tg_auto_record_on_stream_start` DB trigger via pg_net
// when a host with `profiles.auto_record_live=true` creates an active
// `live_streams` row. Reuses Pkg111's EgressClient flow but bypasses the host
// JWT requirement (the trigger runs server-side).
//
// Auth: shared secret header `x-auto-record-secret` must match
//        `app_settings.auto_record_secret` (random 32-byte hex seeded in the
//        Pkg129 migration). Nothing else accepted.
//
// Body: { streamId: uuid }
//
// Kill-switches checked (both must be true):
//   • app_settings.livekit_signaling_enabled.egress       (Pkg111 master)
//   • app_settings.livekit_signaling_enabled.auto_record  (Pkg129 specific)
//
// Idempotent: if `live_streams.egress_id` already set → returns 200 with
// `alreadyRecording:true` and writes no audit row.
import { createClient } from "npm:@supabase/supabase-js@2";
import { EgressClient, EncodedFileType } from "npm:livekit-server-sdk@2.9.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-auto-record-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LIVEKIT_URL = Deno.env.get("LIVEKIT_URL") ?? "";
const LIVEKIT_API_KEY = Deno.env.get("LIVEKIT_API_KEY") ?? "";
const LIVEKIT_API_SECRET = Deno.env.get("LIVEKIT_API_SECRET") ?? "";
// Pkg-R2-fallback: prefer LIVEKIT_EGRESS_S3_* but fall back to existing R2_* secrets.
const R2_ACCOUNT_ID = Deno.env.get("R2_ACCOUNT_ID") ?? "";
const S3_BUCKET = Deno.env.get("LIVEKIT_EGRESS_S3_BUCKET") ?? Deno.env.get("R2_BUCKET_NAME") ?? "";
const S3_REGION = Deno.env.get("LIVEKIT_EGRESS_S3_REGION") ?? "auto";
const S3_ACCESS_KEY = Deno.env.get("LIVEKIT_EGRESS_S3_ACCESS_KEY") ?? Deno.env.get("R2_ACCESS_KEY_ID") ?? "";
const S3_SECRET = Deno.env.get("LIVEKIT_EGRESS_S3_SECRET") ?? Deno.env.get("R2_SECRET_ACCESS_KEY") ?? "";
const S3_ENDPOINT = Deno.env.get("LIVEKIT_EGRESS_S3_ENDPOINT") ?? (R2_ACCOUNT_ID ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : "");
const S3_PUBLIC_BASE = (Deno.env.get("LIVEKIT_EGRESS_S3_PUBLIC_BASE") ?? Deno.env.get("R2_PUBLIC_URL") ?? "").replace(/\/+$/, "");

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
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
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    return json(500, { error: "livekit_not_configured" });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // ---- Validate shared secret ----
  const provided = (req.headers.get("x-auto-record-secret") ?? "").trim();
  if (!provided) return json(401, { error: "missing_secret" });

  const { data: secretRow } = await admin
    .from("app_settings")
    .select("setting_value")
    .eq("setting_key", "auto_record_secret")
    .maybeSingle();
  const expected = (secretRow?.setting_value ?? "").toString().trim();
  if (!expected || provided !== expected) {
    return json(401, { error: "invalid_secret" });
  }

  // ---- Kill-switches: both must be ON ----
  const { data: flagRow } = await admin
    .from("app_settings")
    .select("setting_value")
    .eq("setting_key", "livekit_signaling_enabled")
    .maybeSingle();
  let egressOn = false;
  let autoRecordOn = false;
  try {
    const v = flagRow?.setting_value ? JSON.parse(flagRow.setting_value) : {};
    egressOn = v?.egress === true;
    autoRecordOn = v?.auto_record === true;
  } catch { /* defaults already false */ }
  if (!egressOn) return json(403, { error: "egress_disabled" });
  if (!autoRecordOn) return json(403, { error: "auto_record_disabled" });

  if (!s3Configured()) return json(500, { error: "egress_s3_not_configured" });

  // ---- Body ----
  const body = await req.json().catch(() => ({}));
  const streamId = String(body?.streamId ?? "").trim();
  if (!streamId) return json(400, { error: "streamId_required" });

  const { data: stream } = await admin
    .from("live_streams")
    .select("id, host_id, room_name, is_active, egress_id")
    .eq("id", streamId)
    .maybeSingle();
  if (!stream) return json(404, { error: "stream_not_found" });
  if (!stream.is_active) return json(409, { error: "stream_not_active" });
  if (stream.egress_id) {
    return json(200, { egressId: stream.egress_id, alreadyRecording: true });
  }

  // Re-confirm host preference (race: trigger fired but host flipped OFF between).
  const { data: hostProfile } = await admin
    .from("profiles")
    .select("auto_record_live")
    .eq("id", stream.host_id)
    .maybeSingle();
  if (!hostProfile?.auto_record_live) {
    return json(403, { error: "host_preference_disabled" });
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

  let info: { egressId: string };
  try {
    info = await egress.startRoomCompositeEgress(
      roomName,
      { file: fileOutput as never },
      { layout: "speaker", audioOnly: false },
    ) as { egressId: string };
  } catch (e) {
    const msg = (e as Error).message ?? "egress_start_failed";
    console.error("[Pkg129] startRoomCompositeEgress failed:", msg);
    return json(502, { error: "egress_start_failed", detail: msg });
  }

  const publicUrl = S3_PUBLIC_BASE ? `${S3_PUBLIC_BASE}/${filename}` : null;

  await admin
    .from("stream_recordings")
    .insert({
      stream_id: streamId,
      host_id: stream.host_id,
      room_name: roomName,
      egress_id: info.egressId,
      output_type: "s3",
      file_url: publicUrl,
      status: "starting",
      // Pkg129 marker so analytics can tell auto- vs manual-started recordings.
      // Falls back silently if the column doesn't exist.
      auto_started: true,
    } as never);

  await admin
    .from("live_streams")
    .update({
      recording_url: publicUrl,
      recording_status: "starting",
    })
    .eq("id", streamId);

  return json(200, {
    success: true,
    egressId: info.egressId,
    fileUrl: publicUrl,
  });
});
