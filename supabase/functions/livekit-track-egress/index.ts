// Pkg113: LiveKit Track Egress — admin-only per-participant track recording.
//
// Used for moderation evidence (single participant's audio or video track,
// distinct from Pkg111 RoomCompositeEgress which mixes everyone).
//
// Auth: x-admin-access-token header (validated via validate-admin-token edge fn).
// Body: { action: 'start', roomName, identity, trackSid, kind?, streamId?, reason? }
//       { action: 'stop',  egressId }
//
// Env: LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET,
//      LIVEKIT_EGRESS_S3_BUCKET / _REGION / _ACCESS_KEY / _SECRET,
//      optional LIVEKIT_EGRESS_S3_ENDPOINT, LIVEKIT_EGRESS_S3_PUBLIC_BASE.
//
// Kill-switch: app_settings.livekit_signaling_enabled.track_egress === true
import { createClient } from "npm:@supabase/supabase-js@2";
import { EgressClient } from "npm:livekit-server-sdk@2.9.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-access-token",
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

async function validateAdminToken(
  token: string,
): Promise<{ ok: boolean; role?: "owner" | "sub_admin" }> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/validate-admin-token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ token, action: "validate" }),
      },
    );
    if (!res.ok) return { ok: false };
    const data = await res.json().catch(() => ({}));
    return data?.valid ? { ok: true, role: data.role } : { ok: false };
  } catch (e) {
    console.warn("[Pkg113] admin validate failed:", e);
    return { ok: false };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    return json(500, { error: "livekit_not_configured" });
  }

  // ---- Admin auth ----
  const adminToken = req.headers.get("x-admin-access-token") ?? "";
  if (!adminToken) return json(401, { error: "missing_admin_token" });
  const v = await validateAdminToken(adminToken);
  if (!v.ok) return json(401, { error: "invalid_admin_token" });
  const role = v.role ?? "sub_admin";

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Kill-switch
  const { data: setting } = await admin
    .from("app_settings")
    .select("setting_value")
    .eq("setting_key", "livekit_signaling_enabled")
    .maybeSingle();
  let enabled = false;
  try {
    const obj = setting?.setting_value ? JSON.parse(setting.setting_value) : {};
    enabled = obj?.track_egress === true;
  } catch { enabled = false; }
  if (!enabled) return json(403, { error: "track_egress_disabled" });

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? "");

  try {
    if (action === "start") {
      if (!s3Configured()) return json(500, { error: "egress_s3_not_configured" });

      const roomName = String(body?.roomName ?? "").trim();
      const identity = String(body?.identity ?? "").trim();
      const trackSid = String(body?.trackSid ?? "").trim();
      const kind = body?.kind ? String(body.kind).toLowerCase() : null; // 'audio' | 'video'
      const streamId = body?.streamId ? String(body.streamId) : null;
      const reason = body?.reason ? String(body.reason).slice(0, 500) : null;

      if (!roomName) return json(400, { error: "roomName_required" });
      if (!identity) return json(400, { error: "identity_required" });
      if (!trackSid) return json(400, { error: "trackSid_required" });

      const ext = kind === "audio" ? "ogg" : "mp4";
      const filename = `track-recordings/${roomName}/${identity}/${Date.now()}_${trackSid}.${ext}`;

      const egressClient = new EgressClient(httpUrl, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

      const fileOutput: Record<string, unknown> = {
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
        info = await egressClient.startTrackEgress(
          roomName,
          fileOutput as never,
          trackSid,
        );
      } catch (e) {
        const msg = (e as Error).message ?? "track_egress_start_failed";
        console.error("[Pkg113] startTrackEgress failed:", msg);
        return json(502, { error: "track_egress_start_failed", detail: msg });
      }

      const publicUrl = S3_PUBLIC_BASE ? `${S3_PUBLIC_BASE}/${filename}` : null;

      const { data: recRow } = await admin
        .from("track_recordings")
        .insert({
          stream_id: streamId,
          room_name: roomName,
          participant_identity: identity,
          track_sid: trackSid,
          track_kind: kind,
          egress_id: info.egressId,
          output_type: "s3",
          file_url: publicUrl,
          status: "starting",
          reason,
          initiated_by_role: role,
        })
        .select("id")
        .single();

      return json(200, {
        egressId: info.egressId,
        recordingId: recRow?.id ?? null,
        fileUrl: publicUrl,
      });
    }

    if (action === "stop") {
      const egressId = String(body?.egressId ?? "").trim();
      if (!egressId) return json(400, { error: "egressId_required" });

      try {
        const egressClient = new EgressClient(httpUrl, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
        await egressClient.stopEgress(egressId);
      } catch (e) {
        console.warn("[Pkg113] stopEgress failed (continuing):", (e as Error).message);
      }

      await admin
        .from("track_recordings")
        .update({ status: "stopping", ended_at: new Date().toISOString() })
        .eq("egress_id", egressId);

      return json(200, { ok: true });
    }

    return json(400, { error: "unknown_action" });
  } catch (e) {
    console.error("[Pkg113] error:", e);
    return json(500, { error: (e as Error).message ?? "internal_error" });
  }
});
