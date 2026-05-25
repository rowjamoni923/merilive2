const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface GmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  body: string;
  isRead: boolean;
  labels: string[];
}

// Normalize OAuth secrets copied from dashboards/playground
function normalizeOAuthSecret(value: string | undefined): string {
  return (value ?? '')
    .trim()
    .replace(/\r?\n/g, '')
    .replace(/^['\"]|['\"]$/g, '');
}

// Get fresh access token using refresh token
async function getAccessToken(): Promise<string> {
  const clientId = normalizeOAuthSecret(Deno.env.get('GMAIL_CLIENT_ID'));
  const clientSecret = normalizeOAuthSecret(Deno.env.get('GMAIL_CLIENT_SECRET'));
  const refreshToken = normalizeOAuthSecret(Deno.env.get('GMAIL_REFRESH_TOKEN'));

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Gmail OAuth credentials not configured');
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('OAuth token refresh failed:', errText);

    if (errText.includes('invalid_grant')) {
      throw new Error('Gmail OAuth refresh token expired or revoked. Reconnect Gmail OAuth credentials.');
    }

    throw new Error(`Failed to refresh Gmail access token (${response.status})`);
  }

  const data = await response.json();
  return data.access_token;
}

// Decode base64url encoded content
function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return '';
  }
}

// Extract email body from message parts
function extractBody(payload: any): string {
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  if (payload.parts) {
    // Prefer text/plain, fallback to text/html
    const textPart = payload.parts.find((p: any) => p.mimeType === 'text/plain');
    if (textPart?.body?.data) {
      return decodeBase64Url(textPart.body.data);
    }

    const htmlPart = payload.parts.find((p: any) => p.mimeType === 'text/html');
    if (htmlPart?.body?.data) {
      return decodeBase64Url(htmlPart.body.data);
    }

    // Recursively check nested parts (multipart/alternative, etc.)
    for (const part of payload.parts) {
      if (part.parts) {
        const nested = extractBody(part);
        if (nested) return nested;
      }
    }
  }

  return '';
}

// Get header value from Gmail message
function getHeader(headers: any[], name: string): string {
  return headers?.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
}

// Fetch emails from Gmail
async function fetchEmails(accessToken: string, query: string, maxResults: number): Promise<GmailMessage[]> {
  const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&q=${encodeURIComponent(query)}`;
  
  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!listRes.ok) {
    const err = await listRes.text();
    console.error('Gmail list error:', err);
    throw new Error('Failed to fetch email list');
  }

  const listData = await listRes.json();
  
  if (!listData.messages || listData.messages.length === 0) {
    return [];
  }

  // Fetch full message details in parallel (batch of 10)
  const messages: GmailMessage[] = [];
  const batchSize = 10;
  
  for (let i = 0; i < listData.messages.length; i += batchSize) {
    const batch = listData.messages.slice(i, i + batchSize);
    const details = await Promise.all(
      batch.map(async (msg: any) => {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!msgRes.ok) return null;
        return msgRes.json();
      })
    );

    for (const detail of details) {
      if (!detail) continue;
      
      const headers = detail.payload?.headers || [];
      messages.push({
        id: detail.id,
        threadId: detail.threadId,
        snippet: detail.snippet || '',
        from: getHeader(headers, 'From'),
        to: getHeader(headers, 'To'),
        subject: getHeader(headers, 'Subject'),
        date: getHeader(headers, 'Date'),
        body: extractBody(detail.payload),
        isRead: !detail.labelIds?.includes('UNREAD'),
        labels: detail.labelIds || [],
      });
    }
  }

  return messages;
}

// Fetch thread messages
async function fetchThread(accessToken: string, threadId: string): Promise<GmailMessage[]> {
  const threadRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=full`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!threadRes.ok) {
    throw new Error('Failed to fetch thread');
  }

  const threadData = await threadRes.json();
  
  return (threadData.messages || []).map((detail: any) => {
    const headers = detail.payload?.headers || [];
    return {
      id: detail.id,
      threadId: detail.threadId,
      snippet: detail.snippet || '',
      from: getHeader(headers, 'From'),
      to: getHeader(headers, 'To'),
      subject: getHeader(headers, 'Subject'),
      date: getHeader(headers, 'Date'),
      body: extractBody(detail.payload),
      isRead: !detail.labelIds?.includes('UNREAD'),
      labels: detail.labelIds || [],
    };
  });
}

