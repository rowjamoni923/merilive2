/**
 * Global Frame Cache & Batch Fetcher
 * Eliminates N+1 queries by batching all frame lookups
 */
import { supabase } from '@/integrations/supabase/client';

interface FrameData {
  id: string;
  name: string;
  frame_url: string;
  frame_type: string | null;
  min_level: number;
}

interface UserFrameInfo {
  frame_id: string | null;
  equipped_frame_id: string | null;
}

// === CACHES ===
const frameDataCache = new Map<string, FrameData | null>();
const userFrameInfoCache = new Map<string, { data: UserFrameInfo; timestamp: number }>();
const resolvedFrameUrlCache = new Map<string, { url: string | null; type: string; timestamp: number }>();
const levelFrameCache = new Map<string, FrameData | null>();

const CACHE_TTL = 300_000; // 5 minutes
const BATCH_DELAY = 20; // ms - faster batch response for instant frame resolve
const MAX_IDS_PER_QUERY = 40;

// === BATCH QUEUE ===
let pendingUserIds = new Set<string>();
let batchTimer: ReturnType<typeof setTimeout> | null = null;
let batchPromise: Promise<void> | null = null;
let batchResolvers: Array<() => void> = [];

// === LISTENERS ===
type Listener = () => void;
const listeners = new Set<Listener>();

export const subscribeFrameCache = (fn: Listener) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

const notify = () => listeners.forEach(fn => fn());

// === CACHE HELPERS ===
const isValid = (timestamp: number) => Date.now() - timestamp < CACHE_TTL;

export const clearAllFrameCaches = () => {
  frameDataCache.clear();
  userFrameInfoCache.clear();
  resolvedFrameUrlCache.clear();
  levelFrameCache.clear();
  notify();
};

export const clearUserFrameCacheById = (userId: string) => {
  userFrameInfoCache.delete(userId);
  resolvedFrameUrlCache.delete(userId);
  notify();
};

