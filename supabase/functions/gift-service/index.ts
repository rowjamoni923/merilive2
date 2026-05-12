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
    const quantity = Math.max(1, Number(body?.quantity || 1))

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

    return new Response(
      JSON.stringify({
        success: true,
        transactionId: result.transaction_id,
        coinsSpent: result.coins_spent,
        hostReceived: result.beans_earned,
        hostPercent: result.host_percent,
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