// Generate branded reply HTML template
function generateReplyHtml(bodyText: string): string {
  const logoUrl = 'https://merilive.lovable.app/images/merilive-logo.png';
  const formattedBody = bodyText.replace(/\n/g, '<br/>');
  
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f0f2f5;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f2f5;padding:30px 15px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #e5e7eb;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

<!-- Logo Header -->
<tr><td style="padding:28px 32px 16px;text-align:center;background:linear-gradient(135deg,#7c3aed 0%,#a855f7 100%);">
<img src="${logoUrl}" alt="MeriLive" width="56" height="56" style="border-radius:14px;box-shadow:0 4px 16px rgba(0,0,0,0.2);" />
<p style="margin:10px 0 0;font-size:18px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">MeriLive Support</p>
</td></tr>

<!-- Message Body -->
<tr><td style="padding:24px 32px;">
<p style="margin:0;font-size:15px;color:#1f2937;line-height:1.7;">${formattedBody}</p>
</td></tr>

<!-- Divider -->
<tr><td style="padding:0 32px;"><div style="height:1px;background:#e5e7eb;"></div></td></tr>

<!-- Footer -->
<tr><td style="padding:20px 32px;text-align:center;">
<p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.5;">
With love from <strong style="color:#7c3aed;">MeriLive Support Team</strong> 💜
</p>
<div style="margin-top:10px;">
<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#a855f7;margin:0 2px;"></span>
<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#7c3aed;margin:0 2px;"></span>
<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#6d28d9;margin:0 2px;"></span>
</div>
<p style="margin:8px 0 0;font-size:10px;color:#d1d5db;">© 2026 MeriLive. All rights reserved.</p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

// Send reply email (with optional image attachment)
async function sendReply(
  accessToken: string, 
  threadId: string, 
  messageId: string,
  to: string, 
  subject: string, 
  body: string,
  imageBase64?: string,
  imageName?: string,
  imageMimeType?: string,
): Promise<{ success: boolean }> {
  // Get the original message to extract Message-ID for proper threading
  const origRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=metadata&metadataHeaders=Message-ID`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  
  let inReplyTo = '';
  if (origRes.ok) {
    const origData = await origRes.json();
    inReplyTo = getHeader(origData.payload?.headers || [], 'Message-ID');
  }

  const safeSubject = subject.trim() || '(No Subject)';
  const replySubject = /^re:/i.test(safeSubject) ? safeSubject : `Re: ${safeSubject}`;

  let mimeMessage: string;

  if (imageBase64 && imageName && imageMimeType) {
    // Build multipart MIME with image attachment
    const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    mimeMessage = [
      `To: ${to}`,
      `Subject: ${replySubject}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      inReplyTo ? `In-Reply-To: ${inReplyTo}` : '',
      inReplyTo ? `References: ${inReplyTo}` : '',
      '',
      `--${boundary}`,
      `Content-Type: text/html; charset=UTF-8`,
      `Content-Transfer-Encoding: 7bit`,
      '',
      generateReplyHtml(body),
      '',
      `--${boundary}`,
      `Content-Type: ${imageMimeType}; name="${imageName}"`,
      `Content-Disposition: attachment; filename="${imageName}"`,
      `Content-Transfer-Encoding: base64`,
      '',
      imageBase64,
      '',
      `--${boundary}--`,
    ].filter(Boolean).join('\r\n');
  } else {
    // Simple text reply with branded HTML
    mimeMessage = [
      `To: ${to}`,
      `Subject: ${replySubject}`,
      `Content-Type: text/html; charset=UTF-8`,
      inReplyTo ? `In-Reply-To: ${inReplyTo}` : '',
      inReplyTo ? `References: ${inReplyTo}` : '',
      '',
      generateReplyHtml(body),
    ].filter(Boolean).join('\r\n');
  }

  // Base64url encode
  const encoder = new TextEncoder();
  const bytes = encoder.encode(mimeMessage);
  const base64 = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const sendRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        raw: base64,
        threadId: threadId,
      }),
    }
  );

  if (!sendRes.ok) {
    const err = await sendRes.text();
    console.error('Gmail send error:', err);
    throw new Error('Failed to send reply');
  }

  return { success: true };
}

// Generate beautiful auto-reply HTML
function generateAutoReplyHtml(senderName: string): string {
  const logoUrl = 'https://merilive.lovable.app/images/merilive-logo.png';
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f0f2f5;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f2f5;padding:40px 20px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid #e5e7eb;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

<!-- Logo Section -->
<tr><td style="padding:40px 40px 20px;text-align:center;background:linear-gradient(135deg,#7c3aed 0%,#a855f7 50%,#c084fc 100%);">
<img src="${logoUrl}" alt="MeriLive" width="100" height="100" style="border-radius:20px;box-shadow:0 8px 32px rgba(0,0,0,0.2);" />
<h1 style="margin:16px 0 0;font-size:28px;font-weight:800;color:#ffffff;letter-spacing:1px;">MeriLive</h1>
<p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,0.85);letter-spacing:3px;text-transform:uppercase;">Premium Entertainment</p>
</td></tr>

