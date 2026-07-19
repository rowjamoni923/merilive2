import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-token, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function generateCode(): string {
  const arr = new Uint8Array(6);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => String(b % 10)).join("");
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function normalizePurpose(value: unknown): "agency_verification" | "sub_agency_verification" {
  return value === "sub_agency_verification" ? "sub_agency_verification" : "agency_verification";
}

async function createExchangeToken(): Promise<{ token: string; hash: string }> {
  const raw = new Uint8Array(32);
  crypto.getRandomValues(raw);
  const token = Array.from(raw).map((b) => b.toString(16).padStart(2, "0")).join("");
  return { token, hash: await sha256(token) };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const action = body?.action === "verify" ? "verify" : "send";
    const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
    const purpose = normalizePurpose(body?.purpose);
    const context = typeof body?.context === "string" ? body.context.trim().slice(0, 120) : null;
    const code = typeof body?.code === "string" ? body.code.trim() : "";

    if (!/^[0-9a-f-]{36}$/i.test(userId)) {
      return json({ success: false, error: "Valid user is required" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, display_name, is_banned, is_deleted")
      .eq("id", userId)
      .maybeSingle();

    if (profileError || !profile || profile.is_banned || profile.is_deleted) {
      return json({ success: false, error: "User not found or unavailable" }, 404);
    }

    if (action === "send") {
      const since = new Date(Date.now() - 60_000).toISOString();
      const { data: recent } = await supabase
        .from("agency_app_otps")
        .select("id")
        .eq("user_id", userId)
        .eq("purpose", purpose)
        .eq("is_used", false)
        .gt("created_at", since)
        .maybeSingle();

      if (recent) {
        return json({ success: false, error: "Please wait 60 seconds before requesting a new code" }, 429);
      }

      await supabase
        .from("agency_app_otps")
        .update({ is_used: true, used_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("purpose", purpose)
        .eq("is_used", false);

      const otp = generateCode();
      const otpHash = await sha256(otp);
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

      const { error: insertError } = await supabase.from("agency_app_otps").insert({
        user_id: userId,
        otp_hash: otpHash,
        purpose,
        context,
        expires_at: expiresAt,
      });
      if (insertError) throw insertError;

      const title = purpose === "sub_agency_verification" ? "Sub-Agency verification code" : "Agency verification code";
      const message = `Your MeriLive ${purpose === "sub_agency_verification" ? "sub-agency" : "agency"} OTP is ${otp}. It expires in 5 minutes.`;

      const { error: notificationError } = await supabase.from("notifications").insert({
        type: "agency_verification",
        title,
        message,
        data: { code: otp, purpose, context: context || "", icon_emoji: "🔐" },
      });
      if (notificationError) throw notificationError;

      return json({ success: true, expires_in: 300 }, 200);
    }

    if (!/^\d{6}$/.test(code)) {
      return json({ success: false, error: "Please enter the 6-digit code" }, 400);
    }

    const { data: otpRecord, error: findError } = await supabase
      .from("agency_app_otps")
      .select("id, otp_hash, attempts")
      .eq("user_id", userId)
      .eq("purpose", purpose)
      .eq("is_used", false)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (findError) throw findError;
    if (!otpRecord) {
      return json({ success: false, error: "OTP expired. Please request a new code." }, 400);
    }

    if ((otpRecord.attempts ?? 0) >= 5) {
      await supabase.from("agency_app_otps").update({ is_used: true, used_at: new Date().toISOString() }).eq("id", otpRecord.id);
      return json({ success: false, error: "Too many failed attempts. Please request a new code." }, 429);
    }

    const submittedHash = await sha256(code);
    if (!constantTimeEqual(String(otpRecord.otp_hash), submittedHash)) {
      await supabase.from("agency_app_otps").update({ attempts: (otpRecord.attempts ?? 0) + 1 }).eq("id", otpRecord.id);
      return json({ success: false, error: "Invalid OTP. Please enter the correct code." }, 400);
    }

    const exchange = await createExchangeToken();
    const { error: updateError } = await supabase
      .from("agency_app_otps")
      .update({ verified_at: new Date().toISOString(), exchange_token_hash: exchange.hash })
      .eq("id", otpRecord.id)
      .eq("is_used", false);
    if (updateError) throw updateError;

    return json({ success: true, verified: true, verified_token: exchange.token }, 200);
  } catch (error: any) {
    console.error("[agency-app-otp] Error:", error);
    return json({ success: false, error: "Verification service failed. Please try again." }, 500);
  }
});
