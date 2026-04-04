import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Admin Reset Password via WhatsApp OTP
 * 
 * Requires: email (to identify admin) + phone_number + otp + newPassword
 * The OTP was already sent via send-whatsapp-otp and verified client-side.
 * This function re-verifies the OTP and updates the password.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email, phone_number, otp, newPassword } = await req.json();

    if (!email || !phone_number || !otp || !newPassword) {
      return new Response(
        JSON.stringify({ error: "Email, phone number, OTP, and new password are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (newPassword.length < 6) {
      return new Response(
        JSON.stringify({ error: "Password must be at least 6 characters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const cleanPhone = phone_number.replace(/[\s\-\(\)]/g, "").replace(/^\+/, "");
    const normalizedEmail = email.trim().toLowerCase();

    // 1. Verify OTP is still valid
    const { data: otpRecord, error: otpError } = await adminClient
      .from("phone_otps")
      .select("*")
      .eq("phone_number", cleanPhone)
      .eq("otp_code", otp)
      .eq("is_used", false)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (otpError || !otpRecord) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired OTP" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Find admin user by email
    const { data: adminUser, error: adminError } = await adminClient
      .from("admin_users")
      .select("user_id, email")
      .ilike("email", normalizedEmail)
      .eq("is_active", true)
      .maybeSingle();

    if (adminError || !adminUser || !adminUser.user_id) {
      return new Response(
        JSON.stringify({ error: "Admin account not found for this email" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Update password
    const { error: updateError } = await adminClient.auth.admin.updateUserById(
      adminUser.user_id,
      { password: newPassword }
    );

    if (updateError) {
      console.error("[admin-reset-password-whatsapp] Failed to update password:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update password" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Mark OTP as used
    await adminClient
      .from("phone_otps")
      .update({ is_used: true })
      .eq("id", otpRecord.id);

    console.log(`[admin-reset-password-whatsapp] ✅ Password reset for: ${normalizedEmail} via WhatsApp ${cleanPhone}`);

    return new Response(
      JSON.stringify({ success: true, message: "Password updated successfully" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[admin-reset-password-whatsapp] Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
