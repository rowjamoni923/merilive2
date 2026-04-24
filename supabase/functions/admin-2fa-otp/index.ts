import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import nodemailer from "npm:nodemailer@6.9.12";

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

function buildAdminOTPEmailHTML(otp: string): string {
  const otpDigits = otp
    .split("")
    .map(
      (d) =>
        `<td style="width:46px;height:56px;background:linear-gradient(145deg,#1a1033,#2a1454);border-radius:12px;text-align:center;vertical-align:middle;border:1px solid rgba(168,85,247,0.45);box-shadow:0 6px 18px rgba(124,58,237,0.25),inset 0 1px 0 rgba(255,255,255,0.08);"><span style="font-size:28px;font-weight:800;color:#e9d5ff;font-family:'Courier New',monospace;letter-spacing:1px;">${d}</span></td>`
    )
    .join('<td style="width:8px;"></td>');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#07060f;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#07060f;padding:44px 0;">
<tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" style="border-radius:22px;overflow:hidden;box-shadow:0 0 80px rgba(168,85,247,0.18),0 24px 60px rgba(0,0,0,0.55);">
  <tr><td style="background:linear-gradient(135deg,#1a0b3d 0%,#3b0764 50%,#1a0b3d 100%);padding:42px 40px 30px;text-align:center;border-bottom:1px solid rgba(168,85,247,0.22);">
    <!-- Premium MeriLive wordmark (no logo image) -->
    <div style="display:inline-block;padding:6px 22px;background:linear-gradient(135deg,rgba(168,85,247,0.12),rgba(236,72,153,0.10));border:1px solid rgba(168,85,247,0.28);border-radius:999px;margin-bottom:18px;">
      <span style="color:#c4b5fd;font-size:10px;font-weight:700;letter-spacing:4px;text-transform:uppercase;">Admin Control Center</span>
    </div>
    <h1 style="margin:0;font-size:38px;font-weight:800;letter-spacing:3px;line-height:1;background:linear-gradient(90deg,#a855f7 0%,#ec4899 50%,#f59e0b 100%);-webkit-background-clip:text;background-clip:text;color:transparent;">
      MERI<span style="font-weight:300;">LIVE</span>
    </h1>
    <div style="margin:14px auto 0;width:80px;height:3px;background:linear-gradient(90deg,transparent,#a855f7,#ec4899,#a855f7,transparent);border-radius:2px;"></div>
    <p style="margin:14px 0 0;color:rgba(196,181,253,0.85);font-size:12px;font-weight:600;letter-spacing:3px;text-transform:uppercase;">🛡️ 2FA Verification</p>
  </td></tr>
  <tr><td style="background:linear-gradient(180deg,#13101f 0%,#0a0814 100%);padding:38px 40px;">
    <p style="margin:0 0 8px;color:#f1f5f9;font-size:17px;font-weight:600;">Owner Login Verification</p>
    <p style="margin:0 0 28px;color:#94a3b8;font-size:13px;line-height:1.6;">Use the secure code below to complete your admin panel login. This code is sensitive — keep it private.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
      <tr><td style="background:linear-gradient(145deg,#1e1b4b,#0f0a1e);border-radius:18px;padding:28px 20px;text-align:center;border:1px solid rgba(168,85,247,0.3);">
        <p style="margin:0 0 14px;color:#a855f7;font-size:11px;font-weight:700;letter-spacing:5px;text-transform:uppercase;">Your 6-Digit Code</p>
        <table cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr>${otpDigits}</tr></table>
      </td></tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
      <tr><td style="background:linear-gradient(135deg,rgba(245,158,11,0.10),rgba(236,72,153,0.06));border-radius:12px;padding:14px 18px;border-left:3px solid #f59e0b;">
        <p style="margin:0;color:#fcd34d;font-size:13px;font-weight:600;">⏱️ Expires in 5 minutes</p>
      </td></tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="background:rgba(239,68,68,0.07);border-radius:10px;padding:14px 18px;border:1px solid rgba(239,68,68,0.15);">
        <p style="margin:0;color:#fca5a5;font-size:12px;line-height:1.5;">🚨 If you did not attempt to login, your password may be compromised. Change it immediately.</p>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="background:#07060f;padding:22px 40px;text-align:center;border-top:1px solid rgba(168,85,247,0.12);">
    <p style="margin:0;color:#475569;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;">© ${new Date().getFullYear()} MeriLive · Admin Console</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
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

      // Send via Gmail SMTP (same path as user app)
      let emailSent = false;
      let emailError: string | null = null;
      let smtpDetail: string | null = null;
      if (gmailUser && gmailAppPassword) {
        try {
          const transporter = nodemailer.createTransport({
            host: "smtp.gmail.com",
            port: 465,
            secure: true,
            auth: { user: gmailUser, pass: gmailAppPassword },
            tls: { rejectUnauthorized: true },
          });

          // Verify connection first
          await transporter.verify();
          console.log(`[admin-2fa-otp] ✅ SMTP verified for ${gmailUser}`);

          const info = await transporter.sendMail({
            from: `MeriLive Admin <${gmailUser}>`,
            to: normalizedEmail,
            replyTo: gmailUser,
            subject: `[MeriLive Admin] 2FA Code: ${otpCode}`,
            text: `Your MeriLive Admin 2FA code is: ${otpCode}. Valid for 5 minutes. Do not share.`,
            html: buildAdminOTPEmailHTML(otpCode),
            headers: {
              "X-Priority": "1",
              "X-MSMail-Priority": "High",
              "Importance": "High",
            },
          });
          emailSent = (info.accepted?.length ?? 0) > 0;
          smtpDetail = `messageId=${info.messageId} accepted=${JSON.stringify(info.accepted)} rejected=${JSON.stringify(info.rejected)} response=${info.response}`;
          console.log(`[admin-2fa-otp] ✅ OTP sent to ${normalizedEmail} | ${smtpDetail}`);
        } catch (emailErr: any) {
          emailError = emailErr?.message || String(emailErr);
          console.error("[admin-2fa-otp] ❌ Gmail SMTP send failed:", emailError);
        }
      } else {
        emailError = "GMAIL_USER or GMAIL_APP_PASSWORD missing";
        console.error("[admin-2fa-otp] Gmail SMTP credentials missing");
      }

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
