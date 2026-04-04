/**
 * CENTRALIZED ENTRY ANIMATION FETCHER
 * 
 * This utility fetches entry animation URLs from ALL possible sources:
 * 1. entry_banners table (primary)
 * 2. shop_items table (secondary)
 * 3. level_privileges table (tertiary - for VIP items)
 * 
 * PERFORMANCE: Uses in-memory LRU cache for instant lookups on repeated joins.
 * Cache TTL: 5 minutes. Max entries: 200.
 */

import { supabase } from '@/integrations/supabase/client';

// ============= IN-MEMORY CACHE FOR INSTANT LOOKUPS =============
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 200;

interface CacheEntry {
  value: string | undefined;
  timestamp: number;
}

const animationCache = new Map<string, CacheEntry>();

function getCached(key: string): string | undefined | null {
  const entry = animationCache.get(key);
  if (!entry) return null; // null = not in cache
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    animationCache.delete(key);
    return null;
  }
  return entry.value; // undefined = cached "not found"
}

function setCache(key: string, value: string | undefined) {
  // Evict oldest if full
  if (animationCache.size >= MAX_CACHE_SIZE) {
    const firstKey = animationCache.keys().next().value;
    if (firstKey) animationCache.delete(firstKey);
  }
  animationCache.set(key, { value, timestamp: Date.now() });
}

export interface EntryAnimationResult {
  entranceAnimationUrl?: string;
  entryNameBarUrl?: string;
  vehicleAnimationUrl?: string;
}

/**
 * Fetch animation URL by ID from all possible tables
 * Checks: entry_banners -> shop_items -> level_privileges
 */
export async function fetchAnimationUrlById(animationId: string): Promise<string | undefined> {
  if (!animationId) return undefined;

  // Check cache first - instant return
  const cached = getCached(`anim:${animationId}`);
  if (cached !== null) return cached;

  console.log('[fetchAnimationUrlById] 🔍 Looking up animation ID:', animationId);

  try {
    // Run all queries in parallel for faster lookup - check ALL possible tables
    const [entryBannerResult, shopItemResult, levelPrivilegeResult, vipTierResult, entryNameBarResult] = await Promise.all([
      // 1. Try entry_banners table
      supabase
        .from('entry_banners')
        .select('animation_url')
        .eq('id', animationId)
        .maybeSingle(),
      
      // 2. Try shop_items table
      supabase
        .from('shop_items')
        .select('animation_url, animation_file_url')
        .eq('id', animationId)
        .maybeSingle(),
      
      // 3. Try level_privileges table (VIP items stored here - includes entry_bar and entrance types)
      supabase
        .from('level_privileges')
        .select('animation_url, privilege_type, name')
        .eq('id', animationId)
        .maybeSingle(),
        
      // 4. Try vip_tiers table (VIP tier entry animations)
      supabase
        .from('vip_tiers')
        .select('entry_animation_url')
        .eq('id', animationId)
        .maybeSingle(),
        
      // 5. Try entry_name_bars table (can also have entrance animations)
      supabase
        .from('entry_name_bars')
        .select('animation_url')
        .eq('id', animationId)
        .maybeSingle(),
    ]);

    console.log('[fetchAnimationUrlById] 📊 Query results for ID:', animationId, {
      entryBanner: entryBannerResult.data?.animation_url ? '✅ FOUND' : '❌ not found',
      shopItem: (shopItemResult.data?.animation_url || shopItemResult.data?.animation_file_url) ? '✅ FOUND' : '❌ not found',
      levelPrivilege: levelPrivilegeResult.data?.animation_url ? `✅ FOUND (type: ${levelPrivilegeResult.data.privilege_type}, name: ${levelPrivilegeResult.data.name})` : '❌ not found',
      vipTier: vipTierResult.data?.entry_animation_url ? '✅ FOUND' : '❌ not found',
      entryNameBar: entryNameBarResult.data?.animation_url ? '✅ FOUND' : '❌ not found',
    });

    // Check entry_banners
    if (entryBannerResult.data?.animation_url) {
      setCache(`anim:${animationId}`, entryBannerResult.data.animation_url);
      return entryBannerResult.data.animation_url;
    }

    // Check shop_items
    const shopUrl = shopItemResult.data?.animation_url || shopItemResult.data?.animation_file_url;
    if (shopUrl) {
      setCache(`anim:${animationId}`, shopUrl);
      return shopUrl;
    }

    // Check level_privileges
    if (levelPrivilegeResult.data?.animation_url) {
      setCache(`anim:${animationId}`, levelPrivilegeResult.data.animation_url);
      return levelPrivilegeResult.data.animation_url;
    }

    // Check vip_tiers
    if (vipTierResult.data?.entry_animation_url) {
      setCache(`anim:${animationId}`, vipTierResult.data.entry_animation_url);
      return vipTierResult.data.entry_animation_url;
    }
    
    // Check entry_name_bars
    if (entryNameBarResult.data?.animation_url) {
      setCache(`anim:${animationId}`, entryNameBarResult.data.animation_url);
      return entryNameBarResult.data.animation_url;
    }

    // Not found - cache as undefined to avoid re-fetching
    setCache(`anim:${animationId}`, undefined);
    return undefined;
  } catch (error) {
    console.error('[fetchAnimationUrlById] ⚠️ Error fetching animation:', error);
    return undefined;
  }
}

