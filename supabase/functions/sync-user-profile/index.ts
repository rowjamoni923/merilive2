import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

type JsonRecord = Record<string, any>

const normalizeDeviceId = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return /^device_[A-Za-z0-9_:-]{6,128}$/.test(trimmed) ? trimmed : null
}

/**
 * Sync User Profile - Current Server Only
 * 
 * Ensures the logged-in user has a complete profile in the current database.
 * No longer depends on any legacy/old server.
 * If a profile exists, returns it. If not, creates a basic one from auth metadata.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('authorization') || ''
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ synced: false, reason: 'unauthorized' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const newUrl = Deno.env.get('SUPABASE_URL')!
    const newKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const newClient = createClient(newUrl, newKey)

    const token = authHeader.replace('Bearer ', '').trim()
    const { data: { user }, error: userError } = await newClient.auth.getUser(token)
    if (userError || !user) {
      return new Response(JSON.stringify({ synced: false, reason: 'unauthorized' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check if profile already exists
    const { data: currentProfile } = await newClient
      .from('profiles')
      .select('id, display_name, username, user_level, host_level, coins, diamonds, beans, beans_balance, is_host, is_verified, is_agency_owner, agency_id, avatar_url, gender, bio, age, country_code, country_flag, country_name, city, region, is_face_verified, device_id, app_uid')
      .eq('id', user.id)
      .maybeSingle()

    if (currentProfile) {
      // Profile exists — check if we need to fill any gaps from auth metadata
      const meta = user.user_metadata || {}
      const patch: JsonRecord = {}

      if (!currentProfile.display_name && (meta.full_name || meta.name)) {
        patch.display_name = meta.full_name || meta.name
      }
      if (!currentProfile.username && (meta.username || meta.full_name || meta.name)) {
        patch.username = meta.username || meta.full_name || meta.name
      }
      if (!currentProfile.avatar_url && (meta.avatar_url || meta.picture)) {
        patch.avatar_url = meta.avatar_url || meta.picture
      }
      if (!currentProfile.gender && meta.gender) {
        patch.gender = meta.gender
      }

      if (Object.keys(patch).length > 0) {
        await newClient
          .from('profiles')
          .update({ ...patch, updated_at: new Date().toISOString() })
          .eq('id', user.id)
      }

      return new Response(JSON.stringify({
        synced: true,
        profileUpdated: Object.keys(patch).length > 0,
        resolvedName: currentProfile.display_name || currentProfile.username || null,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // No profile — create one from auth metadata
    const meta = user.user_metadata || {}
    const displayName = meta.full_name || meta.name || meta.username || (user.email ? user.email.split('@')[0] : 'User')
    const metadataDeviceId = normalizeDeviceId(meta.device_id)

    if (metadataDeviceId) {
      const { data: bannedDevice } = await newClient
        .from('banned_devices')
        .select('id')
        .eq('device_id', metadataDeviceId)
        .eq('is_active', true)
        .or(`is_permanent.eq.true,expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .maybeSingle()
      if (bannedDevice?.id) {
        return new Response(JSON.stringify({ synced: false, reason: 'device_banned' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    const newProfile: JsonRecord = {
      id: user.id,
      display_name: displayName,
      username: meta.username || displayName,
      avatar_url: meta.avatar_url || meta.picture || null,
      gender: meta.gender || null,
      bio: meta.bio || null,
      age: meta.age || null,
      country_code: meta.country_code || null,
      country_flag: meta.country_flag || null,
      country_name: meta.country_name || null,
      app_uid: meta.app_uid || null,
      device_id: metadataDeviceId,
      is_verified: Boolean(user.email_confirmed_at),
      coins: 0,
      diamonds: 0,
      beans: 0,
      beans_balance: 0,
      user_level: 1,
      host_level: 0,
      is_host: false,
      is_agency_owner: false,
      is_face_verified: false,
    }

    const { error: insertError } = await newClient
      .from('profiles')
      .upsert(newProfile, { onConflict: 'id' })

    if (insertError) {
      console.error('[sync-user-profile] Insert error:', insertError)
      throw insertError
    }

    console.log(`[sync-user-profile] ✅ Created profile for: ${user.email || user.id}`)

    return new Response(JSON.stringify({
      synced: true,
      profileUpdated: true,
      resolvedName: displayName,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('[sync-user-profile] Error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
