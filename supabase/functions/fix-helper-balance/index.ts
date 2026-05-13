import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { helper_ids, target_balance } = await req.json();

    if (!helper_ids || !Array.isArray(helper_ids) || target_balance === undefined) {
      throw new Error("helper_ids (array) and target_balance (number) required");
    }

    const results = [];
    for (const hid of helper_ids) {
      const { error } = await supabase
        .from("topup_helpers")
        .update({ wallet_balance: target_balance, updated_at: new Date().toISOString() })
        .eq("id", hid);

      results.push({ id: hid, success: !error, error: error?.message });
      console.log(`Set helper ${hid} balance to ${target_balance}: ${error ? error.message : 'OK'}`);
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
