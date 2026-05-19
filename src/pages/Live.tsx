import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { BottomNavigation } from "@/components/layout/BottomNavigation";
import { PremiumLiveStreamCard } from "@/components/home/PremiumLiveStreamCard";
import { Button } from "@/components/ui/button";
import { Plus, Users, Flame } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { preloadAllStreams, cleanupAllPreloaded, isStreamPreloaded } from "@/services/liveStreamPreloader";
import { recordClientError } from "@/utils/clientErrorLog";

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
          .select('id, display_name, avatar_url, country_flag, host_level, user_level, is_verified, is_host, gender, total_recharged, total_earnings, weekly_earnings, max_user_level')
          .in('id', hostIds);
        hostMap = new Map(((hostsData || []) as any[]).map(h => [h.id, h]));
      }

      const { resolveLevelFromTiers } = await import('@/utils/levelResolver');
      const nextStreams = await Promise.all(((streamRows || []) as any[]).map(async (s: any) => {
        const host = hostMap.get(s.host_id) || null;
        const resolvedLevel = host
          ? await resolveLevelFromTiers({
              id: host.id,
              user_level: host.user_level,
              host_level: host.host_level,
              is_host: host.is_host,
              gender: host.gender,
              total_recharged: host.total_recharged,
              total_earnings: host.total_earnings,
              weekly_earnings: host.weekly_earnings,
              max_user_level: host.max_user_level,
            }).then(result => result.level).catch(() => Math.max(host.host_level || 0, host.user_level || 1))
          : 1;

        return { ...s, host: host ? { ...host, user_level: resolvedLevel, host_level: resolvedLevel } : null };
      })) as LiveStream[];

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

    // Realtime: surgical viewer_count updates + full refetch only on stream add/remove
    const channel = supabase
      .channel(`live-streams-realtime-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'live_streams' },
        (payload) => {
          const next = payload.new as any;
          if (!next?.id) return;
          // Stream ended → drop it; otherwise patch in place (instant viewer_count)
          if (next.is_active === false) {
            setStreams((prev) => prev.filter((s) => s.id !== next.id));
            return;
          }
          setStreams((prev) => {
            const idx = prev.findIndex((s) => s.id === next.id);
            if (idx === -1) {
              // New live stream appeared → full refetch to get host data
              fetchLiveStreams();
              return prev;
            }
            const updated = [...prev];
            updated[idx] = {
              ...updated[idx],
              viewer_count: next.viewer_count ?? updated[idx].viewer_count,
              title: next.title ?? updated[idx].title,
              thumbnail_url: next.thumbnail_url ?? updated[idx].thumbnail_url,
              ...(next.last_heartbeat ? { last_heartbeat: next.last_heartbeat } : {}),
            } as any;
            return updated;
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'live_streams' },
        () => fetchLiveStreams()
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'live_streams' },
        (payload) => {
          const oldId = (payload.old as any)?.id;
          if (oldId) setStreams((prev) => prev.filter((s) => s.id !== oldId));
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stream_viewers' },
        (payload) => {
          // Instantly bump the affected stream's viewer count without full refetch.
          // join/leave RPCs also update live_streams.viewer_count, so the UPDATE
          // handler above will reconcile to the exact server value within ~1 frame.
          const row: any = (payload.new as any) ?? (payload.old as any);
          const streamId = row?.stream_id;
          if (!streamId) return;
          setStreams((prev) => {
            const idx = prev.findIndex((s) => s.id === streamId);
            if (idx === -1) return prev;
            const delta =
              payload.eventType === 'INSERT' ? 1 :
              payload.eventType === 'DELETE' ? -1 :
              // UPDATE: left_at NULL→set means leave, set→NULL means rejoin
              (() => {
                const oldLeft = (payload.old as any)?.left_at;
                const newLeft = (payload.new as any)?.left_at;
                if (!oldLeft && newLeft) return -1;
                if (oldLeft && !newLeft) return 1;
                return 0;
              })();
            if (delta === 0) return prev;
            const updated = [...prev];
            updated[idx] = {
              ...updated[idx],
              viewer_count: Math.max(0, (updated[idx].viewer_count || 0) + delta),
            } as any;
            return updated;
          });
        }
      )
      .subscribe();


    // Zero-refresh: realtime channel is the single source of truth, no polling
    return () => {
      supabase.removeChannel(channel);
      cleanupAllPreloaded(); // Disconnect preloaded rooms when leaving Live page
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
