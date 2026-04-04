import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Validate cron secret to prevent public invocation
    const cronSecret = req.headers.get('x-cron-secret') || req.headers.get('authorization')?.replace('Bearer ', '')
    const expectedSecret = Deno.env.get('CRON_SECRET')
    if (expectedSecret && cronSecret !== expectedSecret) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Call the auto process function
    const { data, error } = await supabase.rpc('auto_process_live_game')

    if (error) {
      console.error('Auto process error:', error)
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    console.log('Auto process result:', data)

    // Ensure there's always an active round for each game
    const gameIds = ['lucky28', 'crash', 'wheel', 'dice', 'coinflip', 'slots']
    
    for (const gameId of gameIds) {
      // Check if there's an active round
      const { data: activeRound } = await supabase
        .from('live_game_rounds')
        .select('id')
        .eq('game_id', gameId)
        .is('room_id', null)
        .in('status', ['betting', 'playing'])
        .limit(1)
        .maybeSingle()

      if (!activeRound) {
        // Create new round
        const { data: newRound, error: createError } = await supabase.rpc('create_live_game_round', {
          p_game_id: gameId,
          p_room_id: null,
          p_betting_seconds: 30
        })
        
        if (createError) {
          console.error(`Failed to create round for ${gameId}:`, createError)
        } else {
          console.log(`Created new round for ${gameId}:`, newRound)
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, data }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    console.error('Game auto-runner error:', errorMessage)
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})