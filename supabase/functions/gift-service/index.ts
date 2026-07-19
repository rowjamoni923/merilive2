import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Max-Age': '86400',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')

    // Admin client: only for secure server-side auth verification
    const adminSupabase = createClient(supabaseUrl, serviceKey)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const token = authHeader.replace('Bearer ', '')
    const {
      data: { user },
      error: authError,
    } = await adminSupabase.auth.getUser(token)

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const receiverId = body?.receiverId as string | undefined
    const giftId = body?.giftId as string | undefined
    const streamId = body?.streamId as string | undefined
    const partyRoomId = body?.partyRoomId as string | undefined
    const callId = body?.callId as string | undefined
    const reelId = body?.reelId as string | undefined
    const rawIdem = typeof body?.idempotencyKey === 'string' ? body.idempotencyKey.trim() : ''
    const idempotencyKey = rawIdem.length > 0 && rawIdem.length <= 128 ? rawIdem : null
    const rawQuantity = Number(body?.quantity ?? 1)
    if (!Number.isInteger(rawQuantity) || rawQuantity < 1 || rawQuantity > 999) {
      return new Response(JSON.stringify({ error: 'Invalid gift quantity' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const quantity = rawQuantity

    if (!receiverId || !giftId) {
      return new Response(JSON.stringify({ error: 'receiverId and giftId are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (receiverId === user.id) {
      return new Response(JSON.stringify({ error: 'Cannot send gift to yourself' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // User-scoped client: ensures auth.uid() inside RPC is the real logged-in user
    // Falls back to service key only if anon key is unavailable in env
    const userSupabase = createClient(supabaseUrl, anonKey ?? serviceKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    })

    const { data, error } = await userSupabase.rpc('process_gift_transaction', {
      p_sender_id: user.id,
      p_receiver_id: receiverId,
      p_gift_id: giftId,
      p_quantity: quantity,
      p_stream_id: streamId ?? null,
      p_party_room_id: partyRoomId ?? null,
      p_call_id: callId ?? null,
      p_reel_id: reelId ?? null,
      p_idempotency_key: idempotencyKey,
    })

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const result = data as any
    if (!result?.success) {
      return new Response(JSON.stringify({ error: result?.error || 'Gift failed' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Normalize all historical RPC payload shapes. The current DB function returns
    // total_cost / beans_received / new_sender_balance, while older clients expect
    // coinsSpent / hostReceived. Missing normalization made Pkg85 read zeros.
    const coinsSpent = Number(result.diamonds_spent ?? result.total_cost ?? 0)
    const hostReceived = Number(result.beans_earned ?? result.beans_received ?? 0)
    const newBalance = result.new_balance ?? result.new_sender_balance ?? null
    const diamondBonus = Number(result.diamond_bonus ?? 0)
    const isLucky = Boolean(result.is_lucky ?? false)

    // PK Battle Step 2 — auto-score during active PK battle.
    // Run as a fire-and-forget background task so the client response is NOT
    // blocked by the extra select + bill_pk_gift RPC roundtrips. This was the
    // main source of perceived gift-send lag (every gift paid the PK cost even
    // when the receiver was not in a PK battle).
    const pkSideEffect = (async () => {
      try {
        const { data: battle } = await adminSupabase
          .from('pk_battles')
          .select('id, status')
          .in('status', ['accepted', 'active'])
          .or(
            `challenger_id.eq.${receiverId},opponent_id.eq.${receiverId},host1_id.eq.${receiverId},host2_id.eq.${receiverId}`,
          )
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (battle?.id) {
          await adminSupabase.rpc('bill_pk_gift', {
            p_battle_id: battle.id,
            p_sender_id: user.id,
            p_target_host_id: receiverId,
            p_gift_id: giftId,
            p_diamond_amount: coinsSpent,
            p_stream_id: streamId ?? null,
          })
        }
      } catch (pkErr) {
        console.warn('[gift-service] PK scoring side-effect failed:', pkErr)
      }
    })()

    // @ts-ignore - EdgeRuntime is available in Supabase Edge Functions
    try { (globalThis as any).EdgeRuntime?.waitUntil?.(pkSideEffect) } catch (_) {}

    return new Response(
      JSON.stringify({
        success: true,
        senderId: user.id,
        transactionId: result.transaction_id,
        coinsSpent,
        hostReceived,
        hostPercent: result.host_percent,
        newBalance,
        diamondBonus,
        isLucky,
        pkScore: null,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message || 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
