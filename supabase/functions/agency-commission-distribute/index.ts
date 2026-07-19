// Pkg321: Hardened manual-mode auth. Previously, isManual=true bypassed ALL
// auth checks — any caller could trigger commission distribution.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdminSession } from "../_shared/adminAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret, x-admin-token, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const isManual = body?.manual === true;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (!isManual) {
      const cronSecret = req.headers.get("x-cron-secret");
      const expected = Deno.env.get("CRON_SECRET");
      if (expected && cronSecret !== expected) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (isManual) {
      const auth = await requireAdminSession(req, supabase, { sectionKey: "agency-management", requireEdit: true });
      if (!auth.ok) {
        return new Response(JSON.stringify({ error: auth.error }), {
        });
      }
    }

    const since = body?.since ?? null;
    const { data, error } = await supabase.rpc("process_agency_commission_distribution", { _since: since });

    if (error) throw error;

    return new Response(JSON.stringify({ success: true, result: data }), {
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("agency-commission-distribute error:", msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
    });
  }
});
