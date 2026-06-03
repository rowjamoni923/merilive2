import { useState, useEffect, useMemo, useCallback, useRef, memo } from "react";
import { useNavigate } from "react-router-dom";
import { BottomNavigation } from "@/components/layout/BottomNavigation";
import { DynamicBanner } from "@/components/home/DynamicBanner";
import { FullScreenPromoBanners } from "@/components/home/FullScreenPromoBanners";


import { Search, Eye, Trophy } from "lucide-react";
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
import { CountryFlag } from "@/components/common/CountryFlag";
import { CallButton } from "@/features/call";
import { NativePullToRefresh } from "@/components/common/NativePullToRefresh";
import { warmLiveKitToken } from "@/services/livekitService";
import { subscribeToTables } from "@/hooks/useUniversalRealtime";
import { enhanceThumbnail } from "@/utils/enhanceThumbnail";
import { normalizeProfileMediaUrl } from "@/utils/profileMediaUrl";

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
  last_seen_at?: string | null;
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
 * - If profile has uploaded avatar → use it.
 * - If viewer IS the profile owner → show raw empty (no placeholder, nudges
 *   them to upload). DEFAULT_AVATAR keeps the gray slot.
 * - Otherwise → stable AI placeholder: female pool for hosts/female profiles,
 *   male pool for male profiles.
 */
function resolveFeedAvatar(
  profileId: string,
  avatarUrl: string | null | undefined,
  viewerId: string | null,
  gender: "female" | "male" | null | undefined,
): string {
  const normalizedAvatar = normalizeProfileMediaUrl(avatarUrl) || avatarUrl;
  if (normalizedAvatar && normalizedAvatar.trim().length > 0) return normalizedAvatar;
  const isOwner = !!viewerId && viewerId === profileId;
  if (isOwner) return DEFAULT_AVATAR;
  return getDisplayAvatar(profileId, null, { gender: gender === "male" ? "male" : "female" });
}

const ACTIVE_HEARTBEAT_WINDOW_MS = 30 * 60 * 1000;

function hasFreshHeartbeat(lastSeenAt?: string | null): boolean {
  if (!lastSeenAt) return false;
  const lastSeen = new Date(lastSeenAt).getTime();
  return Number.isFinite(lastSeen) && Date.now() - lastSeen <= ACTIVE_HEARTBEAT_WINDOW_MS;
}

