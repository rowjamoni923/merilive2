import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
// subscribeToTables import removed in Phase 3 B1 fix (duplicate listener purged).

import { updateCachedBalance } from '@/hooks/useUserBalance';
import { useToast } from '@/hooks/use-toast';
import { isNativeAndroidApp } from '@/utils/nativeUtils';
import { parseCallRateSettings, resolveEffectiveCallRate } from '@/utils/callRateSettings';
import { getAppSetting } from '@/utils/appSettingsCache';
import { publishCallEnded, publishCallAccepted, type CallEndedDetail, type CallAcceptedDetail } from '@/lib/livekitCallSignaling';
import { NativeCall } from '@/plugins/NativeCall';
import { NativeCamera } from '@/plugins/NativeCamera';
import { clearPreparedCallMediaStream } from '@/features/call/preparedCallMedia';
import { shouldUseNativeLiveKit } from '@/lib/nativeLiveKitGate';
import { whenNativeLiveKitKillSwitchReady } from '@/lib/nativeLiveKitKillSwitch';
import { getRequiredDisplayLevel } from '@/utils/stableLevel';

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

// Incoming-call instant delivery is FCM notifications + a scoped private_calls
// realtime listener. Zero-refresh policy forbids REST polling/resume checks.
const DEFAULT_INCOMING_CALL_TIMEOUT_SECONDS = 60;
const INCOMING_CALL_STALE_BUFFER_MS = 5000;

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
  // Honest-private-call fix (F-11): true while LiveKit is mid-reconnect.
  // Driven by `livekit-call-reconnecting` / `livekit-call-reconnected`
  // window events from useLiveKitCall. Pauses the visible duration counter
  // so users don't see seconds tick during a frozen feed.
  const reconnectingRef = useRef<boolean>(false);
  const toastRef = useRef(toast);
  const deductCoinsRef = useRef<((callId: string) => Promise<void>) | null>(null);
  const resetCallStateRef = useRef<(() => void) | null>(null);
  const clearAllTimersRef = useRef<(() => void) | null>(null);
  // Track ended call IDs to NEVER show them again
  const endedCallIdsRef = useRef<Set<string>>(new Set());
  const incomingCallIdRef = useRef<string | null>(null);
  const pendingCallCheckInFlightRef = useRef(false);
  const softEndCallRef = useRef<(() => void) | null>(null);

  const showVerifiedIncomingCall = useCallback(async (callId: string) => {
    if (!userId || !callId || endedCallIdsRef.current.has(callId)) return false;
    if (incomingCallIdRef.current === callId) return true;

    const { data: call, error } = await supabase
      .from('private_calls')
      .select('id, caller_id, host_id, status, created_at')
      .eq('id', callId)
      .maybeSingle();

    if (error || !call) return false;
    if (call.host_id !== userId) return false;

    if (call.status !== 'pending' && call.status !== 'ringing') {
      if (incomingCallIdRef.current === callId) {
        incomingCallIdRef.current = null;
        setIncomingCall(null);
      }
      endedCallIdsRef.current.add(callId);
      return false;
    }

    const ageMs = Date.now() - new Date(call.created_at).getTime();
    if (ageMs > DEFAULT_INCOMING_CALL_TIMEOUT_SECONDS * 1000 + INCOMING_CALL_STALE_BUFFER_MS) return false;

    const activeStatus = callStateRef.current.status;
    const activeCallId = currentCallIdRef.current;
    if (activeCallId && activeCallId !== callId && (activeStatus === 'connected' || activeStatus === 'calling' || activeStatus === 'ringing')) {
      return false;
    }

    const { data: callerProfile } = await supabase
      .from('profiles_public')
      .select('display_name, avatar_url, user_level, host_level, max_user_level, gender, is_host')
      .eq('id', call.caller_id)
      .maybeSingle();

    if (endedCallIdsRef.current.has(callId)) return false;
    const latestStatus = callStateRef.current.status;
    const latestActiveCallId = currentCallIdRef.current;
    if (latestActiveCallId && latestActiveCallId !== callId && (latestStatus === 'connected' || latestStatus === 'calling' || latestStatus === 'ringing')) {
      return false;
    }

    callEndedRef.current = false;
    incomingCallIdRef.current = callId;
    setIncomingCall({
      callId,
      callerId: call.caller_id,
      callerName: callerProfile?.display_name || 'User',
      callerAvatar: callerProfile?.avatar_url || null,
      callerLevel: getRequiredDisplayLevel(callerProfile),
    });
    // 🚀 Receiver-side LiveKit token pre-warm. Without this, the first
    // call to getLiveKitToken happens AFTER the host taps Accept, adding
    // the LiveKit edge-fn round-trip (typically 300–900ms on mid-tier
    // 4G) directly to the "Connecting…" gap. Warming during the ring
    // means accept→room.connect runs against an already-cached JWT, so
    // the ActiveCallScreen flips from RINGING to LIVE almost instantly.
    // Safe to call even if the user declines — the cached token simply
    // expires unused.
    import('@/services/livekitService').then(({ warmLiveKitToken }) => {
      warmLiveKitToken(`call_${callId}`, 'call').catch(() => {});
    }).catch(() => {});
    // 🚀 Preload the ActiveCallScreen lazy chunk (172KB livekit-client +
    // call UI) the moment the ring surfaces, so the Suspense fallback
    // never has to repaint after accept. The CallProvider does this on
    // idle as well, but a fresh cold-start that boots directly into an
    // incoming call may not have idle-prefetched yet.
    import('@/components/call/ActiveCallScreen').catch(() => {});
    return true;
  }, [userId]);

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
    const wasAlreadyEnded = !!callIdToReset && endedCallIdsRef.current.has(callIdToReset);
    
    // Mark this call ID as permanently ended - NEVER show it again
    if (callIdToReset) {
      endedCallIdsRef.current.add(callIdToReset);
    }
    
    callEndedRef.current = true;
    billingStartedRef.current = false;
    liveSessionStartedRef.current = false;
    currentCallIdRef.current = null;
    clearAllTimers();
    // Section#5 pass-4: every non-manual reset path (missed/declined/accept
    // failure/row vanished) must also tear down Android Telecom + any native
    // incoming UI. Otherwise BT audio/system call-log can stay stuck until app kill.
    if (callIdToReset && isNativeAndroidApp() && !wasAlreadyEnded) {
      NativeCall.reportCallEnded({ callId: callIdToReset, remote: true }).catch(() => {});
      NativeCall.endIncomingUi({ callId: callIdToReset, reason: 'ended' }).catch(() => {});
      NativeCall.closeInCallActivity({ callId: callIdToReset }).catch(() => {});
    }
    if (callIdToReset && isNativeAndroidApp() && wasAlreadyEnded) {
      NativeCall.endIncomingUi({ callId: callIdToReset, reason: 'ended' }).catch(() => {});
      NativeCall.closeInCallActivity({ callId: callIdToReset }).catch(() => {});
    }
    if (callIdToReset && isNativeAndroidApp()) {
      NativeCamera.stop().catch(() => {});
      clearPreparedCallMediaStream(callIdToReset, { stopTracks: true });
    }
    setCallState(INITIAL_CALL_STATE);
    setIncomingCall(null);
    
    // SAFETY: Reset own is_in_call in DB. The peer's row is updated
    // server-side inside `end_private_call` (settle + UPDATE on both ids).
    // Pkg86 audit: removed client-side cross-user UPDATE — it was silently
    // RLS-filtered for the other party (dead code) and not needed since the
    // RPC at line 132 + server `end_private_call` already cover both parties.
    if (userId) {
      Promise.resolve(supabase.rpc('reset_my_call_status')).then(() => {
        console.log('[Call] DB is_in_call reset for current user');
      }).catch(err => console.warn('[Call] Failed to reset DB call status:', err));
    }

    
    // ☠️ DEAD FOREVER POLICY: Once a call ends, it NEVER comes back
    // Like WhatsApp/IMO/Chamet - ended call = dead forever. New call = fresh start.
    // This prevents one caller's ended session from being picked up by another session.
    // The RPC 'reset_my_call_status' and 'end_private_call' ensure the DB state is clean.
    if (callIdToReset) {
      console.log(`[Call] Call ${callIdToReset} is now dead forever.`);
    }

    // Phase-3 C3: the 3-second cooldown is REMOVED.  Per-callId block in
    // endedCallIdsRef is sufficient — the cooldown used to silently block
    // Accept on a brand-new incoming call that arrived within 3s of ending a
    // previous call.  Keep callEndedRef false so the next call can come in
    // immediately.

    
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
    // Pkg211 — tear down Telecom connection (releases BT audio + closes log)
    if (cid && isNativeAndroidApp()) {
      NativeCall.reportCallEnded({ callId: cid, remote: true }).catch(() => {});
      NativeCall.endIncomingUi({ callId: cid, reason: 'ended' }).catch(() => {});
      NativeCall.closeInCallActivity({ callId: cid }).catch(() => {});
      NativeCamera.stop().catch(() => {});
      clearPreparedCallMediaStream(cid, { stopTracks: true });
    }
    // Phase-3 C3: 3s cooldown removed — endedCallIdsRef is sufficient.
    // Do NOT set a timeout that blocks new incoming calls.
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

    // Pkg211 — promote Telecom connection to active for outgoing caller
    if (isNativeAndroidApp()) {
      NativeCall.reportCallConnected({ callId }).catch(() => {});
    }

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

  // Phase 3 fix (B1): the duplicate subscribeToTables listener that used to live
  // here was removed. The scoped supabase.channel(`private-call-${userId}`)
  // listener further down is the single authoritative Realtime path for
  // private_calls — having two fired activateCallerConnectedState / softEndCall
  // twice, spawning duplicate billing timers and duplicate toasts.


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
            title: "Insufficient Diamonds",
            description: "Call ended due to low balance",
            variant: "destructive",
          });
          resetCallState();
        }
        return;
      }

      // Only update caller remaining - total spent/earned comes from DB fetch
      // RPC returns `caller_balance` (post-deduction); older code read `caller_remaining` which is undefined.
      const remaining = (typeof result.caller_balance === 'number')
        ? result.caller_balance
        : (typeof result.caller_remaining === 'number' ? result.caller_remaining : undefined);
      if (currentCallIdRef.current === callId && !callEndedRef.current && typeof remaining === 'number') {
        setCallState(prev => ({
          ...prev,
          callerRemainingCoins: remaining,
        }));
        // Mirror to global cached balance so Profile/header updates instantly
        try { updateCachedBalance(remaining); } catch {}
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
      if (callEndedRef.current) return;
      if (currentCallIdRef.current !== callId) return;
      // Honest-private-call fix (F-11): don't tick the visible duration
      // while LiveKit is mid-reconnect.
      if (reconnectingRef.current) return;
      setCallState(prev => ({ ...prev, duration: prev.duration + 1 }));
    }, 1000);

    // Phase 3B (Step 3): client-side per-minute billing REMOVED.
    // Server cron `call-billing-tick` → `bill_call_minute()` is the single source
    // of truth (idempotent UNIQUE(call_id, minute_number), FOR UPDATE SKIP LOCKED).
    // Running a parallel client setInterval here re-introduced double-charge.
    // Live coin counter now refreshes from the `private_calls` realtime UPDATE
    // payload (caller-side handler below) when bill_call_minute writes
    // last_billed_minute / total_minutes_billed.
    void deductCoinsPerMinute; // keep symbol referenced for dev-tools/debug only
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
      if (isNativeAndroidApp()) void whenNativeLiveKitKillSwitchReady().catch(() => {});
      if (isNativeAndroidApp() && !shouldUseNativeLiveKit({ feature: 'private-call' })) {
        throw new Error('Native Android LiveKit is required for private calls. Web camera fallback is disabled.');
      }
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
      const [userProfileRes, hostProfileRes, callRatesSetting] = await Promise.all([
        supabase.from('profiles').select('coins, display_name, avatar_url, user_level, host_level, max_user_level, gender, is_host').eq('id', userId).single(),
        supabase.from('profiles_public').select('display_name, avatar_url, is_online, user_level, host_level, max_user_level, gender, is_host, call_rate_per_minute').eq('id', hostId).maybeSingle(),
        getAppSetting<unknown>('call_rates'),
      ]);

      const userProfile = userProfileRes.data;
      const hostProfile = hostProfileRes.data;
      const callSettings = parseCallRateSettings(callRatesSetting);
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
          host_offline: { title: 'Host Offline', description: 'This host is currently offline' },
          host_busy: { title: 'Host Busy', description: 'This host is currently busy' },
          private_calls_disabled: { title: 'Calls Disabled', description: 'Private calls are temporarily disabled' },
          account_blocked: { title: 'Account Blocked', description: 'Account is blocked' },
          user_blocked: { title: 'Blocked', description: 'You and this host have blocked each other' },
          cannot_call_self: { title: 'Invalid', description: 'You cannot call yourself' },
          caller_busy_in_call: { title: 'Already in Call', description: 'You are already in another call' },
          native_app_required: { title: 'App Required', description: 'Private calls are available only in the MeriLive Android app' },
          call_rate_not_configured: { title: 'Call Rate Missing', description: 'Admin has not set a call rate for this host yet' },
          invalid_call_rate_config: { title: 'Config Error', description: 'Call rate config is invalid — contact admin' },
          unauthorized: { title: 'Unauthorized', description: 'Please log in again to make a call' },
          internal_error: { title: 'Server Error', description: 'A server-side error occurred — please try again' },
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
      const resolvedTimeoutSeconds = Number(
        rpcPayload?.timeout_seconds ?? callSettings.call_timeout_seconds ?? DEFAULT_INCOMING_CALL_TIMEOUT_SECONDS,
      ) || DEFAULT_INCOMING_CALL_TIMEOUT_SECONDS;

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
        remoteUserLevel: getRequiredDisplayLevel(hostProfile),
        coinsPerMinute: resolvedCoinsPerMinute,
        totalCoinsSpent: 0,
        hostEarned: 0,
      }));

      // Pkg211 — register outgoing call with Telecom (BT End / audio routing / system call log)
      if (isNativeAndroidApp()) {
        NativeCall.reportOutgoingCall({
          callId: resolvedCallId,
          calleeId: hostId,
          calleeName: hostProfile?.display_name || 'Host',
          callType: 'video',
        }).catch(() => {});
      }


      // Reliable native call delivery in background (closed/background app).
      // 3-attempt retry with exponential backoff (1s, 2.5s) — aborts as soon
      // as the call is no longer ringing, and treats any non-2xx / network
      // failure as retryable. The edge function inserts a notification row
      // for foreground in-app delivery and sends high-priority data-only FCM
      // for background/killed-app delivery. No Supabase Realtime fallback.
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
            const payload = (data ?? {}) as Record<string, any>;
            const fcmOk = !!payload.fcmDelivered;
            const notificationOk = !!payload.notifInsertOk;
            const fcmConfigured = payload.fcmConfigured !== false; // undefined = configured
            console.log(
              `[Call] call-deliver attempt ${i + 1} → fcm=${fcmOk} notification=${notificationOk} configured=${fcmConfigured}`,
            );
            // Warn caller once if server says push is not configured — recipient
            // will only ring if app is in foreground. (Admin must add the
            // FIREBASE_SERVICE_ACCOUNT_JSON secret to enable background ringing.)
            if (!fcmConfigured && i === 0) {
              toast({
                title: 'Push not configured',
                description:
                  payload.warning ||
                  'Recipient will only ring if their app is open. Admin must enable push.',
              });
            }
            if (fcmOk || notificationOk) return;
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

      const timeoutSeconds = Math.max(15, Math.min(120, resolvedTimeoutSeconds));
      
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

      // Pkg-private-call C-2: outgoing-call status polling REMOVED.
      // Truth path is now 100% event-driven:
      //   • LiveKit DataPacket (`call_accepted` / `call_ended`) — sub-50ms peer notify
      //   • Supabase `postgres_changes` on `private_calls` (channel `private-call-${userId}`)
      //   • Hard `callTimeoutRef` above enforces the host-no-answer window
      // The legacy 5s `setInterval` REST poll was redundant and added DB load
      // for every outgoing call. Kept `outgoingStatusPollRef` declaration so
      // cleanup paths remain no-ops; never started again.

      return resolvedCallId;
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
      if (isNativeAndroidApp()) void whenNativeLiveKitKillSwitchReady().catch(() => {});
      if (isNativeAndroidApp() && !shouldUseNativeLiveKit({ feature: 'private-call' })) {
        throw new Error('Native Android LiveKit is required for private calls. Web camera fallback is disabled.');
      }
      const incomingSnapshot = incomingCallIdRef.current === callId ? incomingCall : null;

      // ⚡ Optimistic connect UI first (don't wait for DB/network)
      callEndedRef.current = false;
      currentCallIdRef.current = callId;
      // Honest-private-call fix (F-01): do NOT mark billingStarted yet.
      // We used to set this true synchronously, which meant a failing
      // accept_private_call RPC (call already expired / timed out) would
      // still flip the host into a "billing-on" state and silently swallow
      // the timeout flow. We now flip it only after the RPC succeeds.
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
        remoteUserLevel: incomingSnapshot?.callerLevel ?? prev.remoteUserLevel ?? 1,
        duration: 0,
        totalCoinsSpent: 0,
        hostEarned: 0,
      }));

      // Pkg211 — promote Telecom connection to active for accepted incoming call
      if (isNativeAndroidApp()) {
        NativeCall.reportCallConnected({ callId }).catch(() => {});
        // Section#5 pass-4: accepting from the in-app React modal must dismiss
        // the native heads-up/full-screen incoming UI, but must NOT end Telecom.
        NativeCall.endIncomingUi({ callId, reason: 'accepted' }).catch(() => {});
      }


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

      if (acceptRes.data !== true) {
        throw new Error('Call is no longer available');
      }

      // Honest-private-call fix (F-01): accept confirmed by server — only
      // now is the host actually on a live billable call. Flip the flag
      // here so a server-side `false` return (race with timeout) can no
      // longer leak past as a billing-on state.
      billingStartedRef.current = true;

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
            .select('display_name, avatar_url, user_level, host_level, max_user_level, gender, is_host')
            .eq('id', callData.caller_id)
            .single()
        : Promise.resolve({ data: null } as any);

      Promise.resolve(callerProfilePromise).then(({ data: callerProfile }) => {
        if (callerProfile && !callEndedRef.current && currentCallIdRef.current === callId) {
          setCallState(prev => ({
            ...prev,
            remoteUserName: callerProfile.display_name || 'User',
            remoteUserAvatar: callerProfile.avatar_url || null,
            remoteUserLevel: getRequiredDisplayLevel(callerProfile),
          }));
        }
      }).catch(() => {});

      // ⚡ Notify caller instantly so they switch to connected UI without waiting for DB propagation.
      // Pkg86 audit (LiveKit-Purist policy): Supabase fallback REMOVED.
      // Caller's ActiveCallScreen mounts on status='calling' → useLiveKitCall connects
      // & registers Room BEFORE host accepts (Room state warmed during ringing).
      // publishCallAccepted retries 20×250ms (=5s ceiling) waiting for Room.
      // Worst-case (caller LiveKit fetch slow / fails): the 5s `outgoingStatusPollRef`
      // REST poll on `private_calls.status` catches the accept within one tick.
      if (callData?.caller_id) {
        void publishCallAccepted(callId, { acceptedBy: userId });
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
      // Pkg425: accept_private_call may have already set the row to 'connected'.
      // If LiveKit connect then throws (network blip, native plugin race) the row
      // stays 'connected' forever — caller keeps billing against a dead call and
      // host is locked in_call. Settle the row server-side BEFORE resetting local
      // state so both sides get the realtime 'ended' event.
      try {
        // Phase 3 fix (A1/C4): use the callId param — `incomingCall` state may
        // be null on the native cold-start accept path, leaving the row stuck
        // 'connected' forever and billing the caller against a dead call.
        const cleanupCallId = callId || incomingCall?.callId;
        if (cleanupCallId) {
          await supabase.rpc('end_private_call', {
            _call_id: cleanupCallId,
            _end_reason: 'connect_failed',
          });
          // Server billing P2 — safety-net refund. Reverses any minute that
          // got charged before the connect failed (idempotent via the
          // `call_refunded` event guard inside the RPC).
          try {
            await supabase.rpc('refund_call_on_failed_connect' as never, {
              p_call_id: cleanupCallId,
            } as never);
          } catch { /* refund is best-effort; sweeper retries */ }
        }
      } catch { /* server-side cleanup_stale_in_call_flags cron is the final safety net */ }

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
  const declineCall = useCallback(async (callId: string, reason: 'declined' | 'timeout' = 'declined') => {
    try {
      // Pkg307 audit: mark dead-forever BEFORE network so the 30s pending-call
      // poll never re-surfaces this row in the brief window before the RPC's
      // status flip propagates.
      endedCallIdsRef.current.add(callId);
      if (incomingCallIdRef.current === callId) {
        incomingCallIdRef.current = null;
      }

      const { error } = reason === 'timeout'
        ? await supabase.rpc('timeout_private_call', { _call_id: callId })
        : await supabase.rpc('decline_private_call', { _call_id: callId });

      if (error) throw error;

      if (isNativeAndroidApp()) {
        NativeCall.endIncomingUi({ callId, reason }).catch(() => {});
      }

      setIncomingCall(null);
      toast({
        title: reason === 'timeout' ? "Call Missed" : "Call Declined",
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

    // Pkg5-pass1 BUG-A FIX: tear down Telecom connection on local hang-up
    // (was missing — BT headset + system call log + audio routing leaked until app kill).
    // `remote: false` mirrors softEndCall's local-end semantic.
    if (callIdToEnd && isNativeAndroidApp()) {
      NativeCall.reportCallEnded({ callId: callIdToEnd, remote: false }).catch(() => {});
      NativeCall.endIncomingUi({ callId: callIdToEnd, reason: 'ended' }).catch(() => {});
      NativeCall.closeInCallActivity({ callId: callIdToEnd }).catch(() => {});
    }



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

      // Pkg73: publish via LiveKit DataPacket — sub-50ms peer notify.
      // Fire-and-forget; server RPC persists the durable end state.
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
      // Phase 3 polish: subtle end-call haptic (native-only no-op on web)
      try {
        import('@capacitor/haptics').then(({ Haptics, ImpactStyle }) => {
          Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
        }).catch(() => {});
      } catch (_) {}

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

      // ⚡ Instant presence restore — call ends → host/user immediately flips
      // from BUSY back to ONLINE on the homepage feed (zero-second transition).
      try {
        const { forceOnlineNow } = await import('@/components/common/PresenceProvider');
        if (userId) void forceOnlineNow(userId);
      } catch { /* non-critical */ }

      return true;
    } catch (error: any) {
      console.error('Error ending call:', error);
      setCallState(INITIAL_CALL_STATE);
      setIncomingCall(null);
      
      // 🔒 EMERGENCY: Force reset is_in_call even on total failure
      try { await supabase.rpc('reset_my_call_status'); } catch (_) {}
      
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
  // Fallback only: instant delivery is handled by FCM notification bridge below.
  useEffect(() => {
    if (!userId) return;

    let isCleanedUp = false;
    const checkPendingCalls = async () => {
      if (isCleanedUp) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      
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

        const shown = await showVerifiedIncomingCall(call.id);
        if (!shown) return;

        // ⚡ Pre-warm LiveKit token for faster accept
        import('@/services/livekitService').then(({ warmLiveKitToken }) => {
          warmLiveKitToken(`call_${call.id}`, 'call').catch(() => {});
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

    // FCM + scoped Supabase Realtime below are the instant authoritative paths.
    // Foreground-resume runs ONE catch-up snapshot only (not polling) so an
    // incoming call created while the WebView was suspended is still shown when
    // the user returns without tapping the native notification.
    void checkPendingCalls();

    const handleVisibilityResume = () => {
      if (typeof document === 'undefined') return;
      if (document.visibilityState !== 'visible') return;
      void checkPendingCalls();
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityResume);
    }

    return () => {
      isCleanedUp = true;
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityResume);
      }
    };
  }, [userId, showVerifiedIncomingCall]);

  // Supabase Realtime is the authoritative instant DB-status path for private_calls.
  // FCM delivers the ring; LiveKit DataPackets deliver in-room peer events; this
  // scoped listener closes the gaps across devices/reconnects without waiting for polls.
  useEffect(() => {
    if (!userId) return;

    const isTerminal = (status?: string | null) => status === 'ended' || status === 'declined' || status === 'missed';

    const handleRow = (row: any) => {
      if (!row?.id) return;
      const callId = String(row.id);
      const status = String(row.status || '');

      if (row.host_id === userId && (status === 'pending' || status === 'ringing')) {
        void showVerifiedIncomingCall(callId);
        return;
      }

      if (status === 'connected' && row.caller_id === userId) {
        activateCallerConnectedState(callId);
        return;
      }

      // Phase 3B (Step 3): sync live caller balance from server-cron billing writes.
      // bill_call_minute() updates last_billed_minute on each successful tick;
      // the new viewer balance lives in profiles.coins, but we also surface the
      // total_minutes_billed counter here so the in-call HUD never drifts.
      if (row.caller_id === userId && currentCallIdRef.current === callId && !callEndedRef.current) {
        const minutesBilled = typeof row.total_minutes_billed === 'number' ? row.total_minutes_billed : null;
        const viewerRate = typeof row.viewer_rate_per_min === 'number' ? row.viewer_rate_per_min : null;
        if (minutesBilled !== null && viewerRate !== null) {
          setCallState(prev => ({
            ...prev,
            duration: Math.max(prev.duration, minutesBilled * 60),
          }));
        }
      }

      if (!isTerminal(status)) return;

      const trackedCallId = currentCallIdRef.current || callStateRef.current.callId;

      if (incomingCallIdRef.current === callId) {
        incomingCallIdRef.current = null;
        setIncomingCall(null);
        if (isNativeAndroidApp()) {
          NativeCall.endIncomingUi({ callId, reason: status === 'missed' ? 'timeout' : status }).catch(() => {});
        }
        if (trackedCallId !== callId) endedCallIdsRef.current.add(callId);
      }

      if (trackedCallId !== callId || callEndedRef.current || endedCallIdsRef.current.has(callId)) return;

      if (status === 'ended') {
        // Phase 3B (Step 3): surface server-cron auto-end reasons to the caller UI.
        const finalStatus = String(row.final_status || '');
        const endReason = String(row.end_reason || '');
        if (row.caller_id === userId && (finalStatus === 'insufficient_balance' || endReason === 'insufficient_coins')) {
          toastRef.current({
            title: 'Insufficient Diamonds',
            description: 'Call ended automatically — please recharge to continue',
            variant: 'destructive',
          });
        }
        softEndCallRef.current?.();
      } else {
        resetCallStateRef.current?.();
        toastRef.current({
          title: status === 'declined' ? 'Call Declined' : 'Call Missed',
          description: status === 'declined' ? 'Host declined the call' : 'Host did not answer',
        });
      }
    };

    const privateCallChannel = supabase
      .channel(`private-call-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'private_calls', filter: `caller_id=eq.${userId}` }, (payload) => {
        handleRow((payload as any).new || (payload as any).old);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'private_calls', filter: `host_id=eq.${userId}` }, (payload) => {
        handleRow((payload as any).new || (payload as any).old);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(privateCallChannel);
    };
  }, [userId, showVerifiedIncomingCall, activateCallerConnectedState]);

  // Incoming call listener: FCM is the wake/delivery path, while the scoped
  // private_calls realtime listener above is the DB truth path for missed FCM,
  // caller cancel/timeout, and cross-device state convergence.
  useEffect(() => {
    if (!userId) return;

    console.log('[Pkg84] Setting up FCM-bridge incoming call listener for:', userId);
    let isCleanedUp = false;

    const handleIncomingNotification = (evt: Event) => {
      if (isCleanedUp) return;
      const detail = (evt as CustomEvent).detail;
      const data = detail?.data || detail;
      const rawCallId = data?.callId ?? data?.call_id;
      const callId = typeof rawCallId === 'string' ? rawCallId.trim() : '';
      if (!callId) return;
      if (incomingCallIdRef.current === callId) return;
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

      void (async () => {
        const shown = await showVerifiedIncomingCall(callId);
        if (!shown) return;

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
          description: "Someone is calling you",
        });
      })();
    };

    window.addEventListener('incoming-call-notification', handleIncomingNotification);

    return () => {
      isCleanedUp = true;
      window.removeEventListener('incoming-call-notification', handleIncomingNotification);
    };
  }, [userId, showVerifiedIncomingCall]);


  // 🔴 PEER NOTIFICATION LISTENERS — instant call_ended + call_accepted via LiveKit DataPacket
  // Pkg86 audit (LiveKit-Purist): Supabase `call-end-listener-${userId}` channel FULLY REMOVED.
  // call_ended → LiveKit `livekit-call-ended` window event (Pkg73, was already pure LiveKit since Pkg78)
  // call_accepted → LiveKit `livekit-call-accepted` window event (Pkg86, just promoted to sole path).
  // Worst-case caller-side miss → 5s outgoingStatusPollRef on `private_calls.status` catches it.
  useEffect(() => {
    if (!userId) return;
    let isCleanedUp = false;

    // 🔥 Pkg73: LiveKit DataPacket peer notification (sub-50ms, no DB round-trip).
    // Single sole receiver for call_ended — Supabase removed in Pkg78 + Pkg86.

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

    // 🔥 Pkg86 audit: LiveKit `call_accepted` listener is the instant path.
    // Worst-case pre-Room miss is covered by the bounded 5s REST status poll.
    const handleLiveKitCallAccepted = (ev: Event) => {
      if (isCleanedUp) return;
      const detail = (ev as CustomEvent<CallAcceptedDetail>).detail;
      if (!detail?.callId) return;

      const trackedCallId = currentCallIdRef.current || callStateRef.current.callId;
      if (trackedCallId && trackedCallId !== detail.callId) return;
      if (!trackedCallId) {
        currentCallIdRef.current = detail.callId;
        setCallState(prev => (
          prev.status === 'calling' || prev.status === 'ringing'
            ? { ...prev, callId: detail.callId }
            : prev
        ));
      }

      if (endedCallIdsRef.current.has(detail.callId) || callEndedRef.current) return;
      if (detail.acceptedBy === userId) return;

      console.log('[Pkg86] ⚡ LiveKit call-accepted received for:', detail.callId);
      activateCallerConnectedState(detail.callId);
    };

    // Honest-private-call fix (F-12): reconnect-budget exhaustion → force end.
    const handleLiveKitNetworkLost = (event: Event) => {
      if (isCleanedUp) return;
      const detail = (event as CustomEvent).detail as { callId?: string; reason?: string } | undefined;
      const activeId = callState.callId;
      if (!activeId) return;
      if (detail?.callId && detail.callId !== activeId) return;
      if (callEndedRef.current) return;
      console.warn('[PrivateCall] LiveKit network lost — ending call with reason=network');
      endCall('network').catch(() => {});
    };

    // Honest-private-call fix (F-11): pause / resume the visible duration
    // counter as LiveKit reconnects.
    const handleLiveKitReconnecting = (event: Event) => {
      const detail = (event as CustomEvent).detail as { callId?: string } | undefined;
      const activeId = callState.callId;
      if (!activeId) return;
      if (detail?.callId && detail.callId !== activeId) return;
      reconnectingRef.current = true;
      // Phase 3 polish: silent user feedback (no new UI, uses existing toast system)
      try {
        toast({ title: 'Reconnecting…', description: 'Network is unstable. Billing paused.', duration: 4000 });
      } catch (_) {}
      // Backend P1: tell the server to PAUSE billing while we reconnect.
      // bill_call_minute() reads private_calls.is_reconnecting and skips.
      supabase.rpc('mark_call_reconnecting', {
        p_call_id: activeId,
        p_reconnecting: true,
      }).then(({ error }) => {
        if (error) console.warn('[PrivateCall] mark_call_reconnecting(true) failed:', error.message);
      });
    };
    const handleLiveKitReconnected = (event: Event) => {
      const detail = (event as CustomEvent).detail as { callId?: string } | undefined;
      const activeId = callState.callId;
      if (!activeId) return;
      if (detail?.callId && detail.callId !== activeId) return;
      reconnectingRef.current = false;
      try {
        toast({ title: 'Reconnected ✓', description: 'Call resumed.', duration: 2500 });
      } catch (_) {}
      // Backend P1: resume server-side billing.
      supabase.rpc('mark_call_reconnecting', {
        p_call_id: activeId,
        p_reconnecting: false,
      }).then(({ error }) => {
        if (error) console.warn('[PrivateCall] mark_call_reconnecting(false) failed:', error.message);
      });
    };


    if (typeof window !== 'undefined') {
      window.addEventListener('livekit-call-ended', handleLiveKitCallEnded);
      window.addEventListener('livekit-call-accepted', handleLiveKitCallAccepted);
      window.addEventListener('livekit-call-network-lost', handleLiveKitNetworkLost);
      window.addEventListener('livekit-call-reconnecting', handleLiveKitReconnecting);
      window.addEventListener('livekit-call-reconnected', handleLiveKitReconnected);
    }

    return () => {
      isCleanedUp = true;
      // Honest-private-call fix (F-11): never leave the pause flag set if
      // the effect tears down mid-reconnect — next call would start frozen.
      reconnectingRef.current = false;

      if (typeof window !== 'undefined') {
        window.removeEventListener('livekit-call-ended', handleLiveKitCallEnded);
        window.removeEventListener('livekit-call-accepted', handleLiveKitCallAccepted);
        window.removeEventListener('livekit-call-network-lost', handleLiveKitNetworkLost);
        window.removeEventListener('livekit-call-reconnecting', handleLiveKitReconnecting);
        window.removeEventListener('livekit-call-reconnected', handleLiveKitReconnected);
      }
    };
  }, [userId, callState.callId, endCall]);

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