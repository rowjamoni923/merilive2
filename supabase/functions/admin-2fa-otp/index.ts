import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import nodemailer from "npm:nodemailer@6.9.12";
import { buildOtpEmailHTML, buildOtpEmailText } from "../_shared/otp-email-template.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface TwoFARequest {
  email: string;
  action: "send" | "verify";
  otp?: string;
}

const generateOTP = (): string => {
  const digits = "0123456789";
  const arr = new Uint8Array(6);
  crypto.getRandomValues(arr);
  let otp = "";
  for (let i = 0; i < 6; i++) otp += digits[arr[i] % 10];
  return otp;
};

/**
 * INBOX-OPTIMIZED admin 2FA email (Gmail Primary tab friendly)
 * Same spam-prevention rules as user OTP — white bg, no heavy gradients,
 * no OTP in subject, proper plain-text alternative, transactional headers.
 */
function buildAdminOTPEmailHTML(otp: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Your admin verification code</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;">
      <tr><td style="padding:28px 32px 8px 32px;text-align:center;border-bottom:1px solid #f3f4f6;">
        <div style="font-size:24px;font-weight:700;letter-spacing:1px;color:#7c3aed;">MeriLive</div>
        <div style="font-size:11px;color:#9ca3af;letter-spacing:2px;text-transform:uppercase;margin-top:4px;">Admin Console</div>
      </td></tr>
      <tr><td style="padding:32px;">
        <p style="margin:0 0 16px 0;font-size:16px;color:#111827;">Hello,</p>
        <p style="margin:0 0 24px 0;font-size:14px;line-height:1.6;color:#4b5563;">
          Please use the verification code below to complete your admin sign-in. This code is valid for 5 minutes.
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;">
          <tr><td align="center" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:24px;">
            <div style="font-size:12px;color:#6b7280;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;">Admin Verification Code</div>
            <div style="font-size:32px;font-weight:700;letter-spacing:8px;color:#111827;font-family:'Courier New',Courier,monospace;">${otp}</div>
          </td></tr>
        </table>
        <p style="margin:0 0 16px 0;font-size:13px;line-height:1.6;color:#6b7280;">
          If you did not attempt to sign in to the admin console, please secure your account immediately.
        </p>
        <p style="margin:24px 0 0 0;font-size:13px;color:#6b7280;">
          Thanks,<br>The MeriLive Security Team
        </p>
      </td></tr>
      <tr><td style="padding:20px 32px;border-top:1px solid #f3f4f6;background:#fafafa;border-radius:0 0 8px 8px;">
        <p style="margin:0 0 4px 0;font-size:11px;color:#9ca3af;text-align:center;">
          This is an automated message. Please do not reply to this email.
        </p>
        <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;">
          &copy; ${new Date().getFullYear()} MeriLive. All rights reserved.
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function buildAdminOTPEmailText(otp: string): string {
  return `Hello,

Please use the verification code below to complete your admin sign-in.

Admin Verification Code: ${otp}

This code is valid for 5 minutes.

If you did not attempt to sign in, please secure your account immediately.

Thanks,
The MeriLive Security Team

---
This is an automated message. Please do not reply.
© ${new Date().getFullYear()} MeriLive. All rights reserved.`;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const gmailUser = Deno.env.get("GMAIL_USER");
    const gmailAppPassword = Deno.env.get("GMAIL_APP_PASSWORD");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { email, action, otp }: TwoFARequest = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    if (action === "send") {
      // Rate limit: max 1 OTP per 60 seconds
      const { data: recentOtp } = await supabase
        .from("admin_login_otps")
        .select("created_at")
        .eq("email", normalizedEmail)
        .eq("is_used", false)
        .gt("created_at", new Date(Date.now() - 60000).toISOString())
        .maybeSingle();

      if (recentOtp) {
        return new Response(
          JSON.stringify({ error: "Please wait 60 seconds before requesting a new OTP" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const otpCode = generateOTP();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

      // Delete existing unused OTPs
      await supabase
        .from("admin_login_otps")
        .delete()
        .eq("email", normalizedEmail);

      // Store new OTP
      const { error: insertError } = await supabase
        .from("admin_login_otps")
        .insert({
          email: normalizedEmail,
          otp_code: otpCode,
          expires_at: expiresAt.toISOString(),
        });

      if (insertError) {
        console.error("[admin-2fa-otp] Insert error:", insertError);
        return new Response(
          JSON.stringify({ error: "Failed to generate OTP" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Send via Gmail SMTP only
      let emailSent = false;
      let emailError: string | null = null;
      let smtpDetail: string | null = null;
      let usedProvider: string | null = null;

      const subject = "Your MeriLive admin sign-in code";
      const htmlBody = buildAdminOTPEmailHTML(otpCode);
      const textBody = buildAdminOTPEmailText(otpCode);

      if (gmailUser && gmailAppPassword) {
        try {
          const transporter = nodemailer.createTransport({
            host: "smtp.gmail.com",
            port: 465,
            secure: true,
            auth: { user: gmailUser, pass: gmailAppPassword },
            tls: { rejectUnauthorized: true },
          });
          await transporter.verify();
          const messageId = `<${crypto.randomUUID()}@merilive.app>`;
          const info = await transporter.sendMail({
            from: `MeriLive Admin <${gmailUser}>`,
            to: normalizedEmail,
            replyTo: gmailUser,
            sender: gmailUser,
            subject,
            text: textBody,
            html: htmlBody,
            messageId,
            date: new Date().toUTCString(),
            headers: {
              "List-Unsubscribe": `<mailto:${gmailUser}?subject=unsubscribe>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
              "X-Entity-Ref-ID": crypto.randomUUID(),
              "X-Mailer": "MeriLive Transactional",
              "Auto-Submitted": "auto-generated",
              "Precedence": "transactional",
            },
          });
          emailSent = (info.accepted?.length ?? 0) > 0;
          if (emailSent) {
            usedProvider = "gmail-smtp";
            smtpDetail = `messageId=${info.messageId} response=${info.response}`;
            console.log(`[admin-2fa-otp] ✅ Sent via Gmail to ${normalizedEmail}`);
          }
        } catch (emailErr: any) {
          emailError = emailErr?.message || String(emailErr);
          console.error("[admin-2fa-otp] ❌ Gmail send failed:", emailError);
        }
      } else {
        emailError = "GMAIL_USER or GMAIL_APP_PASSWORD not configured";
        console.error("[admin-2fa-otp] ❌", emailError);
      }

      smtpDetail = smtpDetail || `provider=${usedProvider || "none"}`;

      return new Response(
        JSON.stringify({
          success: true,
          email_sent: emailSent,
          message: emailSent
            ? "Verification code sent to your email"
            : "Email service unavailable. Please try again or contact support.",
          error_detail: emailError,
          smtp_detail: smtpDetail,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } else if (action === "verify") {
      if (!otp || otp.length !== 6) {
        return new Response(
          JSON.stringify({ error: "Valid 6-digit OTP is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: otpRecord, error: findError } = await supabase
        .from("admin_login_otps")
        .select("*")
        .eq("email", normalizedEmail)
        .eq("otp_code", otp)
        .eq("is_used", false)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (findError || !otpRecord) {
        console.warn(`[admin-2fa-otp] Failed verification for ${normalizedEmail}`);
        return new Response(
          JSON.stringify({ error: "Invalid or expired verification code" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await supabase
        .from("admin_login_otps")
        .update({ is_used: true })
        .eq("id", otpRecord.id);

      console.log(`[admin-2fa-otp] OTP verified for ${normalizedEmail}`);

      return new Response(
        JSON.stringify({ success: true, verified: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[admin-2fa-otp] Error:", error);
    return new Response(
      JSON.stringify({ error: error?.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
