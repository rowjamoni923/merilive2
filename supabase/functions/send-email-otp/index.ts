import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sendOtpEmail } from "../_shared/send-otp-email.ts";

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

function generateOTP(): string {
  const arr = new Uint8Array(6);
  crypto.getRandomValues(arr);
  let otp = "";
  for (let i = 0; i < 6; i++) otp += (arr[i] % 10).toString();
  return otp;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const purpose = typeof body.purpose === "string" ? body.purpose : "login";

    if (!email || email.length > 254) {
      return json({ success: false, error: "Email is required" }, 400);
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return json({ success: false, error: "Invalid email format" }, 400);
    }
    const validPurposes = ["login", "register", "reset", "verify"];
    if (!validPurposes.includes(purpose)) {
      return json({ success: false, error: "Invalid purpose" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: rateLimitOk } = await supabase.rpc("check_otp_rate_limit", { p_email: email });
    if (!rateLimitOk) {
      return json({ success: false, error: "Too many requests. Please try again after 10 minutes." }, 429);
    }

    await supabase.from("email_otps")
      .update({ is_used: true })
      .eq("email", email).eq("purpose", purpose).eq("is_used", false);

    const otp = generateOTP();
    const { error: insertError } = await supabase.from("email_otps").insert({
      email: email.toLowerCase(),
      otp_code: otp,
      purpose,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });

    if (insertError) {
      console.error("[send-email-otp] DB insert error:", insertError);
      return json({ success: false, error: "Failed to generate OTP" }, 500);
    }

    const result = await sendOtpEmail({ to: email, otp, purpose: purpose as any, expiryMinutes: 5 });
    if (!result.success) {
      console.error("[send-email-otp] Email delivery failed:", result.error);
      await supabase.from("email_otps").update({ is_used: true }).eq("email", email).eq("otp_code", otp).eq("is_used", false);
      return json({ success: false, error: "Failed to send verification email. Please try again." }, 500);
    }

    console.log(`[send-email-otp] OTP queued for ${email} (${purpose}) via Lovable Email`);
    return json({ success: true, message: "OTP sent successfully" }, 200);
  } catch (error) {
    console.error("[send-email-otp] Error:", error);
    return json({ success: false, error: "Failed to send email" }, 500);
  }
});