// === BATCH FETCH ===
const executeBatch = async () => {
  const ids = Array.from(pendingUserIds);
  pendingUserIds.clear();
  batchTimer = null;
  
  if (ids.length === 0) {
    batchResolvers.forEach(r => r());
    batchResolvers = [];
    batchPromise = null;
    return;
  }

  // Filter out cached ones
  const uncachedIds = ids.filter(id => {
    const cached = userFrameInfoCache.get(id);
    return !cached || !isValid(cached.timestamp);
  });

  if (uncachedIds.length > 0) {
    try {
      const idChunks: string[][] = [];
      for (let i = 0; i < uncachedIds.length; i += MAX_IDS_PER_QUERY) {
        idChunks.push(uncachedIds.slice(i, i + MAX_IDS_PER_QUERY));
      }

      // CRITICAL: Use profiles_public (RLS-safe view) — direct profiles
      // SELECT is blocked for non-owner reads by hardened RLS, which
      // would silently return zero rows and break frame loading on every
      // surface (Chat list, message bubbles, profile headers, etc.).
      const chunkResults = await Promise.allSettled(
        idChunks.map((chunk) =>
          supabase
            .from('profiles_public')
            .select('id, frame_id, equipped_frame_id')
            .in('id', chunk)
        )
      );

      const now = Date.now();
      const foundIds = new Set<string>();

      chunkResults.forEach((result) => {
        if (result.status !== 'fulfilled') return;
        const rows = result.value.data || [];

        rows.forEach((p: any) => {
          foundIds.add(p.id);
          userFrameInfoCache.set(p.id, {
            data: { frame_id: p.frame_id, equipped_frame_id: p.equipped_frame_id },
            timestamp: now,
          });
        });
      });

      // Cache nulls for not found
      uncachedIds.forEach(id => {
        if (!foundIds.has(id)) {
          userFrameInfoCache.set(id, {
            data: { frame_id: null, equipped_frame_id: null },
            timestamp: now,
          });
        }
      });
    } catch (err) {
      console.error('[frameCache] Batch fetch error:', err);
    }
  }

  // Now resolve equipped frames - collect unique frame IDs that need avatar_frames lookup
  const frameIdsToFetch = new Set<string>();
  ids.forEach(userId => {
    const cached = userFrameInfoCache.get(userId);
    const equippedId = cached?.data.equipped_frame_id;
    const frameId = cached?.data.frame_id;
    if (equippedId && !frameDataCache.has(equippedId)) frameIdsToFetch.add(equippedId);
    if (frameId && !frameDataCache.has(frameId)) frameIdsToFetch.add(frameId);
  });

  if (frameIdsToFetch.size > 0) {
    try {
      const { data: frames } = await supabase
        .from('avatar_frames')
        .select('id, name, frame_url, frame_type, min_level')
        .in('id', Array.from(frameIdsToFetch))
        .eq('is_active', true);

      frames?.forEach((f: any) => {
        if (f.frame_url?.startsWith('http')) {
          const urlPath = f.frame_url.split('?')[0].toLowerCase();
          let detectedType = f.frame_type || 'static';
          if (urlPath.endsWith('.svga')) detectedType = 'svga';
          else if (urlPath.endsWith('.json')) detectedType = 'lottie';
          else if (urlPath.endsWith('.gif')) detectedType = 'gif';
          else if (urlPath.endsWith('.webp')) detectedType = 'webp';
          else if (urlPath.endsWith('.png') || urlPath.endsWith('.jpg')) detectedType = 'static';
          frameDataCache.set(f.id, { ...f, frame_type: detectedType });
        } else {
          frameDataCache.set(f.id, null);
        }
      });
      // Mark unfound as null
      frameIdsToFetch.forEach(id => {
        if (!frameDataCache.has(id)) frameDataCache.set(id, null);
      });
    } catch (err) {
      console.error('[frameCache] Frame data fetch error:', err);
    }
  }

  // Check shop_items for equipped frames not found in avatar_frames
  const shopCheckIds = new Set<string>();
  ids.forEach(userId => {
    const cached = userFrameInfoCache.get(userId);
    const equippedId = cached?.data.equipped_frame_id;
    if (equippedId && frameDataCache.get(equippedId) === null) {
      // Not in avatar_frames, might be shop item
      if (!resolvedFrameUrlCache.has(userId) || !isValid(resolvedFrameUrlCache.get(userId)!.timestamp)) {
        shopCheckIds.add(equippedId);
      }
    }
  });

  if (shopCheckIds.size > 0) {
    try {
      const { data: shopItems } = await supabase
        .from('shop_items')
        .select('id, animation_file_url, animation_url, preview_url')
        .in('id', Array.from(shopCheckIds));

      const shopMap = new Map<string, string>();
      shopItems?.forEach((item: any) => {
        const url = item.animation_file_url || item.animation_url || item.preview_url;
        if (url) shopMap.set(item.id, url);
      });

      const now = Date.now();
      ids.forEach(userId => {
        const cached = userFrameInfoCache.get(userId);
        const equippedId = cached?.data.equipped_frame_id;
        if (equippedId && shopMap.has(equippedId)) {
          const url = shopMap.get(equippedId)!;
          const urlPath = url.split('?')[0].toLowerCase();
          let type = 'static';
          if (urlPath.endsWith('.svga')) type = 'svga';
          else if (urlPath.endsWith('.json')) type = 'lottie';
          else if (urlPath.endsWith('.gif')) type = 'gif';
          else if (urlPath.endsWith('.webp')) type = 'webp';
          resolvedFrameUrlCache.set(userId, { url, type, timestamp: now });
        }
      });
    } catch (err) {
      console.error('[frameCache] Shop items fetch error:', err);
    }
  }

  // Resolve all remaining users
  const now = Date.now();
  ids.forEach(userId => {
    if (resolvedFrameUrlCache.has(userId) && isValid(resolvedFrameUrlCache.get(userId)!.timestamp)) return;
    
    const cached = userFrameInfoCache.get(userId);
    if (!cached) {
      resolvedFrameUrlCache.set(userId, { url: null, type: 'static', timestamp: now });
      return;
    }

    const { equipped_frame_id, frame_id } = cached.data;
    
    // Priority: equipped_frame_id > frame_id
    const checkId = equipped_frame_id || frame_id;
    if (checkId) {
      const frame = frameDataCache.get(checkId);
      if (frame) {
        resolvedFrameUrlCache.set(userId, { url: frame.frame_url, type: frame.frame_type || 'static', timestamp: now });
        return;
      }
    }
    
    resolvedFrameUrlCache.set(userId, { url: null, type: 'static', timestamp: now });
  });

  notify();
  batchResolvers.forEach(r => r());
  batchResolvers = [];
  batchPromise = null;
};

