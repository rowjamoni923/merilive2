import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/**
 * Returns the luxurious year-based admin tokens.
 * Auth: caller must be an admin owner (custom admin session OR auth.users → admin_users).
 *
 * Token format (year-aware, regenerates each calendar year):
 *   Owner    : gala-royal-velvet-<YEAR>-aurora-<8-hex>
 *   Sub-Admin: gala-noir-onyx-<YEAR>-prism-<8-hex>
 */

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const adminId: string | undefined = body?.admin_id;

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Path A — custom admin session caller (preferred, fully decoupled from auth.users)
    let isOwner = false;
    if (adminId) {
      const { data: row } = await adminClient
        .from('admin_users')
        .select('role, is_active')
        .eq('id', adminId)
        .maybeSingle();
      if (row?.role === 'owner' && row?.is_active) isOwner = true;
    }

    // Path B — legacy auth header
    if (!isOwner) {
      const authHeader = req.headers.get('Authorization');
      if (authHeader) {
        const userClient = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_ANON_KEY')!,
          { global: { headers: { Authorization: authHeader } } }
        );
        const { data: { user } } = await userClient.auth.getUser();
        if (user) {
          const { data: row } = await adminClient
            .from('admin_users')
            .select('role, is_active')
            .eq('user_id', user.id)
            .maybeSingle();
          if (row?.role === 'owner' && row?.is_active) isOwner = true;
        }
      }
    }

    if (!isOwner) {
      return new Response(
        JSON.stringify({ error: 'Only owners can view tokens' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const BASE_SECRET =
      Deno.env.get('ADMIN_TOKEN_BASE_SECRET') ||
      Deno.env.get('ADMIN_OWNER_TOKEN') ||
      'merilive-secret-base-2026-fallback';
    const year = new Date().getUTCFullYear();
    const ownerHash = await deriveHash(BASE_SECRET, `owner:${year}`);
    const subHash = await deriveHash(BASE_SECRET, `sub_admin:${year}`);

    let ownerToken = `gala-royal-velvet-${year}-aurora-${ownerHash}`;
    let subadminToken = `gala-noir-onyx-${year}-prism-${subHash}`;
    let ownerRotatedAt: string | null = null;
    let subadminRotatedAt: string | null = null;

    // Check for owner-rotated overrides (current year only)
    const { data: overrides } = await adminClient
      .from('admin_token_overrides')
      .select('kind, token, rotated_at, rotated_year');
    if (Array.isArray(overrides)) {
      for (const o of overrides) {
        if (o.rotated_year !== year) continue;
        if (o.kind === 'owner') { ownerToken = o.token; ownerRotatedAt = o.rotated_at; }
        if (o.kind === 'sub_admin') { subadminToken = o.token; subadminRotatedAt = o.rotated_at; }
      }
    }

    return new Response(
      JSON.stringify({
        owner_token: ownerToken,
        subadmin_token: subadminToken,
        owner_rotated_at: ownerRotatedAt,
        subadmin_rotated_at: subadminRotatedAt,
        year,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('get-admin-tokens error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
