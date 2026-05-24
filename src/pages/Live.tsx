import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { BottomNavigation } from "@/components/layout/BottomNavigation";
import { PremiumLiveStreamCard } from "@/components/home/PremiumLiveStreamCard";
import { Button } from "@/components/ui/button";
import { Plus, Users, Flame } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { preloadAllStreams, cleanupAllPreloaded, isStreamPreloaded, markPreloadedStreamForHandoff } from "@/services/liveStreamPreloader";
import { recordClientError } from "@/utils/clientErrorLog";
import { subscribeToTables } from "@/hooks/useUniversalRealtime";
import { resolveLevelFromTiers } from "@/utils/levelResolver";

interface LiveStream {
  id: string;
  host_id: string;
  title: string;
  thumbnail_url: string | null;
  viewer_count: number;
  is_active: boolean;
  host: {
    id: string;
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
  const [streams, setStreams] = useState<LiveStream[]>(() => {
    try {
      const raw = window.sessionStorage.getItem("live-streams-cache-v1");
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(streams.length === 0);

  const fetchLiveStreams = async () => {
    try {
      // Trigger server-side cleanup of stale streams before fetching
      
      // First trigger server-side cleanup of stale streams
      try { await supabase.rpc('cleanup_stale_live_streams'); } catch(_) {}
      
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
            return [host.id, Math.max(host.host_level || 0, host.user_level || 1)] as const;
          }
        })
      );
      const levelByHost = new Map(levelEntries);

      const nextStreams = ((streamRows || []) as any[]).map((s: any) => {
        const host = hostMap.get(s.host_id) || null;
        const resolvedLevel = host ? (levelByHost.get(host.id) ?? 1) : 1;
        return { ...s, host: host ? { ...host, user_level: resolvedLevel, host_level: resolvedLevel } : null };
      }) as LiveStream[];

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
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
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

    const handleOnline = () => fetchLiveStreams();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') handleOnline();
    };
    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (pendingRefresh) clearTimeout(pendingRefresh);
      unsubscribe?.();
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibility);
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
              <div 
                key={stream.id} 
                onClick={() => {
                  markPreloadedStreamForHandoff(stream.id);
                  import("@/pages/LiveStream").catch(() => {});
                  navigate(`/live/${stream.id}`);
                }}
                className="cursor-pointer"
              >
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
                  userLevel={stream.host?.host_level || stream.host?.user_level || 1}
                  isVIP={stream.host?.is_verified || false}
                  giftCount={0}
                />

              </div>
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

export default Live;
