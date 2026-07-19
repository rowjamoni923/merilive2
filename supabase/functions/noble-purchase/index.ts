import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { noble_card_id, auto_renew = false } = await req.json();
    if (!noble_card_id) {
      return new Response(JSON.stringify({ error: "noble_card_id required" }), {
      });
    }

    const { data, error } = await supabase.rpc("purchase_noble_card", {
      _noble_card_id: noble_card_id,
      _auto_renew: auto_renew,
    });

    if (error) {
      console.error("[noble-purchase] RPC error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
      });
    }

    return new Response(JSON.stringify(data), {
    });
  } catch (e) {
    console.error("[noble-purchase] Error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
    });
  }
});
