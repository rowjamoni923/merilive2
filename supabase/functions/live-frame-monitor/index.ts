/**
 * live-frame-monitor
 *
 * Periodic frame health-check for live streams / party rooms / video calls.
 * Caller (client or scheduled worker) POSTs a single JPEG/PNG frame
 * (base64) along with the room/host context. We forward it to the external
 * verification provider's /monitor-frame endpoint and:
 *   • Optionally re-verify identity (the broadcasting face must match the
 *     verified user's indexed face — protects against handoff to a stranger).
 *   • Log every non-OK frame to `live_frame_alerts` (admin dashboards
 *     subscribe via Realtime postgres_changes — replaces the previous
 *     unreliable broadcast.send pattern).
 *   • Track per-stream strikes; on 3+ critical frames inside 5 minutes,
 *     respond with `action:"end_stream"` so the host client tears the
 *     stream down. Identity mismatch triggers an immediate end.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getProviderConfig,
  providerMonitorFrame,
  providerSearchFace,
  type MonitorFrameResult,
} from "../_shared/externalVerify.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface Body {
  userId: string;
  imageBase64: string;
  context?: "live_stream" | "party_room" | "call";
  roomId?: string | null;
  streamId?: string | null;
}

const STRIKE_WINDOW_MIN = 5;
const STRIKE_LIMIT = 3;
const IDENTITY_THRESHOLD = 85; // similarity %

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
    // Pkg321: require caller authentication — prevents anonymous frame spam
    // and ensures userId in body matches the authenticated user.
    const authHeader = req.headers.get("Authorization") || "";
    let callerUserId: string | null = null;
    if (authHeader.toLowerCase().startsWith("bearer ")) {
      const sbUrl = Deno.env.get("SUPABASE_URL")!;
      const sbAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
      const userClient = createClient(sbUrl, sbAnon, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: u, error: ue } = await userClient.auth.getUser();
      if (!ue && u?.user?.id) callerUserId = u.user.id;
    }
    if (!callerUserId) {
      return new Response(JSON.stringify({ error: "authentication required" }), {
      });
    }

    const body = (await req.json()) as Body;
    if (!body?.userId || !body?.imageBase64) {
      return new Response(JSON.stringify({ error: "userId and imageBase64 required" }), {
      });
    }
    if (body.userId !== callerUserId) {
      return new Response(JSON.stringify({ error: "userId mismatch" }), {
      });
    }

    const videoCfg = getProviderConfig("VERIFY_VIDEO_API_KEY");
    if (!videoCfg) {
      return new Response(
        JSON.stringify({ ok: false, skipped: "provider_not_configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const result = (await providerMonitorFrame(videoCfg, {
      external_user_id: body.userId,
      image_base64: body.imageBase64,
    })) as MonitorFrameResult | null;

    if (!result) {
      return new Response(JSON.stringify({ ok: false, skipped: "provider_unreachable" }), {
      });
    }

    // ── Sightengine NSFW pass (F4 2026-06-09) ──────────────────────────
    // Industry-standard explicit-content detection. Runs in parallel with the
    // identity-monitor provider above. Best-effort: failures never break the
    // monitoring pipeline. Adds Sightengine scores into the response so the
    // 3-strike rule below can fire on Sightengine-only NSFW (e.g. when the
    // identity provider misses adult content).
    let sightengineScores: Record<string, number> | null = null;
    let sightengineAlerts: string[] = [];
    const seUser = Deno.env.get("SIGHTENGINE_API_USER");
    const seSecret = Deno.env.get("SIGHTENGINE_API_SECRET");
    if (seUser && seSecret) {
      try {
        const form = new FormData();
        const binStr = atob(body.imageBase64);
        const bytes = new Uint8Array(binStr.length);
        for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
        form.append("media", new Blob([bytes], { type: "image/jpeg" }), "frame.jpg");
        form.append("models", "nudity-2.1,weapon,recreational_drug,offensive-2.0,gore-2.0,violence");
        form.append("api_user", seUser);
        form.append("api_secret", seSecret);
        const seResp = await fetch("https://api.sightengine.com/1.0/check.json", {
          method: "POST",
          body: form,
        });
        const seData = await seResp.json();
        if (seData?.status === "success") {
          const nudity = seData.nudity || {};
          sightengineScores = {
            nudity_raw: Number(nudity.raw ?? 0),
            nudity_sexual_activity: Number(nudity.sexual_activity ?? 0),
            nudity_sexual_display: Number(nudity.sexual_display ?? 0),
            nudity_erotica: Number(nudity.erotica ?? 0),
            weapon: typeof seData.weapon === "number" ? seData.weapon : Number(seData.weapon?.classes ? Math.max(...Object.values(seData.weapon.classes as Record<string, number>)) : 0),
            drugs: Number(seData.recreational_drug?.prob ?? seData.drugs ?? 0),
            offensive: Number(seData.offensive?.prob ?? 0),
            gore: Number(seData.gore?.prob ?? 0),
            violence: Number(seData.violence?.prob ?? 0),
          };
          // Industry thresholds (Bigo/Holla parity)
          if (sightengineScores.nudity_raw >= 0.5 || sightengineScores.nudity_sexual_activity >= 0.5 || sightengineScores.nudity_sexual_display >= 0.5)
            sightengineAlerts.push("moderation:nudity");
          if (sightengineScores.nudity_erotica >= 0.7) sightengineAlerts.push("moderation:erotica");
          if (sightengineScores.weapon >= 0.6) sightengineAlerts.push("moderation:weapon");
          if (sightengineScores.drugs >= 0.7) sightengineAlerts.push("moderation:drugs");
          if (sightengineScores.gore >= 0.6) sightengineAlerts.push("moderation:gore");
          if (sightengineScores.violence >= 0.75) sightengineAlerts.push("moderation:violence");
          if (sightengineScores.offensive >= 0.7) sightengineAlerts.push("moderation:offensive");
        }
      } catch (e) {
        console.warn("[live-frame-monitor] sightengine skipped:", e instanceof Error ? e.message : e);
      }
    }

    // ── Identity check (best-effort) ───────────────────────────────────
    // If a face is present, confirm it matches the verified user. If the
    // top match belongs to someone else, treat as identity_mismatch.
    let identityMatch: boolean | null = null;
    if (result.face_present && result.face_count === 1) {
      const faceCfg = getProviderConfig("VERIFY_FACE_API_KEY");
      if (faceCfg) {
        try {
          const search = await providerSearchFace(faceCfg, {
            threshold: IDENTITY_THRESHOLD,
            max_matches: 3,
          });
          if (search && search.status === "matches_found" && search.matches.length > 0) {
            identityMatch = search.matches.some(
              (m) => m.external_user_id === body.userId,
            );
          }
        } catch (_e) {
          // best-effort
        }
      }
    }

    // Merge alerts from both providers; dedup.
    const alerts = Array.from(new Set([
      ...(result.alerts || []),
      ...sightengineAlerts,
    ]));
    if (identityMatch === false) alerts.push("identity_mismatch");

    // ── Classify severity ──────────────────────────────────────────────
    const criticalAlerts = alerts.filter((a) =>
      a === "face_lost" ||
      a === "multiple_faces" ||
      a === "sleeping" ||
      a === "identity_mismatch" ||
      a.startsWith("moderation:")
    );
    const minorAlerts = alerts.filter((a) => !criticalAlerts.includes(a));
    const severity: "ok" | "warning" | "critical" =
      criticalAlerts.length > 0 ? "critical" : minorAlerts.length > 0 ? "warning" : "ok";

    let strikes = 0;
    let action: "end_stream" | null = null;

    // ── Logging + strike tracking ──────────────────────────────────────
    if (severity !== "ok") {
      const sb = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );

      // Insert alert row — admin dashboards subscribed via Realtime
      // postgres_changes get an instant push. Best-effort; missing table /
      // perms never break the live moderation pipeline.
      try {
        // F4 2026-06-09: take the worse of provider + Sightengine for each
        // numeric signal so admin dashboards reflect the actual peak risk.
        const nsfwScore = Math.max(
          Number(result.nsfw_score ?? 0),
          Number(sightengineScores?.nudity_raw ?? 0),
          Number(sightengineScores?.nudity_sexual_activity ?? 0),
          Number(sightengineScores?.nudity_sexual_display ?? 0),
        );
        const violenceScore = Math.max(
          Number(result.violence_score ?? 0),
          Number(sightengineScores?.violence ?? 0),
          Number(sightengineScores?.gore ?? 0),
        );
        const weaponsDetected = Boolean(result.weapons_detected) || Number(sightengineScores?.weapon ?? 0) >= 0.6;
        const drugsDetected = Boolean(result.drugs_detected) || Number(sightengineScores?.drugs ?? 0) >= 0.7;
        await sb.from("live_frame_alerts").insert({
          user_id: body.userId,
          context: body.context ?? "live_stream",
          room_id: body.roomId ?? null,
          stream_id: body.streamId ?? null,
          severity,
          alerts,
          face_present: result.face_present,
          face_count: result.face_count,
          nsfw_score: nsfwScore || null,
          violence_score: violenceScore || null,
          weapons_detected: weaponsDetected,
          drugs_detected: drugsDetected,
        });
      } catch (e) {
        console.warn("[live-frame-monitor] log insert failed:", e);
      }

      // 3-strike rule: count critical alerts in the last 5 min for this
      // user+stream. Identity mismatch is a single-strike kill.
      if (severity === "critical") {
        if (alerts.includes("identity_mismatch")) {
          action = "end_stream";
        } else {
          try {
            const since = new Date(Date.now() - STRIKE_WINDOW_MIN * 60_000).toISOString();
            let q = sb
              .from("live_frame_alerts")
              .select("id", { count: "exact", head: true })
              .eq("user_id", body.userId)
              .eq("severity", "critical")
              .gte("created_at", since);
            if (body.streamId) q = q.eq("stream_id", body.streamId);
            else if (body.roomId) q = q.eq("room_id", body.roomId);
            const { count } = await q;
            strikes = count ?? 0;
            if (strikes >= STRIKE_LIMIT) action = "end_stream";
          } catch (e) {
            console.warn("[live-frame-monitor] strike count failed:", e);
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        severity,
        action,
        strikes,
        result: { ...result, alerts, identity_match: identityMatch, sightengine: sightengineScores },
      }),
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
