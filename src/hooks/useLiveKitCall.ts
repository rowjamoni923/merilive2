/**
 * useLiveKitCall – Now powered by LiveKit (API-compatible replacement).
 * Same public surface as the original LiveKit-based hook:
 *   localStream, remoteStream, isConnected,
 *   isAudioEnabled, isVideoEnabled, connectionState,
 *   toggleAudio, toggleVideo, cleanup,
 *   remoteVideoTrack, localVideoTrack
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Room,
  RoomEvent,
  Track,
  ConnectionState,
  LocalTrack,
  RemoteTrack,
  RemoteTrackPublication,
  RemoteParticipant,
  LocalParticipant,
  VideoPresets,
  AudioPresets,
  VideoQuality,
} from 'livekit-client';
import { getLiveKitToken, warmLiveKitToken } from '@/services/livekitService';
import { attachLiveKitTokenRefresh } from '@/lib/livekitTokenRefresh';
import { pickOptimalCodecs } from '@/lib/livekitBackupCodec';
import { connectLiveKitRoom } from '@/lib/livekitConnectPolicy';
import { registerCallRoom, registerNativeCallRoom, unregisterCallRoom, unregisterNativeCallRoom } from '@/lib/livekitCallSignaling';
import { registerChatRoom, registerNativeChatRoom, unregisterChatRoom, unregisterNativeChatRoom } from '@/lib/livekitChatSignaling';
import { registerGiftRoom, registerNativeGiftRoom, unregisterGiftRoom, unregisterNativeGiftRoom } from '@/lib/livekitGiftSignaling';
import { registerActiveSpeakerRoom, unregisterActiveSpeakerRoom } from '@/lib/livekitActiveSpeaker';
import { registerConnectionQualityRoom, unregisterConnectionQualityRoom } from '@/lib/livekitConnectionQuality';
import { registerAutoAudioOnlyRoom, unregisterAutoAudioOnlyRoom } from '@/lib/livekitAutoAudioOnly';
import { registerHardReconnectCap, unregisterHardReconnectCap } from '@/lib/livekitHardReconnectCap';
import { registerMetadataRoom, unregisterMetadataRoom } from '@/lib/livekitMetadata';
import { registerRoomMetadataRoom, unregisterRoomMetadataRoom } from '@/lib/livekitRoomMetadata';
import { registerStreamRoom, unregisterStreamRoom } from '@/lib/livekitStreams';
import { registerRpcRoom, unregisterRpcRoom } from '@/lib/livekitRpc';
import { registerRoomForTranscription, unregisterRoomForTranscription } from '@/lib/livekitTranscription';
import { registerReactionRoom, registerNativeReactionRoom, unregisterReactionRoom, unregisterNativeReactionRoom } from '@/lib/livekitReactions';
import { attachLiveKitRemoteAudioOnce, detachLiveKitRemoteAudio, getLiveKitRemoteAudioKey, primeLiveKitRoomMedia } from '@/lib/livekitMediaSystem';
import { publishReliableLocalMedia } from '@/lib/livekitReliableMedia';
import { clearPreparedCallMediaStream, peekPreparedCallMediaStream } from '@/features/call/preparedCallMedia';
import { claimAndroidWebViewCamera, releaseAndroidWebViewCamera, releaseAndroidWebViewCameraNow } from '@/lib/androidCameraHandoff';
import { isNativeAndroidApp } from '@/utils/nativeUtils';


import { shouldUseNativeLiveKit } from '@/lib/nativeLiveKitGate';
import { nativeLiveKitController } from '@/lib/nativeLiveKitController';
import { useNativeLiveKitEvents } from '@/hooks/useNativeLiveKitEvents';
import { useNativeLiveKitLifecycle } from '@/hooks/useNativeLiveKitLifecycle';
import { toast } from 'sonner';
import { setNativeMediaSurface, clearNativeMediaSurface } from '@/utils/nativeMediaSurface';

interface LiveKitCallState {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  remoteVideoTrack: Track | null;
  localVideoTrack: Track | null;
  nativeSession: { url: string; token: string } | null;
  isNativeMediaActive: boolean;
  localMediaReady: boolean;
  isConnected: boolean;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  connectionState: RTCPeerConnectionState | 'new';
  isInPip: boolean;
  networkQuality: 'excellent' | 'good' | 'poor' | 'lost' | 'unknown';
}


export function useLiveKitCall(
  callId: string | null,
  userId: string | null,
  isHost: boolean,
) {
  const [state, setState] = useState<LiveKitCallState>({
    localStream: null,
    remoteStream: null,
    remoteVideoTrack: null,
    localVideoTrack: null,
    nativeSession: null,
    isNativeMediaActive: false,
    localMediaReady: false,
    isConnected: false,
    isAudioEnabled: true,
    isVideoEnabled: true,
    connectionState: 'new',
    isInPip: false,
    networkQuality: 'unknown',
  });


  const roomRef = useRef<Room | null>(null);
  // Pkg189: token refresh detach handle.
  const tokenRefreshDetachRef = useRef<(() => void) | null>(null);
  const initForCallIdRef = useRef<string | null>(null);
  const deadRef = useRef(false);
  // Pkg73: keep latest callId visible inside the stable `cleanup` callback
  // (which has `[]` deps to avoid disconnect storms on every render).
  const callIdRef = useRef<string | null>(null);
  callIdRef.current = callId;
  // True when this private call session is published via the native
  // Android LiveKit plugin (Capacitor) instead of the browser
  // livekit-client. Drives the native branch in cleanup/toggleAudio/toggleVideo.
  const usingNativeRef = useRef(false);
  // Drives the native event-listener subscription. Mirrors usingNativeRef
  // but as state so the effect re-runs after a successful native connect.
  const [nativeActive, setNativeActive] = useState(false);
  const remoteAudioKeysRef = useRef<Set<string>>(new Set());
  const callVideoRecoveryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callCameraPermissionMonitorRef = useRef<(() => void) | null>(null);
  // Phase 9B: 2s debounce for the "Stabilizing call camera…" toast.
  const callCameraStabilizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callRemoteVideoWatchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callRemoteVideoToastShownRef = useRef(false);
  // Honest-private-call fix (F-12): 15s reconnect-budget timer. Armed on
  // Reconnecting state, cleared on Connected, fires `livekit-call-network-lost`
  // when exhausted so usePrivateCall can endCall('network').
  const reconnectBudgetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastReconnectAttemptAtRef = useRef(0);

  const requestNativeReconnect = useCallback(() => {
    const now = Date.now();
    if (now - lastReconnectAttemptAtRef.current < 2000) return Promise.resolve(false);
    lastReconnectAttemptAtRef.current = now;
    return nativeLiveKitController.reconnectNow();
  }, []);

  // Auto-attach incoming remote video tracks (so the peer's tile renders) and
  // surface native disconnects back into React state. No-op on web/iOS.
  useNativeLiveKitEvents(nativeActive, {
    onDisconnected: (reason) => {
      console.log('[LiveKitCall/Native] disconnected:', reason);
      if (reason === 'PROCESS_BACKGROUND' || reason === 'CLIENT_INITIATED') {
        usingNativeRef.current = false;
        setNativeActive(false);
        setState(p => ({ ...p, isConnected: false, isNativeMediaActive: false, connectionState: 'new' }));
        return;
      }
      if (deadRef.current) return;
      setState(p => ({ ...p, isConnected: false, connectionState: 'connecting' }));
      toast.loading('Restoring call…', { id: 'lk-reconnect' });
      requestNativeReconnect().then((ok) => {
        if (deadRef.current) return;
        if (ok) {
          setNativeActive(true);
          setState(p => ({ ...p, isConnected: true, connectionState: 'connected' }));
          toast.success('Reconnected', { id: 'lk-reconnect', duration: 1500 });
        }
      }).catch(() => {
        if (!deadRef.current) setState(p => ({ ...p, connectionState: 'connecting' }));
      });
    },
    // Step 19 — surface transient reconnect to the user (sticky toast).
    onConnectionState: (s) => {
      if (deadRef.current) return;
      if (s === 'reconnecting') {
        toast.loading('Reconnecting…', { id: 'lk-reconnect' });
        setState(p => ({ ...p, connectionState: 'connecting' }));
      } else if (s === 'degraded' || s === 'reconnect-failed' || s === 'lost') {
        toast.loading('Restoring call…', { id: 'lk-reconnect' });
        requestNativeReconnect().catch(() => {});
      } else {
        toast.success('Reconnected', { id: 'lk-reconnect', duration: 1500 });
        setState(p => ({ ...p, connectionState: p.isConnected ? 'connected' : p.connectionState }));
      }
    },
    // Step 19 — PSTN/alarm interrupt: native side already pauses mic. Tell the user only
    // when permanent so they understand why the other side stopped hearing them.
    onAudioInterruption: (s, permanent) => {
      if (deadRef.current) return;
      if (s === 'loss' && permanent) {
        toast.info('Audio paused — interrupted by another app');
      } else if (s === 'gain') {
        toast.dismiss('lk-audio-interrupt');
      }
    },
    onCameraState: (s) => {
      if (deadRef.current) return;
      if (s === 'started') {
        // Phase 9B: dismiss any pending stabilize toast as soon as frames flow.
        if (callCameraStabilizeTimerRef.current) {
          clearTimeout(callCameraStabilizeTimerRef.current);
          callCameraStabilizeTimerRef.current = null;
        }
        toast.dismiss('lk-call-camera-stabilize');
        setState(p => ({ ...p, localMediaReady: true, isVideoEnabled: true }));
        nativeLiveKitController.attachAllRemotes().catch(() => {});
      } else {
        // Phase 9B: 2s debounce — transient stalls self-recover before toast.
        if (nativeLiveKitController.canAttachFullscreenLocal()) {
          nativeLiveKitController.attachLocal().catch(() => {});
        }
        nativeLiveKitController.attachAllRemotes().catch(() => {});
        if (callCameraStabilizeTimerRef.current) return;
        callCameraStabilizeTimerRef.current = setTimeout(() => {
          callCameraStabilizeTimerRef.current = null;
          if (deadRef.current) return;
          toast.loading('Stabilizing call camera…', { id: 'lk-call-camera-stabilize' });
        }, 2000);
      }
    },
    onVideoStall: (s, isLocal) => {
      if (deadRef.current) return;
      if (s === 'failed' && isLocal) {
        if (nativeLiveKitController.canAttachFullscreenLocal()) {
          nativeLiveKitController.attachLocal().catch(() => {});
        }
        nativeLiveKitController.attachAllRemotes().catch(() => {});
        if (callCameraStabilizeTimerRef.current) return;
        callCameraStabilizeTimerRef.current = setTimeout(() => {
          callCameraStabilizeTimerRef.current = null;
          if (deadRef.current) return;
          toast.loading('Stabilizing call camera…', { id: 'lk-call-camera-stabilize' });
        }, 2000);
      }
    },
    onPipChanged: (isInPip) => {
      if (deadRef.current) return;
      setState(p => ({ ...p, isInPip }));
    },
    onSignalQuality: (quality) => {

      if (deadRef.current) return;
      setState(p => ({ ...p, networkQuality: quality as any }));
    },
  }, callId ? { scope: 'call', id: callId } : undefined);


  // Pause camera + mic when the app is backgrounded; restore on resume.
  // Releases the native camera handle to Android so the OS doesn't kill
  // the app or freeze the published track.
  useNativeLiveKitLifecycle(nativeActive);

  const cleanup = useCallback(() => {
    console.log('[LiveKitCall] cleanup');
    deadRef.current = true;
    initForCallIdRef.current = null;
    if (callVideoRecoveryTimerRef.current) {
      clearInterval(callVideoRecoveryTimerRef.current);
      callVideoRecoveryTimerRef.current = null;
    }
    if (callCameraPermissionMonitorRef.current) {
      try { callCameraPermissionMonitorRef.current(); } catch { /* ignore */ }
      callCameraPermissionMonitorRef.current = null;
    }
    // Phase 9B: cancel pending camera-stabilize debounce + dismiss any
    // surviving toast so it doesn't leak onto the post-call screen.
    if (callCameraStabilizeTimerRef.current) {
      clearTimeout(callCameraStabilizeTimerRef.current);
      callCameraStabilizeTimerRef.current = null;
    }
    try { toast.dismiss('lk-call-camera-stabilize'); } catch { /* ignore */ }
    if (callRemoteVideoWatchdogRef.current) {
      clearInterval(callRemoteVideoWatchdogRef.current);
      callRemoteVideoWatchdogRef.current = null;
    }
    if (reconnectBudgetTimerRef.current) {
      clearTimeout(reconnectBudgetTimerRef.current);
      reconnectBudgetTimerRef.current = null;
    }
    callRemoteVideoToastShownRef.current = false;

    // Phase 4 (Camera Rebuild Plan, 2026-06-14) — F4 fix: dismiss any
    // sticky reconnect/camera-stabilizing toasts BEFORE we tear the room
    // down, so a half-finished recovery toast does not leak into Home /
    // Game Party / next screen. `toast.loading` with a fixed id has no
    // auto-dismiss; without this it persists across route changes.
    try { toast.dismiss('lk-reconnect'); } catch { /* ignore */ }
    try { toast.dismiss('lk-audio-interrupt'); } catch { /* ignore */ }

    // Pkg73: drop call-signaling registration before tearing the room down.
    try { if (callIdRef.current) unregisterCallRoom(callIdRef.current); } catch { /* ignore */ }
    try { if (callIdRef.current) unregisterNativeCallRoom(callIdRef.current); } catch { /* ignore */ }
    // Pkg79: drop chat-signaling registration as well.
    try { if (callIdRef.current) unregisterChatRoom('call', callIdRef.current); } catch { /* ignore */ }
    try { if (callIdRef.current) unregisterNativeChatRoom('call', callIdRef.current); } catch { /* ignore */ }
    // Pkg83: drop gift-signaling registration for call scope.
    try { if (callIdRef.current) unregisterGiftRoom('call', callIdRef.current); } catch { /* ignore */ }
    try { if (callIdRef.current) unregisterNativeGiftRoom('call', callIdRef.current); } catch { /* ignore */ }
    // Pkg98: drop active-speaker registration.
    try { if (callIdRef.current) unregisterActiveSpeakerRoom('call', callIdRef.current); } catch { /* ignore */ }
    // Pkg101: drop connection-quality registration.
    try { if (callIdRef.current) unregisterConnectionQualityRoom('call', callIdRef.current); } catch { /* ignore */ }
    // Pkg154: drop auto audio-only registration.
    try { if (callIdRef.current) unregisterAutoAudioOnlyRoom('call', callIdRef.current); } catch { /* ignore */ }
    // X1: drop 20-min hard reconnect cap.
    try { if (callIdRef.current) unregisterHardReconnectCap('call', callIdRef.current); } catch { /* ignore */ }
    // Pkg107: drop participant-metadata registration.
    try { if (callIdRef.current) unregisterMetadataRoom('call', callIdRef.current); } catch { /* ignore */ }
    // Pkg122: drop room-metadata registration.
    try { if (callIdRef.current) unregisterRoomMetadataRoom('call', callIdRef.current); } catch { /* ignore */ }
    // Pkg121: drop text/byte stream registration.
    try { if (callIdRef.current) unregisterStreamRoom('call', callIdRef.current); } catch { /* ignore */ }
    // Pkg120: drop RPC registration.
    try { if (callIdRef.current) unregisterRpcRoom('call', callIdRef.current); } catch { /* ignore */ }
    // Pkg116: drop transcription registration.
    try { if (callIdRef.current) unregisterRoomForTranscription('call', callIdRef.current); } catch { /* ignore */ }
    // Pkg133: drop reactions registration.
    try { if (callIdRef.current) unregisterReactionRoom('call', callIdRef.current); } catch { /* ignore */ }
    try { if (callIdRef.current) unregisterNativeReactionRoom('call', callIdRef.current); } catch { /* ignore */ }


    if (usingNativeRef.current) {
      nativeLiveKitController.disconnect().catch(() => {});
      usingNativeRef.current = false;
      setNativeActive(false);
    }
    // Always revert WebView transparency on call teardown so other routes
    // (Home, Profile) paint normally.
    clearNativeMediaSurface();

    if (tokenRefreshDetachRef.current) {
      try { tokenRefreshDetachRef.current(); } catch { /* ignore */ }
      tokenRefreshDetachRef.current = null;
    }
    // Pkg-fix: explicitly stop local tracks BEFORE room.disconnect so the
    // hardware camera/mic is freed instantly even if React refs leak.
    try {
      const lp: any = roomRef.current?.localParticipant;
      const pubs = lp?.trackPublications ? Array.from(lp.trackPublications.values()) : [];
      pubs.forEach((pub: any) => {
        const t = pub?.track;
        if (!t) return;
        try { if (typeof t.stop === 'function') t.stop(); } catch {}
        try { if (t.mediaStreamTrack?.stop) t.mediaStreamTrack.stop(); } catch {}
      });
    } catch {}
    if (roomRef.current) {
      roomRef.current.disconnect(true);
      roomRef.current = null;
    }
    // Pkg-fix: also drop any prepared call media stream still cached
    // (covers unmount-before-connect race).
    try {
      const cid = callIdRef.current;
      if (cid) clearPreparedCallMediaStream(cid, { stopTracks: true });
    } catch {}
    void releaseAndroidWebViewCameraNow('livekit-call:cleanup-force');
    remoteAudioKeysRef.current.forEach(detachLiveKitRemoteAudio);
    remoteAudioKeysRef.current.clear();

    setState({
      localStream: null,
      remoteStream: null,
      remoteVideoTrack: null,
      localVideoTrack: null,
      nativeSession: null,
      isNativeMediaActive: false,
      localMediaReady: false,
      isConnected: false,
      isAudioEnabled: true,
      isVideoEnabled: true,
      connectionState: 'new',
      isInPip: false,
      networkQuality: 'unknown',
    });

  }, []);

  useEffect(() => {
    return () => {
      try { toast.dismiss('lk-reconnect'); } catch { /* ignore */ }
      try { toast.dismiss('lk-audio-interrupt'); } catch { /* ignore */ }
      try { toast.dismiss('lk-call-camera-stabilize'); } catch { /* ignore */ }
    };
  }, []);

  const toggleAudio = useCallback(() => {
    const enabled = !state.isAudioEnabled;
    if (usingNativeRef.current) {
      nativeLiveKitController.setMicrophoneEnabled(enabled).catch(() => {});
      setState(p => ({ ...p, isAudioEnabled: enabled }));
      return;
    }
    const room = roomRef.current;
    if (!room?.localParticipant) return;
    room.localParticipant.setMicrophoneEnabled(enabled);
    if (enabled) {
      import('@/lib/livekitNoiseFilter').then((m) => m.applyKrispToRoomMic(room)).catch(() => {});
    }
    setState(p => ({ ...p, isAudioEnabled: enabled }));
  }, [state.isAudioEnabled]);

  const toggleVideo = useCallback(async () => {
    const enabled = !state.isVideoEnabled;
    if (usingNativeRef.current) {
      nativeLiveKitController.setCameraEnabled(enabled).catch(() => {});
      // Auto-switch native audio routing: video off → earpiece + proximity,
      // video on → speakerphone (mirrors how WhatsApp/Messenger behave).
      nativeLiveKitController.setAudioMode(enabled ? 'video' : 'voice').catch(() => {});
      setState(p => ({ ...p, isVideoEnabled: enabled }));
      return;
    }
    const room = roomRef.current;
    if (!room?.localParticipant) return;
    if (enabled) await claimAndroidWebViewCamera('call:web-toggle-video');
    await room.localParticipant.setCameraEnabled(enabled);
    if (!enabled) releaseAndroidWebViewCamera('call:web-toggle-video-off');
    setState(p => ({ ...p, isVideoEnabled: enabled }));
  }, [state.isVideoEnabled]);

  /** Toggle native speakerphone during a call. No-op on web/iOS. */
  const setSpeakerOn = useCallback((on: boolean) => {
    if (!usingNativeRef.current) return;
    nativeLiveKitController.setSpeakerphone(on).catch(() => {});
  }, []);

  useEffect(() => {
    if (!callId || !userId) return;
    if (initForCallIdRef.current === callId) return;
    deadRef.current = false;
    initForCallIdRef.current = callId;

    const roomName = `call_${callId}`;


    const init = async () => {
      try {
        console.log('[LiveKitCall] Initializing for call:', callId);

        // 🛰️ Android uses native LiveKit; web preview/desktop uses the
        // livekit-client path below so the call init button is testable and
        // does not show a fake blank screen in Lovable preview.
        const nativeCallRequired = shouldUseNativeLiveKit({ feature: 'private-call' });
        if (isNativeAndroidApp() && !nativeCallRequired) {
          cleanup();
          toast.error('Private calls require the Android app.');
          setState(p => ({ ...p, connectionState: 'failed' as any, isConnected: false, localMediaReady: false }));
          // P0 FIX: reset init guard so a later kill-switch re-enable can retry.
          // Previously isInitRef stayed true, permanently blocking re-init for the session.
          initForCallIdRef.current = null;
          return;
        }

        if (nativeCallRequired) {
          try {
            warmLiveKitToken(roomName, 'call').catch(() => {});
            const { token, url } = await getLiveKitToken(roomName, 'call');
            if (deadRef.current) return;

            // Preview → call handoff: do NOT kill an already-running prepared
            // camera before native connect. Native Android promotes its LiveKit
            // preview track into the session; Lovable web preview media is
            // cleared only after connect succeeds/fails. Stopping here creates
            // the blank gap when tapping the call init button.

            // One quick retry — Camera2 device can be briefly held by the
            // previous preview / freshly-revoked call on the same device.
            let nAttempt = 0;
            let lastNErr: unknown = null;
            while (nAttempt < 2) {
              if (deadRef.current) {
                // Component unmounted mid-retry; bail before any further
                // native camera/mic acquisition.
                try { await nativeLiveKitController.disconnect(); } catch { /* ignore */ }
                return;
              }
              nAttempt++;
              try {
                await nativeLiveKitController.connectAndPublish({
                  url,
                  token,
                  video: true,
                  audio: true,
                  lens: 'front',
                  // Private call is locked to the same 1080p portrait capture
                  // contract as live/party so the accepted call does not fall
                  // back to a blurry 720p native session.
                  resolution: '1080p',
                  // Private-call video is rendered through React-positioned
                  // <NativeVideoView /> slots (remote fullscreen + local PiP).
                  // Do NOT mount the legacy native fullscreen local renderer:
                  // it can sit over/compete with the remote slot and recreate
                  // the “connecting / no overlay” issue on OEM EGL stacks.
                  attachLocal: false,
                  callType: 'Video Call',
                  audioProfile: 'voice',
                  roomScope: 'call',
                });
                lastNErr = null;
                break;
              } catch (e) {
                lastNErr = e;
                if (nAttempt < 2 && !deadRef.current) {
                  console.warn('[LiveKitCall/Native] connect failed, retrying in 500ms:', e);
                  // Preserve the prejoin preview track between retries so the
                  // second attempt promotes the SAME camera instead of closing
                  // and reopening Camera2.
                  try { await nativeLiveKitController.disconnectSessionOnly(); } catch { /* noop */ }
                  await new Promise((r) => setTimeout(r, 500));
                }
              }
            }
            if (deadRef.current) {
              try { await nativeLiveKitController.disconnect(); } catch { /* ignore */ }
              return;
            }
            if (lastNErr) throw lastNErr;
            clearPreparedCallMediaStream(callId, { stopTracks: true });

            // Section#5 pass-2 (Bug I — NATIVE CAMERA LEAK): if cleanup ran
            // while connectAndPublish was awaiting, native side is already
            // publishing — disconnect immediately so the camera/mic don't
            // stay on after the React component is gone.
            if (deadRef.current) {
              try { await nativeLiveKitController.disconnect(); } catch { /* ignore */ }
              return;
            }

            usingNativeRef.current = true;
            if (callId) {
              registerNativeCallRoom(callId);
              registerNativeChatRoom('call', callId);
              registerNativeGiftRoom('call', callId);
            }
            setNativeActive(true);
            // Only after bounded native surfaces are connected do we make the
            // WebView document transparent. Doing this during accept/connect
            // exposed the raw full-screen camera behind the React UI.
            setNativeMediaSurface(true);
            setState(p => ({
              ...p,
              nativeSession: { url, token },
              isNativeMediaActive: true,
              localMediaReady: true,
              isConnected: true,
              connectionState: 'connected',
              isAudioEnabled: true,
              isVideoEnabled: true,
            }));
            console.log('[LiveKitCall/Native] ✅ Connected');
            // Pkg423 — defense-in-depth: initial remote attach sweep after
            // connectAndPublish resolves. Covers the case where the peer was
            // already in the room and their track-subscribed event fired
            // before useNativeLiveKitEvents wired its listeners. Repeat at
            // 80/250/600 ms because native participant/track events can be
            // delivered slightly after `connect()` resolves.
            nativeLiveKitController.attachAllRemotes().catch(() => {});
            setTimeout(() => { if (!deadRef.current) nativeLiveKitController.attachAllRemotes().catch(() => {}); }, 80);
            setTimeout(() => { if (!deadRef.current) nativeLiveKitController.attachAllRemotes().catch(() => {}); }, 250);
            setTimeout(() => { if (!deadRef.current) nativeLiveKitController.attachAllRemotes().catch(() => {}); }, 600);
            return;
          } catch (nativeErr) {
            console.error('[LiveKitCall/Native] init failed after retry:', nativeErr);
            usingNativeRef.current = false;
            setNativeActive(false);
            clearNativeMediaSurface();
            try { await nativeLiveKitController.disconnect(); } catch { /* noop */ }
            toast.error('Call camera failed to start. Please end the call and try again.');
            setState(p => ({ ...p, connectionState: 'failed' as any, isConnected: false, localMediaReady: false }));
            throw nativeErr instanceof Error ? nativeErr : new Error(String((nativeErr as any)?.message || nativeErr));
          }
        }

        // Pkg108: Fetch E2EE key + build options BEFORE Room construction.
        // Key is shared with peer via `private_calls.e2ee_key` RPC. If kill
        // switch is off OR browser lacks Insertable Streams, e2eeOption is
        // undefined and the call falls back to plain SFU media (no break).
        const { fetchCallE2EEKey, buildE2EEOptions } = await import('@/lib/livekitE2EE');
        const e2eeKey = await fetchCallE2EEKey(callId);
        const { e2eeOption } = await buildE2EEOptions(e2eeKey);

        const room = new Room({
          // Pkg155: Chamet/Imo-parity — adaptive stream + dynacast ON for 1:1 calls
          // Both sides save uplink/downlink based on visible video size + connection quality.
          adaptiveStream: true,
          dynacast: true,
          // T-shirt rule: one connect per call. Any transport drop =
          // call ends permanently. New call = brand new connect.
          reconnectPolicy: {
            nextRetryDelayInMs: () => null,
          },
          videoCaptureDefaults: {
            resolution: VideoPresets.h1080.resolution,
            facingMode: 'user',
          },
          // Pkg163: pro-grade voice (AEC+NS+AGC + 48kHz mono) for 1:1 calls.
          audioCaptureDefaults: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
            sampleRate: 48000,
          },
          publishDefaults: {
            videoEncoding: {
              maxBitrate: 6_500_000,
              maxFramerate: 30,
            },
            degradationPreference: 'maintain-resolution',
            simulcast: false,
            // Pkg205 (M3): device-aware codec selection (Safari → H.264,
            // Chromium → AV1/VP9, H.264 backup preferred over VP8).
            ...pickOptimalCodecs(),
            // Pkg163: high-quality voice opus + RED packet-loss resilience.
            audioPreset: AudioPresets.musicHighQuality,
            dtx: false,
            red: true,
          },
          // Pkg108: undefined when disabled — Room treats as plain.
          e2ee: e2eeOption,
        });
        roomRef.current = room;
        primeLiveKitRoomMedia(room);

        // Pkg108: enable E2EE on the Room post-construction (per SDK API).
        if (e2eeOption) {
          try {
            await room.setE2EEEnabled(true);
            console.log('[LiveKitCall] 🔐 E2EE enabled');
          } catch (err) {
            console.warn('[LiveKitCall] setE2EEEnabled failed — continuing plaintext:', err);
          }
        }

        // Handle remote tracks
        room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
          if (deadRef.current) return;
          console.log('[LiveKitCall] Track subscribed:', track.kind, 'from', participant.identity);

          if (track.kind === Track.Kind.Video) {
            try {
              publication.setVideoQuality?.(VideoQuality.HIGH);
              // Pkg155: FORCE SUBSCRIBE to high quality
              publication.setSubscribed(true);
            } catch { /* ignore */ }
            
            setState(p => ({
              ...p,
              remoteVideoTrack: track,
              isConnected: true,
              connectionState: 'connected',
            }));
          }

          if (track.kind === Track.Kind.Audio) {
            const key = getLiveKitRemoteAudioKey('call', participant.identity, publication, track);
            if (!remoteAudioKeysRef.current.has(key)) {
              // Pkg155: Ensure audio is attached and played
              const audioElement = attachLiveKitRemoteAudioOnce({ scope: 'call', key, track });
              if (audioElement) {
                remoteAudioKeysRef.current.add(key);
                audioElement.play().catch(() => {});
              }
            }
          }

          // Build remote MediaStream
          const ms = new MediaStream();
          participant.trackPublications.forEach(pub => {
            if (pub.track?.mediaStreamTrack) {
              ms.addTrack(pub.track.mediaStreamTrack);
            }
          });
          
          setState(p => ({
            ...p,
            remoteStream: ms.getTracks().length > 0 ? ms : p.remoteStream,
            isConnected: true,
            connectionState: 'connected',
          }));
        });

        room.on(RoomEvent.TrackPublished, (publication: RemoteTrackPublication, _participant: RemoteParticipant) => {
          if (deadRef.current) return;
          console.log(`[LiveKitCall] Track published: ${publication.kind}`);

          try {
            // Pkg155: Force subscription on every publish event
            publication.setSubscribed(true);
          } catch { /* ignore */ }
        });

        room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
          if (track.kind === Track.Kind.Video) {
            setState(p => ({ ...p, remoteVideoTrack: null }));
          }
          if (track.kind === Track.Kind.Audio) {
            const key = getLiveKitRemoteAudioKey('call', participant.identity, publication, track);
            remoteAudioKeysRef.current.delete(key);
            detachLiveKitRemoteAudio(key);
          }
          track.detach().forEach(el => el.remove());
        });

        room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
          console.log('[LiveKitCall] Remote participant left');
          Array.from(remoteAudioKeysRef.current)
            .filter((key) => key.startsWith(`call:${participant.identity}:`))
            .forEach((key) => {
              remoteAudioKeysRef.current.delete(key);
              detachLiveKitRemoteAudio(key);
            });
          setState(p => ({
            ...p,
            remoteVideoTrack: null,
            remoteStream: null,
            isConnected: false,
            connectionState: 'closed' as any,
          }));
        });

        room.on(RoomEvent.Disconnected, () => {
          console.log('[LiveKitCall] Room disconnected');
          setState(p => ({ ...p, connectionState: 'disconnected' as any, isConnected: false }));
        });

        room.on(RoomEvent.ConnectionStateChanged, (connectionState: ConnectionState) => {
          console.log('[LiveKitCall] Connection state:', connectionState);
          if (connectionState === ConnectionState.Connected) {
            setState(p => ({ ...p, connectionState: 'connected', isConnected: true }));
            // Honest-private-call fix (F-13): surface reconnect end.
            if (reconnectBudgetTimerRef.current) {
              clearTimeout(reconnectBudgetTimerRef.current);
              reconnectBudgetTimerRef.current = null;
            }
            // Honest-private-call fix (F-11): tell usePrivateCall the
            // reconnect is over so the duration timer resumes.
            try {
              window.dispatchEvent(new CustomEvent('livekit-call-reconnected', {
                detail: { callId: callIdRef.current },
              }));
            } catch { /* ignore */ }
          } else if (connectionState === ConnectionState.Reconnecting) {
            // Honest-private-call fix (F-12 + F-13 + L-10): make reconnect
            // visible and arm a 30s budget — industry standard (GetStream /
            // Agora / LiveKit production recommendation). Was 15s, but
            // ICE-restart recovery typically takes 5–25s on flaky mobile
            // networks; 15s force-ended calls that would have recovered.
            setState(p => ({ ...p, connectionState: 'connecting' as any, isConnected: false }));
            // Honest-private-call fix (F-11): pause the visible duration
            // counter while the call is reconnecting (server-side billing
            // tick is separately governed by `connected_at`).
            try {
              window.dispatchEvent(new CustomEvent('livekit-call-reconnecting', {
                detail: { callId: callIdRef.current },
              }));
            } catch { /* ignore */ }
            if (!reconnectBudgetTimerRef.current) {
              reconnectBudgetTimerRef.current = setTimeout(() => {
                reconnectBudgetTimerRef.current = null;
                if (deadRef.current) return;
                const r = roomRef.current;
                if (!r) return;
                if (r.state === ConnectionState.Connected) return;
                console.warn('[LiveKitCall] Reconnect budget exhausted — forcing network end');
                try {
                  window.dispatchEvent(new CustomEvent('livekit-call-network-lost', {
                    detail: { callId: callIdRef.current, reason: 'network' },
                  }));
                } catch { /* ignore */ }
              }, 30000);
            }

          } else if (connectionState === ConnectionState.Disconnected) {
            if (reconnectBudgetTimerRef.current) {
              clearTimeout(reconnectBudgetTimerRef.current);
              reconnectBudgetTimerRef.current = null;
            }
          }
        });

        // Handle local tracks published
        room.on(RoomEvent.LocalTrackPublished, (publication) => {
          if (deadRef.current) return;
          const track = publication.track;
          if (track && track.kind === Track.Kind.Video) {
            setState(p => ({ ...p, localVideoTrack: track }));
            // CRYSTAL CLEAR: Set contentHint for maximum sharpness
            try {
              const mt = track.mediaStreamTrack;
              if (mt && 'contentHint' in mt) (mt as any).contentHint = 'detail';
            } catch { /* ignore */ }
          }
        });

        // Get token and connect
        console.log('[LiveKitCall] Fetching token...');
        warmLiveKitToken(roomName, 'call').catch(() => {});
        const tokenResp = await getLiveKitToken(roomName, 'call');
        const { token, url, ttl } = tokenResp;

        if (deadRef.current) return;

        console.log('[LiveKitCall] Connecting to room...');
        const connectPromise = (async () => {
          await room.prepareConnection(url, token).catch(() => {});
          await connectLiveKitRoom(room, url, token, 'call');
        })();
        await connectPromise;
        console.log('[LiveKitCall] ✅ Connected to room');

        // Section#5 pass-2 (Bug H — CAMERA LEAK): if the component unmounted
        // while `room.connect` was in-flight, cleanup already ran but the
        // room object we just connected is detached from React. Tear it down
        // immediately so we don't go on to call enableCameraAndMicrophone()
        // and leave the camera/mic publishing forever.
        if (deadRef.current) {
          try { room.disconnect(true); } catch { /* ignore */ }
          return;
        }

        // Pkg189: silent token refresh before TTL expiry.
        if (tokenRefreshDetachRef.current) {
          try { tokenRefreshDetachRef.current(); } catch { /* ignore */ }
        }
        tokenRefreshDetachRef.current = attachLiveKitTokenRefresh(
          room,
          async () => {
            const fresh = await getLiveKitToken(roomName, 'call');
            return { token: fresh.token, url: fresh.url, ttl: fresh.ttl };
          },
          ttl ?? 60 * 60 * 6,
          { label: 'lk-call' }
        );

        // Pkg73: bind this Room to the callId so call-end packets can be
        // exchanged between caller and host directly (Supabase broadcast
        // remains the fallback path).
        if (callId) registerCallRoom(callId, room);
        // Pkg79: bind same Room to chat signaling registry for InCallChat
        if (callId) registerChatRoom('call', callId, room);
        // Pkg83: bind same Room to gift signaling registry for ActiveCallScreen
        if (callId) registerGiftRoom('call', callId, room);
        // Pkg98: bind for active-speaker detection (ring the speaking peer).
        if (callId) registerActiveSpeakerRoom('call', callId, room);
        // Pkg101: bind for connection-quality indicator on call tile.
        if (callId) registerConnectionQualityRoom('call', callId, room);
        // Pkg154: bind auto audio-only (unsub remote video on sustained poor).
        if (callId) registerAutoAudioOnlyRoom('call', callId, room);
        // X1: arm 20-min hard reconnect cap — gives up + dispatches 'livekit-reconnect-abandoned'.
        if (callId) registerHardReconnectCap('call', callId, room);
        // Pkg107: bind for participant metadata sync (AFK/role/mod flags).
        if (callId) registerMetadataRoom('call', callId, room);
        // Pkg122: bind for room-wide metadata (shared room state).
        if (callId) registerRoomMetadataRoom('call', callId, room);
        // Pkg121: bind for text/byte streams (chunked chat, file attachments).
        if (callId) registerStreamRoom('call', callId, room);
        // Pkg120: bind for participant RPC (moderator commands, seat-ack, raise-hand).
        if (callId) registerRpcRoom('call', callId, room);
        // Pkg116: bind for realtime transcription / captions.
        if (callId) registerRoomForTranscription('call', callId, room);
        // Pkg133: bind for floating emoji reactions.
        if (callId) registerReactionRoom('call', callId, room);


        // Pkg-audit: canPublish guard — if server token denies publish,
        // try ONE token refresh + reconnect before warning. This is the real fix
        // for "silent one-way video" — never accept a publish-denied token silently.
        {
          const perms = (room.localParticipant as any).permissions;
          if (perms && perms.canPublish === false) {
            console.warn('[LiveKitCall] Token canPublish=false — attempting refresh + reconnect');
            try {
              const fresh = await getLiveKitToken(roomName, 'call');
              if (fresh?.token) {
                try { await room.disconnect(true); } catch { /* ignore */ }
                if (deadRef.current) return;
                await room.connect(fresh.url, fresh.token);
                const perms2 = (room.localParticipant as any).permissions;
                if (perms2 && perms2.canPublish === false) {
                  console.error('[LiveKitCall] Refresh still canPublish=false — giving up');
                  toast.error('Call token denied camera publish. You may see a black screen.');
                } else {
                  console.log('[LiveKitCall] ✅ canPublish restored after refresh');
                }
              }
            } catch (e) {
              console.error('[LiveKitCall] canPublish refresh failed:', e);
              toast.error('Call token denied camera publish. You may see a black screen.');
            }
          }
        }

        // Enable camera and microphone with retry (3 attempts).
        let publishAttempt = 0;
        let publishError: Error | null = null;
        while (publishAttempt < 3) {
          try {
            const preparedStream = peekPreparedCallMediaStream(callId);
            await publishReliableLocalMedia(room, {
              needVideo: true,
              needAudio: true,
              preparedStream,
            });
            clearPreparedCallMediaStream(callId);
            publishError = null;
            break;
          } catch (e) {
            publishError = e instanceof Error ? e : new Error(String(e));
            publishAttempt++;
            console.warn(`[LiveKitCall] Publish attempt ${publishAttempt} failed:`, publishError.message);
            if (publishAttempt < 3) {
              await new Promise(r => setTimeout(r, 300 * publishAttempt));
            }
          }
        }
        if (publishError) {
          console.error('[LiveKitCall] Camera/mic publish failed after 3 attempts:', publishError);
          toast.error('Camera failed to start. Please check permissions and retry.');
          throw publishError;
        }
        console.log('[LiveKitCall] ✅ Camera and mic enabled');
        if (callVideoRecoveryTimerRef.current) clearInterval(callVideoRecoveryTimerRef.current);

        // Pkg-audit Camera-bulletproof: instant onended listener + polling safety-net
        let callRecovering = false;
        const recoverCallCamera = () => {
          if (callRecovering || deadRef.current || usingNativeRef.current) return;
          const activeRoom = roomRef.current;
          if (!activeRoom || activeRoom.state !== ConnectionState.Connected) return;
          callRecovering = true;
          console.warn('[LiveKitCall] 📷 Recovering camera...');
          activeRoom.localParticipant.setCameraEnabled(false).catch(() => {})
            .then(() => new Promise((resolve) => setTimeout(resolve, 150)))
            .then(() => activeRoom.localParticipant.setCameraEnabled(true))
            .then(() => {
              const fresh = Array.from(activeRoom.localParticipant.trackPublications.values())
                .find((p: any) => p.track?.kind === Track.Kind.Video && p.source === Track.Source.Camera);
              const freshMt = (fresh?.track as any)?.mediaStreamTrack as MediaStreamTrack | undefined;
              if (freshMt) attachCallOnEnded(freshMt);
            })
            .catch((e) => console.warn('[LiveKitCall] camera recovery failed:', e))
            .finally(() => { callRecovering = false; });
        };
        const callAttachedTracks = new WeakSet<MediaStreamTrack>();
        const attachCallOnEnded = (mt: MediaStreamTrack) => {
          if (callAttachedTracks.has(mt)) return;
          callAttachedTracks.add(mt);
          try {
            mt.addEventListener('ended', () => {
              console.warn('[LiveKitCall] 📷 Camera track ended (instant detect)');
              recoverCallCamera();
            });
            // Pkg-audit: browser/OS-level mute (e.g. another app grabs camera)
            // fires 'mute' WITHOUT 'ended' — must recover here too or peer sees black.
            mt.addEventListener('mute', () => {
              console.warn('[LiveKitCall] 📷 Camera track muted by browser/OS — recovering');
              recoverCallCamera();
            });
          } catch { /* ignore */ }
        };
        const initialCallPub = Array.from(room.localParticipant.trackPublications.values())
          .find((p: any) => p.track?.kind === Track.Kind.Video && p.source === Track.Source.Camera);
        const initialCallMt = (initialCallPub?.track as any)?.mediaStreamTrack as MediaStreamTrack | undefined;
        if (initialCallMt) attachCallOnEnded(initialCallMt);

        callVideoRecoveryTimerRef.current = setInterval(() => {
          if (deadRef.current || usingNativeRef.current) return;
          const activeRoom = roomRef.current;
          if (!activeRoom || activeRoom.state !== ConnectionState.Connected) return;
          const vPub = Array.from(activeRoom.localParticipant.trackPublications.values())
            .find((p: any) => p.track?.kind === Track.Kind.Video && p.source === Track.Source.Camera);
          const mediaTrack = (vPub?.track as any)?.mediaStreamTrack as MediaStreamTrack | undefined;
          if (!mediaTrack) return;
          attachCallOnEnded(mediaTrack);
          if (mediaTrack.readyState === 'ended') recoverCallCamera();
        }, 4000);

        // Pkg-audit Camera-bulletproof: monitor OS camera permission revocation
        if (typeof navigator !== 'undefined' && 'permissions' in navigator) {
          try {
            const perm = await navigator.permissions.query({ name: 'camera' as PermissionName });
            const onPermChange = () => {
              console.warn('[LiveKitCall] Camera permission changed:', perm.state);
              if (perm.state === 'denied' || perm.state === 'prompt') {
                toast.error('Camera permission was revoked. Trying to recover…');
                recoverCallCamera();
              }
            };
            perm.addEventListener('change', onPermChange);
            callCameraPermissionMonitorRef.current = () => perm.removeEventListener('change', onPermChange);
          } catch { /* ignore — some browsers don't support camera permission query */ }
        }

        // Pkg-audit: Remote video arrival watchdog. If a remote participant is
        // in the room but no remote video track arrives within 12s (peer's
        // camera silently failed / canPublish=false on their side / SFU
        // subscription dropped), surface a clear toast instead of leaving the
        // user staring at a black face wondering what happened.
        callRemoteVideoToastShownRef.current = false;
        const watchdogStartedAt = Date.now();
        callRemoteVideoWatchdogRef.current = setInterval(() => {
          if (deadRef.current || usingNativeRef.current) return;
          const activeRoom = roomRef.current;
          if (!activeRoom || activeRoom.state !== ConnectionState.Connected) return;
          const remotes = Array.from(activeRoom.remoteParticipants.values());
          if (remotes.length === 0) return; // peer not joined yet — don't blame
          const hasRemoteVideo = remotes.some(rp =>
            Array.from(rp.trackPublications.values()).some((pub: any) =>
              pub.kind === Track.Kind.Video && pub.track && !pub.isMuted
            )
          );
          if (hasRemoteVideo) {
            callRemoteVideoToastShownRef.current = false;
            return;
          }
          const elapsed = Date.now() - watchdogStartedAt;
          if (elapsed > 12000 && !callRemoteVideoToastShownRef.current) {
            callRemoteVideoToastShownRef.current = true;
            console.warn('[LiveKitCall] ⚠️ Peer video not arriving after 12s');
            toast.error("Peer's camera isn't arriving. Ask them to re-enable video.");
            // Nudge SFU: re-request subscription on all remote video pubs.
            remotes.forEach(rp => {
              rp.trackPublications.forEach((pub: any) => {
                if (pub.kind === Track.Kind.Video) {
                  try { pub.setSubscribed(false); } catch { /* ignore */ }
                  setTimeout(() => { try { pub.setSubscribed(true); } catch { /* ignore */ } }, 250);
                }
              });
            });
          }
        }, 2000);


        // Section#5 pass-2 (Bug H continued): cleanup may have fired during
        // the enableCameraAndMicrophone() await. Disable + disconnect now so
        // we don't leave a publishing camera/mic behind.
        if (deadRef.current) {
          try { await room.localParticipant.setCameraEnabled(false); } catch { /* ignore */ }
          try { await room.localParticipant.setMicrophoneEnabled(false); } catch { /* ignore */ }
          try { room.disconnect(true); } catch { /* ignore */ }
          return;
        }

        // Pkg103: apply Krisp noise filter to published mic
        import('@/lib/livekitNoiseFilter').then((m) => m.applyKrispToRoomMic(room)).catch(() => {});

        // Pkg204: contentHint='motion' on camera track — smoother under congestion.
        import('@/lib/livekitCameraTuning').then((m) => m.applyMotionHint(room)).catch(() => {});


        // Build local MediaStream
        const localMs = new MediaStream();
        let localVidTrack: Track | null = null;
        
        room.localParticipant.trackPublications.forEach(pub => {
          if (pub.track?.mediaStreamTrack) {
            localMs.addTrack(pub.track.mediaStreamTrack);
            if (pub.track.kind === Track.Kind.Video) {
              localVidTrack = pub.track;
            }
          }
        });

        setState(p => ({
          ...p,
          localStream: localMs.getTracks().length > 0 ? localMs : null,
          localVideoTrack: localVidTrack,
          isNativeMediaActive: false,
          localMediaReady: localMs.getTracks().length > 0,
          isVideoEnabled: true,
          isAudioEnabled: true,
          connectionState: 'connected',
        }));

        // Force immediate remote subscriptions + aggressive retries for instant call media
        const syncRemoteParticipants = () => {
          room.remoteParticipants.forEach(participant => {
            participant.trackPublications.forEach(pub => {
              if (!pub.isSubscribed) {
                try { pub.setSubscribed(true); } catch { /* ignore */ }
              }

              if (pub.track && pub.isSubscribed) {
                if (pub.track.kind === Track.Kind.Video) {
                  try { (pub as any).setVideoQuality?.(VideoQuality.HIGH); } catch {}
                  setState(p => ({
                    ...p,
                    remoteVideoTrack: pub.track,
                    isConnected: true,
                    connectionState: 'connected',
                  }));
                }
                if (pub.track.kind === Track.Kind.Audio) {
                  const key = getLiveKitRemoteAudioKey('call', participant.identity, pub as RemoteTrackPublication, pub.track as RemoteTrack);
                  if (!remoteAudioKeysRef.current.has(key)) {
                    const audioEl = attachLiveKitRemoteAudioOnce({ scope: 'call', key, track: pub.track as RemoteTrack });
                    if (audioEl) remoteAudioKeysRef.current.add(key);
                  }
                }
              }
            });
          });
        };

        syncRemoteParticipants();
        // Aggressive retries at 30ms, 80ms, 200ms, 500ms for sub-second media
        setTimeout(syncRemoteParticipants, 30);
        setTimeout(syncRemoteParticipants, 80);
        setTimeout(syncRemoteParticipants, 200);
        setTimeout(syncRemoteParticipants, 500);

      } catch (err) {
        console.error('[LiveKitCall] init error:', err);
        setState(p => ({ ...p, connectionState: 'failed' as any }));
      }
    };

    init();

    return () => {
      cleanup();
    };
  }, [callId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    ...state,
    toggleAudio,
    toggleVideo,
    setSpeakerOn,
    cleanup,
    remoteStreamVersion: 0,
  };
}
