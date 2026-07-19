/**
 * call-start
 * Phase 3B Step 2 — Pre-call balance gate.
 *
 * Called by the Android/web client BEFORE initiating a private call.
 * Verifies the caller has at least MIN_PREPAY_MINUTES worth of diamonds,
 * and freezes the rate snapshot on the private_calls row.
 *
 * Body: { call_id: string }
 * Auth: caller JWT (must equal private_calls.caller_id)
 *
 * Returns:
 *   200 { ok: true, viewer_rate_per_min, host_rate_per_min, min_required, balance }
 *   402 { ok: false, reason: 'insufficient_balance', min_required, balance }
 *   403 { ok: false, reason: 'forbidden' }
 *   404 { ok: false, reason: 'call_not_found' }
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MIN_PREPAY_MINUTES = 3; // industry standard: Chamet/Bigo require ≥1min, we set 3min cushion

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, reason: "method_not_allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) {
      return new Response(JSON.stringify({ ok: false, reason: "unauthenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ ok: false, reason: "unauthenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const callId: string | undefined = body?.call_id;
    if (!callId || typeof callId !== "string") {
      return new Response(JSON.stringify({ ok: false, reason: "missing_call_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Fetch call
    const { data: call, error: callErr } = await admin
      .from("private_calls")
      .select("id, caller_id, host_id, status, diamonds_per_minute, viewer_rate_per_min, host_rate_per_min, platform_cut_percent")
      .eq("id", callId)
      .maybeSingle();

    if (callErr) {
      console.error("[call-start] call fetch err", callErr);
      return new Response(JSON.stringify({ ok: false, reason: "db_error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!call) {
      return new Response(JSON.stringify({ ok: false, reason: "call_not_found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (call.caller_id !== user.id) {
      return new Response(JSON.stringify({ ok: false, reason: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verified-host gate: private calls may only target real verified hosts.
    // Female-gender accounts that signed up as hosts but never passed face verification are NOT eligible.
    const { data: hostProfile, error: hostProfErr } = await admin
      .from("profiles")
      .select("id, is_host, is_face_verified")
      .eq("id", call.host_id)
      .maybeSingle();

    if (hostProfErr) {
      console.error("[call-start] host profile fetch err", hostProfErr);
      return new Response(JSON.stringify({ ok: false, reason: "db_error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!hostProfile || hostProfile.is_host !== true || hostProfile.is_face_verified !== true) {
      return new Response(JSON.stringify({ ok: false, reason: "host_not_verified" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve viewer rate (frozen if already set, else from call.diamonds_per_minute / app_settings default)
    let viewerRate: number = Number(call.viewer_rate_per_min ?? 0);
    let hostRate: number = Number(call.host_rate_per_min ?? 0);
    let platformPct: number = Number(call.platform_cut_percent ?? 0);

    if (!viewerRate || !hostRate || !platformPct) {
      // Look up commission % — Admin Single Source of Truth (NO hardcoded fallback)
      const { data: setting } = await admin
        .from("app_settings")
        .select("setting_value")
        .eq("setting_key", "call_rates")
        .maybeSingle();

      let commissionPct: number | null = null;
      try {
        const raw = setting?.setting_value;
        if (raw) {
          const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
          const c = Number(parsed?.host_commission_percent);
          if (Number.isFinite(c) && c >= 0 && c <= 100) commissionPct = c;
        }
      } catch (_) { /* ignored */ }

      if (commissionPct === null) {
        console.error("[call-start] host_commission_percent not configured in app_settings.call_rates");
        return new Response(JSON.stringify({
          ok: false,
          reason: "billing_not_configured",
          detail: "Call pricing is not configured by admin. Please contact support.",
        }), {
          status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      viewerRate = Math.max(Number(call.diamonds_per_minute ?? 0) || 0, 0);
      if (!viewerRate) {
        return new Response(JSON.stringify({
          ok: false,
          reason: "billing_not_configured",
          detail: "Per-minute rate is not configured by admin.",
        }), {
          status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      hostRate = Math.floor((viewerRate * commissionPct) / 100);
      platformPct = 100 - commissionPct;

      await admin
        .from("private_calls")
        .update({
          viewer_rate_per_min: viewerRate,
          host_rate_per_min: hostRate,
          platform_cut_percent: platformPct,
          updated_at: new Date().toISOString(),
        })
        .eq("id", callId);
    }


    const minRequired = viewerRate * MIN_PREPAY_MINUTES;

    // Check balance
    // Check balance — Pillar C: spend authority spans diamonds OR diamonds
    // (whichever is higher), matching random-call-enqueue and billing-tick.
    const { data: profile, error: profErr } = await admin
      .from("profiles")
      .select("diamonds, diamonds")
      .eq("id", user.id)
      .maybeSingle();

    if (profErr || !profile) {
      console.error("[call-start] profile fetch err", profErr);
      return new Response(JSON.stringify({ ok: false, reason: "profile_not_found" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const balance = Math.max(Number(profile.diamonds ?? 0), Number(profile.diamonds ?? 0));
    if (balance < minRequired) {
      return new Response(JSON.stringify({
        ok: false,
        reason: "insufficient_balance",
        min_required: minRequired,
        balance,
        viewer_rate_per_min: viewerRate,
      }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      viewer_rate_per_min: viewerRate,
      host_rate_per_min: hostRate,
      platform_cut_percent: platformPct,
      min_required: minRequired,
      min_prepay_minutes: MIN_PREPAY_MINUTES,
      balance,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[call-start] uncaught", e);
    return new Response(JSON.stringify({ ok: false, reason: "internal_error", message: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
