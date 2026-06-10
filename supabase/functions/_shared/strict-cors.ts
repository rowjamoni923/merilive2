// Sub-wave 2A: shared strict CORS allow-list for money/auth/admin edge fns.
// Replaces wildcard "*" responses so a malicious origin cannot read JSON.
//
// Usage:
//   import { strictCors } from "../_shared/strict-cors.ts";
//   const corsHeaders = strictCors(req);
//   if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

export const ALLOWED_APP_ORIGINS = new Set<string>([
  "https://merilive.com",
  "https://www.merilive.com",
  "https://merilive.top",
  "https://www.merilive.top",
  "https://merilive2.lovable.app",
  "https://id-preview--1c59f8d2-75bb-4fc1-a074-3c08560dd44b.lovable.app",
  // Capacitor / Cordova Android WebView origins
  "capacitor://localhost",
  "ionic://localhost",
  "http://localhost",
  "https://localhost",
]);

const DEFAULT_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-admin-token, x-internal-secret, x-cron-secret, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-supabase-api-version";

export function strictCors(
  req: Request,
  opts: { methods?: string; extraHeaders?: string } = {},
): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allow = ALLOWED_APP_ORIGINS.has(origin) ? origin : "https://merilive.com";
  return {
    "Access-Control-Allow-Origin": allow,
    "Vary": "Origin",
    "Access-Control-Allow-Headers": opts.extraHeaders
      ? `${DEFAULT_HEADERS}, ${opts.extraHeaders}`
      : DEFAULT_HEADERS,
    "Access-Control-Allow-Methods": opts.methods ?? "POST, OPTIONS",
  };
}

/**
 * Origin guard for legacy functions that still use wildcard CORS.
 * Returns true when:
 *   - no Origin header (server-to-server, curl, native Android non-WebView)
 *   - Origin is in the allow-list (browser/Capacitor WebView)
 * Use this as a cheap defense-in-depth before doing any real work.
 */
export function isAllowedOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  return ALLOWED_APP_ORIGINS.has(origin);
}

/** Constant-time string compare. Use for OTPs, tokens, secrets. */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
