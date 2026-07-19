// Random Call — enqueue / instant-match
// - Pre-authorizes diamonds (2 min hold @ host max rate)
// - Inserts caller into random_call_queue
// - Attempts atomic claim_match
// - If matched: creates session, broadcasts incoming_call to host

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { dispatchHighPriorityData } from "../_shared/fcm-push.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Auth
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: uerr } = await supabase.auth.getUser(token);
    if (uerr || !userData?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const mode: string = body.mode === "broadcast" ? "broadcast" : "queue";
    const preferredCountry: string | null = body.preferred_country ?? null;
    const preferredLangs: string[] = Array.isArray(body.preferred_langs) ? body.preferred_langs : [];
    const preferredHostGender: string | null =
      body.preferred_host_gender && ["male", "female", "any"].includes(body.preferred_host_gender)
        ? body.preferred_host_gender
        : null;
    const deviceId: string = (typeof body.device_id === "string" && body.device_id) || "unknown";

    // Multi-device: reconnect if a still-open session exists for this user
    const { data: rec } = await supabase.rpc("find_reconnectable_random_call", { p_user_id: userId });
    if ((rec as any)?.found) {
      const r: any = rec;
      const { data: reJoin } = await supabase.rpc("reconnect_random_call", {
        p_session_id: r.session_id, p_user_id: userId, p_device_id: deviceId,
      });
      if ((reJoin as any)?.ok) {
        return new Response(JSON.stringify({ status: "reconnected", ...(reJoin as any) }), {
        });
      }
    }

    // Multi-device: cancel any waiting queue rows from a different device
    await supabase.rpc("supersede_random_enqueue", { p_user_id: userId, p_new_device_id: deviceId });


    // Load settings (random-call feature config)
    const { data: settings } = await supabase
      .from("random_call_settings")
      .select("*")
      .eq("id", 1)
      .single();

    if (!settings || !settings.is_enabled) {
      return new Response(JSON.stringify({ error: "feature_disabled" }), {
      });
    }

    // Ring-timeout is governed globally by `app_settings.call_ring_timeout_seconds`
    // (single admin source — same value used by private calls / call-deliver).
    // Falls back to random_call_settings.ring_timeout_seconds only if the
    // master row is unset, so legacy admin pages keep working.
    let masterRingTimeoutSec: number | null = null;
    try {
      const { data: ringRow } = await supabase
        .from("app_settings")
        .select("setting_value")
        .eq("setting_key", "call_ring_timeout_seconds")
        .maybeSingle();
      const raw = (ringRow as any)?.setting_value;
      const n = typeof raw === "number" ? raw : parseInt(String(raw ?? ""), 10);
      if (Number.isFinite(n) && n >= 5 && n <= 120) masterRingTimeoutSec = n;
    } catch (e) {
      console.warn("[random-call-enqueue] master ring timeout read failed", e);
    }
    if (masterRingTimeoutSec != null) {
      (settings as any).ring_timeout_seconds = masterRingTimeoutSec;
    }

    // Profile lookup (gender, VIP, balance). Use only core wallet columns:
    // optional level / is_vip fields can drift between deployments, and selecting them makes
    // Supabase return null data, which falsely blocks paid calls as balance 0.
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("id, gender, diamonds, diamonds, vip_tier, current_vip_tier_id, username")
      .eq("id", userId)
      .single();

    if (profileErr || !profile) {
      console.error("[random-call-enqueue] profile lookup failed", profileErr);
      return new Response(JSON.stringify({ error: "profile_not_found" }), {
      });
    }

    const callerRateForHold = settings.host_max_rate_diamonds_per_min;
    const holdAmount = callerRateForHold * settings.preauth_minutes_hold;
    const callerBalance = Math.max(Number(profile.diamonds ?? 0), Number(profile.diamonds ?? 0));
    const callerIsVip = Number(profile.vip_tier ?? 0) > 0 || !!profile.current_vip_tier_id;
    const callerLevel = 1;

    if (callerBalance < holdAmount) {
      return new Response(
        JSON.stringify({ error: "insufficient_diamonds", required: holdAmount, balance: callerBalance }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Anti-abuse: skip cooldown / daily cap check
    const { data: cd } = await supabase.rpc("check_random_skip_cooldown", { p_user_id: userId });
    const cdObj: any = cd ?? {};
    if (cdObj.on_cooldown) {
      return new Response(
        JSON.stringify({
          error: "skip_cooldown",
          cooldown_seconds_remaining: cdObj.cooldown_seconds_remaining,
          cooldown_until: cdObj.cooldown_until,
          reason: cdObj.cooldown_reason,
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (cdObj.daily_exhausted) {
      return new Response(
        JSON.stringify({
          daily_used: cdObj.daily_used,
          daily_limit: cdObj.daily_limit,
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ===================================================
    // BROADCAST MODE (Chamet-style fan-out)
    // ===================================================
    if (mode === "broadcast") {
      const livekitRoom = `match-${crypto.randomUUID()}`;
      const freeTrial = settings.free_trial_seconds + (callerIsVip ? settings.vip_free_trial_bonus_seconds : 0);
      const ringTimeout = settings.ring_timeout_seconds ?? 20;
      const expiresAt = new Date(Date.now() + ringTimeout * 1000).toISOString();

      const { data: bc, error: bcerr } = await supabase
        .from("random_call_broadcasts")
        .insert({
          caller_id: userId,
          caller_device_id: deviceId,
          livekit_room: livekitRoom,
          hold_amount: holdAmount,
          free_trial_seconds: freeTrial,
          min_billable_seconds: settings.min_billable_seconds,
          host_split_pct: settings.host_split_pct,
          default_host_rate: settings.default_host_rate_diamonds_per_min,
          expires_at: expiresAt,
        })
        .select("*")
        .single();

      if (bcerr || !bc) {
        return new Response(JSON.stringify({ error: "broadcast_insert_failed", detail: bcerr?.message }), {
        });
      }

      // Get every eligible online verified host across all countries
      const { data: hosts } = await supabase.rpc("get_online_global_hosts", {
        p_caller_id: userId, p_limit: 800,
      });
      const hostIds = ((hosts as any[]) ?? []).map((r) => r.host_id).filter(Boolean);

      // Fan-out ring to every host's personal channel (best-effort, parallel)
      await Promise.allSettled(
        hostIds.map(async (hid: string) => {
          const ch = supabase.channel(`user-${hid}`);
          await ch.send({
            type: "broadcast",
            event: "random_incoming_call",
            payload: {
              broadcast_id: bc.id,
              room: livekitRoom,
              ring_timeout_seconds: ringTimeout,
            },
          });
        }),
      );

      // Dual-path: high-priority FCM data push to backgrounded hosts.
      // Realtime broadcast above only reaches foreground/attached clients;
      // without this, ~20% of online hosts (background app) never see the ring.
      let fcmSent = 0;
      try {
        if (hostIds.length > 0) {
          const { data: tokens } = await supabase
            .from("device_tokens")
            .select("token, platform, user_id")
            .in("user_id", hostIds)
            .eq("is_active", true);
          const tokenList = (tokens ?? []).map((t: any) => ({ token: t.token, platform: t.platform }));
          if (tokenList.length > 0) {
            const callerName = (profile as any)?.username ?? "Someone";
            const results = await dispatchHighPriorityData(
              tokenList,
              {
                caller_name: String(callerName),
              },
              ringTimeout,
            );
            fcmSent = results.filter((r) => r.success).length;
            const invalidTokens = results.filter((r) => r.invalid).map((r) => r.token);
            if (invalidTokens.length > 0) {
              await supabase.from("device_tokens").update({ is_active: false }).in("token", invalidTokens);
            }
          }
        }
      } catch (e) {
        console.error("[random-call-enqueue] fcm fanout failed", e);
      }

      return new Response(
        JSON.stringify({
          fanout: hostIds.length,
          fcm_sent: fcmSent,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ===================================================
    // LEGACY QUEUE MODE (single claim_match)
    // ===================================================
    // Insert queue row
    const expiresAt = new Date(Date.now() + settings.match_timeout_seconds * 1000).toISOString();
    const score = Math.max(callerLevel, 1) * (callerIsVip ? settings.vip_match_priority_multiplier : 1);

    const { data: qrow, error: qerr } = await supabase
      .from("random_call_queue")
      .insert({
        user_id: userId,
        role: "caller",
        gender: profile?.gender ?? null,
        preferred_langs: preferredLangs,
        preferred_country: preferredCountry,
        preferred_host_gender: preferredHostGender,
        is_vip: callerIsVip,
        score: Math.round(score),
        device_id: deviceId,
      })

      .select("*")
      .single();

    if (qerr || !qrow) {
      return new Response(JSON.stringify({ error: "queue_insert_failed", detail: qerr?.message }), {
      });
    }

    // Attempt atomic claim
    const { data: hostUserId } = await supabase.rpc("claim_match", { p_caller_queue_id: qrow.id });

    if (!hostUserId) {
      return new Response(
        JSON.stringify({ status: "queued", queue_id: qrow.id, expires_at: expiresAt }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fetch host's rate
    const { data: hpref } = await supabase
      .from("host_match_preferences")
      .select("diamond_rate_per_min")
      .eq("host_id", hostUserId)
      .maybeSingle();

    const hostRate = hpref?.diamond_rate_per_min ?? settings.default_host_rate_diamonds_per_min;

    const livekitRoom = `match-${crypto.randomUUID()}`;
    const freeTrial = settings.free_trial_seconds + (callerIsVip ? settings.vip_free_trial_bonus_seconds : 0);

    const { data: session, error: serr } = await supabase
      .from("random_call_sessions")
      .insert({
        host_id: hostUserId,
        diamond_rate_per_min: hostRate,
      })
      .select("*")
      .single();

    if (serr || !session) {
      return new Response(JSON.stringify({ error: "session_insert_failed", detail: serr?.message }), {
      });
    }

    // Attach session_id to both queue rows
    await supabase.from("random_call_queue").update({ session_id: session.id }).in("id", [qrow.id]);

    // Broadcast to host (Supabase Realtime)
    try {
      const channel = supabase.channel(`user-${hostUserId}`);
      await channel.send({
      });
    } catch (_) { /* best-effort */ }

    return new Response(
      JSON.stringify({
        session_id: session.id,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: "internal_error", detail: String(e?.message ?? e) }), {
    });
  }
});
