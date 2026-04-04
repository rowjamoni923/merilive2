import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

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

// Email provider functions
async function sendWithResend(to: string, subject: string, html: string): Promise<{ success: boolean; error?: string }> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return { success: false, error: "RESEND_API_KEY not configured" };
  
  try {
    const resend = new Resend(apiKey);
    const response = await resend.emails.send({
      from: "MeriLive <noreply@merilive.com>",
      to: [to],
      subject,
      html,
    });
    
    if (response.error) {
      return { success: false, error: response.error.message };
    }
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

async function sendWithBrevo(to: string, subject: string, html: string): Promise<{ success: boolean; error?: string }> {
  const apiKey = Deno.env.get("BREVO_API_KEY");
  if (!apiKey) return { success: false, error: "BREVO_API_KEY not configured" };
  
  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "content-type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        sender: { name: "MeriLive", email: "noreply@merilive.com" },
        to: [{ email: to }],
        subject,
        htmlContent: html,
      }),
    });
    
    if (!response.ok) {
      const err = await response.text();
      return { success: false, error: `Brevo HTTP ${response.status}: ${err}` };
    }
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

async function sendWithSendGrid(to: string, subject: string, html: string): Promise<{ success: boolean; error?: string }> {
  const apiKey = Deno.env.get("SENDGRID_API_KEY");
  if (!apiKey) return { success: false, error: "SENDGRID_API_KEY not configured" };
  
  try {
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: "noreply@merilive.com", name: "MeriLive" },
        subject,
        content: [{ type: "text/html", value: html }],
      }),
    });
    
    if (!response.ok) {
      const err = await response.text();
      return { success: false, error: `SendGrid HTTP ${response.status}: ${err}` };
    }
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

async function sendWithMailgun(to: string, subject: string, html: string): Promise<{ success: boolean; error?: string }> {
  const apiKey = Deno.env.get("MAILGUN_API_KEY");
  const domain = Deno.env.get("MAILGUN_DOMAIN");
  if (!apiKey || !domain) return { success: false, error: "MAILGUN credentials not configured" };
  
  try {
    const form = new FormData();
    form.append("from", `MeriLive <noreply@${domain}>`);
    form.append("to", to);
    form.append("subject", subject);
    form.append("html", html);
    
    const response = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${btoa(`api:${apiKey}`)}`,
      },
      body: form,
    });
    
    if (!response.ok) {
      const err = await response.text();
      return { success: false, error: `Mailgun HTTP ${response.status}: ${err}` };
    }
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// Fallback chain: Resend → Brevo → SendGrid → Mailgun
async function sendEmailWithFallback(to: string, subject: string, html: string): Promise<{ success: boolean; provider: string; errors: string[] }> {
  const providers = [
    { name: "Resend", fn: sendWithResend },
    { name: "Brevo", fn: sendWithBrevo },
    { name: "SendGrid", fn: sendWithSendGrid },
    { name: "Mailgun", fn: sendWithMailgun },
  ];
  
  const errors: string[] = [];
  
  for (const provider of providers) {
    console.log(`Trying ${provider.name}...`);
    const result = await provider.fn(to, subject, html);
    
    if (result.success) {
      console.log(`✅ Email sent successfully via ${provider.name}`);
      return { success: true, provider: provider.name, errors };
    }
    
    const errorMsg = `${provider.name}: ${result.error}`;
    console.warn(`❌ ${errorMsg}`);
    errors.push(errorMsg);
  }
  
  return { success: false, provider: "none", errors };
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, code, agencyName, type }: VerificationEmailRequest = await req.json();
    console.log(`Sending ${type} verification email to ${email} with code ${code}`);

    const subject = type === 'email' 
      ? `${agencyName} - Email Verification Code`
      : `${agencyName} - App Verification Code`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f4f4f7;">
        <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 16px 16px 0 0; padding: 40px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">
              ${type === 'email' ? '📧 Email Verification' : '📱 App Verification'}
            </h1>
            <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">
              Agency Registration
            </p>
          </div>
          <div style="background: white; padding: 40px; border-radius: 0 0 16px 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
            <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
              Hello! You are registering as <strong style="color: #667eea;">${agencyName}</strong> agency.
            </p>
            <p style="color: #666; font-size: 14px; margin: 0 0 30px 0;">
              ${type === 'email' ? 'Use the code below to verify your email:' : 'Use the code below to complete app verification:'}
            </p>
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; padding: 30px; text-align: center; margin: 0 0 30px 0;">
              <p style="color: rgba(255,255,255,0.8); font-size: 14px; margin: 0 0 10px 0; text-transform: uppercase; letter-spacing: 2px;">YOUR VERIFICATION CODE</p>
              <p style="color: white; font-size: 36px; font-weight: 700; margin: 0; letter-spacing: 8px; font-family: 'Courier New', monospace;">${code}</p>
            </div>
            <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; border-radius: 4px; margin: 0 0 30px 0;">
              <p style="color: #856404; font-size: 14px; margin: 0;">⚠️ This code will expire in 60 seconds. Do not share this code with anyone.</p>
            </div>
            <p style="color: #999; font-size: 12px; text-align: center; margin: 0;">If you did not request this verification, please ignore this email.</p>
          </div>
          <div style="text-align: center; padding: 20px;">
            <p style="color: #999; font-size: 12px; margin: 0;">© ${new Date().getFullYear()} MeriLive. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

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
