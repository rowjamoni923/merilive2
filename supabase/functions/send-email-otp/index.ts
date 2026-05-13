import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sendOtpEmail } from "../_shared/send-otp-email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, x-client-platform, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function generateOTP(): string {
  const arr = new Uint8Array(6);
  crypto.getRandomValues(arr);
  let otp = "";
  for (let i = 0; i < 6; i++) otp += (arr[i] % 10).toString();
  return otp;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { email, purpose = "login" } = await req.json();

    if (!email || typeof email !== "string") {
      return new Response(JSON.stringify({ success: false, error: "Email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(JSON.stringify({ success: false, error: "Invalid email format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const validPurposes = ["login", "register", "reset", "verify"];
    if (!validPurposes.includes(purpose)) {
      return new Response(JSON.stringify({ success: false, error: "Invalid purpose" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: rateLimitOk } = await supabase.rpc("check_otp_rate_limit", { p_email: email.toLowerCase() });
    if (!rateLimitOk) {
      return new Response(JSON.stringify({ success: false, error: "Too many requests. Please try again after 10 minutes." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    await supabase.from("email_otps")
      .update({ is_used: true })
      .eq("email", email.toLowerCase()).eq("purpose", purpose).eq("is_used", false);

    const otp = generateOTP();
    const { error: insertError } = await supabase.from("email_otps").insert({
      email: email.toLowerCase(),
      otp_code: otp,
      purpose,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });

    if (insertError) {
      console.error("[send-email-otp] DB insert error:", insertError);
      return new Response(JSON.stringify({ success: false, error: "Failed to generate OTP" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const result = await sendOtpEmail({ to: email, otp, purpose: purpose as any, expiryMinutes: 5 });
    if (!result.success) {
      console.error("[send-email-otp] Email delivery failed:", result.error);
      return new Response(JSON.stringify({ success: false, error: "Failed to send verification email. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`[send-email-otp] OTP queued for ${email} (${purpose}) via Lovable Email`);
    return new Response(JSON.stringify({ success: true, message: "OTP sent successfully" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("[send-email-otp] Error:", error);
    return new Response(JSON.stringify({ success: false, error: "Failed to send email" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
