import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface OTPRequest {
  email: string;
  action: "send" | "verify" | "reset-password";
  otp?: string;
  newPassword?: string;
}

// Generate 6-digit OTP
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

    const { email, action, otp, newPassword }: OTPRequest = await req.json();
    console.log(`[send-password-otp] Action: ${action}, Email: ${email}`);

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "send") {
      const otpCode = generateOTP();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Delete existing OTPs for this email
      await supabase
        .from("password_reset_otps")
        .delete()
        .eq("email", email.toLowerCase());

      // Store new OTP
      const { error: insertError } = await supabase
        .from("password_reset_otps")
        .insert({
          email: email.toLowerCase(),
          otp_code: otpCode,
          expires_at: expiresAt.toISOString(),
        });

      if (insertError) {
        console.error("Failed to store OTP:", insertError);
        throw new Error("Failed to generate OTP");
      }

      // Check if user exists using getUserById with email lookup
      const { data: userListData } = await supabase.auth.admin.listUsers({
        page: 1,
        perPage: 1,
      });

      // Use a direct approach - search by email
      let user = null;
      // Try to find by listing with filter
      const { data: allUsers } = await supabase
        .from('admin_users')
        .select('user_id, email')
        .eq('email', email.toLowerCase())
        .maybeSingle();

      if (allUsers?.user_id) {
        const { data: authUser } = await supabase.auth.admin.getUserById(allUsers.user_id);
        user = authUser?.user || null;
      }

      if (!user) {
        // Fallback: try to find in auth.users by listing all (paginated)
        let page = 1;
        const perPage = 100;
        let found = false;
        while (!found) {
          const { data: pageData, error: pageError } = await supabase.auth.admin.listUsers({ page, perPage });
          if (pageError || !pageData?.users?.length) break;
          const match = pageData.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
          if (match) { user = match; found = true; }
          if (pageData.users.length < perPage) break;
          page++;
        }
      }

      if (!user) {
        // Return success to prevent email enumeration
        console.log(`User not found for email: ${email}, returning success anyway`);
        return new Response(
          JSON.stringify({ success: true, message: "If the email exists, OTP has been sent" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Send OTP via Resend email
      let emailSent = false;
      if (resendApiKey) {
        try {
          const resend = new Resend(resendApiKey);
          const emailResponse = await resend.emails.send({
            from: "MeriLive <noreply@merilive.com>",
            to: [email.toLowerCase()],
            subject: "🔐 MeriLive - Password Reset OTP",
            html: `
              <!DOCTYPE html>
              <html>
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
              </head>
              <body style="margin:0;padding:0;background:#0f0a1e;font-family:'Segoe UI',Arial,sans-serif;">
                <div style="max-width:480px;margin:0 auto;padding:32px 20px;">
                  <!-- Header -->
                  <div style="text-align:center;margin-bottom:28px;">
                    <h1 style="color:#a855f7;font-size:28px;margin:0;letter-spacing:1px;">MERI<span style="color:#ec4899;">LIVE</span></h1>
                    <p style="color:#9ca3af;font-size:13px;margin:4px 0 0;">Admin Panel Security</p>
                  </div>
                  
                  <!-- Card -->
                  <div style="background:linear-gradient(135deg,#1e1b3a,#1a1033);border:1px solid #7c3aed33;border-radius:16px;padding:28px;text-align:center;">
                    <div style="width:56px;height:56px;margin:0 auto 16px;background:linear-gradient(135deg,#a855f7,#ec4899);border-radius:14px;display:flex;align-items:center;justify-content:center;">
                      <span style="font-size:28px;">🔐</span>
                    </div>
                    
                    <h2 style="color:#ffffff;font-size:20px;margin:0 0 8px;">Password Reset OTP</h2>
                    <p style="color:#9ca3af;font-size:13px;margin:0 0 24px;">Use the code below to reset your admin panel password</p>
                    
                    <!-- OTP Code -->
                    <div style="background:#0f0a1e;border:2px dashed #7c3aed;border-radius:12px;padding:20px;margin:0 0 20px;">
                      <div style="font-size:36px;font-weight:bold;letter-spacing:12px;color:#a855f7;font-family:'Courier New',monospace;">
                        ${otpCode}
                      </div>
                    </div>
                    
                    <p style="color:#f87171;font-size:12px;margin:0 0 6px;">⏰ This code expires in 10 minutes</p>
                    <p style="color:#6b7280;font-size:11px;margin:0;">If you didn't request this, please ignore this email.</p>
                  </div>
                  
                  <!-- Footer -->
                  <div style="text-align:center;margin-top:24px;">
                    <p style="color:#4b5563;font-size:11px;margin:0;">© ${new Date().getFullYear()} MeriLive. All rights reserved.</p>
                  </div>
                </div>
              </body>
              </html>
            `,
          });

          if (emailResponse.error) {
            console.error("Resend API error:", emailResponse.error);
          } else {
            emailSent = true;
            console.log(`OTP email sent successfully to ${email}`);
          }
        } catch (emailErr: any) {
          console.error("Failed to send email via Resend:", emailErr.message);
        }
      } else {
        console.warn("RESEND_API_KEY not configured, skipping email");
      }

      // Also store in-app notification (without OTP in message for security)
      await supabase
        .from("notifications")
        .insert({
          user_id: user.id,
          title: "🔐 Password Reset OTP",
          message: `A password reset OTP has been sent to your email. Valid for 10 minutes.`,
          type: "system",
          data: { type: "password_reset" }
        });

      console.log(`OTP generated for ${email}, email_sent: ${emailSent}`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: emailSent 
            ? "OTP sent to your email" 
            : "OTP generated (check notifications)",
          email_sent: emailSent,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } else if (action === "verify") {
      if (!otp) {
        return new Response(
          JSON.stringify({ error: "OTP is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: otpRecord, error: findError } = await supabase
        .from("password_reset_otps")
        .select("*")
        .eq("email", email.toLowerCase())
        .eq("otp_code", otp)
        .eq("is_used", false)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (findError || !otpRecord) {
        console.log("OTP verification failed:", findError);
        return new Response(
          JSON.stringify({ error: "Invalid or expired OTP" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: "OTP verified", otpId: otpRecord.id }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } else if (action === "reset-password") {
      if (!otp || !newPassword) {
        return new Response(
          JSON.stringify({ error: "OTP and new password are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: otpRecord, error: findError } = await supabase
        .from("password_reset_otps")
        .select("*")
        .eq("email", email.toLowerCase())
        .eq("otp_code", otp)
        .eq("is_used", false)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (findError || !otpRecord) {
        return new Response(
          JSON.stringify({ error: "Invalid or expired OTP" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Find user - first try admin_users table, then paginated search
      let user = null;
      const { data: adminUser } = await supabase
        .from('admin_users')
        .select('user_id')
        .eq('email', email.toLowerCase())
        .maybeSingle();

      if (adminUser?.user_id) {
        const { data: authUser } = await supabase.auth.admin.getUserById(adminUser.user_id);
        user = authUser?.user || null;
      }

      if (!user) {
        let page = 1;
        const perPage = 100;
        while (true) {
          const { data: pageData } = await supabase.auth.admin.listUsers({ page, perPage });
          if (!pageData?.users?.length) break;
          const match = pageData.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
          if (match) { user = match; break; }
          if (pageData.users.length < perPage) break;
          page++;
        }
      }

      if (!user) {
        return new Response(
          JSON.stringify({ error: "User not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Update password
      const { error: updateError } = await supabase.auth.admin.updateUserById(
        user.id,
        { password: newPassword }
      );

      if (updateError) throw new Error("Failed to update password");

      // Mark OTP as used
      await supabase
        .from("password_reset_otps")
        .update({ is_used: true })
        .eq("id", otpRecord.id);

      console.log(`Password reset successful for ${email}`);

      return new Response(
        JSON.stringify({ success: true, message: "Password updated successfully" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error in send-password-otp:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
