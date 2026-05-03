import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import nodemailer from "npm:nodemailer@6.9.12";
import { buildOtpEmailHTML, buildOtpEmailSubject } from "../_shared/otp-email-template.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

// ===== Gmail SMTP =====
async function sendWithGmail(to: string, subject: string, html: string): Promise<{ success: boolean; error?: string }> {
  const gmailUser = (Deno.env.get("GMAIL_USER") ?? "").trim();
  const gmailPass = (Deno.env.get("GMAIL_APP_PASSWORD") ?? "").replace(/\s+/g, "");

  if (!gmailUser || !gmailPass) {
    return { success: false, error: "GMAIL_USER or GMAIL_APP_PASSWORD not configured" };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: gmailUser, pass: gmailPass },
    });

    await transporter.sendMail({
      from: `"MeriLive" <${gmailUser}>`,
      to,
      subject,
      html,
    });

    return { success: true };
  } catch (e: any) {
    const msg = e?.message || String(e);
    const code = e?.code || e?.responseCode || "";
    // Detect auth failures explicitly so future Gmail App Password issues are obvious in logs
    const isAuthError = code === "EAUTH" || /535|invalid login|username and password not accepted|application-specific password/i.test(msg);
    if (isAuthError) {
      console.error("[send-email-otp] 🚨 GMAIL AUTH FAILURE — App Password invalid/expired. Please rotate GMAIL_APP_PASSWORD secret. Detail:", msg);
      return { success: false, error: "Gmail authentication failed. Admin must rotate GMAIL_APP_PASSWORD secret." };
    }
    console.error("[send-email-otp] Gmail SMTP error:", msg, "code:", code);
    return { success: false, error: msg };
  }
}

// Gmail-only sender (no fallback providers)
async function sendEmail(to: string, subject: string, html: string): Promise<{ success: boolean; provider?: string; error?: string }> {
  const gmail = await sendWithGmail(to, subject, html);
  if (gmail.success) return { success: true, provider: "gmail-smtp" };
  return { success: false, error: gmail.error };
}

// Luxurious premium template lives in _shared/otp-email-template.ts


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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: rateLimitOk } = await supabase.rpc("check_otp_rate_limit", {
      p_email: email.toLowerCase(),
    });

    if (!rateLimitOk) {
      return new Response(
        JSON.stringify({ success: false, error: "Too many requests. Please try again after 10 minutes." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Invalidate any previous unused OTPs for this email/purpose
    await supabase
      .from("email_otps")
      .update({ is_used: true })
      .eq("email", email.toLowerCase())
      .eq("purpose", purpose)
      .eq("is_used", false);

    const otp = generateOTP();
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

    const subject =
      purpose === "login" ? "[MeriLive] Your Sign-In Code" :
      purpose === "register" ? "[MeriLive] Confirm Your Account" :
      purpose === "reset" ? "[MeriLive] Reset Your Password" :
      "[MeriLive] Your Verification Code";

    const html = buildOTPEmailHTML(otp, purpose);
    const result = await sendEmail(email, subject, html);

    if (!result.success) {
      console.error("[send-email-otp] Email delivery failed:", result.error);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to send verification email. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[send-email-otp] OTP sent to ${email} (${purpose}) via ${result.provider}`);

    return new Response(
      JSON.stringify({ success: true, message: "OTP sent successfully" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[send-email-otp] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Failed to send email" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
