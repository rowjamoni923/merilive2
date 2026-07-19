import { useState, useEffect } from "react";
import { PageSkeleton } from "@/components/common/PageSkeleton";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronRight, Crown, Diamond, Sparkles, Star, Gift, Car, Headphones, Image, TrendingUp, Coins } from "lucide-react";
import { Skeleton as SkeletonPrim } from "@/components/Skeleton";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { fetchActiveLevelTiers, isFemaleHostProfile, resolveLevelFromTiers } from "@/utils/levelResolver";
import PrivilegePreviewModal from "@/components/level/PrivilegePreviewModal";
import PrivilegeTierSheet from "@/components/level/PrivilegeTierSheet";
import { motion, AnimatePresence } from "framer-motion";
import { recordClientError } from "@/utils/clientErrorLog";
import { usePersistedCache } from "@/hooks/usePersistedCache";

interface LevelData {
  level: number;
  minDiamonds: number;
  icon: string;
  color: string;
  bgGradient: string;
}

// Level data for regular users (based on top-up/consumption)
const userLevelData: LevelData[] = [
  { level: 0, minDiamonds: 0, icon: "🤍", color: "bg-gray-400", bgGradient: "from-gray-300 to-gray-400" },
  { level: 1, minDiamonds: 10000, icon: "💎", color: "bg-blue-400", bgGradient: "from-blue-400 to-blue-500" },
  { level: 2, minDiamonds: 30000, icon: "💎", color: "bg-blue-500", bgGradient: "from-blue-500 to-blue-600" },
  { level: 3, minDiamonds: 100000, icon: "💎", color: "bg-blue-600", bgGradient: "from-blue-600 to-indigo-500" },
  { level: 4, minDiamonds: 300000, icon: "💎", color: "bg-blue-700", bgGradient: "from-indigo-500 to-indigo-600" },
  { level: 5, minDiamonds: 1000000, icon: "💎", color: "bg-indigo-500", bgGradient: "from-indigo-600 to-purple-500" },
  { level: 6, minDiamonds: 3000000, icon: "⭐", color: "bg-purple-500", bgGradient: "from-purple-500 to-purple-600" },
  { level: 7, minDiamonds: 10000000, icon: "⭐", color: "bg-purple-600", bgGradient: "from-purple-600 to-pink-500" },
  { level: 8, minDiamonds: 30000000, icon: "⭐", color: "bg-purple-700", bgGradient: "from-pink-500 to-rose-500" },
  { level: 9, minDiamonds: 100000000, icon: "👑", color: "bg-amber-500", bgGradient: "from-amber-400 to-amber-500" },
  { level: 10, minDiamonds: 300000000, icon: "👑", color: "bg-amber-600", bgGradient: "from-amber-500 to-orange-500" },
  { level: 20, minDiamonds: 1000000000, icon: "👑", color: "bg-orange-500", bgGradient: "from-orange-500 to-red-500" },
  { level: 30, minDiamonds: 3000000000, icon: "👑", color: "bg-orange-600", bgGradient: "from-red-500 to-rose-600" },
  { level: 40, minDiamonds: 10000000000, icon: "👑", color: "bg-red-500", bgGradient: "from-rose-600 to-red-700" },
  { level: 50, minDiamonds: 30000000000, icon: "🏆", color: "bg-red-600", bgGradient: "from-red-700 to-red-800" },
];

