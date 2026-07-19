// PK Battle tick: progresses active→punishment→completed via DB RPC.
// Scheduled by pg_cron every 10s.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const { data, error } = await supabase.rpc("pk_battle_tick_all");
    if (error) {
      console.error("[pk-battle-tick] rpc error:", error);
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, progressed: data ?? 0, t: Date.now() }), {
    });
  } catch (e) {
    console.error("[pk-battle-tick] fatal:", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
    });
  }
});
