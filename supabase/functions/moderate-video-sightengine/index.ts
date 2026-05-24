// Pkg310 deep-audit: previously unauthenticated. Two abuses fixed:
//   1) Anon caller could pass any `reelId` plus a known-unsafe public videoUrl
//      to force-delete that reel (auto-delete on isSafe=false).
//   2) Anon caller could spam reel_moderation_log with rows attributed to any
//      `userId` they chose.
// Now: requires JWT; ignores client-supplied userId (uses auth.uid()); only
// auto-deletes reels actually owned by the caller (or by an admin caller).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { requireAdminSession } from '../_shared/adminAuth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-admin-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SIGHTENGINE_BASE = 'https://api.sightengine.com/1.0';

interface RequestBody {
  videoUrl: string;
  reelId?: string;
}

interface SightengineFrame {
  nudity?: { raw?: number; partial?: number; safe?: number; sexual_activity?: number; sexual_display?: number; erotica?: number };
  weapon?: number | { classes?: Record<string, number> };
  alcohol?: number;
  drugs?: number;
  recreational_drug?: { prob?: number };
  medical?: { prob?: number };
  offensive?: { prob?: number; nazi?: number; confederate?: number; supremacist?: number; terrorist?: number; middle_finger?: number };
  gore?: { prob?: number };
  violence?: { prob?: number };
}

function evaluateFrames(frames: SightengineFrame[]): { isSafe: boolean; reason?: string; score: number; details: Record<string, number> } {
  const max = {
    nudity_raw: 0, nudity_partial: 0, nudity_sexual_activity: 0,
    nudity_sexual_display: 0, nudity_erotica: 0,
    weapon: 0, alcohol: 0, drugs: 0, offensive: 0, gore: 0, violence: 0,
  };
  for (const f of frames) {
    if (f.nudity) {
      max.nudity_raw = Math.max(max.nudity_raw, f.nudity.raw ?? 0);
      max.nudity_partial = Math.max(max.nudity_partial, f.nudity.partial ?? 0);
      max.nudity_sexual_activity = Math.max(max.nudity_sexual_activity, f.nudity.sexual_activity ?? 0);
      max.nudity_sexual_display = Math.max(max.nudity_sexual_display, f.nudity.sexual_display ?? 0);
      max.nudity_erotica = Math.max(max.nudity_erotica, f.nudity.erotica ?? 0);
    }
    if (typeof f.weapon === 'number') max.weapon = Math.max(max.weapon, f.weapon);
    if (typeof f.alcohol === 'number') max.alcohol = Math.max(max.alcohol, f.alcohol);
    if (typeof f.drugs === 'number') max.drugs = Math.max(max.drugs, f.drugs);
    if (f.offensive?.prob !== undefined) max.offensive = Math.max(max.offensive, f.offensive.prob);
    if (f.gore?.prob !== undefined) max.gore = Math.max(max.gore, f.gore.prob);
    if (f.violence?.prob !== undefined) max.violence = Math.max(max.violence, f.violence.prob);
  }
  const reasons: string[] = [];
  if (max.nudity_raw >= 0.5 || max.nudity_sexual_activity >= 0.5 || max.nudity_sexual_display >= 0.5) reasons.push('Nudity / sexual content');
  if (max.nudity_erotica >= 0.7) reasons.push('Erotic content');
  if (max.weapon >= 0.6) reasons.push('Weapons');
  if (max.drugs >= 0.7) reasons.push('Drugs');
  if (max.offensive >= 0.7) reasons.push('Offensive symbols');
  if (max.gore >= 0.6) reasons.push('Gore / graphic violence');
  if (max.violence >= 0.75) reasons.push('Violence');
  const overallScore = Math.max(max.nudity_raw, max.nudity_sexual_activity, max.nudity_sexual_display, max.weapon, max.drugs, max.offensive, max.gore, max.violence);
  if (reasons.length > 0) {
    return { isSafe: false, reason: `Prohibited content detected: ${reasons.join(', ')}. Please follow our community guidelines.`, score: overallScore, details: max };
  }
  return { isSafe: true, score: overallScore, details: max };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SIGHTENGINE_API_USER = Deno.env.get('SIGHTENGINE_API_USER');
    const SIGHTENGINE_API_SECRET = Deno.env.get('SIGHTENGINE_API_SECRET');
    if (!SIGHTENGINE_API_USER || !SIGHTENGINE_API_SECRET) {
      return json(500, { error: 'Sightengine credentials not configured' });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY);

    // ── Pkg310 audit: authorize caller ─────────────────────────────────────
    let isAdmin = false;
    if (req.headers.get('x-admin-token')) {
      const check = await requireAdminSession(req, supabaseAdmin);
      if (check.ok) isAdmin = true;
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

    const body = (await req.json()) as RequestBody;
    if (!body.videoUrl || typeof body.videoUrl !== 'string') {
      return json(400, { error: 'videoUrl is required' });
    }

    // If reelId provided, verify ownership before allowing any DB side-effects
    let verifiedReelId: string | null = null;
    let verifiedReelOwner: string | null = null;
    if (body.reelId && typeof body.reelId === 'string') {
      const { data: reel } = await supabaseAdmin
        .from('reels')
        .select('id, user_id, video_url')
        .eq('id', body.reelId)
        .maybeSingle();
      if (reel?.id) {
        if (isAdmin || reel.user_id === callerUserId) {
          verifiedReelId = reel.id;
          verifiedReelOwner = reel.user_id;
        } else {
          console.warn('[moderate-video-sightengine] reelId ownership mismatch — ignoring');
        }
      }
    }

    const params = new URLSearchParams({
      stream_url: body.videoUrl,
      models: 'nudity-2.1,weapon,recreational_drug,medical,offensive-2.0,gore-2.0,violence',
      api_user: SIGHTENGINE_API_USER,
      api_secret: SIGHTENGINE_API_SECRET,
    });

    const seResp = await fetch(`${SIGHTENGINE_BASE}/video/check-sync.json?${params.toString()}`, { method: 'GET' });
    const seData = await seResp.json();

    if (seData.status !== 'success') {
      console.error('[sightengine] error:', seData);
      return json(502, { error: 'Sightengine check failed', details: seData.error?.message ?? seData });
    }

    const frames: SightengineFrame[] = seData.data?.frames ?? [];
    const result = evaluateFrames(frames);

    if (verifiedReelId) {
      try {
        await supabaseAdmin.from('reel_moderation_log').insert({
          reel_id: verifiedReelId,
          user_id: verifiedReelOwner,
          video_url: body.videoUrl,
          is_safe: result.isSafe,
          reason: result.reason ?? null,
          score: result.score,
          details: result.details,
          provider: 'sightengine',
        });
        if (!result.isSafe) {
          await supabaseAdmin.from('reels').delete().eq('id', verifiedReelId);
        }
      } catch (logErr) {
        console.error('[sightengine] log error:', logErr);
      }
    }

    return json(200, result);
  } catch (error) {
    console.error('[moderate-video-sightengine] error:', error);
    return json(500, { error: error instanceof Error ? error.message : 'Unknown error' });
  }
});