<!-- Main Content -->
<tr><td style="padding:30px 40px;">
<h2 style="margin:0 0 20px;font-size:22px;color:#1f2937;font-weight:600;">Thank You for Reaching Out! 💜</h2>
<p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">
Dear <strong style="color:#7c3aed;">${senderName || 'Valued User'}</strong>,
</p>
<p style="margin:0 0 16px;font-size:15px;color:#4b5563;line-height:1.7;">
We have successfully received your message and our dedicated support team is already on it! Your concern is very important to us, and we want to ensure you receive the best possible assistance.
</p>

<!-- Timeline Card -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
<tr><td style="background:linear-gradient(135deg,#ede9fe,#f3e8ff);border-radius:16px;padding:24px;border:1px solid #ddd6fe;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr>
<td width="50" valign="top" style="padding-right:16px;">
<div style="width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,#a855f7,#7c3aed);text-align:center;line-height:44px;font-size:20px;">⏱️</div>
</td>
<td>
<p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#6d28d9;">Expected Response Time</p>
<p style="margin:0;font-size:14px;color:#4b5563;line-height:1.6;">Our support team will review and respond to your inquiry within <strong style="color:#7c3aed;">24 to 48 hours</strong>. We appreciate your patience as we work to resolve your concern thoroughly.</p>
</td>
</tr>
</table>
</td></tr>
</table>

<!-- What to Expect -->
<p style="margin:0 0 12px;font-size:16px;font-weight:700;color:#1f2937;">What happens next:</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
<tr><td style="padding:8px 0 8px 0;font-size:14px;color:#374151;line-height:1.6;">
<span style="display:inline-block;width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#a855f7,#7c3aed);text-align:center;line-height:28px;font-size:12px;color:#fff;margin-right:12px;vertical-align:middle;font-weight:bold;">1</span>
Our team will carefully review your message
</td></tr>
<tr><td style="padding:8px 0 8px 0;font-size:14px;color:#374151;line-height:1.6;">
<span style="display:inline-block;width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#a855f7,#7c3aed);text-align:center;line-height:28px;font-size:12px;color:#fff;margin-right:12px;vertical-align:middle;font-weight:bold;">2</span>
We will verify and investigate your concern
</td></tr>
<tr><td style="padding:8px 0 8px 0;font-size:14px;color:#374151;line-height:1.6;">
<span style="display:inline-block;width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#a855f7,#7c3aed);text-align:center;line-height:28px;font-size:12px;color:#fff;margin-right:12px;vertical-align:middle;font-weight:bold;">3</span>
A personalized response will be sent to you directly
</td></tr>
</table>
</td></tr>

<!-- Divider -->
<tr><td style="padding:0 40px;">
<div style="height:1px;background:#e5e7eb;"></div>
</td></tr>

<!-- Footer -->
<tr><td style="padding:30px 40px;text-align:center;">
<p style="margin:0 0 8px;font-size:14px;color:#6b7280;line-height:1.6;">
With love from the <strong style="color:#7c3aed;">MeriLive Support Team</strong> 💜
</p>
<p style="margin:0 0 16px;font-size:12px;color:#9ca3af;">
This is an automated acknowledgment. Please do not reply to this email.<br/>
Our team will respond to your original message shortly.
</p>
<div style="margin-top:16px;">
<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#a855f7;margin:0 3px;"></span>
<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#7c3aed;margin:0 3px;"></span>
<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#6d28d9;margin:0 3px;"></span>
</div>
<p style="margin:12px 0 0;font-size:11px;color:#d1d5db;">© 2026 MeriLive. All rights reserved.</p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

