// Shared helper: send OTP via the verified Lovable Email sender domain.
// Replaces direct Gmail SMTP and avoids blocking Auth UI on provider latency.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import nodemailer from "npm:nodemailer@6.9.12";

export interface SendOtpEmailArgs {
  to: string;
  otp: string;
  // Template label key — any string. Known labels render branded copy
  // (login, register/account_signup, account_email, reset/password_reset,
  // admin/admin_login/admin_2fa/two_factor, admin_forgot/admin_password_reset,
  // agency/agency_signup, sub_agency_signup). Unknown values render the
  // generic verification copy.
  purpose: string;
  expiryMinutes?: number;
  idempotencyKey?: string;
}

type SendOtpEmailResult = {
  success: boolean;
  error?: string;
  code?: string;
  status?: number;
  provider?: "lovable-email" | "gmail-smtp";
};

let cachedGmailTransporter: any = null;

function getGmailTransporter() {
  if (cachedGmailTransporter) return cachedGmailTransporter;
  const gmailUser = (Deno.env.get("GMAIL_USER") ?? "").trim();
  const gmailPass = (Deno.env.get("GMAIL_APP_PASSWORD") ?? "").replace(/\s+/g, "");
  if (!gmailUser || !gmailPass) return null;

  cachedGmailTransporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: gmailUser, pass: gmailPass },
    pool: true,
    maxConnections: 2,
    maxMessages: 50,
  });
  return cachedGmailTransporter;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function purposeLabel(purpose: string): string {
  switch (purpose) {
    case "login": return "Sign-In Verification";
    case "register":
    case "account_signup": return "Account Sign Up";
    case "account_email": return "Email Verification";
    case "reset":
    case "password_reset": return "Password Reset";
    case "admin":
    case "admin_login":
    case "admin_2fa":
    case "two_factor": return "Admin Verification";
    case "admin_forgot":
    case "admin_password_reset": return "Admin Password Reset";
    case "agency":
    case "agency_signup": return "Agency Sign Up";
    case "sub_agency_signup": return "Sub-Agency Sign Up";
    default: return "Identity Verification";
  }
}

function buildOtpHtml(otp: string, purpose: string, expiryMinutes: number): string {
  const safeOtp = escapeHtml(otp);
  const safeLabel = escapeHtml(purposeLabel(purpose));
  const digits = safeOtp.split("").map((digit) => `
    <td style="width:42px;height:48px;text-align:center;border:1px solid #ead78f;border-radius:12px;background:#fff8dc;font-size:26px;font-weight:800;color:#111827;font-family:Arial,Helvetica,sans-serif;">${digit}</td>
  `).join('<td style="width:8px"></td>');

  return `<!doctype html>
  <html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#111827;">
    <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
      <div style="border:1px solid #ece6d3;border-radius:20px;overflow:hidden;box-shadow:0 8px 32px rgba(15,12,41,.08);">
        <div style="background:#111827;padding:30px 24px;text-align:center;">
          <div style="font-size:28px;font-weight:800;letter-spacing:4px;color:#ffffff;line-height:1;">MERI<span style="color:#f5d472;">LIVE</span></div>
          <div style="margin-top:10px;font-size:11px;font-weight:700;letter-spacing:3px;color:#c9b079;text-transform:uppercase;">Premium Live Streaming</div>
        </div>
        <div style="padding:32px 28px;background:#ffffff;">
          <div style="display:inline-block;margin-bottom:14px;padding:6px 14px;border:1px solid #f0d97a;border-radius:999px;background:#fff7d6;color:#7a5a16;font-size:11px;font-weight:800;letter-spacing:2px;text-transform:uppercase;">${safeLabel}</div>
          <h1 style="margin:6px 0 12px;font-size:24px;line-height:1.25;color:#111827;">Your Verification Code</h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4b5563;">Hello, use the code below to complete your MeriLive verification.</p>
          <table role="presentation" style="margin:8px 0 18px;width:100%;background:#fffdf3;border-radius:16px;padding:18px 8px;"><tr>${digits}</tr></table>
          <p style="margin:0 0 18px;font-size:14px;color:#6b7280;">This code expires in <strong>${expiryMinutes} minutes</strong>.</p>
          <div style="border-left:4px solid #f5d472;background:#fffbeb;padding:14px 16px;border-radius:12px;">
            <p style="margin:0 0 6px;font-weight:800;color:#111827;font-size:13px;">Security Notice</p>
            <p style="margin:0;color:#4b5563;font-size:13px;line-height:1.5;">MeriLive staff will never ask for this code. If you did not request it, you can safely ignore this email.</p>
          </div>
        </div>
      </div>
    </div>
  </body></html>`;
}

