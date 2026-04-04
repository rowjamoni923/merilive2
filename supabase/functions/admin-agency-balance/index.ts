import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    const { agency_id, field, amount, action } = await req.json();

    if (!agency_id || !field || amount === undefined || !action) {
      throw new Error("agency_id, field, amount, and action (set/add/subtract) required");
    }

    // Get current balance
    const { data: agency, error: fetchErr } = await supabase
      .from("agencies")
      .select("id, name, beans_balance, diamond_balance, wallet_balance")
      .eq("id", agency_id)
      .single();

    if (fetchErr || !agency) throw new Error("Agency not found: " + (fetchErr?.message || ""));

    const currentValue = (agency as any)[field] || 0;
    let newValue = currentValue;

    if (action === "set") newValue = amount;
    else if (action === "add") newValue = currentValue + amount;
    else if (action === "subtract") newValue = Math.max(0, currentValue - amount);

    const { error: updateErr } = await supabase
      .from("agencies")
      .update({ [field]: newValue })
      .eq("id", agency_id);

    if (updateErr) throw updateErr;

    return new Response(JSON.stringify({
      success: true,
      agency_name: agency.name,
      field,
      old_value: currentValue,
      new_value: newValue,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
