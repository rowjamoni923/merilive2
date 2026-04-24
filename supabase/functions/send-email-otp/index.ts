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

/**
 * INBOX-OPTIMIZED email template (Gmail Primary tab friendly)
 * Spam-prevention rules applied:
 *  - White background (no dark theme — Gmail flags dark HTML emails)
 *  - Single clean color accent (no heavy gradients)
 *  - Minimal emojis (max 0)
 *  - Balanced text/HTML ratio (plain text version included)
 *  - No suspicious words (Win, Free, Urgent, Click here, $$$)
 *  - Proper semantic structure with table layout
 *  - Real physical-style footer (improves trust)
 */
function buildOTPEmailHTML(otp: string, purpose: string): string {
  const purposeText =
    purpose === "login" ? "sign in to your account" :
    purpose === "register" ? "complete your registration" :
    purpose === "reset" ? "reset your password" :
    "verify your identity";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Your verification code</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;">

      <!-- Brand wordmark (text only, no images) -->
      <tr><td style="padding:28px 32px 8px 32px;text-align:center;border-bottom:1px solid #f3f4f6;">
        <div style="font-size:24px;font-weight:700;letter-spacing:1px;color:#7c3aed;">MeriLive</div>
      </td></tr>

      <!-- Body -->
      <tr><td style="padding:32px;">
        <p style="margin:0 0 16px 0;font-size:16px;color:#111827;">Hello,</p>
        <p style="margin:0 0 24px 0;font-size:14px;line-height:1.6;color:#4b5563;">
          Please use the verification code below to ${purposeText}. This code is valid for 5 minutes.
        </p>

        <!-- OTP block -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;">
          <tr><td align="center" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:24px;">
            <div style="font-size:12px;color:#6b7280;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;">Verification Code</div>
            <div style="font-size:32px;font-weight:700;letter-spacing:8px;color:#111827;font-family:'Courier New',Courier,monospace;">${otp}</div>
          </td></tr>
        </table>

        <p style="margin:0 0 16px 0;font-size:13px;line-height:1.6;color:#6b7280;">
          If you did not request this code, you can safely ignore this message. Someone may have entered your email address by mistake.
        </p>

        <p style="margin:24px 0 0 0;font-size:13px;color:#6b7280;">
          Thanks,<br>The MeriLive Team
        </p>
      </td></tr>

      <!-- Footer -->
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

function buildOTPEmailText(otp: string, purpose: string): string {
  const purposeText =
    purpose === "login" ? "sign in to your account" :
    purpose === "register" ? "complete your registration" :
    purpose === "reset" ? "reset your password" :
    "verify your identity";

  return `Hello,

Please use the verification code below to ${purposeText}.

Verification Code: ${otp}

This code is valid for 5 minutes.

If you did not request this code, you can safely ignore this message.

Thanks,
The MeriLive Team

---
This is an automated message. Please do not reply.
© ${new Date().getFullYear()} MeriLive. All rights reserved.`;
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

    const gmailUser = Deno.env.get("GMAIL_USER")?.trim().toLowerCase();
    const gmailAppPassword = Deno.env.get("GMAIL_APP_PASSWORD")?.replace(/\s+/g, "").trim();
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

    const { data: rateLimitOk } = await supabase.rpc("check_otp_rate_limit", {
      p_email: email.toLowerCase(),
    });

    if (!rateLimitOk) {
      return new Response(
        JSON.stringify({ success: false, error: "Too many requests. Please try again after 10 minutes." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

    const emailHTML = buildOTPEmailHTML(otp, purpose);
    const textContent = buildOTPEmailText(otp, purpose);

    // INBOX-FRIENDLY subject (no OTP digits, no brackets, no spam-trigger words)
    const subject =
      purpose === "login" ? "Your MeriLive sign-in code" :
      purpose === "register" ? "Confirm your MeriLive account" :
      purpose === "reset" ? "Reset your MeriLive password" :
      "Your MeriLive verification code";

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: gmailUser, pass: gmailAppPassword },
      tls: { rejectUnauthorized: true },
    });

    try {
      await transporter.verify();
      console.log(`[send-email-otp] SMTP verified for ${gmailUser}`);
    } catch (verifyErr: any) {
      console.error("[send-email-otp] SMTP verify FAILED:", verifyErr?.message || verifyErr);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Gmail SMTP authentication failed. Check GMAIL_USER and GMAIL_APP_PASSWORD secrets.",
          detail: verifyErr?.message || String(verifyErr),
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    try {
      // Generate a deterministic Message-ID with our domain to improve deliverability
      const messageId = `<${crypto.randomUUID()}@merilive.app>`;
      const dateHeader = new Date().toUTCString();

      const info = await transporter.sendMail({
        from: `MeriLive <${gmailUser}>`,
        to: email,
        replyTo: gmailUser,
        sender: gmailUser,
        subject,
        text: textContent,
        html: emailHTML,
        messageId,
        date: dateHeader,
        // Inbox-friendly headers — REMOVED X-Priority/Importance:High
        // (those flags actually HURT deliverability for transactional mail)
        headers: {
          "List-Unsubscribe": `<mailto:${gmailUser}?subject=unsubscribe>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          "X-Entity-Ref-ID": crypto.randomUUID(),
          "X-Mailer": "MeriLive Transactional",
          "Auto-Submitted": "auto-generated",
          "Precedence": "transactional",
        },
      });

      console.log(`[send-email-otp] OTP sent to ${email} | messageId=${info.messageId} | accepted=${JSON.stringify(info.accepted)} | rejected=${JSON.stringify(info.rejected)}`);

      return new Response(
        JSON.stringify({
          success: true,
          message: "OTP sent successfully",
          messageId: info.messageId,
          accepted: info.accepted,
          rejected: info.rejected,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (sendErr: any) {
      console.error("[send-email-otp] Gmail SMTP sendMail FAILED:", sendErr?.message || sendErr);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Gmail rejected the message",
          detail: sendErr?.message || String(sendErr),
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error) {
    console.error("[send-email-otp] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Failed to send email", detail: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
