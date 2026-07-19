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

// Normalize OAuth secrets copied from dashboards/playground.
// Admins often paste a whole Google OAuth JSON blob, a "Client ID: ..." line,
// or a quoted value. Extract the credential defensively so a harmless paste
// format issue does not break the support inbox.
function normalizeOAuthSecret(value: string | undefined): string {
  return (value ?? '')
    .trim()
    .replace(/^['\"]|['\"]$/g, '');
}

function findDeepValue(input: unknown, keys: string[]): string | null {
  if (!input || typeof input !== 'object') return null;
  const record = input as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  for (const value of Object.values(record)) {
    const nested = findDeepValue(value, keys);
    if (nested) return nested;
  }
  return null;
}

function extractOAuthSecret(value: string | undefined, keys: string[]): string {
  const raw = normalizeOAuthSecret(value);
  if (!raw) return '';

  try {
    const parsed = JSON.parse(raw);
    const fromJson = findDeepValue(parsed, keys);
    if (fromJson) return normalizeOAuthSecret(fromJson).replace(/\r?\n/g, '');
  } catch {
    // Not JSON; continue with regex extraction.
  }

  for (const key of keys) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = raw.match(new RegExp(`${escapedKey}\\s*[:=]\\s*["']?([^"'\\s,}]+)`, 'i'));
    if (match?.[1]) return normalizeOAuthSecret(match[1]).replace(/\r?\n/g, '');
  }

  return raw.replace(/\r?\n/g, '');
}

function getGmailOAuthCredentials() {
  const clientId = extractOAuthSecret(Deno.env.get('GMAIL_CLIENT_ID'), ['client_id', 'clientId', 'OAuth Client ID', 'Client ID']);
  const clientSecret = extractOAuthSecret(Deno.env.get('GMAIL_CLIENT_SECRET'), ['client_secret', 'clientSecret', 'OAuth Client secret', 'Client secret', 'Client Secret']);
  const refreshToken = extractOAuthSecret(Deno.env.get('GMAIL_REFRESH_TOKEN'), ['refresh_token', 'refreshToken']);

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Gmail OAuth credentials not configured');
  }

  if (clientId.startsWith('GOCSPX-') || !clientId.endsWith('.apps.googleusercontent.com')) {
    throw new Error('Gmail OAuth Client ID is invalid. Paste the OAuth Client ID that ends with .apps.googleusercontent.com.');
  }

  if (refreshToken.startsWith('ya29.')) {
    throw new Error('GMAIL_REFRESH_TOKEN contains an access token. Paste the refresh_token value that starts with 1//.');
  }

  return { clientId, clientSecret, refreshToken };
}

