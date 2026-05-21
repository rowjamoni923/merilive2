import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { subscribeToTables } from '@/hooks/useUniversalRealtime';
import { useToast } from '@/hooks/use-toast';
import { Capacitor } from '@capacitor/core';
import { isNativeAndroidApp } from '@/utils/nativeUtils';
import { parseCallRateSettings, resolveEffectiveCallRate } from '@/utils/callRateSettings';
import { publishCallEnded, publishCallAccepted, type CallEndedDetail, type CallAcceptedDetail } from '@/lib/livekitCallSignaling';

interface CallState {
  callId: string | null;
  status: 'idle' | 'calling' | 'ringing' | 'connected' | 'ended';
  remoteUserId: string | null;
  remoteUserName: string | null;
  remoteUserAvatar: string | null;
  remoteUserLevel: number;
  hostId: string | null;
  duration: number;
  coinsPerMinute: number;
  totalCoinsSpent: number;
  hostEarned: number;
  callerRemainingCoins: number;
}

interface IncomingCall {
  callId: string;
  callerId: string;
  callerName: string;
  callerAvatar: string | null;
  callerLevel: number;
}

const INITIAL_CALL_STATE: CallState = {
  callId: null,
  status: 'idle',
  remoteUserId: null,
  remoteUserName: null,
  remoteUserAvatar: null,
  remoteUserLevel: 1,
  hostId: null,
  duration: 0,
  coinsPerMinute: 0,
  totalCoinsSpent: 0,
  hostEarned: 0,
  callerRemainingCoins: 0,
};

// Fast fallback for instant ringing reliability (broadcast/realtime remains primary)
// COST-CRITICAL: Fallback poll for incoming calls. Realtime broadcast + postgres_changes are primary delivery.
// Was 800ms (catastrophic: 10k users × 75 reads/min = $$$$). Now 30s safety net only. Visibility-change + native-resume listeners give instant catch-up on focus.
const FALLBACK_PENDING_CALL_POLL_MS = 30000;

