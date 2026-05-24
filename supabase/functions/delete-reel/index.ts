// Pkg310 deep-audit: was completely unauthenticated — any anon caller could
// delete any reel by id. Now requires JWT and caller must own the reel,
// or be an active admin via x-admin-token.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireAdminSession } from '../_shared/adminAuth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-admin-token, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  let body: { reel_id?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'invalid json' });
  }
  const reelId = typeof body?.reel_id === 'string' ? body.reel_id.trim() : '';
  if (!reelId) return json(400, { error: 'reel_id required' });

  // ── Authorize: admin session OR reel owner (JWT) ──────────────────────────
  let isAdmin = false;
  if (req.headers.get('x-admin-token')) {
    const adminCheck = await requireAdminSession(req, admin);
    if (adminCheck.ok) isAdmin = true;
  }

  let callerUserId: string | null = null;
  if (!isAdmin) {
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.toLowerCase().startsWith('bearer ')) {
      return json(401, { error: 'authentication required' });
    }
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user?.id) return json(401, { error: 'invalid session' });
    callerUserId = userRes.user.id;
  }

  const { data: reel } = await admin
    .from('reels')
    .select('id, video_url, thumbnail_url, user_id')
    .eq('id', reelId)
    .maybeSingle();

  if (!reel) return json(404, { error: 'Reel not found' });

  if (!isAdmin && reel.user_id !== callerUserId) {
    return json(403, { error: 'forbidden' });
  }

  const { error } = await admin.from('reels').delete().eq('id', reelId);
  if (error) return json(500, { error: error.message });

  // Storage cleanup (best-effort)
  const filesToDelete: string[] = [];
  if (reel.video_url) {
    const path = reel.video_url.split('/reels/')[1];
    if (path) filesToDelete.push(decodeURIComponent(path));
  }
  if (reel.thumbnail_url) {
    const path = reel.thumbnail_url.split('/reels/')[1];
    if (path) filesToDelete.push(decodeURIComponent(path));
  }
  if (filesToDelete.length > 0) {
    await admin.storage.from('reels').remove(filesToDelete).catch(() => {});
  }

  return json(200, { success: true, deleted_id: reelId });
});
