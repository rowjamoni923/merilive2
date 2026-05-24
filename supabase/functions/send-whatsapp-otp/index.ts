import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

  try {
    const { phone_number, action, otp } = await req.json();

    if (!phone_number) {
      return new Response(
        JSON.stringify({ error: "Phone number is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const greenApiInstanceId = Deno.env.get("GREEN_API_INSTANCE_ID");
    const greenApiToken = Deno.env.get("GREEN_API_TOKEN");

    if (!greenApiInstanceId || !greenApiToken) {
      console.error("[whatsapp-otp] GREEN-API credentials not configured");
      return new Response(
        JSON.stringify({ error: "WhatsApp service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Clean phone number - remove spaces, dashes, and ensure no leading +
    const cleanPhone = phone_number.replace(/[\s\-\(\)]/g, "").replace(/^\+/, "");

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
        return new Response(
          JSON.stringify({ error: "Please wait 60 seconds before requesting a new OTP" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
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

        return new Response(
          JSON.stringify({ success: false, message_sent: false, error: "Failed to send WhatsApp message. Please try again." }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, message_sent: true, message: "Verification code sent to your WhatsApp" }),
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
        return new Response(
          JSON.stringify({ error: "Invalid or expired verification code" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if ((otpRecord.attempts ?? 0) >= 5) {
        await supabase
          .from("phone_otps")
          .update({ is_used: true })
          .eq("id", otpRecord.id);
        return new Response(
          JSON.stringify({ error: "Too many failed attempts. Please request a new OTP" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await supabase
        .from("phone_otps")
        .update({ attempts: (otpRecord.attempts ?? 0) + 1 })
        .eq("id", otpRecord.id);

      if (otpRecord.otp_code !== otp) {
        return new Response(
          JSON.stringify({ error: "Invalid or expired verification code" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Mark as used
      await supabase
        .from("phone_otps")
        .update({ is_used: true })
        .eq("id", otpRecord.id);

      console.log(`[whatsapp-otp] OTP verified for ${cleanPhone}`);

      const verifiedToken = await createPhoneExchangeToken(supabase, cleanPhone);

      return new Response(
        JSON.stringify({ success: true, verified: true, verified_token: verifiedToken }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action. Use 'send' or 'verify'" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[whatsapp-otp] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
