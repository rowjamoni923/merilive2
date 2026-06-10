// PK Battle tick: progresses active→punishment→completed via DB RPC.
// Scheduled by pg_cron every 10s.
//
// CR-5 (Phase 1): verify_jwt=false so pg_cron can call without a JWT, but the
// function now requires either the service-role bearer (which pg_cron already
// sends) or an explicit CRON_SECRET header. Same pattern as call-billing-tick.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = req.headers.get("authorization") ?? "";
  const cronSecretHeader = req.headers.get("x-cron-secret") ?? "";
  const cronSecretEnv = Deno.env.get("CRON_SECRET") ?? "";
  const authorized =
    (auth.startsWith("Bearer ") && safeEqual(auth.slice(7), SERVICE_ROLE_KEY)) ||
    (cronSecretEnv.length > 0 && safeEqual(cronSecretHeader, cronSecretEnv));
  if (!authorized) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { data, error } = await supabase.rpc("pk_battle_tick_all");
    if (error) {
      console.error("[pk-battle-tick] rpc error:", error);
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, progressed: data ?? 0, t: Date.now() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[pk-battle-tick] fatal:", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
