// Random Call — enqueue / instant-match
// - Pre-authorizes coins (2 min hold @ host max rate)
// - Inserts caller into random_call_queue
// - Attempts atomic claim_match
// - If matched: creates session, broadcasts incoming_call to host

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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
    const preferredCountry: string | null = body.preferred_country ?? null;
    const preferredLangs: string[] = Array.isArray(body.preferred_langs) ? body.preferred_langs : [];

    // Load settings
    const { data: settings } = await supabase
      .from("random_call_settings")
      .select("*")
      .eq("id", 1)
      .single();

    if (!settings || !settings.is_enabled) {
      return new Response(JSON.stringify({ error: "feature_disabled" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Profile lookup (gender, vip, coins, level)
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, gender, coins, level, is_vip")
      .eq("id", userId)
      .single();

    const callerRateForHold = settings.host_max_rate_coins_per_min;
    const holdAmount = callerRateForHold * settings.preauth_minutes_hold;

    if ((profile?.coins ?? 0) < holdAmount) {
      return new Response(
        JSON.stringify({ error: "insufficient_coins", required: holdAmount, balance: profile?.coins ?? 0 }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Daily skip cap check (not enforced on enqueue, only on skip endpoint)

    // Insert queue row
    const expiresAt = new Date(Date.now() + settings.match_timeout_seconds * 1000).toISOString();
    const score = (profile?.level ?? 1) * (profile?.is_vip ? settings.vip_match_priority_multiplier : 1);

    const { data: qrow, error: qerr } = await supabase
      .from("random_call_queue")
      .insert({
        user_id: userId,
        role: "caller",
        gender: profile?.gender ?? null,
        preferred_langs: preferredLangs,
        preferred_country: preferredCountry,
        is_vip: !!profile?.is_vip,
        score: Math.round(score),
        hold_amount: holdAmount,
        expires_at: expiresAt,
      })
      .select("*")
      .single();

    if (qerr || !qrow) {
      return new Response(JSON.stringify({ error: "queue_insert_failed", detail: qerr?.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
      .select("coin_rate_per_min")
      .eq("host_id", hostUserId)
      .maybeSingle();

    const hostRate = hpref?.coin_rate_per_min ?? settings.default_host_rate_coins_per_min;

    const livekitRoom = `match-${crypto.randomUUID()}`;
    const freeTrial = settings.free_trial_seconds + (profile?.is_vip ? settings.vip_free_trial_bonus_seconds : 0);

    const { data: session, error: serr } = await supabase
      .from("random_call_sessions")
      .insert({
        livekit_room: livekitRoom,
        caller_id: userId,
        host_id: hostUserId,
        coin_rate_per_min: hostRate,
        free_trial_seconds: freeTrial,
        min_billable_seconds: settings.min_billable_seconds,
        host_split_pct: settings.host_split_pct,
        hold_amount: holdAmount,
        status: "ringing",
      })
      .select("*")
      .single();

    if (serr || !session) {
      return new Response(JSON.stringify({ error: "session_insert_failed", detail: serr?.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Attach session_id to both queue rows
    await supabase.from("random_call_queue").update({ session_id: session.id }).in("id", [qrow.id]);

    // Broadcast to host (Supabase Realtime)
    try {
      const channel = supabase.channel(`user-${hostUserId}`);
      await channel.send({
        type: "broadcast",
        event: "random_incoming_call",
        payload: { session_id: session.id, room: livekitRoom, caller_id: userId },
      });
    } catch (_) { /* best-effort */ }

    return new Response(
      JSON.stringify({
        status: "matched",
        session_id: session.id,
        room: livekitRoom,
        host_id: hostUserId,
        coin_rate_per_min: hostRate,
        free_trial_seconds: freeTrial,
        min_billable_seconds: settings.min_billable_seconds,
        ring_timeout_seconds: settings.ring_timeout_seconds,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: "internal_error", detail: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
