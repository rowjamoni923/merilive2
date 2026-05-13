import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

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

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Distribution error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