/**
 * Fetch entry name bar animation URL by ID
 * Checks: entry_name_bars -> level_privileges (entry_bar type) -> shop_items
 */
export async function fetchEntryNameBarUrlById(nameBarId: string): Promise<string | undefined> {
  if (!nameBarId) return undefined;

  // Check cache first
  const cached = getCached(`namebar:${nameBarId}`);
  if (cached !== null) return cached;

  try {
    // Run all queries in parallel - including VIP tiers and all animation-related tables
    const [entryNameBarResult, levelPrivilegeResult, shopItemResult, entryBannerResult] = await Promise.all([
      // 1. Try entry_name_bars table (primary source for name bars)
      supabase
        .from('entry_name_bars')
        .select('animation_url')
        .eq('id', nameBarId)
        .maybeSingle(),
      
      // 2. Try level_privileges table (entry_bar type items)
      supabase
        .from('level_privileges')
        .select('animation_url, privilege_type')
        .eq('id', nameBarId)
        .maybeSingle(),
      
      // 3. Try shop_items table (shop purchased entry bars)
      supabase
        .from('shop_items')
        .select('animation_url, animation_file_url, category')
        .eq('id', nameBarId)
        .maybeSingle(),
      
      // 4. Try entry_banners table (can also store entry bar type animations)
      supabase
        .from('entry_banners')
        .select('animation_url')
        .eq('id', nameBarId)
        .maybeSingle(),
    ]);

    console.log('[fetchEntryNameBarUrlById] Query results:', {
      entryNameBar: entryNameBarResult.data?.animation_url ? 'found' : 'not found',
      levelPrivilege: levelPrivilegeResult.data?.animation_url ? 'found' : 'not found',
      shopItem: shopItemResult.data?.animation_url || shopItemResult.data?.animation_file_url ? 'found' : 'not found',
      entryBanner: entryBannerResult.data?.animation_url ? 'found' : 'not found',
    });

    if (entryNameBarResult.data?.animation_url) {
      setCache(`namebar:${nameBarId}`, entryNameBarResult.data.animation_url);
      return entryNameBarResult.data.animation_url;
    }

    if (entryBannerResult.data?.animation_url) {
      setCache(`namebar:${nameBarId}`, entryBannerResult.data.animation_url);
      return entryBannerResult.data.animation_url;
    }

    if (levelPrivilegeResult.data?.animation_url) {
      setCache(`namebar:${nameBarId}`, levelPrivilegeResult.data.animation_url);
      return levelPrivilegeResult.data.animation_url;
    }

    if (shopItemResult.data?.category === 'entry_bar') {
      const url = shopItemResult.data.animation_file_url || shopItemResult.data.animation_url;
      if (url) {
        setCache(`namebar:${nameBarId}`, url);
        return url;
      }
    }

    setCache(`namebar:${nameBarId}`, undefined);
    return undefined;
  } catch (error) {
    console.error('[fetchEntryNameBarUrlById] ⚠️ Error:', error);
    return undefined;
  }
}

/**
 * Fetch vehicle animation URL by ID from shop_items table
 */
export async function fetchVehicleAnimationUrlById(vehicleId: string): Promise<string | undefined> {
  if (!vehicleId) return undefined;

  const cached = getCached(`vehicle:${vehicleId}`);
  if (cached !== null) return cached;

  try {
    // Check BOTH shop_items AND level_privileges in parallel
    const [shopResult, privilegeResult] = await Promise.all([
      supabase
        .from('shop_items')
        .select('animation_url, animation_file_url, category, name')
        .eq('id', vehicleId)
        .maybeSingle(),
      supabase
        .from('level_privileges')
        .select('animation_url, name, privilege_type')
        .eq('id', vehicleId)
        .maybeSingle(),
    ]);

    // Check shop_items first
    if (shopResult.data) {
      const url = shopResult.data.animation_file_url || shopResult.data.animation_url;
      if (url) {
        setCache(`vehicle:${vehicleId}`, url);
        return url;
      }
    }

    // Check level_privileges (vehicle_entrance type)
    if (privilegeResult.data?.animation_url) {
      setCache(`vehicle:${vehicleId}`, privilegeResult.data.animation_url);
      return privilegeResult.data.animation_url;
    }

    setCache(`vehicle:${vehicleId}`, undefined);
    return undefined;
  } catch (error) {
    return undefined;
  }
}

