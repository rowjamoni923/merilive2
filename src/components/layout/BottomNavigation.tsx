import { useState, useTransition, useMemo, useEffect, useCallback, memo, lazy, Suspense } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Home, Users, Play, User, Radio, PartyPopper, X, Plus, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { hapticFeedback } from "@/utils/nativeUtils";
import { useGlobalUnreadCount, formatBadgeCount } from "@/hooks/useGlobalUnreadCount";
import { useFeatureLevelCheck } from "@/hooks/useFeatureLevelCheck";
import { useRealtimeLevelProgress } from "@/hooks/useRealtimeLevel";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { lazyRetry } from "@/utils/lazyRetry";
import { LevelLockModal } from "@/components/level/LevelLockModal";
const CampaignFloatingButton = lazy(lazyRetry(() => import("@/components/campaign/CampaignFloatingButton")));
interface NavItem {
  icon: React.ElementType;
  label: string;
  path: string;
  isCenter?: boolean;
  hasBadge?: boolean;
  gradient?: string;
}

const getNavItems = (t: (key: string) => string): NavItem[] => [
  { icon: Home, label: t("nav.home"), path: "/", gradient: "from-pink-500 to-rose-500" },
  { icon: Users, label: t("nav.party"), path: "/discover", gradient: "from-purple-500 to-indigo-500" },
  { icon: Plus, label: "", path: "", isCenter: true },
  { icon: Play, label: t("nav.reels"), path: "/reels", gradient: "from-orange-500 to-amber-500" },
  { icon: User, label: t("profile.title"), path: "/profile", hasBadge: false, gradient: "from-cyan-500 to-blue-500" },
];

interface BottomNavigationProps {
  activeTab?: string;
  onTabChange?: (path: string) => void;
}

