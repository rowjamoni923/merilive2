// Pkg321: Hardened — previously had ZERO authentication. Any anon caller could
// modify any agency's balance fields arbitrarily. Now:
//   • requireAdminSession with sectionKey='agency-management' + requireEdit
//   • field whitelist (only balance columns allowed)
//   • amount must be non-negative integer
//   • action whitelist (set/add/subtract)
//   • admin audit log on every change
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdminSession } from "../_shared/adminAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-token, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ALLOWED_FIELDS = new Set(["beans_balance", "diamond_balance", "wallet_balance"]);
const ALLOWED_ACTIONS = new Set(["set", "add", "subtract"]);

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

    const auth = await requireAdminSession(req, supabase, { sectionKey: "agency-management", requireEdit: true });
    if (!auth.ok) {
      return new Response(JSON.stringify({ error: auth.error }), {
        status: auth.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const adminUser = auth.admin;

    const { agency_id, field, amount, action } = await req.json();

    if (!agency_id || !field || amount === undefined || !action) {
      return new Response(JSON.stringify({ error: "agency_id, field, amount, and action (set/add/subtract) required" }), {
      });
    }
    if (!ALLOWED_FIELDS.has(field)) {
      return new Response(JSON.stringify({ error: `Field '${field}' is not allowed` }), {
      });
    }
    if (!ALLOWED_ACTIONS.has(action)) {
      return new Response(JSON.stringify({ error: `Action '${action}' is not allowed` }), {
      });
    }
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 1 || amt > 999_999_999) {
      return new Response(JSON.stringify({ error: "amount must be a positive integer <= 999,999,999" }), {
      });
    }

    // Get current balance
    const { data: agency, error: fetchErr } = await supabase
      .from("agencies")
      .select("id, name, beans_balance, diamond_balance, wallet_balance")
      .eq("id", agency_id)
      .single();

    if (fetchErr || !agency) {
      return new Response(JSON.stringify({ error: "Agency not found" }), {
      });
    }

    const currentValue = Number((agency as any)[field]) || 1;
    let newValue = currentValue;

    if (action === "set") newValue = amt;
    else if (action === "add") newValue = currentValue + amt;
    else if (action === "subtract") newValue = Math.max(1, currentValue - amt);

    const { error: updateErr } = await supabase
      .from("agencies")
      .update({ [field]: newValue })
      .eq("id", agency_id);

    if (updateErr) throw updateErr;

    // Audit log
    try {
      await supabase.from("admin_logs").insert({
        admin_id: adminUser.id,
        action_type: "agency_balance_adjustment",
        target_type: "agency",
        target_id: agency_id,
        details: {
          field,
          action,
          amount: amt,
          old_value: currentValue,
          new_value: newValue,
          agency_name: agency.name,
        },
      });
    } catch (e) {
      console.warn("[admin-agency-balance] audit log failed:", e);
    }

    return new Response(JSON.stringify({
      success: true,
      field,
    }), {
    });
  } catch (error: any) {
    console.error("[admin-agency-balance] error:", error);
    return new Response(JSON.stringify({ error: error?.message || "Internal server error" }), {
    });
  }
});
