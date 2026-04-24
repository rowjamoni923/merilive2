import { corsHeaders } from '@supabase/supabase-js/cors';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SIGHTENGINE_BASE = 'https://api.sightengine.com/1.0';

interface RequestBody {
  videoUrl: string;
  reelId?: string;
  userId?: string;
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
    nudity_raw: 0,
    nudity_partial: 0,
    nudity_sexual_activity: 0,
    nudity_sexual_display: 0,
    nudity_erotica: 0,
    weapon: 0,
    alcohol: 0,
    drugs: 0,
    offensive: 0,
    gore: 0,
    violence: 0,
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

  // Thresholds
  const NUDITY_THRESHOLD = 0.5;
  const WEAPON_THRESHOLD = 0.6;
  const DRUGS_THRESHOLD = 0.7;
  const OFFENSIVE_THRESHOLD = 0.7;
  const GORE_THRESHOLD = 0.6;

  const reasons: string[] = [];
  if (max.nudity_raw >= NUDITY_THRESHOLD || max.nudity_sexual_activity >= NUDITY_THRESHOLD || max.nudity_sexual_display >= NUDITY_THRESHOLD) {
    reasons.push('Nudity / sexual content');
  }
  if (max.nudity_erotica >= 0.7) reasons.push('Erotic content');
  if (max.weapon >= WEAPON_THRESHOLD) reasons.push('Weapons');
  if (max.drugs >= DRUGS_THRESHOLD) reasons.push('Drugs');
  if (max.offensive >= OFFENSIVE_THRESHOLD) reasons.push('Offensive symbols');
  if (max.gore >= GORE_THRESHOLD) reasons.push('Gore / graphic violence');
  if (max.violence >= 0.75) reasons.push('Violence');

  const overallScore = Math.max(
    max.nudity_raw,
    max.nudity_sexual_activity,
    max.nudity_sexual_display,
    max.weapon,
    max.drugs,
    max.offensive,
    max.gore,
    max.violence
  );

  if (reasons.length > 0) {
    return {
      isSafe: false,
      reason: `Prohibited content detected: ${reasons.join(', ')}. Please follow our community guidelines.`,
      score: overallScore,
      details: max,
    };
  }

  return { isSafe: true, score: overallScore, details: max };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const SIGHTENGINE_API_USER = Deno.env.get('SIGHTENGINE_API_USER');
    const SIGHTENGINE_API_SECRET = Deno.env.get('SIGHTENGINE_API_SECRET');

    if (!SIGHTENGINE_API_USER || !SIGHTENGINE_API_SECRET) {
      return new Response(JSON.stringify({ error: 'Sightengine credentials not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = (await req.json()) as RequestBody;
    if (!body.videoUrl || typeof body.videoUrl !== 'string') {
      return new Response(JSON.stringify({ error: 'videoUrl is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Sightengine sync video check (short videos < 1 min)
    const params = new URLSearchParams({
      stream_url: body.videoUrl,
      models: 'nudity-2.1,weapon,recreational_drug,medical,offensive-2.0,gore-2.0,violence',
      api_user: SIGHTENGINE_API_USER,
      api_secret: SIGHTENGINE_API_SECRET,
    });

    const seResp = await fetch(`${SIGHTENGINE_BASE}/video/check-sync.json?${params.toString()}`, {
      method: 'GET',
    });

    const seData = await seResp.json();

    if (seData.status !== 'success') {
      console.error('[sightengine] error:', seData);
      return new Response(JSON.stringify({
        error: 'Sightengine check failed',
        details: seData.error?.message ?? seData,
      }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const frames: SightengineFrame[] = seData.data?.frames ?? [];
    const result = evaluateFrames(frames);

    // Log to DB if reelId provided
    if (body.reelId) {
      try {
        const supabaseAdmin = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );
        await supabaseAdmin.from('reel_moderation_log').insert({
          reel_id: body.reelId,
          user_id: body.userId ?? null,
          video_url: body.videoUrl,
          is_safe: result.isSafe,
          reason: result.reason ?? null,
          score: result.score,
          details: result.details,
          provider: 'sightengine',
        });

        // Auto-delete unsafe reel
        if (!result.isSafe) {
          await supabaseAdmin.from('reels').delete().eq('id', body.reelId);
        }
      } catch (logErr) {
        console.error('[sightengine] log error:', logErr);
      }
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[moderate-video-sightengine] error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
