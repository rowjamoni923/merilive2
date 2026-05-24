import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Lookup saved WhatsApp number for an admin by email.
 * Returns masked number for privacy (e.g., 880****5678).
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({ error: "Legacy admin phone lookup endpoint is disabled" }),
    { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const bearerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    if (!bearerToken || !anonKey || bearerToken === anonKey) {
      return new Response(
        JSON.stringify({ error: "Admin recovery session required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { email } = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const normalizedEmail = email.trim().toLowerCase();

    const { data, error } = await adminClient
      .from("admin_users")
      .select("whatsapp_number")
      .ilike("email", normalizedEmail)
      .eq("is_active", true)
      .maybeSingle();

    if (error || !data || !data.whatsapp_number) {
      return new Response(
        JSON.stringify({ whatsapp_number: null }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const phone = data.whatsapp_number;
    // Return full number (admin context, not public)
    return new Response(
      JSON.stringify({ whatsapp_number: phone }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[admin-lookup-phone] Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