function normalizePresenceForDisplay<T extends Partial<Profile>>(host: T): T {
  const isManuallyOffline = String(host.host_availability || "online").toLowerCase() === "offline";
  return {
    ...host,
    is_online: host.is_online === true && !isManuallyOffline && hasFreshHeartbeat(host.last_seen_at),
  };
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
    refetchOnMount: false,
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
  const isEligibleCachedHost = useCallback((host: (Partial<Profile> & { isLive?: boolean; is_in_call?: boolean }) | null | undefined) => {
    if (!host) return false;
    const baseOk = host.is_host === true
      && (host.gender === "female" || host.gender === "Female")
      && host.host_status === "approved"
      && host.is_face_verified === true
      && host.host_availability !== "offline";
    if (!baseOk) return false;
    // Pkg368: only show online / live / busy hosts; hide offline from home feed.
    const lastSeen = host.last_seen_at ? new Date(host.last_seen_at).getTime() : 0;
    const isReallyOnline = host.is_online === true && lastSeen >= Date.now() - 30 * 60 * 1000;
    return isReallyOnline || host.isLive === true || host.is_in_call === true;
  }, []);
  const [instantHosts, setInstantHosts] = useState<Array<Profile & { isLive?: boolean; liveStreamId?: string; liveThumbnailUrl?: string | null }>>(() => {
    try {
      if (typeof window === "undefined") return [];
      // Pkg369: bump cache key to invalidate pre-Pkg368 snapshots that may
      // still contain hosts marked is_online=true even though server now
      // considers them offline (heartbeat>30min OR availability='offline').
      window.sessionStorage.removeItem("index-hosts-instant-cache-v1");
      const raw = window.sessionStorage.getItem("index-hosts-instant-cache-v2");
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.map(normalizePresenceForDisplay).filter(isEligibleCachedHost)
        : [];
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
    staleTime: 1000 * 10,
    gcTime: 1000 * 120,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    queryFn: async () => {
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
      const profiles = baseProfiles.map(normalizePresenceForDisplay);

      // Map results
      const hostsWithStatus = profiles.map(profile => {
        const streamData = liveStreamMap.get(profile.id);
        // Busy/callable status is server-derived by get_public_home_hosts_v1.
        // Do not query private_calls from the home page: its RLS is participant-only.
        const isActuallyBusy = !!profile.is_in_call;
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
        window.sessionStorage.setItem("index-hosts-instant-cache-v2", JSON.stringify(snapshot));
      } else {
        window.sessionStorage.removeItem("index-hosts-instant-cache-v2");
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
      .flatMap((host) => [host.avatar_url, host.liveThumbnailUrl].map((url) => normalizeProfileMediaUrl(url) || url).filter(Boolean))
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

  // Route-local safety net: keep the home host feed live for stream/call status changes.
  useEffect(() => {
    let invalidateTimer: ReturnType<typeof setTimeout> | null = null;

    const queueHomeInvalidate = () => {
      if (invalidateTimer) clearTimeout(invalidateTimer);
      invalidateTimer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["index-hosts-v4"], refetchType: "active" });
        queryClient.invalidateQueries({ queryKey: ["host-countries"], refetchType: "active" });
      }, 300); // Reduced from 500ms to 300ms for near-instant feel
    };

    // Realtime push: LIVE via live_streams, Busy via private_calls, Online/Offline via profiles
    // (heartbeat is_online + manual host_availability toggle). Debounced 300ms — push, not poll.
    const unsubscribe = subscribeToTables(
      `home-hosts-${Date.now()}`,
      ["live_streams", "private_calls", "party_rooms", "profiles"],
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
      if (user.isLive) return "border-danger/60";
      if (displayLevel >= 40) return "border-warning/55";
      if (displayLevel >= 20) return "border-brand/45";
      if (displayLevel >= 10) return "border-info/45";
      return "border-border";
    };

    const getCardShadow = (): string => {
      if (user.isLive)
        return '0 10px 24px -8px hsl(var(--danger) / 0.35), 0 4px 10px -4px rgba(15,23,42,0.12), inset 0 1px 0 rgba(255,255,255,0.6)';
      if (displayLevel >= 40)
        return '0 10px 24px -8px hsl(var(--warning) / 0.32), 0 4px 10px -4px rgba(15,23,42,0.1), inset 0 1px 0 rgba(255,255,255,0.6)';
      if (displayLevel >= 20)
        return '0 8px 20px -8px hsl(var(--brand) / 0.28), 0 3px 8px -3px rgba(15,23,42,0.08), inset 0 1px 0 rgba(255,255,255,0.55)';
      return '0 6px 16px -6px rgba(15,23,42,0.14), 0 2px 4px -2px rgba(15,23,42,0.06), inset 0 1px 0 rgba(255,255,255,0.55)';
    };

    return (
      <div
        onClick={() => handleUserClick(user.id, user.isLive || false, user.liveStreamId)}
        className={cn(
          "relative overflow-hidden rounded-2xl cursor-pointer group active:scale-[0.97] transition-all duration-300 hover:-translate-y-0.5",
          "bg-card border",
          getBorderGlow()
        )}
        style={{ contain: 'layout style paint', boxShadow: getCardShadow() }}
      >

        <div className="relative aspect-[3/4] bg-muted overflow-hidden">
          {/* Show live thumbnail when host is streaming, otherwise avatar */}
          <img 
            src={(() => {
              const normalizedLiveThumb = normalizeProfileMediaUrl(user.liveThumbnailUrl) || user.liveThumbnailUrl;
              return (user.isLive && normalizedLiveThumb)
                ? enhanceThumbnail(normalizedLiveThumb, { width: 600, quality: 90, sharpen: 1.4 })
                : resolveFeedAvatar(user.id, user.avatar_url, currentUserId, (user.is_host || user.gender === 'female') ? 'female' : (user.gender === 'male' ? 'male' : 'female'));
            })()}
            alt={user.display_name || 'User'}
            className="w-full h-full object-cover bg-muted"
            style={{ filter: user.isLive && user.liveThumbnailUrl ? 'brightness(1.04) contrast(1.10) saturate(1.18)' : undefined }}
            loading="eager"
            {...({ fetchpriority: index < 12 ? "high" : "auto" } as any)}
            decoding={index < 12 ? "sync" : "async"}
            onError={(e) => {
              const img = e.currentTarget;
              const normalizedLiveThumb = normalizeProfileMediaUrl(user.liveThumbnailUrl) || user.liveThumbnailUrl;
              // 1st fallback: live thumbnail raw URL if CDN proxy failed.
              if (user.isLive && normalizedLiveThumb && img.src !== normalizedLiveThumb) {
                img.src = normalizedLiveThumb;
                return;
              }
              // 2nd fallback: stable AI placeholder (gender-aware) so the
              // card never renders blank. Owners still see DEFAULT_AVATAR.
              const isOwner = !!currentUserId && currentUserId === user.id;
              const gender: 'female' | 'male' = (user.is_host || user.gender === 'female')
                ? 'female'
                : (user.gender === 'male' ? 'male' : 'female');
              const fallback = isOwner ? DEFAULT_AVATAR : getDisplayAvatar(user.id, null, { gender });
              if (img.src !== fallback && !img.dataset.fellBack) {
                img.dataset.fellBack = "1";
                img.src = fallback;
              }

            }}
          />

          {/* Lightweight gradient overlay - single layer */}
          <div className="absolute inset-0 bg-gradient-to-t from-foreground/80 via-foreground/10 to-transparent" />

          {/* Live Badge + Viewer Count */}
          {user.isLive && (
            <>
              <div className="absolute top-2.5 left-2">
                <div
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-danger to-primary"
                  style={{ boxShadow: '0 6px 14px -4px hsl(var(--danger) / 0.55), inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 0 rgba(0,0,0,0.18)' }}
                >
                  <span className="w-1.5 h-1.5 bg-primary-foreground rounded-full animate-pulse" />
                  <span className="text-[10px] font-extrabold text-on-dark tracking-wider">LIVE</span>
                </div>
              </div>
              {/* Viewer Count */}
              {(user.viewerCount ?? 0) > 0 && (
                <div className="absolute top-2.5 right-2">
                  <div
                    className="flex items-center gap-1 bg-foreground/65 backdrop-blur-md rounded-full px-2 py-1"
                    style={{ boxShadow: '0 3px 8px -2px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.15)' }}
                  >
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
              <div
                className={cn(
                  "w-2.5 h-2.5 rounded-full ring-2 ring-primary-foreground/90",
                  isActuallyBusy ? "bg-warning" : "bg-success animate-pulse"
                )}
                style={{
                  boxShadow: isActuallyBusy
                    ? '0 0 0 1px rgba(0,0,0,0.05), 0 2px 6px hsl(var(--warning) / 0.6)'
                    : '0 0 0 1px rgba(0,0,0,0.05), 0 2px 6px hsl(var(--success) / 0.65)'
                }}
              />
            </div>
          )}

          {/* VIP/Verified Badge */}
          {(user.is_verified || user.is_face_verified) && (
            <div className="absolute top-2.5 right-2">
              <div
                className="w-6 h-6 bg-gradient-to-br from-info to-primary rounded-full flex items-center justify-center border border-primary-foreground/40"
                style={{ boxShadow: '0 4px 10px -2px hsl(var(--info) / 0.45), inset 0 1px 0 rgba(255,255,255,0.4), inset 0 -1px 0 rgba(0,0,0,0.15)' }}
              >
                <svg className="w-3 h-3 text-on-dark drop-shadow" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
          )}


          {/* Bottom Info */}
          <div className="absolute bottom-0 left-0 right-0 p-2.5">
            <div className="flex items-center gap-2">
              <div className="relative flex-shrink-0">
                <div className="ring-1 ring-primary-foreground/30 rounded-full">
                  <AvatarWithFrame
                    userId={user.id}
                    src={resolveFeedAvatar(user.id, user.avatar_url, currentUserId, (user.is_host || user.gender === 'female') ? 'female' : (user.gender === 'male' ? 'male' : 'female'))}
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
                  <CountryFlag
                    code={user.country_code}
                    emoji={user.country_flag}
                    className="w-[16px] h-[11px] drop-shadow-md"
                  />
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
    <div className="fixed inset-0 flex flex-col bg-background overflow-hidden" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      {/* Header */}
      <header
        className="shrink-0 bg-card/95 backdrop-blur-md border-b border-border"
        style={{ zIndex: 40, boxShadow: '0 4px 12px -6px rgba(15,23,42,0.08), inset 0 1px 0 rgba(255,255,255,0.7)' }}
      >
        <div className="flex items-center justify-center px-2 py-2.5 relative gap-2">
          {/* Search Button - Left Side */}
          <button
            aria-label="Search"
            onClick={() => navigate('/search')}
            className="shrink-0 h-9 w-9 rounded-full flex items-center justify-center active:scale-95 touch-manipulation transition-all duration-200 bg-card border border-border hover:-translate-y-0.5"
            style={{ boxShadow: '0 4px 10px -3px rgba(15,23,42,0.12), inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 0 rgba(15,23,42,0.04)' }}
          >
            <Search className="w-[18px] h-[18px] text-heading" strokeWidth={2.5} />
          </button>

          {/* Sub Tabs - Flex with min-width so they never collide with side buttons */}
          <div
            className="flex-1 min-w-0 flex items-center justify-center gap-0.5 bg-muted rounded-full p-0.5 border border-border overflow-hidden"
            style={{ boxShadow: 'inset 0 2px 4px rgba(15,23,42,0.06), inset 0 -1px 0 rgba(255,255,255,0.5)' }}
          >
            {(["popular", "live", "new", "following"] as SubTab[]).map((tab) => {
              const labels: Record<SubTab, string> = { popular: "Popular", live: "Live", new: "New", following: "Follow" };
              const isActive = subTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => {
                    setSubTab(tab);
                  }}
                  className={cn(
                    "flex-1 min-w-0 px-1.5 py-1 rounded-full text-[11px] font-semibold transition-all duration-200 active:scale-95 touch-manipulation flex items-center justify-center gap-1 whitespace-nowrap",
                    isActive ? "bg-gradient-primary text-on-dark" : "text-muted-pro hover:text-foreground"
                  )}
                  style={isActive ? { boxShadow: '0 4px 10px -2px hsl(var(--primary) / 0.45), inset 0 1px 0 rgba(255,255,255,0.3), inset 0 -1px 0 rgba(0,0,0,0.12)' } : undefined}
                >
                  {tab === "live" && <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", isActive ? "bg-primary-foreground" : "bg-danger animate-pulse")} />}
                  <span className="truncate">{labels[tab]}</span>
                </button>
              );
            })}
          </div>

          {/* Leaderboard Button - Right Side */}
          <button
            aria-label="Leaderboard"
            onClick={() => navigate('/leaderboard')}
            className="shrink-0 h-9 w-9 rounded-full flex items-center justify-center active:scale-95 touch-manipulation transition-all duration-200 bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200/70 hover:-translate-y-0.5"
            style={{ boxShadow: '0 4px 12px -3px rgba(217,119,6,0.25), inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 0 rgba(146,64,14,0.08)' }}
          >
            <Trophy className="w-[18px] h-[18px] text-amber-600" strokeWidth={2.5} fill="currentColor" />
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
                    "flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-all duration-200 whitespace-nowrap active:scale-95 touch-manipulation border",
                    selectedCountry === country.code
                      ? "bg-gradient-primary text-on-dark border-transparent"
                      : "bg-card text-heading border-border hover:bg-muted hover:-translate-y-0.5"
                  )}
                  style={
                    selectedCountry === country.code
                      ? { boxShadow: '0 4px 12px -2px hsl(var(--primary) / 0.45), inset 0 1px 0 rgba(255,255,255,0.3), inset 0 -1px 0 rgba(0,0,0,0.12)' }
                      : { boxShadow: '0 2px 4px -2px rgba(15,23,42,0.08), inset 0 1px 0 rgba(255,255,255,0.7)' }
                  }
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
                className="aspect-[3/4] rounded-2xl bg-gradient-to-br from-muted via-muted/60 to-muted animate-pulse border border-border"
                style={{ boxShadow: '0 4px 12px -4px rgba(15,23,42,0.08), inset 0 1px 0 rgba(255,255,255,0.5)' }}
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