/**
 * Request frame data for a user. Batches multiple requests.
 * Returns immediately with cached data if available.
 */
export const requestUserFrame = (userId: string): Promise<void> => {
  const cached = resolvedFrameUrlCache.get(userId);
  if (cached && isValid(cached.timestamp)) {
    return Promise.resolve();
  }

  pendingUserIds.add(userId);
  
  if (!batchTimer) {
    batchPromise = new Promise<void>(resolve => {
      batchResolvers.push(resolve);
      batchTimer = setTimeout(executeBatch, BATCH_DELAY);
    });
  } else if (batchPromise) {
    return new Promise<void>(resolve => {
      batchResolvers.push(resolve);
    });
  }

  return batchPromise!;
};

/**
 * Get resolved frame URL and type for a user (sync, from cache)
 */
export const getUserFrameUrl = (userId: string): { url: string | null; type: string } | null => {
  const cached = resolvedFrameUrlCache.get(userId);
  if (cached && isValid(cached.timestamp)) return { url: cached.url, type: cached.type };
  return null;
};

/**
 * Get level-based frame (cached)
 */
export const getLevelFrame = async (level: number, isHost: boolean): Promise<FrameData | null> => {
  const key = `${isHost ? 'host' : 'user'}-${level}`;
  if (levelFrameCache.has(key)) return levelFrameCache.get(key) || null;

  const targetType = isHost ? 'host' : 'user';
  
  // Try exact type, then 'both', then any
  for (const tt of [targetType, 'both', undefined]) {
    let query = supabase
      .from('avatar_frames')
      .select('id, name, frame_url, frame_type, min_level')
      .eq('is_active', true)
      .lte('min_level', level)
      .order('min_level', { ascending: false })
      .limit(1);
    
    if (tt) query = query.eq('target_type', tt);
    
    const { data } = await query.maybeSingle();
    if (data?.frame_url?.startsWith('http')) {
      const urlPath = data.frame_url.split('?')[0].toLowerCase();
      let detectedType = data.frame_type || 'static';
      if (urlPath.endsWith('.svga')) detectedType = 'svga';
      else if (urlPath.endsWith('.json')) detectedType = 'lottie';
      else if (urlPath.endsWith('.gif')) detectedType = 'gif';
      else if (urlPath.endsWith('.webp')) detectedType = 'webp';
      
      const frame: FrameData = { ...data, frame_type: detectedType };
      levelFrameCache.set(key, frame);
      return frame;
    }
  }

  levelFrameCache.set(key, null);
  return null;
};

/**
 * Preload frames for multiple users at once (call on page load)
 */
export const preloadUserFrames = async (userIds: string[]) => {
  const uncached = userIds.filter(id => {
    const c = resolvedFrameUrlCache.get(id);
    return !c || !isValid(c.timestamp);
  });
  if (uncached.length === 0) return;
  
  uncached.forEach(id => pendingUserIds.add(id));
  
  // Execute immediately instead of waiting for batch delay
  if (batchTimer) clearTimeout(batchTimer);
  batchTimer = null;
  await executeBatch();
};
