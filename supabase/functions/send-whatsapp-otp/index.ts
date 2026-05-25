import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

const generateOTP = (): string => {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => String(b % 10)).join("");
};

async function createPhoneExchangeToken(supabase: any, identifier: string): Promise<string> {
  const rawBytes = new Uint8Array(32);
  crypto.getRandomValues(rawBytes);
  const token = Array.from(rawBytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const tokenHash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");

  const { error } = await supabase.from("otp_exchange_tokens").insert({
    token_hash: tokenHash,
    identifier,
    channel: "phone",
    purpose: "login",
    expires_at: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
  });
  if (error) throw error;
  return token;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const phone_number = typeof body.phone_number === "string" ? body.phone_number : "";
    const action = body.action === "send" || body.action === "verify" ? body.action : "";
    const otp = typeof body.otp === "string" ? body.otp.trim() : "";

    if (!phone_number) {
      return json({ error: "Phone number is required" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const greenApiInstanceId = Deno.env.get("GREEN_API_INSTANCE_ID");
    const greenApiToken = Deno.env.get("GREEN_API_TOKEN");

    if (!greenApiInstanceId || !greenApiToken) {
      console.error("[whatsapp-otp] GREEN-API credentials not configured");
      return json({ error: "WhatsApp service not configured" }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Clean phone number - remove spaces, dashes, and ensure no leading +
    const cleanPhone = phone_number.replace(/[\s\-\(\)]/g, "").replace(/^\+/, "");
    if (!/^\d{7,15}$/.test(cleanPhone)) {
      return json({ error: "Invalid phone number" }, 400);
    }

    if (action === "send") {
      // Rate limit: max 1 OTP per 60 seconds
      const { data: recentOtp } = await supabase
        .from("phone_otps")
        .select("created_at")
        .eq("phone_number", cleanPhone)
        .eq("is_used", false)
        .gt("created_at", new Date(Date.now() - 60000).toISOString())
        .maybeSingle();

      if (recentOtp) {
        return json({ error: "Please wait 60 seconds before requesting a new OTP" }, 429);
      }

      const otpCode = generateOTP();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

      // Delete existing unused OTPs for this phone
      await supabase
        .from("phone_otps")
        .delete()
        .eq("phone_number", cleanPhone);

      // Store new OTP
      const { error: insertError } = await supabase
        .from("phone_otps")
        .insert({
          phone_number: cleanPhone,
          otp_code: otpCode,
          expires_at: expiresAt.toISOString(),
        });

      if (insertError) {
        console.error("[whatsapp-otp] Insert error:", insertError);
        throw new Error("Failed to generate OTP");
      }

      // Send via GREEN-API WhatsApp
      const chatId = `${cleanPhone}@c.us`;
      const message = `🔐 *MeriLive Verification Code*\n\nYour OTP code is: *${otpCode}*\n\n⏰ This code expires in 5 minutes.\n\n⚠️ Do not share this code with anyone.\n\n— MeriLive Team`;

      const greenApiUrl = `https://7103.api.greenapi.com/waInstance${greenApiInstanceId}/sendMessage/${greenApiToken}`;

      console.log(`[whatsapp-otp] Sending to chatId: ${chatId}, URL: https://7103.api.greenapi.com/waInstance${greenApiInstanceId}/sendMessage/***`);

      const whatsappResponse = await fetch(greenApiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId,
          message,
        }),
      });

      const responseText = await whatsappResponse.text();
      console.log(`[whatsapp-otp] GREEN-API response status: ${whatsappResponse.status}, body: ${responseText}`);

      let whatsappResult: any = {};
      try {
        whatsappResult = JSON.parse(responseText);
      } catch (e) {
        console.error(`[whatsapp-otp] Failed to parse GREEN-API response: ${responseText}`);
      }
      const messageSent = whatsappResponse.ok && whatsappResult?.idMessage;

      console.log(`[whatsapp-otp] OTP sent to ${cleanPhone}, success: ${messageSent}`);

      if (!messageSent) {
        await supabase
          .from("phone_otps")
          .update({ is_used: true })
          .eq("phone_number", cleanPhone)
          .eq("otp_code", otpCode)
          .eq("is_used", false);

        return json({ success: false, message_sent: false, error: "Failed to send WhatsApp message. Please try again." }, 502);
      }

      return json({ success: true, message_sent: true, message: "Verification code sent to your WhatsApp" }, 200);

    } else if (action === "verify") {
      if (!/^\d{6}$/.test(otp)) {
        return json({ error: "Valid 6-digit OTP is required" }, 400);
      }

      const { data: otpRecord, error: findError } = await supabase
        .from("phone_otps")
        .select("*")
        .eq("phone_number", cleanPhone)
        .eq("is_used", false)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (findError || !otpRecord) {
        console.warn(`[whatsapp-otp] Failed verification for ${cleanPhone}`);
        return json({ error: "Invalid or expired verification code" }, 400);
      }

      if ((otpRecord.attempts ?? 0) >= 5) {
        await supabase
          .from("phone_otps")
          .update({ is_used: true })
          .eq("id", otpRecord.id);
        return json({ error: "Too many failed attempts. Please request a new OTP" }, 429);
      }

      await supabase
        .from("phone_otps")
        .update({ attempts: (otpRecord.attempts ?? 0) + 1 })
        .eq("id", otpRecord.id);

      if (!constantTimeEqual(String(otpRecord.otp_code), otp)) {
        return json({ error: "Invalid or expired verification code" }, 400);
      }

      // Mark as used
      const { data: consumedOtp, error: consumeError } = await supabase
        .from("phone_otps")
        .update({ is_used: true, verified_at: new Date().toISOString() })
        .eq("id", otpRecord.id)
        .eq("is_used", false)
        .select("id")
        .maybeSingle();
      if (consumeError) throw consumeError;
      if (!consumedOtp) {
        return json({ error: "Invalid or expired verification code" }, 400);
      }

      console.log(`[whatsapp-otp] OTP verified for ${cleanPhone}`);

      const verifiedToken = await createPhoneExchangeToken(supabase, cleanPhone);

      return json({ success: true, verified: true, verified_token: verifiedToken }, 200);
    }

    return json({ error: "Invalid action. Use 'send' or 'verify'" }, 400);
  } catch (error: any) {
    console.error("[whatsapp-otp] Error:", error);
    return json({ error: "Internal server error" }, 500);
  }
});
