// Migrated from Gmail SMTP → Lovable Email queue (unlimited, queued, retry-safe)
// Sends signup verification OTP via the unified premium otp-code template.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { sendOtpEmail } from "../_shared/send-otp-email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SignupConfirmationRequest {
  email: string;
  displayName?: string;
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
  const displayName = (payload?.displayName || "").trim().slice(0, 50);
  const verificationCode = String(payload?.verificationCode || "").trim();

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
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

    console.log(`[send-signup-confirmation] Queuing OTP to ${email}`);

    const result = await sendOtpEmail({
      to: email,
      otp: verificationCode,
      purpose: "register",
      expiryMinutes: 10,
      idempotencyKey: `signup-${email}-${verificationCode}`,
    });

    if (!result.success) {
      console.error("[send-signup-confirmation] Lovable Email failed:", result.error);
      return new Response(
        JSON.stringify({ success: false, error: "Email delivery failed", details: result.error, code: verificationCode }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("[send-signup-confirmation] ✅ Queued via Lovable Email");
    return new Response(
      JSON.stringify({ success: true, provider: "Lovable", code: verificationCode, displayName }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("[send-signup-confirmation] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error?.message || String(error) }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
