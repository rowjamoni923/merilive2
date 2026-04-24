import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import nodemailer from "npm:nodemailer@6.9.12";

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

// ===== Gmail SMTP (only provider) =====
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
    console.error("[send-email-otp] Gmail SMTP error:", e?.message || e);
    return { success: false, error: e?.message || String(e) };
  }
}

// Single provider: Gmail SMTP
async function sendEmail(to: string, subject: string, html: string): Promise<{ success: boolean; provider?: string; error?: string }> {
  const gmail = await sendWithGmail(to, subject, html);
  if (gmail.success) return { success: true, provider: "gmail-smtp" };
  return { success: false, error: gmail.error };
}

function buildOTPEmailHTML(otp: string, purpose: string): string {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "https://ayjdlvuurscxucatbbah.supabase.co";
  const logoUrl = `${supabaseUrl}/storage/v1/object/public/app-assets/merilive-logo.png`;

  const verifyType =
    purpose === "login" ? "Sign-In Verification" :
    purpose === "register" ? "Account Verification" :
    purpose === "reset" ? "Password Reset" :
    "Identity Verification";

  const otpDigits = otp.split("").map((d: string) =>
    `<td style="width:44px;height:52px;background:linear-gradient(145deg,#1a1a2e,#16213e);border-radius:10px;text-align:center;vertical-align:middle;border:1px solid rgba(124,58,237,0.3);box-shadow:0 4px 15px rgba(124,58,237,0.15),inset 0 1px 0 rgba(255,255,255,0.05);"><span style="font-size:26px;font-weight:800;color:#e0b3ff;font-family:'Courier New',monospace;">${d}</span></td>`
  ).join('<td style="width:8px;"></td>');

  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:20px 0;">
<tr><td align="center">
<table width="460" cellpadding="0" cellspacing="0" style="border-radius:20px;overflow:hidden;box-shadow:0 0 60px rgba(124,58,237,0.15),0 20px 60px rgba(0,0,0,0.4);">

  <tr><td style="background:linear-gradient(135deg,#0f0c29 0%,#302b63 50%,#24243e 100%);padding:36px 40px 28px;text-align:center;border-bottom:1px solid rgba(124,58,237,0.2);">
    <div style="margin:0 0 12px;">
      <img src="${logoUrl}" alt="MeriLive" width="72" height="72" style="border-radius:16px;box-shadow:0 4px 20px rgba(124,58,237,0.3);" />
    </div>
    <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:700;letter-spacing:2px;text-shadow:0 2px 10px rgba(124,58,237,0.4);">meri<span style="color:#a78bfa;">LIVE</span></h1>
    <div style="margin:12px auto 0;width:60px;height:3px;background:linear-gradient(90deg,#7c3aed,#a78bfa,#7c3aed);border-radius:2px;"></div>
    <p style="margin:14px 0 0;color:rgba(167,139,250,0.9);font-size:13px;font-weight:500;letter-spacing:3px;text-transform:uppercase;">${verifyType}</p>
  </td></tr>

  <tr><td style="background:linear-gradient(180deg,#13131f 0%,#0e0e18 100%);padding:36px 40px;">
    <p style="margin:0 0 6px;color:#e2e8f0;font-size:16px;font-weight:600;">Hello,</p>
    <p style="margin:0 0 28px;color:#94a3b8;font-size:14px;line-height:1.6;">Use the code below to complete your ${verifyType.toLowerCase()}.</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
      <tr><td style="background:linear-gradient(145deg,#1e1b4b,#0f172a);border-radius:16px;padding:28px 20px;text-align:center;border:1px solid rgba(124,58,237,0.25);box-shadow:inset 0 2px 20px rgba(124,58,237,0.08);">
        <p style="margin:0 0 14px;color:#7c3aed;font-size:11px;font-weight:600;letter-spacing:4px;text-transform:uppercase;">Your Verification Code</p>
        <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
          <tr>${otpDigits}</tr>
        </table>
      </td></tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr><td style="background:linear-gradient(135deg,rgba(124,58,237,0.1),rgba(168,85,247,0.05));border-radius:12px;padding:16px 20px;border-left:3px solid #7c3aed;">
        <table cellpadding="0" cellspacing="0"><tr>
          <td style="vertical-align:middle;padding-right:12px;"><span style="font-size:20px;">⏱️</span></td>
          <td style="vertical-align:middle;">
            <p style="margin:0;color:#c4b5fd;font-size:13px;font-weight:600;">Expires in 5 minutes</p>
            <p style="margin:3px 0 0;color:#64748b;font-size:11px;">Enter this code promptly to continue</p>
          </td>
        </tr></table>
      </td></tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="background:rgba(239,68,68,0.06);border-radius:10px;padding:14px 18px;border:1px solid rgba(239,68,68,0.12);">
        <table cellpadding="0" cellspacing="0"><tr>
          <td style="vertical-align:middle;padding-right:10px;"><span style="font-size:16px;">🛡️</span></td>
          <td style="vertical-align:middle;">
            <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.5;">Never share this code with anyone. MeriLive team will never ask for your verification code.</p>
          </td>
        </tr></table>
      </td></tr>
    </table>
  </td></tr>

  <tr><td style="background:#0a0a12;padding:24px 40px;text-align:center;border-top:1px solid rgba(124,58,237,0.1);">
    <p style="margin:0 0 8px;color:#4a5568;font-size:11px;">If you didn't request this code, you can safely ignore this email.</p>
    <div style="margin:12px 0;width:40px;height:1px;background:rgba(124,58,237,0.3);display:inline-block;"></div>
    <p style="margin:0;color:#374151;font-size:10px;letter-spacing:1px;">© ${new Date().getFullYear()} MeriLive &middot; All Rights Reserved</p>
  </td></tr>

</table>
</td></tr></table>
</body></html>
  `;
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