export const BottomNavigation = ({ activeTab: externalActiveTab, onTabChange }: BottomNavigationProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [, startTransition] = useTransition();
  const { t } = useTranslation();
  const navItems = getNavItems(t);
  const unreadCounts = useGlobalUnreadCount();
  const { checkFeatureAccess, isLoading: featureLevelLoading } = useFeatureLevelCheck();
  const [userProfile, setUserProfile] = useState<any>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const { level: resolvedUserLevel, loading: resolvedLevelLoading } = useRealtimeLevelProgress(currentUserId);
  const [lockModal, setLockModal] = useState<{ open: boolean; featureName: string; requiredLevel: number; currentLevel: number; isHost: boolean }>({
    open: false,
    featureName: "",
    requiredLevel: 0,
    currentLevel: 0,
    isHost: false,
  });

  // Load user profile for level checks
  useEffect(() => {
    let isMounted = true;

    const loadProfile = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;

        if (!isMounted || !user) {
          if (isMounted) {
            setCurrentUserId(null);
            setUserProfile(null);
          }
          return;
        }

        setCurrentUserId(user.id);

        const { data } = await supabase
          .from('profiles')
          .select('user_level, host_level, max_user_level, is_host, host_status, gender')
          .eq('id', user.id)
          .maybeSingle();

        if (isMounted) {
          setUserProfile(data ?? null);
        }
      } catch (error) {
        console.warn('[BottomNavigation] Failed to load profile state', error);
        if (isMounted) {
          setUserProfile(null);
        }
      }
    };

    loadProfile();

    return () => {
      isMounted = false;
    };
  }, []);
    
  const currentPath = location.pathname;
  const activeTab = externalActiveTab || currentPath;

  const handleNavClick = useCallback((item: NavItem) => {
    hapticFeedback('light');
    if (item.isCenter) {
      hapticFeedback('medium');
      setShowActionMenu(prev => !prev);
    } else {
      startTransition(() => { navigate(item.path); });
      onTabChange?.(item.path);
      setShowActionMenu(false);
    }
  }, [navigate, onTabChange, startTransition]);

  // 🚀 INSTANT NAV: warm up the route chunk on touch-start / hover so the
  // tap itself navigates with zero perceived delay.
  const prefetchRoute = useCallback((path: string) => {
    try {
      switch (path) {
        case '/': import('@/pages/Index'); break;
        case '/discover': import('@/pages/Discover'); break;
        case '/reels': import('@/pages/Reels'); break;
        case '/profile': import('@/pages/Profile'); break;
        case '/go-live': import('@/pages/GoLive').catch(() => {}); break;
        case '/create-party': import('@/pages/CreateParty').catch(() => {}); break;
      }
    } catch {}
  }, []);

  const handleActionClick = (path: string) => {
    hapticFeedback('medium');

    const featureKey = path === '/create-party' ? 'create_party' : path === '/go-live' ? 'go_live' : null;
    if (featureKey) {
      if (featureLevelLoading || resolvedLevelLoading || !userProfile) {
        toast.info('Loading your level, please try again.');
        setShowActionMenu(false);
        return;
      }

      const normalizedGender = String(userProfile.gender ?? '').toLowerCase();
      const isHost = Boolean(userProfile.is_host) || String(userProfile.host_status ?? '').toLowerCase() === 'approved' || normalizedGender === 'female';
      // Use highest known level so we never block a user whose stored level is already sufficient
      // (resolvedUserLevel can briefly read 1 from cache before the resolver completes).
      const currentLevel = Math.max(
        Number(resolvedUserLevel) || 0,
        Number(userProfile.user_level) || 0,
        Number(userProfile.host_level) || 0,
        Number(userProfile.max_user_level) || 0,
      );
      const result = checkFeatureAccess(featureKey, currentLevel, isHost);

      if (!result.canAccess) {
        setLockModal({
          open: true,
          featureName: featureKey === 'go_live' ? 'Go Live' : 'Create Party',
          requiredLevel: result.requiredLevel,
          currentLevel,
          isHost,
        });
        setShowActionMenu(false);
        return;
      }
    }
    
    setShowActionMenu(false);
    startTransition(() => { navigate(path); });
    onTabChange?.(path);
  };

  return (
    <>
      {/* Backdrop overlay when menu is open */}
      <AnimatePresence>
        {showActionMenu && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm"
            style={{ zIndex: 9998 }}
            onClick={() => setShowActionMenu(false)}
          />
        )}
      </AnimatePresence>

      {/* Action Menu */}
      <AnimatePresence>
        {showActionMenu && (
          <motion.div
            className="fixed left-0 right-0 flex justify-center px-4"
            style={{ zIndex: 9999, bottom: 'calc(80px + env(safe-area-inset-bottom, 0px))' }}
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
          >
            <div className="flex flex-col gap-3 w-full max-w-[280px]">
              <motion.button
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.05, type: "spring" }}
                onClick={() => handleActionClick('/go-live')}
                className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-red-500 via-pink-500 to-rose-500 rounded-2xl shadow-2xl shadow-pink-500/50 active:scale-[0.98] transition-transform border border-white/20 will-change-transform"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
                  <Radio className="w-5 h-5 text-white" />
                </div>
                <div className="text-left flex-1 min-w-0">
                   <p className="text-white font-bold text-sm">{t("live.goLive")}</p>
                   <p className="text-white/80 text-xs">{t("live.startStream")}</p>
                </div>
                <div className="w-2 h-2 rounded-full bg-white animate-pulse flex-shrink-0" />
              </motion.button>

              <motion.button
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1, type: "spring" }}
                onClick={() => handleActionClick('/create-party')}
                className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-purple-600 via-violet-500 to-indigo-500 rounded-2xl shadow-2xl shadow-purple-500/50 active:scale-[0.98] transition-transform border border-white/20 will-change-transform"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
                  <PartyPopper className="w-5 h-5 text-white" />
                </div>
                <div className="text-left flex-1 min-w-0">
                   <p className="text-white font-bold text-sm">{t("party.createParty")}</p>
                   <p className="text-white/80 text-xs">{t("party.roomType")}</p>
                </div>
                <Users className="w-4 h-4 text-white/70 flex-shrink-0" />
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Navigation Bar */}
      <nav 
        className="fixed bottom-0 left-0 right-0" 
        style={{ zIndex: 9990, paddingBottom: 'max(env(safe-area-inset-bottom, 0px), var(--min-bottom-inset, 0px))' }}
      >
        {/* Soft transparent fade — no visible dark line above nav */}
        <div className="absolute inset-x-0 -top-6 h-6 pointer-events-none" style={{ background: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.35) 70%, rgba(0,0,0,0.7) 100%)' }} />
        <div className="absolute inset-x-0 bottom-0 h-[calc(100%+max(env(safe-area-inset-bottom,0px),var(--min-bottom-inset,0px)))] backdrop-blur-2xl" style={{ background: 'rgba(0,0,0,0.78)' }} />
        
        <div className="relative flex items-center justify-around py-1.5 px-3 max-w-lg mx-auto">
          {navItems.map((item, index) => {
            const isActive = item.path === "/" 
              ? currentPath === "/" 
              : currentPath === item.path || currentPath.startsWith(item.path + "/");
            const Icon = item.icon;

            if (item.isCenter) {
              return (
                <button
                  key={`center-${index}`}
                  onClick={() => handleNavClick(item)}
                  className="relative -mt-5 active:scale-90 transition-all duration-200 touch-manipulation"
                >
                  <div className="absolute -inset-3 rounded-full blur-2xl" style={{ background: 'rgba(168,85,247,0.3)' }} />
                  <motion.div 
                    animate={showActionMenu ? { rotate: 45 } : { rotate: 0 }}
                    transition={{ duration: 0.2 }}
                    className="relative w-[52px] h-[52px] rounded-full flex items-center justify-center ring-[3px] ring-black/80"
                    style={{ 
                      background: 'linear-gradient(135deg, #d946ef, #7c3aed, #4f46e5)',
                      boxShadow: '0 4px 24px rgba(147,51,234,0.5)'
                    }}
                  >
                    <div className="absolute inset-[2px] rounded-full bg-gradient-to-br from-white/25 via-transparent to-transparent" />
                    <motion.div animate={showActionMenu ? { rotate: -45 } : { rotate: 0 }} className="relative z-10">
                      {showActionMenu ? (
                        <X className="w-5 h-5 text-white" />
                      ) : (
                        <Plus className="w-5 h-5 text-white" strokeWidth={2.5} />
                      )}
                    </motion.div>
                  </motion.div>
                  <motion.span 
                    initial={false}
                    animate={{ opacity: showActionMenu ? 0 : 1 }}
                    className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[9px] text-white/50 font-medium whitespace-nowrap"
                  >
                    Create
                  </motion.span>
                </button>
              );
            }

            return (
              <button
                key={item.path}
                onClick={() => handleNavClick(item)}
                onPointerDown={() => prefetchRoute(item.path)}
                onMouseEnter={() => prefetchRoute(item.path)}
                className="flex flex-col items-center gap-0.5 py-1.5 px-3 rounded-2xl transition-all duration-300 min-w-[52px] active:scale-90 touch-manipulation relative"
              >
                <div className="relative">
                  <Icon className={cn(
                    "w-[22px] h-[22px] transition-all duration-300 relative z-10",
                    isActive ? "text-white" : "text-white/40"
                  )} />
                  
                  {item.path === '/profile' && unreadCounts.total > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 bg-gradient-to-r from-red-500 to-pink-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center ring-2 ring-black">
                      {formatBadgeCount(unreadCounts.total)}
                    </span>
                  )}
                </div>
                
                <span className={cn(
                  "text-[10px] font-medium transition-all duration-300",
                  isActive ? "text-white" : "text-white/35"
                )}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
      <Suspense fallback={null}>
        <CampaignFloatingButton />
      </Suspense>
      <LevelLockModal
        open={lockModal.open}
        onClose={() => setLockModal((s) => ({ ...s, open: false }))}
        featureName={lockModal.featureName}
        requiredLevel={lockModal.requiredLevel}
        currentLevel={lockModal.currentLevel}
        isHost={lockModal.isHost}
      />
    </>
  );
};