/**
 * Fetch level-based entry name bar when user has no equipped one
 * Checks BOTH entry_name_bars AND level_privileges (entry_bar type)
 * Returns the HIGHEST level match the user qualifies for
 */
async function fetchLevelBasedEntryNameBar(userLevel: number): Promise<string | undefined> {
  const cached = getCached(`lvl-namebar:${userLevel}`);
  if (cached !== null) return cached;
  try {
    
    // Check BOTH tables in parallel
    const [entryNameBarResult, levelPrivilegeResult] = await Promise.all([
      // 1. entry_name_bars table
      supabase
        .from('entry_name_bars')
        .select('animation_url, name, min_level')
        .eq('is_active', true)
        .lte('min_level', userLevel)
        .order('min_level', { ascending: false })
        .limit(1)
        .maybeSingle(),
      // 2. level_privileges table (entry_bar type)
      supabase
        .from('level_privileges')
        .select('animation_url, name, unlock_level')
        .eq('is_active', true)
        .eq('privilege_type', 'entry_bar')
        .lte('unlock_level', userLevel)
        .order('unlock_level', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    
    // Pick the HIGHEST level match between both tables
    const nameBarLevel = entryNameBarResult.data?.min_level ?? 0;
    const privilegeLevel = levelPrivilegeResult.data?.unlock_level ?? 0;
    
    if (privilegeLevel >= nameBarLevel && levelPrivilegeResult.data?.animation_url) {
      setCache(`lvl-namebar:${userLevel}`, levelPrivilegeResult.data.animation_url);
      return levelPrivilegeResult.data.animation_url;
    }
    
    if (entryNameBarResult.data?.animation_url) {
      setCache(`lvl-namebar:${userLevel}`, entryNameBarResult.data.animation_url);
      return entryNameBarResult.data.animation_url;
    }
    
    setCache(`lvl-namebar:${userLevel}`, undefined);
    return undefined;
  } catch (error) {
    console.error('[fetchLevelBasedEntryNameBar] ⚠️ Error:', error);
    return undefined;
  }
}

/**
 * Fetch level-based entrance animation when user has no equipped one
 * Checks level_privileges (entrance type) and entry_banners for the best match
 */
async function fetchLevelBasedEntrance(userLevel: number): Promise<string | undefined> {
  const cached = getCached(`lvl-entrance:${userLevel}`);
  if (cached !== null) return cached;
  try {
    
    const [privilegeResult, bannerResult] = await Promise.all([
      // Check level_privileges for entrance type
      supabase
        .from('level_privileges')
        .select('animation_url, name, unlock_level, privilege_type')
        .eq('is_active', true)
        .in('privilege_type', ['entrance', 'entrance_effect'])
        .lte('unlock_level', userLevel)
        .order('unlock_level', { ascending: false })
        .limit(1)
        .maybeSingle(),
      // Check entry_banners table
      supabase
        .from('entry_banners')
        .select('animation_url, name, min_level')
        .eq('is_active', true)
        .lte('min_level', userLevel)
        .order('min_level', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    
    // Use the highest level match
    const privilegeLevel = privilegeResult.data?.unlock_level ?? 0;
    const bannerLevel = bannerResult.data?.min_level ?? 0;
    
    if (privilegeLevel >= bannerLevel && privilegeResult.data?.animation_url) {
      setCache(`lvl-entrance:${userLevel}`, privilegeResult.data.animation_url);
      return privilegeResult.data.animation_url;
    }
    
    if (bannerResult.data?.animation_url) {
      setCache(`lvl-entrance:${userLevel}`, bannerResult.data.animation_url);
      return bannerResult.data.animation_url;
    }
    
    setCache(`lvl-entrance:${userLevel}`, undefined);
    return undefined;
  } catch (error) {
    console.error('[fetchLevelBasedEntrance] ⚠️ Error:', error);
    return undefined;
  }
}

/**
 * Fetch level-based vehicle animation when user has no equipped one
 * Checks level_privileges (vehicle_entrance type) for best match
 */
async function fetchLevelBasedVehicle(userLevel: number): Promise<string | undefined> {
  const cached = getCached(`lvl-vehicle:${userLevel}`);
  if (cached !== null) return cached;
  try {
    
    const { data, error } = await supabase
      .from('level_privileges')
      .select('animation_url, name, unlock_level')
      .eq('is_active', true)
      .eq('privilege_type', 'vehicle_entrance')
      .lte('unlock_level', userLevel)
      .order('unlock_level', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (error) {
      console.error('[fetchLevelBasedVehicle] ⚠️ Error:', error);
      return undefined;
    }
    
    if (data?.animation_url) {
      setCache(`lvl-vehicle:${userLevel}`, data.animation_url);
      return data.animation_url;
    }
    
    setCache(`lvl-vehicle:${userLevel}`, undefined);
    return undefined;
  } catch (error) {
    console.error('[fetchLevelBasedVehicle] ⚠️ Error:', error);
    return undefined;
  }
}

/**
 * Fetch all entry animations for a user
 * This is the main function to use in LiveStream and PartyRoom
 * 
 * AUTO-ASSIGNS level-based animations when user has no equipped item:
 * - Entry Name Bar: checks entry_name_bars + level_privileges (entry_bar)
 * - Entrance: checks level_privileges (entrance/entrance_effect) + entry_banners
 * - Vehicle: checks level_privileges (vehicle_entrance)
 * 
 * @param userLevel - Optional user level for auto-assigning level-based animations
 */
export async function fetchUserEntryAnimations(
  equippedEntranceId?: string | null,
  equippedEntryNameBarId?: string | null,
  equippedVehicleId?: string | null,
  userLevel?: number | null
): Promise<EntryAnimationResult> {
  const result: EntryAnimationResult = {};

  // Fetch all equipped animations in parallel for better performance
  const [entranceUrl, nameBarUrl, vehicleUrl] = await Promise.all([
    equippedEntranceId ? fetchAnimationUrlById(equippedEntranceId) : Promise.resolve(undefined),
    equippedEntryNameBarId ? fetchEntryNameBarUrlById(equippedEntryNameBarId) : Promise.resolve(undefined),
    equippedVehicleId ? fetchVehicleAnimationUrlById(equippedVehicleId) : Promise.resolve(undefined),
  ]);

  result.entranceAnimationUrl = entranceUrl;
  result.entryNameBarUrl = nameBarUrl;
  result.vehicleAnimationUrl = vehicleUrl;

  // AUTO-ASSIGN: For any missing animations, check level-based assignments in parallel
  if (userLevel && userLevel >= 1) {
    const autoAssignPromises: Promise<void>[] = [];

    // Auto-assign entry name bar from entry_name_bars + level_privileges (entry_bar)
    if (!result.entryNameBarUrl) {
      autoAssignPromises.push(
        fetchLevelBasedEntryNameBar(userLevel).then(url => {
          if (url) {
            result.entryNameBarUrl = url;
            console.log('[fetchUserEntryAnimations] ✅ Auto-assigned level-based entry name bar');
          }
        })
      );
    }

    // Auto-assign entrance from level_privileges (entrance) + entry_banners
    if (!result.entranceAnimationUrl) {
      autoAssignPromises.push(
        fetchLevelBasedEntrance(userLevel).then(url => {
          if (url) {
            result.entranceAnimationUrl = url;
            console.log('[fetchUserEntryAnimations] ✅ Auto-assigned level-based entrance');
          }
        })
      );
    }

    // Auto-assign vehicle from level_privileges (vehicle_entrance)
    if (!result.vehicleAnimationUrl) {
      autoAssignPromises.push(
        fetchLevelBasedVehicle(userLevel).then(url => {
          if (url) {
            result.vehicleAnimationUrl = url;
            console.log('[fetchUserEntryAnimations] ✅ Auto-assigned level-based vehicle');
          }
        })
      );
    }

    // Run all auto-assign lookups in parallel
    if (autoAssignPromises.length > 0) {
      console.log('[fetchUserEntryAnimations] 🔄 Running', autoAssignPromises.length, 'level-based auto-assign checks for level:', userLevel);
      await Promise.all(autoAssignPromises);
    }
  }

  console.log('[fetchUserEntryAnimations] Final result:', {
    entrance: result.entranceAnimationUrl ? '✅' : '❌',
    nameBar: result.entryNameBarUrl ? '✅' : '❌',
    vehicle: result.vehicleAnimationUrl ? '✅' : '❌',
  });
  return result;
}
