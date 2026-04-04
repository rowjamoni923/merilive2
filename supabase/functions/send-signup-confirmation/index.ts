import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};


interface RateLimitBucket {
  count: number;
  resetAt: number;
}

interface ValidationResult {
  ok: boolean;
  data?: {
    email: string;
    displayName: string;
    verificationCode: string;
  };
  error?: string;
}

interface SignupConfirmationRequest {
  email: string;
  displayName: string;
  verificationCode: string;
  userId?: string;
}

const EMAIL_COOLDOWN_MS = 60_000;
const IP_WINDOW_MS = 10 * 60_000;
const IP_MAX_REQUESTS = 8;
const emailLastSentAt = new Map<string, number>();
const ipBuckets = new Map<string, { count: number; resetAt: number }>();

const cleanupRateLimitMaps = () => {
  const now = Date.now();
  for (const [key, ts] of emailLastSentAt.entries()) {
    if (now - ts > 30 * 60_000) emailLastSentAt.delete(key);
  }
  for (const [key, bucket] of ipBuckets.entries()) {
    if (bucket.resetAt <= now) ipBuckets.delete(key);
  }
};

const getClientIp = (req: Request) => {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip")
    || req.headers.get("cf-connecting-ip")
    || "unknown";
};

const validatePayload = (payload: SignupConfirmationRequest) => {
  const email = payload?.email?.trim().toLowerCase();
  const displayName = (payload?.displayName || "User").trim().slice(0, 50);
  const verificationCode = String(payload?.verificationCode || "").trim();

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { ok: false as const, error: "Invalid email format" };
  }

  const finalCode = /^\d{6}$/.test(verificationCode)
    ? verificationCode
    : Math.floor(100000 + Math.random() * 900000).toString();

  return {
    ok: true as const,
    data: {
      email,
      displayName: displayName || email.split("@")[0],
      verificationCode: finalCode,
    },
  };
};

const enforceRateLimit = (email: string, ip: string) => {
  const now = Date.now();

  const lastEmailSent = emailLastSentAt.get(email);
  if (lastEmailSent && now - lastEmailSent < EMAIL_COOLDOWN_MS) {
    const waitSeconds = Math.ceil((EMAIL_COOLDOWN_MS - (now - lastEmailSent)) / 1000);
    return `Please wait ${waitSeconds}s before requesting another code`;
  }

  const bucket = ipBuckets.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    ipBuckets.set(ip, { count: 1, resetAt: now + IP_WINDOW_MS });
  } else {
    if (bucket.count >= IP_MAX_REQUESTS) {
      const waitSeconds = Math.ceil((bucket.resetAt - now) / 1000);
      return `Too many requests from this network. Try again in ${waitSeconds}s`;
    }
    bucket.count += 1;
    ipBuckets.set(ip, bucket);
  }

  emailLastSentAt.set(email, now);
  return null;
};

// ===== Resend Email Sender =====

async function sendWithResend(to: string, subject: string, html: string): Promise<{ success: boolean; error?: string }> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return { success: false, error: "RESEND_API_KEY not configured" };
  try {
    const resend = new Resend(apiKey);
    const response = await resend.emails.send({ from: "MeriLive <noreply@merilive.com>", to: [to], subject, html });
    if (response.error) return { success: false, error: response.error.message };
    return { success: true };
  } catch (e: any) { return { success: false, error: e.message }; }
}

