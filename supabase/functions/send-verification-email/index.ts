import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { sendOtpEmail } from "../_shared/send-otp-email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface VerificationEmailRequest {
  email: string;
  code: string;
  agencyName: string;
  type: 'email' | 'app';
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { email, code, type }: VerificationEmailRequest = await req.json();
    console.log(`[send-verification-email] Sending ${type} verification to ${email}`);

    const result = await sendOtpEmail({
      to: email,
      otp: code,
      purpose: "agency",
      expiryMinutes: 1,
    });

    if (!result.success) {
      return new Response(
        JSON.stringify({ success: false, error: result.error || "Failed to send" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, provider: "lovable-email" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("[send-verification-email] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
