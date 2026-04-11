import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('authorization') || ''
    const newUrl = Deno.env.get('SUPABASE_URL')!
    const newKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const newClient = createClient(newUrl, newKey)

    // Verify requesting user
    const token = authHeader.replace('Bearer ', '').trim()
    const { data: { user }, error: userError } = await newClient.auth.getUser(token)
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Check if profile needs sync (generic name)
    const { data: currentProfile } = await newClient
      .from('profiles')
      .select('id, display_name, user_level, vip_level, beans_balance')
      .eq('id', user.id)
      .maybeSingle()

    if (!currentProfile) {
      return new Response(JSON.stringify({ synced: false, reason: 'no_profile' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const genericNames = ['User', 'user', 'owner', 'Owner', ''];
    const needsSync = genericNames.includes(currentProfile.display_name || '') || !currentProfile.display_name;

    if (!needsSync) {
      return new Response(JSON.stringify({ synced: false, reason: 'profile_ok' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Connect to old project
    let oldUrl = (Deno.env.get('OLD_SUPABASE_URL') || '').trim()
    const oldKey = (Deno.env.get('OLD_SUPABASE_SERVICE_ROLE_KEY') || '').trim()

    if (!oldUrl || !oldKey) {
      return new Response(JSON.stringify({ synced: false, reason: 'no_old_config' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (!oldUrl.startsWith('http')) oldUrl = `https://${oldUrl}`
    const oldClient = createClient(oldUrl, oldKey)

    // Try to find user in old project by email
    const email = user.email?.toLowerCase()
    if (!email) {
      return new Response(JSON.stringify({ synced: false, reason: 'no_email' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Search old profiles by email
    const { data: oldProfile } = await oldClient
      .from('profiles')
      .select('*')
      .ilike('email', email)
      .maybeSingle()

    if (!oldProfile) {
      // Try by user ID directly
      const { data: oldProfileById } = await oldClient
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle()

      if (!oldProfileById || genericNames.includes(oldProfileById.display_name || '')) {
        return new Response(JSON.stringify({ synced: false, reason: 'not_found_in_old' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Sync from old profile found by ID
      await syncProfile(newClient, user.id, oldProfileById)
      return new Response(JSON.stringify({ synced: true, name: oldProfileById.display_name }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (genericNames.includes(oldProfile.display_name || '')) {
      return new Response(JSON.stringify({ synced: false, reason: 'old_also_generic' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    await syncProfile(newClient, user.id, oldProfile)
    return new Response(JSON.stringify({ synced: true, name: oldProfile.display_name }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err: any) {
    console.error('[sync-user-profile] Error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

async function syncProfile(client: any, userId: string, oldProfile: any) {
  const fieldsToSync: Record<string, any> = {}
  
  // Only sync non-null, non-generic values from old profile
  const syncableFields = [
    'display_name', 'avatar_url', 'bio', 'gender', 'age',
    'user_level', 'vip_level', 'beans_balance',
    'is_host', 'is_verified', 'host_level',
    'country_code', 'country_flag', 'country_name', 'city', 'region',
  ]

  for (const field of syncableFields) {
    if (oldProfile[field] !== null && oldProfile[field] !== undefined && oldProfile[field] !== '') {
      fieldsToSync[field] = oldProfile[field]
    }
  }

  // Also sync coins/diamonds if they had balances
  if (oldProfile.coins_balance && oldProfile.coins_balance > 0) {
    fieldsToSync.beans_balance = Math.max(oldProfile.coins_balance, oldProfile.beans_balance || 0)
  }
  if (oldProfile.diamonds_balance && oldProfile.diamonds_balance > 0) {
    fieldsToSync.diamonds_balance = oldProfile.diamonds_balance
  }

  fieldsToSync.updated_at = new Date().toISOString()

  const { error } = await client
    .from('profiles')
    .update(fieldsToSync)
    .eq('id', userId)

  if (error) {
    console.error('[sync-user-profile] Update error:', error)
    throw error
  }
}
