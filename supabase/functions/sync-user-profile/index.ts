import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type JsonRecord = Record<string, any>

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('authorization') || ''
    const newUrl = Deno.env.get('SUPABASE_URL')!
    const newKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const newClient = createClient(newUrl, newKey)

    const token = authHeader.replace('Bearer ', '').trim()
    const { data: { user }, error: userError } = await newClient.auth.getUser(token)
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: currentProfile } = await newClient
      .from('profiles')
      .select('id, display_name, username, user_level, vip_level, host_level, coins, diamonds, beans, beans_balance, is_host, is_verified, is_agency_owner, agency_id, avatar_url')
      .eq('id', user.id)
      .maybeSingle()

    if (!currentProfile) {
      return new Response(JSON.stringify({ synced: false, reason: 'no_profile' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let oldUrl = (Deno.env.get('OLD_SUPABASE_URL') || '').trim()
    const oldKey = (Deno.env.get('OLD_SUPABASE_SERVICE_ROLE_KEY') || '').trim()

    if (!oldUrl || !oldKey) {
      return new Response(JSON.stringify({ synced: false, reason: 'no_old_config' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!oldUrl.startsWith('http')) oldUrl = `https://${oldUrl}`
    const oldClient = createClient(oldUrl, oldKey)

    const oldProfile = await findLegacyProfile(oldClient, user, currentProfile)
    if (!oldProfile) {
      return new Response(JSON.stringify({ synced: false, reason: 'not_found_in_old' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const oldAgency = await findLegacyAgency(oldClient, oldProfile)
    const oldHelper = await findLegacyHelper(oldClient, oldProfile)
    const oldAgencyHost = await findLegacyAgencyHost(oldClient, oldProfile)
    const oldRoles = await findLegacyRoles(oldClient, oldProfile)

    const profilePatch = buildProfilePatch(currentProfile, oldProfile, oldAgency, oldHelper, oldAgencyHost, user.email)

    if (Object.keys(profilePatch).length > 0) {
      const { error } = await newClient
        .from('profiles')
        .update({ ...profilePatch, updated_at: new Date().toISOString() })
        .eq('id', user.id)

      if (error) throw error
    }

    const syncedAgency = await syncAgencyOwnership(newClient, user.id, oldAgency)
    const syncedHelper = await syncHelperRecord(newClient, user.id, oldHelper)
    await syncAgencyHostMembership(newClient, user.id, syncedAgency, oldAgencyHost)
    await syncUserRoles(newClient, user.id, oldRoles, oldAgency, oldHelper, profilePatch)

    return new Response(JSON.stringify({
      synced: true,
      profileUpdated: Object.keys(profilePatch).length > 0,
      agencySynced: !!syncedAgency,
      helperSynced: !!syncedHelper,
      rolesSynced: oldRoles.length > 0 || !!oldAgency || !!oldHelper,
      resolvedName: profilePatch.display_name || currentProfile.display_name || currentProfile.username || null,
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

async function findLegacyProfile(oldClient: any, user: any, currentProfile: JsonRecord) {
  const email = (user.email || '').toLowerCase().trim()
  const candidateIds = [currentProfile.id, user.id].filter(Boolean)
  const candidateNames = [currentProfile.username, currentProfile.display_name].filter(Boolean)

  if (email) {
    const byEmail = await tryMaybeSingle(
      oldClient.from('profiles').select('*').ilike('email', email)
    )
    if (byEmail) return byEmail
  }

  for (const id of candidateIds) {
    const byId = await tryMaybeSingle(
      oldClient.from('profiles').select('*').eq('id', id)
    )
    if (byId) return byId
  }

  for (const name of candidateNames) {
    const byUsername = await tryMaybeSingle(
      oldClient.from('profiles').select('*').eq('username', name)
    )
    if (byUsername) return byUsername
  }

  return null
}

async function findLegacyAgency(oldClient: any, oldProfile: JsonRecord) {
  const oldUserId = oldProfile.id
  if (!oldUserId) return null

  const ownedAgency = await tryMaybeSingle(
    oldClient.from('agencies').select('*').eq('owner_id', oldUserId)
  )
  if (ownedAgency) return ownedAgency

  if (oldProfile.agency_id) {
    const directAgency = await tryMaybeSingle(
      oldClient.from('agencies').select('*').eq('id', oldProfile.agency_id)
    )
    if (directAgency) return directAgency
  }

  return null
}

async function findLegacyHelper(oldClient: any, oldProfile: JsonRecord) {
  const oldUserId = oldProfile.id
  if (!oldUserId) return null

  return await tryMaybeSingle(
    oldClient
      .from('topup_helpers')
      .select('*')
      .eq('user_id', oldUserId)
      .eq('is_verified', true)
  )
}

async function findLegacyAgencyHost(oldClient: any, oldProfile: JsonRecord) {
  const oldUserId = oldProfile.id
  if (!oldUserId) return null

  return await tryMaybeSingle(
    oldClient
      .from('agency_hosts')
      .select('*')
      .eq('host_id', oldUserId)
      .eq('status', 'active')
  )
}

async function findLegacyRoles(oldClient: any, oldProfile: JsonRecord) {
  const oldUserId = oldProfile.id
  if (!oldUserId) return []

  const { data } = await oldClient
    .from('user_roles')
    .select('role')
    .eq('user_id', oldUserId)

  return Array.isArray(data) ? data : []
}

function buildProfilePatch(
  currentProfile: JsonRecord,
  oldProfile: JsonRecord,
  oldAgency: JsonRecord | null,
  oldHelper: JsonRecord | null,
  oldAgencyHost: JsonRecord | null,
  currentEmail?: string | null,
) {
  const patch: JsonRecord = {}

  const oldDisplayName = firstText(oldProfile, 'display_name', 'username', 'full_name', 'name')
  const oldUsername = firstText(oldProfile, 'username', 'display_name')
  const oldAvatar = firstText(oldProfile, 'avatar_url', 'profile_photo_url')
  const oldGender = firstText(oldProfile, 'gender')
  const oldBio = firstText(oldProfile, 'bio')
  const oldCountryCode = firstText(oldProfile, 'country_code')
  const oldCountryFlag = firstText(oldProfile, 'country_flag')
  const oldCountryName = firstText(oldProfile, 'country_name')
  const oldCity = firstText(oldProfile, 'city')
  const oldRegion = firstText(oldProfile, 'region')
  const oldAgencyId = firstText(oldProfile, 'agency_id')

  const oldCoins = firstPositiveNumber(oldProfile, 'coins', 'diamonds', 'diamonds_balance', 'coins_balance', 'diamond_balance')
  const oldBeans = firstPositiveNumber(oldProfile, 'beans', 'beans_balance')
  const oldUserLevel = firstPositiveNumber(oldProfile, 'user_level', 'level')
  const oldVipLevel = firstPositiveNumber(oldProfile, 'vip_level')
  const oldHostLevel = firstPositiveNumber(oldProfile, 'host_level')
  const oldAge = firstPositiveNumber(oldProfile, 'age')

  const legacyLooksBetter = (incoming?: string | null) => !!incoming && !isWeakName(incoming, currentEmail)

  if (legacyLooksBetter(oldDisplayName) && (isWeakName(currentProfile.display_name, currentEmail) || normalizeText(currentProfile.display_name) !== normalizeText(oldDisplayName))) {
    patch.display_name = oldDisplayName
  }

  if (legacyLooksBetter(oldUsername) && (isWeakName(currentProfile.username, currentEmail) || normalizeText(currentProfile.username) !== normalizeText(oldUsername))) {
    patch.username = oldUsername
  }

  if (oldAvatar && !currentProfile.avatar_url) patch.avatar_url = oldAvatar
  if (oldBio && !currentProfile.bio) patch.bio = oldBio
  if (oldGender && !currentProfile.gender) patch.gender = oldGender
  if (oldAge > 0 && (!currentProfile.age || Number(currentProfile.age) <= 0)) patch.age = oldAge
  if (oldCountryCode && !currentProfile.country_code) patch.country_code = oldCountryCode
  if (oldCountryFlag && !currentProfile.country_flag) patch.country_flag = oldCountryFlag
  if (oldCountryName && !currentProfile.country_name) patch.country_name = oldCountryName
  if (oldCity && !currentProfile.city) patch.city = oldCity
  if (oldRegion && !currentProfile.region) patch.region = oldRegion

  if (oldUserLevel > Number(currentProfile.user_level || 0)) patch.user_level = oldUserLevel
  if (oldVipLevel > Number(currentProfile.vip_level || 0)) patch.vip_level = oldVipLevel
  if (oldHostLevel > Number(currentProfile.host_level || 0)) patch.host_level = oldHostLevel

  const currentCoinBalance = Math.max(Number(currentProfile.coins || 0), Number(currentProfile.diamonds || 0))
  if (oldCoins > currentCoinBalance) {
    patch.coins = oldCoins
    patch.diamonds = oldCoins
  }

  const currentBeans = Math.max(Number(currentProfile.beans || 0), Number(currentProfile.beans_balance || 0))
  if (oldBeans > currentBeans) {
    patch.beans = oldBeans
    patch.beans_balance = oldBeans
  }

  const shouldBeHost = Boolean(oldProfile.is_host || oldAgencyHost)
  if (shouldBeHost && !currentProfile.is_host) patch.is_host = true

  const shouldBeVerified = Boolean(oldProfile.is_verified || oldProfile.is_face_verified)
  if (shouldBeVerified && !currentProfile.is_verified) patch.is_verified = true

  const shouldBeAgencyOwner = Boolean(oldProfile.is_agency_owner || oldAgency)
  if (shouldBeAgencyOwner && !currentProfile.is_agency_owner) patch.is_agency_owner = true

  if (!currentProfile.agency_id && oldAgencyId) {
    patch.agency_id = oldAgencyId
  }

  if (oldProfile.is_face_verified && !currentProfile.is_face_verified) {
    patch.is_face_verified = true
  }

  return patch
}

async function syncAgencyOwnership(newClient: any, newUserId: string, oldAgency: JsonRecord | null) {
  if (!oldAgency) return null

  let existingAgency = null

  if (oldAgency.id) {
    existingAgency = await tryMaybeSingle(
      newClient.from('agencies').select('id, agency_code, owner_id').eq('id', oldAgency.id)
    )
  }

  if (!existingAgency && oldAgency.agency_code) {
    existingAgency = await tryMaybeSingle(
      newClient.from('agencies').select('id, agency_code, owner_id').eq('agency_code', oldAgency.agency_code)
    )
  }

  const payload = {
    owner_id: newUserId,
    is_active: oldAgency.is_active ?? true,
    level: oldAgency.level ?? null,
    total_hosts: oldAgency.total_hosts ?? 0,
    total_agents: oldAgency.total_agents ?? 0,
    beans_balance: oldAgency.beans_balance ?? 0,
    diamond_balance: oldAgency.diamond_balance ?? oldAgency.wallet_balance ?? 0,
    wallet_balance: oldAgency.wallet_balance ?? oldAgency.diamond_balance ?? 0,
    whatsapp_number: oldAgency.whatsapp_number ?? null,
    email: oldAgency.email ?? null,
    updated_at: new Date().toISOString(),
  }

  if (existingAgency) {
    const { error } = await newClient
      .from('agencies')
      .update(payload)
      .eq('id', existingAgency.id)

    if (error) throw error

    return { ...existingAgency, ...payload }
  }

  if (!oldAgency.agency_code || !oldAgency.name) return null

  const { data, error } = await newClient
    .from('agencies')
    .insert({
      id: oldAgency.id,
      agency_code: oldAgency.agency_code,
      name: oldAgency.name,
      logo_url: oldAgency.logo_url ?? null,
      parent_agency_id: oldAgency.parent_agency_id ?? null,
      commission_rate: oldAgency.commission_rate ?? null,
      ...payload,
    })
    .select('id, agency_code, owner_id')
    .single()

  if (error) throw error
  return data
}

async function syncHelperRecord(newClient: any, newUserId: string, oldHelper: JsonRecord | null) {
  if (!oldHelper) return null

  const payload = {
    user_id: newUserId,
    is_verified: oldHelper.is_verified ?? true,
    is_active: oldHelper.is_active ?? true,
    wallet_balance: oldHelper.wallet_balance ?? 0,
    trader_level: oldHelper.trader_level ?? 1,
    country_code: oldHelper.country_code ?? null,
    auto_receive_orders: oldHelper.auto_receive_orders ?? true,
    buy_rate: oldHelper.buy_rate ?? null,
    sell_rate: oldHelper.sell_rate ?? null,
    commission_rate: oldHelper.commission_rate ?? null,
    supported_countries: oldHelper.supported_countries ?? null,
    total_bought: oldHelper.total_bought ?? 0,
    total_sold: oldHelper.total_sold ?? 0,
    total_earnings: oldHelper.total_earnings ?? 0,
    payroll_enabled: oldHelper.payroll_enabled ?? false,
    payroll_status: oldHelper.payroll_status ?? null,
    order_notification_email: oldHelper.order_notification_email ?? null,
    order_notification_phone: oldHelper.order_notification_phone ?? null,
    contact_info: oldHelper.contact_info ?? null,
    payment_credentials: oldHelper.payment_credentials ?? null,
    updated_at: new Date().toISOString(),
  }

  const existingHelper = await tryMaybeSingle(
    newClient.from('topup_helpers').select('id').eq('user_id', newUserId)
  )

  if (existingHelper) {
    const { error } = await newClient
      .from('topup_helpers')
      .update(payload)
      .eq('id', existingHelper.id)

    if (error) throw error
    return { ...existingHelper, ...payload }
  }

  const { data, error } = await newClient
    .from('topup_helpers')
    .insert({
      id: oldHelper.id,
      approved_at: oldHelper.approved_at ?? new Date().toISOString(),
      approved_by: oldHelper.approved_by ?? null,
      created_at: oldHelper.created_at ?? new Date().toISOString(),
      display_order: oldHelper.display_order ?? null,
      payroll_applied_at: oldHelper.payroll_applied_at ?? null,
      payroll_approved_at: oldHelper.payroll_approved_at ?? null,
      payroll_approved_by: oldHelper.payroll_approved_by ?? null,
      total_level_upgrade_cost: oldHelper.total_level_upgrade_cost ?? 0,
      ...payload,
    })
    .select('id')
    .single()

  if (error) throw error
  return data
}

async function syncAgencyHostMembership(newClient: any, newUserId: string, syncedAgency: JsonRecord | null, oldAgencyHost: JsonRecord | null) {
  if (!oldAgencyHost) return

  let targetAgencyId = syncedAgency?.id || oldAgencyHost.agency_id
  if (!targetAgencyId) return

  if (!syncedAgency && oldAgencyHost.agency_id) {
    const matchedAgency = await tryMaybeSingle(
      newClient.from('agencies').select('id').eq('id', oldAgencyHost.agency_id)
    )
    targetAgencyId = matchedAgency?.id || targetAgencyId
  }

  const existing = await tryMaybeSingle(
    newClient
      .from('agency_hosts')
      .select('id')
      .eq('host_id', newUserId)
      .eq('agency_id', targetAgencyId)
  )

  const payload = {
    agency_id: targetAgencyId,
    host_id: newUserId,
    status: oldAgencyHost.status ?? 'active',
    joined_at: oldAgencyHost.joined_at ?? new Date().toISOString(),
    joined_via: oldAgencyHost.joined_via ?? null,
    referral_code: oldAgencyHost.referral_code ?? null,
    left_at: null,
  }

  if (existing) {
    const { error } = await newClient.from('agency_hosts').update(payload).eq('id', existing.id)
    if (error) throw error
    return
  }

  const { error } = await newClient.from('agency_hosts').insert(payload)
  if (error) throw error
}

async function syncUserRoles(
  newClient: any,
  newUserId: string,
  oldRoles: Array<{ role: string }>,
  oldAgency: JsonRecord | null,
  oldHelper: JsonRecord | null,
  profilePatch: JsonRecord,
) {
  const roleSet = new Set<string>((oldRoles || []).map((r) => String(r.role).trim()).filter(Boolean))

  if (oldAgency || profilePatch.is_agency_owner) roleSet.add('agency')
  if (oldHelper) roleSet.add('helper')
  if (profilePatch.is_host) roleSet.add('host')
  roleSet.add('user')

  const roles = [...roleSet]
  if (roles.length === 0) return

  const existing = await newClient
    .from('user_roles')
    .select('role')
    .eq('user_id', newUserId)

  const existingSet = new Set((existing.data || []).map((r: any) => String(r.role)))
  const missing = roles.filter((role) => !existingSet.has(role))
  if (missing.length === 0) return

  const { error } = await newClient
    .from('user_roles')
    .insert(missing.map((role) => ({ user_id: newUserId, role })))

  if (error) throw error
}

async function tryMaybeSingle(query: PromiseLike<any> | any) {
  try {
    const { data, error } = await query.maybeSingle()
    if (error) return null
    return data ?? null
  } catch {
    return null
  }
}

function firstText(obj: JsonRecord, ...keys: string[]) {
  for (const key of keys) {
    const value = obj?.[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function firstPositiveNumber(obj: JsonRecord, ...keys: string[]) {
  for (const key of keys) {
    const raw = obj?.[key]
    const value = Number(raw)
    if (Number.isFinite(value) && value > 0) return value
  }
  return 0
}

function normalizeText(value?: string | null) {
  return (value || '').trim().toLowerCase()
}

function isWeakName(value?: string | null, currentEmail?: string | null) {
  const normalized = normalizeText(value)
  if (!normalized) return true
  if (['user', 'owner', 'unknown', 'test', 'guest'].includes(normalized)) return true
  if (normalized.length <= 2) return true
  if (currentEmail) {
    const emailPrefix = currentEmail.split('@')[0]?.trim().toLowerCase()
    if (emailPrefix && normalized === emailPrefix) return true
  }
  return false
}
