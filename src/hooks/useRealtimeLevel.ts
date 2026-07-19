import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { clearUserFrameCache, clearFrameCache, clearLevelFrameCache } from "@/components/common/AvatarWithFrame";
import { resolveLevelFromTiers } from "@/utils/levelResolver";
import { useAppSyncEvent } from "@/hooks/useAppSyncEvent";

interface LevelData {
  user_level: number;
  host_level: number;
  max_user_level?: number;
  coins: number;
  total_earnings: number;
  total_consumption: number;
  total_recharged?: number;
  is_host: boolean;
  weekly_earnings: number;
  weekly_reset_at: string | null;
  gender: string | null;
}

// ============= LocalStorage Level Cache =============
const LEVEL_CACHE_KEY = 'meri_level_cache_v2';
const PRIVATE_LEVEL_SELECT = "user_level, host_level, previous_host_level, diamonds, total_earnings, total_consumption, total_recharged, is_host, weekly_earnings, weekly_reset_at, gender, max_user_level";
const PUBLIC_LEVEL_SELECT = "user_level, host_level, total_earnings, is_host, weekly_earnings, gender, max_user_level";

interface LevelCache {
  userId: string;
  level: number;
  levelData: LevelData;
  timestamp: number;
}

const getBestStoredDisplayLevel = (data: Partial<LevelData> | null | undefined): number | null => {
  if (!data) return null;
  const isFemaleHost = Boolean(data.is_host) && String(data.gender ?? "").toLowerCase() === "female";
  if (isFemaleHost) return Math.max(Number(data.host_level ?? 0), 0);
  return Math.max(
    Number(data.user_level ?? 0),
    Number(data.max_user_level ?? 0),
    1,
  );
};

const getCachedLevel = (userId: string): LevelCache | null => {
  try {
    const raw = localStorage.getItem(LEVEL_CACHE_KEY);
    if (!raw) return null;
    const cache: LevelCache = JSON.parse(raw);
    // Only use cache if it's for the same user and not older than 24 hours
    if (cache.userId === userId && Date.now() - cache.timestamp < 86400000) {
      return cache;
    }
    return null;
  } catch {
    return null;
  }
};

const setCachedLevel = (userId: string, level: number, levelData: LevelData) => {
  try {
    const cache: LevelCache = { userId, level, levelData, timestamp: Date.now() };
    localStorage.setItem(LEVEL_CACHE_KEY, JSON.stringify(cache));
  } catch {}
};

/**
 * Hook for real-time user level updates
 * Automatically subscribes to profile changes and updates level instantly
 * Uses localStorage cache to prevent level flashing to 0 on navigation
 */