// Send auto-reply to a new email
async function sendAutoReply(accessToken: string, originalMessage: GmailMessage): Promise<void> {
  const senderEmail = originalMessage.from.match(/<([^>]+)>/)?.[1] || originalMessage.from;
  const senderName = originalMessage.from.replace(/<[^>]+>/, '').trim().replace(/"/g, '');
  
  // Don't auto-reply to ourselves or noreply addresses
  const ourEmail = 'merilive.us@gmail.com';
  if (
    senderEmail.toLowerCase() === ourEmail.toLowerCase() ||
    senderEmail.toLowerCase().includes('noreply') ||
    senderEmail.toLowerCase().includes('no-reply') ||
    senderEmail.toLowerCase().includes('mailer-daemon')
  ) {
    return;
  }

  const normalizedSubject = originalMessage.subject?.trim() || '(No Subject)';
  const subject = /^re:/i.test(normalizedSubject)
    ? normalizedSubject
    : `Re: ${normalizedSubject}`;

  const htmlBody = generateAutoReplyHtml(senderName);

  // Get Message-ID for threading
  const origRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${originalMessage.id}?format=metadata&metadataHeaders=Message-ID`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  
  let inReplyTo = '';
  if (origRes.ok) {
    const origData = await origRes.json();
    inReplyTo = getHeader(origData.payload?.headers || [], 'Message-ID');
  }

  const mimeMessage = [
    `To: ${senderEmail}`,
    `Subject: ${subject}`,
    `Content-Type: text/html; charset=UTF-8`,
    inReplyTo ? `In-Reply-To: ${inReplyTo}` : '',
    inReplyTo ? `References: ${inReplyTo}` : '',
    '',
    htmlBody,
  ].filter(Boolean).join('\r\n');

  const encoder = new TextEncoder();
  const bytes = encoder.encode(mimeMessage);
  const base64 = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const sendRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        raw: base64,
        threadId: originalMessage.threadId,
      }),
    }
  );

  if (!sendRes.ok) {
    const err = await sendRes.text();
    console.error('Auto-reply send error:', err);
  } else {
    console.log(`Auto-reply sent to ${senderEmail}`);
    
    // Label the original message to prevent duplicate auto-replies
    await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${originalMessage.id}/modify`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          addLabelIds: [],
          removeLabelIds: ['UNREAD'],
        }),
      }
    );
  }
}

// Check and send auto-replies for new unread emails
async function processAutoReplies(accessToken: string): Promise<{ replied: number }> {
  // Fetch unread inbox emails
  const unreadEmails = await fetchEmails(accessToken, 'is:unread in:inbox -from:merilive.us@gmail.com', 10);
  
  let replied = 0;
  for (const email of unreadEmails) {
    // Only auto-reply to emails that are the first message in their thread
    const thread = await fetchThread(accessToken, email.threadId);
    // If thread has only 1 message (the incoming one), send auto-reply
    if (thread.length <= 1) {
      try {
        await sendAutoReply(accessToken, email);
        replied++;
      } catch (err) {
        console.error(`Failed auto-reply for ${email.id}:`, err);
      }
    }
  }
  
  return { replied };
}

// Mark message as read
async function markAsRead(accessToken: string, messageId: string): Promise<void> {
  await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        removeLabelIds: ['UNREAD'],
      }),
    }
  );
}

// Get unread count
async function getUnreadCount(accessToken: string): Promise<number> {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=1&q=is:unread in:inbox&labelIds=INBOX`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) return 0;
  const data = await res.json();
  return data.resultSizeEstimate || 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const { requireAdminSession } = await import("../_shared/adminAuth.ts");
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { action, ...params } = await req.json();

    // Read-only actions only require an active admin session.
    // Mutating / outbound actions additionally require moderation-hub edit permission.
    const mutatingActions = new Set(['send_reply', 'auto_reply', 'mark_read']);
    const adminAuth = await requireAdminSession(req, adminClient, {
      sectionKey: mutatingActions.has(action) ? 'moderation-hub' : undefined,
      requireEdit: mutatingActions.has(action),
    });
    if (!adminAuth.ok) {
      return new Response(
        JSON.stringify({ error: adminAuth.error || 'Unauthorized' }),
        { status: adminAuth.status || 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const accessToken = await getAccessToken();

    let result: any;

    switch (action) {
      case 'fetch_emails': {
        const query = params.query || 'in:inbox';
        const maxResults = params.maxResults || 20;
        result = await fetchEmails(accessToken, query, maxResults);
        break;
      }

      case 'fetch_thread': {
        if (!params.threadId) throw new Error('threadId required');
        result = await fetchThread(accessToken, params.threadId);
        break;
      }

      case 'send_reply': {
        if (!params.threadId || !params.messageId || !params.to || (!params.body && !params.imageBase64)) {
          throw new Error('Missing required fields for reply');
        }
        result = await sendReply(
          accessToken,
          params.threadId,
          params.messageId,
          params.to,
          params.subject || '(No Subject)',
          params.body || '',
          params.imageBase64,
          params.imageName,
          params.imageMimeType,
        );
        break;
      }

      case 'mark_read': {
        if (!params.messageId) throw new Error('messageId required');
        await markAsRead(accessToken, params.messageId);
        result = { success: true };
        break;
      }

      case 'unread_count': {
        result = { count: await getUnreadCount(accessToken) };
        break;
      }

      case 'auto_reply': {
        result = await processAutoReplies(accessToken);
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('gmail-support error:', err);
    return new Response(
      JSON.stringify({ error: err.message || 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
