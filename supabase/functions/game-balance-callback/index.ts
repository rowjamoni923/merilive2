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

async function verifyHmac(secret: string, rawBody: string, signature: string, timestamp: string): Promise<boolean> {
  try {
    if (!signature || !timestamp) return false;
    // Reject stale timestamps (>5 min skew) to block replays.
    const tsNum = parseInt(timestamp, 10);
    if (!Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > 300) return false;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${timestamp}.${rawBody}`));
    const expected = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
    // Constant-time compare
    const a = expected.toLowerCase();
    const b = signature.toLowerCase().replace(/^sha256=/, '');
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  } catch { return false; }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Read raw body once so we can both HMAC-verify and parse it.
    let rawBody = '';
    let params: Record<string, string> = {};

    if (req.method === 'GET') {
      const url = new URL(req.url);
      url.searchParams.forEach((v, k) => { params[k] = v; });
      rawBody = url.search;
    } else {
      rawBody = await req.text();
      const contentType = req.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        try { params = JSON.parse(rawBody); } catch { params = {}; }
      } else if (contentType.includes('form') || rawBody.includes('=')) {
        const searchParams = new URLSearchParams(rawBody);
        searchParams.forEach((v, k) => { params[k] = v; });
      } else {
        try { params = JSON.parse(rawBody); } catch { params = {}; }
      }
    }

    // SECURITY: require provider HMAC signature on every request. Fail closed
    // when GAME_CALLBACK_HMAC_SECRET is not configured so no caller can ever
    // hit handle_game_callback without proving provider identity.
    const hmacSecret = Deno.env.get('GAME_CALLBACK_HMAC_SECRET') || '';
    if (!hmacSecret) {
      console.error('[GameCallback] GAME_CALLBACK_HMAC_SECRET not configured — rejecting');
      return new Response(JSON.stringify({
        success: false, code: 503, message: 'Provider auth not configured', status: 0,
      }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const sig = req.headers.get('x-signature') || params.signature || params.sign || '';
    const ts = req.headers.get('x-timestamp') || params.timestamp || params.ts || '';
    const ok = await verifyHmac(hmacSecret, rawBody, sig, ts);
    if (!ok) {
      return new Response(JSON.stringify({
      }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const action = params.action || params.type || params.method || 'getUserInfo';
    const token = params.token || params.session_token || params.sessionToken || '';
    const amount = parseInt(params.amount || params.bet_amount || params.win_amount || '0', 10);
    const gameId = params.game_id || params.gameId || params.game_code || '';
    const roundId = params.round_id || params.roundId || params.transaction_id || '';

    // Validate action whitelist + amount sanity before doing anything privileged.
    const allowedActions = new Set([
      'getUserInfo','getBalance','placeBet','bet','debit',
      'settleBet','win','credit','refund','rollback',
    ]);
    if (!allowedActions.has(action)) {
      return new Response(JSON.stringify({
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000_000) {
      return new Response(JSON.stringify({
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (!token) {
      return new Response(JSON.stringify({
        code: 401,
        message: 'Token required',
        status: 0,
      }), {
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
      }), {
      });
    }

    // Format response to match common game provider expectations
    const response = {
      ...data,
      msg: data?.error || 'ok',
    };

    console.log(`[GameCallback] ${action} | token=${token.substring(0, 8)}... | result:`, response);

    return new Response(JSON.stringify(response), {
    });

  } catch (e) {
    console.error('[GameCallback] Error:', e);
    return new Response(JSON.stringify({ 
    }), {
    });
  }
});
