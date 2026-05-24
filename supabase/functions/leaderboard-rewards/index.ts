// Cron-triggered: distributes daily/weekly leaderboard rewards.
// Hardened (Pkg313): requires CRON_SECRET / service-role JWT — previously any
// anon could POST to trigger payout RPCs, race period boundaries, and spam
// mass notifications.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret, x-internal-secret, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
    Deno.env.get("CRON_SECRET") ?? Deno.env.get("INTERNAL_FUNCTION_SECRET");

  const authHeader = req.headers.get("Authorization") ?? "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (serviceRole && bearer === serviceRole) return true;
  if (internalSecret) {
    if (req.headers.get("x-cron-secret") === internalSecret) return true;
    if (req.headers.get("x-internal-secret") === internalSecret) return true;
    if (bearer === internalSecret) return true;
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!isAuthorized(req)) {
    return jsonResponse({ error: "Forbidden: cron-only endpoint" }, 403);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data, error } = await supabase.rpc("auto_distribute_leaderboard_rewards");
    if (error) throw error;

    return jsonResponse({
      success: true,
      result: data || "No distributions needed",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Leaderboard reward error:", error);
    return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
