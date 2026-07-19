import { useState, useMemo, useEffect, useCallback, lazy, Suspense } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Home, Users, Play, User, Radio, PartyPopper, X, Plus, PhoneCall } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useGlobalUnreadCount, formatBadgeCount } from "@/hooks/useGlobalUnreadCount";
import { lazyRetry } from "@/utils/lazyRetry";
import ErrorBoundary from "@/components/ErrorBoundary";
import { NativeRouterShell, isNativeRouterShellAvailable } from "@/plugins/NativeRouterShell";
import { warmRouteForNavigation } from "@/utils/routePrefetch";
import { isLowEndDevice } from "@/utils/lowEndDevice";
import { supabase } from "@/integrations/supabase/client";



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

export const BottomNavigation = ({ onTabChange }: BottomNavigationProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [showActionMenu, setShowActionMenu] = useState(false);
  const { t } = useTranslation();
  const navItems = getNavItems(t);
  const unreadCounts = useGlobalUnreadCount();
  const lowEnd = useMemo(() => isLowEndDevice(), []);
  const [isHostAccount, setIsHostAccount] = useState(false);

  // Determine if current account is a host (female / approved host).
  // Match Call (random 1-on-1) is initiated by users/agencies only;
  // hosts only RECEIVE calls, so the launcher button must be hidden for them.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) return;
        const { data } = await supabase
          .from("profiles")
          .select("is_host, gender, host_level")
          .eq("id", user.id)
          .maybeSingle();
        if (cancelled || !data) return;
        const host =
          data.is_host === true ||
          (data.host_level ?? 0) > 0 ||
          (typeof data.gender === "string" && data.gender.toLowerCase() === "female");
        setIsHostAccount(host);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);


  // 🚀 Native Badge Sync: Push unread counts to native bottom bar
  useEffect(() => {
    if (isNativeRouterShellAvailable() && unreadCounts.total >= 0) {
      // Sync profile/me tab badge (total messages/notifs)
      NativeRouterShell.setBadge({ tabId: 'profile', count: unreadCounts.total }).catch(() => {});
      
      // If we had more specific tabs in native shell, we'd sync them here
      // NativeRouterShell.setBadge({ tabId: 'chat', count: unreadCounts.messages }).catch(() => {});
    }
  }, [unreadCounts.total]);

  const currentPath = location.pathname;
  const handleNavClick = useCallback((item: NavItem) => {
    if (item.isCenter) {
      setShowActionMenu(prev => !prev);
    } else {
      void warmRouteForNavigation(item.path)?.catch(() => undefined);
      navigate(item.path);
      onTabChange?.(item.path);
      setShowActionMenu(false);
    }
  }, [navigate, onTabChange]);

  // 🚀 INSTANT NAV: warm up the route chunk on touch-start / hover so the
  // tap itself navigates with zero perceived delay.
  const prefetchRoute = useCallback((path: string) => {
    try {
      switch (path) {
        case '/': import('@/pages/Index'); break;
        case '/discover': import('@/pages/Discover'); break;
        case '/reels': import('@/pages/Reels'); break;
        case '/profile': import('@/pages/Profile'); break;
        case '/go-live': import('@/pages/LiveSessionPage').catch(() => {}); break;
        case '/create-party': import('@/pages/PartySessionPage').catch(() => {}); break;
        case '/match-call': import('@/pages/MatchCall').catch(() => {}); break;
      }
    } catch {}
  }, []);

  // 🚀 Eagerly warm ALL bottom-nav route chunks on mount so the first tab tap
  // never hits an empty Suspense (white-screen flash). Done in an idle window
  // so it never competes with first paint.
  useEffect(() => {
    const warmAll = () => {
      ['/', '/discover', '/reels', '/profile', '/go-live', '/create-party']
        .forEach((p) => prefetchRoute(p));
    };
    const ric = (window as any).requestIdleCallback;
    const handle = ric ? ric(warmAll, { timeout: 1500 }) : setTimeout(warmAll, 400);
    return () => {
      const cic = (window as any).cancelIdleCallback;
      if (ric && cic) cic(handle); else clearTimeout(handle as any);
    };
  }, [prefetchRoute]);


  const handleActionClick = (path: string) => {
    setShowActionMenu(false);
    void warmRouteForNavigation(path)?.catch(() => undefined);
    navigate(path);
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
            transition={{ duration: 0.06 }}
            className="fixed inset-0 bg-black/35"
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
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.08, ease: "linear" }}
          >
            <div className="flex flex-col gap-3 w-full max-w-[280px]">
              <motion.button
                initial={{ opacity: 0, x: 0 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.06 }}
                onClick={() => handleActionClick('/go-live')}
                data-instant-path="/go-live"
                data-prefetch-path="/go-live"
                className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-red-500 via-pink-500 to-rose-500 rounded-2xl shadow-2xl shadow-pink-500/50 transition-opacity duration-75 active:opacity-90 border border-white/20"
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
                initial={{ opacity: 0, x: 0 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.06 }}
                onClick={() => handleActionClick('/create-party')}
                data-instant-path="/create-party"
                data-prefetch-path="/create-party"
                className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-purple-600 via-violet-500 to-indigo-500 rounded-2xl shadow-2xl shadow-purple-500/50 transition-opacity duration-75 active:opacity-90 border border-white/20"
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

              {!isHostAccount && (
                <motion.button
                  initial={{ opacity: 0, x: 0 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.06 }}
                  onClick={() => handleActionClick('/match-call')}
                  data-instant-path="/match-call"
                  data-prefetch-path="/match-call"
                  className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-cyan-500 via-teal-500 to-emerald-500 rounded-2xl shadow-2xl shadow-cyan-500/50 transition-opacity duration-75 active:opacity-90 border border-white/20"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
                    <PhoneCall className="w-5 h-5 text-white" />
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <p className="text-white font-bold text-sm">Random Call</p>
                    <p className="text-white/80 text-xs">Random 1-on-1 video</p>
                  </div>
                  <div className="w-2 h-2 rounded-full bg-white animate-pulse flex-shrink-0" />
                </motion.button>
              )}
            </div>

          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Navigation Bar — premium pearl-cream glass with champagne accents */}
      <nav
        className="fixed bottom-0 left-0 right-0"
        style={{
          zIndex: 9990,
          paddingBottom: 'max(env(safe-area-inset-bottom, 0px), var(--min-bottom-inset, 0px))',
          background: lowEnd
            ? '#fffdf8'
            : 'linear-gradient(180deg, rgba(255,253,248,0.96) 0%, rgba(252,247,237,0.98) 100%)',
          backdropFilter: lowEnd ? 'none' : 'saturate(160%) blur(18px)',
          WebkitBackdropFilter: lowEnd ? 'none' : 'saturate(160%) blur(18px)',
          borderTop: '1px solid rgba(201,168,76,0.18)',
          boxShadow: lowEnd
            ? '0 -1px 0 rgba(201,168,76,0.18)'
            : '0 -10px 28px -14px rgba(120,80,20,0.18), inset 0 1px 0 rgba(255,255,255,0.9)',
          willChange: 'opacity, transform',
        }}
      >
        {/* champagne sheen line on top edge */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-0 right-0 top-0 h-px"
          style={{
            background:
              'linear-gradient(90deg, transparent 0%, rgba(201,168,76,0.45) 50%, transparent 100%)',
          }}
        />
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
                  className="relative -mt-6 transition-opacity duration-75 active:opacity-90 touch-manipulation"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                  aria-label="Create"
                >
                  <div
                    className={cn("absolute -inset-4 rounded-full", lowEnd ? "hidden" : "blur-2xl")}
                    style={{
                      background:
                        'radial-gradient(circle, rgba(236,72,153,0.35) 0%, rgba(168,85,247,0.25) 45%, transparent 70%)',
                    }}
                  />
                  <motion.div
                    animate={showActionMenu ? { rotate: 45 } : { rotate: 0 }}
                    transition={{ duration: 0.06 }}
                    className="relative w-[58px] h-[58px] rounded-full flex items-center justify-center overflow-hidden"
                    style={{
                      background:
                        'radial-gradient(circle at 30% 25%, #ffd1ea 0%, #ec4899 35%, #a855f7 70%, #6366f1 100%)',
                        ? '0 0 0 5px #fffdf8, 0 0 0 6px rgba(201,168,76,0.35)'
                        : '0 10px 26px rgba(168,85,247,0.55), 0 4px 10px rgba(236,72,153,0.35), 0 0 0 5px #fffdf8, 0 0 0 6px rgba(201,168,76,0.40)',
                    }}
                  >
                    <div
                      className="absolute inset-x-1 top-1 h-1/2 rounded-full pointer-events-none"
                      style={{
                        background:
                          'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 100%)',
                      }}
                    />
                    <div className="absolute inset-[3px] rounded-full ring-1 ring-white/30 pointer-events-none" />
                    <motion.div
                      animate={showActionMenu ? { rotate: -45 } : { rotate: 0 }}
                      className="relative z-10"
                    >
                      {showActionMenu ? (
                        <X className="w-5 h-5 text-white drop-shadow" strokeWidth={2.6} />
                      ) : (
                        <Plus className="w-6 h-6 text-white drop-shadow" strokeWidth={2.6} />
                      )}
                    </motion.div>
                  </motion.div>
                  <motion.span
                    initial={false}
                    animate={{ opacity: showActionMenu ? 0 : 1 }}
                    className="absolute -bottom-3.5 left-1/2 -translate-x-1/2 text-[9px] font-bold whitespace-nowrap tracking-wide"
                    style={{
                      background:
                        'linear-gradient(90deg, #b8860b 0%, #c9a84c 50%, #8b6914 100%)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                    }}
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
                data-instant-path={item.path}
                data-prefetch-path={item.path}
                className="flex flex-col items-center gap-0.5 py-1.5 px-3 rounded-2xl transition-opacity duration-75 min-w-[54px] active:opacity-90 touch-manipulation relative"
                style={{ WebkitTapHighlightColor: 'transparent' }}
                aria-label={item.label}
              >
                {isActive && (
                  <span
                    className="absolute inset-0 rounded-2xl -z-0"
                    style={{
                      background:
                        'linear-gradient(180deg, rgba(255,240,250,0.95) 0%, rgba(253,228,243,0.85) 100%)',
                      boxShadow:
                        '0 4px 12px -4px rgba(236,72,153,0.30), inset 0 0 0 1px rgba(236,72,153,0.18), inset 0 1px 0 rgba(255,255,255,0.9)',
                    }}
                  />
                )}
                <div className="relative">
                  {isActive && (
                    <svg width="0" height="0" className="absolute" aria-hidden>
                      <defs>
                        <linearGradient id={`bn-grad-${index}`} x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#ec4899" />
                          <stop offset="100%" stopColor="#a855f7" />
                        </linearGradient>
                      </defs>
                    </svg>
                  )}
                  <Icon
                    className={cn(
                      "w-[22px] h-[22px] transition-colors duration-100 relative z-10",
                      isActive ? "" : "text-slate-500"
                    )}
                    strokeWidth={isActive ? 2.5 : 2}
                    style={
                      isActive
                        ? ({ stroke: `url(#bn-grad-${index})` } as React.CSSProperties)
                        : undefined
                    }
                  />

                  {item.path === '/profile' && unreadCounts.total > 0 && (
                    <span
                      key={unreadCounts.total}
                      className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 text-white text-[8px] font-bold rounded-full flex items-center justify-center z-20"
                      style={{
                      }}
                    >
                      {formatBadgeCount(unreadCounts.total)}
                    </span>
                  )}
                </div>

                <span
                  className={cn(
                    "text-[10px] font-bold transition-colors duration-100 relative z-10 tracking-wide",
                    isActive ? "" : "text-slate-500"
                  )}
                  style={
                    isActive
                      ? {
                          background:
                            'linear-gradient(90deg,#ec4899 0%,#a855f7 100%)',
                        }
                      : undefined
                  }
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
      <ErrorBoundary componentName="CampaignFloatingButton" fallback={null}>
        <Suspense fallback={null}>
          <CampaignFloatingButton />
        </Suspense>
      </ErrorBoundary>
    </>
  );
};
