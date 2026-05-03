import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import nodemailer from "npm:nodemailer@6.9.12";
import { buildOtpEmailHTML } from "../_shared/otp-email-template.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface VerificationEmailRequest {
  email: string;
  code: string;
  agencyName: string;
  type: 'email' | 'app';
}

// ===== Gmail SMTP only =====
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
    console.error("Gmail SMTP error:", e?.message || e);
    return { success: false, error: e?.message || String(e) };
  }
}

async function sendEmailWithFallback(to: string, subject: string, html: string): Promise<{ success: boolean; provider: string; errors: string[] }> {
  console.log("Sending via Gmail SMTP...");
  const result = await sendWithGmail(to, subject, html);
  if (result.success) {
    return { success: true, provider: "Gmail", errors: [] };
  }
  return { success: false, provider: "none", errors: [`Gmail: ${result.error}`] };
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, code, agencyName, type }: VerificationEmailRequest = await req.json();
    console.log(`Sending ${type} verification email to ${email} with code ${code}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "https://ayjdlvuurscxucatbbah.supabase.co";
    const logoUrl = `${supabaseUrl}/storage/v1/object/public/app-assets/merilive-logo.png`;

    const subject = type === 'email' 
      ? `[MeriLive] ${agencyName} - Email Verification Code`
      : `[MeriLive] ${agencyName} - App Verification Code`;

    const verifyType = type === 'email' ? 'Email Verification' : 'App Verification';

    const otpDigits = code.split("").map((d: string) => 
      `<td style="width:44px;height:52px;background:linear-gradient(145deg,#1a1a2e,#16213e);border-radius:10px;text-align:center;vertical-align:middle;border:1px solid rgba(124,58,237,0.3);box-shadow:0 4px 15px rgba(124,58,237,0.15),inset 0 1px 0 rgba(255,255,255,0.05);"><span style="font-size:26px;font-weight:800;color:#e0b3ff;font-family:'Courier New',monospace;">${d}</span></td>`
    ).join('<td style="width:8px;"></td>');

    const html = `
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
    <p style="margin:0 0 28px;color:#94a3b8;font-size:14px;line-height:1.6;">You are registering as <strong style="color:#a78bfa;">${agencyName}</strong> agency. Use the code below to complete your ${verifyType.toLowerCase()}.</p>

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
            <p style="margin:0;color:#c4b5fd;font-size:13px;font-weight:600;">Expires in 60 seconds</p>
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

    const result = await sendEmailWithFallback(email, subject, html);

    if (!result.success) {
      console.error("All email providers failed:", result.errors);
      return new Response(
        JSON.stringify({ success: false, error: "All email providers failed", details: result.errors }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, provider: result.provider }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error sending verification email:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
