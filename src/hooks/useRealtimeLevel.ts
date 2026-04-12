import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { clearUserFrameCache, clearFrameCache, clearLevelFrameCache } from "@/components/common/AvatarWithFrame";

interface LevelData {
  user_level: number;
  host_level: number;
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
const LEVEL_CACHE_KEY = 'meri_level_cache';

interface LevelCache {
  userId: string;
  level: number;
  levelData: LevelData;
  timestamp: number;
}

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
  const [level, setLevel] = useState<number>(cached?.level ?? 1);
  const [levelData, setLevelData] = useState<LevelData | null>(cached?.levelData ?? null);
  const [loading, setLoading] = useState(!cached);
  
  // Track previous level to detect level-up and trigger frame refresh
  const previousLevelRef = useRef<number | null>(cached?.level ?? null);
  
  // Fetch initial level data
  const fetchLevel = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    // Fetch profile data
    const profileRes = await supabase
      .from("profiles")
      .select("user_level, host_level, previous_host_level, coins, total_earnings, total_consumption, total_recharged, is_host, weekly_earnings, weekly_reset_at, gender, max_user_level")
      .eq("id", userId)
      .maybeSingle();

    const data = profileRes.data;

    if (data) {
      const isFemaleHost = data.is_host && (data.gender === 'female' || data.gender === 'Female');
      
      // CRITICAL: For regular users, ALWAYS use stored user_level from DB
      // The DB trigger (recalculate_single_user_level) already enforces NEVER DROP
      // DO NOT recalculate on frontend - trust the database value
      const storedLevel = data.user_level ?? 1;
      const maxLevel = (data as any).max_user_level ?? storedLevel;
      
      let displayLevel: number;
      
      if (isFemaleHost) {
        // Female hosts: fetch host tiers and calculate from weekly_earnings
        const { data: hostTiers } = await supabase
          .from("user_level_tiers")
          .select("level_number, min_earning_amount")
          .eq("tier_type", "host")
          .eq("is_active", true)
          .order("level_number", { ascending: true });
        
        let calculatedLevel = 0;
        const weeklyEarnings = data.weekly_earnings ?? 0;
        if (hostTiers && hostTiers.length > 0) {
          for (const tier of hostTiers) {
            if (weeklyEarnings >= tier.min_earning_amount) {
              calculatedLevel = tier.level_number;
            }
          }
        }
        // Hosts: current week level comes ONLY from weekly beans earnings.
        // After weekly transfer/reset, current level becomes 0 while previous_host_level stays visible elsewhere.
        displayLevel = Math.max(calculatedLevel, 0);
      } else {
        // Users / agencies: level comes ONLY from top-up history tracked in total_recharged.
        // Never derive from gifts, calls, or total consumption.
        displayLevel = Math.max(storedLevel, maxLevel, 1);
      }
      
      console.log('[useRealtimeLevel] Level:', displayLevel, 'stored:', storedLevel, 'max:', maxLevel);
      
      // CRITICAL: Detect level change and clear frame cache for automatic frame upgrade
      if (previousLevelRef.current !== null && previousLevelRef.current !== displayLevel) {
        console.log('[useRealtimeLevel] 🎉 LEVEL CHANGED! Previous:', previousLevelRef.current, '-> New:', displayLevel);
        console.log('[useRealtimeLevel] 🖼️ Clearing frame cache to trigger automatic frame upgrade...');
        
        // Clear this user's frame cache so new level-based frame is fetched
        if (userId) {
          clearUserFrameCache(userId);
        }
        // Clear level-based cache entries
        clearLevelFrameCache(displayLevel, isFemaleHost);
      }
      previousLevelRef.current = displayLevel;
      
      const newLevelData: LevelData = {
        user_level: data.user_level ?? 0,
        host_level: displayLevel,
        coins: data.coins ?? 0,
        total_earnings: data.total_earnings ?? 0,
        total_consumption: data.total_consumption ?? 0,
        total_recharged: (data as any).total_recharged ?? 0,
        is_host: data.is_host ?? false,
        weekly_earnings: data.weekly_earnings ?? 0,
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
    
    // PERFORMANCE: Reduced from 1s to 60s - realtime subscription handles instant updates
    const refreshInterval = setInterval(() => {
      fetchLevel();
    }, 60000);
    
    return () => {
      clearInterval(refreshInterval);
    };
  }, [fetchLevel]);

