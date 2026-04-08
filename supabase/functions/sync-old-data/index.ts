import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Tables to sync - ordered by dependency (independent tables first)
const SYNC_TABLES = [
  // Config/settings tables (no FK dependencies)
  'app_settings',
  'app_version_settings',
  'app_content',
  'app_event_themes',
  'app_icon_registry',
  'branding_settings',
  'notification_templates',
  'banners',
  'entry_banners',
  'entry_name_bars',
  'categories',
  'channels',
  'coin_packages',
  'currency_rates',
  'daily_login_rewards_config',
  'daily_tasks',
  'consumption_return_config',
  'game_configs',
  'game_providers',
  'game_settings',
  'game_server_settings',
  'gifts',
  'gift_categories',
  'avatar_frames',
  'ar_stickers',
  'beauty_filters',
  'level_animations',
  'level_privileges',
  'feature_level_requirements',
  'host_levels',
  'user_level_tiers',
  'user_levels',
  'vip_tiers',
  'agency_level_tiers',
  'agency_policy_settings',
  'ranking_rewards',
  'invitation_reward_tiers',
  'invitation_settings',
  'parcel_templates',
  'party_room_backgrounds',
  'payment_gateways',
  'topup_payment_methods',
  'subscription_plans',
  'violation_penalties',
  'helper_diamond_packages',
  'helper_level_config',
  'helper_payment_methods',
  'leaderboard_reward_config',
  'leaderboard_podium_frames',
  'pk_competition_rewards',
  'limited_time_offers',
  'first_recharge_bonus',
  'new_host_live_bonus_settings',
  'live_moderation_settings',
  'admin_music_library',
  'content_audio_tracks',
  'admin_sections',
  'admin_notices',
  'allowed_external_links',
  'landing_page_sections',
  'site_settings',
  'room_welcome_messages',
  'iptv_sources',
  'news_sources',
  'helper_country_payment_methods',
  'diamond_exchange_packages',
  'pk_reward_badges',
  'entertainment',
  'music',
  'movies',
  'kids_content',
  'news',

  // User-dependent tables
  'profiles',
  'admin_users',
  'agencies',
  'agency_hosts',

  // Transaction/activity tables
  'followers',
  'conversations',
  'device_tokens',
  'blocked_ips',
  'banned_devices',
  'account_lockouts',
  'admin_logs',
  'admin_stats',
  'admin_section_permissions',
  'admin_allowed_devices',
  'admin_invitations',
  'agency_commission_history',
  'agency_diamond_transactions',
  'agency_earnings_transfers',
  'agency_performance',
  'agency_rankings',
  'agency_withdrawals',
  'registration_bonus_claims',
  'daily_login_claims',
  'consumption_return_history',
  'host_applications',
  'host_conversion_requests',
  'helper_applications',
  'invitation_reward_claims',
  'payment_methods',
  'payment_transactions',
  'coin_transfers',
  'gift_transactions',
  'gift_transaction_logs',
  'call_events',
  'face_records',
  'face_verification_submissions',
  'party_room_banners',
]

async function syncTable(
  oldClient: any,
  newClient: any,
  tableName: string,
  batchSize = 500
): Promise<{ table: string; synced: number; skipped: number; error?: string }> {
  try {
    // Check if new table already has data
    const { count: existingCount } = await newClient
      .from(tableName)
      .select('*', { count: 'exact', head: true })

    if (existingCount && existingCount > 0) {
      return { table: tableName, synced: 0, skipped: existingCount, error: `Already has ${existingCount} rows` }
    }

    // Fetch all data from old DB
    let allData: any[] = []
    let offset = 0
    let hasMore = true

    while (hasMore) {
      const { data, error } = await oldClient
        .from(tableName)
        .select('*')
        .range(offset, offset + batchSize - 1)
        .order('created_at', { ascending: true, nullsFirst: true })

      if (error) {
        // Try without ordering if created_at doesn't exist
        const { data: data2, error: error2 } = await oldClient
          .from(tableName)
          .select('*')
          .range(offset, offset + batchSize - 1)

        if (error2) throw error2
        if (!data2 || data2.length === 0) {
          hasMore = false
        } else {
          allData = [...allData, ...data2]
          offset += batchSize
          if (data2.length < batchSize) hasMore = false
        }
      } else {
        if (!data || data.length === 0) {
          hasMore = false
        } else {
          allData = [...allData, ...data]
          offset += batchSize
          if (data.length < batchSize) hasMore = false
        }
      }
    }

    if (allData.length === 0) {
      return { table: tableName, synced: 0, skipped: 0 }
    }

    // Insert in batches
    let insertedCount = 0
    for (let i = 0; i < allData.length; i += batchSize) {
      const batch = allData.slice(i, i + batchSize)
      const { error: insertError } = await newClient
        .from(tableName)
        .upsert(batch, { onConflict: 'id', ignoreDuplicates: true })

      if (insertError) {
        console.error(`Error inserting into ${tableName}:`, insertError.message)
        // Try one by one for problematic batches
        for (const row of batch) {
          const { error: singleError } = await newClient
            .from(tableName)
            .upsert(row, { onConflict: 'id', ignoreDuplicates: true })
          if (!singleError) insertedCount++
        }
      } else {
        insertedCount += batch.length
      }
    }

    return { table: tableName, synced: insertedCount, skipped: 0 }
  } catch (err: any) {
    console.error(`Failed to sync ${tableName}:`, err.message)
    return { table: tableName, synced: 0, skipped: 0, error: err.message }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Auth check - require admin owner token
    const authHeader = req.headers.get('authorization') || ''
    const adminToken = Deno.env.get('ADMIN_OWNER_TOKEN') || ''
    const token = authHeader.replace('Bearer ', '').trim()
    
    if (!adminToken || token !== adminToken) {
      return new Response(JSON.stringify({ error: 'Unauthorized - admin token required' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const oldUrl = Deno.env.get('OLD_SUPABASE_URL')
    const oldKey = Deno.env.get('OLD_SUPABASE_SERVICE_ROLE_KEY')
    const newUrl = Deno.env.get('SUPABASE_URL')!
    const newKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    if (!oldUrl || !oldKey) {
      return new Response(
        JSON.stringify({ error: 'OLD_SUPABASE_URL and OLD_SUPABASE_SERVICE_ROLE_KEY are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const oldClient = createClient(oldUrl, oldKey)
    const newClient = createClient(newUrl, newKey)

    // Parse request body for options
    let specificTables: string[] | null = null
    let forceSync = false
    
    if (req.method === 'POST') {
      try {
        const body = await req.json()
        specificTables = body.tables || null
        forceSync = body.force || false
      } catch {}
    }

    const tablesToSync = specificTables || SYNC_TABLES
    
    const results: any[] = []
    
    // Sync tables sequentially to respect FK constraints
    for (const table of tablesToSync) {
      console.log(`Syncing table: ${table}...`)
      const result = await syncTable(oldClient, newClient, table, 500)
      results.push(result)
      console.log(`  → ${result.synced} synced, ${result.skipped} skipped${result.error ? ` (${result.error})` : ''}`)
    }

    const summary = {
      total_tables: results.length,
      synced_tables: results.filter(r => r.synced > 0).length,
      skipped_tables: results.filter(r => r.skipped > 0).length,
      failed_tables: results.filter(r => r.error && r.synced === 0 && r.skipped === 0).length,
      total_rows_synced: results.reduce((sum, r) => sum + r.synced, 0),
      details: results,
    }

    return new Response(JSON.stringify(summary, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err: any) {
    console.error('Sync error:', err)
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