// Level data for female hosts (based on earnings)
const hostLevelData: LevelData[] = [
  { level: 0, minDiamonds: 0, icon: "🌸", color: "bg-pink-300", bgGradient: "from-pink-200 to-pink-300" },
  { level: 1, minDiamonds: 5000, icon: "🌷", color: "bg-pink-400", bgGradient: "from-pink-400 to-rose-400" },
  { level: 2, minDiamonds: 15000, icon: "🌺", color: "bg-pink-500", bgGradient: "from-rose-400 to-pink-500" },
  { level: 3, minDiamonds: 50000, icon: "🌹", color: "bg-rose-500", bgGradient: "from-pink-500 to-rose-500" },
  { level: 4, minDiamonds: 150000, icon: "💐", color: "bg-rose-600", bgGradient: "from-rose-500 to-rose-600" },
  { level: 5, minDiamonds: 500000, icon: "💎", color: "bg-purple-500", bgGradient: "from-rose-600 to-purple-500" },
  { level: 6, minDiamonds: 1500000, icon: "💜", color: "bg-purple-600", bgGradient: "from-purple-500 to-purple-600" },
  { level: 7, minDiamonds: 5000000, icon: "👑", color: "bg-purple-700", bgGradient: "from-purple-600 to-violet-600" },
  { level: 8, minDiamonds: 15000000, icon: "👑", color: "bg-violet-600", bgGradient: "from-violet-600 to-indigo-600" },
  { level: 9, minDiamonds: 50000000, icon: "👸", color: "bg-amber-500", bgGradient: "from-amber-400 to-amber-500" },
  { level: 10, minDiamonds: 150000000, icon: "👸", color: "bg-amber-600", bgGradient: "from-amber-500 to-orange-500" },
];

interface LevelPrivilege {
  id: string;
  privilege_type: string;
  name: string;
  description: string;
  unlock_level: number;
  animation_url: string | null;
  preview_url: string | null;
  icon_name: string;
  icon_bg_color: string;
  icon_color: string;
  icon_url: string | null;
}

interface LevelAnimation {
  id: string;
  level: number;
  animation_url: string | null;
  animation_type: string;
  preview_url: string | null;
  duration_ms: number;
  is_active: boolean;
  icon_url: string | null;
  display_name: string | null;
}

interface LevelTierIcon {
  level_number: number;
  icon_url: string | null;
  animation_url: string | null;
  tier_type: string;
}

interface UserProfile {
  id: string;
  gender: string | null;
  is_host: boolean | null;
  total_consumption: number | null;
  total_earnings: number | null;
  total_recharged: number | null;
  diamonds: number | null;
  user_level: number | null;
  host_level?: number | null;
  max_user_level?: number | null;
  weekly_earnings?: number | null;
}


const iconMap: Record<string, React.ElementType> = {
  Sparkles, Crown, Star, Gift, Car, Image, Headphones
};

