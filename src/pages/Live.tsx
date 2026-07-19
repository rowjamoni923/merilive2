import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { BottomNavigation } from "@/components/layout/BottomNavigation";
import { PremiumLiveStreamCard } from "@/components/home/PremiumLiveStreamCard";
import { Button } from "@/components/ui/button";
import { Plus, Users, Flame } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { preloadAllStreams, cleanupAllPreloaded, markPreloadedStreamForHandoff } from "@/services/liveStreamPreloader";
import { useLiveKitPrewarm } from "@/hooks/useLiveKitPrewarm";
import { recordClientError } from "@/utils/clientErrorLog";
import { subscribeToTables } from "@/hooks/useUniversalRealtime";
import { resolveLevelFromTiers } from "@/utils/levelResolver";
import { getRequiredDisplayLevel } from "@/utils/stableLevel";

interface LiveStream {
  id: string;
  host_id: string;
  title: string;
  thumbnail_url: string | null;
  viewer_count: number;
  is_active: boolean;
  host: {
    display_name: string | null;
    avatar_url: string | null;
    country_code: string | null;
    country_flag: string | null;
    host_level: number | null;
    user_level: number | null;
    is_verified: boolean | null;
    is_host?: boolean | null;
    gender?: string | null;
  } | null;

}

const Live = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("/live");
  const initialStreams = (() => {
    try {
      const raw = window.sessionStorage.getItem("live-streams-cache-v1");
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })();
  const [streams, setStreams] = useState<LiveStream[]>(initialStreams);
  const mountedRef = useRef(false);

  const fetchLiveStreams = async () => {
    try {
      // Owner policy 2026-06-28: NEVER auto-close a host's stream from the
      // viewer feed. Only the host's explicit End button (or an admin force
      // close) ends a live. The 24h zombie sweep handles truly dead rows.
      
      
      const { data: streamRows, error } = await supabase
        .from('live_streams')
        .select(`
          id,
          host_id,
          title,
          thumbnail_url,
          viewer_count,
          is_active,
          last_heartbeat
        `)
        .eq('is_active', true)
        .order('viewer_count', { ascending: false });

      if (error) throw error;

      // Fetch host data via profiles_public view (profiles base table has no public SELECT)
      const hostIds = Array.from(new Set(((streamRows || []) as any[]).map(s => s.host_id).filter(Boolean)));
      let hostMap = new Map<string, any>();
      if (hostIds.length > 0) {
        const { data: hostsData } = await supabase
          .from('profiles_public')
          .select('id, display_name, avatar_url, country_code, country_flag, host_level, user_level, is_verified, is_host, gender, total_recharged, total_earnings, weekly_earnings, max_user_level')
          .in('id', hostIds);
        hostMap = new Map(((hostsData || []) as any[]).map(h => [h.id, h]));
      }

      // Pkg305: resolve all host levels in parallel (fixes N+1 dynamic-import bug)
      const hostsArr = Array.from(hostMap.values());
      const levelEntries = await Promise.all(
        hostsArr.map(async (host: any) => {
          try {
            const result = await resolveLevelFromTiers({
              id: host.id,
              user_level: host.user_level,
              host_level: host.host_level,
              is_host: host.is_host,
              gender: host.gender,
              total_recharged: host.total_recharged,
              total_earnings: host.total_earnings,
              weekly_earnings: host.weekly_earnings,
              max_user_level: host.max_user_level,
            });
            return [host.id, result.level] as const;
          } catch {
            return [host.id, getRequiredDisplayLevel(host)] as const;
          }
        })
      );
      const levelByHost = new Map(levelEntries);

      const nextStreams = ((streamRows || []) as any[]).map((s: any) => {
        const host = hostMap.get(s.host_id) || null;
        const resolvedLevel = host ? (levelByHost.get(host.id) ?? 1) : 1;
        return { ...s, host: host ? { ...host, user_level: resolvedLevel, host_level: resolvedLevel } : null };
      }) as LiveStream[];

      if (!mountedRef.current) return;
      setStreams(nextStreams);
      try {
        window.sessionStorage.setItem("live-streams-cache-v1", JSON.stringify(nextStreams));
      } catch {
        // ignore cache write errors
      }

      // 🚀 PRELOAD: Pre-connect to ALL live rooms (hidden tokens, no viewer count)
      const allStreamIds = nextStreams.map(s => s.id);
      if (allStreamIds.length > 0) {
        const startPreload = () => {
          if (!mountedRef.current) return;
          preloadAllStreams(allStreamIds);
        };

        if (typeof (window as any).requestIdleCallback === 'function') {
          (window as any).requestIdleCallback(startPreload, { timeout: 800 });
        } else {
          setTimeout(startPreload, 80);
        }
      }
    } catch (error) {
      console.error('Error fetching live streams:', error);
      recordClientError({ label: "Live.startPreload", message: error instanceof Error ? error.message : String(error) });
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    fetchLiveStreams();

    // Pkg305: Supabase Realtime on live_streams — instant list refresh on
    // host go-live / end / viewer_count change. Replaces visibility-only resync.
    // LiveKit still owns in-room media; this is the list-level signal.
    let pendingRefresh: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (pendingRefresh) return;
      pendingRefresh = setTimeout(() => {
        pendingRefresh = null;
        fetchLiveStreams();
      }, 400);
    };

    const unsubscribe = subscribeToTables('live-page-streams', ['live_streams'], () => {
      scheduleRefresh();
    });

    return () => {
      mountedRef.current = false;
      if (pendingRefresh) clearTimeout(pendingRefresh);
      unsubscribe?.();
      cleanupAllPreloaded();
    };

  }, []);

  const totalViewers = streams.reduce((acc, stream) => acc + (stream.viewer_count || 0), 0);

  return (
    <div className="fixed inset-0 flex flex-col bg-background overflow-y-auto overflow-x-hidden">
      {/* Header */}
      <header className="sticky top-0 z-40 glass-card border-b border-border/50 safe-area-top">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Flame className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-bold">Live Stream</h1>
          </div>
          <Button 
            onClick={() => navigate('/go-live')}
            className="gradient-primary rounded-full shadow-glow gap-2"
          >
            <Plus className="w-4 h-4" />
            Go Live
          </Button>
        </div>

        {/* Stats */}
        <div className="flex gap-4 px-4 pb-3">
          <div className="flex items-center gap-2 bg-destructive/10 text-destructive px-3 py-1.5 rounded-full">
            <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
            <span className="text-sm font-medium">{streams.length} Live</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="w-4 h-4" />
            <span className="text-sm">
              {totalViewers.toLocaleString()} viewers
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto overscroll-contain px-4 py-4" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'var(--content-bottom-padding)' }}>
        {streams.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Flame className="w-16 h-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-semibold text-muted-foreground">No Live Streams</h3>
            <p className="text-sm text-muted-foreground/70 mt-1">
              Be the first to go live!
            </p>
            <Button 
              onClick={() => navigate('/go-live')}
              className="mt-4 gradient-primary"
            >
              Start Streaming
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {streams.map((stream) => (
              <LiveStreamTile
                key={stream.id}
                stream={stream}
                onTap={() => {
                  markPreloadedStreamForHandoff(stream.id);
                  import("@/pages/LiveStream").catch(() => {});
                  navigate(`/live/${stream.id}`);
                }}
              />
            ))}
          </div>
        )}
      </main>

      <BottomNavigation activeTab={activeTab} onTabChange={(path) => {
        setActiveTab(path);
        navigate(path);
      }} />
    </div>
  );
};