// Get fresh access token using refresh token
async function getAccessToken(): Promise<string> {
  const { clientId, clientSecret, refreshToken } = getGmailOAuthCredentials();

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

    if (errText.includes('invalid_client')) {
      throw new Error('Gmail OAuth client is invalid or mismatched. Update Client ID, Client Secret, then generate a new Refresh Token from the same Google OAuth client.');
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

// Generate branded reply HTML template — luxurious midnight + gold
function generateReplyHtml(bodyText: string): string {
  const logoUrl = 'https://merilive.top/merilive-logo.png';
  const formattedBody = bodyText.replace(/\n/g, '<br/>');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4efe6;font-family:Georgia,'Times New Roman',serif;color:#1a1410;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f4efe6" style="background-color:#f4efe6;padding:48px 16px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="background-color:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e6dcc4;">

<!-- Gold hairline top -->
<tr><td bgcolor="#b8862a" style="height:3px;background-color:#b8862a;font-size:0;line-height:0;">&nbsp;</td></tr>

<!-- Header -->
<tr><td bgcolor="#0f0a18" style="padding:40px 40px 28px;text-align:center;background-color:#0f0a18;">
<table role="presentation" align="center" cellpadding="0" cellspacing="0"><tr><td bgcolor="#c9a84c" style="padding:5px;border-radius:18px;background-color:#c9a84c;">
<img src="${logoUrl}" alt="MeriLive" width="68" height="68" style="display:block;border-radius:14px;background-color:#0f0a18;" />
</td></tr></table>
<p style="margin:18px 0 4px;font-family:Georgia,serif;font-size:22px;font-weight:400;letter-spacing:4px;color:#f0d78c;text-transform:uppercase;">MeriLive</p>
<p style="margin:0;font-size:11px;letter-spacing:5px;color:#c9a84c;text-transform:uppercase;font-family:'Helvetica Neue',Arial,sans-serif;">— Support Concierge —</p>
</td></tr>

<!-- Body -->
<tr><td bgcolor="#ffffff" style="padding:36px 44px 28px;background-color:#ffffff;">
<p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:16px;color:#1a1410;line-height:1.85;">${formattedBody}</p>
</td></tr>

<!-- Divider -->
<tr><td bgcolor="#ffffff" style="padding:0 44px;background-color:#ffffff;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td bgcolor="#e6dcc4" style="height:1px;background-color:#e6dcc4;font-size:0;line-height:0;">&nbsp;</td></tr></table>
</td></tr>

<!-- Footer -->
<tr><td bgcolor="#ffffff" style="padding:28px 40px 36px;text-align:center;background-color:#ffffff;">
<p style="margin:0 0 8px;font-family:Georgia,serif;font-size:14px;color:#6b5d44;font-style:italic;">With warmest regards,</p>
<p style="margin:0;font-family:Georgia,serif;font-size:16px;letter-spacing:2px;color:#1a1410;text-transform:uppercase;font-weight:600;">The MeriLive Support Team</p>

<div style="margin:24px 0 6px;">
<a href="https://play.google.com/store/apps/details?id=com.merilive.app" target="_blank" style="text-decoration:none;display:inline-block;background-color:#0f0a18;border:1px solid #c9a84c;border-radius:10px;padding:12px 22px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-table;"><tr>
<td style="vertical-align:middle;padding-right:10px;color:#f0d78c;font-size:22px;font-family:Arial,sans-serif;line-height:1;">&#9656;</td>
<td style="vertical-align:middle;text-align:left;font-family:'Helvetica Neue',Arial,sans-serif;line-height:1.1;">
<div style="font-size:9px;color:#c9a84c;letter-spacing:2px;text-transform:uppercase;">Get it on</div>
<div style="font-size:14px;color:#f0d78c;letter-spacing:1px;font-weight:600;font-family:Georgia,serif;">Google Play</div>
</td></tr></table>
</a>
</div>
<p style="margin:18px 0 0;font-size:11px;color:#8a7c63;letter-spacing:2px;text-transform:uppercase;font-family:'Helvetica Neue',Arial,sans-serif;">© 2026 MeriLive · All Rights Reserved</p>
</td></tr>

<!-- Gold hairline bottom -->
<tr><td bgcolor="#b8862a" style="height:3px;background-color:#b8862a;font-size:0;line-height:0;">&nbsp;</td></tr>

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
    // Wrap base64 to 76-char lines per RFC 2045 (Gmail is strict about this for large attachments)
    const wrappedB64 = imageBase64.replace(/\s+/g, '').replace(/(.{76})/g, '$1\r\n');
    // Build multipart/mixed > multipart/related so image renders inline AND as attachment
    const boundary = `b_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    mimeMessage = [
      `To: ${to}`,
      `Subject: ${replySubject}`,
      `MIME-Version: 1.0`,
      inReplyTo ? `In-Reply-To: ${inReplyTo}` : '',
      inReplyTo ? `References: ${inReplyTo}` : '',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
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
      wrappedB64,
      '',
      `--${boundary}--`,
      '',
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

  // Base64url encode — chunked to avoid call-stack overflow on large attachments
  const encoder = new TextEncoder();
  const bytes = encoder.encode(mimeMessage);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)) as any);
  }
  const base64 = btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  // For payloads > 5MB Gmail requires multipart upload; use uploadType=multipart endpoint as safety
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
    console.error('Gmail send error:', sendRes.status, err);
    throw new Error(`Gmail send failed (${sendRes.status}): ${err.slice(0, 300)}`);
  }

  return { success: true };
}

// Generate beautiful auto-reply HTML — luxurious midnight + gold
function generateAutoReplyHtml(senderName: string): string {
  const logoUrl = 'https://merilive.top/merilive-logo.png';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f4efe6;font-family:Georgia,'Times New Roman',serif;color:#1a1410;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f4efe6" style="background-color:#f4efe6;padding:48px 16px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="background-color:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e6dcc4;">

<!-- Gold hairline top -->
<tr><td bgcolor="#b8862a" style="height:3px;background-color:#b8862a;font-size:0;line-height:0;">&nbsp;</td></tr>

<!-- Header (dark navy band with gold logo + wordmark) -->
<tr><td bgcolor="#0f0a18" style="padding:44px 40px 32px;text-align:center;background-color:#0f0a18;">
<table role="presentation" align="center" cellpadding="0" cellspacing="0"><tr><td bgcolor="#c9a84c" style="padding:5px;border-radius:22px;background-color:#c9a84c;">
<img src="${logoUrl}" alt="MeriLive" width="84" height="84" style="display:block;border-radius:18px;background-color:#0f0a18;" />
</td></tr></table>
<h1 style="margin:20px 0 6px;font-family:Georgia,serif;font-size:30px;font-weight:400;letter-spacing:6px;color:#f0d78c;text-transform:uppercase;">MeriLive</h1>
<p style="margin:0;font-size:11px;letter-spacing:5px;color:#c9a84c;text-transform:uppercase;font-family:'Helvetica Neue',Arial,sans-serif;">— Premium Entertainment —</p>
</td></tr>

<!-- Main Content (white card with dark text) -->
<tr><td bgcolor="#ffffff" style="padding:36px 44px 8px;background-color:#ffffff;">
<h2 style="margin:0 0 22px;font-family:Georgia,serif;font-size:24px;color:#1a1410;font-weight:600;text-align:center;">Thank You for Reaching Out</h2>
<p style="margin:0 0 16px;font-size:16px;color:#1a1410;line-height:1.75;">
Dear <strong style="color:#1a1410;font-weight:700;">${senderName || 'Valued Customer'}</strong>,
</p>
<p style="margin:0 0 18px;font-size:15px;color:#3d342a;line-height:1.8;">
Thank you for contacting the <strong style="color:#1a1410;">MeriLive Support Team</strong>. We have received your message and a member of our support team is already reviewing your inquiry with the care and attention you deserve.
</p>

<!-- Timeline Card -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
<tr><td bgcolor="#faf6ec" style="background-color:#faf6ec;border-radius:14px;padding:22px;border:1px solid #e6dcc4;border-left:4px solid #b8862a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr>
<td width="56" valign="top" style="padding-right:16px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#0f0a18" width="48" height="48" align="center" style="width:48px;height:48px;border-radius:12px;background-color:#0f0a18;color:#f0d78c;font-size:22px;font-family:Georgia,serif;font-weight:700;line-height:48px;">&#8987;</td></tr></table>
</td>
<td>
<p style="margin:0 0 4px;font-family:Georgia,serif;font-size:12px;font-weight:700;color:#8a6d2e;letter-spacing:2px;text-transform:uppercase;">Response Timeline</p>
<p style="margin:0;font-size:14px;color:#1a1410;line-height:1.6;">A member of our <strong>Support Team</strong> will personally reply within <strong>24 to 72 hours</strong>. Thank you for your patience.</p>
</td>
</tr>
</table>
</td></tr>
</table>

<!-- What to Expect -->
<p style="margin:24px 0 14px;font-family:Georgia,serif;font-size:13px;font-weight:700;color:#8a6d2e;letter-spacing:3px;text-transform:uppercase;text-align:center;">What Happens Next</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
<tr><td style="padding:8px 0;font-size:14px;color:#1a1410;line-height:1.6;">
<table role="presentation" cellpadding="0" cellspacing="0" style="display:inline-table;vertical-align:middle;"><tr><td bgcolor="#0f0a18" width="28" height="28" align="center" style="width:28px;height:28px;border-radius:50%;background-color:#0f0a18;color:#f0d78c;font-size:12px;font-family:Georgia,serif;font-weight:700;line-height:28px;">I</td></tr></table>
<span style="margin-left:12px;vertical-align:middle;">Your message is reviewed by our senior support team</span>
</td></tr>
<tr><td style="padding:8px 0;font-size:14px;color:#1a1410;line-height:1.6;">
<table role="presentation" cellpadding="0" cellspacing="0" style="display:inline-table;vertical-align:middle;"><tr><td bgcolor="#0f0a18" width="28" height="28" align="center" style="width:28px;height:28px;border-radius:50%;background-color:#0f0a18;color:#f0d78c;font-size:11px;font-family:Georgia,serif;font-weight:700;line-height:28px;">II</td></tr></table>
<span style="margin-left:12px;vertical-align:middle;">Your concern is investigated with full discretion</span>
</td></tr>
<tr><td style="padding:8px 0;font-size:14px;color:#1a1410;line-height:1.6;">
<table role="presentation" cellpadding="0" cellspacing="0" style="display:inline-table;vertical-align:middle;"><tr><td bgcolor="#0f0a18" width="28" height="28" align="center" style="width:28px;height:28px;border-radius:50%;background-color:#0f0a18;color:#f0d78c;font-size:10px;font-family:Georgia,serif;font-weight:700;line-height:28px;">III</td></tr></table>
<span style="margin-left:12px;vertical-align:middle;">A personally crafted response is delivered to you</span>
</td></tr>
</table>
</td></tr>

<!-- Divider -->
<tr><td bgcolor="#ffffff" style="padding:8px 44px 0;background-color:#ffffff;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td bgcolor="#e6dcc4" style="height:1px;background-color:#e6dcc4;font-size:0;line-height:0;">&nbsp;</td></tr></table>
</td></tr>

<!-- Footer -->
<tr><td bgcolor="#ffffff" style="padding:26px 40px 36px;text-align:center;background-color:#ffffff;">
<p style="margin:0 0 6px;font-family:Georgia,serif;font-size:14px;color:#6b5d44;font-style:italic;">With warmest regards,</p>
<p style="margin:0;font-family:Georgia,serif;font-size:16px;letter-spacing:2px;color:#1a1410;text-transform:uppercase;font-weight:600;">The MeriLive Support Team</p>
<p style="margin:12px 0 0;font-size:12px;color:#6b5d44;font-family:'Helvetica Neue',Arial,sans-serif;">An automated acknowledgment. A personal reply follows shortly.</p>

<div style="margin:22px 0 6px;">
<a href="https://play.google.com/store/apps/details?id=com.merilive.app" target="_blank" style="text-decoration:none;display:inline-block;background-color:#0f0a18;border:1px solid #c9a84c;border-radius:10px;padding:12px 22px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-table;"><tr>
<td style="vertical-align:middle;padding-right:10px;color:#f0d78c;font-size:22px;font-family:Arial,sans-serif;line-height:1;">&#9656;</td>
<td style="vertical-align:middle;text-align:left;font-family:'Helvetica Neue',Arial,sans-serif;line-height:1.1;">
<div style="font-size:9px;color:#c9a84c;letter-spacing:2px;text-transform:uppercase;">Get it on</div>
<div style="font-size:14px;color:#f0d78c;letter-spacing:1px;font-weight:600;font-family:Georgia,serif;">Google Play</div>
</td></tr></table>
</a>
</div>
<p style="margin:18px 0 0;font-size:11px;color:#8a7c63;letter-spacing:2px;text-transform:uppercase;font-family:'Helvetica Neue',Arial,sans-serif;">© 2026 MeriLive · All Rights Reserved</p>
</td></tr>

<!-- Gold hairline bottom -->
<tr><td bgcolor="#b8862a" style="height:3px;background-color:#b8862a;font-size:0;line-height:0;">&nbsp;</td></tr>

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
          'Content-Type': 'application/json',
        },
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

// Get unread count (uses Gmail labels.get — exact, not estimate)
async function getUnreadCount(accessToken: string): Promise<number> {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/labels/INBOX`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) return 0;
  const data = await res.json();
  return data.messagesUnread || 0;
}

// Get full inbox stats from Gmail labels API (totals are exact, not just visible page)
async function getInboxStats(accessToken: string): Promise<{ total: number; unread: number; read: number; starred: number }> {
  const [inboxRes, starredRes] = await Promise.all([
    fetch(`https://gmail.googleapis.com/gmail/v1/users/me/labels/INBOX`, { headers: { Authorization: `Bearer ${accessToken}` } }),
    fetch(`https://gmail.googleapis.com/gmail/v1/users/me/labels/STARRED`, { headers: { Authorization: `Bearer ${accessToken}` } }),
  ]);
  const inbox = inboxRes.ok ? await inboxRes.json() : {};
  const starred = starredRes.ok ? await starredRes.json() : {};
  const total = inbox.messagesTotal || 0;
  const unread = inbox.messagesUnread || 0;
  return {
    total,
    unread,
    read: Math.max(0, total - unread),
    starred: starred.messagesTotal || 0,
  };
}

// Move a thread to Trash (Gmail auto-purges after 30 days)
async function trashThread(accessToken: string, threadId: string): Promise<void> {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}/trash`,
    { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) {
    const err = await res.text();
    console.error('Gmail trash error:', err);
    throw new Error('Failed to delete thread');
  }
}

// Mark an entire thread as read
async function markThreadRead(accessToken: string, threadId: string): Promise<void> {
  await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}/modify`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
    }
  );
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

    // Cron bypass: pg_cron job calls auto_reply with either the service-role bearer
    // or the project anon key. The auto_reply action is safe (template-only outbound).
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const authHeader = req.headers.get('authorization') || '';
    const isCronCall = action === 'auto_reply' && (
      authHeader === `Bearer ${serviceRoleKey}` ||
      (anonKey && authHeader === `Bearer ${anonKey}`)
    );

    if (!isCronCall) {
      // Read-only actions only require an active admin session.
      // Mutating / outbound actions additionally require moderation-hub edit permission.
      const mutatingActions = new Set(['send_reply', 'auto_reply', 'mark_read', 'mark_thread_read', 'trash_thread']);
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
        // Auto mark the thread as read after a successful reply
        try { await markThreadRead(accessToken, params.threadId); } catch (_) {}
        break;
      }

      case 'mark_read': {
        if (!params.messageId) throw new Error('messageId required');
        await markAsRead(accessToken, params.messageId);
        result = { success: true };
        break;
      }

      case 'mark_thread_read': {
        if (!params.threadId) throw new Error('threadId required');
        await markThreadRead(accessToken, params.threadId);
        result = { success: true };
        break;
      }

      case 'trash_thread': {
        if (!params.threadId) throw new Error('threadId required');
        await trashThread(accessToken, params.threadId);
        result = { success: true };
        break;
      }

      case 'unread_count': {
        result = { count: await getUnreadCount(accessToken) };
        break;
      }

      case 'inbox_stats': {
        result = await getInboxStats(accessToken);
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