export const useRealtimeLevel = (userId: string | null) => {
  // Initialize from cache to prevent level=0 flash
  const cached = userId ? getCachedLevel(userId) : null;
  const [level, setLevel] = useState<number | null>(cached?.level ?? null);
  const [levelData, setLevelData] = useState<LevelData | null>(cached?.levelData ?? null);
  const [loading, setLoading] = useState(Boolean(userId) && !cached);
  
  // Track previous level to detect level-up and trigger frame refresh
  const previousLevelRef = useRef<number | null>(cached?.level ?? null);
  
  // Reset synchronously on account changes so Android never flashes a fake Lv1.
  useEffect(() => {
    if (!userId) {
      setLevel(null);
      setLevelData(null);
      setLoading(false);
      previousLevelRef.current = null;
      return;
    }

    const nextCached = getCachedLevel(userId);
    setLevel(nextCached?.level ?? null);
    setLevelData(nextCached?.levelData ?? null);
    setLoading(!nextCached);
    previousLevelRef.current = nextCached?.level ?? null;
  }, [userId]);

  // Fetch initial level data
  const fetchLevel = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    // Fetch private profile first; for other users RLS can block this, so fall back to profiles_public.
    const profileRes = await supabase
      .from("profiles")
      .select(PRIVATE_LEVEL_SELECT)
      .eq("id", userId)
      .maybeSingle();

    let data = profileRes.data as any;

    if (!data) {
      const publicRes = await supabase
        .from("profiles_public")
        .select(PUBLIC_LEVEL_SELECT)
        .eq("id", userId)
        .maybeSingle();

      if (publicRes.data) {
        data = {
          ...publicRes.data,
          coins: 0,
          total_consumption: 0,
          total_recharged: 0,
          weekly_reset_at: null,
        };
      }
    }

    if (data) {
      const resolved = await resolveLevelFromTiers({
        id: userId,
        ...data,
      });

      const isFemaleHost = resolved.isFemaleHost;
      const storedDisplayLevel = getBestStoredDisplayLevel(data);
      const displayLevel = resolved.level ?? storedDisplayLevel;
      if (displayLevel === null) {
        setLoading(false);
        return;
      }
      
      // CRITICAL: Detect level change and clear frame cache for automatic frame upgrade
      if (previousLevelRef.current !== null && previousLevelRef.current !== displayLevel) {
        // Clear this user's frame cache so new level-based frame is fetched
        if (userId) {
          clearUserFrameCache(userId);
        }
        // Clear level-based cache entries
        clearLevelFrameCache(displayLevel, isFemaleHost);
      }
      previousLevelRef.current = displayLevel;
      
      const newLevelData: LevelData = {
        user_level: resolved.levelType === 'user' ? displayLevel : (data.user_level ?? 0),
        host_level: resolved.levelType === 'host' ? displayLevel : (data.host_level ?? 0),
        max_user_level: data.max_user_level ?? data.user_level ?? 1,
        coins: data.diamonds ?? 0,
        total_earnings: data.total_earnings ?? 0,
        total_consumption: data.total_consumption ?? 0,
        total_recharged: resolved.levelType === 'user' ? resolved.totalPoints : ((data as any).total_recharged ?? 0),
        is_host: data.is_host ?? false,
        weekly_earnings: resolved.levelType === 'host' ? resolved.currentXP : (data.weekly_earnings ?? 0),
        weekly_reset_at: data.weekly_reset_at ?? null,
        gender: data.gender ?? null,
      };
      
      setLevel(displayLevel);
      setLevelData(newLevelData);
      
      // Persist to localStorage for instant restore on navigation
      setCachedLevel(userId, displayLevel, newLevelData);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchLevel();
  }, [fetchLevel]);

  // Instant sync: profile/balance changes arrive through app_sync notifications;
  // profiles is intentionally NOT in supabase_realtime publication.
  useAppSyncEvent(['profiles'], () => {
    void fetchLevel();
  }, Boolean(userId));

  // Admin profile edits arrive through the singleton admin_broadcast channel.
  useEffect(() => {
    if (!userId) return;

    const onAdminUpdate = (event: Event) => {
      const table = (event as CustomEvent<{ table?: string }>).detail?.table;
      if (table === 'profiles') void fetchLevel();
    };

    window.addEventListener('admin-table-update', onAdminUpdate as EventListener);
    return () => window.removeEventListener('admin-table-update', onAdminUpdate as EventListener);
  }, [userId, fetchLevel]);

  // Transaction tables are not used as realtime fanout. Profile app_sync above
  // is emitted by the server after the transaction updates the user's balance.
  useEffect(() => {
    if (!userId) return;
    const onOwnBeans = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string }>).detail;
      if (!detail?.userId || detail.userId === userId) void fetchLevel();
    };
    window.addEventListener('own-beans-updated', onOwnBeans as EventListener);
    return () => window.removeEventListener('own-beans-updated', onOwnBeans as EventListener);
  }, [userId, fetchLevel]);

  return {
    level,
    levelData,
    loading,
    refetch: fetchLevel,
  };
};

/**
 * Hook for real-time level progress calculation
 * Returns level, progress percentage, and XP info
 * Auto-detects if user is host from profile data
 */
