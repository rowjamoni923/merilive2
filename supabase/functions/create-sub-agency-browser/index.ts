import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface CreateSubAgencyRequest {
  name: string;
  userId: string;
  email: string;
  emailVerifiedToken?: string;
  appVerifiedToken?: string;
  phone: string;
  parentAgencyCode: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("[create-sub-agency-browser] Starting request...");

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const authHeader = req.headers.get("authorization") || "";

    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Please log in before creating a sub-agency" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      supabaseUrl,
      serviceRoleKey,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const body = await req.json();
    const { name, userId, email, emailVerifiedToken, appVerifiedToken, phone, parentAgencyCode }: CreateSubAgencyRequest = body;

    console.log("[create-sub-agency-browser] Creating sub-agency:", { name, userId, parentAgencyCode });

    // Validate input
    if (!name || name.trim().length < 2) {
      return new Response(
        JSON.stringify({ error: "Please enter agency name" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!userId || userId !== user.id) {
      return new Response(
        JSON.stringify({ error: "You can only create a sub-agency for your own account" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Email is OPTIONAL. App OTP is the only required identity proof.
    // If the user provided an email, we still validate format and (if a token was
    // also sent) consume the OTP token; otherwise we just skip the email flow.
    const normalizedEmail = email ? String(email).trim().toLowerCase() : "";
    if (normalizedEmail) {
      if (!normalizedEmail.includes("@")) {
        return new Response(
          JSON.stringify({ error: "Please enter a valid email or leave it blank" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (emailVerifiedToken) {
        const { data: emailOtpOk, error: emailOtpError } = await supabaseAdmin.rpc("consume_otp_exchange_token", {
          p_verified_token: emailVerifiedToken,
          p_identifier: normalizedEmail,
          p_channel: "email",
          p_purpose: "verify",
        });
        if (emailOtpError) throw emailOtpError;
        if (!emailOtpOk) {
          return new Response(
            JSON.stringify({ error: "Email OTP expired. Please request a new code or remove the email." }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
      // If no token was provided alongside the email, we accept the email as a
      // contact field without OTP verification (Gmail OTP system is OFF).
    }


    if (!appVerifiedToken) {
      return new Response(
        JSON.stringify({ error: "Please verify your app notification OTP first" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: appOtpOk, error: appOtpError } = await supabaseAdmin.rpc("consume_agency_app_otp_token", {
      p_user_id: userId,
    });
    if (appOtpError) throw appOtpError;
    if (!appOtpOk) {
      return new Response(
        JSON.stringify({ error: "App OTP expired. Please request a new code." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!phone || phone.length < 10) {
      return new Response(
        JSON.stringify({ error: "Please enter a valid phone number" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!parentAgencyCode) {
      return new Response(
        JSON.stringify({ error: "Parent agency code is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user exists and is eligible
    const { data: userProfile, error: userError } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, agency_id, is_agency_owner")
      .eq("id", userId)
      .maybeSingle();

    if (userError || !userProfile) {
      return new Response(
        JSON.stringify({ error: "User not found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (userProfile.agency_id) {
      return new Response(
        JSON.stringify({ error: "User is already part of an agency" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (userProfile.is_agency_owner) {
      return new Response(
        JSON.stringify({ error: "User already owns an agency" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authEmail = (user.email || "").trim().toLowerCase();
    if (normalizedEmail && authEmail && normalizedEmail !== authEmail) {
      return new Response(
        JSON.stringify({ error: "Email must match your logged-in account" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find parent agency
    const { data: parentAgency, error: parentError } = await supabaseAdmin
      .from("agencies")
      .select("id, name, total_agents")
      .eq("agency_code", parentAgencyCode.toUpperCase())
      .eq("is_active", true)
      .maybeSingle();

    if (parentError || !parentAgency) {
      console.error("[create-sub-agency-browser] Parent not found:", parentError);
      return new Response(
        JSON.stringify({ error: "Parent agency not found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[create-sub-agency-browser] Found parent agency:", parentAgency.name);

    // Generate unique agency code
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let agencyCode = "AG";
    for (let i = 0; i < 6; i++) {
      agencyCode += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    // Ensure code is unique
    const { data: existingAgency } = await supabaseAdmin
      .from("agencies")
      .select("id")
      .eq("agency_code", agencyCode)
      .maybeSingle();

    if (existingAgency) {
      // Regenerate if exists
      agencyCode = "AG";
      for (let i = 0; i < 6; i++) {
        agencyCode += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    }

    // Create the sub-agency with owner
    const { data: newAgency, error: createError } = await supabaseAdmin
      .from("agencies")
      .insert({
        name: name.trim(),
        agency_code: agencyCode,
        owner_id: userId,
        level: "A1",
        wallet_balance: 0,
        diamond_balance: 0,
        beans_balance: 0,
        total_hosts: 0,
        total_agents: 0,
        is_active: true,
        parent_agency_id: parentAgency.id
      })
      .select()
      .single();

    if (createError) {
      console.error("[create-sub-agency-browser] Create error:", createError);
      return new Response(
        JSON.stringify({ error: "Failed to create agency: " + createError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[create-sub-agency-browser] Agency created:", newAgency.id);

    // Owner profile sync is handled by the database trigger on agencies.owner_id.

    // Update parent's total_agents count
    await supabaseAdmin
      .from("agencies")
      .update({ total_agents: (parentAgency.total_agents || 0) + 1 })
      .eq("id", parentAgency.id);

    // Send success notification to user
    try {
      await supabaseAdmin.functions.invoke('send-app-notification', {
        body: {
          userId: userId,
          templateKey: 'agency_approved',
          variables: {
            agency_name: newAgency.name,
          },
          type: 'agency_approved'
        }
      });
    } catch (notifError) {
      console.error("[create-sub-agency-browser] Notification error:", notifError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        agency: {
          id: newAgency.id,
          code: newAgency.agency_code,
        },
        message: "Agency created successfully"
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("[create-sub-agency-browser] Unexpected error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: "Server error: " + message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
