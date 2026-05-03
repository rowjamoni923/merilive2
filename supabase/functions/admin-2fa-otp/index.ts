import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sendOtpEmail } from "../_shared/send-otp-email.ts";

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
  const arr = new Uint8Array(6);
  crypto.getRandomValues(arr);
  let otp = "";
  for (let i = 0; i < 6; i++) otp += (arr[i] % 10).toString();
  return otp;
};


Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;


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

      // Send via Lovable Email (unlimited)
      let emailSent = false;
      let emailError: string | null = null;

      const sendResult = await sendOtpEmail({
        to: normalizedEmail,
        otp: otpCode,
        purpose: "admin",
        expiryMinutes: 5,
      });
      emailSent = sendResult.success;
      if (!emailSent) {
        emailError = sendResult.error ?? "send failed";
        console.error("[admin-2fa-otp] ❌ Lovable Email send failed:", emailError);
      } else {
        console.log(`[admin-2fa-otp] ✅ Queued via Lovable Email to ${normalizedEmail}`);
      }

      return new Response(
        JSON.stringify({
          success: true,
          email_sent: emailSent,
          message: emailSent
            ? "Verification code sent to your email"
            : "Email service unavailable. Please try again or contact support.",
          error_detail: emailError,
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
