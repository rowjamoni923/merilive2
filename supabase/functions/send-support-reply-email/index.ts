import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-token, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// AWS SES v2 SendEmail using AWS Signature v4
async function sendWithAWSSES(to: string, subject: string, html: string): Promise<{ success: boolean; error?: string }> {
  const accessKeyId = Deno.env.get("AWS_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get("AWS_SECRET_ACCESS_KEY");
  if (!accessKeyId || !secretAccessKey) return { success: false, error: "AWS credentials not configured" };

  const region = "ap-south-1";
  const service = "ses";
  const host = `email.${region}.amazonaws.com`;
  const endpoint = `https://${host}/v2/email/outbound-emails`;

  const body = JSON.stringify({
    Content: {
      Simple: {
        Subject: { Data: subject, Charset: "UTF-8" },
        Body: { Html: { Data: html, Charset: "UTF-8" } },
      },
    },
    Destination: { ToAddresses: [to] },
    FromEmailAddress: "MeriLive Support <merilive.us@gmail.com>",
  });

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "").slice(0, 15) + "Z";
  const dateStamp = amzDate.slice(0, 8);

  const canonicalUri = "/v2/email/outbound-emails";
  const canonicalQuerystring = "";
  const contentHash = await sha256Hex(body);
  const canonicalHeaders = `content-type:application/json\nhost:${host}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-amz-date";
  const canonicalRequest = `POST\n${canonicalUri}\n${canonicalQuerystring}\n${canonicalHeaders}\n${signedHeaders}\n${contentHash}`;

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${await sha256Hex(canonicalRequest)}`;

  const signingKey = await getSignatureKey(secretAccessKey, dateStamp, region, service);
  const signature = await hmacHex(signingKey, stringToSign);

  const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Amz-Date": amzDate,
        "Authorization": authorizationHeader,
      },
      body,
    });

    const responseText = await response.text();
    if (!response.ok) {
      console.error("AWS SES error:", responseText);
      return { success: false, error: `SES HTTP ${response.status}: ${responseText}` };
    }
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// SHA-256 helpers
async function sha256Hex(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSign(key: ArrayBuffer, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
}

async function hmacHex(key: ArrayBuffer, message: string): Promise<string> {
  const sig = await hmacSign(key, message);
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function getSignatureKey(key: string, dateStamp: string, region: string, service: string): Promise<ArrayBuffer> {
  const kDate = await hmacSign(new TextEncoder().encode("AWS4" + key).buffer, dateStamp);
  const kRegion = await hmacSign(kDate, region);
  const kService = await hmacSign(kRegion, service);
  return await hmacSign(kService, "aws4_request");
}

function buildEmailHtml(ticketNumber: string, subject: string, replyContent: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f0f2f5;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:30px 16px;">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 50%,#a855f7 100%);border-radius:16px 16px 0 0;padding:32px 28px;text-align:center;">
      <div style="width:56px;height:56px;background:rgba(255,255,255,0.2);border-radius:50%;margin:0 auto 16px;display:flex;align-items:center;justify-content:center;">
        <span style="font-size:28px;">💬</span>
      </div>
      <h1 style="color:#fff;margin:0;font-size:22px;font-weight:700;">Support Reply</h1>
      <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:14px;">We've responded to your ticket</p>
    </div>

    <!-- Body -->
    <div style="background:#ffffff;padding:32px 28px;border-radius:0 0 16px 16px;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
      <!-- Ticket Info -->
      <div style="background:#f8f9fc;border-radius:10px;padding:16px;margin-bottom:24px;border-left:4px solid #6366f1;">
        <p style="margin:0 0 4px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Ticket #${ticketNumber}</p>
        <p style="margin:0;font-size:15px;color:#1f2937;font-weight:600;">${subject}</p>
      </div>

      <!-- Reply Content -->
      <div style="background:linear-gradient(135deg,#ede9fe 0%,#f3e8ff 100%);border-radius:12px;padding:24px;margin-bottom:24px;">
        <p style="margin:0 0 8px;font-size:12px;color:#7c3aed;font-weight:700;text-transform:uppercase;letter-spacing:1px;">
          ✉️ Our Response
        </p>
        <p style="margin:0;font-size:15px;color:#374151;line-height:1.7;white-space:pre-wrap;">${replyContent}</p>
      </div>

      <!-- CTA -->
      <div style="text-align:center;margin-bottom:20px;">
        <p style="color:#6b7280;font-size:13px;margin:0 0 8px;">Have more questions? Open the app and continue the conversation!</p>
      </div>

      <!-- Divider -->
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">

      <!-- Footer -->
      <p style="color:#9ca3af;font-size:11px;text-align:center;margin:0;line-height:1.6;">
        This is an automated message from MeriLive Support.<br>
        Please do not reply directly to this email.<br>
        © ${new Date().getFullYear()} MeriLive. All rights reserved.
      </p>
    </div>
  </div>
</body>
</html>`;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { ticketId, replyContent } = await req.json();

    if (!ticketId || !replyContent) {
      return new Response(JSON.stringify({ success: false, error: "Missing ticketId or replyContent" }), {
        status: 400, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Get ticket details
    const { data: ticket, error: ticketError } = await supabase
      .from("support_tickets")
      .select("ticket_number, subject, user_email, user_id")
      .eq("id", ticketId)
      .single();

    if (ticketError || !ticket) {
      return new Response(JSON.stringify({ success: false, error: "Ticket not found" }), {
        status: 404, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Try to get user email from ticket or profile
    let userEmail = ticket.user_email;
    if (!userEmail) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", ticket.user_id)
        .single();
      userEmail = profile?.email;
    }

    if (!userEmail || userEmail.endsWith("@meri.local")) {
      return new Response(JSON.stringify({ success: false, error: "User has no valid email address", skipped: true }), {
        status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const subject = `Re: ${ticket.subject} [Ticket #${ticket.ticket_number}]`;
    const html = buildEmailHtml(ticket.ticket_number, ticket.subject, replyContent);

    const result = await sendWithAWSSES(userEmail, subject, html);

    if (!result.success) {
      console.error("AWS SES failed:", result.error);
      return new Response(JSON.stringify({ success: false, error: result.error }), {
        status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    console.log(`✅ Support reply email sent to ${userEmail} for ticket ${ticket.ticket_number}`);
    return new Response(JSON.stringify({ success: true, sentTo: userEmail }), {
      status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  } catch (error: any) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
