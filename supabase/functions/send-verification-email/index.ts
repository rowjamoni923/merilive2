import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import nodemailer from "npm:nodemailer@6.9.12";
import { buildOtpEmailHTML } from "../_shared/otp-email-template.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface VerificationEmailRequest {
  email: string;
  code: string;
  agencyName: string;
  type: 'email' | 'app';
}

// ===== Gmail SMTP only =====
async function sendWithGmail(to: string, subject: string, html: string): Promise<{ success: boolean; error?: string }> {
  const gmailUser = (Deno.env.get("GMAIL_USER") ?? "").trim();
  const gmailPass = (Deno.env.get("GMAIL_APP_PASSWORD") ?? "").replace(/\s+/g, "");

  if (!gmailUser || !gmailPass) {
    return { success: false, error: "GMAIL_USER or GMAIL_APP_PASSWORD not configured" };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: gmailUser, pass: gmailPass },
    });

    await transporter.sendMail({
      from: `"MeriLive" <${gmailUser}>`,
      to,
      subject,
      html,
    });

    return { success: true };
  } catch (e: any) {
    console.error("Gmail SMTP error:", e?.message || e);
    return { success: false, error: e?.message || String(e) };
  }
}

async function sendEmailWithFallback(to: string, subject: string, html: string): Promise<{ success: boolean; provider: string; errors: string[] }> {
  console.log("Sending via Gmail SMTP...");
  const result = await sendWithGmail(to, subject, html);
  if (result.success) {
    return { success: true, provider: "Gmail", errors: [] };
  }
  return { success: false, provider: "none", errors: [`Gmail: ${result.error}`] };
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, code, agencyName, type }: VerificationEmailRequest = await req.json();
    console.log(`Sending ${type} verification email to ${email}`);

    const subject = type === 'email'
      ? `[MeriLive] ${agencyName} — Email Verification Code`
      : `[MeriLive] ${agencyName} — App Verification Code`;

    const html = buildOtpEmailHTML({
      otp: code,
      purpose: "agency",
      expiryMinutes: 1,
      brandName: "MeriLive",
    });

    const result = await sendEmailWithFallback(email, subject, html);

    if (!result.success) {
      console.error("All email providers failed:", result.errors);
      return new Response(
        JSON.stringify({ success: false, error: "All email providers failed", details: result.errors }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, provider: result.provider }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error sending verification email:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
