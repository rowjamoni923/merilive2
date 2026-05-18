import { useState, useEffect, useMemo, useCallback, useRef, memo } from "react";
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
import { subscribeToTables } from "@/hooks/useUniversalRealtime";
import { enhanceThumbnail } from "@/utils/enhanceThumbnail";

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

import { getDisplayAvatar } from "@/utils/placeholderAvatar";

/**
 * Resolve the card avatar for the homepage feed.
 * - If host has uploaded avatar → use it.
 * - If viewer is the host themselves (own card) → show raw (no placeholder)
 *   so they know to upload one.
 * - Otherwise (other viewers, including main owner viewing other hosts) → use
 *   stable AI placeholder so the card never appears blank.
 */
function resolveFeedAvatar(
  hostId: string,
  avatarUrl: string | null | undefined,
  viewerId: string | null,
  isHost: boolean
): string {
  if (avatarUrl && avatarUrl.trim().length > 0) return avatarUrl;
  if (isHost) return getDisplayAvatar(hostId, avatarUrl);
  return DEFAULT_AVATAR;
}

type SubTab = "popular" | "live" | "new" | "following";

const Index = () => {
  const navigate = useNavigate();
  const { startCall } = useCall();
  const queryClient = useQueryClient();
  

  const handlePullRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["index-hosts-v4"] });
  }, [queryClient]);
  // Country chips — show the full supported country set (same as Party Discover)
  // so every country is always reachable, even before its first host signs up.
  // Any extra country that appears in the DB is merged in dynamically.
  const STATIC_COUNTRIES = useMemo(() => ([
    { code: "BD", name: "Bangladesh", flag: "🇧🇩" },
    { code: "IN", name: "India", flag: "🇮🇳" },
    { code: "PK", name: "Pakistan", flag: "🇵🇰" },
    { code: "NP", name: "Nepal", flag: "🇳🇵" },
    { code: "PH", name: "Philippines", flag: "🇵🇭" },
    { code: "ID", name: "Indonesia", flag: "🇮🇩" },
  ]), []);

  const { data: dynamicCountries } = useQuery({
    queryKey: ["host-countries"],
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 60,
    refetchOnMount: true,
    queryFn: async () => {
      const { data } = await supabase.rpc('get_public_host_countries_v1' as any);
      if (!data) return [] as Array<{ code: string; flag: string; name: string }>;
      const countryMap = new Map<string, string>();
      (data as any[]).forEach((p: any) => {
        if (p?.country_code && p?.country_flag && p.country_flag !== 'NONE') {
          countryMap.set(p.country_code, p.country_flag);
        }
      });
      return Array.from(countryMap.entries()).map(([code, flag]) => {
        const countryInfo = getCountryByCode(code);
        return { code, flag, name: countryInfo?.name || code };
      });
    },
  });

  const countries = useMemo(() => {
    const allOption = { code: "all", name: "All", flag: "🌍" };
    const map = new Map<string, { code: string; name: string; flag: string }>();
    STATIC_COUNTRIES.forEach((c) => map.set(c.code, c));
    (dynamicCountries || []).forEach((c) => {
      if (!map.has(c.code)) map.set(c.code, c);
    });
    const list = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
    return [allOption, ...list];
  }, [STATIC_COUNTRIES, dynamicCountries]);

  const [activeTab, setActiveTab] = useState("/");
  const [subTab, setSubTab] = useState<SubTab>("popular");
  const [selectedCountry, setSelectedCountry] = useState("all");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const warmedHostImagesRef = useRef<Set<string>>(new Set());
  const isEligibleCachedHost = useCallback((host: Partial<Profile> | null | undefined) => {
    if (!host) return false;
    return host.is_host === true
      && (host.gender === "female" || host.gender === "Female")
      && host.host_status === "approved"
      && host.is_face_verified === true
      && host.host_availability !== "offline";
  }, []);
  const [instantHosts, setInstantHosts] = useState<Array<Profile & { isLive?: boolean; liveStreamId?: string; liveThumbnailUrl?: string | null }>>(() => {
    try {
      if (typeof window === "undefined") return [];
      const raw = window.sessionStorage.getItem("index-hosts-instant-cache-v1");
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(isEligibleCachedHost) : [];
    } catch {
      return [];
    }
  });

  // Get current user from cached auth only — call pricing now comes from the centralized settings layer
  useEffect(() => {
    const rafId = requestAnimationFrame(() => {
      void import('@/utils/cachedAuth')
        .then(({ getCachedUser }) => getCachedUser())
        .then((cachedUser) => {
          if (cachedUser) setCurrentUserId(cachedUser.id);
        })
        .catch(() => undefined);
    });

    return () => cancelAnimationFrame(rafId);
  }, []);

  // Fetch hosts based on subTab - Optimized for speed
  const { data: hosts, isLoading } = useQuery({
    queryKey: ["index-hosts-v4", selectedCountry, subTab, currentUserId],
    staleTime: 1000 * 30,
    gcTime: 1000 * 120,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const sixtyMinutesAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      // ⚡ PARALLEL FETCH: All independent queries at once
      const liveStreamsRes = await supabase
        .from("live_streams")
        .select("id, host_id, title, viewer_count, thumbnail_url, started_at")
        .eq("is_active", true);

      const liveStreamMap = new Map(liveStreamsRes.data?.map(s => [s.host_id, s]) || []);
      const liveHostIds = Array.from(liveStreamMap.keys());

      if (subTab === "live" && liveHostIds.length === 0) return [];

      // Fetch public-safe host rows through SECURITY DEFINER RPC.
      // profiles_public is security_invoker, so normal users cannot see other
      // users' base profile rows after public SELECT was correctly removed.
      const profilesRes = await supabase.rpc('get_public_home_hosts_v1' as any, {
        p_selected_country: selectedCountry,
        p_sub_tab: subTab,
        p_current_user_id: currentUserId,
      });

      if (profilesRes.error) throw profilesRes.error;
      const baseProfiles = (profilesRes.data || []) as any[];
      const profiles = baseProfiles;

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
    if (!hosts) return;

    const snapshot = hosts
      .filter((host) => isEligibleCachedHost(host))
      .slice(0, 100);

    setInstantHosts(snapshot as Array<Profile & { isLive?: boolean; liveStreamId?: string; liveThumbnailUrl?: string | null }>);

    try {
      if (snapshot.length > 0) {
        window.sessionStorage.setItem("index-hosts-instant-cache-v1", JSON.stringify(snapshot));
      } else {
        window.sessionStorage.removeItem("index-hosts-instant-cache-v1");
      }
    } catch {
      // no-op
    }
  }, [hosts, isEligibleCachedHost]);

  // Only fall back to the cached snapshot for the default view (Popular + All countries).
  // For any other tab/country, always reflect the live query so users see filter changes immediately.
  const isDefaultView = subTab === "popular" && selectedCountry === "all";
  const displayHosts = (hosts ?? (isDefaultView ? instantHosts : [])) as Array<Profile & { isLive?: boolean; liveStreamId?: string; liveThumbnailUrl?: string | null }>;

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

    // Pre-warm avatar URLs + live thumbnail URLs for instant rendering
    const warmableUrls = hosts
      .slice(0, 24)
      .flatMap((host) => [host.avatar_url, host.liveThumbnailUrl].filter(Boolean))
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

  // Route-local safety net: keep the home host feed live even if the global
  // bridge is delayed by lazy loading or reconnect pressure.
  useEffect(() => {
    let invalidateTimer: ReturnType<typeof setTimeout> | null = null;

    const queueHomeInvalidate = () => {
      if (invalidateTimer) clearTimeout(invalidateTimer);
      invalidateTimer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["index-hosts-v4"], refetchType: "active" });
        queryClient.invalidateQueries({ queryKey: ["host-countries"], refetchType: "active" });
      }, 200);
    };

    const unsubscribe = subscribeToTables(
      `home-hosts-${Date.now()}`,
      ["profiles", "live_streams", "private_calls", "party_rooms", "party_room_participants"],
      queueHomeInvalidate
    );

    return () => {
      if (invalidateTimer) clearTimeout(invalidateTimer);
      unsubscribe();
    };
  }, [queryClient]);

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
      if (user.isLive) return "shadow-[0_4px_18px_-4px_rgba(239,68,68,0.45)] border-red-300";
      if (displayLevel >= 40) return "shadow-[0_4px_18px_-6px_rgba(245,158,11,0.40)] border-amber-200";
      if (displayLevel >= 20) return "shadow-[0_4px_18px_-6px_rgba(168,85,247,0.32)] border-purple-200";
      if (displayLevel >= 10) return "shadow-[0_4px_18px_-6px_rgba(59,130,246,0.28)] border-blue-200";
      return "border-slate-200 shadow-[0_4px_14px_-8px_rgba(15,23,42,0.18)]";
    };

    
    return (
      <div
        onClick={() => handleUserClick(user.id, user.isLive || false, user.liveStreamId)}
        className={cn(
          "relative overflow-hidden rounded-2xl cursor-pointer group active:scale-[0.97]",
          "bg-white border",
          getBorderGlow()
        )}
        style={{ contain: 'layout style paint' }}
      >
        <div className="relative aspect-[3/4]">
          {/* Show live thumbnail when host is streaming, otherwise avatar */}
          <img
            src={(user.isLive && user.liveThumbnailUrl)
              ? enhanceThumbnail(user.liveThumbnailUrl, { width: 600, quality: 90, sharpen: 1.4 })
              : resolveFeedAvatar(user.id, user.avatar_url, currentUserId, !!(user.is_host || user.gender === 'female'))}
            alt={user.display_name || 'User'}
            className="w-full h-full object-cover"
            style={{ filter: user.isLive && user.liveThumbnailUrl ? 'brightness(1.04) contrast(1.10) saturate(1.18)' : undefined }}
            loading={index < 6 ? "eager" : "lazy"}
            {...({ fetchpriority: index < 4 ? "high" : "auto" } as any)}
            decoding="async"
            onError={(e) => {
              const img = e.currentTarget;
              if (user.isLive && user.liveThumbnailUrl && img.src !== user.liveThumbnailUrl) {
                img.src = user.liveThumbnailUrl;
              }
            }}
          />

          {/* Lightweight gradient overlay - single layer */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />

          {/* Live Badge + Viewer Count */}
          {user.isLive && (
            <>
              <div className="absolute top-2.5 left-2">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-red-500 to-rose-500 shadow-[0_2px_12px_rgba(239,68,68,0.5)]">
                  <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                  <span className="text-[10px] font-extrabold text-on-dark tracking-wider">LIVE</span>
                </div>
              </div>
              {/* Viewer Count */}
              {(user.viewerCount ?? 0) > 0 && (
                <div className="absolute top-2.5 right-2">
                  <div className="flex items-center gap-1 bg-black/60 backdrop-blur-sm rounded-full px-2 py-1">
                    <Eye className="w-3 h-3 text-on-dark" />
                    <span className="text-[10px] text-on-dark font-bold">{user.viewerCount}</span>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Online / Busy Indicator - subtle dot only, no text (industry standard) */}
          {!user.isLive && user.is_online && (
            <div className="absolute top-2.5 left-2">
              <div className={cn(
                "w-2.5 h-2.5 rounded-full ring-2 ring-white/80 shadow-md",
                isActuallyBusy
                  ? "bg-amber-500"
                  : "bg-emerald-500 animate-pulse"
              )} />
            </div>
          )}

          {/* VIP/Verified Badge */}
          {(user.is_verified || user.is_face_verified) && (
            <div className="absolute top-2.5 right-2">
              <div className="w-6 h-6 bg-gradient-to-br from-blue-400 to-cyan-500 rounded-full flex items-center justify-center shadow-[0_2px_10px_rgba(59,130,246,0.5)] border border-white/30">
                <svg className="w-3 h-3 text-on-dark" fill="currentColor" viewBox="0 0 20 20">
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
                    src={resolveFeedAvatar(user.id, user.avatar_url, currentUserId, !!(user.is_host || user.gender === 'female'))}
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
                <p className="text-on-dark font-bold text-[13px] truncate" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.6)' }}>
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
    <div className="fixed inset-0 flex flex-col bg-[#F7F8FA] overflow-hidden" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      {/* Header — clean white, hairline border, dark icons */}
      <header
        className="shrink-0"
        style={{
          zIndex: 40,
          background: '#ffffff',
          borderBottom: '1px solid rgba(15, 23, 42, 0.06)',
        }}
      >
        <div className="flex items-center justify-center px-3 py-2.5 relative">
          {/* Search Button - Left Side (icon only, matches home white theme) */}
          <button
            aria-label="Search"
            onClick={() => navigate('/search')}
            className="absolute left-3 h-9 w-9 rounded-full flex items-center justify-center active:scale-95 touch-manipulation transition-transform"
            style={{
              background: 'linear-gradient(135deg, #ffffff 0%, #f1f5f9 100%)',
              border: '1px solid rgba(15, 23, 42, 0.10)',
              boxShadow: '0 2px 6px -2px rgba(15, 23, 42, 0.12), inset 0 1px 0 rgba(255,255,255,0.9)',
            }}
          >
            <Search className="w-[18px] h-[18px] text-heading" strokeWidth={2.5} />
          </button>

          {/* Sub Tabs - Centered */}
          <div className="flex items-center gap-0.5 bg-slate-100 rounded-full p-0.5 border border-slate-200/70">
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
                    "px-2.5 py-1 rounded-full text-xs font-semibold transition-all active:scale-95 touch-manipulation flex items-center gap-1",
                    isActive ? "text-on-dark shadow-md" : "text-muted-pro hover:text-slate-800"
                  )}
                  style={isActive ? { background: gradients[tab] } : undefined}
                >
                  {tab === "live" && <span className={cn("w-1.5 h-1.5 rounded-full", isActive ? "bg-white" : "bg-red-500 animate-pulse")} />}
                  {labels[tab]}
                </button>
              );
            })}
          </div>

          {/* Leaderboard Button - Right Side (icon only, white theme + gold trophy accent) */}
          <button
            aria-label="Leaderboard"
            onClick={() => navigate('/leaderboard')}
            className="absolute right-3 h-9 w-9 rounded-full flex items-center justify-center active:scale-95 touch-manipulation transition-transform"
            style={{
              background: 'linear-gradient(135deg, #ffffff 0%, #f1f5f9 100%)',
              border: '1px solid rgba(15, 23, 42, 0.10)',
              boxShadow: '0 2px 6px -2px rgba(15, 23, 42, 0.12), inset 0 1px 0 rgba(255,255,255,0.9)',
            }}
          >
            <Trophy className="w-[18px] h-[18px] text-amber-500" strokeWidth={2.5} fill="rgba(245, 158, 11, 0.18)" />
          </button>
        </div>

        {/* Country Filter - Compact */}
        <div className="px-2 pb-2 overflow-x-auto scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
            <div className="flex gap-1.5 w-max">
              {countries.map((country) => (
                <button
                  key={country.code}
                  onClick={() => setSelectedCountry(country.code)}
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-all whitespace-nowrap active:scale-95 touch-manipulation border",
                    selectedCountry === country.code
                      ? "text-on-dark shadow-md border-transparent"
                      : "bg-white text-heading border-slate-200 hover:bg-slate-50"
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
        ) : isLoading ? (
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="aspect-[3/4] rounded-2xl bg-slate-200 animate-pulse border border-slate-200"
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 px-6 min-h-[60vh]">
            {/* Text content only - no icons */}
            <div className="text-center relative z-10">
              <h3 className="text-lg font-bold text-display mb-2">
                {subTab === "live" ? "No Live Streams" : "No Hosts Available"}
              </h3>
              <p className="text-sm text-muted-pro max-w-[220px]">
                {getEmptyMessage()}
              </p>
            </div>

            {/* Refresh hint */}
            <p className="mt-4 text-xs text-muted-pro">
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
