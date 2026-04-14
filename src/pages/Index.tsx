import { useState, useEffect, useMemo, useCallback, useRef, memo, useTransition } from "react";
import { useNavigate } from "react-router-dom";
import { BottomNavigation } from "@/components/layout/BottomNavigation";
import { DynamicBanner } from "@/components/home/DynamicBanner";
import { FullScreenPromoBanners } from "@/components/home/FullScreenPromoBanners";


import { BarChart3, Search, Users, Phone, Bell, Crown, Eye, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

import { useCall } from "@/components/call/CallProvider";
import { NotificationList } from "@/components/notifications/NotificationList";
import AvatarWithFrame, { preloadFrames } from "@/components/common/AvatarWithFrame";
import { getCountryByCode } from "@/data/countryCodes";
import { LevelBadge } from "@/components/common/LevelBadge";
import { CallButton } from "@/features/call";
import { toast } from "sonner";
import { NativePullToRefresh } from "@/components/common/NativePullToRefresh";
import { warmLiveKitToken } from "@/services/livekitService";

interface Profile {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
  country_code: string | null;
  country_flag: string | null;
  user_level: number | null;
  host_level: number | null;
  is_online: boolean | null;
  is_in_call: boolean | null;
  is_host: boolean | null;
  gender: string | null;
  call_rate_per_minute: number | null;
  is_verified?: boolean | null;
  is_face_verified?: boolean | null;
  created_at?: string;
  frame_id?: string | null;
  host_status?: string | null;
  host_availability?: string | null;
  isLive?: boolean;
  liveStreamId?: string;
  viewerCount?: number;
  liveThumbnailUrl?: string | null;
  actuallyBusy?: boolean;
}

// Countries for filter - loaded dynamically from database

// Default placeholder for hosts without avatar
const DEFAULT_AVATAR = "/placeholder.svg";

type SubTab = "popular" | "live" | "new" | "following";

const Index = () => {
  const navigate = useNavigate();
  const { startCall } = useCall();
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();
  

  const handlePullRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["index-hosts-v3"] });
  }, [queryClient]);
  // Dynamic country list from database
  const { data: dynamicCountries } = useQuery({
    queryKey: ["host-countries"],
    staleTime: 1000 * 60 * 15, // 15 minutes cache - country list rarely changes
    gcTime: 1000 * 60 * 60,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("country_code, country_flag")
        .eq("is_host", true)
        .eq("gender", "female")
        .eq("host_status", "approved")
        .eq("is_face_verified", true)
        .not("country_code", "is", null)
        .not("country_flag", "is", null);
      
      if (!data) return [];
      
      // Get unique countries
      const countryMap = new Map<string, string>();
      data.forEach(p => {
        if (p.country_code && p.country_flag && p.country_flag !== 'NONE') {
          countryMap.set(p.country_code, p.country_flag);
        }
      });
      
      // Convert to array and sort by country code
      const countries = Array.from(countryMap.entries())
        .map(([code, flag]) => {
          const countryInfo = getCountryByCode(code);
          return { code, flag, name: countryInfo?.name || code };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      
      return countries;
    },
  });

  const countries = useMemo(() => {
    const allOption = { code: "all", name: "All", flag: "🌍" };
    if (!dynamicCountries || dynamicCountries.length === 0) return [allOption];
    return [allOption, ...dynamicCountries];
  }, [dynamicCountries]);

  const [activeTab, setActiveTab] = useState("/");
  const [subTab, setSubTab] = useState<SubTab>("popular");
  const [selectedCountry, setSelectedCountry] = useState("all");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [callRateSettings, setCallRateSettings] = useState<{
    default_rate: number;
    level_rates: Array<{ level: number; rate: number }>;
  } | null>(null);
  const [callRateLoading, setCallRateLoading] = useState(true);
  const warmedHostImagesRef = useRef<Set<string>>(new Set());
  const [instantHosts, setInstantHosts] = useState<Array<Profile & { isLive?: boolean; liveStreamId?: string }>>(() => {
    try {
      if (typeof window === "undefined") return [];
      const raw = window.sessionStorage.getItem("index-hosts-instant-cache-v1");
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  // Get current user and default call rate from admin settings
  useEffect(() => {
    // Use requestAnimationFrame to defer initialization after paint
    const rafId = requestAnimationFrame(() => {
      const initialize = async () => {
        // Parallel fetch for user + call rates - using cached auth for speed
        const { getCachedUser } = await import('@/utils/cachedAuth');
        const [cachedUser, settingsResult] = await Promise.all([
          getCachedUser(),
          supabase.from("app_settings").select("setting_value").eq("setting_key", "call_rates").maybeSingle()
        ]);
        
        if (cachedUser) setCurrentUserId(cachedUser.id);
        
        if (settingsResult.data?.setting_value) {
          const settingValue = settingsResult.data.setting_value as any;
          setCallRateSettings({
            default_rate: settingValue?.default_rate || 2000,
            level_rates: settingValue?.level_rates || []
          });
        }
        setCallRateLoading(false);
      };
      initialize();
    });
    return () => cancelAnimationFrame(rafId);
  }, []);

  // Fetch hosts based on subTab - Optimized for speed
  const { data: hosts, isLoading } = useQuery({
    queryKey: ["index-hosts-v3", selectedCountry, subTab, currentUserId],
    staleTime: 1000 * 30,
    gcTime: 1000 * 120,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const sixtyMinutesAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      // ⚡ PARALLEL FETCH: All independent queries at once
      const [liveStreamsRes, followingRes] = await Promise.all([
        supabase
          .from("live_streams")
          .select("id, host_id, title, viewer_count, thumbnail_url, started_at")
          .eq("is_active", true),
        // Only fetch following if needed
        (subTab === "following" && currentUserId)
          ? supabase.from("followers").select("following_id").eq("follower_id", currentUserId)
          : Promise.resolve({ data: null }),
      ]);

      const liveStreamMap = new Map(liveStreamsRes.data?.map(s => [s.host_id, s]) || []);
      const liveHostIds = Array.from(liveStreamMap.keys());

      if (subTab === "following") {
        const followedIds = followingRes.data?.map((f: any) => f.following_id) || [];
        if (followedIds.length === 0) return [];
      }

      // Build profile query based on tab
      let profileQuery;
      const HOST_FIELDS = "id, display_name, username, avatar_url, bio, country_code, country_flag, user_level, host_level, is_online, is_in_call, is_host, gender, call_rate_per_minute, is_verified, is_face_verified, created_at, frame_id, last_seen_at, host_status, host_availability";

      if (subTab === "live") {
        if (liveHostIds.length === 0) return [];
        profileQuery = supabase
          .from("profiles_public")
          .select(HOST_FIELDS)
          .in("id", liveHostIds)
          .eq("host_status", "approved")
          .eq("is_face_verified", true);
        if (selectedCountry !== "all") profileQuery = profileQuery.eq("country_code", selectedCountry);
      } else {
        profileQuery = supabase
          .from("profiles_public")
          .select(HOST_FIELDS)
          .eq("is_host", true)
          .eq("gender", "female")
          .eq("host_status", "approved")
          .eq("is_face_verified", true)
          .eq("is_online", true)
          .neq("host_availability", "offline")
          .gte("last_seen_at", sixtyMinutesAgo)
          .not("avatar_url", "is", null);
        if (selectedCountry !== "all") profileQuery = profileQuery.eq("country_code", selectedCountry);
        if (subTab === "following") {
          const followedIds = followingRes.data?.map((f: any) => f.following_id) || [];
          if (followedIds.length > 0) profileQuery = profileQuery.in("id", followedIds);
        }
        if (subTab === "new") {
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          profileQuery = profileQuery.gte("created_at", sevenDaysAgo.toISOString());
        }
        profileQuery = profileQuery.order("last_seen_at", { ascending: false }).limit(100);
      }

      // ⚡ Fetch profiles first, then scope busy-call lookup to only visible hosts
      const profilesRes = await profileQuery;

      if (profilesRes.error) throw profilesRes.error;
      const baseProfiles = (profilesRes.data || []) as any[];

      let profiles = baseProfiles;
      const baseProfileIds = new Set(baseProfiles.map((profile: any) => profile.id));
      const missingLiveHostIds = liveHostIds.filter((hostId) => !baseProfileIds.has(hostId));

      if (missingLiveHostIds.length > 0) {
        let missingLiveQuery = supabase
          .from("profiles_public")
          .select(HOST_FIELDS)
          .in("id", missingLiveHostIds)
          .eq("host_status", "approved")
          .eq("is_face_verified", true);

        if (selectedCountry !== "all") {
          missingLiveQuery = missingLiveQuery.eq("country_code", selectedCountry);
        }

        const { data: missingLiveProfiles, error: missingLiveError } = await missingLiveQuery;

        if (missingLiveError) {
          console.error("[Index] Error fetching missing live host profiles:", missingLiveError);
        } else if (missingLiveProfiles?.length) {
          profiles = [...baseProfiles, ...missingLiveProfiles];
        }
      }

      let activeBusyIds = new Set<string>();
      const candidateHostIds = profiles.map((p: any) => p.id).filter(Boolean);
      const busyProbeHostIds = candidateHostIds.slice(0, 36); // above-the-fold fast path

      if (busyProbeHostIds.length > 0) {
        const { data: activeCallsData } = await supabase
          .from('private_calls')
          .select('host_id')
          .in('host_id', busyProbeHostIds)
          .in('status', ['pending', 'ringing', 'connected'])
          .is('ended_at', null);

        activeBusyIds = new Set((activeCallsData || []).map((c: any) => c.host_id));
      }

      // Map results
      const hostsWithStatus = profiles.map(profile => {
        const streamData = liveStreamMap.get(profile.id);
        const isActuallyBusy = activeBusyIds.has(profile.id) || !!profile.is_in_call;
        return {
          ...profile,
          is_in_call: isActuallyBusy,
          actuallyBusy: isActuallyBusy,
          isLive: liveStreamMap.has(profile.id),
          liveStreamId: streamData?.id,
          viewerCount: streamData?.viewer_count || 0,
          liveThumbnailUrl: streamData?.thumbnail_url || null,
          startedAt: streamData?.started_at || new Date().toISOString(),
        };
      });

      // Sort: LIVE first (longest streaming first) → ONLINE (longest online first)
      // Busy hosts stay in their category (live+busy = live section, online+busy = online section)
      return hostsWithStatus.sort((a, b) => {
        // 1. Live hosts ALWAYS on top, Online hosts next
        const getPriority = (h: typeof a) => {
          if (h.isLive) return 0;  // Live (including busy-while-live)
          if (h.is_online) return 1; // Online (including busy-while-online)
          return 2; // Offline
        };
        const pd = getPriority(a) - getPriority(b);
        if (pd !== 0) return pd;

        // 2. Within LIVE: longest streaming first (earliest startedAt = streaming longer)
        if (a.isLive && b.isLive) {
          return ((a as any).startedAt || '').localeCompare((b as any).startedAt || '');
        }

        // 3. Within ONLINE: longest online first (earliest last_seen_at = online longer)
        // Recently came online → goes lower
        if (a.is_online && b.is_online) {
          return ((a as any).last_seen_at || '').localeCompare((b as any).last_seen_at || '');
        }

        return 0;
      });
    },
  });

  useEffect(() => {
    if (!hosts || hosts.length === 0) return;
    const snapshot = hosts.slice(0, 100);
    setInstantHosts(snapshot as Array<Profile & { isLive?: boolean; liveStreamId?: string }>);
    try {
      window.sessionStorage.setItem("index-hosts-instant-cache-v1", JSON.stringify(snapshot));
    } catch {
      // no-op
    }
  }, [hosts]);

  const displayHosts = (hosts && hosts.length > 0
    ? hosts
    : instantHosts) as Array<Profile & { isLive?: boolean; liveStreamId?: string }>;

  useEffect(() => {
    if (!hosts?.length) return;

    const uniqueFrameIds = Array.from(
      new Set(
        hosts
          .map((host) => host.frame_id)
          .filter((frameId): frameId is string => !!frameId)
      )
    );

    if (uniqueFrameIds.length) {
      preloadFrames(uniqueFrameIds).catch(() => undefined);
    }

    // ⚡ Preload LiveStream route chunk in idle time for instant open
    const warmLiveRoute = () => import("@/pages/LiveStream").catch(() => {});

    // ⚡ Prewarm LiveKit viewer tokens for top live hosts shown on home
    const liveIdsToWarm = hosts
      .filter((host) => !!host.isLive && !!host.liveStreamId)
      .slice(0, 8)
      .map((host) => host.liveStreamId as string);

    const warmableUrls = hosts
      .slice(0, 24)
      .map((host) => host.avatar_url)
      .filter((url): url is string => !!url && !warmedHostImagesRef.current.has(url));

    if (warmableUrls.length === 0 && liveIdsToWarm.length === 0) {
      warmLiveRoute();
      return;
    }

    const timeoutId = window.setTimeout(() => {
      warmLiveRoute();

      liveIdsToWarm.forEach((liveId) => {
        warmLiveKitToken(`live_${liveId}`, "viewer_stream").catch(() => {});
      });

      warmableUrls.forEach((url) => {
        warmedHostImagesRef.current.add(url);
        const img = new Image();
        img.decoding = "async";
        img.src = url;
      });
    }, 40);

    return () => window.clearTimeout(timeoutId);
  }, [hosts]);

  // Home realtime refetch is now centralized in useRealtimeQuerySync
  // to avoid duplicate refetch/invalidate storms.

  const handleTabChange = (path: string) => {
    setActiveTab(path);
    navigate(path);
  };

  const handleUserClick = (userId: string, isLive: boolean, liveStreamId?: string) => {
    if (isLive && liveStreamId) {
      import("@/pages/LiveStream").catch(() => {});
      warmLiveKitToken(`live_${liveStreamId}`, "viewer_stream").catch(() => {});
      navigate(`/live/${liveStreamId}`);
    } else {
      // Navigate to profile detail page for non-live users
      navigate(`/profile-detail/${userId}`);
    }
  };

  const handleCall = async (e: React.MouseEvent, userId: string) => {
    e.stopPropagation();
    await startCall(userId);
  };

  // Render user card - PREMIUM UPGRADED DESIGN (Memoized for performance)
  const UserCard = memo(({ user, index }: { user: Profile & { isLive?: boolean; liveStreamId?: string; liveThumbnailUrl?: string | null }; index: number }) => {
    const isFemaleHost = user.is_host && (user.gender === 'female' || user.gender === 'Female');
    const displayLevel = isFemaleHost 
      ? (user.host_level ?? 0)
      : (user.user_level ?? 1);
    const isActuallyBusy = user.actuallyBusy ?? !!user.is_in_call;

    const getBorderGlow = () => {
      if (user.isLive) return "shadow-[0_0_12px_rgba(239,68,68,0.4)] border-red-500/40";
      if (displayLevel >= 40) return "shadow-[0_0_12px_rgba(251,191,36,0.35)] border-amber-400/30";
      if (displayLevel >= 20) return "shadow-[0_0_10px_rgba(168,85,247,0.3)] border-purple-500/25";
      if (displayLevel >= 10) return "shadow-[0_0_8px_rgba(59,130,246,0.25)] border-blue-500/20";
      return "border-white/[0.06]";
    };

    
    return (
      <div
        onClick={() => handleUserClick(user.id, user.isLive || false, user.liveStreamId)}
        className={cn(
          "relative overflow-hidden rounded-2xl cursor-pointer group active:scale-[0.97]",
          "bg-card/60 border",
          getBorderGlow()
        )}
        style={{ contain: 'layout style paint' }}
      >
        <div className="relative aspect-[3/4]">
          <img
            src={user.avatar_url || DEFAULT_AVATAR}
            alt={user.display_name || 'User'}
            className="w-full h-full object-cover"
            loading={index < 6 ? "eager" : "lazy"}
            fetchPriority={index < 4 ? "high" : "auto"}
            decoding="async"
          />

          {/* Lightweight gradient overlay - single layer */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />

          {/* Live Badge */}
          {user.isLive && (
            <div className="absolute top-2.5 left-2">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-red-500 to-rose-500 shadow-[0_2px_12px_rgba(239,68,68,0.5)]">
                <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                <span className="text-[10px] font-extrabold text-white tracking-wider">LIVE</span>
              </div>
            </div>
          )}

          {/* Online / Busy Badge */}
          {!user.isLive && user.is_online && (
            <div className="absolute top-2.5 left-2">
              <div className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-full shadow-lg",
                isActuallyBusy
                  ? "bg-gradient-to-r from-amber-500/90 to-orange-500/90"
                  : "bg-gradient-to-r from-emerald-500/90 to-green-500/90"
              )}>
                <span className={cn(
                  "w-1.5 h-1.5 rounded-full bg-white",
                  !isActuallyBusy && "animate-pulse"
                )} />
                <span className="text-[10px] font-bold text-white tracking-wide">
                  {isActuallyBusy ? "Busy" : "Online"}
                </span>
              </div>
            </div>
          )}

          {/* VIP/Verified Badge */}
          {(user.is_verified || user.is_face_verified) && (
            <div className="absolute top-2.5 right-2">
              <div className="w-6 h-6 bg-gradient-to-br from-blue-400 to-cyan-500 rounded-full flex items-center justify-center shadow-[0_2px_10px_rgba(59,130,246,0.5)] border border-white/30">
                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
          )}

          {/* Bottom Info */}
          <div className="absolute bottom-0 left-0 right-0 p-2.5">
            <div className="flex items-center gap-2">
              <div className="relative flex-shrink-0">
                <div className="ring-1 ring-white/30 rounded-full">
                  <AvatarWithFrame
                    userId={user.id}
                    src={user.avatar_url || DEFAULT_AVATAR}
                    name={user.display_name || "U"}
                    level={displayLevel}
                    isHost={user.gender === 'female' || user.is_host || false}
                    size="xxs"
                    showAnimation={false}
                    frameId={user.frame_id}
                  />
                </div>
              </div>
              
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-[13px] truncate" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.6)' }}>
                  {user.display_name || user.username || "User"}
                </p>
                
                <div className="flex items-center gap-1.5 mt-0.5">
                  <LevelBadge level={displayLevel} size="xs" />
                  {user.country_flag && user.country_flag !== 'NONE' && (
                    <span className="text-xs leading-none drop-shadow-md">
                      {user.country_flag}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Call Button - Only for ONLINE female hosts */}
            {(user.gender === 'female' || user.gender === 'Female') && user.is_online && !isActuallyBusy && (
              <div 
                className="absolute bottom-2.5 right-2 z-10"
                onClick={(e) => e.stopPropagation()}
              >
                <CallButton
                  hostId={user.id}
                  onClick={() => startCall(user.id)}
                  size="sm"
                  showRate={false}
                  preloadedRate={user.call_rate_per_minute}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  });

  const getEmptyMessage = () => {
    switch (subTab) {
      case "live": return "No hosts are live right now!";
      case "following": return "Follow some hosts to see them here!";
      case "new": return "No new hosts found!";
      default: return "Come back later!";
    }
  };

  const getEmptyIcon = () => {
    return null;
  };

  // Native mobile optimized render
  return (
    <div className="fixed inset-0 flex flex-col bg-background overflow-hidden" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      {/* Header - FIXED at top, never scrolls */}
      <header className="shrink-0 header-glass" style={{ zIndex: 40 }}>
        <div className="flex items-center justify-center px-3 py-2.5 relative">
          {/* Search Button - Left Side */}
          <Button 
            variant="ghost" 
            size="icon" 
            className="absolute left-3 rounded-full h-8 w-8 active:scale-95 touch-manipulation text-white/70 hover:text-white hover:bg-white/10" 
            onClick={() => navigate('/search')}
          >
            <Search className="w-4 h-4" />
          </Button>
          
          {/* Sub Tabs - Centered */}
          <div className="flex items-center gap-0.5 bg-white/5 rounded-full p-0.5">
            {(["popular", "live", "new", "following"] as SubTab[]).map((tab) => {
              const labels: Record<SubTab, string> = { popular: "Popular", live: "Live", new: "New", following: "Follow" };
              const isActive = subTab === tab;
              const gradients: Record<SubTab, string> = {
                popular: 'linear-gradient(to right, #ec4899, #a855f7)',
                live: 'linear-gradient(to right, #ef4444, #ec4899)',
                new: 'linear-gradient(to right, #ec4899, #a855f7)',
                following: 'linear-gradient(to right, #ec4899, #a855f7)',
              };
              return (
                <button
                  key={tab}
                  onClick={() => {
                    setSubTab(tab);
                  }}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-xs font-medium transition-all active:scale-95 touch-manipulation flex items-center gap-1",
                    isActive ? "text-white shadow-lg" : "text-white/60 hover:text-white"
                  )}
                  style={isActive ? { background: gradients[tab] } : undefined}
                >
                  {tab === "live" && <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />}
                  {labels[tab]}
                </button>
              );
            })}
          </div>

          {/* Leaderboard Button - Right Side */}
          <Button 
            variant="ghost" 
            size="icon" 
            className="absolute right-3 rounded-full h-8 w-8 active:scale-95 touch-manipulation text-amber-400 hover:text-amber-300 hover:bg-white/10" 
            onClick={() => navigate('/leaderboard')}
          >
            <Trophy className="w-4 h-4" />
          </Button>
        </div>

        {/* Country Filter - Compact */}
        <div className="px-2 pb-2 overflow-x-auto scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
            <div className="flex gap-1.5 w-max">
              {countries.map((country) => (
                <button
                  key={country.code}
                  onClick={() => setSelectedCountry(country.code)}
                  className={cn(
                    "flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap active:scale-95 touch-manipulation",
                    selectedCountry === country.code
                      ? "text-white shadow-lg"
                      : "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white"
                  )}
                  style={selectedCountry === country.code ? { background: 'linear-gradient(to right, #ec4899, #a855f7)' } : undefined}
                >
                  <span className="text-sm">{country.flag}</span>
                  <span>{country.name}</span>
                </button>
              ))}
            </div>
        </div>
      </header>

      {/* Main Content - ONLY this part scrolls */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
      <NativePullToRefresh onRefresh={handlePullRefresh} className="min-h-full">
      <main className="px-2 py-2" style={{ paddingBottom: 'var(--content-bottom-padding)' }}>

        {/* Top Banner (first banner) */}
        <DynamicBanner position="top" />


        {displayHosts.length > 0 ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              {displayHosts.slice(0, 6).map((user, index) => (
                <UserCard key={user.id} user={user} index={index} />
              ))}
            </div>

            {/* Remaining banners after first 6 hosts */}
            <DynamicBanner position="middle" />

            {displayHosts.length > 6 && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                {displayHosts.slice(6).map((user, index) => (
                  <UserCard key={user.id} user={user} index={index + 6} />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 px-6 min-h-[60vh]">
            {/* Text content only - no icons */}
            <div className="text-center relative z-10">
              <h3 className="text-lg font-semibold text-white mb-2">
                {subTab === "live" ? "No Live Streams" : "No Hosts Available"}
              </h3>
              <p className="text-sm text-white/60 max-w-[200px]">
                {getEmptyMessage()}
              </p>
            </div>
            
            {/* Refresh hint */}
            <p className="mt-4 text-xs text-white/40">
              Pull down to refresh
            </p>
          </div>
        )}
      </main>
      </NativePullToRefresh>
      </div>

      {/* Bottom Navigation */}
      <BottomNavigation activeTab={activeTab} onTabChange={handleTabChange} />

      {/* Full-Screen Promo Banners on Entry */}
      <FullScreenPromoBanners />

      {/* Notification Sheet */}
      <Sheet open={showNotifications} onOpenChange={setShowNotifications}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Notifications</SheetTitle>
          </SheetHeader>
          <NotificationList 
            onClose={() => setShowNotifications(false)} 
            compact={false}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default Index;
