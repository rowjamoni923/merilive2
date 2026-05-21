/**
 * useAgoraCall – Now powered by LiveKit (API-compatible replacement).
 * Same public surface as the original Agora-based hook:
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
  VideoQuality,
} from 'livekit-client';
import { getLiveKitToken, warmLiveKitToken } from '@/services/livekitService';
import { registerCallRoom, unregisterCallRoom } from '@/lib/livekitCallSignaling';
import { processTrackWithBeauty, destroyBeautyProcessor } from '@/services/tencentBeautyProcessor';
import { shouldUseNativeLiveKit } from '@/lib/nativeLiveKitGate';
import { nativeLiveKitController } from '@/lib/nativeLiveKitController';
import { useNativeLiveKitEvents } from '@/hooks/useNativeLiveKitEvents';
import { useNativeLiveKitLifecycle } from '@/hooks/useNativeLiveKitLifecycle';
import { toast } from 'sonner';

interface LiveKitCallState {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  remoteVideoTrack: Track | null;
  localVideoTrack: Track | null;
  isNativeMediaActive: boolean;
  localMediaReady: boolean;
  isConnected: boolean;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  connectionState: RTCPeerConnectionState | 'new';
}

export function useAgoraCall(
  callId: string | null,
  userId: string | null,
  isHost: boolean,
) {
  const [state, setState] = useState<LiveKitCallState>({
    localStream: null,
    remoteStream: null,
    remoteVideoTrack: null,
    localVideoTrack: null,
    isNativeMediaActive: false,
    localMediaReady: false,
    isConnected: false,
    isAudioEnabled: true,
    isVideoEnabled: true,
    connectionState: 'new',
  });

  const roomRef = useRef<Room | null>(null);
  const isInitRef = useRef(false);
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

  // Auto-attach incoming remote video tracks (so the peer's tile renders) and
  // surface native disconnects back into React state. No-op on web/iOS.
  useNativeLiveKitEvents(nativeActive, {
    onDisconnected: (reason) => {
      console.log('[LiveKitCall/Native] disconnected:', reason);
      if (deadRef.current) return;
      setState(p => ({ ...p, isConnected: false, connectionState: 'connecting' }));
      toast.loading('Restoring call…', { id: 'lk-reconnect' });
      nativeLiveKitController.reconnectNow().then((ok) => {
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
        nativeLiveKitController.reconnectNow().catch(() => {});
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
  });

  // Pause camera + mic when the app is backgrounded; restore on resume.
  // Releases the native camera handle to Android so the OS doesn't kill
  // the app or freeze the published track.
  useNativeLiveKitLifecycle(nativeActive);

  const cleanup = useCallback(() => {
    console.log('[LiveKitCall] cleanup');
    deadRef.current = true;
    isInitRef.current = false;

    // Pkg73: drop call-signaling registration before tearing the room down.
    try { if (callIdRef.current) unregisterCallRoom(callIdRef.current); } catch { /* ignore */ }

    if (usingNativeRef.current) {
      nativeLiveKitController.disconnect().catch(() => {});
      usingNativeRef.current = false;
      setNativeActive(false);
    }

    if (roomRef.current) {
      roomRef.current.disconnect(true);
      roomRef.current = null;
    }

    setState({
      localStream: null,
      remoteStream: null,
      remoteVideoTrack: null,
      localVideoTrack: null,
      isNativeMediaActive: false,
      localMediaReady: false,
      isConnected: false,
      isAudioEnabled: true,
      isVideoEnabled: true,
      connectionState: 'new',
    });
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
    setState(p => ({ ...p, isAudioEnabled: enabled }));
  }, [state.isAudioEnabled]);

  const toggleVideo = useCallback(() => {
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
    room.localParticipant.setCameraEnabled(enabled);
    setState(p => ({ ...p, isVideoEnabled: enabled }));
  }, [state.isVideoEnabled]);

  /** Toggle native speakerphone during a call. No-op on web/iOS. */
  const setSpeakerOn = useCallback((on: boolean) => {
    if (!usingNativeRef.current) return;
    nativeLiveKitController.setSpeakerphone(on).catch(() => {});
  }, []);

  useEffect(() => {
    if (!callId || !userId) return;
    if (isInitRef.current) return;
    isInitRef.current = true;
    deadRef.current = false;

    const roomName = `call_${callId}`;

    const init = async () => {
      try {
        console.log('[LiveKitCall] Initializing for call:', callId);

        // 🛰️ Native Android publish path. Web/iOS gate=false → falls
        // through to web livekit-client Room flow below.
        if (shouldUseNativeLiveKit({ feature: 'private-call' })) {
          try {
            warmLiveKitToken(roomName, 'call').catch(() => {});
            const { token, url } = await getLiveKitToken(roomName, 'call');
            if (deadRef.current) return;

            // One quick retry — Camera2 device can be briefly held by the
            // previous preview / freshly-revoked call on the same device.
            let nAttempt = 0;
            let lastNErr: unknown = null;
            while (nAttempt < 2) {
              nAttempt++;
              try {
                await nativeLiveKitController.connectAndPublish({
                  url,
                  token,
                  video: true,
                  audio: true,
                  lens: 'front',
                  resolution: '1080p',
                  attachLocal: true,
                });
                lastNErr = null;
                break;
              } catch (e) {
                lastNErr = e;
                if (nAttempt < 2) {
                  console.warn('[LiveKitCall/Native] connect failed, retrying in 500ms:', e);
                  try { await nativeLiveKitController.disconnect(); } catch { /* noop */ }
                  await new Promise((r) => setTimeout(r, 500));
                }
              }
            }
            if (lastNErr) throw lastNErr;

            usingNativeRef.current = true;
            setNativeActive(true);
            setState(p => ({
              ...p,
              isNativeMediaActive: true,
              localMediaReady: true,
              isConnected: true,
              connectionState: 'connected',
              isAudioEnabled: true,
              isVideoEnabled: true,
            }));
            console.log('[LiveKitCall/Native] ✅ Connected');
            return;
          } catch (nativeErr) {
            console.error('[LiveKitCall/Native] init failed after retry, falling back to web:', nativeErr);
            usingNativeRef.current = false;
            setNativeActive(false);
            // Fall through to web path — WebView's livekit-client can still
            // bring up the call as a safety net.
          }
        }

        const room = new Room({
          // CRYSTAL CLEAR: No adaptive downgrade for calls
          adaptiveStream: false,
          dynacast: false,
          reconnectPolicy: {
            nextRetryDelayInMs: (context: any) => {
              if (context.retryCount > 12) return null;
              return Math.min(100 * Math.pow(1.3, context.retryCount), 5000);
            },
          },
          videoCaptureDefaults: {
            resolution: VideoPresets.h1080.resolution,
            facingMode: 'user',
          },
          publishDefaults: {
            videoEncoding: {
              maxBitrate: 6_500_000,
              maxFramerate: 30,
            },
            degradationPreference: 'maintain-resolution',
            simulcast: false,
          },
        });
        roomRef.current = room;

        // Handle remote tracks
        room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
          if (deadRef.current) return;
          console.log('[LiveKitCall] Track subscribed:', track.kind, 'from', participant.identity);

          if (track.kind === Track.Kind.Video) {
            try {
              publication.setVideoQuality?.(VideoQuality.HIGH);
            } catch {
              // ignore optional API failure
            }
            setState(p => ({
              ...p,
              remoteVideoTrack: track,
              isConnected: true,
              connectionState: 'connected',
            }));
          }

          if (track.kind === Track.Kind.Audio) {
            const audioElement = track.attach();
            audioElement.play().catch(() => {});
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

          try {
            publication.setSubscribed(true);
          } catch {
            // ignore optional API failure
          }

          if (publication.kind === Track.Kind.Video) {
            try {
              publication.setVideoQuality?.(VideoQuality.HIGH);
            } catch {
              // ignore optional API failure
            }
          }
        });

        room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
          if (track.kind === Track.Kind.Video) {
            setState(p => ({ ...p, remoteVideoTrack: null }));
          }
          track.detach().forEach(el => el.remove());
        });

        room.on(RoomEvent.ParticipantDisconnected, () => {
          console.log('[LiveKitCall] Remote participant left');
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
            setState(p => ({ ...p, connectionState: 'connected' }));
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
        const { token, url } = await getLiveKitToken(roomName, 'call');
        
        if (deadRef.current) return;

        console.log('[LiveKitCall] Connecting to room...');
        const connectPromise = (async () => {
          await room.prepareConnection(url, token).catch(() => {});
          await room.connect(url, token);
        })();
        await connectPromise;
        console.log('[LiveKitCall] ✅ Connected to room');

        // Pkg73: bind this Room to the callId so call-end packets can be
        // exchanged between caller and host directly (Supabase broadcast
        // remains the fallback path).
        if (callId) registerCallRoom(callId, room);

        // Enable camera and microphone
        await room.localParticipant.enableCameraAndMicrophone();
        console.log('[LiveKitCall] ✅ Camera and mic enabled');

        // Apply Tencent Beauty to camera track (Web only, graceful fallback)
        try {
          const cameraPub = Array.from(room.localParticipant.trackPublications.values())
            .find((p) => p.track?.kind === Track.Kind.Video && p.source === Track.Source.Camera);
          if (cameraPub?.track) {
            const originalTrack = (cameraPub.track as any).mediaStreamTrack as MediaStreamTrack;
            if (originalTrack && originalTrack.readyState === 'live') {
              const beautifiedTrack = await processTrackWithBeauty(originalTrack);
              if (beautifiedTrack !== originalTrack) {
                await room.localParticipant.unpublishTrack(cameraPub.track);
                await room.localParticipant.publishTrack(beautifiedTrack as any, { source: Track.Source.Camera } as any);
                console.log('[LiveKitCall] ✅ Beauty filter applied to call');
              }
            }
          }
        } catch (beautyErr) {
          console.warn('[LiveKitCall] Beauty processing skipped:', beautyErr);
        }

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
                  const audioEl = pub.track.attach();
                  audioEl.play().catch(() => {});
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
