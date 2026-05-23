/**
 * live-frame-monitor
 *
 * Periodic frame health-check for live streams / party rooms / video calls.
 * Caller (client or scheduled worker) POSTs a single JPEG/PNG frame
 * (base64) along with the room/host context. We forward it to the external
 * verification provider's /monitor-frame endpoint and:
 *   • alert admins when the host is absent / sleeping / multiple faces /
 *     looking away / NSFW or violence content / weapons / drugs.
 *   • log every alert to `live_frame_alerts` (best-effort; table is optional).
 *
 * Auto-action is intentionally limited to alerting + logging. Bans / kicks
 * remain a manual admin decision (matching app convention).
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  getProviderConfig,
  providerMonitorFrame,
  type MonitorFrameResult,
} from "../_shared/externalVerify.ts";

interface Body {
  userId: string;
  imageBase64: string;
  context?: "live_stream" | "party_room" | "call";
  roomId?: string | null;
  streamId?: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = (await req.json()) as Body;
    if (!body?.userId || !body?.imageBase64) {
      return new Response(JSON.stringify({ error: "userId and imageBase64 required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cfg = getProviderConfig("VERIFY_VIDEO_API_KEY");
    if (!cfg) {
      return new Response(
        JSON.stringify({ ok: false, skipped: "provider_not_configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const result = (await providerMonitorFrame(cfg, {
      external_user_id: body.userId,
      image_base64: body.imageBase64,
    })) as MonitorFrameResult | null;

    if (!result) {
      return new Response(JSON.stringify({ ok: false, skipped: "provider_unreachable" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Classify alert severity locally so the client/admin gets a single signal.
    const critical = (result.alerts || []).filter((a) =>
      a === "face_lost" ||
      a === "multiple_faces" ||
      a === "sleeping" ||
      a.startsWith("moderation:")
    );
    const minor = (result.alerts || []).filter((a) => !critical.includes(a));
    const severity: "ok" | "warning" | "critical" =
      critical.length > 0 ? "critical" : minor.length > 0 ? "warning" : "ok";

    // Best-effort logging + broadcast to admins
    if (severity !== "ok") {
      try {
        const sb = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );

        // Insert into table if it exists; ignore failures so a missing table
        // never breaks the live moderation pipeline.
        await sb
          .from("live_frame_alerts")
          .insert({
            user_id: body.userId,
            context: body.context ?? "live_stream",
            room_id: body.roomId ?? null,
            stream_id: body.streamId ?? null,
            severity,
            alerts: result.alerts,
            face_present: result.face_present,
            face_count: result.face_count,
            nsfw_score: result.nsfw_score ?? null,
            violence_score: result.violence_score ?? null,
            weapons_detected: result.weapons_detected ?? false,
            drugs_detected: result.drugs_detected ?? false,
          })
          .then(() => undefined, (e: unknown) =>
            console.warn("[live-frame-monitor] log insert failed:", e),
          );

        // Broadcast to admin dashboard
        const ch = sb.channel("admin-alerts");
        await ch.send({
          type: "broadcast",
          event: "live_frame_alert",
          payload: {
            userId: body.userId,
            context: body.context ?? "live_stream",
            roomId: body.roomId ?? null,
            streamId: body.streamId ?? null,
            severity,
            alerts: result.alerts,
            face_present: result.face_present,
            face_count: result.face_count,
            nsfw_score: result.nsfw_score ?? 0,
            violence_score: result.violence_score ?? 0,
            weapons_detected: !!result.weapons_detected,
            drugs_detected: !!result.drugs_detected,
            timestamp: new Date().toISOString(),
          },
        });
      } catch (e) {
        console.warn("[live-frame-monitor] alert side-effects failed:", e);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, severity, result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[live-frame-monitor] error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
