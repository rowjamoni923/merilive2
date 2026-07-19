import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Verify user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
      });
    }

    const body = await req.json();
    const { game_key, room_id, bet_amount, bet_details } = body;

    if (!game_key || !bet_amount) {
      return new Response(JSON.stringify({ error: 'game_key and bet_amount required' }), {
      });
    }

    // Call secure RPC
    const { data, error } = await supabase.rpc('process_game_bet', {
      p_user_id: user.id,
      p_game_key: game_key,
      p_room_id: room_id || null,
      p_bet_amount: bet_amount,
      p_bet_details: bet_details || {},
    });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
      });
    }

    if (data?.error) {
      return new Response(JSON.stringify(data), {
      });
    }

    return new Response(JSON.stringify(data), {
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
    });
  }
});