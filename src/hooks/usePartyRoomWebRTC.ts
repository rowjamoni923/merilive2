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
import { registerPartyRoom, unregisterPartyRoom } from '@/lib/livekitPartySignaling';
import { toast } from 'sonner';

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
  _isHost: boolean,
  /** When false, LiveKit token is subscribe-only (audience); no local camera/mic publish. */
  partyCanPublish: boolean
) {
  const partyCanPublishRef = useRef(partyCanPublish);
  partyCanPublishRef.current = partyCanPublish;
  const [state, setState] = useState<PartyWebRTCState>({
    localStream: null,
    peerStreams: new Map(),
    isConnected: false,
    isAudioEnabled: true,
    isVideoEnabled: true,
  });
  const [restartNonce, setRestartNonce] = useState(0);

  const roomRef = useRef<Room | null>(null);
  const peerStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const audioElementsRef = useRef<Map<string, HTMLAudioElement[]>>(new Map());
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initRetryCountRef = useRef(0);
  const deadRef = useRef(false);

  const detachAudioForIdentity = (identity: string) => {
    const els = audioElementsRef.current.get(identity);
    if (els) {
      els.forEach((el) => {
        try { el.pause(); } catch { /* ignore */ }
        try { (el as any).srcObject = null; } catch { /* ignore */ }
        try { el.remove(); } catch { /* ignore */ }
      });
      audioElementsRef.current.delete(identity);
    }
  };

  const detachAllAudio = () => {
    Array.from(audioElementsRef.current.keys()).forEach(detachAudioForIdentity);
  };

  const cleanup = useCallback(() => {
    console.log('[PartyLiveKit] Cleaning up...');
    deadRef.current = true;

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    if (roomRef.current) {
      roomRef.current.disconnect(true);
      roomRef.current = null;
    }

    destroyBeautyProcessor();
    detachAllAudio();
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
    if (!partyCanPublishRef.current) return;
    const room = roomRef.current;
    if (!room?.localParticipant) return;

    const newEnabled = !state.isAudioEnabled;
    room.localParticipant.setMicrophoneEnabled(newEnabled);
    setState(prev => ({ ...prev, isAudioEnabled: newEnabled }));
  }, [state.isAudioEnabled]);

  const toggleVideo = useCallback(() => {
    if (!partyCanPublishRef.current) return;
    const room = roomRef.current;
    if (!room?.localParticipant) return;

    const newEnabled = !state.isVideoEnabled;
    room.localParticipant.setCameraEnabled(newEnabled);
    setState(prev => ({ ...prev, isVideoEnabled: newEnabled }));
  }, [state.isVideoEnabled]);

  useEffect(() => {
    if (!roomId || !userId) {
      console.log('[PartyLiveKit] Skipping init - roomId:', roomId, 'userId:', userId, 'roomType:', roomType);
      return;
    }

    deadRef.current = false;

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

        const resetLocalPublications = async () => {
          const publications = Array.from(room.localParticipant.trackPublications.values());
          for (const pub of publications) {
            if (!pub.track) continue;
            try { await (room.localParticipant as any).unpublishTrack(pub.track, true); } catch { /* ignore */ }
          }
          rebuildLocalStream();
        };

        const publishLocalMediaWithRetry = async () => {
          const previewStream = consumePreparedHostPreviewStream();
          let lastError: unknown = null;

          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              if (attempt > 1) {
                await resetLocalPublications();
                await new Promise((resolve) => setTimeout(resolve, 350 * attempt));
              }

              if (previewStream && attempt === 1) {
                console.log('[PartyLiveKit] ♻️ Reusing preloaded camera tracks from CreateParty');
                const preloadedVideoTrack = previewStream.getVideoTracks()[0];
                const preloadedAudioTrack = previewStream.getAudioTracks()[0];

                if (roomType === 'video' && preloadedVideoTrack?.readyState === 'live') {
                  const beautifiedTrack = await processTrackWithBeauty(preloadedVideoTrack);
                  await room.localParticipant.publishTrack(beautifiedTrack as any, { source: Track.Source.Camera } as any);
                } else if (roomType === 'video') {
                  await room.localParticipant.setCameraEnabled(true);
                }

                if (preloadedAudioTrack?.readyState === 'live') {
                  await room.localParticipant.publishTrack(preloadedAudioTrack as any, { source: Track.Source.Microphone } as any);
                } else {
                  await room.localParticipant.setMicrophoneEnabled(true);
                }
              } else if (roomType === 'video') {
                await room.localParticipant.enableCameraAndMicrophone();
              } else if (roomType === 'audio' || roomType === 'game') {
                await room.localParticipant.setMicrophoneEnabled(true);
              }

              await new Promise((resolve) => setTimeout(resolve, 250));
              rebuildLocalStream();

              const hasVideo = Array.from(room.localParticipant.trackPublications.values())
                .some((pub) => pub.kind === Track.Kind.Video && pub.track?.mediaStreamTrack?.readyState === 'live');
              const hasAudio = Array.from(room.localParticipant.trackPublications.values())
                .some((pub) => pub.kind === Track.Kind.Audio && pub.track?.mediaStreamTrack?.readyState === 'live');

              if ((roomType !== 'video' || hasVideo) && hasAudio) {
                console.log(`[PartyLiveKit] ✅ Local media published on attempt ${attempt}`);
                return;
              }

              throw new Error(`party_media_missing_tracks video=${hasVideo} audio=${hasAudio}`);
            } catch (error) {
              lastError = error;
              console.warn(`[PartyLiveKit] Local media publish attempt ${attempt} failed:`, error);
            }
          }

          toast.error(roomType === 'video' ? 'Camera or mic failed to start. Please reopen the party room.' : 'Mic failed to start. Please reopen the party room.');
          throw lastError instanceof Error ? lastError : new Error(String(lastError || 'party_media_publish_failed'));
        };

        room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, pub: RemoteTrackPublication, participant: RemoteParticipant) => {
          console.log(`[PartyLiveKit] Track subscribed: ${track.kind} from ${participant.identity}`);

          if (track.kind === Track.Kind.Audio) {
            const audioEl = track.attach() as HTMLAudioElement;
            audioEl.autoplay = true;
            try { audioEl.setAttribute('playsinline', 'true'); } catch { /* ignore */ }
            audioEl.play().catch(() => {});
            const existing = audioElementsRef.current.get(participant.identity) || [];
            existing.push(audioEl);
            audioElementsRef.current.set(participant.identity, existing);
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

        // PARTICIPANT JOINED: defensively force-subscribe to any tracks they
        // already published before we connected. Without this, a viewer who
        // joins after the host published can miss the first publish event.
        room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
          console.log('[PartyLiveKit] Participant connected:', participant.identity);
          participant.trackPublications.forEach((pub) => {
            if (!pub.isSubscribed) {
              try { pub.setSubscribed(true); } catch { /* ignore */ }
            }
            if (pub.kind === Track.Kind.Video) {
              try { pub.setVideoQuality?.(VideoQuality.HIGH); } catch { /* ignore */ }
            }
          });
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

          if (track.kind === Track.Kind.Audio) {
            // Audio element list rebuilds on next subscribe; nothing else to do.
            const remaining = (audioElementsRef.current.get(participant.identity) || []).filter(
              (el) => document.body.contains(el),
            );
            if (remaining.length > 0) {
              audioElementsRef.current.set(participant.identity, remaining);
            } else {
              audioElementsRef.current.delete(participant.identity);
            }
          }

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
          detachAudioForIdentity(participant.identity);
          peerStreamsRef.current.delete(participant.identity);
          setState(prev => ({
            ...prev,
            peerStreams: new Map(peerStreamsRef.current),
        }));
        });

        room.on(RoomEvent.ConnectionStateChanged, (connectionState: ConnectionState) => {
          if (connectionState === ConnectionState.Connected) {
            if (reconnectTimerRef.current) {
              clearTimeout(reconnectTimerRef.current);
              reconnectTimerRef.current = null;
            }
            setState(prev => ({ ...prev, isConnected: true }));
          }
        });

        room.on(RoomEvent.Disconnected, () => {
          console.log('[PartyLiveKit] Room disconnected');
          setState(prev => ({ ...prev, isConnected: false }));
          if (!deadRef.current && !reconnectTimerRef.current) {
            try { room.disconnect(true); } catch { /* ignore */ }
            reconnectTimerRef.current = setTimeout(() => {
              reconnectTimerRef.current = null;
              if (deadRef.current) return;
              console.warn('[PartyLiveKit] Unexpected disconnect, restarting room session');
              setRestartNonce(prev => prev + 1);
            }, 1200);
          }
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

        // Get token and connect (audience: subscribe-only token)
        warmLiveKitToken(roomName, 'party', undefined, undefined, partyCanPublish).catch(() => {});
        const { token, url } = await getLiveKitToken(roomName, 'party', undefined, undefined, partyCanPublish);
        await room.prepareConnection(url, token).catch(() => {});
        await room.connect(url, token);
        console.log('[PartyLiveKit] ✅ Connected to room');

        // Pkg75: bind this LiveKit Room to the party roomId so the host
        // can publish `room_closed` packets and viewers can receive them
        // with sub-50ms latency. Reuses the existing Room — zero new
        // Supabase Realtime channels, zero polling.
        try {
          registerPartyRoom(roomId, room);
        } catch (err) {
          console.warn('[Pkg75] registerPartyRoom failed:', err);
        }

        setState(prev => ({
          ...prev,
          isConnected: true,
          isAudioEnabled: partyCanPublish,
          isVideoEnabled: partyCanPublish,
        }));

        if (!partyCanPublish) {
          await room.localParticipant.setCameraEnabled(false);
          await room.localParticipant.setMicrophoneEnabled(false);
        } else {
          await publishLocalMediaWithRetry();
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
              const audioEl = pub.track.attach() as HTMLAudioElement;
              audioEl.autoplay = true;
              try { audioEl.setAttribute('playsinline', 'true'); } catch { /* ignore */ }
              audioEl.play().catch(() => {});
              const existing = audioElementsRef.current.get(participant.identity) || [];
              existing.push(audioEl);
              audioElementsRef.current.set(participant.identity, existing);
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

            const peerStream = buildPeerStream(participant);
            if (peerStream.getTracks().length > 0) {
              peerStreamsRef.current.set(participant.identity, peerStream);
            }
          });
          setState(prev => ({
            ...prev,
            peerStreams: new Map(peerStreamsRef.current),
          }));
        };

        forceSubscribePass();
        setTimeout(forceSubscribePass, 30);
        setTimeout(forceSubscribePass, 80);
        setTimeout(forceSubscribePass, 200);
        setTimeout(forceSubscribePass, 500);
        initRetryCountRef.current = 0;

      } catch (error) {
        console.error('[PartyLiveKit] Initialization error:', error);
        if (!deadRef.current && initRetryCountRef.current < 3) {
          initRetryCountRef.current += 1;
          reconnectTimerRef.current = setTimeout(() => {
            reconnectTimerRef.current = null;
            if (deadRef.current) return;
            setRestartNonce(prev => prev + 1);
          }, 1200 * initRetryCountRef.current);
        } else if (!deadRef.current) {
          toast.error('Party media could not connect. Please leave and rejoin once.');
        }
      }
    };

    init();

    return () => {
      cleanup();
    };
  }, [roomId, userId, roomType, partyCanPublish, restartNonce]);

  return {
    ...state,
    toggleAudio,
    toggleVideo,
    cleanup,
    getPeerStream: (peerId: string) => state.peerStreams.get(peerId),
  };
}