export const useRealtimeLevelProgress = (userId: string | null, forceHostMode: boolean = false) => {
  const { level, levelData, loading, refetch } = useRealtimeLevel(userId);
  const [tiers, setTiers] = useState<any[]>([]);
  const [progress, setProgress] = useState(0);
  const [currentXP, setCurrentXP] = useState(0);
  const [nextLevelXP, setNextLevelXP] = useState(0);
  const [nextLevelNumber, setNextLevelNumber] = useState(1);
  
  // CORRECT LOGIC: Only female hosts use host_level (resets weekly)
  // Everyone else (male hosts, regular users) use user_level (permanent)
  const isFemaleHost = levelData?.is_host && (levelData?.gender === 'female' || levelData?.gender === 'Female');
  const isHost = forceHostMode || isFemaleHost;

  // Fetch level tiers
  const fetchTiers = useCallback(async () => {
    const tierType = isHost ? "host" : "user";
    const { data } = await supabase
      .from("user_level_tiers")
      .select("level_number, level_name, min_topup_amount, min_earning_amount, level_icon")
      .eq("tier_type", tierType)
      .eq("is_active", true)
      .order("level_number", { ascending: true });

    if (data) {
      setTiers(data);
    }
  }, [isHost]);

  useEffect(() => {
    fetchTiers();
  }, [fetchTiers]);

  // Admin-driven tier changes arrive through Pkg37 admin_broadcast.
  useEffect(() => {
    const onAdminUpdate = (event: Event) => {
      const table = (event as CustomEvent<{ table?: string }>).detail?.table;
      if (table === 'user_level_tiers') void fetchTiers();
    };

    window.addEventListener('admin-table-update', onAdminUpdate as EventListener);
    return () => window.removeEventListener('admin-table-update', onAdminUpdate as EventListener);
  }, [fetchTiers]);

  // Calculate progress whenever level data or tiers change
  useEffect(() => {
    if (!levelData || tiers.length === 0 || level === null) return;

    // Hosts use weekly beans earnings only. Users/agencies use total top-up only.
    const xp = isHost 
      ? levelData.weekly_earnings
      : ((levelData as any).total_recharged ?? 0);
    setCurrentXP(xp);

    // Use the correct level based on user type - handle 0 properly
    const displayLevel = isHost ? Math.max(level, 0) : Math.max(level, 1);
    
    const currentTier = tiers.find((t) => t.level_number === displayLevel);
    const nextTier = tiers.find((t) => t.level_number === displayLevel + 1);

    if (currentTier && nextTier) {
      const currentMin = isHost ? currentTier.min_earning_amount : currentTier.min_topup_amount;
      const nextMin = isHost ? nextTier.min_earning_amount : nextTier.min_topup_amount;
      const range = nextMin - currentMin;
      const progressInRange = xp - currentMin;
      const progressPercent = range > 0 ? Math.min((progressInRange / range) * 100, 100) : 0;
      
      setProgress(Math.max(0, progressPercent));
      setNextLevelXP(nextMin);
      setNextLevelNumber(nextTier.level_number);
    } else if (!currentTier && nextTier) {
      // Level 0 case - show progress to level 1
      const nextMin = isHost ? nextTier.min_earning_amount : nextTier.min_topup_amount;
      const progressPercent = nextMin > 0 ? Math.min((xp / nextMin) * 100, 100) : 0;
      setProgress(Math.max(0, progressPercent));
      setNextLevelXP(nextMin);
      setNextLevelNumber(nextTier.level_number);
    } else if (currentTier) {
      // Max level reached
      setProgress(100);
      setNextLevelXP(isHost ? currentTier.min_earning_amount : currentTier.min_topup_amount);
      setNextLevelNumber(displayLevel + 1);
    }
  }, [levelData, tiers, isHost, level]);

  return {
    level,
    progress,
    currentXP,
    nextLevelXP,
    nextLevelNumber,
    loading,
    refetch,
    tiers,
    isHost,
    hostLevel: levelData?.host_level ?? null,
    userLevel: levelData?.user_level ?? null,
  };
};
