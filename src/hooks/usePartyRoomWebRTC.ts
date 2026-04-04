/**
 * usePartyRoomWebRTC – Now powered by LiveKit (API-compatible replacement).
 * Handles multi-user voice/video for party rooms.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Room,
  RoomEvent,
  Track,
  ConnectionState,
  RemoteTrack,
  RemoteTrackPublication,
  RemoteParticipant,
  VideoPresets,
  VideoQuality,
} from 'livekit-client';
import { getLiveKitToken, warmLiveKitToken } from '@/services/livekitService';
import { consumePreparedHostPreviewStream } from '@/features/live/hostPreviewSession';
import { processTrackWithBeauty, destroyBeautyProcessor } from '@/services/tencentBeautyProcessor';

interface PartyWebRTCState {
  localStream: MediaStream | null;
  peerStreams: Map<string, MediaStream>;
  isConnected: boolean;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
}

export function usePartyRoomWebRTC(
  roomId: string | null,
  userId: string | null,
  roomType: 'video' | 'audio' | 'game',
  isHost: boolean
) {
  const [state, setState] = useState<PartyWebRTCState>({
    localStream: null,
    peerStreams: new Map(),
    isConnected: false,
    isAudioEnabled: true,
    isVideoEnabled: true,
  });

  const roomRef = useRef<Room | null>(null);
  const peerStreamsRef = useRef<Map<string, MediaStream>>(new Map());

  const cleanup = useCallback(() => {
    console.log('[PartyLiveKit] Cleaning up...');

    if (roomRef.current) {
      roomRef.current.disconnect(true);
      roomRef.current = null;
    }

    peerStreamsRef.current.clear();

    setState({
      localStream: null,
      peerStreams: new Map(),
      isConnected: false,
      isAudioEnabled: true,
      isVideoEnabled: true,
    });
  }, []);

  const toggleAudio = useCallback(() => {
    const room = roomRef.current;
    if (!room?.localParticipant) return;

    const newEnabled = !state.isAudioEnabled;
    room.localParticipant.setMicrophoneEnabled(newEnabled);
    setState(prev => ({ ...prev, isAudioEnabled: newEnabled }));
  }, [state.isAudioEnabled]);

  const toggleVideo = useCallback(() => {
    const room = roomRef.current;
    if (!room?.localParticipant) return;

    const newEnabled = !state.isVideoEnabled;
    room.localParticipant.setCameraEnabled(newEnabled);
    setState(prev => ({ ...prev, isVideoEnabled: newEnabled }));
  }, [state.isVideoEnabled]);

  useEffect(() => {
    if (!roomId || !userId || roomType === 'game') {
      console.log('[PartyLiveKit] Skipping init - roomId:', roomId, 'userId:', userId, 'roomType:', roomType);
      return;
    }

    const roomName = `party_${roomId}`;

    const init = async () => {
      try {
        console.log('[PartyLiveKit] Initializing for room:', roomId);

        const room = new Room({
          // CRYSTAL CLEAR: No adaptive downgrade
          adaptiveStream: false,
          dynacast: false,
          reconnectPolicy: {
            nextRetryDelayInMs: (context: any) => {
              if (context.retryCount > 15) return null;
              return Math.min(300 * Math.pow(1.5, context.retryCount), 15000);
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

        // Build video-only MediaStream for UI rendering.
        // Audio playback is handled separately via track.attach().
        const buildPeerStream = (participant: RemoteParticipant): MediaStream => {
          const ms = new MediaStream();
          participant.trackPublications.forEach(pub => {
            if (
              pub.kind === Track.Kind.Video &&
              pub.track?.mediaStreamTrack &&
              pub.track.mediaStreamTrack.readyState === 'live' &&
              pub.isSubscribed
            ) {
              ms.addTrack(pub.track.mediaStreamTrack);
            }
          });
          return ms;
        };

        room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, pub: RemoteTrackPublication, participant: RemoteParticipant) => {
          console.log(`[PartyLiveKit] Track subscribed: ${track.kind} from ${participant.identity}`);

          if (track.kind === Track.Kind.Audio) {
            const audioEl = track.attach();
            audioEl.play().catch(() => {});
          }

          if (track.kind === Track.Kind.Video) {
            try {
              pub.setVideoQuality?.(VideoQuality.HIGH);
            } catch {
              // ignore optional API failure
            }
          }

          const peerStream = buildPeerStream(participant);
          peerStreamsRef.current.set(participant.identity, peerStream);
          setState(prev => ({
            ...prev,
            peerStreams: new Map(peerStreamsRef.current),
          }));
        });

        room.on(RoomEvent.TrackPublished, (pub: RemoteTrackPublication, participant: RemoteParticipant) => {
          try {
            pub.setSubscribed(true);
          } catch {
            // ignore optional API failure
          }

          if (pub.kind === Track.Kind.Video) {
            try {
              pub.setVideoQuality?.(VideoQuality.HIGH);
            } catch {
              // ignore optional API failure
            }
          }

          const peerStream = buildPeerStream(participant);
          if (peerStream.getTracks().length > 0) {
            peerStreamsRef.current.set(participant.identity, peerStream);
            setState(prev => ({
              ...prev,
              peerStreams: new Map(peerStreamsRef.current),
            }));
          }
        });

        room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, pub: RemoteTrackPublication, participant: RemoteParticipant) => {
          track.detach().forEach(el => el.remove());

          const peerStream = buildPeerStream(participant);
          if (peerStream.getTracks().length > 0) {
            peerStreamsRef.current.set(participant.identity, peerStream);
          } else {
            peerStreamsRef.current.delete(participant.identity);
          }
          setState(prev => ({
            ...prev,
            peerStreams: new Map(peerStreamsRef.current),
          }));
        });

        room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
          console.log('[PartyLiveKit] Participant left:', participant.identity);
          peerStreamsRef.current.delete(participant.identity);
          setState(prev => ({
            ...prev,
            peerStreams: new Map(peerStreamsRef.current),
        }));
        });

        room.on(RoomEvent.Disconnected, () => {
          console.log('[PartyLiveKit] Room disconnected');
          setState(prev => ({ ...prev, isConnected: false }));
        });

        // CRITICAL: Rebuild localStream whenever local tracks are published/unpublished
        // Use VIDEO-ONLY stream for preview UI to avoid avatar/video flicker from audio-only updates.
        const rebuildLocalStream = () => {
          const r = roomRef.current;
          if (!r?.localParticipant) return;
          const ms = new MediaStream();
          r.localParticipant.trackPublications.forEach(pub => {
            if (
              pub.kind === Track.Kind.Video &&
              pub.track?.mediaStreamTrack &&
              pub.track.mediaStreamTrack.readyState === 'live'
            ) {
              ms.addTrack(pub.track.mediaStreamTrack);
            }
          });
          const liveVideoTracks = ms.getVideoTracks().length;
          console.log('[PartyLiveKit] Rebuilt local VIDEO stream, video tracks:', liveVideoTracks);
          setState(prev => ({
            ...prev,
            localStream: liveVideoTracks > 0 ? ms : null,
          }));
        };

        room.on(RoomEvent.LocalTrackPublished, (publication) => {
          // CRYSTAL CLEAR: Set contentHint for maximum sharpness on published video
          if (publication.track?.kind === Track.Kind.Video) {
            try {
              const mt = publication.track.mediaStreamTrack;
              if (mt && 'contentHint' in mt) (mt as any).contentHint = 'detail';
            } catch { /* ignore */ }
          }
          rebuildLocalStream();
        });
        room.on(RoomEvent.LocalTrackUnpublished, () => {
          rebuildLocalStream();
        });

        // Get token and connect
        warmLiveKitToken(roomName, 'party').catch(() => {});
        const { token, url } = await getLiveKitToken(roomName, 'party');
        await room.prepareConnection(url, token).catch(() => {});
        await room.connect(url, token);
        console.log('[PartyLiveKit] ✅ Connected to room');

        setState(prev => ({ ...prev, isConnected: true }));

        // Enable media based on room type, reusing preloaded tracks when available
        const previewStream = consumePreparedHostPreviewStream();
        
        if (previewStream) {
          console.log('[PartyLiveKit] ♻️ Reusing preloaded camera tracks from CreateParty');
          const preloadedVideoTrack = previewStream.getVideoTracks()[0];
          const preloadedAudioTrack = previewStream.getAudioTracks()[0];
          
          if (preloadedVideoTrack && preloadedVideoTrack.readyState === 'live') {
            // Apply Tencent Beauty (Web only, graceful fallback)
            const beautifiedTrack = await processTrackWithBeauty(preloadedVideoTrack);
            await room.localParticipant.publishTrack(beautifiedTrack as any, { source: Track.Source.Camera } as any);
          } else if (roomType === 'video') {
            await room.localParticipant.setCameraEnabled(true);
          }
          
          if (preloadedAudioTrack && preloadedAudioTrack.readyState === 'live') {
            await room.localParticipant.publishTrack(preloadedAudioTrack as any, { source: Track.Source.Microphone } as any);
          } else {
            await room.localParticipant.setMicrophoneEnabled(true);
          }
        } else if (roomType === 'video') {
          await room.localParticipant.enableCameraAndMicrophone();
        } else if (roomType === 'audio') {
          await room.localParticipant.setMicrophoneEnabled(true);
        }

        // Build local stream (initial pass)
        rebuildLocalStream();

        // Safety: rebuild again after short delays to catch late-publishing tracks
        setTimeout(rebuildLocalStream, 500);
        setTimeout(rebuildLocalStream, 1500);

        // Handle existing participants
        room.remoteParticipants.forEach(participant => {
          const peerStream = buildPeerStream(participant);
          if (peerStream.getTracks().length > 0) {
            peerStreamsRef.current.set(participant.identity, peerStream);
          }
          // Play audio for existing participants
          participant.trackPublications.forEach(pub => {
            if (pub.track?.kind === Track.Kind.Audio && pub.isSubscribed) {
              const audioEl = pub.track.attach();
              audioEl.play().catch(() => {});
            }
          });
        });

        setState(prev => ({
          ...prev,
          peerStreams: new Map(peerStreamsRef.current),
        }));

        const forceSubscribePass = () => {
          room.remoteParticipants.forEach((participant) => {
            participant.trackPublications.forEach((pub) => {
              if (!pub.isSubscribed) {
                try { pub.setSubscribed(true); } catch { /* ignore */ }
              }
              if (pub.track?.kind === Track.Kind.Video && pub.isSubscribed) {
                try { pub.setVideoQuality?.(VideoQuality.HIGH); } catch { /* ignore */ }
              }
            });
          });
        };

        forceSubscribePass();
        setTimeout(forceSubscribePass, 30);
        setTimeout(forceSubscribePass, 80);
        setTimeout(forceSubscribePass, 200);
        setTimeout(forceSubscribePass, 500);

      } catch (error) {
        console.error('[PartyLiveKit] Initialization error:', error);
      }
    };

    init();

    return () => {
      cleanup();
    };
  }, [roomId, userId, roomType]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    ...state,
    toggleAudio,
    toggleVideo,
    cleanup,
    getPeerStream: (peerId: string) => state.peerStreams.get(peerId),
  };
}
