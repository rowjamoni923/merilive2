// Cron-triggered: invokes auto_distribute_leaderboard_rewards or a specific
// distribute_period_rewards(category, period_type) call.
// Hardened (Pkg313): requires CRON_SECRET / service-role JWT — previously any
// anon could POST {category, period_type, force_all} and force premature
// payouts + notification spam (the underlying RPCs were SECURITY DEFINER and
// publicly grantable).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireAdminSession } from '../_shared/adminAuth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-token, x-cron-secret, x-internal-secret, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function isAuthorized(req: Request, supabaseAdmin: ReturnType<typeof createClient>): Promise<boolean> {
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const internalSecret =
    Deno.env.get('CRON_SECRET') ?? Deno.env.get('INTERNAL_FUNCTION_SECRET');

  const authHeader = req.headers.get('Authorization') ?? '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (serviceRole && bearer === serviceRole) return true;
  if (internalSecret) {
    if (req.headers.get('x-cron-secret') === internalSecret) return true;
    if (req.headers.get('x-internal-secret') === internalSecret) return true;
    if (bearer === internalSecret) return true;
  }
  const adminAuth = await requireAdminSession(req, supabaseAdmin, { sectionKey: 'leaderboard', requireEdit: true });
  if (adminAuth.ok) return true;
  return false;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    if (!(await isAuthorized(req, supabase))) {
      return jsonResponse({ success: false, error: 'Forbidden: admin or cron access required' }, 403);
    }

    // Parse optional parameters
    let category: string | null = null
    let periodType: string | null = null
    let forceAll = false

    try {
      const body = await req.json()
      category = body.category || null
      periodType = body.period_type || null
      forceAll = body.force_all || false
    } catch {
      // No body - will auto-detect based on time
    }

    const results: string[] = []

    if (forceAll || (!category && !periodType)) {
      // Auto-detect: call the master function
      const { data, error } = await supabase.rpc('auto_distribute_leaderboard_rewards')
      if (error) throw error
      results.push(data || 'No distributions needed')
    } else if (category && periodType) {
      // Distribute specific category/period
      const { data, error } = await supabase.rpc('distribute_period_rewards', {
        p_category: category,
        p_period_type: periodType,
      })
      if (error) throw error
      results.push(`${category}/${periodType}: distributed to ${data || 0} winners`)
    }

    return jsonResponse({ success: true, results });
  } catch (error) {
    console.error('Distribution error:', error)
    return jsonResponse({ success: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
})
