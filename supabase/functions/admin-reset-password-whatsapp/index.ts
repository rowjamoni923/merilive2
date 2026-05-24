const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Legacy admin password reset via WhatsApp OTP.
 * Disabled: this recovery path let a phone OTP reset an admin auth user
 * without an active owner admin session. Admin password changes now go
 * through authenticated owner-session flows only.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({ error: "Legacy admin WhatsApp password reset is disabled" }),
    { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
