import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdminSession } from "../_shared/adminAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-token, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function normalizeOAuthSecret(value: string | undefined): string {
  return (value ?? "").trim().replace(/^[']|[']$/g, "").replace(/^[\"]|[\"]$/g, "");
}

function findDeepValue(input: unknown, keys: string[]): string | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  for (const value of Object.values(record)) {
    const nested = findDeepValue(value, keys);
    if (nested) return nested;
  }
  return null;
}

function extractOAuthSecret(value: string | undefined, keys: string[]): string {
  const raw = normalizeOAuthSecret(value);
  if (!raw) return "";

  try {
    const parsed = JSON.parse(raw);
    const fromJson = findDeepValue(parsed, keys);
    if (fromJson) return normalizeOAuthSecret(fromJson).replace(/\r?\n/g, "");
  } catch {
    // Not JSON; continue with defensive regex extraction.
  }

  for (const key of keys) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = raw.match(new RegExp(`${escapedKey}\\s*[:=]\\s*["']?([^"'\\s,}]+)`, "i"));
    if (match?.[1]) return normalizeOAuthSecret(match[1]).replace(/\r?\n/g, "");
  }

  return raw.replace(/\r?\n/g, "");
}

function getGmailOAuthCredentials() {
  const clientId = extractOAuthSecret(Deno.env.get("GMAIL_CLIENT_ID"), ["client_id", "clientId", "OAuth Client ID", "Client ID"]);
  const clientSecret = extractOAuthSecret(Deno.env.get("GMAIL_CLIENT_SECRET"), ["client_secret", "clientSecret", "OAuth Client secret", "Client secret", "Client Secret"]);
  const refreshToken = extractOAuthSecret(Deno.env.get("GMAIL_REFRESH_TOKEN"), ["refresh_token", "refreshToken"]);

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Gmail support email credentials are not configured");
  }
  if (clientId.startsWith("GOCSPX-") || !clientId.endsWith(".apps.googleusercontent.com")) {
    throw new Error("Gmail OAuth Client ID is invalid");
  }
  if (refreshToken.startsWith("ya29.")) {
    throw new Error("Gmail refresh token is invalid; it contains an access token");
  }

  return { clientId, clientSecret, refreshToken };
}