async function sendOtpViaGmail(args: SendOtpEmailArgs, supabase: any, sourceError?: string): Promise<SendOtpEmailResult> {
  const transporter = getGmailTransporter();
  const gmailUser = (Deno.env.get("GMAIL_USER") ?? "").trim();
  if (!transporter || !gmailUser) {
    return { success: false, error: "Fallback email service is not configured", code: "OTP_FALLBACK_NOT_CONFIGURED", status: 503 };
  }

  const messageId = crypto.randomUUID();
  const expiryMinutes = args.expiryMinutes ?? 5;
  const subject = `Your MeriLive ${purposeLabel(args.purpose)} code`;
  const text = `Your MeriLive verification code is: ${args.otp}\n\nThis code expires in ${expiryMinutes} minutes. MeriLive staff will never ask for this code.`;

  try {
    await supabase.from("email_send_log").insert({
      message_id: messageId,
      template_name: "otp-code",
      recipient_email: args.to,
      status: "pending",
      metadata: { provider: "gmail-smtp", fallback_from: sourceError ?? null },
    });

    await transporter.sendMail({
      from: `MeriLive Security <${gmailUser}>`,
      to: args.to,
      replyTo: gmailUser,
      subject,
      text,
      html: buildOtpHtml(args.otp, args.purpose, expiryMinutes),
      headers: {
        "X-Entity-Ref-ID": messageId,
        "Auto-Submitted": "auto-generated",
        Precedence: "transactional",
      },
    });

    await supabase.from("email_send_log").insert({
      message_id: messageId,
      template_name: "otp-code",
      recipient_email: args.to,
      status: "sent",
      metadata: { provider: "gmail-smtp", fallback_from: sourceError ?? null },
    });

    return { success: true, provider: "gmail-smtp" };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[sendOtpEmail] Gmail fallback failed:", error);
    await supabase.from("email_send_log").insert({
      message_id: messageId,
      template_name: "otp-code",
      recipient_email: args.to,
      status: "failed",
      error_message: "OTP_GMAIL_FALLBACK_FAILED",
      metadata: { provider: "gmail-smtp", error, fallback_from: sourceError ?? null },
    });
    return { success: false, error, code: "OTP_GMAIL_FALLBACK_FAILED", status: 503 };
  }
}

export async function sendOtpEmail(args: SendOtpEmailArgs): Promise<SendOtpEmailResult> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return { success: false, error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" };
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const idempotencyKey = args.idempotencyKey ?? `otp-${args.purpose}-${args.to.toLowerCase()}-${args.otp}`;

  // OTP emails should bypass any prior unsubscribe (auth-critical).
  // Clear suppression for this address before sending.
  try {
    await supabase
      .from("suppressed_emails")
      .delete()
      .eq("email", args.to.toLowerCase());
  } catch (_e) {
    // non-fatal
  }

  // Call send-transactional-email directly via fetch with explicit
  // service-role Authorization. functions.invoke can mangle the JWT
  // header in cross-function calls (UNAUTHORIZED_INVALID_JWT_FORMAT).
  try {
    const resp = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
      body: JSON.stringify({
        templateName: "otp-code",
        recipientEmail: args.to,
        idempotencyKey,
        templateData: {
          otp: args.otp,
          purpose: args.purpose,
          expiryMinutes: args.expiryMinutes ?? 5,
        },
      }),
    });

    const text = await resp.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { /* non-json */ }

    if (!resp.ok) {
      console.error("[sendOtpEmail] HTTP", resp.status, text);
      return await sendOtpViaGmail(args, supabase, data?.code || `HTTP_${resp.status}`);
    }
    if (data && data.error) {
      console.error("[sendOtpEmail] response error:", data.error);
      return await sendOtpViaGmail(args, supabase, data?.code || data.error);
    }
    return { success: true, provider: "lovable-email" };
  } catch (e) {
    console.error("[sendOtpEmail] fetch error:", e);
    return await sendOtpViaGmail(args, supabase, e instanceof Error ? e.message : String(e));
  }
}
