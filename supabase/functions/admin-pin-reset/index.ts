// Owner Vault PIN — request reset OTP via email
// Calls SECURITY DEFINER RPC `admin_pin_request_reset()` and emails the OTP to the active owner.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import nodemailer from "npm:nodemailer@6.9.12";
import { requireAdminSession } from "../_shared/adminAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!user || !domain) return email;
  const visible = user.slice(0, 2);
  return `${visible}${"•".repeat(Math.max(2, user.length - 2))}@${domain}`;
}

function buildHTML(otp: string): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:32px 16px;"><tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;">
<tr><td style="padding:28px 32px 8px 32px;text-align:center;border-bottom:1px solid #f3f4f6;">
<div style="font-size:24px;font-weight:700;letter-spacing:1px;color:#7c3aed;">MeriLive</div>
<div style="font-size:11px;color:#9ca3af;letter-spacing:2px;text-transform:uppercase;margin-top:4px;">Vault PIN Reset</div>
</td></tr>
<tr><td style="padding:32px;">
<p style="margin:0 0 16px 0;font-size:16px;color:#111827;">Hello Owner,</p>
<p style="margin:0 0 24px 0;font-size:14px;line-height:1.6;color:#4b5563;">
Use the code below to reset your admin Vault PIN. This code is valid for 10 minutes.
</p>
<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;"><tr><td align="center"
style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:24px;">
<div style="font-size:12px;color:#6b7280;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;">Reset Code</div>
<div style="font-size:32px;font-weight:700;letter-spacing:8px;color:#111827;font-family:'Courier New',Courier,monospace;">${otp}</div>
</td></tr></table>
<p style="margin:0 0 16px 0;font-size:13px;line-height:1.6;color:#6b7280;">
If you did not request this, ignore this email. Your PIN will remain unchanged.
</p>
<p style="margin:24px 0 0 0;font-size:13px;color:#6b7280;">— MeriLive Security Team</p>
</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #f3f4f6;background:#fafafa;border-radius:0 0 8px 8px;">
<p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;">This is an automated message. Please do not reply.</p>
</td></tr></table></td></tr></table></body></html>`;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  try {
    const adminToken = req.headers.get("x-admin-token") || "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { "x-admin-token": adminToken } } },
    );

    const auth = await requireAdminSession(req, supabase, { ownerOnly: true });
    if (!auth.ok) {
      return json({ success: false, error: auth.error }, auth.status);
    }

    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }
    if (body?.action === "confirm") {
      const otp = typeof body?.otp === "string" ? body.otp.trim() : "";
      const newPin = typeof body?.new_pin === "string" ? body.new_pin.trim() : "";
      if (!/^\d{6}$/.test(otp) || !/^\d{6}$/.test(newPin)) {
        return json({ success: false, error: "OTP and PIN must be exactly 6 digits" }, 400);
      }
      const { data: resetResult, error: resetError } = await supabase.rpc("admin_pin_reset_with_otp", {
        _otp: otp,
        _new_pin: newPin,
      });
      if (resetError) throw resetError;
      const result = resetResult as any;
      return json(result, result?.success ? 200 : 400);
    }

    const { data, error } = await supabase.rpc("admin_pin_request_reset");
    if (error) throw error;
    const result = data as any;
    if (!result?.success) {
      return json({ success: false, error: result?.error || "Failed" }, 400);
    }

    const ownerEmail: string = result.email;
    const otp: string = result.otp_plain;

    const gmailUser = Deno.env.get("GMAIL_USER");
    const gmailAppPassword = Deno.env.get("GMAIL_APP_PASSWORD");

    if (!gmailUser || !gmailAppPassword) {
      return json({ success: false, error: "Email service not configured" }, 500);
    }

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: gmailUser, pass: gmailAppPassword },
    });
    await transporter.verify();
    await transporter.sendMail({
      from: `MeriLive Security <${gmailUser}>`,
      to: ownerEmail,
      replyTo: gmailUser,
      subject: "Your MeriLive Vault PIN reset code",
      text: `Your Vault PIN reset code is: ${otp}\n\nThis code is valid for 10 minutes.`,
      html: buildHTML(otp),
      headers: {
        "X-Entity-Ref-ID": crypto.randomUUID(),
        "Auto-Submitted": "auto-generated",
        Precedence: "transactional",
      },
    });

    return json({ success: true, masked_email: maskEmail(ownerEmail) }, 200);
  } catch (err: any) {
    console.error("[admin-pin-reset] error:", err);
    return json({ success: false, error: "Internal error" }, 500);
  }
});