async function getGmailAccessToken(): Promise<string> {
  const { clientId, clientSecret, refreshToken } = getGmailOAuthCredentials();

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("Gmail OAuth token refresh failed:", errText);
    if (errText.includes("invalid_grant")) {
      throw new Error("Gmail support email authorization expired. Reconnect Gmail OAuth credentials.");
    }
    if (errText.includes("invalid_client")) {
      throw new Error("Gmail OAuth client is invalid or mismatched");
    }
    throw new Error(`Gmail token refresh failed (${response.status})`);
  }

  const data = await response.json();
  if (!data?.access_token) throw new Error("Gmail token refresh returned no access token");
  return data.access_token;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function stripHeader(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function buildSupportReplyHtml(ticketNumber: string, subject: string, replyContent: string): string {
  const safeTicket = escapeHtml(ticketNumber || "Support Ticket");
  const safeSubject = escapeHtml(subject || "Support reply");
  const safeReply = escapeHtml(replyContent).replace(/\n/g, "<br />");

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f7f4ed;font-family:Arial,Helvetica,sans-serif;color:#1a1410;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f4ed;padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border:1px solid #e6dcc4;border-radius:16px;overflow:hidden;">
        <tr><td style="background:#0f0a18;padding:30px 36px;text-align:center;border-bottom:3px solid #b8862a;">
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:28px;letter-spacing:5px;color:#f0d78c;text-transform:uppercase;">MeriLive</div>
          <div style="margin-top:8px;font-size:11px;letter-spacing:4px;color:#c9a84c;text-transform:uppercase;">Support Concierge</div>
        </td></tr>
        <tr><td style="padding:34px 40px 18px;">
          <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#8a6d2e;font-weight:700;">${safeTicket}</div>
          <h1 style="margin:10px 0 8px;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.25;color:#1a1410;font-weight:500;">${safeSubject}</h1>
          <p style="margin:0;color:#6b5d44;font-size:14px;line-height:1.7;">Our support team has replied to your ticket.</p>
        </td></tr>
        <tr><td style="padding:12px 40px 34px;">
          <div style="background:#fbfaf6;border:1px solid #e6dcc4;border-radius:14px;padding:22px 24px;font-size:16px;line-height:1.8;color:#1a1410;">${safeReply}</div>
        </td></tr>
        <tr><td style="padding:26px 40px 34px;text-align:center;border-top:1px solid #e6dcc4;">
          <p style="margin:0 0 8px;font-family:Georgia,'Times New Roman',serif;font-size:14px;color:#6b5d44;font-style:italic;">With warmest regards,</p>
          <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:16px;letter-spacing:2px;color:#1a1410;text-transform:uppercase;font-weight:600;">The MeriLive Support Team</p>
          <p style="margin:18px 0 0;font-size:11px;color:#8a7c63;letter-spacing:2px;text-transform:uppercase;">© 2026 MeriLive · All Rights Reserved</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function encodeRawEmail(mimeMessage: string): string {
  const bytes = new TextEncoder().encode(mimeMessage);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sendGmailSupportReplyEmail(params: {
  to: string;
  ticketNumber: string;
  ticketSubject: string;
  replyContent: string;
}): Promise<{ id?: string; threadId?: string }> {
  const accessToken = await getGmailAccessToken();
  const to = stripHeader(params.to);
  const subjectBase = stripHeader(params.ticketSubject || "Support reply");
  const subject = /^re:/i.test(subjectBase) ? subjectBase : `Re: ${subjectBase}`;
  const html = buildSupportReplyHtml(params.ticketNumber, params.ticketSubject, params.replyContent);
  const mimeMessage = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=UTF-8",
    "",
    html,
  ].join("\r\n");

  const sendRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: encodeRawEmail(mimeMessage) }),
  });

  if (!sendRes.ok) {
    const err = await sendRes.text();
    console.error("Gmail support reply send failed:", sendRes.status, err);
    throw new Error(`Gmail support email send failed (${sendRes.status})`);
  }

  return await sendRes.json();
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const adminAuth = await requireAdminSession(req, supabase, { sectionKey: "moderation-hub", requireEdit: true });
    if (!adminAuth.ok) {
      return new Response(JSON.stringify({ success: false, error: adminAuth.error }), {
        status: adminAuth.status,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { ticketId, replyContent } = await req.json();
    if (!ticketId || !replyContent) {
      return new Response(JSON.stringify({ success: false, error: "Missing ticketId or replyContent" }), {
      });
    }

    const { data: ticket, error: ticketError } = await supabase
      .from("support_tickets")
      .select("ticket_number, subject, user_email, user_id")
      .eq("id", ticketId)
      .single();

    if (ticketError || !ticket) {
      return new Response(JSON.stringify({ success: false, error: "Ticket not found" }), {
      });
    }

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
      });
    }

    let result: { id?: string; threadId?: string } | null = null;
    try {
      result = await sendGmailSupportReplyEmail({
        to: userEmail,
        ticketNumber: ticket.ticket_number,
        ticketSubject: ticket.subject,
        replyContent,
      });
    } catch (emailError: any) {
      console.error("Gmail support reply notification skipped:", emailError);
      return new Response(JSON.stringify({
        success: false,
        skipped: true,
        reason: "gmail_send_failed",
        error: emailError?.message || "Gmail support email could not be sent",
      }), {
      });
    }

    console.log(`✅ Gmail support reply sent to ${userEmail} ticket ${ticket.ticket_number}`);
    return new Response(JSON.stringify({ success: true, sentTo: userEmail, result }), {
    });

  } catch (error: any) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
    });
  }
});
