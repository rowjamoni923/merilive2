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

function buildOTPEmailHTML(otp: string, purpose: string, logoUrl: string): string {
  const purposeText = purpose === "login" ? "Login Verification" : 
                      purpose === "register" ? "Account Registration" :
                      purpose === "reset" ? "Password Reset" : "Identity Verification";

  const otpDigits = otp.split("").map(d => 
    `<td style="width:44px;height:52px;background:linear-gradient(145deg,#1a1a2e,#16213e);border-radius:10px;text-align:center;vertical-align:middle;border:1px solid rgba(124,58,237,0.3);box-shadow:0 4px 15px rgba(124,58,237,0.15),inset 0 1px 0 rgba(255,255,255,0.05);"><span style="font-size:26px;font-weight:800;color:#e0b3ff;font-family:'Courier New',monospace;">${d}</span></td>`
  ).join('<td style="width:8px;"></td>');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;padding:40px 0;">
<tr><td align="center">
<table width="460" cellpadding="0" cellspacing="0" style="border-radius:20px;overflow:hidden;box-shadow:0 0 60px rgba(124,58,237,0.15),0 20px 60px rgba(0,0,0,0.4);">
  <tr><td style="background:linear-gradient(135deg,#0f0c29 0%,#302b63 50%,#24243e 100%);padding:36px 40px 28px;text-align:center;border-bottom:1px solid rgba(124,58,237,0.2);">
    <div style="margin:0 0 12px;">
      <img src="${logoUrl}" alt="MeriLive" width="72" height="72" style="border-radius:16px;box-shadow:0 4px 20px rgba(124,58,237,0.3);" />
    </div>
    <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:700;letter-spacing:2px;">meri<span style="color:#a78bfa;">LIVE</span></h1>
    <div style="margin:12px auto 0;width:60px;height:3px;background:linear-gradient(90deg,#7c3aed,#a78bfa,#7c3aed);border-radius:2px;"></div>
    <p style="margin:14px 0 0;color:rgba(167,139,250,0.9);font-size:13px;font-weight:500;letter-spacing:3px;text-transform:uppercase;">${purposeText}</p>
  </td></tr>
  <tr><td style="background:linear-gradient(180deg,#13131f 0%,#0e0e18 100%);padding:36px 40px;">
    <p style="margin:0 0 6px;color:#e2e8f0;font-size:16px;font-weight:600;">Hello,</p>
    <p style="margin:0 0 28px;color:#94a3b8;font-size:14px;line-height:1.6;">Use the following secure code to complete your ${purposeText.toLowerCase()}. This code is valid for a limited time only.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
      <tr><td style="background:linear-gradient(145deg,#1e1b4b,#0f172a);border-radius:16px;padding:28px 20px;text-align:center;border:1px solid rgba(124,58,237,0.25);">
        <p style="margin:0 0 14px;color:#7c3aed;font-size:11px;font-weight:600;letter-spacing:4px;text-transform:uppercase;">Your Verification Code</p>
        <table cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr>${otpDigits}</tr></table>
      </td></tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr><td style="background:linear-gradient(135deg,rgba(124,58,237,0.1),rgba(168,85,247,0.05));border-radius:12px;padding:16px 20px;border-left:3px solid #7c3aed;">
        <p style="margin:0;color:#c4b5fd;font-size:13px;font-weight:600;">⏱️ Expires in 5 minutes</p>
      </td></tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="background:rgba(239,68,68,0.06);border-radius:10px;padding:14px 18px;border:1px solid rgba(239,68,68,0.12);">
        <p style="margin:0;color:#94a3b8;font-size:12px;">🛡️ Never share this code with anyone. MeriLive team will never ask for your verification code.</p>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="background:#0a0a12;padding:24px 40px;text-align:center;border-top:1px solid rgba(124,58,237,0.1);">
    <p style="margin:0 0 8px;color:#4a5568;font-size:11px;">If you didn't request this code, you can safely ignore this email.</p>
    <p style="margin:0;color:#374151;font-size:10px;letter-spacing:1px;">© ${new Date().getFullYear()} MeriLive · All Rights Reserved</p>
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

    const gmailUser = Deno.env.get("GMAIL_USER");
    const gmailAppPassword = Deno.env.get("GMAIL_APP_PASSWORD");
    if (!gmailUser || !gmailAppPassword) {
      console.error("[send-email-otp] Gmail SMTP credentials not configured");
      return new Response(
        JSON.stringify({ success: false, error: "Email service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

    // Generate & store OTP
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

    const logoUrl = "https://ayjdlvuurscxucatbbah.supabase.co/storage/v1/object/public/app-assets/merilive-logo.png";
    
    // Fetch logo and convert to base64 for CID attachment
    let logoAttachment: any = null;
    try {
      const logoResponse = await fetch(logoUrl);
      if (logoResponse.ok) {
        const logoBuffer = await logoResponse.arrayBuffer();
        const logoBase64 = btoa(String.fromCharCode(...new Uint8Array(logoBuffer)));
        logoAttachment = {
          filename: 'merilive-logo.png',
          content: logoBase64,
          encoding: 'base64',
          cid: 'merilive-logo-cid',
          contentType: 'image/png',
        };
      }
    } catch (e) {
      console.log("[send-email-otp] Could not fetch logo, using URL fallback");
    }

    // Use CID if logo was fetched, otherwise use URL
    const emailLogoUrl = logoAttachment ? "cid:merilive-logo-cid" : logoUrl;
    const emailHTML = buildOTPEmailHTML(otp, purpose, emailLogoUrl);

    const subjectPrefix = purpose === "login" ? "Login" : 
                         purpose === "register" ? "Registration" :
                         purpose === "reset" ? "Password Reset" : "Verification";

    const subject = `[MeriLive] ${subjectPrefix} Code: ${otp}`;
    const textContent = `Your MeriLive ${subjectPrefix.toLowerCase()} code is: ${otp}. Valid for 5 minutes. Do not share this code.`;

    // Send via Gmail SMTP using nodemailer
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: gmailUser,
        pass: gmailAppPassword,
      },
    });

    const mailOptions: any = {
      from: `MeriLive <${gmailUser}>`,
      to: email,
      subject: subject,
      text: textContent,
      html: emailHTML,
    };

    if (logoAttachment) {
      mailOptions.attachments = [logoAttachment];
    }

    await transporter.sendMail(mailOptions);

    console.log(`[send-email-otp] ✅ OTP sent to ${email} via Gmail SMTP`);

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
