import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CreateSubAgencyRequest {
  name: string;
  userId: string;
  email: string;
  phone: string;
  parentAgencyCode: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("[create-sub-agency-browser] Starting request...");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const body = await req.json();
    const { name, userId, email, phone, parentAgencyCode }: CreateSubAgencyRequest = body;

    console.log("[create-sub-agency-browser] Creating sub-agency:", { name, userId, parentAgencyCode });

    // Validate input
    if (!name || name.trim().length < 2) {
      return new Response(
        JSON.stringify({ error: "Please enter agency name" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "User ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!email || !email.includes("@")) {
      return new Response(
        JSON.stringify({ error: "Please enter a valid email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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

    // Update user profile with agency ownership
    await supabaseAdmin
      .from("profiles")
      .update({ 
        is_agency_owner: true,
        agency_id: newAgency.id
      })
      .eq("id", userId);

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
            agency_code: agencyCode
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
          name: newAgency.name
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
