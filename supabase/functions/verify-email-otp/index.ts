import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, x-client-platform, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function createExchangeToken(supabase: any, identifier: string, purpose: string): Promise<string> {
  const rawBytes = new Uint8Array(32);
  crypto.getRandomValues(rawBytes);
  const token = Array.from(rawBytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const tokenHash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");

  const { error } = await supabase.from("otp_exchange_tokens").insert({
    token_hash: tokenHash,
    identifier,
    channel: "email",
    purpose,
    expires_at: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
  });
  if (error) throw error;
  return token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const otp = typeof body.otp === "string" ? body.otp.trim() : "";
    const purpose = typeof body.purpose === "string" ? body.purpose : "login";

    if (!email || !otp || email.length > 254) {
      return json({ success: false, error: "Email and OTP are required" }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ success: false, error: "Invalid email format" }, 400);
    }
    if (!["login", "register", "reset", "verify"].includes(purpose)) {
      return json({ success: false, error: "Invalid purpose" }, 400);
    }

    // Validate OTP format (6 digits)
    if (!/^\d{6}$/.test(otp)) {
      return json({ success: false, error: "Invalid OTP format" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Find valid OTP
    const { data: otpRecord, error: fetchError } = await supabase
      .from("email_otps")
      .select("*")
      .eq("email", email)
      .eq("purpose", purpose)
      .eq("is_used", false)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      console.error("[verify-email-otp] DB error:", fetchError);
      return json({ success: false, error: "Verification failed" }, 500);
    }

    if (!otpRecord) {
      return json({ success: false, error: "OTP expired or not found. Please request a new one." }, 400);
    }

    // Check max attempts (5 attempts max)
    if (otpRecord.attempts >= 5) {
      // Mark as used to prevent further attempts
      await supabase
        .from("email_otps")
        .update({ is_used: true })
        .eq("id", otpRecord.id);

      return json({ success: false, error: "Too many failed attempts. Please request a new OTP." }, 429);
    }

    // Increment attempts
    await supabase
      .from("email_otps")
      .update({ attempts: otpRecord.attempts + 1 })
      .eq("id", otpRecord.id);

    // Verify OTP (timing-safe comparison)
    if (!constantTimeEqual(String(otpRecord.otp_code), otp)) {
      const remaining = 4 - otpRecord.attempts;
      return json(
        { 
          success: false, 
          error: `Invalid OTP. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.` 
        },
        400,
      );
    }

    // Mark OTP as used
    const { data: consumedOtp, error: consumeError } = await supabase
      .from("email_otps")
      .update({ is_used: true, verified_at: new Date().toISOString() })
      .eq("id", otpRecord.id)
      .eq("is_used", false)
      .select("id")
      .maybeSingle();
    if (consumeError) throw consumeError;
    if (!consumedOtp) {
      return json({ success: false, error: "OTP expired or not found. Please request a new one." }, 400);
    }

    console.log(`[verify-email-otp] OTP verified for ${email} (${purpose})`);

    // Cleanup expired OTPs in background
    supabase.rpc("cleanup_expired_otps").then(() => {
      console.log("[verify-email-otp] Expired OTPs cleaned up");
    });

    const verifiedToken = await createExchangeToken(supabase, email, purpose);

    return json({ success: true, verified: true, verified_token: verifiedToken }, 200);
  } catch (error) {
    console.error("[verify-email-otp] Error:", error);
    return json({ success: false, error: "Internal server error" }, 500);
  }
});
