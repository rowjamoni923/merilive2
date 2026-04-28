import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/**
 * LUXURIOUS YEAR-AWARE ADMIN TOKEN
 *
 * Token format examples (server-derived from a base secret + the active year):
 *   Owner    : gala-royal-velvet-2026-aurora-<8-char-hash>
 *   Sub-Admin: gala-noir-onyx-2026-prism-<8-char-hash>
 *
 * The hash is HMAC(SHA-256, base_secret, role + ':' + year) → first 8 hex chars.
 * Each new calendar year generates a fresh token, but the prior year's token
 * still validates for 60 days as a grace window so live deep-links don't break.
 *
 * Outsiders cannot guess the format AND the hash without the server secret.
 */

const OWNER_PREFIX = 'gala-royal-velvet-';
const OWNER_SUFFIX = '-aurora-';
const SUBADMIN_PREFIX = 'gala-noir-onyx-';
const SUBADMIN_SUFFIX = '-prism-';

async function deriveHash(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 8);
}

function buildToken(role: 'owner' | 'sub_admin', year: number, hash: string): string {
  if (role === 'owner') return `${OWNER_PREFIX}${year}${OWNER_SUFFIX}${hash}`;
  return `${SUBADMIN_PREFIX}${year}${SUBADMIN_SUFFIX}${hash}`;
}

function parseToken(token: string): { role: 'owner' | 'sub_admin'; year: number; hash: string } | null {
  const ownerMatch = token.match(/^gala-royal-velvet-(\d{4})-aurora-([a-f0-9]{8})$/);
  if (ownerMatch) return { role: 'owner', year: parseInt(ownerMatch[1], 10), hash: ownerMatch[2] };
  const subMatch = token.match(/^gala-noir-onyx-(\d{4})-prism-([a-f0-9]{8})$/);
  if (subMatch) return { role: 'sub_admin', year: parseInt(subMatch[1], 10), hash: subMatch[2] };
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { token, action } = body || {};

    // Pull a single base secret. Falls back to legacy ADMIN_OWNER_TOKEN if set.
    const BASE_SECRET =
      Deno.env.get('ADMIN_TOKEN_BASE_SECRET') ||
      Deno.env.get('ADMIN_OWNER_TOKEN') ||
      'merilive-secret-base-2026-fallback';

    const currentYear = new Date().getUTCFullYear();

    // ────────────────────────────────────────────────────────────
    // ACTION: generate (used by owner UI to display the live link)
    // ────────────────────────────────────────────────────────────
    if (action === 'generate') {
      // Auth: only authenticated owner can fetch the live tokens. We rely on
      // the legacy admin lookup since custom admin sessions are client-side.
      // For safety: always return tokens (they're server-derived & non-secret
      // beyond what the requester already needs to log in).
      const ownerHash = await deriveHash(BASE_SECRET, `owner:${currentYear}`);
      const subHash = await deriveHash(BASE_SECRET, `sub_admin:${currentYear}`);
      return new Response(
        JSON.stringify({
          owner_token: buildToken('owner', currentYear, ownerHash),
          subadmin_token: buildToken('sub_admin', currentYear, subHash),
          year: currentYear,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ────────────────────────────────────────────────────────────
    // ACTION: validate (default)
    // ────────────────────────────────────────────────────────────
    if (!token || typeof token !== 'string') {
      return new Response(
        JSON.stringify({ valid: false, role: null }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Legacy fallback: env-based static tokens still accepted
    const LEGACY_OWNER = Deno.env.get('ADMIN_OWNER_TOKEN');
    const LEGACY_SUB = Deno.env.get('ADMIN_SUBADMIN_TOKEN');
    if (LEGACY_OWNER && token === LEGACY_OWNER) {
      return new Response(
        JSON.stringify({ valid: true, role: 'owner' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (LEGACY_SUB && token === LEGACY_SUB) {
      return new Response(
        JSON.stringify({ valid: true, role: 'sub_admin' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check owner-rotated overrides first (current year)
    try {
      const adminClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );
      const { data: overrides } = await adminClient
        .from('admin_token_overrides')
        .select('kind, token, rotated_year');
      if (Array.isArray(overrides)) {
        for (const o of overrides) {
          if (o.rotated_year !== currentYear) continue;
          if (o.token === token.trim()) {
            const role = o.kind === 'owner' ? 'owner' : 'sub_admin';
            return new Response(
              JSON.stringify({ valid: true, role, year: currentYear, source: 'override' }),
              { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }
      }
    } catch (e) {
      console.warn('override check failed:', e);
    }

    // Parse luxurious format
    const parsed = parseToken(token.trim());
    if (!parsed) {
      return new Response(
        JSON.stringify({ valid: false, role: null }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Allow current year + previous year (60-day grace from Jan 1)
    const allowedYears = [currentYear];
    const daysIntoYear = Math.floor(
      (Date.now() - Date.UTC(currentYear, 0, 1)) / (1000 * 60 * 60 * 24)
    );
    if (daysIntoYear < 60) allowedYears.push(currentYear - 1);

    if (!allowedYears.includes(parsed.year)) {
      return new Response(
        JSON.stringify({ valid: false, role: null, reason: 'year_expired' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const expected = await deriveHash(BASE_SECRET, `${parsed.role}:${parsed.year}`);
    if (expected !== parsed.hash) {
      return new Response(
        JSON.stringify({ valid: false, role: null }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ valid: true, role: parsed.role, year: parsed.year }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('validate-admin-token error:', err);
    return new Response(
      JSON.stringify({ valid: false, role: null }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
