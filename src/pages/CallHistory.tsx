import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Phone, PhoneOff, Star, Clock, Coins, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { getAppSetting } from "@/utils/appSettingsCache";
import { BottomNavigation } from "@/components/layout/BottomNavigation";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { recordClientError } from "@/utils/clientErrorLog";
import { subscribeToTables } from "@/hooks/useUniversalRealtime";

interface CallRecord {
  id: string;
  caller_id: string;
  host_id: string;
  status: string;
  duration_seconds: number | null;
  coins_spent: number | null;
  total_coins_deducted?: number | null;
  host_earned?: number | null;
  host_earnings_amount?: number | null;
  caller_rating: number | null;
  host_rating: number | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  end_reason: string | null;
  other_user: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    is_verified: boolean | null;
  } | null;
  is_outgoing: boolean;
  host_earnings?: number;
  charged_coins?: number;
}

const CallHistory = () => {
  const navigate = useNavigate();
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("/profile");
  const [isHost, setIsHost] = useState(false);

  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userIdRef = useRef<string | null>(null);

  const scheduleRefetch = useCallback(() => {
    if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
    refetchTimerRef.current = setTimeout(() => {
      void fetchCallHistory();
    }, 400);
  }, []);

  useEffect(() => {
    fetchCallHistory();

    // ============= Pkg337 audit fix =============
    // Restored Supabase Realtime on `private_calls` (Core memory rule:
    // NEVER use polling/visibility-refresh in place of realtime). Pkg90
    // removal of the unfiltered channel was correct; the proper fix is a
    // user-scoped subscription, not visibility-only refetch. The universal
    // channel callback receives every private_calls event — we filter
    // client-side to rows where the current user is caller or host before
    // scheduling a debounced refetch. Visibility-change kept as backup.
    const offRealtime = subscribeToTables('call-history', ['private_calls'], (_table, _event, payload) => {
      const uid = userIdRef.current;
      if (!uid) return;
      const row: any = payload?.new || payload?.old || {};
      if (row.caller_id === uid || row.host_id === uid) {
        scheduleRefetch();
      }
    });

    const onFocus = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        fetchCallHistory();
      }
    };
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      offRealtime();
      document.removeEventListener('visibilitychange', onFocus);
      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
    };
  }, [scheduleRefetch]);

  const fetchCallHistory = async () => {
      try {
        const { getCachedUser } = await import('@/utils/cachedAuth');
        const user = await getCachedUser();
        if (!user) {
          navigate('/auth');
          return;
        }
        setUserId(user.id);
        userIdRef.current = user.id;

        // Fetch user profile to check if host
        const { data: profileData } = await supabase
          .from('profiles')
          .select('is_host')
          .eq('id', user.id)
          .single();
        
        setIsHost(profileData?.is_host || false);

        // Fetch commission percentage only as a legacy fallback for very old rows
        // that do not have stored host_earned / host_earnings_amount values.
        const callRatesValue = await getAppSetting<unknown>('call_rates');

        if (!callRatesValue) {
          console.error('CRITICAL: call_rates not found in app_settings!');
          recordClientError({ label: "CallHistory.callRates", message: 'CRITICAL: call_rates not found in app_settings!' });
        }

        // Fetch calls where user is either caller or host
        const { data: callsData, error } = await supabase
          .from('private_calls')
          .select('*')
          .or(`caller_id.eq.${user.id},host_id.eq.${user.id}`)
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) throw error;

        if (!callsData || callsData.length === 0) {
          setCalls([]);
          setLoading(false);
          return;
        }

        // Get all unique user IDs to fetch profiles
        const otherUserIds = callsData.map(call => 
          call.caller_id === user.id ? call.host_id : call.caller_id
        );
        const uniqueUserIds = [...new Set(otherUserIds)];

        // Fetch profiles for other users
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles_public')
          .select('id, display_name, avatar_url, is_verified')
          .in('id', uniqueUserIds);

        if (profilesError) throw profilesError;

        const profilesMap = new Map(profiles?.map(p => [p.id, p]) || []);

        // Get commission rate for calculations - NO DEFAULTS
        // CRITICAL: Must be configured in Admin Panel
        let commRate = 0;
        if (settingsData?.setting_value) {
          const callRates = settingsData.setting_value as any;
          if (callRates.host_commission_percent !== undefined) {
            commRate = callRates.host_commission_percent;
          } else {
            console.error('CRITICAL: host_commission_percent not set - host earnings will show 0');
            recordClientError({ label: "CallHistory.callRates", message: 'CRITICAL: host_commission_percent not set - host earnings will show 0' });
          }
        }

        // Merge calls with profile data and use the stored historical earning.
        // Pkg337 pass-2: never recalculate old history from the current admin
        // commission, because commission settings can change after a call.
        const callsWithProfiles: CallRecord[] = callsData.map(call => {
          const isOutgoing = call.caller_id === user.id;
          const otherUserId = isOutgoing ? call.host_id : call.caller_id;
          const chargedCoins = Number(call.total_coins_deducted ?? call.coins_spent ?? 0);
          const storedHostEarnings = Number(call.host_earned ?? call.host_earnings_amount ?? 0);
          const hostEarnings = storedHostEarnings > 0
            ? storedHostEarnings
            : Math.floor(chargedCoins * commRate / 100);
          
          return {
            ...call,
            other_user: profilesMap.get(otherUserId) || null,
            is_outgoing: isOutgoing,
            host_earnings: hostEarnings,
            charged_coins: chargedCoins,
          };
        });

        setCalls(callsWithProfiles);
      } catch (error) {
        console.error('Error fetching call history:', error);
        recordClientError({ label: "CallHistory.hostEarnings", message: error instanceof Error ? error.message : String(error) });
      } finally {
        setLoading(false);
      }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500/20 text-green-400';
      case 'missed':
      case 'declined':
        return 'bg-red-500/20 text-red-400';
      case 'cancelled':
        return 'bg-yellow-500/20 text-yellow-400';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const renderStars = (rating: number | null) => {
    if (!rating) return null;
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`w-3 h-3 ${
              star <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'
            }`}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="mobile-page bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 glass-card border-b border-border/50 safe-area-top">
        <div className="px-4 py-3 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold">Call History</h1>
        </div>
      </header>

      <main className="mobile-page-scrollable px-4 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <LoadingSpinner size="md" text="Loading" />
          </div>
        ) : calls.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
              <Phone className="w-10 h-10 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No Call History</h3>
            <p className="text-muted-foreground">
              Your call history will appear here
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {calls.map((call) => (
              <div
                key={call.id}
                className="flex items-center gap-3 p-4 bg-card rounded-xl border border-border/50 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => call.other_user && navigate(`/profile/${call.other_user.id}`)}
              >
                {/* Avatar */}
                <div className="relative">
                  <Avatar className="w-12 h-12">
                    <AvatarImage src={call.other_user?.avatar_url || undefined} />
                    <AvatarFallback>
                      {call.other_user?.display_name?.[0] || '?'}
                    </AvatarFallback>
                  </Avatar>
                  {call.other_user?.is_verified && (
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                      <svg className="w-3 h-3 text-on-dark" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                </div>

                {/* Call Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold truncate">
                      {call.other_user?.display_name || 'Unknown User'}
                    </p>
                    <Badge variant="secondary" className={`text-xs ${getStatusColor(call.status)}`}>
                      {call.status}
                    </Badge>
                  </div>
                  
                  <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                    {/* Call Direction */}
                    <span className="flex items-center gap-1">
                      {call.is_outgoing ? (
                        <>
                          <Phone className="w-3 h-3" />
                          Outgoing
                        </>
                      ) : (
                        <>
                          <PhoneOff className="w-3 h-3 rotate-180" />
                          Incoming
                        </>
                      )}
                    </span>
                    
                    {/* Duration */}
                    {call.duration_seconds && call.duration_seconds > 0 && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDuration(call.duration_seconds)}
                      </span>
                    )}
                    
                    {/* Diamonds Spent (for caller) or Earned (for host) */}
                    {call.charged_coins && call.charged_coins > 0 && (
                      call.is_outgoing ? (
                        <span className="flex items-center gap-1 text-red-400">
                          <Coins className="w-3 h-3" />
                          -{call.charged_coins}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-green-400">
                          <TrendingUp className="w-3 h-3" />
                          +{call.host_earnings || 0}
                        </span>
                      )
                    )}
                  </div>

                  {/* Rating */}
                  {(call.caller_rating || call.host_rating) && (
                    <div className="mt-1">
                      {call.is_outgoing ? renderStars(call.host_rating) : renderStars(call.caller_rating)}
                    </div>
                  )}
                </div>

                {/* Time */}
                <div className="text-sm text-muted-foreground">
                  {formatDate(call.created_at)}
                </div>
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

export default CallHistory;
