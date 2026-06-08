// PK Battle Tick — runs every 10 seconds via pg_cron.
// Calls public.get_expired_pk_battles() then public.end_pk_battle(id, 'time_up')
// for each. Server is the sole writer of winner / MVP / punishment_end_ts.
// Idempotent: end_pk_battle short-circuits if status='ended'.

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: expired, error: listErr } = await supabase.rpc('get_expired_pk_battles')
    if (listErr) {
      return new Response(JSON.stringify({ ok: false, error: listErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const ids: string[] = (expired ?? []).map((r: { battle_id: string }) => r.battle_id)
    if (ids.length === 0) {
      return new Response(JSON.stringify({ ok: true, ended: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const results = await Promise.all(
      ids.map(async (battle_id) => {
        const { data, error } = await supabase.rpc('end_pk_battle', {
          p_battle_id: battle_id,
          p_reason: 'time_up',
        })
        return { battle_id, ok: !error, data, error: error?.message }
      }),
    )

    const ended = results.filter((r) => r.ok).length
    const failed = results.filter((r) => !r.ok)
    return new Response(JSON.stringify({ ok: true, ended, failed, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
