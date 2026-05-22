import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';

// Hook for real-time profile updates
export function useRealtimeProfile(userId: string | null) {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const fetchProfile = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (!error && data) {
        setProfile(data);
      }
      setLoading(false);
    };

    fetchProfile();

    // Pkg89 LiveKit-Purist: removed `profile-${userId}` postgres_changes subscription.
    // `profiles` is NOT in supabase_realtime publication (would never fire), and this
    // hook has ZERO consumers in the app. Use `useUserBalance` (own-row push via
    // `user-balance-updates-${id}` channel) or rely on `app-sync` events instead.
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchProfile();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId]);

  return { profile, loading };
}


// Hook for real-time agency stats
export function useRealtimeAgencyStats(agencyId: string | null) {
  const [stats, setStats] = useState<any>(null);
  const [performance, setPerformance] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!agencyId) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      // Fetch agency info
      const { data: agencyData } = await supabase
        .from('agencies')
        .select('*')
        .eq('id', agencyId)
        .single();

      if (agencyData) {
        setStats(agencyData);
      }

      // Fetch current week performance
      const weekStart = getWeekStart();
      const { data: perfData } = await supabase
        .from('agency_performance')
        .select('*')
        .eq('agency_id', agencyId)
        .eq('period_type', 'weekly')
        .eq('period_start', weekStart)
        .maybeSingle();

      if (perfData) {
        setPerformance(perfData);
      }

      setLoading(false);
    };

    fetchData();

    // Pkg89 LiveKit-Purist: removed `agency-${agencyId}` + `agency-perf-${agencyId}`
    // postgres_changes subscriptions. Neither table is in supabase_realtime publication,
    // and this hook has ZERO consumers. Use admin-broadcast push (Pkg37) or visibility
    // refresh — never re-subscribe to cross-user `agencies` tables.
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchData();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [agencyId]);

  return { stats, performance, loading };
}


// Hook for real-time live stream stats
export function useRealtimeLiveStream(streamId: string | null) {
  const [stream, setStream] = useState<any>(null);
  const [viewers, setViewers] = useState<any[]>([]);
  const [gifts, setGifts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!streamId) {
      setLoading(false);
      return;
    }

    let streamChannel: RealtimeChannel;
    let viewerChannel: RealtimeChannel;
    let giftChannel: RealtimeChannel;

    const fetchData = async () => {
      // Fetch stream info
      const { data: streamData } = await supabase
        .from('live_streams')
        .select('*')
        .eq('id', streamId)
        .single();
      
      if (streamData) {
        setStream(streamData);
      }

      // Fetch current viewers
      const { data: viewerData } = await supabase
        .from('stream_viewers')
        .select('*')
        .eq('stream_id', streamId)
        .is('left_at', null);
      
      if (viewerData) {
        setViewers(viewerData);
      }

      // Fetch recent gifts
      const { data: giftData } = await supabase
        .from('gift_transactions')
        .select('*')
        .eq('stream_id', streamId)
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (giftData) {
        setGifts(giftData);
      }
      
      setLoading(false);
    };

    fetchData();

    // Pkg83 LiveKit-Purist: removed 3 stream-* Supabase Realtime channels
    // (stream-${id}, stream-viewers-${id}, stream-gifts-${id}). This hook is
    // currently unused in the app (only formatLastUpdate is imported); kept
    // as a REST-only snapshot helper for future consumers. Any future caller
    // must subscribe via LiveKit envelopes (livekit-gift-sent / live-event)
    // — never re-introduce Supabase postgres_changes on stream tables.
    streamChannel = null;
    viewerChannel = null;
    giftChannel = null;

    return () => {
      if (streamChannel) supabase.removeChannel(streamChannel);
      if (viewerChannel) supabase.removeChannel(viewerChannel);
      if (giftChannel) supabase.removeChannel(giftChannel);
    };
  }, [streamId]);

  return { stream, viewers, gifts, loading };
}

