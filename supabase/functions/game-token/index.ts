import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

/**
 * GAME TOKEN GENERATOR
 * 
 * Generates a session token for authenticated users to play external games.
 * The token is stored in game_session_tokens table and used by game-balance-callback
 * to verify user identity and manage balance.
 */

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

    const body = await req.json().catch(() => ({}));
    const { merchant_id, game_id, room_id } = body;

    // Generate token via RPC
    const { data, error } = await supabase.rpc('generate_game_token', {
      p_user_id: user.id,
      p_merchant_id: merchant_id || '1000000',
      p_game_id: game_id || null,
      p_room_id: room_id || null,
    });

    if (error) {
      console.error('[GameToken] RPC error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
      });
    }

    console.log(`[GameToken] Generated for user ${user.id}, game: ${game_id}`);

    return new Response(JSON.stringify(data), {
    });

  } catch (e) {
    console.error('[GameToken] Error:', e);
    return new Response(JSON.stringify({ error: e.message }), {
    });
  }
});
