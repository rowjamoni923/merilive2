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
import { processTrackWithBeauty, destroyBeautyProcessor } from '@/services/tencentBeautyProcessor';

interface LiveKitCallState {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  remoteVideoTrack: Track | null;
  localVideoTrack: Track | null;
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
    isConnected: false,
    isAudioEnabled: true,
    isVideoEnabled: true,
    connectionState: 'new',
  });

  const roomRef = useRef<Room | null>(null);
  const isInitRef = useRef(false);
  const deadRef = useRef(false);

  const cleanup = useCallback(() => {
    console.log('[LiveKitCall] cleanup');
    deadRef.current = true;
    isInitRef.current = false;

    if (roomRef.current) {
      roomRef.current.disconnect(true);
      roomRef.current = null;
    }

    setState({
      localStream: null,
      remoteStream: null,
      remoteVideoTrack: null,
      localVideoTrack: null,
      isConnected: false,
      isAudioEnabled: true,
      isVideoEnabled: true,
      connectionState: 'new',
    });
  }, []);

  const toggleAudio = useCallback(() => {
    const room = roomRef.current;
    if (!room?.localParticipant) return;
    
    const enabled = !state.isAudioEnabled;
    room.localParticipant.setMicrophoneEnabled(enabled);
    setState(p => ({ ...p, isAudioEnabled: enabled }));
  }, [state.isAudioEnabled]);

  const toggleVideo = useCallback(() => {
    const room = roomRef.current;
    if (!room?.localParticipant) return;
    
    const enabled = !state.isVideoEnabled;
    room.localParticipant.setCameraEnabled(enabled);
    setState(p => ({ ...p, isVideoEnabled: enabled }));
  }, [state.isVideoEnabled]);

  useEffect(() => {
    if (!callId || !userId) return;
    if (isInitRef.current) return;
    isInitRef.current = true;
    deadRef.current = false;

    const roomName = `call_${callId}`;

    const init = async () => {
      try {
        console.log('[LiveKitCall] Initializing for call:', callId);
        
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
    cleanup,
    remoteStreamVersion: 0,
  };
}
