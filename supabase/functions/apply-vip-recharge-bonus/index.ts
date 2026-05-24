// Internal-only: called by recharge edge functions (server-to-server) to credit
// VIP/Noble bonus diamonds on top of the base recharge amount.
// Hardened (Pkg311): requires either CRON/internal secret OR service-role JWT.
// Direct anon callers are rejected — previously any anon could grant unlimited
// diamonds to any user_id.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret, x-cron-secret, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isAuthorized(req: Request): boolean {
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const internalSecret =
    Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? Deno.env.get("CRON_SECRET");

  const authHeader = req.headers.get("Authorization") ?? "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (serviceRole && bearer === serviceRole) return true;
  if (internalSecret) {
    if (req.headers.get("x-internal-secret") === internalSecret) return true;
    if (req.headers.get("x-cron-secret") === internalSecret) return true;
    if (bearer === internalSecret) return true;
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!isAuthorized(req)) {
      return jsonResponse({ error: "Forbidden: internal endpoint" }, 403);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { user_id, recharge_id, base_diamonds } = await req.json().catch(() => ({} as any));

    if (!user_id || typeof user_id !== "string" ||
        !base_diamonds || typeof base_diamonds !== "number" || base_diamonds <= 0) {
      return jsonResponse({ error: "user_id and positive base_diamonds required" }, 400);
    }

    const { data, error } = await supabaseAdmin.rpc("apply_vip_recharge_bonus", {
      _user_id: user_id,
      _recharge_id: recharge_id ?? null,
      _base_diamonds: Math.floor(base_diamonds),
    });

    if (error) {
      console.error("[apply-vip-recharge-bonus] RPC error:", error);
      return jsonResponse({ error: error.message }, 500);
    }

    return jsonResponse(data);
  } catch (e) {
    console.error("[apply-vip-recharge-bonus] Error:", e);
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});
