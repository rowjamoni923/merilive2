import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Generate 6-digit OTP
function generateOTP(): string {
  const digits = "0123456789";
  let otp = "";
  const arr = new Uint8Array(6);
  crypto.getRandomValues(arr);
  for (let i = 0; i < 6; i++) {
    otp += digits[arr[i] % 10];
  }
  return otp;
}

// Build email HTML
function buildOTPEmailHTML(otp: string, purpose: string): string {
  const purposeText = purpose === "login" ? "Login Verification" : 
                      purpose === "register" ? "Registration" :
                      purpose === "reset" ? "Password Reset" : "Verification";

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:40px 0;">
<tr><td align="center">
<table width="420" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
  <tr><td style="background:linear-gradient(135deg,#7c3aed,#a855f7);padding:28px 32px;text-align:center;">
    <h1 style="margin:0;color:#fff;font-size:22px;letter-spacing:1px;">✨ MeriLive</h1>
    <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">${purposeText}</p>
  </td></tr>
  <tr><td style="padding:32px;">
    <p style="margin:0 0 16px;color:#333;font-size:15px;">Your verification code is:</p>
    <div style="background:#f8f5ff;border:2px dashed #7c3aed;border-radius:10px;padding:20px;text-align:center;margin:0 0 20px;">
      <span style="font-size:36px;font-weight:700;letter-spacing:10px;color:#7c3aed;">${otp}</span>
    </div>
    <p style="margin:0 0 8px;color:#666;font-size:13px;">⏰ This code expires in <strong>5 minutes</strong></p>
    <p style="margin:0;color:#999;font-size:12px;">If you didn't request this code, please ignore this email.</p>
  </td></tr>
  <tr><td style="background:#fafafa;padding:16px 32px;text-align:center;border-top:1px solid #eee;">
    <p style="margin:0;color:#aaa;font-size:11px;">© ${new Date().getFullYear()} MeriLive. All rights reserved.</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, purpose = "login" } = await req.json();

    if (!email || typeof email !== "string") {
      return new Response(
        JSON.stringify({ success: false, error: "Email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid email format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const validPurposes = ["login", "register", "reset", "verify"];
    if (!validPurposes.includes(purpose)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid purpose" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get Resend API key
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.error("[send-email-otp] RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ success: false, error: "Email service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Supabase client (service role for DB access)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check rate limit
    const { data: rateLimitOk } = await supabase.rpc("check_otp_rate_limit", {
      p_email: email.toLowerCase(),
    });

    if (!rateLimitOk) {
      return new Response(
        JSON.stringify({ success: false, error: "Too many requests. Please try again after 10 minutes." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Invalidate previous unused OTPs
    await supabase
      .from("email_otps")
      .update({ is_used: true })
      .eq("email", email.toLowerCase())
      .eq("purpose", purpose)
      .eq("is_used", false);

    // Generate OTP
    const otp = generateOTP();

    // Store OTP in database
    const { error: insertError } = await supabase.from("email_otps").insert({
      email: email.toLowerCase(),
      otp_code: otp,
      purpose: purpose,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });

    if (insertError) {
      console.error("[send-email-otp] DB insert error:", insertError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to generate OTP" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build email HTML
    const emailHTML = buildOTPEmailHTML(otp, purpose);

    // Send via Resend API
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "MeriLive <noreply@merilive.com>",
        to: [email],
        subject: `${otp} - MeriLive Verification Code`,
        html: emailHTML,
      }),
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error("[send-email-otp] Resend API error:", JSON.stringify(resendData));
      return new Response(
        JSON.stringify({ success: false, error: "Failed to send email" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[send-email-otp] ✅ OTP sent to ${email} via Resend (id: ${resendData.id})`);

    return new Response(
      JSON.stringify({ success: true, message: "OTP sent successfully" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[send-email-otp] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
