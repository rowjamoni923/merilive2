import { ReactNode, useEffect, useLayoutEffect, useState, useRef, lazy, Suspense, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { usePrivateCall } from '@/hooks/usePrivateCall';
import { useNativeCallBillingSync } from '@/hooks/useNativeCallBillingSync';
import { useNotifications } from '@/hooks/useNotifications';
// subscribeToTables no longer needed - usePrivateCall handles all call-end detection
import { IncomingCallModal } from './IncomingCallModal';
import { CallEndedModal } from './CallEndedModal';
import { supabase } from '@/integrations/supabase/client';
import { isNativeCallAvailable, NativeCall, type NativeCallActionEvent } from '@/plugins/NativeCall';
import { GlobalCallGiftSheet } from './GlobalCallGiftSheet';
import { IncomingRandomCallPortal } from '@/components/match/IncomingRandomCallScreen';
import { nativeLiveKitController } from '@/lib/nativeLiveKitController';
import { isNativeAndroidApp } from '@/utils/nativeUtils';
import { useProCamera } from '@/camera/useProCamera';
import { toast as sonnerToast } from 'sonner';
import { CallingFallback } from './CallingFallback';
import { clearNativeMediaSurface } from '@/utils/nativeMediaSurface';
import {
  acquireCameraSession,
  type CameraSessionHandle,
} from '@/lib/persistentCameraSession';
import PersistentCameraSurface from '@/components/media/PersistentCameraSurface';
import { CallContext, setGlobalCallController, type CallContextType } from './CallContext';

// 🚀 Lazy-load ActiveCallScreen to defer 172KB livekit-client bundle.
// Do NOT kick off this import at module load. On Android WebView that creates
// a startup network/parse spike on every page, even when the user never calls.
// It is warmed only after auth idle and of course loaded when the call UI opens.
const importActiveCallScreen = () => import('./ActiveCallScreen').then(m => ({ default: m.ActiveCallScreen }));
const ActiveCallScreen = lazy(importActiveCallScreen);


/**
 * Phase-3 C1: GLOBAL `notifications` realtime mount, attached to the
 * authenticated tree directly under CallProvider. No Suspense, no
 * isPublicPage gate — so the moment auth resolves the realtime channel
 * is live and `incoming_call` notification rows bridge to the
 * `incoming-call-notification` window event WITHOUT the deferred-hooks
 * Suspense dead-window that used to drop the first call on cold start.
 */
const GlobalNotificationsMount = () => {
  useNotifications({ realtimeOnly: true });
  return null;
};

interface CallProviderProps {
  children?: ReactNode;
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
  diamondsSpent: number;
  hostEarned: number;
  isHost: boolean;
  endedBy: 'self' | 'remote' | 'system';
  // Honest-private-call fix (F-15 / F-04): canonical enum, sourced from the
  // DB row's `end_reason` column via normalizeEndReason() rather than the
  // hardcoded 'normal' that legacy code used.
  endReason: import('@/lib/callEndReasons').CallEndReason;
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

  // 🚀 INSTANT CALL UX: preload the ActiveCallScreen chunk (+ livekit-client)
  // on idle, the moment the authenticated provider mounts. Without this,
  // the very first call has to wait for a 172KB lazy fetch before the call
  // UI can paint — perceived as "slow call button". Preloading on idle
  // makes the first call mount feel instant (matches Chamet/WhatsApp).
  useEffect(() => {
    if (!userId) return;
    const w = typeof window !== 'undefined' ? window : null;
    const schedule: (cb: () => void) => void =
      w && 'requestIdleCallback' in w
        ? (cb) => (w as any).requestIdleCallback(cb, { timeout: 10000 })
        : (cb) => setTimeout(cb, 10000);
    schedule(() => { importActiveCallScreen().catch(() => {}); });
  }, [userId]);

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
  const acceptCallRef = useRef(acceptCall);
  const declineCallRef = useRef(declineCall);
  const endCallRef = useRef(endCall);
  useEffect(() => {
    acceptCallRef.current = acceptCall;
    declineCallRef.current = declineCall;
    endCallRef.current = endCall;
  }, [acceptCall, declineCall, endCall]);

  // Pkg500 Phase D — push (balance, rate) into the native PrivateCallActivity
  // every time the caller's wallet or the call's per-minute rate changes.
  // No-op on web / iOS / older APKs. Hook verifies caller side internally
  // by reading `private_calls.caller_id` so host-side mounts cost nothing.
  useNativeCallBillingSync({
    userId,
    callId: callState.callId,
  });

  const isInCall = callState.status === 'calling' || callState.status === 'ringing' || callState.status === 'connected';
  const callOverlayActiveRef = useRef(false);

  // Phase 2 — track whether the native PrivateCallActivity owns the screen.
  // When it does, we MUST NOT keep `#root` hidden — the Activity already
  // covers everything, and once the user dismisses it we want React visible
  // again instantly (no blank frame between Activity finish and React paint).
  const [nativeCallWindowOpen, setNativeCallWindowOpen] = useState(false);
  useEffect(() => {
    if (!isNativeCallAvailable()) return;
    let disposed = false;
    let listener: { remove: () => Promise<void> } | null = null;
    void NativeCall.addListener('native-call-window', (e) => {
      if (disposed) return;
      setNativeCallWindowOpen(e.state === 'opened');
    }).then((h) => {
      if (disposed) { void h.remove().catch(() => undefined); return; }
      listener = h;
    }).catch(() => undefined);
    return () => {
      disposed = true;
      void listener?.remove().catch(() => undefined);
    };
  }, []);

  // Reset native-window flag whenever the call fully ends so a fresh call
  // starts from a clean slate.
  useEffect(() => {
    if (callState.status === 'idle' || callState.status === 'ended') {
      setNativeCallWindowOpen(false);
    }
  }, [callState.status]);

  // 🎯 Private Call is a portal OVERLAY (not a route). When the call screen
  // is mounted the underlying route (Home/Profile/Chat/…) stays in the DOM
  // and its opaque cards/banners bleed through the call shell — making the
  // app look broken. Hide #root entirely while the call overlay is up.
  // The call portal lives directly on document.body, so it remains visible.
  // Phase 2: skip the #root hide while the native PrivateCallActivity is
  // foregrounded — the Activity already covers the screen, and keeping
  // #root visible avoids a blank frame when the user dismisses the Activity.
  useLayoutEffect(() => {
    if (typeof document === 'undefined') return;
    const activeSignal = isInCall || !!incomingCall || !!acceptedCallInfo;
    if (activeSignal) callOverlayActiveRef.current = true;
    else if (callState.status === 'idle' && !showCallEndedModal) callOverlayActiveRef.current = false;
    const active = callOverlayActiveRef.current && !nativeCallWindowOpen;
    const cls = 'call-overlay-active';
    if (active) {
      document.body.classList.add(cls);
    } else {
      document.body.classList.remove(cls);
    }
    return () => { document.body.classList.remove(cls); };
  }, [isInCall, incomingCall, acceptedCallInfo, callState.status, showCallEndedModal, nativeCallWindowOpen]);

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

  // Pkg-private-call C-1: gate the prejoin Camera2 preview through the
  // single ProCameraEngine arbiter (owner='private-call'). If face-verify
  // (verification family) holds the camera, acquire fails — we surface a
  // toast and never open Camera2, so the live/party/call families can
  // never silently race the verification family.
  const callIsActive =
    !!incomingCall ||
    callState.status === 'calling' ||
    callState.status === 'ringing' ||
    callState.status === 'connected';
  const prejoinCamera = useProCamera('private-call', callIsActive);

  useEffect(() => {
    if (prejoinCamera.error) {
      sonnerToast.error('Camera is busy with face verification. Please finish that first.');
    }
  }, [prejoinCamera.error]);

  // Pro single-camera lifecycle (Chamet/Bigo): start native LiveKit
  // prejoin preview the moment an incoming OR outgoing call exists, so
  // the accepted call connect path reuses the SAME LocalVideoTrack via
  // promotePreviewToSession — no Camera2 re-open, no black flash at
  // accept. Private calls are always video in this app.
  useEffect(() => {
    if (!isNativeAndroidApp()) return;
    const ringing = !!incomingCall || callState.status === 'calling' || callState.status === 'ringing';
    if (!ringing) return;
    // Pkg-private-call C-1: only open Camera2 once the ProCamera arbiter
    // has granted the 'private-call' slot. If face-verify holds it,
    // `ready=false` and we never call startLocalPreview.
    if (!prejoinCamera.ready) return;
    let cancelled = false;
    (async () => {
      try {
        await nativeLiveKitController.startLocalPreview({
          lens: 'front',
          resolution: '1080p',
          mirror: true,
          roomScope: 'call',
          boundedOnly: true,
        });
      } catch (e) {
        if (!cancelled) console.warn('[CallProvider] prejoin preview failed (non-fatal):', e);
      }
    })();
    return () => { cancelled = true; };
  }, [incomingCall, callState.status, prejoinCamera.ready]);

  // If a ringing/incoming call resolves without ever connecting (decline,
  // timeout, missed), release the prejoin Camera2 slot.
  useEffect(() => {
    if (!isNativeAndroidApp()) return;
    if (acceptedCallInfo || acceptingRef.current || callState.status === 'connected') return;
    if (callState.status === 'ended' || (!incomingCall && callState.status === 'idle')) {
      nativeLiveKitController.stopLocalPreview().catch(() => {});
      clearNativeMediaSurface();
    }
  }, [callState.status, incomingCall, acceptedCallInfo]);

  // Pkg-shirt Phase-B (web): mirror of the native Camera2 prejoin above.
  // The moment a call is ringing/dialing on web, warm the global
  // persistentCameraSession so ActiveCallScreen's preview tile reuses the
  // SAME MediaStream when it mounts on accept — no fresh getUserMedia,
  // no permission re-prompt, no black flash. Native Android path is
  // unaffected (Camera2 + LiveKit native takes over there).
  const callPrejoinHandleRef = useRef<CameraSessionHandle | null>(null);
  useEffect(() => {
    if (isNativeAndroidApp()) return;
    const ringing = !!incomingCall || callState.status === 'calling' || callState.status === 'ringing';
    if (!ringing) {
      const h = callPrejoinHandleRef.current;
      callPrejoinHandleRef.current = null;
      if (h) {
        try { h.release(); } catch { /* noop */ }
      }
      return;
    }
    if (callPrejoinHandleRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const handle = await acquireCameraSession({ video: true, audio: true });
        if (cancelled) {
          handle.release();
          return;
        }
        callPrejoinHandleRef.current = handle;
      } catch (err) {
        // Non-fatal: ActiveCallScreen will fall back to its own getUserMedia.
        console.warn('[CallProvider] web prejoin acquire failed (non-fatal):', err);
      }
    })();
    return () => { cancelled = true; };
  }, [incomingCall, callState.status]);

  // Final release on provider unmount.
  useEffect(() => {
    return () => {
      const h = callPrejoinHandleRef.current;
      callPrejoinHandleRef.current = null;
      if (h) {
        try { h.release(); } catch { /* noop */ }
      }
    };
  }, []);




  // usePrivateCall handles ALL detection (broadcast + realtime + polling)
  // and sets status='ended' while keeping call data intact for CallEndedModal
  useEffect(() => {
    if (callState.status !== 'ended' || showCallEndedModal) return;

    // camera-rebuild Phase 8: snapshot the ended call ID at effect entry.
    // If a NEW call (incoming or outgoing) starts during the async DB fetch,
    // dismissCall() must NOT clobber the new call's currentCallIdRef + state.
    const snapCallId = callState.callId;

    const captureEndedInfo = async () => {
      let finalDuration = callState.duration;
      let diamondsSpent = callState.totalCoinsSpent;
      let hostEarnedAmount = callState.hostEarned;
      // Honest-private-call fix (F-15 / F-04): default to 'normal' but
      // overwrite from the DB row whenever it is available.
      let dbEndReasonRaw: string | null | undefined = undefined;

      // Fetch FINAL call data from DB for accuracy
      if (callState.callId) {
        try {
          const { data: finalCallData } = await supabase
            .from('private_calls')
            .select('total_diamonds_deducted, host_earned, duration_seconds, started_at, ended_at, end_reason, final_status')
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
            diamondsSpent = finalCallData.total_diamonds_deducted || diamondsSpent;
            hostEarnedAmount = finalCallData.host_earned || hostEarnedAmount;
            dbEndReasonRaw = (finalCallData as { end_reason?: string; final_status?: string }).end_reason
              ?? (finalCallData as { end_reason?: string; final_status?: string }).final_status
              ?? undefined;
          }
        } catch (_) {}
      }

      // Phase 8 race guard: a fresh call may have started during the await.
      // If so, abandon this teardown — the new call now owns the state.
      if (callState.callId && snapCallId !== callState.callId) {
        return;
      }

      const remoteName = isHost
        ? (acceptedCallInfo?.callerName || callState.remoteUserName || 'User')
        : (callState.remoteUserName || 'Host');
      const remoteAvatar = isHost
        ? (acceptedCallInfo?.callerAvatar || callState.remoteUserAvatar)
        : callState.remoteUserAvatar;

      const { normalizeEndReason } = await import('@/lib/callEndReasons');
      const normalisedReason = normalizeEndReason(dbEndReasonRaw);

      // Re-check after the second await — import() is async too.
      if (callState.callId && snapCallId !== callState.callId) {
        return;
      }

      setCallEndedInfo({
        remoteUserName: remoteName,
        remoteUserAvatar: remoteAvatar,
        remoteUserLevel: callState.remoteUserLevel ?? 1,
        duration: finalDuration,
        diamondsSpent,
        hostEarned: hostEarnedAmount,
        isHost,
        endedBy: 'remote',
        endReason: normalisedReason,
      });
      setShowCallEndedModal(true);
      setAcceptedCallInfo(null);
      // Phase-3 C3: do NOT raise callEndedRef here. The previous 3s
      // cooldown silently blocked Accept on any new incoming call that
      // arrived within 3s of a prior call end. Per-callId block lives in
      // usePrivateCall.endedCallIdsRef already — that is sufficient.

      // ☠️ DEAD FOREVER: Dismiss ended state → reset to idle — but ONLY
      // if no new call has stolen currentCallIdRef in the meantime.
      if (!callState.callId || snapCallId === callState.callId) {
        dismissCall();
        setIsHost(false);
      }
    };

    captureEndedInfo();
  }, [callState.status, callState.callId, showCallEndedModal, dismissCall, isHost, acceptedCallInfo]);

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
      const accepted = incomingCall;
      try {
        // 🚀 PAINT FIRST: flip ActiveCallScreen state synchronously so React
        // mounts the call shell on the SAME frame the user taps Accept.
        // Previously we awaited livekit disconnect + a live_streams SELECT
        // + end_live_stream RPC (collectively 200–2000ms on mid-tier 4G)
        // BEFORE setAcceptedCallInfo, which left the receiver staring at
        // the incoming-call modal long after their tap.
        setAcceptedCallInfo({
          callId: accepted.callId,
          callerId: accepted.callerId,
          callerName: accepted.callerName,
          callerAvatar: accepted.callerAvatar,
        });
        setIsHost(true);

        // Fire the accept RPC IMMEDIATELY (it also optimistically flips
        // callState.status='connected' inside usePrivateCall.acceptCall).
        const acceptPromise = acceptCall(accepted.callId);

        // Background teardown of any active broadcast room / live stream.
        // Non-blocking — does NOT delay the ActiveCallScreen mount or the
        // accept RPC. If the user was hosting a live, it gets ended on the
        // next tick while the call screen is already painting.
        void (async () => {
          try {
            const { disconnectAllRegisteredRooms } = await import('@/lib/livekitStreams');
            disconnectAllRegisteredRooms();
          } catch (_) { /* ignore */ }
          if (!userId) return;
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
          } catch (_) { /* non-blocking */ }
        })();

        await acceptPromise;
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
        await acceptCallRef.current(event.callId);
        await NativeCall.acknowledgeAction({ callId: event.callId, action: event.action }).catch(() => undefined);
        return;
      }

      if (event.action === 'decline' || event.action === 'timeout') {
        await declineCallRef.current(event.callId, event.action === 'timeout' ? 'timeout' : 'declined');
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
          await endCallRef.current();
        } catch (e) {
          console.warn('[CallProvider] endCall on native "ended" failed:', e);
        }
        await NativeCall.acknowledgeAction({ callId: event.callId, action: event.action }).catch(() => undefined);
        return;
      }

      // PrivateCallActivity end button dispatches `end` (user-visible hangup),
      // while Telecom/system controls dispatch `ended`. Both must run the JS
      // settle path or the native Room + billing can leak after the Activity closes.
      if (event.action === 'end') {
        try {
          await endCallRef.current();
        } catch (e) {
          console.warn('[CallProvider] endCall on native "end" failed:', e);
        }
        await NativeCall.acknowledgeAction({ callId: event.callId, action: event.action }).catch(() => undefined);
        return;
      }

      // Telecom hold / unhold (call-waiting). Native side already mutes the
      // LiveKit local mic + camera; here we just broadcast a window event so
      // any active in-call web UI can update its mic/camera toggle visuals
      // and show a "On hold" banner. The LiveKit room stays connected.
      if (event.action === 'hold' || event.action === 'unhold') {
        try {
          window.dispatchEvent(new CustomEvent('merilive:call-hold-changed', {
            detail: { callId: event.callId, held: event.action === 'hold', ts: event.ts },
          }));
        } catch (_) {}
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

    const drainBufferedActions = () => {
      if (disposed || typeof document === 'undefined' || document.visibilityState !== 'visible') return;
      void NativeCall.getLastAction().then(({ actions }) => {
        if (disposed) return;
        actions?.forEach((action) => void handleNativeAction(action));
      }).catch(() => undefined);
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', drainBufferedActions);
    }

    return () => {
      disposed = true;
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', drainBufferedActions);
      }
      void listener?.remove().catch(() => undefined);
    };
  }, [userId]);


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
      callerLevel={incomingCall?.callerLevel ?? 1}
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

  const contextValue = useMemo<CallContextType>(() => ({
    startCall,
    endCall: handleEndCall,
    isInCall,
  }), [startCall, handleEndCall, isInCall]);

  useEffect(() => {
    setGlobalCallController(contextValue);
    return () => setGlobalCallController(null);
  }, [contextValue]);

  return (
    <CallContext.Provider value={contextValue}>
      {/* Global persistent camera bridge — paints the warm MediaStream
          during route swaps (GoLive → LiveStream, CreateParty → PartyRoom,
          idle → ActiveCall) so users never see a camera off→on flicker.
          Self-renders null when no camera is open. Native Android no-op. */}
      <PersistentCameraSurface />

      {children}


      {/* Phase-3 C1: keep the global notifications realtime channel mounted
          inside the authenticated provider tree — no Suspense, no public-page
          gate — so incoming-call notification rows reach usePrivateCall
          immediately on cold start. */}
      {userId ? <GlobalNotificationsMount /> : null}

      {/* Pkg500 Phase G — global host for the inline in-call gift sheet.
          Opens when the native PrivateCallActivity's Gift button broadcasts
          via `useNativeCallBillingSync` → `open-call-gift-sheet` event. */}
      {userId ? <GlobalCallGiftSheet /> : null}

      {/* Random Call (Chamet-style broadcast) host-side incoming ringer.
          Subscribes to `user-${uid}` for `random_incoming_call`, gates on
          is_host, and routes accepted matches to /match-call?incoming_session=…. */}
      {userId ? <IncomingRandomCallPortal /> : null}

      {typeof document !== 'undefined'
        ? createPortal(incomingCallModalNode, document.body)
        : incomingCallModalNode}

      {/* Active Call Screen with LiveKit (Android native) - lazy loaded to defer livekit bundle.
          Suspense fallback paints the SAME dark "Calling…" stage so users never
          see a blank white screen during the 172KB chunk fetch on first call. */}
      {shouldShowActiveCall && (
        <Suspense
          fallback={
            <CallingFallback
              remoteUserName={remoteUserName}
              remoteUserAvatar={remoteUserAvatar}
              callStatus={callState.status}
              isHost={isHost}
              onEndCall={handleEndCall}
            />
          }
        >
          <ActiveCallScreen
            isOpen={shouldShowActiveCall}
            callId={activeCallId}
            userId={userId}
            remoteUserId={remoteUserId}
            remoteUserName={remoteUserName}
            remoteUserAvatar={remoteUserAvatar}
            remoteUserLevel={callState.remoteUserLevel ?? 1}
            callStatus={callState.status}
            duration={callState.duration}
            coinsPerMinute={callState.coinsPerMinute}
            totalCoinsSpent={callState.totalCoinsSpent}
            hostEarned={callState.hostEarned}
            callerRemainingCoins={callState.callerRemainingCoins}
            onEndCall={handleEndCall}
            onMediaConnected={notifyMediaConnected}
            isHost={isHost}
            proCameraReady={prejoinCamera.ready}
          />
        </Suspense>
      )}


      {/* Call Ended Modal - Shows when remote user ends the call */}
      <CallEndedModal
        isOpen={showCallEndedModal}
        onClose={handleCallEndedModalClose}
        remoteUserName={callEndedInfo?.remoteUserName || ''}
        remoteUserAvatar={callEndedInfo?.remoteUserAvatar || null}
        remoteUserLevel={callEndedInfo?.remoteUserLevel ?? 1}
        duration={callEndedInfo?.duration || 0}
        diamondsSpent={callEndedInfo?.diamondsSpent || 0}
        hostEarned={callEndedInfo?.hostEarned || 0}
        isHost={callEndedInfo?.isHost || false}
        endedBy={callEndedInfo?.endedBy || 'remote'}
        endReason={callEndedInfo?.endReason}
      />
    </CallContext.Provider>
  );
}