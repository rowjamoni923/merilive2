import { useState, useEffect, useMemo, useCallback, useRef, memo, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { BottomNavigation } from "@/components/layout/BottomNavigation";
import { DynamicBanner } from "@/components/home/DynamicBanner";
import ErrorBoundary from "@/components/ErrorBoundary";
import { lazyRetry } from "@/utils/lazyRetry";

const FullScreenPromoBanners = lazy(lazyRetry(() => import("@/components/home/FullScreenPromoBanners").then(m => ({ default: m.FullScreenPromoBanners }))));
const FloatingRandomMatchPill = lazy(() => import("@/components/match/FloatingRandomMatchPill"));


import { Search, Eye, Radio, Sparkles, Heart, Compass, RefreshCcw } from "lucide-react";
import championTrophy3d from "@/assets/champion-trophy-3d.png";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

import { useCall } from "@/components/call/CallContext";
const NotificationList = lazy(() => import("@/components/notifications/NotificationList").then(m => ({ default: m.NotificationList })));
import AvatarWithFrame, { preloadFrames } from "@/components/common/AvatarWithFrame";
import { getCountryByCode } from "@/data/countryCodes";
import { LevelBadge } from "@/components/common/LevelBadge";
import { CountryFlag } from "@/components/common/CountryFlag";
import { CallButton } from "@/components/call/CallButton";
import { NativePullToRefresh } from "@/components/common/NativePullToRefresh";
import { warmLiveKitToken } from "@/services/livekitService";
import { subscribeToTables } from "@/hooks/useUniversalRealtime";
import { enhanceThumbnail } from "@/utils/enhanceThumbnail";
import { normalizeProfileMediaUrl } from "@/utils/profileMediaUrl";
import { useNativeImagePrefetch } from "@/hooks/useNativeImagePrefetch";
import { useNativeFeed } from "@/hooks/useNativeFeed";
import type { NativeFeedCard } from "@/plugins/NativeFeed";
import { getConnectionTier } from "@/utils/connectionProfile";

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
  liveStartedAt?: string | null;
  activePartyRoomId?: string | null;
  is_in_party?: boolean | null;
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
    // Show ALL approved + face-verified female hosts on home — online at top,
    // offline at bottom (client-side sort handles ordering). Chamet/Bigo parity.
    return host.is_host === true
      && (host.gender === "female" || host.gender === "Female")
      && host.host_status === "approved"
      && host.is_face_verified === true;
  }, []);
  const [instantHosts, setInstantHosts] = useState<Array<Profile & { isLive?: boolean; liveStreamId?: string; liveThumbnailUrl?: string | null }>>(() => {
    try {
      if (typeof window === "undefined") return [];
      // Persist the first-screen home snapshot across Android process kills so
      // the feed paints instantly from disk while the live RPC refreshes.
      window.sessionStorage.removeItem("index-hosts-instant-cache-v1");
      const raw = window.localStorage.getItem("index-hosts-instant-cache-v3")
        || window.localStorage.getItem("index-hosts-instant-cache-v2")
        || window.sessionStorage.getItem("index-hosts-instant-cache-v2");
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : parsed?.hosts;
      return Array.isArray(list)
        ? list.map(normalizePresenceForDisplay).filter(isEligibleCachedHost)
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
  const { data: hosts } = useQuery({
    queryKey: ["index-hosts-v4", selectedCountry, subTab, currentUserId],
    staleTime: 1000 * 30, // Increased staleTime for better cache hits
    gcTime: 1000 * 300,  // Keep in memory longer
    refetchOnMount: false, // Don't refetch on every mount if we have data
    refetchOnWindowFocus: false,
    queryFn: async () => {
      // Fetch public-safe host rows through SECURITY DEFINER RPC.
      // profiles_public is security_invoker, so normal users cannot see other
      // users' base profile rows after public SELECT was correctly removed.
      const profilesRes = await supabase.rpc('get_public_home_hosts_v2' as any, {
        p_selected_country: selectedCountry,
        p_sub_tab: subTab,
        p_current_user_id: currentUserId,
      });

      if (profilesRes.error) throw profilesRes.error;
      const baseProfiles = (profilesRes.data || []) as any[];
      const profiles = baseProfiles.map(normalizePresenceForDisplay);

      // Map results
      const hostsWithStatus = profiles.map(profile => {
        // Busy/callable/live/party status is server-derived by get_public_home_hosts_v2.
        // Do not query private_calls from the home page: its RLS is participant-only.
        const isActuallyBusy = !!profile.is_in_call;
        return {
          ...profile,
          is_in_call: isActuallyBusy,
          actuallyBusy: isActuallyBusy,
          isLive: !!profile.live_stream_id,
          liveStreamId: profile.live_stream_id || undefined,
          viewerCount: profile.live_viewer_count || 0,
          liveThumbnailUrl: profile.live_thumbnail_url || null,
          liveStartedAt: profile.live_started_at || null,
          activePartyRoomId: profile.active_party_room_id || null,
          is_in_party: profile.is_in_party || false,
          startedAt: profile.live_started_at || new Date().toISOString(),
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
        window.localStorage.setItem("index-hosts-instant-cache-v3", JSON.stringify({ at: Date.now(), hosts: snapshot }));
      } else {
        window.localStorage.removeItem("index-hosts-instant-cache-v3");
      }
    } catch {
      // no-op
    }
  }, [hosts, isEligibleCachedHost]);

  // Only fall back to the cached snapshot for the default view (Popular + All countries).
  // For any other tab/country, always reflect the live query so users see filter changes immediately.
  const isDefaultView = subTab === "popular" && selectedCountry === "all";
  const displayHosts = (hosts ?? (isDefaultView ? instantHosts : [])) as Array<Profile & { isLive?: boolean; liveStreamId?: string; liveThumbnailUrl?: string | null }>;

  const getHostCardImageUrl = useCallback((host: Partial<Profile> & { isLive?: boolean; liveThumbnailUrl?: string | null }) => {
    const normalizedLiveThumb = normalizeProfileMediaUrl(host.liveThumbnailUrl) || host.liveThumbnailUrl;
    if (host.isLive && normalizedLiveThumb) {
      return enhanceThumbnail(normalizedLiveThumb, { width: 600, quality: 90, sharpen: 1.4 });
    }

    const avatar = resolveFeedAvatar(
      host.id || "host",
      host.avatar_url,
      currentUserId,
      (host.is_host || host.gender === 'female') ? 'female' : (host.gender === 'male' ? 'male' : 'female')
    );
    return enhanceThumbnail(avatar, { width: 400, quality: 85, sharpen: 1.0 });
  }, [currentUserId]);

  // Pkg428 Phase-9 — native Glide prefetch for first-screen avatars + live
  // thumbnails. No-op on web/iOS or when flag is off. Drastically reduces
  // image jank when killed-cold scroll begins on Android.
  const nativePrefetchUrls = useMemo(
    () => {
      const tier = getConnectionTier();
      const max = tier === "offline" || tier === "slow-2g" || tier === "2g" ? 8 : tier === "3g" ? 30 : 80;
      return displayHosts
        .slice(0, max)
        .map((h) => getHostCardImageUrl(h))
        .filter((u): u is string => !!u);
    },
    [displayHosts, getHostCardImageUrl]
  );
  useNativeImagePrefetch(nativePrefetchUrls);

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

    // Pre-warm avatar URLs + live thumbnail URLs for instant rendering,
    // without flooding weaker/data-saver networks.
    const tier = getConnectionTier();
    const warmImageLimit = tier === "offline" || tier === "slow-2g" || tier === "2g" ? 8 : tier === "3g" ? 30 : 80;
    const warmableUrls = hosts
      .slice(0, warmImageLimit)
      .map((host) => getHostCardImageUrl(host))
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

      if (navigator.serviceWorker?.controller && warmableUrls.length > 0) {
        navigator.serviceWorker.controller.postMessage({ type: 'WARM_IMAGES', urls: warmableUrls });
      }

      warmableUrls.forEach((url) => {
        warmedHostImagesRef.current.add(url);
        const img = new Image();
        try { (img as any).fetchPriority = "high"; } catch {}
        img.decoding = "async";
        img.onload = () => { if (typeof img.decode === "function") img.decode().catch(() => {}); };
        img.src = url;
      });
    }, 40);

    return () => window.clearTimeout(timeoutId);
  }, [hosts, getHostCardImageUrl]);

  // Route-local safety net: keep the home host feed live for stream/call/presence changes.
  useEffect(() => {
    let invalidateTimer: ReturnType<typeof setTimeout> | null = null;
    let profileInvalidateTimer: ReturnType<typeof setTimeout> | null = null;

    const queueHomeInvalidate = () => {
      if (invalidateTimer) clearTimeout(invalidateTimer);
      // 150ms to match Bigo/Tango/Chamet perception threshold (<200ms) for live/call/party.
      invalidateTimer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["index-hosts-v4"], refetchType: "active" });
        queryClient.invalidateQueries({ queryKey: ["host-countries"], refetchType: "active" });
      }, 150);
    };

    // Profile heartbeats fire frequently (every ~2s per active user). Use a longer
    // debounce so the presence flag (is_online / host_availability) still reorders
    // the feed instantly without thrashing the RPC.
    const queueProfileInvalidate = () => {
      if (profileInvalidateTimer) clearTimeout(profileInvalidateTimer);
      profileInvalidateTimer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["index-hosts-v4"], refetchType: "active" });
      }, 600);
    };

    // Realtime push: LIVE via live_streams, Busy via private_calls + random_call_sessions,
    // Party via party_rooms, Online/Offline via profiles (host_availability + is_online).
    const unsubscribeRooms = subscribeToTables(
      `home-hosts-${Date.now()}`,
      ["live_streams", "private_calls", "random_call_sessions", "party_rooms"],
      queueHomeInvalidate
    );

    const unsubscribeProfiles = subscribeToTables(
      `home-hosts-profiles-${Date.now()}`,
      ["profiles"],
      queueProfileInvalidate
    );

    return () => {
      if (invalidateTimer) clearTimeout(invalidateTimer);
      if (profileInvalidateTimer) clearTimeout(profileInvalidateTimer);
      unsubscribeRooms();
      unsubscribeProfiles();
    };
  }, [queryClient]);


  const handleTabChange = (path: string) => {
    setActiveTab(path);
    navigate(path);
  };

  const handleUserClick = useCallback((userId: string, isLive: boolean, liveStreamId?: string) => {
    if (isLive && liveStreamId) {
      import("@/pages/LiveStream").catch(() => {});
      warmLiveKitToken(`live_${liveStreamId}`, "viewer_stream").catch(() => {});
      navigate(`/live/${liveStreamId}`);
    } else {
      // Navigate to profile detail page for non-live users
      navigate(`/profile-detail/${userId}`);
    }
  }, [navigate]);

  // Pkg436 Phase-2 — mirror displayHosts to native RecyclerView grid (Android only,
  // flag-gated). Tap → same handleUserClick route. React grid below stays rendered;
  // the native overlay sits on top when active. No-op on web/iOS/older APKs/flag-off.
  const hostIndexRef = useRef(new Map<string, { isLive: boolean; liveStreamId?: string }>());
  hostIndexRef.current = useMemo(() => {
    const m = new Map<string, { isLive: boolean; liveStreamId?: string }>();
    displayHosts.forEach((u) => m.set(u.id, { isLive: !!u.isLive, liveStreamId: u.liveStreamId }));
    return m;
  }, [displayHosts]);

  const nativeFeedCards = useMemo<NativeFeedCard[]>(
    () =>
      displayHosts.map((u) => {
        const liveThumb = u.isLive ? (normalizeProfileMediaUrl(u.liveThumbnailUrl) || u.liveThumbnailUrl) : null;
        const avatar = normalizeProfileMediaUrl(u.avatar_url) || u.avatar_url;
        return {
          id: u.id,
          title: u.display_name || u.username || "Host",
          subtitle: u.country_flag || u.country_code || undefined,
          thumbUrl: liveThumb || avatar || null,
          liveBadge: !!u.isLive,
          country: u.country_code || null,
        };
      }),
    [displayHosts]
  );

  const { active: nativeFeedActive, setItems: setNativeFeedItems } = useNativeFeed({
    enabled: true,
    title: "Home",
    onTap: (id) => {
      const meta = hostIndexRef.current.get(id);
      if (meta) handleUserClick(id, meta.isLive, meta.liveStreamId);
    },
  });

  useEffect(() => {
    if (!nativeFeedActive) return;
    setNativeFeedItems(nativeFeedCards);
  }, [nativeFeedActive, nativeFeedCards, setNativeFeedItems]);



  const handleCall = async (e: React.MouseEvent, userId: string) => {
    e.stopPropagation();
    await startCall(userId);
  };

  // Render user card - PREMIUM UPGRADED DESIGN.
  // Wrapped in useMemo so memo() actually works: the component identity stays
  // stable across parent re-renders (search input typing, tab indicators, etc.)
  // and only re-renders when user/index props change.
  const UserCard = useMemo(() => memo(({ user, index }: { user: Profile & { isLive?: boolean; liveStreamId?: string; liveThumbnailUrl?: string | null }; index: number }) => {
    const isFemaleHost = user.is_host && (user.gender === 'female' || user.gender === 'Female');
    const displayLevel = isFemaleHost 
      ? (user.host_level ?? 0)
      : (user.user_level ?? 1);
    const isActuallyBusy = user.actuallyBusy ?? !!user.is_in_call;

    const getCardShadow = (): string => {
      if (user.isLive)
        return '0 10px 24px -8px hsl(var(--brand) / 0.24), 0 4px 10px -4px rgba(15,23,42,0.10)';
      if (displayLevel >= 40)
        return '0 10px 24px -8px hsl(var(--warning) / 0.24), 0 4px 10px -4px rgba(15,23,42,0.08)';
      if (displayLevel >= 20)
        return '0 8px 20px -8px hsl(var(--brand) / 0.20), 0 3px 8px -3px rgba(15,23,42,0.06)';
      return '0 6px 16px -6px rgba(15,23,42,0.12), 0 2px 4px -2px rgba(15,23,42,0.05)';
    };

    const cardImageUrl = getHostCardImageUrl(user);

    return (
      <div
        onClick={() => handleUserClick(user.id, user.isLive || false, user.liveStreamId)}
        data-prefetch={user.isLive ? "live" : "profile"}
        data-stream-id={user.liveStreamId}
        className="relative overflow-hidden rounded-2xl cursor-pointer group transition-opacity duration-75 active:opacity-90"
        style={{ contain: 'layout style paint', boxShadow: getCardShadow() }}
      >

        <div className="host-card-media-shell relative aspect-[3/4] overflow-hidden">
          {/* Show the thumbnail as one uninterrupted professional media tile — no letterbox fill, color block, or border. */}
          <img 
            key={cardImageUrl}
            src={cardImageUrl}
            alt={user.display_name || 'User'}
            data-host-card-photo="true"
            className={cn(
              "host-card-photo relative w-full h-full transition-opacity duration-75",
              user.isLive && user.liveThumbnailUrl
                ? "object-cover live-card-kenburns opacity-0"
                : "object-cover"
            )}
            style={{
              filter: user.isLive && user.liveThumbnailUrl ? 'brightness(1.04) contrast(1.10) saturate(1.18)' : undefined,
              opacity: 0,
            }}
            loading="eager"
            {...({ fetchpriority: index < 6 ? "high" : "auto" } as any)}
            decoding="async"
            onLoad={(e) => {
              const img = e.currentTarget;
              const markReady = () => { img.style.opacity = "1"; };
              if (typeof img.decode === "function") img.decode().then(markReady).catch(markReady);
              else markReady();
            }}
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
                img.style.opacity = "1";
              }

            }}
          />


          {/* Full-photo card: no bottom panel, border band, or screen overlay. */}

          {/* Flat Status Badge — Chamet/Bigo industry standard.
              LIVE (red) / BUSY (amber) / ONLINE (green) / OFFLINE (slate).
              Every face-verified host shows a status — no card is ever unlabeled. */}
          {(() => {
            const status: "live" | "busy" | "online" | "offline" = user.isLive
              ? "live"
              : isActuallyBusy
                ? "busy"
                : user.is_online
                  ? "online"
                  : "offline";

            const cfg = {
              live:    { label: "LIVE",    bg: "#ef4444", dot: "#ffffff", pulse: true  },
              busy:    { label: "BUSY",    bg: "#f59e0b", dot: "#ffffff", pulse: false },
              online:  { label: "ONLINE",  bg: "#22c55e", dot: "#ffffff", pulse: true  },
              offline: { label: "OFFLINE", bg: "#64748b", dot: "#e2e8f0", pulse: false },
            }[status];

            return (
              <div className="absolute top-2 left-2 z-10">
                <div
                  className="flex items-center gap-1 px-2 py-[3px] rounded-full"
                  style={{ background: cfg.bg }}
                >
                  <span
                    className={cn("w-[5px] h-[5px] rounded-full", cfg.pulse && "animate-pulse")}
                    style={{ background: cfg.dot }}
                  />
                  <span className="text-[10px] font-semibold tracking-wide text-white leading-none">
                    {cfg.label}
                  </span>
                </div>
              </div>
            );
          })()}


          {/* Live viewer count — flat pill */}
          {user.isLive && (user.viewerCount ?? 0) > 0 && (
            <div className="absolute top-2 right-2">
              <div className="flex items-center gap-1 bg-black/55 rounded-full px-2 py-[3px]">
                <Eye className="w-3 h-3 text-white" />
                <span className="text-[10px] text-white font-semibold leading-none">{user.viewerCount}</span>
              </div>
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


            {/* Bottom Info — floats directly on the photo; no colored panel/border. */}
          <div
            className="absolute bottom-0 left-0 right-0 px-2.5 pb-2.5"
            style={{
              background: 'transparent',
              boxShadow: 'none',
              borderTop: '0',
            }}
          >

            <div className="flex items-center gap-2">
              <div className="relative flex-shrink-0">
                <div className="ring-1 ring-primary-foreground/30 rounded-full">
                  <AvatarWithFrame
                    userId={user.id}
                    src={resolveFeedAvatar(user.id, user.avatar_url, currentUserId, (user.is_host || user.gender === 'female') ? 'female' : (user.gender === 'male' ? 'male' : 'female'))}
                    name={(user as any)?.display_name || "U"}
                    level={displayLevel}
                    isHost={user.gender === 'female' || user.is_host || false}
                    size="xxs"
                    showAnimation={false}
                    frameId={user.frame_id}
                  />
                </div>
              </div>
              
              <div className="flex-1 min-w-0">
                <p className="text-on-dark font-bold text-[13px] truncate" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.75)' }}>
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
  }), [handleUserClick, currentUserId, startCall, getHostCardImageUrl]);

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
    <div data-page="home" className="fixed inset-0 flex flex-col bg-background overflow-hidden" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      {/* Header */}
      <header
        className="shrink-0 bg-card/95 backdrop-blur-md border-b border-border"
        style={{ zIndex: 40, boxShadow: '0 4px 12px -6px rgba(15,23,42,0.08), inset 0 1px 0 rgba(255,255,255,0.7)' }}
      >
        <div className="flex items-center justify-center px-2 py-2.5 relative gap-2">
          {/* Search Button - Left Side */}
          <button
            aria-label="Search"
            data-prefetch-path="/search"
            onClick={() => navigate('/search')}
            className="shrink-0 h-9 w-9 rounded-full flex items-center justify-center active:opacity-90 touch-manipulation transition-opacity duration-75 bg-card border border-border"
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
                    "flex-1 min-w-0 px-1.5 py-1 rounded-full text-[11px] font-semibold transition-opacity duration-75 active:opacity-90 touch-manipulation flex items-center justify-center gap-1 whitespace-nowrap",
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

          {/* Leaderboard Button - compact premium 3D trophy, no disc chrome */}
          <button
            aria-label="Leaderboard"
            data-prefetch-path="/leaderboard"
            onClick={() => navigate('/leaderboard')}
            className="leaderboard-trophy-btn shrink-0 h-11 w-11 flex items-center justify-center active:scale-95 touch-manipulation"
          >
            <img src={championTrophy3d} alt="Leaderboard" className="leaderboard-trophy-img" loading="eager" />
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
                    "flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-opacity duration-75 whitespace-nowrap active:opacity-90 touch-manipulation border",
                    selectedCountry === country.code
                      ? "bg-gradient-primary text-on-dark border-transparent"
                      : "bg-card text-heading border-border hover:bg-muted"
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
      <div
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain"
        style={{
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-y',
          overscrollBehaviorY: 'contain',
        } as React.CSSProperties}
      >
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
          // Mobile-first empty state — Bigo/Chamet pattern: animated glow halo +
          // contextual icon + brand CTA. Replaces the previous text-only block
          // that left a big blank gap on mobile and looked half-loaded.
          <div className="flex flex-col items-center justify-center px-6 py-10 min-h-[55vh]">
            {/* Animated glow + icon */}
            <div className="relative mb-5">
              <div
                className="absolute inset-0 rounded-full blur-2xl opacity-60 animate-pulse"
                style={{ background: 'radial-gradient(circle, hsl(var(--primary) / 0.55), transparent 70%)' }}
                aria-hidden="true"
              />
              <div
                className="relative h-24 w-24 rounded-full flex items-center justify-center bg-gradient-primary"
                style={{
                  boxShadow:
                    '0 12px 32px -8px hsl(var(--primary) / 0.55), inset 0 2px 0 rgba(255,255,255,0.35), inset 0 -2px 0 rgba(0,0,0,0.15)',
                }}
              >
                {subTab === "live" ? (
                  <Radio className="h-11 w-11 text-on-dark" strokeWidth={2.2} />
                ) : subTab === "following" ? (
                  <Heart className="h-11 w-11 text-on-dark" strokeWidth={2.2} fill="currentColor" />
                ) : subTab === "new" ? (
                  <Sparkles className="h-11 w-11 text-on-dark" strokeWidth={2.2} />
                ) : (
                  <Compass className="h-11 w-11 text-on-dark" strokeWidth={2.2} />
                )}
              </div>
            </div>

            <h3 className="text-xl font-bold text-display mb-2 text-center">
              {subTab === "live" ? "No live streams right now" : "No hosts here yet"}
            </h3>
            <p className="text-sm text-muted-pro text-center max-w-[260px] mb-6 leading-relaxed">
              {getEmptyMessage()}
            </p>

            {/* Primary action — Go Live for hosts, Discover for viewers */}
            <div className="flex flex-row items-stretch gap-2.5 w-full max-w-[340px]">
              <button
                data-prefetch-path="/go-live"
                onClick={() => navigate('/go-live')}
                className="flex-1 h-11 rounded-full px-5 font-semibold text-sm text-on-dark bg-gradient-primary active:opacity-90 transition-opacity duration-75 touch-manipulation flex items-center justify-center gap-2"
                style={{
                  boxShadow:
                    '0 6px 18px -4px hsl(var(--primary) / 0.5), inset 0 1px 0 rgba(255,255,255,0.3), inset 0 -1px 0 rgba(0,0,0,0.15)',
                }}
              >
                <Radio className="h-4 w-4" strokeWidth={2.5} />
                <span>Go Live</span>
              </button>
              <button
                onClick={handlePullRefresh}
                className="flex-1 h-11 rounded-full px-5 font-semibold text-sm text-heading bg-card border border-border active:opacity-90 transition-opacity duration-75 touch-manipulation flex items-center justify-center gap-2"
                style={{
                  boxShadow:
                    '0 3px 8px -2px rgba(15,23,42,0.1), inset 0 1px 0 rgba(255,255,255,0.7)',
                }}
              >
                <RefreshCcw className="h-4 w-4" strokeWidth={2.5} />
                <span>Refresh</span>
              </button>
            </div>

            <p className="mt-5 text-[11px] text-muted-pro/80 text-center">
              Or pull down to refresh
            </p>
          </div>
        )}
      </main>
      </NativePullToRefresh>
      </div>

      {/* Bottom Navigation */}
      <BottomNavigation activeTab={activeTab} onTabChange={handleTabChange} />

      {/* Chamet-style floating "Random Chat — Free" pill */}
      <Suspense fallback={null}>
        <FloatingRandomMatchPill />
      </Suspense>


      {/* Full-Screen Promo Banners on Entry */}
      <ErrorBoundary componentName="FullScreenPromoBanners" fallback={null}>
        <Suspense fallback={null}>
          <FullScreenPromoBanners />
        </Suspense>
      </ErrorBoundary>

      {/* Notification Sheet */}
      <Sheet open={showNotifications} onOpenChange={setShowNotifications}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Notifications</SheetTitle>
          </SheetHeader>
          {showNotifications && (
            <Suspense fallback={null}>
              <NotificationList 
                onClose={() => setShowNotifications(false)} 
                compact={false}
              />
            </Suspense>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default Index;