const Level = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [currentLevel, setCurrentLevel] = useState(0);
  const [currentDiamonds, setCurrentDiamonds] = useState(0);
  const [selectedLevelTab, setSelectedLevelTab] = useState(1);
  const [privCache, setPrivCache, hadPrivCache] = usePersistedCache<LevelPrivilege[]>("level:privileges", []);
  const [animCache, setAnimCache, hadAnimCache] = usePersistedCache<LevelAnimation[]>("level:animations", []);
  const privileges = privCache ?? [];
  const levelAnimations = animCache ?? [];
  const setPrivileges = (next: LevelPrivilege[]) => setPrivCache(next);
  const setLevelAnimations = (next: LevelAnimation[]) => setAnimCache(next);
  const [loading, setLoading] = useState(!(hadPrivCache && hadAnimCache));
  
  const [selectedPrivilege, setSelectedPrivilege] = useState<LevelPrivilege | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [tierSheetCategory, setTierSheetCategory] = useState<LevelPrivilege | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [levelType, setLevelType] = useState<'user' | 'host'>('user');
  const [levelTierIcons, setLevelTierIcons] = useState<LevelTierIcon[]>([]);
  const [activeLevelData, setActiveLevelData] = useState<LevelData[]>(userLevelData);

  useEffect(() => {
    fetchUserLevel();
    fetchPrivileges();
    fetchLevelAnimations();
    fetchLevelTierIcons();
    
    // Use universal realtime system instead of polling + manual channels
    const setupRealtime = async () => {
      const { subscribeToTables } = await import('@/hooks/useUniversalRealtime');
      const subscriberId = `level-page-${Date.now()}`;
      
      return subscribeToTables(
        subscriberId,
        ['profiles', 'gift_transactions', 'diamond_transactions', 'payment_transactions', 'level_animations', 'user_level_tiers', 'level_privileges'],
        (table) => {
          if (table === 'profiles' || table === 'gift_transactions' || table === 'diamond_transactions' || table === 'payment_transactions') {
            fetchUserLevel();
          } else if (table === 'level_animations') {
            fetchLevelAnimations();
          } else if (table === 'user_level_tiers') {
            fetchLevelTierIcons();
          } else if (table === 'level_privileges') {
            fetchPrivileges();
          }
        }
      );
    };
    
    let unsubscribe: (() => void) | undefined;
    setupRealtime().then(unsub => { unsubscribe = unsub; });
    
    return () => {
      unsubscribe?.();
    };
  }, []);

  // No manual level type switching - auto-determined based on user profile

  const fetchPrivileges = async () => {
    const { data } = await supabase
      .from('level_privileges')
      .select('*')
      .eq('is_active', true)
      .order('display_order');
    if (data) setPrivileges(data);
  };

  const fetchLevelAnimations = async () => {
    const { data } = await supabase
      .from('level_animations')
      .select('*')
      .eq('is_active', true)
      .order('level');
    if (data) setLevelAnimations(data as LevelAnimation[]);
  };

  const fetchLevelTierIcons = async () => {
    const { data } = await supabase
      .from('user_level_tiers')
      .select('level_number, icon_url, animation_url, tier_type')
      .eq('is_active', true)
      .order('level_number');
    if (data) setLevelTierIcons(data as LevelTierIcon[]);
  };

  // Helper to check if a string is a valid image URL (not a lottie: or other prefix)
  const isValidImageUrl = (url: string | null | undefined): boolean => {
    if (!url) return false;
    return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/');
  };

  // Get custom icon for current level from database
  // Priority: 1) user_level_tiers icon_url  2) level_animations icon_url  3) null
  const getCustomLevelIcon = (level: number): string | null => {
    // First check user_level_tiers (admin uploaded icons)
    const tierIcon = levelTierIcons.find(t => t.level_number === level && t.tier_type === levelType);
    if (isValidImageUrl(tierIcon?.icon_url)) return tierIcon!.icon_url!;
    if (isValidImageUrl(tierIcon?.animation_url)) return tierIcon!.animation_url!;

    // Fallback: find closest lower level tier icon
    const lowerTierIcons = levelTierIcons
      .filter(t => t.level_number <= level && t.tier_type === levelType && (isValidImageUrl(t.icon_url) || isValidImageUrl(t.animation_url)))
      .sort((a, b) => b.level_number - a.level_number);
    if (lowerTierIcons.length > 0) {
      const best = lowerTierIcons[0];
      return isValidImageUrl(best.icon_url) ? best.icon_url : best.animation_url;
    }

    // Fallback to level_animations table
    let animation = levelAnimations.find(a => a.level === level);
    if (!animation) {
      const lowerLevelAnimations = levelAnimations
        .filter(a => a.level <= level && isValidImageUrl(a.icon_url))
        .sort((a, b) => b.level - a.level);
      animation = lowerLevelAnimations[0];
    }
    return isValidImageUrl(animation?.icon_url) ? animation!.icon_url : null;
  };

  // Paginated sum to bypass Supabase 1000-row limit
  const resolveEffectiveUserRechargeTotal = async (userId: string, profileTotalRecharged: number) => {
    try {
      let totalCoin = 0;
      let totalPayment = 0;
      const PAGE_SIZE = 1000;

      // Sum diamond_transactions with pagination
      let page = 0;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase
          .from('diamond_transactions')
          .select('diamonds_amount')
          .eq('user_id', userId)
          .eq('status', 'completed')
          .in('transaction_type', ['recharge', 'self_recharge'])
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        if (error) throw error;
        if (!data || data.length === 0) { hasMore = false; break; }
        totalCoin += data.reduce((s, tx) => s + Number(tx.diamonds_amount ?? 0), 0);
        if (data.length < PAGE_SIZE) hasMore = false;
        page++;
      }

      // Sum payment_transactions with pagination
      page = 0;
      hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase
          .from('payment_transactions')
          .select('diamonds_amount')
          .eq('user_id', userId)
          .eq('status', 'completed')
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        if (error) throw error;
        if (!data || data.length === 0) { hasMore = false; break; }
        totalPayment += data.reduce((s, tx) => s + Number(tx.diamonds_amount ?? 0), 0);
        if (data.length < PAGE_SIZE) hasMore = false;
        page++;
      }

      return Math.max(profileTotalRecharged, totalCoin, totalPayment);
    } catch (error) {
      console.warn('[Level] Failed to resolve effective recharge total:', error);
      return profileTotalRecharged;
    }
  };

  // Paginated sum for host earnings
  const resolveEffectiveHostEarnings = async (userId: string, profileTotalEarnings: number) => {
    try {
      let totalGiftEarnings = 0;
      const PAGE_SIZE = 1000;
      let page = 0;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase
          .from('gift_transactions')
          .select('receiver_beans')
          .eq('receiver_id', userId)
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        if (error) throw error;
        if (!data || data.length === 0) { hasMore = false; break; }
        totalGiftEarnings += data.reduce((s, tx) => s + Number((tx as { receiver_beans?: number | null }).receiver_beans ?? 0), 0);
        if (data.length < PAGE_SIZE) hasMore = false;
        page++;
      }
      return Math.max(profileTotalEarnings, totalGiftEarnings);
    } catch (error) {
      console.warn('[Level] Failed to resolve effective host earnings:', error);
      return profileTotalEarnings;
    }
  };

  const fetchUserLevel = async () => {
    try {
      const { getCachedUser } = await import('@/utils/cachedAuth');
      const user = await getCachedUser();
      if (!user) return;
      setUser(user);

      const { data: profile } = await supabase
        .from('profiles')
        .select('id, gender, is_host, total_consumption, total_earnings, total_recharged, diamonds, user_level, host_level, max_user_level, weekly_earnings')
        .eq('id', user.id)
        .single();

      if (!profile) return;

      setUserProfile(profile as UserProfile);

      const isFemaleHost = isFemaleHostProfile(profile);
      const type = isFemaleHost ? 'host' : 'user';
      setLevelType(type);

      const tiers = await fetchActiveLevelTiers(type);

      const fallbackVisuals = isFemaleHost ? hostLevelData : userLevelData;
      const mappedTiers: LevelData[] = (tiers && tiers.length > 0 ? tiers : []).map((tier) => {
        const visual = fallbackVisuals.find((item) => item.level === tier.level_number)
          || [...fallbackVisuals].reverse().find((item) => item.level <= tier.level_number)
          || fallbackVisuals[0];

        return {
          level: tier.level_number,
          minDiamonds: Number(isFemaleHost ? (tier.min_earning_amount ?? 0) : (tier.min_topup_amount ?? 0)),
          icon: visual?.icon || '💎',
          color: visual?.color || 'bg-gray-400',
          bgGradient: visual?.bgGradient || 'from-gray-300 to-gray-400',
        };
      });

      const sourceTiers = mappedTiers.length > 0 ? mappedTiers : (isFemaleHost ? hostLevelData : userLevelData);
      setActiveLevelData(sourceTiers);

      const resolved = await resolveLevelFromTiers(profile, tiers);
      setCurrentDiamonds(resolved.totalPoints);
      setCurrentLevel(resolved.level);
      setSelectedLevelTab(resolved.levelType === 'host' ? resolved.level : Math.max(resolved.level, 1));
    } catch (error) {
      console.error('Error fetching user level:', error);
      recordClientError({ label: "Level.resolved", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setLoading(false);
    }
  };

  const getCurrentLevelData = () => {
    return activeLevelData.find(l => l.level === currentLevel) || activeLevelData[0];
  };

  const getNextLevelData = () => {
    // Find the next level that is HIGHER than current level
    const nextLevel = activeLevelData.find(l => l.level > currentLevel);
    // If no higher level exists (max level reached), return current + 1 as virtual next
    if (!nextLevel) {
      const maxLevel = activeLevelData[activeLevelData.length - 1];
      return { ...maxLevel, level: currentLevel + 1, minDiamonds: maxLevel.minDiamonds * 2 };
    }
    return nextLevel;
  };

  const getProgress = () => {
    const current = getCurrentLevelData();
    const next = getNextLevelData();
    if (current.level === next.level) return 100;
    const progress = ((currentDiamonds - current.minDiamonds) / (next.minDiamonds - current.minDiamonds)) * 100;
    return Math.min(Math.max(progress, 0), 100);
  };

  const diamondsToNextLevel = () => {
    const next = getNextLevelData();
    return Math.max(next.minDiamonds - currentDiamonds, 0);
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000000) return `${(num / 1000000000).toFixed(1)}B`;
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toLocaleString();
  };

  const levelTabs = activeLevelData.map((item) => item.level);

  if (loading) {
    return <PageSkeleton className="mobile-page flex flex-col" rows={5} hero />;
  }

  return (
    <div className="fixed inset-0 flex flex-col profile-home-shell overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0">
        <header className="relative safe-area-top">
          <div className="flex items-center gap-3 px-4 py-3">
            <button
              onClick={() => navigate(-1)}
              className="h-9 w-9 rounded-full bg-white flex items-center justify-center transition-all hover:-translate-y-0.5 active:translate-y-0"
              style={{ boxShadow: '0 4px 12px -4px rgba(146,64,14,0.25), inset 0 1px 0 rgba(255,255,255,0.95), 0 0 0 1px rgba(217,182,107,0.45)' }}
            >
              <ArrowLeft className="w-5 h-5 text-slate-700" />
            </button>
            <h1
              className="text-lg font-bold text-slate-800 tracking-tight"
              style={{ textShadow: '0 1px 0 rgba(255,255,255,0.7)' }}
            >
              My Level
            </h1>
          </div>

        </header>

        {/* Level Card - Premium Design */}
        <div className="relative px-4 pb-6">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "rounded-3xl p-6 shadow-xl overflow-hidden relative ring-1 ring-white/10",
              levelType === 'host' 
                ? "bg-gradient-to-br from-[#3a0f2e] via-[#5b1452] to-[#2a0a3a]" 
                : "bg-gradient-to-br from-[#0f1d3a] via-[#241452] to-[#0a1430]"
            )}
          >
            {/* Subtle sheen */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-white/[0.06] pointer-events-none" />

            {/* Animated Background */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <motion.div 
                animate={{ 
                  x: [0, 50, 0],
                  y: [0, 30, 0],
                  scale: [1, 1.2, 1]
                }}
                transition={{ repeat: Infinity, duration: 8, ease: "easeInOut" }}
                className={cn(
                  "absolute w-64 h-64 rounded-full blur-3xl opacity-30",
                  levelType === 'host' ? "bg-fuchsia-500" : "bg-indigo-500"
                )}
                style={{ top: '-50%', right: '-20%' }}
              />
            </div>
            
            <div className="relative flex items-start justify-between">
              <div className="flex-1">
                {/* Level Type Badge - Auto-determined */}
                <div className="mb-3">
                  <span className={cn(
                    "px-3 py-1 rounded-full text-xs font-semibold backdrop-blur-sm",
                    levelType === 'host' 
                      ? "bg-fuchsia-500/25 text-white border border-fuchsia-300/30" 
                      : "bg-indigo-500/25 text-white border border-indigo-300/30"
                  )}>
                    {levelType === 'host' ? '👸 Host Level' : '💎 User Level'}
                  </span>
                </div>
                {/* Level Display */}
                <div className="flex items-baseline gap-2 mb-4">
                  <span className="text-lg text-white/70 font-medium">Level</span>
                  <motion.span 
                    key={currentLevel}
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="text-6xl font-black bg-gradient-to-br from-amber-300 via-orange-400 to-rose-400 bg-clip-text text-transparent drop-shadow-[0_2px_8px_rgba(251,146,60,0.35)]"
                  >
                    {currentLevel}
                  </motion.span>
                </div>
                
                {/* Progress Section */}
                <div className="mb-3">
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-white/85 font-medium flex items-center gap-1.5">
                      <span className={cn(
                        "px-2 py-0.5 rounded-full text-xs font-semibold text-white",
                        levelType === 'host' ? "bg-fuchsia-500/40 border border-fuchsia-300/30" : "bg-indigo-500/40 border border-indigo-300/30"
                      )}>
                        Lv{currentLevel}
                      </span>
                      <Diamond className="w-3.5 h-3.5 text-amber-300" />
                      <span className="text-amber-200 font-semibold">{formatNumber(currentDiamonds)}</span>
                    </span>
                    <span className="text-white/65 text-xs font-medium">Lv{getNextLevelData().level}</span>
                  </div>
                  <div className="relative">
                    <Progress 
                      value={getProgress()} 
                      className="h-3 rounded-full bg-white/10"
                    />
                    <motion.div
                      className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent rounded-full pointer-events-none"
                      animate={{ x: ['-100%', '100%'] }}
                      transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                    />
                  </div>
                </div>
                
                {/* Next Level Info */}
                <p className={cn(
                  "text-sm font-medium",
                  levelType === 'host' ? "text-fuchsia-200" : "text-indigo-200"
                )}>
                  {levelType === 'host' 
                    ? `Earn ${formatNumber(diamondsToNextLevel())} more to level up` 
                    : `Top up ${formatNumber(diamondsToNextLevel())} diamonds to level up`
                  }
                </p>
              </div>
              <motion.div 
                className="w-28 h-28 relative"
                animate={{ 
                  rotate: [0, 5, -5, 0],
                  scale: [1, 1.05, 1]
                }}
                transition={{ repeat: Infinity, duration: 4 }}
              >
                <div className={cn(
                  "absolute inset-0 rounded-full blur-2xl opacity-50",
                  `bg-gradient-to-br ${getCurrentLevelData().bgGradient}`
                )} />
                <div className="relative w-full h-full flex items-center justify-center">
                  {getCustomLevelIcon(currentLevel) ? (
                    <img loading="lazy" decoding="async" 
                      src={getCustomLevelIcon(currentLevel)!} 
                      alt={`Level ${currentLevel}`}
                      className="w-24 h-24 object-contain drop-shadow-2xl" />
                  ) : (
                    <span className="text-7xl drop-shadow-2xl">{getCurrentLevelData().icon}</span>
                  )}
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Scrollable Level Privileges Section */}
      <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'var(--content-bottom-padding)' }}>
      <div className="px-4 pb-6">
        <h2 className="text-xl font-bold text-slate-800 mb-4">Level Privileges</h2>
        
        {/* Level Tabs */}
        <ScrollArea className="w-full mb-4">
          <div className="flex gap-2 pb-2">
            {levelTabs.map((level) => (
              <motion.button
                key={level}
                whileTap={{ scale: 0.95 }}
                onClick={() => setSelectedLevelTab(level)}
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all",
                  selectedLevelTab === level
                    ? levelType === 'host'
                      ? "bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-lg shadow-pink-500/30"
                      : "bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg shadow-blue-500/30"
                    : "profile-home-pill text-slate-600 hover:bg-amber-50"
                )}
              >
                Lv{level}
              </motion.button>
            ))}
          </div>
          <ScrollBar orientation="horizontal" className="bg-amber-100" />
        </ScrollArea>

        {/* Privilege Items - Filtered by selected level tab */}
        <div className="space-y-3">
          {privileges.filter(p => p.unlock_level <= selectedLevelTab).map((privilege, index) => {
            const IconComponent = iconMap[privilege.icon_name] || Star;
            const isUnlocked = privilege.unlock_level <= currentLevel;
            return (
              <motion.button
                key={privilege.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                onClick={() => {
                  setTierSheetCategory(privilege);
                }}
                className={cn(
                  "w-full flex items-center gap-4 p-4 rounded-2xl transition-all",
                  isUnlocked 
                    ? "profile-home-section hover:bg-amber-50/40" 
                    : "profile-home-section opacity-60"
                )}
              >
                <div 
                  className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg overflow-hidden"
                  style={{ 
                    backgroundColor: privilege.icon_url ? 'transparent' : privilege.icon_bg_color,
                    boxShadow: isUnlocked ? `0 4px 15px ${privilege.icon_bg_color}50` : 'none'
                  }}
                >
                  {privilege.icon_url ? (
                    <img src={privilege.icon_url} alt={privilege.name} className="w-full h-full object-contain" loading="lazy" />
                  ) : (
                    <IconComponent className="w-7 h-7" style={{ color: privilege.icon_color }} />
                  )}
                </div>
                <div className="flex-1 text-left">
                  <h3 className="font-semibold text-slate-800">{privilege.name}</h3>
                  <p className="text-sm text-slate-600">{privilege.description}</p>
                </div>
                {!isUnlocked && (
                  <span className="text-xs text-slate-600 px-2 py-1 rounded-full bg-amber-100/80 border border-amber-200/60">
                    Lv{privilege.unlock_level}
                  </span>
                )}
                <ChevronRight className="w-5 h-5 text-slate-600" />
              </motion.button>
            );
          })}
        </div>

        {/* Privilege Preview Modal */}
        <PrivilegePreviewModal
          privilege={selectedPrivilege}
          currentLevel={currentLevel}
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          userId={user?.id}
        />

        {/* Per-category Tier Sheet (Lv 0–100 ladder) */}
        {tierSheetCategory && (
          <PrivilegeTierSheet
            open={!!tierSheetCategory}
            onOpenChange={(open) => { if (!open) setTierSheetCategory(null); }}
            categoryType={tierSheetCategory.privilege_type}
            categoryName={tierSheetCategory.name}
            categoryDescription={tierSheetCategory.description}
            currentLevel={currentLevel}
          />
        )}
      </div>



      {/* Level Rules Section */}
      <div className="px-4 pb-32">
        <h2 className="text-xl font-bold text-slate-800 mb-4">Level Rule</h2>
        
        <div className="profile-home-section rounded-2xl p-4">
            <p className="text-sm text-slate-600 mb-4">
              {levelType === 'host' 
                ? 'Host level is determined from your current weekly beans earnings using the live admin tier rules.'
                : 'User level is determined from your lifetime total top-up using the live admin tier rules.'
              }
            </p>
            
            <div className="rounded-xl overflow-hidden border border-white/10">
              <div className="grid grid-cols-2 bg-white/5">
                <div className="p-3 font-semibold text-slate-600 text-center border-r border-white/10">Level</div>
                <div className="p-3 font-semibold text-slate-600 text-center">
                  {levelType === 'host' ? 'Weekly Earnings' : 'Total Top-up'}
                </div>
              </div>
            
            {activeLevelData.slice(0, 11).map((level) => (
              <div 
                key={level.level} 
                className={cn(
                  "grid grid-cols-2 border-t border-white/10",
                  currentLevel === level.level && (levelType === 'host' ? "bg-pink-500/20" : "bg-blue-500/20")
                )}
              >
                <div className="p-3 flex items-center justify-center border-r border-white/10">
                  <span className={cn(
                    "px-3 py-1 rounded-full text-sm font-medium text-white",
                    `bg-gradient-to-r ${level.bgGradient}`
                  )}>
                    {level.icon} Lv{level.level}
                  </span>
                </div>
                <div className="p-3 text-center text-slate-500 font-medium">
                  {formatNumber(level.minDiamonds)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Action */}
      <div className="fixed bottom-0 left-0 right-0 p-4 safe-area-bottom bg-white/95 backdrop-blur-xl border-t border-white/10">
        <motion.div whileTap={{ scale: 0.98 }}>
          <Button
            onClick={() => navigate(levelType === 'host' ? '/host-dashboard' : '/recharge')}
            className="w-full h-14 rounded-2xl text-lg font-bold text-white shadow-2xl"
            style={{
              background: levelType === 'host' 
                ? 'linear-gradient(135deg, #ec4899 0%, #a855f7 100%)'
                : 'linear-gradient(135deg, #f97316 0%, #ec4899 100%)'
            }}
          >
            {levelType === 'host' ? (
              <>
                <TrendingUp className="w-5 h-5 mr-2" />
                View Earnings
              </>
            ) : (
              <>
                <Coins className="w-5 h-5 mr-2" />
                Top Up Now
              </>
            )}
          </Button>
        </motion.div>
      </div>
      </div>
    </div>
  );
};

export default Level;
