import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Force Reset Guest Password
 * 
 * When a guest user's password doesn't match the deterministic formula,
 * this function resets it using the Admin API to restore access.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { deviceId } = await req.json();

    if (!deviceId) {
      return new Response(
        JSON.stringify({ error: "deviceId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find profile with this device_id
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, display_name")
      .eq("device_id", deviceId)
      .eq("is_deleted", false)
      .maybeSingle();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ success: false, reason: "no_profile_found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Deterministic credentials
    const guestEmail = `guest_${deviceId}@meri.local`;
    const guestPassword = `meri_${deviceId}_secure`;

    // Force update auth user with correct email + password
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      profile.id,
      {
        email: guestEmail,
        password: guestPassword,
        email_confirm: true,
      }
    );

    if (updateError) {
      console.error("[force-reset-guest-password] Update failed:", updateError);
      return new Response(
        JSON.stringify({ success: false, reason: "update_failed", error: updateError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[force-reset-guest-password] ✅ Reset password for user ${profile.id} (${profile.display_name})`);

    return new Response(
      JSON.stringify({ success: true, userId: profile.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