// ===== Main Handler =====

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  cleanupRateLimitMaps();

  try {
    const parsed = validatePayload(await req.json());
    if (!parsed.ok) {
      return new Response(
        JSON.stringify({ success: false, error: parsed.error }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { email, displayName, verificationCode } = parsed.data;
    const ip = getClientIp(req);

    const rateLimitError = enforceRateLimit(email, ip);
    if (rateLimitError) {
      return new Response(
        JSON.stringify({ success: false, error: rateLimitError }),
        { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`Sending signup confirmation to ${email} with code ${verificationCode}`);

    const code = verificationCode;
    const logoUrl = "https://merilive.lovable.app/images/merilive-cat-logo.png";

    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <meta name="format-detection" content="telephone=no">
        <meta name="color-scheme" content="dark">
        <title>MeriLive Verification</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #0a0a12; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #0a0a12; min-height: 100vh;">
          <tr>
            <td align="center" style="padding: 24px 16px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 420px; margin: 0 auto;">
                <tr>
                  <td align="center" style="padding: 32px 0 24px 0;">
                    <img src="${logoUrl}" alt="MeriLive" width="180" height="auto" style="display: block; max-width: 180px; height: auto; border: none;">
                  </td>
                </tr>
                <tr>
                  <td>
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background: linear-gradient(145deg, #1e1e2e 0%, #151521 100%); border-radius: 24px; border: 1px solid rgba(168, 85, 247, 0.2); overflow: hidden; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 0 0 40px rgba(168, 85, 247, 0.1);">
                      <tr>
                        <td style="background: linear-gradient(135deg, #9333ea 0%, #ec4899 50%, #f97316 100%); padding: 32px 24px; text-align: center;">
                          <p style="margin: 0; font-size: 14px; color: rgba(255,255,255,0.9); font-weight: 500;">Welcome to MeriLive ✨</p>
                          <h1 style="margin: 12px 0 0 0; font-size: 24px; font-weight: 700; color: #ffffff;">Email Verification</h1>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 32px 24px;">
                          <p style="margin: 0 0 24px 0; color: #ffffff; font-size: 17px; text-align: center;">
                            Hi <strong style="color: #ec4899;">${displayName}</strong>! 👋
                          </p>
                          <p style="margin: 0 0 28px 0; color: rgba(255,255,255,0.7); font-size: 15px; line-height: 1.6; text-align: center;">
                            Enter the code below to verify your email and start your journey with MeriLive.
                          </p>
                          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 28px;">
                            <tr>
                              <td align="center">
                                <table role="presentation" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, rgba(147, 51, 234, 0.2) 0%, rgba(236, 72, 153, 0.2) 100%); border: 2px solid rgba(168, 85, 247, 0.4); border-radius: 20px;">
                                  <tr>
                                    <td style="padding: 24px 40px;">
                                      <p style="margin: 0 0 8px 0; font-size: 11px; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 3px; font-weight: 600; text-align: center;">Verification Code</p>
                                      <p style="margin: 0; font-size: 40px; font-weight: 800; color: #ffffff; letter-spacing: 10px; font-family: 'SF Mono', Monaco, 'Courier New', monospace; text-align: center; text-shadow: 0 0 30px rgba(168, 85, 247, 0.5);">${code}</p>
                                    </td>
                                  </tr>
                                </table>
                              </td>
                            </tr>
                          </table>
                          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 28px;">
                            <tr>
                              <td style="background: rgba(251, 191, 36, 0.08); border: 1px solid rgba(251, 191, 36, 0.25); border-radius: 14px; padding: 16px 20px;">
                                <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                                  <tr>
                                    <td width="30" valign="top"><span style="font-size: 18px;">⏱️</span></td>
                                    <td style="color: #fbbf24; font-size: 14px; line-height: 1.5;">
                                      <strong>Expires in 10 minutes</strong><br>
                                      <span style="color: rgba(251, 191, 36, 0.8); font-size: 13px;">Never share this code with anyone</span>
                                    </td>
                                  </tr>
                                </table>
                              </td>
                            </tr>
                          </table>
                          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 24px;">
                            <tr><td style="height: 1px; background: linear-gradient(90deg, transparent 0%, rgba(168, 85, 247, 0.3) 50%, transparent 100%);"></td></tr>
                          </table>
                          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                            <tr><td style="padding-bottom: 12px;"><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background: rgba(255,255,255,0.03); border-radius: 12px;"><tr><td width="48" style="padding: 14px;"><span style="font-size: 22px;">🎬</span></td><td style="padding: 14px 14px 14px 0;"><p style="margin: 0; color: #ffffff; font-size: 14px; font-weight: 600;">Go Live</p><p style="margin: 4px 0 0 0; color: rgba(255,255,255,0.5); font-size: 12px;">Stream and connect with viewers</p></td></tr></table></td></tr>
                            <tr><td style="padding-bottom: 12px;"><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background: rgba(255,255,255,0.03); border-radius: 12px;"><tr><td width="48" style="padding: 14px;"><span style="font-size: 22px;">💎</span></td><td style="padding: 14px 14px 14px 0;"><p style="margin: 0; color: #ffffff; font-size: 14px; font-weight: 600;">Virtual Gifts</p><p style="margin: 4px 0 0 0; color: rgba(255,255,255,0.5); font-size: 12px;">Send and receive animated gifts</p></td></tr></table></td></tr>
                            <tr><td><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background: rgba(255,255,255,0.03); border-radius: 12px;"><tr><td width="48" style="padding: 14px;"><span style="font-size: 22px;">🎮</span></td><td style="padding: 14px 14px 14px 0;"><p style="margin: 0; color: #ffffff; font-size: 14px; font-weight: 600;">Play Games</p><p style="margin: 4px 0 0 0; color: rgba(255,255,255,0.5); font-size: 12px;">Enjoy games with friends</p></td></tr></table></td></tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding: 32px 20px;">
                    <p style="margin: 0 0 12px 0; color: rgba(255,255,255,0.3); font-size: 12px;">Didn't request this? You can safely ignore this email.</p>
                    <p style="margin: 0; color: rgba(255,255,255,0.25); font-size: 11px;">© ${new Date().getFullYear()} MeriLive. All rights reserved.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    console.log("Sending via Resend...");
    const result = await sendWithResend(email, "🔐 Your MeriLive Verification Code", html);

    if (!result.success) {
      console.error("Resend failed:", result.error);
      return new Response(
        JSON.stringify({ success: false, error: "Email delivery failed", details: result.error, code }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("✅ Email sent successfully via Resend");
    return new Response(
      JSON.stringify({ success: true, provider: "Resend", code }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error sending confirmation email:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