export function usePrivateCall(userId: string | null) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [callState, setCallState] = useState<CallState>(INITIAL_CALL_STATE);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const durationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const billingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const billingFetchIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const callTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Call ringing timeout
  const outgoingStatusPollRef = useRef<NodeJS.Timeout | null>(null); // Caller-side fallback status polling
  const callEndedRef = useRef<boolean>(false);
  const currentCallIdRef = useRef<string | null>(null);
  const billingStartedRef = useRef<boolean>(false);
  const liveSessionStartedRef = useRef<boolean>(false);
  const startingCallRef = useRef<boolean>(false);
  const toastRef = useRef(toast);
  const deductCoinsRef = useRef<((callId: string) => Promise<void>) | null>(null);
  const resetCallStateRef = useRef<(() => void) | null>(null);
  const clearAllTimersRef = useRef<(() => void) | null>(null);
  // Track ended call IDs to NEVER show them again
  const endedCallIdsRef = useRef<Set<string>>(new Set());
  const incomingCallIdRef = useRef<string | null>(null);
  const pendingCallCheckInFlightRef = useRef(false);
  const softEndCallRef = useRef<(() => void) | null>(null);

  // Track current call ID
  useEffect(() => {
    currentCallIdRef.current = callState.callId;
  }, [callState.callId]);

  useEffect(() => {
    incomingCallIdRef.current = incomingCall?.callId || null;
  }, [incomingCall]);

  // Clear all timers helper
  const clearAllTimers = useCallback(() => {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
    if (billingTimerRef.current) {
      clearInterval(billingTimerRef.current);
      billingTimerRef.current = null;
    }
    if (billingFetchIntervalRef.current) {
      clearInterval(billingFetchIntervalRef.current);
      billingFetchIntervalRef.current = null;
    }
    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
    }
    if (outgoingStatusPollRef.current) {
      clearInterval(outgoingStatusPollRef.current);
      outgoingStatusPollRef.current = null;
    }
  }, []);

  // Reset call state completely
  const resetCallState = useCallback(() => {
    console.log('[Call] Resetting call state completely');
    const callIdToReset = currentCallIdRef.current;
    
    // Mark this call ID as permanently ended - NEVER show it again
    if (callIdToReset) {
      endedCallIdsRef.current.add(callIdToReset);
    }
    
    callEndedRef.current = true;
    billingStartedRef.current = false;
    liveSessionStartedRef.current = false;
    currentCallIdRef.current = null;
    clearAllTimers();
    setCallState(INITIAL_CALL_STATE);
    setIncomingCall(null);
    
    // SAFETY: Reset is_in_call in DB for BOTH parties
    if (userId) {
      Promise.resolve(supabase.rpc('reset_my_call_status')).then(() => {
        console.log('[Call] DB is_in_call reset for current user');
      }).catch(err => console.warn('[Call] Failed to reset DB call status:', err));
      
      if (callIdToReset) {
        supabase
          .from('private_calls')
          .select('caller_id, host_id')
          .eq('id', callIdToReset)
          .maybeSingle()
          .then(({ data }) => {
            if (data) {
              supabase
                .from('profiles')
                .update({ is_in_call: false, current_call_id: null, updated_at: new Date().toISOString() })
                .in('id', [data.caller_id, data.host_id])
                .then(() => console.log('[Call] ✅ Both parties is_in_call reset'));
            }
          });
      }
    }
    
    // ☠️ DEAD FOREVER POLICY: Once a call ends, it NEVER comes back
    // Like WhatsApp/IMO - ended call = dead forever. New call = fresh start.
    // Keep callEndedRef true for 3 seconds to block any stale events
    setTimeout(() => {
      callEndedRef.current = false;
    }, 3000);
    
    // Auto-clean old entries from endedCallIdsRef after 5 minutes to prevent memory growth
    if (endedCallIdsRef.current.size > 20) {
      const idsArray = Array.from(endedCallIdsRef.current);
      // Keep only last 10
      endedCallIdsRef.current = new Set(idsArray.slice(-10));
    }
  }, [clearAllTimers, userId]);

  // Soft-end: mark as ended but KEEP all call data for CallEndedModal display
  const softEndCall = useCallback(() => {
    if (callEndedRef.current) return;
    callEndedRef.current = true;
    const cid = currentCallIdRef.current;
    if (cid) endedCallIdsRef.current.add(cid);
    billingStartedRef.current = false;
    liveSessionStartedRef.current = false;
    currentCallIdRef.current = null;
    clearAllTimers();
    setCallState(prev => ({ ...prev, status: 'ended' }));
    setIncomingCall(null);
    Promise.resolve(supabase.rpc('reset_my_call_status')).catch(() => {});
    setTimeout(() => { callEndedRef.current = false; }, 3000);
    if (endedCallIdsRef.current.size > 20) {
      const idsArray = Array.from(endedCallIdsRef.current);
      endedCallIdsRef.current = new Set(idsArray.slice(-10));
    }
  }, [clearAllTimers]);

  // Called by CallProvider after capturing ended info for modal - resets to idle
  const dismissCall = useCallback(() => {
    console.log('[Call] dismissCall - resetting to idle');
    currentCallIdRef.current = null;
    setCallState(INITIAL_CALL_STATE);
  }, []);

  // Caller gets "connected" event quickly, but timer/billing starts only when media is truly live
  const activateCallerConnectedState = useCallback((callId: string) => {
    if (callEndedRef.current || billingStartedRef.current) {
      return;
    }

    // Allow connection if currentCallId is not set yet, but block mismatched call IDs
    if (currentCallIdRef.current && currentCallIdRef.current !== callId) {
      return;
    }

    currentCallIdRef.current = callId;

    // Mark call as accepted/connected to stop ringing timeout flow
    billingStartedRef.current = true;
    liveSessionStartedRef.current = false;
    clearAllTimers();

    setCallState(prev => ({
      ...prev,
      callId,
      status: 'connected',
      duration: 0,
      totalCoinsSpent: 0,
      hostEarned: 0,
    }));

    // Caller billing display fetch every 10s (real deductions still every 60s — display only)
    billingFetchIntervalRef.current = setInterval(async () => {
      if (callEndedRef.current || currentCallIdRef.current !== callId) {
        if (billingFetchIntervalRef.current) {
          clearInterval(billingFetchIntervalRef.current);
          billingFetchIntervalRef.current = null;
        }
        return;
      }

      try {
        const { data: callInfo } = await supabase
          .from('private_calls')
          .select('total_coins_deducted, host_earned, coins_per_minute')
          .eq('id', callId)
          .single();

        if (callInfo && !callEndedRef.current && currentCallIdRef.current === callId) {
          setCallState(prev => ({
            ...prev,
            totalCoinsSpent: callInfo.total_coins_deducted || 0,
            hostEarned: callInfo.host_earned || 0,
            coinsPerMinute: callInfo.coins_per_minute || prev.coinsPerMinute,
          }));
        }
      } catch (err) {
        console.error('[Caller] Error fetching billing info:', err);
      }
    }, 10000);

    toastRef.current({
      title: 'Call Connected',
      description: 'Host received and accepted your call',
    });
  }, [clearAllTimers]);

  // Function to deduct coins per minute
  const deductCoinsPerMinute = useCallback(async (callId: string) => {
    // Don't process if call ended
    if (callEndedRef.current || currentCallIdRef.current !== callId) {
      console.log('[Billing] Skipping - call ended or different call');
      return;
    }

    try {
      const { data, error } = await supabase.rpc('deduct_call_coins_per_minute', {
        p_call_id: callId,
      });

      if (error) {
        console.error('Error deducting coins:', error);
        return;
      }

      const result = data as any;
      
      if (!result.success) {
        if (result.call_ended) {
          toast({
            title: "Insufficient Coins",
            description: "Call ended due to low balance",
            variant: "destructive",
          });
          resetCallState();
        }
        return;
      }

      // Only update caller remaining - total spent/earned comes from DB fetch
      if (currentCallIdRef.current === callId && !callEndedRef.current) {
        setCallState(prev => ({
          ...prev,
          callerRemainingCoins: result.caller_remaining || 0,
        }));
      }

      console.log('[Billing] Minute charged:', result);
    } catch (err) {
      console.error('Billing error:', err);
    }
  }, [toast, resetCallState]);

  const notifyMediaConnected = useCallback((callId: string) => {
    if (!callId || callEndedRef.current) return;
    if (currentCallIdRef.current !== callId) return;
    if (liveSessionStartedRef.current) return;

    const isConnectedCall = callState.status === 'connected' && callState.callId === callId;
    if (!isConnectedCall) return;

    liveSessionStartedRef.current = true;

    // Start duration timer immediately when real media is live
    durationTimerRef.current = setInterval(() => {
      if (!callEndedRef.current && currentCallIdRef.current === callId) {
        setCallState(prev => ({ ...prev, duration: prev.duration + 1 }));
      }
    }, 1000);

    // Start caller billing only after media goes live (host never deducts)
    const isCurrentUserHost = !!userId && callState.hostId === userId;
    if (!isCurrentUserHost) {
      void deductCoinsPerMinute(callId);

      billingTimerRef.current = setInterval(() => {
        if (!callEndedRef.current && currentCallIdRef.current === callId) {
          void deductCoinsPerMinute(callId);
        }
      }, 60000);
    }
  }, [callState.status, callState.callId, callState.hostId, userId, deductCoinsPerMinute]);

  // Keep refs updated for stable subscription effect
  useEffect(() => {
    toastRef.current = toast;
    deductCoinsRef.current = deductCoinsPerMinute;
    resetCallStateRef.current = resetCallState;
    clearAllTimersRef.current = clearAllTimers;
    softEndCallRef.current = softEndCall;
  });

  const startCall = useCallback(async (hostId: string, streamId?: string) => {

    // 🔒 Native-only enforcement: Calls can ONLY be initiated from the Android app.
    // Web browsers (including PWA / mobile web) are blocked from placing private calls.
    if (!isNativeAndroidApp()) {
      toast({
        title: "Android App Required",
        description: "Private calls are available only in the MeriLive Android app. Please install/open the app to call.",
        variant: "destructive",
      });
      return null;
    }

    if (!userId) {
      toast({
        title: "Login Required",
        description: "Please login to make a call",
        variant: "destructive",
      });
      return null;
    }

    // GUARD: Prevent double invocation
    if (startingCallRef.current) {
      console.log('[Call] Already starting a call, ignoring duplicate');
      return null;
    }
    startingCallRef.current = true;

    try {
      // ✅ FIX: Force-clear ALL stale call state before starting new call
      // This ensures old call never reconnects
      callEndedRef.current = false;
      billingStartedRef.current = false;
      liveSessionStartedRef.current = false;
      currentCallIdRef.current = null;
      clearAllTimers();
      setCallState(INITIAL_CALL_STATE);
      setIncomingCall(null);
      
      // IMPORTANT: Do NOT auto-reset call status here.
      // Each new call must be created fresh by start_private_call RPC without force-ending any active call.

      // PARALLEL: Fetch user coins, host info, and admin call settings simultaneously
      // NOTE: Do NOT query the host's `profiles` row directly — RLS blocks non-owner SELECT.
      // Host busy/blocked/face-verified checks all run server-side inside `start_private_call` RPC.
      const [userProfileRes, hostProfileRes, settingsRes] = await Promise.all([
        supabase.from('profiles').select('coins, display_name, avatar_url, user_level').eq('id', userId).single(),
        supabase.from('profiles_public').select('display_name, avatar_url, is_online, host_level, call_rate_per_minute').eq('id', hostId).maybeSingle(),
        supabase.from('app_settings').select('setting_value').eq('setting_key', 'call_rates').maybeSingle(),
      ]);

      const userProfile = userProfileRes.data;
      const hostProfile = hostProfileRes.data;
      const callSettings = parseCallRateSettings(settingsRes.data?.setting_value);
      const callRate = resolveEffectiveCallRate({
        settings: callSettings,
        hostLevel: hostProfile?.host_level,
        customRate: hostProfile?.call_rate_per_minute,
      });

      if (!callRate || callRate <= 0) {
        toast({
          title: "Call Rate Not Set",
          description: "Admin call pricing is not configured yet",
          variant: "destructive",
        });
        return null;
      }

      if ((userProfile?.coins || 0) < callRate) {
        toast({
          title: "Insufficient Diamonds",
          description: `You need at least ${callRate} diamonds. Redirecting to recharge...`,
          variant: "destructive",
        });
        navigate('/recharge');
        return null;
      }

      // Host busy / blocked / face-verified checks happen inside the RPC (RLS-safe).

      // Reset connection/billing flags for new call
      billingStartedRef.current = false;
      liveSessionStartedRef.current = false;
      callEndedRef.current = false;
      
      setCallState(prev => ({ 
        ...prev, 
        status: 'calling', 
        remoteUserId: hostId,
        hostId: hostId,
        callerRemainingCoins: userProfile?.coins || 0,
      }));

      // ⚡ CRITICAL FIX: Send broadcast to host BEFORE the RPC call
      // Pkg84: FCM-only incoming-call delivery (Chamet/WhatsApp/Imo standard).
      // No more client-side Supabase broadcast on `incoming-call-${hostId}` —
      // `call-deliver` edge function (invoked below after RPC success) is the
      // SOLE delivery path: high-priority data FCM (foreground + background +
      // killed app wake) + `notifications` row insert (foreground in-app
      // bridge via useNotifications → window 'incoming-call-notification').

      // ⚡ Pre-warm LiveKit token for caller while RPC is in flight
      import('@/services/livekitService').then(({ warmLiveKitToken }) => {
        warmLiveKitToken(`call_placeholder_${hostId}`, 'call').catch(() => {});
      });

      const { data, error } = await supabase.rpc('start_private_call', {
        p_caller_id: userId,
        p_receiver_id: hostId,
        p_call_type: 'video',
      });


      if (error) {
        throw error;
      }

      const rpcPayload = (data && typeof data === 'object') ? data as Record<string, any> : null;

      // Server-side rejection (host busy, blocked, insufficient balance, etc.)
      if (rpcPayload && rpcPayload.success === false) {
        const reason = String(rpcPayload.error || '');
        const reasonMap: Record<string, { title: string; description: string }> = {
          host_busy_in_call: { title: 'Host Busy', description: 'Host is currently in another call' },
          host_busy_live: { title: 'Host Busy', description: 'Host is currently live' },
          hosts_cannot_initiate_user_calls: { title: 'Not Allowed', description: 'Hosts cannot initiate calls' },
          receiver_not_callable_host: { title: 'Unavailable', description: 'This user is not a callable host' },
          private_calls_disabled: { title: 'Calls Disabled', description: 'Private calls are temporarily disabled' },
          account_blocked: { title: 'Account Blocked', description: 'Account is blocked' },
          user_blocked: { title: 'Blocked', description: 'You and this host have blocked each other' },
          cannot_call_self: { title: 'Invalid', description: 'You cannot call yourself' },
          caller_busy_in_call: { title: 'Already in Call', description: 'You are already in another call' },
          native_app_required: { title: 'App Required', description: 'Private calls are available only in the MeriLive Android app' },
          call_rate_not_configured: { title: 'Call Rate Missing', description: 'Admin has not set a call rate for this host yet' },
          invalid_call_rate_config: { title: 'Config Error', description: 'Call rate config is invalid — contact admin' },
          unauthorized: { title: 'Unauthorized', description: 'Please log in again to make a call' },
        };
        const mapped = reasonMap[reason];
        if (reason === 'insufficient_balance' || reason === 'Insufficient balance') {
          toast({ title: 'Insufficient Diamonds', description: 'Please recharge to continue', variant: 'destructive' });
          navigate('/recharge');
        } else {
          toast({
            title: mapped?.title || 'Call Failed',
            description: mapped?.description || rpcPayload.message || reason || 'Please try again',
            variant: 'destructive',
          });
        }
        setCallState(prev => ({ ...prev, status: 'idle', callId: null }));
        return null;
      }


      const resolvedCallId = (rpcPayload?.call_id as string | undefined) || (typeof data === 'string' ? data : '');
      const resolvedCoinsPerMinute = Number(rpcPayload?.coins_per_minute ?? callRate);

      // Pkg84: client Supabase broadcast removed. `call-deliver` edge function
      // (invoked just below) is sole delivery path → FCM high-priority data
      // push + `notifications` row insert.
      currentCallIdRef.current = resolvedCallId;


      // ⚡ Pre-warm LiveKit token for caller side - room will connect instantly when host accepts
      import('@/services/livekitService').then(({ warmLiveKitToken }) => {
        warmLiveKitToken(`call_${resolvedCallId}`, 'call').catch(() => {});
      });

      setCallState(prev => ({
        ...prev,
        callId: resolvedCallId,
        status: 'calling',
        remoteUserId: hostId,
        hostId: hostId,
        remoteUserName: hostProfile?.display_name || 'Host',
        remoteUserAvatar: hostProfile?.avatar_url,
        remoteUserLevel: hostProfile?.host_level || 1,
        coinsPerMinute: resolvedCoinsPerMinute,
        totalCoinsSpent: 0,
        hostEarned: 0,
      }));

      // Reliable native call delivery in background (closed/background app).
      // 3-attempt retry with exponential backoff (1s, 2.5s) — aborts as soon
      // as the call is no longer ringing, and treats any non-2xx / network
      // failure as retryable. The edge function itself runs an additional
      // FCM retry loop + server-side realtime broadcast fallback, so the
      // call has 3 independent delivery paths (FCM, server broadcast,
      // client broadcast) each retried multiple times.
      void (async () => {
        const deliveryBody = {
          callId: resolvedCallId,
          calleeId: hostId,
          callerId: userId,
          callType: 'video',
          callerName: userProfile?.display_name || 'User',
          callerAvatar: userProfile?.avatar_url || '',
        };
        const backoffsMs = [0, 1000, 2500];
        for (let i = 0; i < backoffsMs.length; i++) {
          if (backoffsMs[i] > 0) {
            await new Promise(r => setTimeout(r, backoffsMs[i]));
          }
          if (
            callEndedRef.current ||
            currentCallIdRef.current !== resolvedCallId ||
            billingStartedRef.current
          ) {
            console.log('[Call] call-deliver retry aborted — call no longer ringing');
            return;
          }
          try {
            const { data, error } = await supabase.functions.invoke('call-deliver', {
              body: deliveryBody,
            });
            if (error) throw error;
            const fcmOk = !!(data && (data as any).fcmDelivered);
            const broadcastOk = !!(data && (data as any).broadcastDelivered);
            console.log(
              `[Call] call-deliver attempt ${i + 1} → fcm=${fcmOk} broadcast=${broadcastOk}`,
            );
            if (fcmOk || broadcastOk) return;
          } catch (pushError) {
            console.warn(
              `[Call] call-deliver attempt ${i + 1} failed, will retry:`,
              pushError,
            );
          }
        }
        console.warn('[Call] call-deliver exhausted retries without delivery');
      })();

      toast({
        title: "Calling...",
        description: `Calling ${hostProfile?.display_name || 'Host'}`,
      });

      const timeoutSeconds = settingsRes.data?.setting_value 
        ? ((settingsRes.data.setting_value as any)?.call_timeout_seconds || 30)
        : 30;
      
      const callIdForTimeout = resolvedCallId;
      callTimeoutRef.current = setTimeout(async () => {
        // Only timeout if still not connected for THIS call
        if (currentCallIdRef.current === callIdForTimeout && !callEndedRef.current && !billingStartedRef.current) {
          console.log('[Call] TIMEOUT - Host did not answer within', timeoutSeconds, 'seconds');
          try {
            await supabase.rpc('timeout_private_call', { _call_id: callIdForTimeout });
          } catch (err) {
            console.warn('[Call] Timeout RPC failed:', err);
          }
          resetCallState();
          toast({
            title: "Call Missed",
            description: "Host did not answer",
          });
        }
      }, timeoutSeconds * 1000);

      // FALLBACK POLLING: Prevent stuck calling screen if realtime signal is missed
      outgoingStatusPollRef.current = setInterval(async () => {
        if (callEndedRef.current || currentCallIdRef.current !== callIdForTimeout) {
          if (outgoingStatusPollRef.current) {
            clearInterval(outgoingStatusPollRef.current);
            outgoingStatusPollRef.current = null;
          }
          return;
        }

        try {
          const { data: liveCall } = await supabase
            .from('private_calls')
            .select('status, created_at, end_reason')
            .eq('id', callIdForTimeout)
            .maybeSingle();

          // If row disappeared unexpectedly, close safely
          if (!liveCall) {
            resetCallState();
            toast({
              title: 'Call Ended',
              description: 'Call session is no longer active',
            });
            return;
          }

          if (liveCall.status === 'pending' || liveCall.status === 'ringing') {
            setCallState(prev => (
              prev.callId === callIdForTimeout && prev.status === 'calling'
                ? { ...prev, status: 'ringing' }
                : prev
            ));
          }

          if (liveCall.status === 'connected') {
            activateCallerConnectedState(callIdForTimeout);
            return;
          }

          if (liveCall.status === 'declined' || liveCall.status === 'ended' || liveCall.status === 'missed') {
            resetCallState();
            if (liveCall.status === 'declined') {
              toast({ title: 'Call Declined', description: 'Host declined the call' });
            } else if (liveCall.status === 'missed') {
              toast({ title: 'Call Missed', description: 'Host did not answer' });
            } else {
              toast({ title: 'Call Ended', description: 'The call has ended' });
            }
          }

          // Hard fallback: age-based timeout enforcement
          const callAgeSec = Math.floor((Date.now() - new Date(liveCall.created_at).getTime()) / 1000);
          if (callAgeSec >= timeoutSeconds && (liveCall.status === 'pending' || liveCall.status === 'ringing')) {
            try {
              await supabase.rpc('timeout_private_call', { _call_id: callIdForTimeout });
            } catch (_) {}
            resetCallState();
            toast({
              title: 'Call Missed',
              description: 'Host did not answer in time',
            });
          }
        } catch (err) {
          console.warn('[Call] Poll fallback error:', err);
        }
      }, 1000);

      return data;
    } catch (error: any) {
      console.error('Error starting call:', error);
      setCallState(prev => ({ ...prev, status: 'idle', callId: null }));
      
      let errorMessage = "Please try again";
      if (error.message?.includes('busy')) {
        errorMessage = "Host is busy";
      } else if (error.message?.includes('yourself')) {
        errorMessage = "Cannot call yourself";
      } else if (error.message?.includes('already in a call')) {
        errorMessage = "You are already in a call";
      }
      
      toast({
        title: "Call Failed",
        description: errorMessage,
        variant: "destructive",
      });
      return null;
    } finally {
      startingCallRef.current = false;
    }
  }, [userId, toast, navigate]);

  // Accept an incoming call (Host side)
  const acceptCall = useCallback(async (callId: string) => {
    try {
      const incomingSnapshot = incomingCallIdRef.current === callId ? incomingCall : null;

      // ⚡ Optimistic connect UI first (don't wait for DB/network)
      callEndedRef.current = false;
      currentCallIdRef.current = callId;
      billingStartedRef.current = true; // connected acknowledged, stops timeout logic
      liveSessionStartedRef.current = false;
      clearAllTimers();
      setIncomingCall(null);

      setCallState(prev => ({
        ...prev,
        callId,
        status: 'connected',
        hostId: userId,
        remoteUserId: incomingSnapshot?.callerId || prev.remoteUserId || null,
        remoteUserName: incomingSnapshot?.callerName || prev.remoteUserName || 'User',
        remoteUserAvatar: incomingSnapshot?.callerAvatar || prev.remoteUserAvatar || null,
        remoteUserLevel: incomingSnapshot?.callerLevel || prev.remoteUserLevel || 1,
        duration: 0,
        totalCoinsSpent: 0,
        hostEarned: 0,
      }));

      // ⚡ Run accept RPC + call lookup in parallel
      const [callDataRes, acceptRes] = await Promise.all([
        supabase
          .from('private_calls')
          .select('caller_id, coins_per_minute')
          .eq('id', callId)
          .single(),
        supabase.rpc('accept_private_call', { _call_id: callId }),
      ]);

      if (acceptRes.error) {
        throw acceptRes.error;
      }

      const callData = callDataRes.data;

      // Apply exact caller/rate info when ready
      if (callData) {
        setCallState(prev => ({
          ...prev,
          remoteUserId: callData.caller_id || prev.remoteUserId,
          coinsPerMinute: callData.coins_per_minute || prev.coinsPerMinute,
          hostId: userId || prev.hostId,
        }));
      }

      // Fetch caller profile in background - non-blocking
      // 🔒 Pkg86 audit fix: cross-user read → profiles_public (RLS-safe, no coins leak)
      const callerProfilePromise = callData?.caller_id
        ? supabase
            .from('profiles_public')
            .select('display_name, avatar_url, user_level')
            .eq('id', callData.caller_id)
            .single()
        : Promise.resolve({ data: null } as any);

      Promise.resolve(callerProfilePromise).then(({ data: callerProfile }) => {
        if (callerProfile && !callEndedRef.current && currentCallIdRef.current === callId) {
          setCallState(prev => ({
            ...prev,
            remoteUserName: callerProfile.display_name || 'User',
            remoteUserAvatar: callerProfile.avatar_url || null,
            remoteUserLevel: callerProfile.user_level || 1,
          }));
        }
      }).catch(() => {});

      // ⚡ Notify caller instantly so they switch to connected UI without waiting for DB propagation.
      // Pkg86 audit: dual-path (LiveKit primary + Supabase fallback) — caller may not yet have
      // joined the LiveKit Room when host accepts, so Supabase broadcast remains as safety net
      // until LiveKit Room is established. publishCallAccepted retries up to 5s waiting for Room.
      if (callData?.caller_id) {
        // Primary: LiveKit DataPacket (sub-50ms once Room is up, retries 20×250ms)
        void publishCallAccepted(callId, { acceptedBy: userId });

        // Fallback: Supabase broadcast (works pre-Room)
        const callerChannel = supabase.channel(`call-end-listener-${callData.caller_id}`);
        Promise.resolve(new Promise<void>((resolve) => {
          const timeout = setTimeout(() => resolve(), 1500);
          callerChannel.subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              callerChannel
                .send({
                  type: 'broadcast',
                  event: 'call_accepted',
                  payload: { callId, acceptedBy: userId, at: Date.now() }
                })
                .finally(() => {
                  clearTimeout(timeout);
                  resolve();
                });
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              clearTimeout(timeout);
              resolve();
            }
          });
        })).finally(() => {
          Promise.resolve(supabase.removeChannel(callerChannel)).catch(() => {});
        });
      }


      // Host billing display fetch every 10s (billing changes every 60s — display only)
      billingFetchIntervalRef.current = setInterval(async () => {
        if (callEndedRef.current || currentCallIdRef.current !== callId) {
          if (billingFetchIntervalRef.current) {
            clearInterval(billingFetchIntervalRef.current);
            billingFetchIntervalRef.current = null;
          }
          return;
        }

        try {
          const { data: callInfo } = await supabase
            .from('private_calls')
            .select('total_coins_deducted, host_earned, coins_per_minute')
            .eq('id', callId)
            .single();

          if (callInfo && !callEndedRef.current) {
            setCallState(prev => ({
              ...prev,
              totalCoinsSpent: callInfo.total_coins_deducted || 0,
              hostEarned: callInfo.host_earned || 0,
              coinsPerMinute: callInfo.coins_per_minute || prev.coinsPerMinute,
            }));
          }
        } catch (err) {
          console.error('[Host] Error fetching billing info:', err);
        }
      }, 10000);

      toast({
        title: "Call Connected",
        description: "Call connected successfully",
      });

      return true;
    } catch (error: any) {
      console.error('Error accepting call:', error);
      resetCallState();
      toast({
        title: "Call Failed",
        description: error.message,
        variant: "destructive",
      });
      return false;
    }
  }, [toast, clearAllTimers, userId, incomingCall, resetCallState]);

  // Decline an incoming call
  const declineCall = useCallback(async (callId: string) => {
    try {
      const { error } = await supabase.rpc('decline_private_call', {
        _call_id: callId,
      });

      if (error) throw error;

      setIncomingCall(null);
      toast({
        title: "Call Declined",
      });

      return true;
    } catch (error: any) {
      console.error('Error declining call:', error);
      return false;
    }
  }, [toast]);

  // End the current call - INSTANT response
  // ✅ FIX: Use refs to avoid stale closures from volatile values (duration/coins change every second)
  const callStateRef = useRef(callState);
  callStateRef.current = callState;

  const endCall = useCallback(async (reason: string = 'normal') => {
    const cs = callStateRef.current;
    const callIdToEnd = cs.callId;
    
    if (!callIdToEnd) {
      console.log('[Call] No call to end');
      return false;
    }

    // Immediately mark as ended to prevent any reactivation
    callEndedRef.current = true;
    if (callIdToEnd) endedCallIdsRef.current.add(callIdToEnd);
    currentCallIdRef.current = null;
    const finalDuration = cs.duration;
    const hostId = cs.hostId;
    const isHost = userId === hostId;

    console.log('[Call] INSTANT ending call:', callIdToEnd, 'reason:', reason, 'isHost:', isHost);

    // Clear timers immediately
    clearAllTimers();

    try {
      // 🔴 Pkg78: Supabase `call_ended` broadcast REMOVED — LiveKit DataPacket
      // (publishCallEnded below) is the sole peer-hangup notifier. Saves
      // ~1 Realtime channel open + send + close per call hangup.

      const rpcPromise = supabase.rpc('end_private_call', {
        _call_id: callIdToEnd,
        _end_reason: reason,
      }).then(({ error }) => {
        if (error) console.error('[Call] RPC error:', error);
      });

      // Pkg73: also publish via LiveKit DataPacket — sub-50ms peer notify.
      // Fire-and-forget; Supabase broadcast above is the always-on fallback.
      const livekitPromise = publishCallEnded(callIdToEnd, {
        endedBy: userId!,
        reason,
        duration: finalDuration,
      }).catch(() => false);

      // Run RPC + LiveKit in parallel (Pkg78: Supabase broadcast removed)
      await Promise.all([
        rpcPromise,
        livekitPromise,
      ]);
      
      
      console.log('[Call] ⚡ Call ended + is_in_call reset in <1 second');

      // Reset state INSTANTLY
      setCallState(INITIAL_CALL_STATE);
      setIncomingCall(null);

      // Show toast with local duration immediately
      const durationStr = `${Math.floor(finalDuration / 60)}:${String(finalDuration % 60).padStart(2, '0')}`;
      if (isHost) {
        toast({ title: "Call Ended", description: `Duration: ${durationStr} | Earned: ${cs.hostEarned} beans` });
      } else {
        toast({ title: "Call Ended", description: `Duration: ${durationStr}` });
      }

      // ☠️ DEAD FOREVER: 3-second cooldown before allowing new calls
      setTimeout(() => { callEndedRef.current = false; }, 3000);

      // 🔵 NON-BLOCKING: Background tasks (finalize, conversation) - fire and forget
      const bgOtherUserId = cs.remoteUserId;
      setTimeout(async () => {
        try { await supabase.rpc('finalize_first_minute_earnings', { p_call_id: callIdToEnd }); } catch (_) {}
        
        if (bgOtherUserId && userId) {
          try {
            const { data: existingConv } = await supabase
              .from('conversations')
              .select('id')
              .or(`and(participant1_id.eq.${userId},participant2_id.eq.${bgOtherUserId}),and(participant1_id.eq.${bgOtherUserId},participant2_id.eq.${userId})`)
              .maybeSingle();
            if (!existingConv) {
              await supabase.from('conversations').insert({
                participant1_id: userId, participant2_id: bgOtherUserId, last_message_at: new Date().toISOString()
              });
            }
          } catch (_) {}
        }
      }, 100);

      return true;
    } catch (error: any) {
      console.error('Error ending call:', error);
      setCallState(INITIAL_CALL_STATE);
      setIncomingCall(null);
      
      // 🔒 EMERGENCY: Force reset is_in_call even on total failure
      try { await supabase.rpc('reset_my_call_status'); } catch (_) {}
      
      setTimeout(() => { callEndedRef.current = false; }, 3000);
      return false;
    }
  }, [userId, toast, clearAllTimers]);

  // SAFETY NOTE:
  // Do NOT auto-call reset_my_call_status on mount.
  // That can accidentally end a real connected call after resume/remount.
  // Calls should end ONLY by:
  // 1) user/host manual end
  // 2) insufficient coins billing cutoff
  // 3) explicit timeout/missed flow for unanswered calls

  // ============ CHECK FOR PENDING CALLS ON MOUNT/FOCUS ============
  // Fallback only: instant delivery is handled by broadcast + realtime listeners below.
  useEffect(() => {
    if (!userId) return;

    let isCleanedUp = false;
    let pollingInterval: ReturnType<typeof setInterval> | null = null;
    let appResumeCleanup: (() => void) | undefined;

    const checkPendingCalls = async () => {
      if (isCleanedUp) return;
      // ✅ On native platforms (Capacitor), ALWAYS check - visibilityState unreliable during streaming
      const isNative = Capacitor.isNativePlatform();
      if (!isNative && document.visibilityState !== 'visible') return;
      
      // ✅ Only skip if GENUINELY in an active call (connected/calling/ringing with valid ID)
      const currentStatus = callStateRef.current.status;
      if (currentCallIdRef.current && (currentStatus === 'connected' || currentStatus === 'calling' || currentStatus === 'ringing')) {
        return;
      }
      // Don't skip if we already have an incoming call shown (allow refresh of same call)
      if (pendingCallCheckInFlightRef.current) return;

      pendingCallCheckInFlightRef.current = true;
      try {
        const { data: pendingCalls } = await supabase
          .from('private_calls')
          .select('id, caller_id, status, created_at')
          .eq('host_id', userId)
          .in('status', ['pending', 'ringing'])
          .order('created_at', { ascending: false })
          .limit(1);

        if (!pendingCalls || pendingCalls.length === 0) return;
        const call = pendingCalls[0];

        // NEVER show a call we already ended
        if (endedCallIdsRef.current.has(call.id)) return;

        // Only show if call is recent (within 30 seconds — industry standard)
        const callAge = Date.now() - new Date(call.created_at).getTime();
        if (callAge >= 30000) return;

        // ⚡ Fetch caller profile WITHOUT re-verifying call status (broadcast already validated)
        const { data: callerProfile } = await supabase
          .from('profiles_public')
          .select('display_name, avatar_url, user_level')
          .eq('id', call.caller_id)
          .single();

        // Quick staleness check - don't override if actively in a call
        if (endedCallIdsRef.current.has(call.id)) return;
        const activeStatus = callStateRef.current.status;
        if (currentCallIdRef.current && (activeStatus === 'connected' || activeStatus === 'calling' || activeStatus === 'ringing')) return;

        // ⚡ Pre-warm LiveKit token for faster accept
        import('@/services/livekitService').then(({ warmLiveKitToken }) => {
          warmLiveKitToken(`call_${call.id}`, 'call').catch(() => {});
        });

        // ✅ CRITICAL: Force-reset callEndedRef for new incoming call
        callEndedRef.current = false;

        setIncomingCall({
          callId: call.id,
          callerId: call.caller_id,
          callerName: callerProfile?.display_name || 'User',
          callerAvatar: callerProfile?.avatar_url || null,
          callerLevel: callerProfile?.user_level || 1,
        });

        // 📳 NATIVE: Vibrate phone for incoming call
        if (typeof (window as any).Capacitor !== 'undefined') {
          import('@capacitor/haptics').then(({ Haptics, ImpactStyle }) => {
            Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {});
            setTimeout(() => Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {}), 300);
            setTimeout(() => Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {}), 600);
          }).catch(() => {});
        }
      } catch (err) {
        console.warn('[Call] Error checking pending calls:', err);
      } finally {
        pendingCallCheckInFlightRef.current = false;
      }
    };

    const startFallbackPolling = () => {
      if (isCleanedUp) return;

      // One immediate check, then low-frequency fallback polling.
      void checkPendingCalls();

      pollingInterval = setInterval(() => {
        void checkPendingCalls();
      }, FALLBACK_PENDING_CALL_POLL_MS);
    };

    startFallbackPolling();

    // Check when app comes back to foreground
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void checkPendingCalls();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Native app resume handler
    if (Capacitor.isNativePlatform()) {
      import('@capacitor/app').then(({ App }) => {
        App.addListener('resume', () => {
          void checkPendingCalls();
        }).then(listener => {
          appResumeCleanup = () => listener.remove();
        });
      }).catch(() => {});
    }

    return () => {
      isCleanedUp = true;
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      appResumeCleanup?.();
    };
  }, [userId]);

  // 🔴 Pkg84: INCOMING CALL LISTENER — FCM-only (Chamet/WhatsApp/Imo standard)
  // The `incoming-call-${userId}` Supabase Realtime channel + 15s heartbeat
  // are DELETED. `call-deliver` edge function (caller-side) inserts a
  // `notifications` row + sends FCM high-priority data push. `useNotifications`
  // listens on its already-active `notifications` subscription and bridges
  // type='incoming_call' rows to `window 'incoming-call-notification'`.
  // This removes one realtime channel + 15s polling tick per logged-in user
  // ($1400-bill rule win) while gaining background/killed-app delivery.
  useEffect(() => {
    if (!userId) return;

    console.log('[Pkg84] Setting up FCM-bridge incoming call listener for:', userId);
    let isCleanedUp = false;

    const handleIncomingNotification = (evt: Event) => {
      if (isCleanedUp) return;
      const detail = (evt as CustomEvent).detail;
      const data = detail?.data || detail;
      const callId = typeof data?.callId === 'string' ? data.callId.trim() : '';
      if (!callId) return;
      console.log('[Pkg84] ⚡ Incoming call via FCM-bridge:', callId);

      if (endedCallIdsRef.current.has(callId)) {
        console.log('[Pkg84] Skipping - already ended call');
        return;
      }

      const currentStatus = callStateRef.current.status;
      const activeCallId = currentCallIdRef.current;
      if (activeCallId && activeCallId !== callId && (currentStatus === 'connected' || currentStatus === 'calling' || currentStatus === 'ringing')) {
        console.log('[Pkg84] Skipping - actively in another call:', activeCallId);
        return;
      }

      callEndedRef.current = false;

      setIncomingCall({
        callId,
        callerId: data.callerId,
        callerName: data.callerName || 'User',
        callerAvatar: data.callerAvatar || null,
        callerLevel: data.callerLevel || 1,
      });

      // ⚡ Pre-warm LiveKit token
      import('@/services/livekitService').then(({ warmLiveKitToken }) => {
        warmLiveKitToken(`call_${callId}`, 'call').catch(() => {});
      });

      // 📳 NATIVE: Vibrate phone for incoming call
      if (typeof (window as any).Capacitor !== 'undefined') {
        import('@capacitor/haptics').then(({ Haptics, ImpactStyle }) => {
          Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {});
          setTimeout(() => Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {}), 300);
          setTimeout(() => Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {}), 600);
        }).catch(() => {});
      }

      toastRef.current({
        title: "Incoming Call",
        description: `${data.callerName || 'User'} is calling you`,
      });
    };

    window.addEventListener('incoming-call-notification', handleIncomingNotification);

    return () => {
      isCleanedUp = true;
      window.removeEventListener('incoming-call-notification', handleIncomingNotification);
    };
  }, [userId]);


  // 🔴 CALL-END BROADCAST LISTENER: Instant call termination for BOTH parties
  // When either side ends the call, the other side gets notified in <100ms via broadcast
  // This is MUCH faster than waiting for DB realtime (which can take 1-3 seconds)
  useEffect(() => {
    if (!userId) return;
    let isCleanedUp = false;

    // Listen for call-end broadcasts for ANY call we're part of
    // We subscribe to our own channel so the other party can notify us
    const endChannel = supabase
      .channel(`call-end-listener-${userId}`)
      .on('broadcast', { event: 'call_accepted' }, (payload) => {
        if (isCleanedUp) return;
        const data = payload.payload as any;
        if (!data?.callId) return;

        const trackedCallId = currentCallIdRef.current || callStateRef.current.callId;

        // Ignore events from a different active call; if callId isn't set yet, bind now
        if (trackedCallId && trackedCallId !== data.callId) return;
        if (!trackedCallId) {
          currentCallIdRef.current = data.callId;
          setCallState(prev => (
            prev.status === 'calling' || prev.status === 'ringing'
              ? { ...prev, callId: data.callId }
              : prev
          ));
        }

        if (endedCallIdsRef.current.has(data.callId) || callEndedRef.current) return;

        console.log('[Broadcast] ⚡ INSTANT call-accepted received for:', data.callId);
        activateCallerConnectedState(data.callId);
      })
      // Pkg78: Supabase `call_ended` listener REMOVED — Pkg73 LiveKit
      // DataPacket (livekit-call-ended window event handler below) is the
      // sole peer-hangup receiver. `call_accepted` broadcast is retained
      // because it's outside Pkg73 scope (caller-side accept signaling).
      .subscribe();

    // 🔥 Pkg73: LiveKit DataPacket peer notification (sub-50ms, no DB round-trip).
    // Mirrors the Supabase 'call_ended' handler above; both paths converge on
    // softEndCallRef + endedCallIdsRef so the same call is processed exactly once.
    const handleLiveKitCallEnded = (ev: Event) => {
      if (isCleanedUp) return;
      const detail = (ev as CustomEvent<CallEndedDetail>).detail;
      if (!detail?.callId) return;

      const trackedCallId = currentCallIdRef.current || callStateRef.current.callId;
      if (trackedCallId !== detail.callId) return;

      if (endedCallIdsRef.current.has(detail.callId) || callEndedRef.current) return;
      if (detail.endedBy === userId) return;

      console.log('[Pkg73] ⚡ LiveKit call-end received for:', detail.callId, 'by:', detail.endedBy);
      softEndCallRef.current?.();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('livekit-call-ended', handleLiveKitCallEnded);
    }

    return () => {
      isCleanedUp = true;
      supabase.removeChannel(endChannel);
      if (typeof window !== 'undefined') {
        window.removeEventListener('livekit-call-ended', handleLiveKitCallEnded);
      }
    };
  }, [userId]);

  // 🔵 METHOD 2: Universal realtime listener (no extra filtered channels)
  // Handles call status updates for both caller and host
  useEffect(() => {
    if (!userId) {
      console.log('[Realtime] No userId, skipping subscription');
      return;
    }

    console.log('[Realtime] Setting up universal call subscription for user:', userId);
    let isCleanedUp = false;

    const subscriberId = `calls-${userId}-${Date.now()}`;

    const unsubscribe = subscribeToTables(
      subscriberId,
      ['private_calls'],
      async (_table, event, rawPayload) => {
        if (isCleanedUp) return;

        const callData = rawPayload as any;
        const callId = callData?.id;
        if (!callId) return;

        if (event === 'INSERT') {
          if (callData.host_id !== userId) return;

           // NEVER show a call we already ended
           if (endedCallIdsRef.current.has(callData.id)) return;

           // Only skip if we're GENUINELY in another active call
           const activeId = currentCallIdRef.current;
           const activeStatus = callStateRef.current.status;
           if (activeId && activeId !== callData.id && (activeStatus === 'connected' || activeStatus === 'calling' || activeStatus === 'ringing')) return;

           if (callData.status !== 'pending' && callData.status !== 'ringing') return;

          // ⚡ Fetch caller profile WITHOUT re-verifying call status
          // Broadcast already validated - skip the freshCall DB roundtrip
          const { data: callerProfile } = await supabase
            .from('profiles')
            .select('display_name, avatar_url, user_level')
            .eq('id', callData.caller_id)
            .single();

          if (isCleanedUp) return;
          if (endedCallIdsRef.current.has(callData.id)) return;

          // ⚡ Pre-warm LiveKit token for faster accept
          import('@/services/livekitService').then(({ warmLiveKitToken }) => {
            warmLiveKitToken(`call_${callData.id}`, 'call').catch(() => {});
          });

          // ✅ CRITICAL: Force-reset callEndedRef for realtime-delivered calls
          callEndedRef.current = false;

          setIncomingCall({
            callId: callData.id,
            callerId: callData.caller_id,
            callerName: callerProfile?.display_name || 'User',
            callerAvatar: callerProfile?.avatar_url || null,
            callerLevel: callerProfile?.user_level || 1,
          });

          // 📳 NATIVE: Vibrate phone for incoming call
          if (typeof (window as any).Capacitor !== 'undefined') {
            import('@capacitor/haptics').then(({ Haptics, ImpactStyle }) => {
              Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {});
              setTimeout(() => Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {}), 300);
              setTimeout(() => Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {}), 600);
            }).catch(() => {});
          }

          toastRef.current({
            title: 'Incoming Call',
            description: `${callerProfile?.display_name || 'User'} is calling you`,
          });

          return;
        }

        if (event !== 'UPDATE') return;

        const newStatus = callData.status;

        // Caller-side updates
        if (callData.caller_id === userId) {
          const trackedCallerCallId = currentCallIdRef.current || callStateRef.current.callId;
          const isTerminalStatus = newStatus === 'declined' || newStatus === 'ended' || newStatus === 'missed';

          // Ignore stale terminal updates from older calls (prevents auto-close race)
          if (isTerminalStatus && (!trackedCallerCallId || trackedCallerCallId !== callId)) {
            return;
          }

          if (endedCallIdsRef.current.has(callId)) return;
          if (callEndedRef.current) return;
          if (trackedCallerCallId && trackedCallerCallId !== callId) return;

          if (newStatus === 'pending' || newStatus === 'ringing') {
            // Caller can now see that host side is ringing
            setCallState(prev => (
              prev.callId === callId && (prev.status === 'calling' || prev.status === 'ringing')
                ? { ...prev, status: 'ringing' }
                : prev
            ));
          } else if (newStatus === 'connected') {
            activateCallerConnectedState(callId);
          } else if (newStatus === 'declined' || newStatus === 'ended' || newStatus === 'missed') {
            // ✅ Soft-end: keep data for CallEndedModal
            softEndCallRef.current?.();
          }
        }

        // Host-side updates
        if (callData.host_id === userId) {
          const trackedHostCallId = currentCallIdRef.current || callStateRef.current.callId;
          const isTerminalStatus = newStatus === 'ended' || newStatus === 'declined' || newStatus === 'missed';

          // Ignore unrelated terminal updates to avoid closing current/next call accidentally
          if (isTerminalStatus && trackedHostCallId && trackedHostCallId !== callId) return;

          if (endedCallIdsRef.current.has(callId)) return;
          if (callEndedRef.current) return;

          if (newStatus === 'ended' || newStatus === 'declined' || newStatus === 'missed') {
            // ✅ Soft-end: keep data for CallEndedModal
            softEndCallRef.current?.();
          }
        }
      }
    );

    return () => {
      isCleanedUp = true;
      unsubscribe();
      clearAllTimersRef.current?.();
    };
  }, [userId]);

  return {
    callState,
    incomingCall,
    startCall,
    acceptCall,
    declineCall,
    endCall,
    dismissCall,
    notifyMediaConnected,
  };
}