// Hook for real-time rankings
export function useRealtimeRankings(rankingType: string, periodType: string) {
  const [rankings, setRankings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const fetchRankings = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_agency_rankings', {
      _ranking_type: rankingType,
      _period_type: periodType,
      _limit: 100
    });
    
    if (!error && data) {
      setRankings(data);
      setLastUpdate(new Date());
    }
    setLoading(false);
  }, [rankingType, periodType]);

  useEffect(() => {
    fetchRankings();

    // Pkg89 LiveKit-Purist: removed `rankings-${type}-${period}` UNFILTERED
    // postgres_changes on `agency_performance`. UNFILTERED cross-user subscription
    // is the exact $1400-bill pattern. agency_performance is NOT in publication anyway,
    // and this hook has ZERO consumers. Use admin-broadcast push or visibility refresh.
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchRankings();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fetchRankings]);


  return { rankings, loading, lastUpdate, refresh: fetchRankings };
}

// Hook for real-time earnings tracker
export function useRealtimeEarnings(userId: string | null) {
  const [todayEarnings, setTodayEarnings] = useState(0);
  const [weekEarnings, setWeekEarnings] = useState(0);
  const [monthEarnings, setMonthEarnings] = useState(0);
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [recentGifts, setRecentGifts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const fetchEarnings = async () => {
      const today = new Date().toISOString().split('T')[0];
      const weekStart = getWeekStart();
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

      // Fetch today's earnings
      const { data: todayData } = await supabase
        .from('gift_transactions')
        .select('coin_amount')
        .eq('receiver_id', userId)
        .gte('created_at', today);
      
      setTodayEarnings(todayData?.reduce((sum, t) => sum + t.coin_amount, 0) || 0);

      // Fetch week earnings
      const { data: weekData } = await supabase
        .from('gift_transactions')
        .select('coin_amount')
        .eq('receiver_id', userId)
        .gte('created_at', weekStart);
      
      setWeekEarnings(weekData?.reduce((sum, t) => sum + t.coin_amount, 0) || 0);

      // Fetch month earnings
      const { data: monthData } = await supabase
        .from('gift_transactions')
        .select('coin_amount')
        .eq('receiver_id', userId)
        .gte('created_at', monthStart);
      
      setMonthEarnings(monthData?.reduce((sum, t) => sum + t.coin_amount, 0) || 0);

      // Fetch total earnings from profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('total_earnings')
        .eq('id', userId)
        .single();
      
      setTotalEarnings(profileData?.total_earnings || 0);

      // Fetch recent gifts
      const { data: giftsData } = await supabase
        .from('gift_transactions')
        .select('*')
        .eq('receiver_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);
      
      setRecentGifts(giftsData || []);
      setLastUpdate(new Date());
      setLoading(false);
    };

    fetchEarnings();

    // Subscribe to new gifts
    const channel = supabase
      .channel(`earnings-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'gift_transactions',
          filter: `receiver_id=eq.${userId}`
        },
        async (payload) => {
          console.log('[Realtime] New earning:', payload.new);
          const amount = (payload.new as any).coin_amount;
          
          setTodayEarnings(prev => prev + amount);
          setWeekEarnings(prev => prev + amount);
          setMonthEarnings(prev => prev + amount);
          setTotalEarnings(prev => prev + amount);
          setRecentGifts(prev => [payload.new, ...prev.slice(0, 19)]);
          setLastUpdate(new Date());
        }
      )
      .subscribe();

    // No polling - realtime subscription handles updates
    const interval: ReturnType<typeof setInterval> | null = null;

    return () => {
      supabase.removeChannel(channel);
      if (interval) clearInterval(interval);
    };
  }, [userId]);

  return { todayEarnings, weekEarnings, monthEarnings, totalEarnings, recentGifts, loading, lastUpdate };
}

// Helper function to get week start date
function getWeekStart(): string {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
  const monday = new Date(now.setDate(diff));
  return monday.toISOString().split('T')[0];
}

// Format last update time
export function formatLastUpdate(date: Date): string {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  
  if (seconds < 5) return 'Just now';
  if (seconds < 60) return `${seconds} seconds ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  return `${Math.floor(seconds / 3600)} hours ago`;
}