  // Set up real-time subscription for level changes
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`level-updates-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${userId}`,
        },
        async (payload) => {
          const newData = payload.new as any;
          if (newData) {
            const isFemaleHost = newData.is_host && (newData.gender === 'female' || newData.gender === 'Female');
            const storedLevel = newData.user_level ?? 1;
            const maxLevel = newData.max_user_level ?? storedLevel;
            const previousLevel = previousLevelRef.current ?? 1;
            
            let displayLevel: number;
            
            if (isFemaleHost) {
              const { data: tiers } = await supabase
                .from("user_level_tiers")
                .select("level_number, min_earning_amount")
                .eq("tier_type", "host")
                .eq("is_active", true)
                .order("level_number", { ascending: true });
              
              let calculatedLevel = 0;
              const weeklyEarnings = newData.weekly_earnings ?? 0;
              if (tiers && tiers.length > 0) {
                for (const tier of tiers) {
                  if (weeklyEarnings >= tier.min_earning_amount) {
                    calculatedLevel = tier.level_number;
                  }
                }
              }
              displayLevel = Math.max(calculatedLevel, 0);
            } else {
              // Regular users / agencies: trust DB top-up-based level only
              displayLevel = Math.max(storedLevel, maxLevel, previousLevel, 1);
            }
            
            console.log('[useRealtimeLevel] Realtime level:', displayLevel, 'prev:', previousLevel);
            
            // CRITICAL: Detect level change via realtime and clear frame cache
            if (previousLevelRef.current !== null && previousLevelRef.current !== displayLevel) {
              console.log('[useRealtimeLevel] 🎉 REALTIME LEVEL CHANGED! Previous:', previousLevelRef.current, '-> New:', displayLevel);
              console.log('[useRealtimeLevel] 🖼️ Clearing frame cache for automatic frame upgrade...');
              
              if (userId) {
                clearUserFrameCache(userId);
              }
              // Clear level-based cache entries
              clearLevelFrameCache(displayLevel, isFemaleHost);
            }
            previousLevelRef.current = displayLevel;
            
            setLevel(displayLevel);
            const newLevelData: LevelData = {
              user_level: newData.user_level ?? 0,
              host_level: displayLevel,
              coins: newData.coins ?? 0,
              total_earnings: newData.total_earnings ?? 0,
              total_consumption: newData.total_consumption ?? 0,
              total_recharged: newData.total_recharged ?? 0,
              is_host: newData.is_host ?? false,
              weekly_earnings: newData.weekly_earnings ?? 0,
              weekly_reset_at: newData.weekly_reset_at ?? null,
              gender: newData.gender ?? null,
            };
            setLevelData(newLevelData);
            
            // Persist to localStorage for instant restore on navigation
            if (userId) {
              setCachedLevel(userId, displayLevel, newLevelData);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // Also listen for gift transactions that might affect level
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`gift-level-updates-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "gift_transactions",
        },
        (payload) => {
          const transaction = payload.new as any;
          // Refetch if this user is sender or receiver
          if (transaction.sender_id === userId || transaction.receiver_id === userId) {
            fetchLevel();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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

  // Real-time subscription for level tier changes
  useEffect(() => {
    const channel = supabase
      .channel('user-level-tiers-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_level_tiers',
        },
        (payload) => {
          console.log('[useRealtimeLevel] Level tiers updated:', payload.eventType);
          fetchTiers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchTiers]);

  // Calculate progress whenever level data or tiers change
  useEffect(() => {
    if (!levelData || tiers.length === 0) return;

    // Hosts use weekly beans earnings only. Users/agencies use total top-up only.
    const xp = isHost 
      ? levelData.weekly_earnings
      : ((levelData as any).total_recharged ?? 0);
    setCurrentXP(xp);

    // Use the correct level based on user type - handle 0 properly
    const displayLevel = isHost 
      ? (levelData.host_level ?? 0)  // Can be 0 after reset
      : (levelData.user_level ?? 1);
    
    console.log('[useRealtimeLevelProgress] Progress calc - isHost:', isHost, 'displayLevel:', displayLevel, 'xp:', xp);
    
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
    } else if (!currentTier && nextTier) {
      // Level 0 case - show progress to level 1
      const nextMin = isHost ? nextTier.min_earning_amount : nextTier.min_topup_amount;
      const progressPercent = nextMin > 0 ? Math.min((xp / nextMin) * 100, 100) : 0;
      setProgress(Math.max(0, progressPercent));
      setNextLevelXP(nextMin);
    } else if (currentTier) {
      // Max level reached
      setProgress(100);
      setNextLevelXP(isHost ? currentTier.min_earning_amount : currentTier.min_topup_amount);
    }
  }, [levelData, tiers, isHost]);

  return {
    level,
    progress,
    currentXP,
    nextLevelXP,
    loading,
    refetch,
    tiers,
    isHost,
    hostLevel: levelData?.host_level ?? 0,
    userLevel: levelData?.user_level ?? 1,
  };
};
