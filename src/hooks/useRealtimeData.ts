import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';

// Pkg361 ZERO-REFRESH: every hook below now opens a direct Supabase Realtime
// subscription on the underlying row(s) so the UI reflects DB writes instantly
// — no tab-focus refetch, no setInterval, no manual reload required.

// Hook for real-time profile updates
export function useRealtimeProfile(userId: string | null) {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchProfile = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (!cancelled && !error && data) {
        setProfile(data);
      }
      if (!cancelled) setLoading(false);
    };

    fetchProfile();

    // Pkg361: direct Realtime on own profile row — instant diamonds / beans /
    // diamonds / level / host_status / avatar updates across every page.
    const channel = supabase
      .channel(`rt-profile-${userId}-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
        (payload) => {
          if (!cancelled && payload.new) {
            setProfile((prev: any) => ({ ...(prev || {}), ...(payload.new as any) }));
          }
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
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

    let cancelled = false;
    const weekStart = getWeekStart();

    const fetchData = async () => {
      const [{ data: agencyData }, { data: perfData }] = await Promise.all([
        supabase.from('agencies').select('*').eq('id', agencyId).single(),
        supabase
          .from('agency_performance')
          .select('*')
          .eq('agency_id', agencyId)
          .eq('period_type', 'weekly')
          .eq('period_start', weekStart)
          .maybeSingle(),
      ]);

      if (cancelled) return;
      if (agencyData) setStats(agencyData);
      if (perfData) setPerformance(perfData);
      setLoading(false);
    };

    fetchData();

    // Pkg361: direct Realtime on agency row + this week's performance row.
    const channel = supabase
      .channel(`rt-agency-${agencyId}-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'agencies', filter: `id=eq.${agencyId}` },
        (payload) => {
          if (!cancelled && payload.new) {
            setStats((prev: any) => ({ ...(prev || {}), ...(payload.new as any) }));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'agency_performance', filter: `agency_id=eq.${agencyId}` },
        (payload) => {
          const row: any = payload.new || payload.old;
          if (!cancelled && row && row.period_type === 'weekly' && row.period_start === weekStart) {
            if (payload.eventType === 'DELETE') {
              setPerformance(null);
            } else {
              setPerformance((prev: any) => ({ ...(prev || {}), ...(payload.new as any) }));
            }
          }
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
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

    let cancelled = false;

    const fetchData = async () => {
      const [{ data: streamData }, { data: viewerData }, { data: giftData }] = await Promise.all([
        supabase.from('live_streams').select('*').eq('id', streamId).single(),
        supabase.from('stream_viewers').select('user_id, joined_at').eq('stream_id', streamId).is('left_at', null).limit(500),
        supabase
          .from('gift_transactions')
          .select('*')
          .eq('stream_id', streamId)
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

      if (cancelled) return;
      if (streamData) setStream(streamData);
      if (viewerData) setViewers(viewerData);
      if (giftData) setGifts(giftData);
      setLoading(false);
    };

    fetchData();

    // Pkg83 / Pkg361 reaffirmed: in-room data (viewers/gifts) is delivered
    // through LiveKit data envelopes (livekit-gift-sent / live-event). Outside
    // a live room this hook is only used as a REST snapshot helper, so we
    // intentionally do NOT open per-stream postgres_changes channels here.
    return () => {
      cancelled = true;
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
      _limit: 100,
    });

    if (!error && data) {
      setRankings(data as any[]);
      setLastUpdate(new Date());
    }
    setLoading(false);
  }, [rankingType, periodType]);

  useEffect(() => {
    fetchRankings();

    // Pkg361: any agency_performance write triggers a debounced ranking
    // refetch so the leaderboard reflects new beans/diamonds instantly.
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel(`rt-rankings-${rankingType}-${periodType}-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'agency_performance' },
        () => {
          if (debounce) clearTimeout(debounce);
          debounce = setTimeout(() => { fetchRankings(); }, 500);
        }
      )
      .subscribe();

    return () => {
      if (debounce) clearTimeout(debounce);
      supabase.removeChannel(channel);
    };
  }, [fetchRankings, rankingType, periodType]);



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
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    userIdRef.current = userId;
    if (!userId) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const today = new Date().toISOString().split('T')[0];
    const weekStart = getWeekStart();
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString()
      .split('T')[0];

    const fetchEarnings = async () => {
      const [todayRes, weekRes, monthRes, profileRes, giftsRes] = await Promise.all([
        supabase.from('gift_transactions').select('diamond_amount').eq('receiver_id', userId).gte('created_at', today),
        supabase.from('gift_transactions').select('diamond_amount').eq('receiver_id', userId).gte('created_at', weekStart),
        supabase.from('gift_transactions').select('diamond_amount').eq('receiver_id', userId).gte('created_at', monthStart),
        supabase.from('profiles').select('total_earnings').eq('id', userId).single(),
        supabase
          .from('gift_transactions')
          .select('*')
          .eq('receiver_id', userId)
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

      if (cancelled) return;
      setTodayEarnings(todayRes.data?.reduce((s, t: any) => s + (t.diamond_amount || 0), 0) || 0);
      setWeekEarnings(weekRes.data?.reduce((s, t: any) => s + (t.diamond_amount || 0), 0) || 0);
      setMonthEarnings(monthRes.data?.reduce((s, t: any) => s + (t.diamond_amount || 0), 0) || 0);
      setTotalEarnings((profileRes.data as any)?.total_earnings || 0);
      setRecentGifts(giftsRes.data || []);
      setLastUpdate(new Date());
      setLoading(false);
    };

    fetchEarnings();

    // Pkg361: subscribe directly to incoming gift transactions + own profile
    // row so earnings counters update the instant a gift is received.
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefetch = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => { fetchEarnings(); }, 300);
    };

    const channel = supabase
      .channel(`rt-earnings-${userId}-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'gift_transactions', filter: `receiver_id=eq.${userId}` },
        (payload) => {
          if (cancelled) return;
          const row: any = payload.new;
          const createdAt = row?.created_at;
          const diamond = Number(row?.diamond_amount || 0);
          if (diamond > 0) {
            if (createdAt >= today) setTodayEarnings((v) => v + diamond);
            if (createdAt >= weekStart) setWeekEarnings((v) => v + diamond);
            if (createdAt >= monthStart) setMonthEarnings((v) => v + diamond);
            setRecentGifts((prev) => [row, ...prev].slice(0, 20));
            setLastUpdate(new Date());
          }
          // Safety-net resync in case of out-of-order events.
          scheduleRefetch();
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
        (payload) => {
          const next = (payload.new as any)?.total_earnings;
          if (!cancelled && typeof next === 'number') setTotalEarnings(next);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      if (debounce) clearTimeout(debounce);
      supabase.removeChannel(channel);
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