/**
 * Phase 2 (instant-entry): each visible tile pre-warms its LiveKit room
 * (DNS + TLS only, via cached wildcard viewer token). Shaves 150-300ms
 * off tap-to-first-frame. No media, no billing, no viewer count impact.
 */
const LiveStreamTile = ({ stream, onTap }: { stream: LiveStream; onTap: () => void }) => {
  const ref = useLiveKitPrewarm<HTMLDivElement>(`live_${stream.id}`);
  return (
    <div ref={ref} onClick={onTap} className="cursor-pointer">
      <PremiumLiveStreamCard
        id={stream.id}
        hostId={stream.host?.id}
        hostName={stream.host?.display_name || 'Unknown Host'}
        hostAvatar={stream.host?.avatar_url || ''}
        hostGender={(stream.host?.is_host || stream.host?.gender === 'female' || stream.host?.gender === 'Female') ? 'female' : (stream.host?.gender === 'male' || stream.host?.gender === 'Male' ? 'male' : 'female')}
        thumbnailUrl={stream.thumbnail_url || stream.host?.avatar_url || ''}
        viewerCount={stream.viewer_count || 0}
        country=""
        countryFlag={stream.host?.country_flag || '🌍'}
        countryCode={stream.host?.country_code || null}
        tags={['Live']}
        userLevel={getRequiredDisplayLevel(stream.host)}
        isVIP={stream.host?.is_verified || false}
        giftCount={0}
      />
    </div>
  );
};

export default Live;
