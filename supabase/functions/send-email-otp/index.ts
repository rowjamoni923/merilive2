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

function normalizeSecret(value?: string | null): string {
  return (value ?? "")
    .trim()
    .replace(/\r?\n/g, "")
    .replace(/^['\"]|['\"]$/g, "");
}

async function getGmailOAuthAccessToken() {
  const clientId = normalizeSecret(Deno.env.get("GMAIL_CLIENT_ID"));
  const clientSecret = normalizeSecret(Deno.env.get("GMAIL_CLIENT_SECRET"));
  const refreshToken = normalizeSecret(Deno.env.get("GMAIL_REFRESH_TOKEN"));

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Gmail OAuth credentials not configured");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("[send-email-otp] OAuth token refresh failed:", errText);
    throw new Error(errText || `OAuth token refresh failed (${response.status})`);
  }

  const data = await response.json();
  if (!data?.access_token) {
    throw new Error("OAuth token refresh did not return an access token");
  }

  return {
    accessToken: data.access_token as string,
    clientId,
    clientSecret,
    refreshToken,
  };
}

async function sendMailWithFallback(options: {
  gmailUser: string;
  gmailAppPassword: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}) {
  const { gmailUser, gmailAppPassword, to, subject, text, html } = options;
  const authErrors: string[] = [];
  const messageId = `<${crypto.randomUUID()}@merilive.app>`;
  const dateHeader = new Date().toUTCString();

  const baseMailOptions = {
    from: `MeriLive <${gmailUser}>`,
    to,
    replyTo: gmailUser,
    sender: gmailUser,
    subject,
    text,
    html,
    messageId,
    date: dateHeader,
    headers: {
      "List-Unsubscribe": `<mailto:${gmailUser}?subject=unsubscribe>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      "X-Entity-Ref-ID": crypto.randomUUID(),
      "X-Mailer": "MeriLive Transactional",
      "Auto-Submitted": "auto-generated",
      "Precedence": "transactional",
    },
  };

  if (gmailUser && gmailAppPassword) {
    try {
      const appPasswordTransport = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: { user: gmailUser, pass: gmailAppPassword },
        tls: { rejectUnauthorized: true },
      });

      const info = await appPasswordTransport.sendMail(baseMailOptions);
      return { success: true, authMethod: "app_password", info };
    } catch (error: any) {
      const message = error?.message || String(error);
      authErrors.push(`App password auth failed: ${message}`);
      console.error("[send-email-otp] App password send failed:", message);
    }
  }

  if (gmailUser) {
    try {
      const oauth = await getGmailOAuthAccessToken();
      const oauthTransport = nodemailer.createTransport({
        service: "gmail",
        auth: {
          type: "OAuth2",
          user: gmailUser,
          clientId: oauth.clientId,
          clientSecret: oauth.clientSecret,
          refreshToken: oauth.refreshToken,
          accessToken: oauth.accessToken,
        },
      });

      const info = await oauthTransport.sendMail(baseMailOptions);
      return { success: true, authMethod: "oauth2", info };
    } catch (error: any) {
      const message = error?.message || String(error);
      authErrors.push(`OAuth2 auth failed: ${message}`);
      console.error("[send-email-otp] OAuth2 send failed:", message);
    }
  }

  if (!gmailUser) {
    authErrors.push("GMAIL_USER is not configured");
  }

  if (!gmailAppPassword) {
    authErrors.push("GMAIL_APP_PASSWORD is empty or invalid");
  }

  return {
    success: false,
    error:
      authErrors[0] ||
      "Email service is not configured correctly. Gmail authentication failed.",
    detail: authErrors.join(" | "),
  };
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
    purpose === "login" ? "sign in to your MeriLive account" :
    purpose === "register" ? "complete your MeriLive registration" :
    purpose === "reset" ? "reset your MeriLive password" :
    "verify your MeriLive identity";

  const headline =
    purpose === "login" ? "Sign-In Verification" :
    purpose === "register" ? "Welcome to MeriLive" :
    purpose === "reset" ? "Password Reset" :
    "Identity Verification";

  const digits = otp.split("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>Your MeriLive verification code</title>
</head>
<body style="margin:0;padding:0;background:#f4f1ec;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;">
<div style="display:none;max-height:0;overflow:hidden;">Your MeriLive verification code is ${otp}. Valid for 5 minutes.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f1ec;padding:40px 16px;">
  <tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.06);overflow:hidden;">
      <tr><td style="background:linear-gradient(135deg,#1a0b2e 0%,#3d1f5c 50%,#1a0b2e 100%);padding:40px 32px;text-align:center;">
        <div style="font-size:13px;font-weight:600;letter-spacing:4px;color:#d4af37;text-transform:uppercase;margin-bottom:12px;">✦ MeriLive ✦</div>
        <div style="font-size:28px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;margin:0;">${headline}</div>
        <div style="width:60px;height:3px;background:linear-gradient(90deg,transparent,#d4af37,transparent);margin:16px auto 0;"></div>
      </td></tr>
      <tr><td style="padding:40px 40px 24px 40px;">
        <p style="margin:0 0 12px 0;font-size:17px;font-weight:600;color:#1a1a1a;">Hello,</p>
        <p style="margin:0 0 32px 0;font-size:15px;line-height:1.6;color:#555555;">
          Use the verification code below to ${purposeText}. For your security, this code will expire in <strong style="color:#1a0b2e;">5 minutes</strong>.
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px 0;">
          <tr><td align="center" style="background:linear-gradient(135deg,#faf8f3 0%,#ffffff 100%);border:1px solid #e8e3d8;border-radius:12px;padding:32px 16px;">
            <div style="font-size:11px;font-weight:600;color:#8b7355;letter-spacing:3px;text-transform:uppercase;margin-bottom:20px;">Verification Code</div>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>
              ${digits.map((d) => `<td style="padding:0 4px;"><div style="display:inline-block;width:44px;height:56px;line-height:56px;background:#ffffff;border:2px solid #d4af37;border-radius:10px;font-size:28px;font-weight:700;color:#1a0b2e;font-family:'SF Mono','Courier New',Courier,monospace;text-align:center;box-shadow:0 2px 8px rgba(212,175,55,0.15);">${d}</div></td>`).join("")}
            </tr></table>
            <div style="margin-top:18px;font-size:12px;color:#8b7355;">⏱ Expires in 5 minutes</div>
          </td></tr>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;">
          <tr><td style="background:#fdf6e3;border-left:3px solid #d4af37;padding:14px 18px;border-radius:6px;">
            <p style="margin:0;font-size:13px;line-height:1.5;color:#6b5b3a;">
              <strong>🔒 Security tip:</strong> MeriLive will never ask for this code. Do not share it with anyone.
            </p>
          </td></tr>
        </table>
        <p style="margin:0;font-size:13px;line-height:1.6;color:#888888;">
          If you did not request this code, you can safely ignore this email — someone may have entered your address by mistake.
        </p>
        <p style="margin:32px 0 0 0;font-size:14px;color:#555555;">
          Warm regards,<br><strong style="color:#1a0b2e;">The MeriLive Team</strong>
        </p>
      </td></tr>
      <tr><td style="background:#1a0b2e;padding:24px 32px;text-align:center;">
        <div style="font-size:14px;font-weight:600;color:#d4af37;letter-spacing:2px;margin-bottom:8px;">MERILIVE</div>
        <p style="margin:0 0 8px 0;font-size:11px;color:#9b88b5;line-height:1.5;">
          Premium Live Streaming &amp; Social Platform
        </p>
        <p style="margin:0;font-size:10px;color:#6b5783;line-height:1.5;">
          This is an automated message — please do not reply.<br>
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

    const gmailUser = normalizeSecret(Deno.env.get("GMAIL_USER")).toLowerCase();
    const gmailAppPassword = normalizeSecret(Deno.env.get("GMAIL_APP_PASSWORD")).replace(/\s+/g, "");

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
    const { data: otpRecord, error: insertError } = await supabase.from("email_otps").insert({
      email: email.toLowerCase(),
      otp_code: otp,
      purpose: purpose,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    }).select("id").single();

    if (insertError) {
      console.error("[send-email-otp] DB insert error:", insertError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to generate OTP" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const emailHTML = buildOTPEmailHTML(otp, purpose);
    const textContent = buildOTPEmailText(otp, purpose);

    const subject =
      purpose === "login" ? "Your MeriLive sign-in code" :
      purpose === "register" ? "Confirm your MeriLive account" :
      purpose === "reset" ? "Reset your MeriLive password" :
      "Your MeriLive verification code";

    const mailResult = await sendMailWithFallback({
      gmailUser,
      gmailAppPassword,
      to: email,
      subject,
      text: textContent,
      html: emailHTML,
    });

    if (!mailResult.success) {
      console.error("[send-email-otp] Email delivery failed:", mailResult.detail || mailResult.error);

      if (otpRecord?.id) {
        await supabase
          .from("email_otps")
          .update({ is_used: true })
          .eq("id", otpRecord.id);
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: "Unable to send the verification code right now. Please try again in a moment.",
          code: "EMAIL_DELIVERY_FAILED",
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(
      `[send-email-otp] OTP sent to ${email} via ${mailResult.authMethod} | messageId=${mailResult.info?.messageId} | accepted=${JSON.stringify(mailResult.info?.accepted)} | rejected=${JSON.stringify(mailResult.info?.rejected)}`
    );

    return new Response(
      JSON.stringify({
        success: true,
        message: "OTP sent successfully",
        authMethod: mailResult.authMethod,
        messageId: mailResult.info?.messageId,
        accepted: mailResult.info?.accepted,
        rejected: mailResult.info?.rejected,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[send-email-otp] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Failed to send email", detail: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});