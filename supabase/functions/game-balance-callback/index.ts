import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

/**
 * GAME BALANCE CALLBACK API
 * 
 * This edge function handles callbacks from external game providers (e.g., gamesp.ccdn.ink).
 * The game provider calls this endpoint to:
 * - getUserInfo: Verify token & get user balance
 * - placeBet/bet/debit: Deduct diamonds from user balance
 * - settleBet/win/credit: Add winnings to user balance
 * - getBalance: Check current balance
 * - refund/rollback: Refund a bet
 * 
 * Flow:
 * 1. User opens game → our app generates a token via generate_game_token RPC
 * 2. Game iframe loads with token in URL
 * 3. Game provider calls this API with the token to manage balance
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-merchant-id',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Support both GET (query params) and POST (body)
    let params: Record<string, string> = {};
    
    if (req.method === 'GET') {
      const url = new URL(req.url);
      url.searchParams.forEach((v, k) => { params[k] = v; });
    } else {
      const contentType = req.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const body = await req.json();
        params = body;
      } else if (contentType.includes('form')) {
        const formData = await req.formData();
        formData.forEach((v, k) => { params[k] = String(v); });
      } else {
        // Try JSON first, fallback to text parsing
        try {
          const body = await req.json();
          params = body;
        } catch {
          const text = await req.text();
          const searchParams = new URLSearchParams(text);
          searchParams.forEach((v, k) => { params[k] = v; });
        }
      }
    }

    const action = params.action || params.type || params.method || 'getUserInfo';
    const token = params.token || params.session_token || params.sessionToken || '';
    const amount = parseInt(params.amount || params.bet_amount || params.win_amount || '0', 10);
    const gameId = params.game_id || params.gameId || params.game_code || '';
    const roundId = params.round_id || params.roundId || params.transaction_id || '';

    if (!token) {
      return new Response(JSON.stringify({ 
        success: false, 
        code: 401, 
        message: 'Token required',
        status: 0 
      }), {
        status: 200, // Many game providers expect 200 even on errors
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Call the database function
    const { data, error } = await supabase.rpc('handle_game_callback', {
      p_action: action,
      p_token: token,
      p_amount: amount,
      p_game_id: gameId || null,
      p_round_id: roundId || null,
      p_details: params,
    });

    if (error) {
      console.error('[GameCallback] RPC error:', error);
      return new Response(JSON.stringify({ 
        success: false, 
        code: 500, 
        message: error.message,
        status: 0 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Format response to match common game provider expectations
    const response = {
      ...data,
      status: data?.success ? 1 : 0,
      code: data?.code || (data?.success ? 200 : 400),
      msg: data?.error || 'ok',
    };

    console.log(`[GameCallback] ${action} | token=${token.substring(0, 8)}... | result:`, response);

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (e) {
    console.error('[GameCallback] Error:', e);
    return new Response(JSON.stringify({ 
      success: false, 
      status: 0, 
      code: 500, 
      message: e.message 
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
