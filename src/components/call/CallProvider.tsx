import { createContext, useContext, ReactNode, useEffect, useState, useRef, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { usePrivateCall } from '@/hooks/usePrivateCall';
import { useNotifications } from '@/hooks/useNotifications';
// subscribeToTables no longer needed - usePrivateCall handles all call-end detection
import { IncomingCallModal } from './IncomingCallModal';
import { CallEndedModal } from './CallEndedModal';
import { supabase } from '@/integrations/supabase/client';
import { isNativeCallAvailable, NativeCall, type NativeCallActionEvent } from '@/plugins/NativeCall';

// 🚀 Lazy-load ActiveCallScreen to defer 172KB livekit-client bundle
const ActiveCallScreen = lazy(() => import('./ActiveCallScreen').then(m => ({ default: m.ActiveCallScreen })));

/**
 * Phase-3 C1: GLOBAL `notifications` realtime mount, attached to the
 * authenticated tree directly under CallProvider. No Suspense, no
 * isPublicPage gate — so the moment auth resolves the realtime channel
 * is live and `incoming_call` notification rows bridge to the
 * `incoming-call-notification` window event WITHOUT the deferred-hooks
 * Suspense dead-window that used to drop the first call on cold start.
 */
const GlobalNotificationsMount = () => {
  useNotifications();
  return null;
};

interface CallContextType {
  startCall: (hostId: string, streamId?: string) => Promise<string | null>;
  isInCall: boolean;
}

const CallContext = createContext<CallContextType | null>(null);

export function useCall() {
  const context = useContext(CallContext);
  if (!context) {
    // Silent fallback during HMR/edge cases - no console spam
    return {
      startCall: async () => null as string | null,
      isInCall: false,
    };
  }
  return context;
}

interface CallProviderProps {
  children: ReactNode;
}

// Store accepted call info to persist after incomingCall is cleared
interface AcceptedCallInfo {
  callId: string;
  callerId: string;
  callerName: string;
  callerAvatar: string | null;
}

// Call ended info for showing the modal
interface CallEndedInfo {
  remoteUserName: string;
  remoteUserAvatar: string | null;
  remoteUserLevel: number;
  duration: number;
  coinsSpent: number;
  hostEarned: number;
  isHost: boolean;
  endedBy: 'self' | 'remote' | 'system';
  endReason: 'normal' | 'declined' | 'missed' | 'insufficient_coins';
}

export function CallProvider({ children }: CallProviderProps) {
  const [userId, setUserId] = useState<string | null>(null);
  const [acceptedCallInfo, setAcceptedCallInfo] = useState<AcceptedCallInfo | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [showCallEndedModal, setShowCallEndedModal] = useState(false);
  const [callEndedInfo, setCallEndedInfo] = useState<CallEndedInfo | null>(null);
  const callEndedRef = useRef(false);
  // ☠️ DEAD FOREVER: Track ended call IDs permanently - NEVER reconnect a dead call
  const endedCallIdsRef = useRef<Set<string>>(new Set());
  // Pkg5-pass1 BUG-B/C: in-flight guards against rapid double-tap on modal buttons
  const acceptingRef = useRef(false);
  const decliningRef = useRef(false);

  useEffect(() => {
    // ⚡ INSTANT: Use getSession() first (local cache, no network round-trip)
    // Then listen for auth state changes for updates
    const initUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) {
        setUserId(session.user.id);
      } else {
        // Fallback to getUser only if no session cached
        const { data: { user } } = await supabase.auth.getUser();
        setUserId(user?.id || null);
      }
    };
    initUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUserId(session?.user?.id || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const {
    callState,
    incomingCall,
    startCall,
    acceptCall,
    declineCall,
    endCall,
    dismissCall,
    notifyMediaConnected,
  } = usePrivateCall(userId);

  // Pkg500 Phase D — push (balance, rate) into the native PrivateCallActivity
  // every time the caller's wallet or the call's per-minute rate changes.
  // No-op on web / iOS / older APKs.
  useNativeCallBillingSync({
    userId,
    callId: callState.callId,
    callerId: callState.callerId ?? null,
  });

  const isInCall = callState.status === 'calling' || callState.status === 'ringing' || callState.status === 'connected';

  // Track host status based on incoming call
  useEffect(() => {
    if (incomingCall) {
      setIsHost(true);
      callEndedRef.current = false;
    } else if (callState.callId && callState.status === 'calling') {
      setIsHost(false);
      callEndedRef.current = false;
    }
  }, [incomingCall, callState.callId, callState.status]);

  // ✅ SIMPLIFIED: Single source of truth for call-end detection
  // usePrivateCall handles ALL detection (broadcast + realtime + polling)
  // and sets status='ended' while keeping call data intact for CallEndedModal
  useEffect(() => {
    if (callState.status !== 'ended' || showCallEndedModal) return;

    const captureEndedInfo = async () => {
      let finalDuration = callState.duration;
      let coinsSpent = callState.totalCoinsSpent;
      let hostEarnedAmount = callState.hostEarned;

      // Fetch FINAL call data from DB for accuracy
      if (callState.callId) {
        try {
          const { data: finalCallData } = await supabase
            .from('private_calls')
            .select('total_coins_deducted, host_earned, duration_seconds, started_at, ended_at')
            .eq('id', callState.callId)
            .single();

          if (finalCallData) {
            if (finalCallData.started_at && finalCallData.ended_at) {
              finalDuration = Math.floor(
                (new Date(finalCallData.ended_at).getTime() - new Date(finalCallData.started_at).getTime()) / 1000
              );
            } else if (finalCallData.duration_seconds) {
              finalDuration = finalCallData.duration_seconds;
            }
            coinsSpent = finalCallData.total_coins_deducted || coinsSpent;
            hostEarnedAmount = finalCallData.host_earned || hostEarnedAmount;
          }
        } catch (_) {}
      }

      const remoteName = isHost
        ? (acceptedCallInfo?.callerName || callState.remoteUserName || 'User')
        : (callState.remoteUserName || 'Host');
      const remoteAvatar = isHost
        ? (acceptedCallInfo?.callerAvatar || callState.remoteUserAvatar)
        : callState.remoteUserAvatar;

      setCallEndedInfo({
        remoteUserName: remoteName,
        remoteUserAvatar: remoteAvatar,
        remoteUserLevel: callState.remoteUserLevel || 1,
        duration: finalDuration,
        coinsSpent,
        hostEarned: hostEarnedAmount,
        isHost,
        endedBy: 'remote',
        endReason: 'normal',
      });
      setShowCallEndedModal(true);
      setAcceptedCallInfo(null);
      // Phase-3 C3: do NOT raise callEndedRef here. The previous 3s
      // cooldown silently blocked Accept on any new incoming call that
      // arrived within 3s of a prior call end. Per-callId block lives in
      // usePrivateCall.endedCallIdsRef already — that is sufficient.

      // ☠️ DEAD FOREVER: Dismiss ended state → reset to idle
      dismissCall();
      setIsHost(false);
    };

    captureEndedInfo();
  }, [callState.status, showCallEndedModal, dismissCall, isHost, acceptedCallInfo]);

  // Clear accepted call info when call ends
  useEffect(() => {
    if (callState.status === 'idle' && !showCallEndedModal) {
      console.log('[CallProvider] Call is idle, clearing state');
      setAcceptedCallInfo(null);
      setIsHost(false);
      // Do NOT set callEndedRef here - it blocks incoming call detection!
    }
  }, [callState.status, showCallEndedModal]);

  const handleAcceptCall = async () => {
    if (acceptingRef.current) return; // Pkg5-pass1 BUG-B: double-tap guard
    if (incomingCall && !callEndedRef.current) {
      acceptingRef.current = true;
      try {
        // Phase-3 C4: BEFORE accepting, force-disconnect any active LiveKit
        // room (live stream / party room) so mic/camera are released and the
        // private call can take over cleanly.  This prevents audio mixing when
        // a host accepts a call while still connected to a broadcast room.
        const { disconnectAllRegisteredRooms } = await import('@/lib/livekitStreams');
        disconnectAllRegisteredRooms();

        // Pkg35: If the host is currently broadcasting a live stream, end it
        // automatically so the private call can take over cleanly.
        if (userId) {
          try {
            const { data: liveRows } = await supabase
              .from('live_streams')
              .select('id')
              .eq('host_id', userId)
              .is('ended_at', null)
              .eq('is_active', true)
              .limit(5);
            if (liveRows && liveRows.length > 0) {
              await Promise.all(
                liveRows.map(async (r: any) => {
                  try { await supabase.rpc('end_live_stream', { p_stream_id: r.id }); } catch { /* ignore */ }
                })
              );
            }
          } catch (_) {
            /* non-blocking */
          }
        }

        // Store the incoming call info BEFORE accepting (because incomingCall will be cleared)
        setAcceptedCallInfo({
          callId: incomingCall.callId,
          callerId: incomingCall.callerId,
          callerName: incomingCall.callerName,
          callerAvatar: incomingCall.callerAvatar,
        });
        setIsHost(true);

        await acceptCall(incomingCall.callId);
      } finally {
        // Release on next tick — modal has already been dismissed by acceptCall
        setTimeout(() => { acceptingRef.current = false; }, 500);
      }
    }
  };

  const handleDeclineCall = async () => {
    if (decliningRef.current) return; // Pkg5-pass1 BUG-C: double-tap guard
    if (incomingCall) {
      decliningRef.current = true;
      try {
        await declineCall(incomingCall.callId);
      } finally {
        setTimeout(() => { decliningRef.current = false; }, 500);
      }
    }
  };

  // Native lock-screen / heads-up notification actions are authoritative.
  // Without this bridge, tapping Accept/Decline natively only opened the app and
  // the DB call stayed ringing until timeout, which appeared as host call failure.
  useEffect(() => {
    if (!userId || !isNativeCallAvailable()) return;

    let disposed = false;
    const handled = new Set<string>();

    const handleNativeAction = async (event: NativeCallActionEvent) => {
      if (disposed || !event?.callId) return;
      const key = `${event.callId}:${event.action}:${event.ts || 0}`;
      if (handled.has(key)) return;
      handled.add(key);

      if (event.action === 'presented') {
        try {
          await supabase.rpc('mark_call_delivered', {
            p_call_id: event.callId,
            p_channel: 'native_presented',
            p_device_info: { source: 'NativeCall', action: event.action, ts: event.ts },
          });
        } catch (_) {}
        return;
      }

      if (event.action === 'accept') {
        callEndedRef.current = false;
        setShowCallEndedModal(false);
        setCallEndedInfo(null);
        setAcceptedCallInfo({
          callId: event.callId,
          callerId: event.callerId,
          callerName: event.callerName || 'User',
          callerAvatar: null,
        });
        setIsHost(true);
        try {
          await supabase.rpc('mark_call_delivered', {
            p_call_id: event.callId,
            p_channel: 'native_action',
            p_device_info: { source: 'NativeCall', action: 'accept', ts: event.ts },
          });
        } catch (_) {}
        await acceptCall(event.callId);
        await NativeCall.acknowledgeAction({ callId: event.callId, action: event.action }).catch(() => undefined);
        return;
      }

      if (event.action === 'decline' || event.action === 'timeout') {
        await declineCall(event.callId, event.action === 'timeout' ? 'timeout' : 'declined');
        await NativeCall.acknowledgeAction({ callId: event.callId, action: event.action }).catch(() => undefined);
        return;
      }

      // Phase-A fix: BT End button / Telecom `onDisconnect` on an ALREADY-active
      // call dispatches `ended` (see MeriConnection.kt). Previously this action
      // was unhandled → zombie call: billing timer + LiveKit room kept running
      // even though hardware/system tore down the audio. Treat `ended` as a
      // remote/system hangup so JS runs full teardown.
      if (event.action === 'ended') {
        try {
          await endCall();
        } catch (e) {
          console.warn('[CallProvider] endCall on native "ended" failed:', e);
        }
        await NativeCall.acknowledgeAction({ callId: event.callId, action: event.action }).catch(() => undefined);
        return;
      }
    };

    let listener: { remove: () => Promise<void> } | null = null;
    void NativeCall.addListener('call-action', handleNativeAction).then((h) => {
      // Pkg5-pass1 BUG-E FIX: if disposed before registration resolved, remove immediately
      if (disposed) {
        void h.remove().catch(() => undefined);
        return;
      }
      listener = h;
    }).catch(() => undefined);
    void NativeCall.getLastAction().then(({ actions }) => {
      if (disposed) return;
      actions?.forEach((action) => void handleNativeAction(action));
    }).catch(() => undefined);

    return () => {
      disposed = true;
      void listener?.remove().catch(() => undefined);
    };
  }, [userId, acceptCall, declineCall]);


  const handleEndCall = async () => {
    if (callEndedRef.current) {
      console.log('[CallProvider] Call already ended, ignoring');
      return;
    }
    
    // ☠️ DEAD FOREVER: Mark INSTANTLY - zero delay
    const deadCallId = callState.callId;
    if (deadCallId) endedCallIdsRef.current.add(deadCallId);
    callEndedRef.current = true;
    console.log('[CallProvider] User ending call:', deadCallId);
    
    // ⚡ INSTANT: Clear UI state BEFORE awaiting network calls
    setAcceptedCallInfo(null);
    setIsHost(false);
    
    // Fire endCall (network ops happen in background)
    await endCall();

    // Phase-3 C3: release the in-flight end guard immediately. The
    // prior 3s cooldown blocked Accept on a brand-new incoming call
    // that arrived within 3 seconds of ending a previous call.
    callEndedRef.current = false;
  };

  const handleCallEndedModalClose = () => {
    setShowCallEndedModal(false);
    setCallEndedInfo(null);
    // ☠️ DEAD FOREVER: Don't reset callEndedRef here - let the 3s timeout handle it
  };

  // Determine the call ID to use (from acceptedCallInfo for host, from callState for caller)
  const activeCallId = isHost ? (acceptedCallInfo?.callId || callState.callId) : callState.callId;
  
  // Determine remote user info
  const remoteUserId = isHost ? acceptedCallInfo?.callerId : callState.hostId;
  const remoteUserName = isHost 
    ? (acceptedCallInfo?.callerName || callState.remoteUserName || 'User')
    : (callState.remoteUserName || 'Host');
  const remoteUserAvatar = isHost
    ? (acceptedCallInfo?.callerAvatar || callState.remoteUserAvatar)
    : callState.remoteUserAvatar;

  // Should show active call screen
  const shouldShowActiveCall = (callState.status === 'calling' || callState.status === 'ringing' || callState.status === 'connected') && !callEndedRef.current;

  // Debug logging only on status changes (not every render)
  useEffect(() => {
    console.log('[CallProvider] State:', {
      isHost,
      callStatus: callState.status,
      activeCallId,
      remoteUserId,
      userId,
      incomingCall: !!incomingCall,
      acceptedCallInfo: !!acceptedCallInfo,
      shouldShowActiveCall,
      callEnded: callEndedRef.current,
      showCallEndedModal,
    });
  }, [callState.status, activeCallId, isHost, showCallEndedModal]);

  // Phase-3 C5: portal the IncomingCallModal to <body> so full-screen
  // overlays in LiveStream / PartyRoom / Reels / ActiveCallScreen cannot
  // bury it underneath their stacking context. The modal already uses
  // z-[99]/z-[100] internally, but a portal guarantees it joins the
  // top-level layer regardless of the current route's parent z-index.
  const incomingCallModalNode = (
    <IncomingCallModal
      isOpen={!!incomingCall}
      callerName={incomingCall?.callerName || ''}
      callerAvatar={incomingCall?.callerAvatar || null}
      callerLevel={incomingCall?.callerLevel || 1}
      onAccept={() => {
        // Auto-close call ended modal if a new call comes in
        if (showCallEndedModal) {
          setShowCallEndedModal(false);
          setCallEndedInfo(null);
        }
        handleAcceptCall();
      }}
      onDecline={handleDeclineCall}
    />
  );

  return (
    <CallContext.Provider value={{ startCall, isInCall }}>
      {children}

      {/* Phase-3 C1: keep the global notifications realtime channel mounted
          inside the authenticated provider tree — no Suspense, no public-page
          gate — so incoming-call notification rows reach usePrivateCall
          immediately on cold start. */}
      {userId ? <GlobalNotificationsMount /> : null}

      {typeof document !== 'undefined'
        ? createPortal(incomingCallModalNode, document.body)
        : incomingCallModalNode}

      {/* Active Call Screen with WebRTC - lazy loaded to defer livekit bundle */}
      {shouldShowActiveCall && (
        <Suspense fallback={null}>
          <ActiveCallScreen
            isOpen={shouldShowActiveCall}
            callId={activeCallId}
            userId={userId}
            remoteUserId={remoteUserId}
            remoteUserName={remoteUserName}
            remoteUserAvatar={remoteUserAvatar}
            remoteUserLevel={callState.remoteUserLevel || 1}
            callStatus={callState.status}
            duration={callState.duration}
            coinsPerMinute={callState.coinsPerMinute}
            totalCoinsSpent={callState.totalCoinsSpent}
            hostEarned={callState.hostEarned}
            callerRemainingCoins={callState.callerRemainingCoins}
            onEndCall={handleEndCall}
            onMediaConnected={notifyMediaConnected}
            isHost={isHost}
          />
        </Suspense>
      )}

      {/* Call Ended Modal - Shows when remote user ends the call */}
      <CallEndedModal
        isOpen={showCallEndedModal}
        onClose={handleCallEndedModalClose}
        remoteUserName={callEndedInfo?.remoteUserName || ''}
        remoteUserAvatar={callEndedInfo?.remoteUserAvatar || null}
        remoteUserLevel={callEndedInfo?.remoteUserLevel || 1}
        duration={callEndedInfo?.duration || 0}
        coinsSpent={callEndedInfo?.coinsSpent || 0}
        hostEarned={callEndedInfo?.hostEarned || 0}
        isHost={callEndedInfo?.isHost || false}
        endedBy={callEndedInfo?.endedBy || 'remote'}
        endReason={callEndedInfo?.endReason}
      />
    </CallContext.Provider>
  );
}