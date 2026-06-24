import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

function normalizeOAuthSecret(value: string | undefined): string {
  return (value ?? '').trim().replace(/^[ '\"]+|[ '\"]+$/g, '');
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
    // Not JSON.
  }
  for (const key of keys) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = raw.match(new RegExp(`${escapedKey}\\s*[:=]\\s*["']?([^"'\\s,}]+)`, 'i'));
    if (match?.[1]) return normalizeOAuthSecret(match[1]).replace(/\r?\n/g, '');
  }
  return raw.replace(/\r?\n/g, '');
}

Deno.test('Gmail OAuth secrets can refresh an access token', async () => {
  const clientId = extractOAuthSecret(Deno.env.get('GMAIL_CLIENT_ID'), ['client_id', 'clientId', 'OAuth Client ID', 'Client ID']);
  const clientSecret = extractOAuthSecret(Deno.env.get('GMAIL_CLIENT_SECRET'), ['client_secret', 'clientSecret', 'OAuth Client secret', 'Client secret', 'Client Secret']);
  const refreshToken = extractOAuthSecret(Deno.env.get('GMAIL_REFRESH_TOKEN'), ['refresh_token', 'refreshToken']);

  assert(clientId.endsWith('.apps.googleusercontent.com'), 'GMAIL_CLIENT_ID must be an OAuth client ID');
  assert(clientSecret.length > 10, 'GMAIL_CLIENT_SECRET must be configured');
  assert(refreshToken.startsWith('1//'), 'GMAIL_REFRESH_TOKEN must be a refresh token');

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

  const body = await response.json().catch(() => ({}));
  assertEquals(response.status, 200, body.error_description || body.error || 'OAuth refresh failed');
  assert(typeof body.access_token === 'string' && body.access_token.length > 20, 'Missing access token');
});