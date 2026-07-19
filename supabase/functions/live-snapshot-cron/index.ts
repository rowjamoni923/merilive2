// Pkg501-D7p2: Live thumbnail snapshot cron.
//
// Every 30s pg_cron POSTs here with header `x-cron-secret: $CRON_SECRET`.
// We reconcile LiveKit image-output egress per active live stream:
//   • Active stream + no snapshot_egress_id  → start RoomComposite image egress
//     (captureInterval=15, overwrite-by-key) and store egress_id + thumbnail_url
//   • Stream no longer active + has snapshot_egress_id → stop egress and clear
//   • Active stream + has snapshot_egress_id → bump cache-buster on thumbnail_url
//     so Realtime subscribers fetch the freshly overwritten JPEG.
//
// Reuses LIVEKIT_* + R2_* secrets (already present). Zero polling on the
// client — Realtime delivers thumbnail_url updates as they happen.

import { createClient } from "npm:@supabase/supabase-js@2";
import { EgressClient, ImageFileSuffix } from "npm:livekit-server-sdk@2.9.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LIVEKIT_URL = Deno.env.get("LIVEKIT_URL") ?? "";
const LIVEKIT_API_KEY = Deno.env.get("LIVEKIT_API_KEY") ?? "";
const LIVEKIT_API_SECRET = Deno.env.get("LIVEKIT_API_SECRET") ?? "";

const R2_ACCOUNT_ID = Deno.env.get("R2_ACCOUNT_ID") ?? "";
const S3_BUCKET = Deno.env.get("LIVEKIT_EGRESS_S3_BUCKET") ?? Deno.env.get("R2_BUCKET_NAME") ?? "";
const S3_REGION = Deno.env.get("LIVEKIT_EGRESS_S3_REGION") ?? "auto";
const S3_ACCESS_KEY = Deno.env.get("LIVEKIT_EGRESS_S3_ACCESS_KEY") ?? Deno.env.get("R2_ACCESS_KEY_ID") ?? "";
const S3_SECRET = Deno.env.get("LIVEKIT_EGRESS_S3_SECRET") ?? Deno.env.get("R2_SECRET_ACCESS_KEY") ?? "";
const S3_ENDPOINT = Deno.env.get("LIVEKIT_EGRESS_S3_ENDPOINT") ??
  (R2_ACCOUNT_ID ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : "");
const S3_PUBLIC_BASE = (Deno.env.get("LIVEKIT_EGRESS_S3_PUBLIC_BASE") ?? Deno.env.get("R2_PUBLIC_URL") ?? "").replace(/\/+$/, "");

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

const httpUrl = LIVEKIT_URL.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function thumbKey(streamId: string) {
  return `live-thumbnails/${streamId}.jpg`;
}
function thumbPublicUrl(streamId: string) {
  const base = S3_PUBLIC_BASE || (R2_ACCOUNT_ID ? `https://pub-${R2_ACCOUNT_ID}.r2.dev/${S3_BUCKET}` : `${S3_ENDPOINT}/${S3_BUCKET}`);
  return `${base.replace(/\/+$/, "")}/${thumbKey(streamId)}`;
}

async function startSnapshotEgress(roomName: string, streamId: string): Promise<string | null> {
  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !httpUrl) return null;
  if (!S3_BUCKET || !S3_ACCESS_KEY || !S3_SECRET) return null;

  const egress = new EgressClient(httpUrl, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
  try {
    const info = await egress.startRoomCompositeEgress(
      roomName,
      {
        imageOutputs: [{
          captureInterval: 15,
          width: 720,
          height: 1280,
          filenamePrefix: `live-thumbnails/${streamId}`,
          // Same key every tick — newest JPEG overwrites the previous.
          imageSuffix: ImageFileSuffix.IMAGE_SUFFIX_NONE_OVERWRITE,
          disableManifest: true,
          s3: {
            accessKey: S3_ACCESS_KEY,
            secret: S3_SECRET,
            region: S3_REGION,
            bucket: S3_BUCKET,
            endpoint: S3_ENDPOINT || undefined,
            forcePathStyle: !!S3_ENDPOINT,
          },
        }],
      } as any,
      { layout: "speaker", audioOnly: false },
    );
    return info.egressId ?? null;
  } catch (e) {
    console.error("[live-snapshot-cron] start egress failed", roomName, (e as Error)?.message);
    return null;
  }
}

async function stopSnapshotEgress(egressId: string): Promise<void> {
  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !httpUrl) return;
  const egress = new EgressClient(httpUrl, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
  try { await egress.stopEgress(egressId); }
  catch (e) { console.warn("[live-snapshot-cron] stop egress threw", egressId, (e as Error)?.message); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Cron auth
  const provided = req.headers.get("x-cron-secret") ?? "";
  if (!CRON_SECRET || provided !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const started: string[] = [];
  const stopped: string[] = [];
  const refreshed: string[] = [];

  try {
    // 1. Start egress for active streams missing one.
    const { data: needsStart } = await admin
      .from("live_streams")
      .select("id, room_name")
      .eq("is_active", true)
      .is("snapshot_egress_id", null)
      .not("room_name", "is", null)
      .limit(50);

    for (const row of needsStart ?? []) {
      const egressId = await startSnapshotEgress(row.room_name as string, row.id as string);
      if (egressId) {
        const url = `${thumbPublicUrl(row.id as string)}?v=${Date.now()}`;
        await admin.from("live_streams")
          .update({ snapshot_egress_id: egressId, thumbnail_url: url })
          .eq("id", row.id);
        started.push(row.id as string);
      }
    }

    // 2. Stop egress for inactive streams that still hold one.
    const { data: needsStop } = await admin
      .from("live_streams")
      .select("id, snapshot_egress_id")
      .eq("is_active", false)
      .not("snapshot_egress_id", "is", null)
      .limit(50);

    for (const row of needsStop ?? []) {
      await stopSnapshotEgress(row.snapshot_egress_id as string);
      await admin.from("live_streams")
        .update({ snapshot_egress_id: null })
        .eq("id", row.id);
      stopped.push(row.id as string);
    }

    // 3. Bump cache-buster for active streams already producing snapshots.
    const { data: active } = await admin
      .from("live_streams")
      .select("id")
      .eq("is_active", true)
      .not("snapshot_egress_id", "is", null)
      .limit(200);

    const now = Date.now();
    for (const row of active ?? []) {
      const url = `${thumbPublicUrl(row.id as string)}?v=${now}`;
      await admin.from("live_streams").update({ thumbnail_url: url }).eq("id", row.id);
      refreshed.push(row.id as string);
    }

    return new Response(JSON.stringify({
      ok: true,
      started: started.length,
      stopped: stopped.length,
      refreshed: refreshed.length,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[live-snapshot-cron] fatal", (e as Error)?.message);
    return new Response(JSON.stringify({ error: (e as Error)?.message ?? "error" }), {
    });
  }
});
