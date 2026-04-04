import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface TwoFARequest {
  email: string;
  action: "send" | "verify";
  otp?: string;
}

const generateOTP = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

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

      if (insertError) {
        console.error("[admin-2fa-otp] Insert error:", insertError);
        throw new Error("Failed to generate OTP");
      }

      // Fetch branding logo
      let logoUrl = '';
      try {
        const { data: brandingData } = await supabase
          .from('branding_settings')
          .select('logo_image_url')
          .eq('id', 'default')
          .maybeSingle();
        if (brandingData?.logo_image_url) {
          logoUrl = brandingData.logo_image_url;
        }
      } catch (e) {
        console.warn("[admin-2fa-otp] Could not fetch branding logo:", e);
      }

      const logoHtml = logoUrl
        ? `<img src="${logoUrl}" alt="MeriLive" style="width:64px;height:64px;object-fit:contain;margin:0 auto 16px;display:block;border-radius:14px;" />`
        : `<div style="width:56px;height:56px;margin:0 auto 16px;background:linear-gradient(135deg,#a855f7,#ec4899);border-radius:14px;display:flex;align-items:center;justify-content:center;"><span style="font-size:28px;">🛡️</span></div>`;

      // Send via email
      let emailSent = false;
      if (resendApiKey) {
        try {
          const resend = new Resend(resendApiKey);
          await resend.emails.send({
            from: "MeriLive <noreply@merilive.com>",
            to: [normalizedEmail],
            subject: "🔐 MeriLive Admin - Login Verification Code",
            html: `
              <!DOCTYPE html>
              <html>
              <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
              <body style="margin:0;padding:0;background:#0f0a1e;font-family:'Segoe UI',Arial,sans-serif;">
                <div style="max-width:480px;margin:0 auto;padding:32px 20px;">
                  <div style="text-align:center;margin-bottom:28px;">
                    <h1 style="color:#a855f7;font-size:28px;margin:0;letter-spacing:1px;">MERI<span style="color:#ec4899;">LIVE</span></h1>
                    <p style="color:#9ca3af;font-size:13px;margin:4px 0 0;">Admin 2FA Verification</p>
                  </div>
                  <div style="background:linear-gradient(135deg,#1e1b3a,#1a1033);border:1px solid #7c3aed33;border-radius:16px;padding:28px;text-align:center;">
                    ${logoHtml}
                    <h2 style="color:#ffffff;font-size:20px;margin:0 0 8px;">Login Verification Code</h2>
                    <p style="color:#9ca3af;font-size:13px;margin:0 0 24px;">Enter this code to complete your admin login</p>
                    <div style="background:#0f0a1e;border:2px dashed #7c3aed;border-radius:12px;padding:20px;margin:0 0 20px;">
                      <div style="font-size:36px;font-weight:bold;letter-spacing:12px;color:#a855f7;font-family:'Courier New',monospace;">
                        ${otpCode}
                      </div>
                    </div>
                    <p style="color:#f87171;font-size:12px;margin:0 0 6px;">⏰ This code expires in 5 minutes</p>
                    <p style="color:#6b7280;font-size:11px;margin:0;">If you didn't try to login, someone may have your password. Change it immediately!</p>
                  </div>
                  <div style="text-align:center;margin-top:24px;">
                    <p style="color:#4b5563;font-size:11px;margin:0;">© ${new Date().getFullYear()} MeriLive. All rights reserved.</p>
                  </div>
                </div>
              </body>
              </html>
            `,
          });
          emailSent = true;
          console.log(`[admin-2fa-otp] OTP sent to ${normalizedEmail}`);
        } catch (emailErr: any) {
          console.error("[admin-2fa-otp] Email send failed:", emailErr.message);
        }
      }

      console.log(`[admin-2fa-otp] OTP generated for ${normalizedEmail}, sent: ${emailSent}`);

      return new Response(
        JSON.stringify({
          success: true,
          email_sent: emailSent,
          message: emailSent ? "Verification code sent to your email" : "Email service unavailable, please contact support",
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
        // Track failed attempts
        console.warn(`[admin-2fa-otp] Failed verification attempt for ${normalizedEmail}`);
        return new Response(
          JSON.stringify({ error: "Invalid or expired verification code" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Mark as used
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
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
