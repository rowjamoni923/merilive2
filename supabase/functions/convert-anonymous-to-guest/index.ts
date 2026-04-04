import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Convert Anonymous Account to Guest Account
 * 
 * This edge function converts an anonymous Supabase auth user to a proper
 * email/password user using deterministic guest credentials.
 * This is CRITICAL for device-based account recovery after app reinstall.
 * 
 * Flow:
 * 1. Client sends device_id
 * 2. We find the profile with that device_id
 * 3. Check if the auth user is anonymous (no email)
 * 4. Use Admin API to set email + password on the anonymous user
 * 5. Return success so client can sign in with deterministic credentials
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

    // Step 1: Find profile with this device_id
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, display_name, device_id")
      .eq("device_id", deviceId)
      .eq("is_deleted", false)
      .maybeSingle();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ converted: false, reason: "no_profile_found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 2: Check if auth user exists and is anonymous
    const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(profile.id);

    if (authError || !authUser?.user) {
      return new Response(
        JSON.stringify({ converted: false, reason: "no_auth_user" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If user already has email, no conversion needed
    if (authUser.user.email && !authUser.user.email.includes('@meri.local')) {
      return new Response(
        JSON.stringify({ 
          converted: false, 
          reason: "already_has_email",
          hasCredentials: true 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If already converted to guest credentials, just confirm
    if (authUser.user.email?.includes('@meri.local')) {
      return new Response(
        JSON.stringify({ converted: true, alreadyConverted: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 3: Generate DETERMINISTIC credentials matching Auth.tsx and recover_session_by_device RPC
    const guestEmail = `guest_${deviceId}@meri.local`;
    // MUST match the formula in Auth.tsx handleDeviceRegistration() and recover_session_by_device RPC
    const guestPassword = `meri_${deviceId}_secure`;

    // Step 4: Update the anonymous user with email + password using Admin API
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      profile.id,
      {
        email: guestEmail,
        password: guestPassword,
        email_confirm: true, // Auto-confirm the email
      }
    );

    if (updateError) {
      console.error("Failed to convert anonymous user:", updateError);
      return new Response(
        JSON.stringify({ converted: false, reason: "update_failed", error: updateError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[convert-anonymous] Successfully converted user ${profile.id} (${profile.display_name}) to guest credentials`);

    return new Response(
      JSON.stringify({ 
        converted: true, 
        userId: profile.id,
        displayName: profile.display_name,
      }),
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