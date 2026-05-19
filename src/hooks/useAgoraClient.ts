/**
 * useAgoraClient – Now powered by LiveKit (API-compatible replacement).
 * Maintains the same public API for GoLive.tsx and LiveStream.tsx.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
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
import { processTrackWithBeauty, destroyBeautyProcessor } from '@/services/tencentBeautyProcessor';
import { shouldUseNativeLiveKit } from '@/lib/nativeLiveKitGate';
import { nativeLiveKitController } from '@/lib/nativeLiveKitController';
import { useNativeLiveKitEvents } from '@/hooks/useNativeLiveKitEvents';
import { useNativeLiveKitLifecycle } from '@/hooks/useNativeLiveKitLifecycle';
import { toast } from 'sonner';

interface AgoraConfig {
  channelName: string;
  uid?: number;
  role: 'host' | 'audience';
  preloadedVideoTrack?: MediaStreamTrack;
  preloadedAudioTrack?: MediaStreamTrack;
  /** Pre-connected Room from liveStreamPreloader — skips token fetch + connect */
  preloadedRoom?: Room;
}

interface BeautySettings {
  smoothness: number;
  whitening: number;
  redness: number;
  sharpness: number;
  glow: number;
  warmth: number;
  eyeBright: number;
  skinTone: number;
  faceSlim: number;
  chinSlim: number;
  eyeEnlarge: number;
  noseNarrow: number;
  lipColor: number;
}

interface UseAgoraClientOptions {
  onUserJoined?: (uid: number) => void;
  onUserLeft?: (uid: number) => void;
  onVolumeChange?: (volumes: { uid: number; level: number }[]) => void;
  onError?: (error: Error) => void;
  onCoHostRequest?: (uid: number, userName: string) => void;
  onRoleChanged?: (uid: number, role: 'host' | 'audience') => void;
}

export interface CoHostRequest {
  uid: number;
  userName: string;
  timestamp: number;
}

export function useAgoraClient(options: UseAgoraClientOptions = {}) {
  const [isInitialized, setIsInitialized] = useState(true); // LiveKit doesn't need SDK preload
  const [isJoined, setIsJoined] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [connectionState, setConnectionState] = useState<'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'DISCONNECTING'>('DISCONNECTED');
  const [localVideoTrack, setLocalVideoTrack] = useState<any>(null);
  const [localAudioTrack, setLocalAudioTrack] = useState<any>(null);
  const [screenTrack, setScreenTrack] = useState<any>(null);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [remoteUsers, setRemoteUsers] = useState<Map<number, any>>(new Map());
  const [coHosts, setCoHosts] = useState<Set<number>>(new Set());
  const [coHostRequests, setCoHostRequests] = useState<CoHostRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState<'host' | 'audience'>('audience');
  const [beautyEnabled, setBeautyEnabled] = useState(true);
  const [beautySettings, setBeautySettings] = useState<BeautySettings>({
    smoothness: 35,
    whitening: 20,
    redness: 10,
    sharpness: 15,
    glow: 10,
    warmth: 10,
    eyeBright: 15,
    skinTone: 55,
    faceSlim: 15,
    chinSlim: 10,
    eyeEnlarge: 10,
    noseNarrow: 5,
    lipColor: 10,
  });
  const [isRemoteAudioMuted, setIsRemoteAudioMuted] = useState(false); // Auto-play sound when entering stream

  const roomRef = useRef<Room | null>(null);
  const isJoiningRef = useRef(false);
  const isLeavingRef = useRef(false);
  const channelRef = useRef<string>('');
  const uidRef = useRef<number>(0);
  const lastConfigRef = useRef<AgoraConfig | null>(null);
  // Map participant identity to a stable numeric UID for backward compat
  const participantUidMapRef = useRef<Map<string, number>>(new Map());
  const remoteAudioElementsRef = useRef<Map<string, HTMLAudioElement[]>>(new Map());
  const hostVideoRecoveryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const viewerHardReconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastForcedVideoResubscribeAtRef = useRef(0);
  const lastRetrySubscriptionAtRef = useRef(0);
  const preferredVideoQualityRef = useRef<VideoQuality>(VideoQuality.HIGH);
  // True when this session was published via the native Android LiveKit
  // plugin (Capacitor) instead of the browser livekit-client. Drives the
  // native branch in joinChannel/leaveChannel/toggle*/switchCamera.
  const usingNativeRef = useRef(false);
  // Mirror of usingNativeRef as state to drive the native event-listener
  // subscription (must be a re-rendering value, not a ref).
  const [nativeActive, setNativeActive] = useState(false);

  // Subscribe to native plugin events while the host session is on the
  // native Android publish path. Surface disconnects back into React.
  useNativeLiveKitEvents(nativeActive, {
    onDisconnected: (reason) => {
      console.log('[LiveKitClient/Native] disconnected:', reason);
      setNativeActive(false);
      setIsJoined(false);
      setConnectionState('DISCONNECTED');
      try { options.onError?.(new Error(`native_livekit_disconnected: ${reason}`)); } catch { /* noop */ }
    },
    // Step 19 — sticky reconnect toast for live broadcasters/viewers.
    onConnectionState: (s) => {
      if (s === 'reconnecting') {
        toast.loading('Reconnecting to live…', { id: 'lk-live-reconnect' });
        setConnectionState('CONNECTING');
      } else {
        toast.success('Reconnected', { id: 'lk-live-reconnect', duration: 1500 });
        setConnectionState('CONNECTED');
      }
    },
    // Step 19 — permanent audio focus loss (PSTN call) — inform broadcaster.
    onAudioInterruption: (s, permanent) => {
      if (s === 'loss' && permanent) {
        toast.info('Mic paused — interrupted by another app');
      }
    },
  });

  // Pause camera + mic when the app is backgrounded; restore on resume.
  // Releases the native camera handle to Android so the OS doesn't kill
  // the broadcast or freeze the published video track.
  useNativeLiveKitLifecycle(nativeActive);

  const getUidForParticipant = useCallback((identity: string): number => {
    if (participantUidMapRef.current.has(identity)) {
      return participantUidMapRef.current.get(identity)!;
    }
    const uid = Math.floor(Math.random() * 100000) + 1000;
    participantUidMapRef.current.set(identity, uid);
    return uid;
  }, []);

  const clearHostVideoRecoveryTimer = useCallback(() => {
    if (hostVideoRecoveryTimerRef.current) {
      clearInterval(hostVideoRecoveryTimerRef.current);
      hostVideoRecoveryTimerRef.current = null;
    }
  }, []);

  const clearViewerHardReconnectTimer = useCallback(() => {
    if (viewerHardReconnectTimerRef.current) {
      clearTimeout(viewerHardReconnectTimerRef.current);
      viewerHardReconnectTimerRef.current = null;
    }
  }, []);

  const ensureParticipantSubscribed = useCallback((participant: RemoteParticipant) => {
    const pUid = getUidForParticipant(participant.identity);

    participant.trackPublications.forEach((pub) => {
      if ((pub.kind === Track.Kind.Video || pub.kind === Track.Kind.Audio) && !pub.isSubscribed) {
        try {
          pub.setSubscribed(true);
        } catch {
          // ignore and continue
        }
      }

      if (pub.track?.kind === Track.Kind.Video) {
        const userWrapper = {
          uid: pUid,
          videoTrack: pub.track,
          audioTrack: null as any,
          hasVideo: true,
          hasAudio: false,
        };

        participant.trackPublications.forEach((audioPub) => {
          if (audioPub.track?.kind === Track.Kind.Audio) {
            userWrapper.audioTrack = audioPub.track;
            userWrapper.hasAudio = true;
          }
        });

        setRemoteUsers((prev) => new Map(prev).set(pUid, userWrapper));
      }
    });
  }, [getUidForParticipant]);

  // Join channel - creates a LiveKit room connection
  const joinChannel = useCallback(async (config: AgoraConfig) => {
    if (isJoiningRef.current || isLeavingRef.current) {
      console.log('[LiveKitClient] Already joining/leaving');
      return;
    }

    const normalizedChannel = config.channelName.replace('live_live_', 'live_');
    
    if (isJoined && channelRef.current === normalizedChannel) {
      console.log('[LiveKitClient] Already in this channel');
      return;
    }

    isJoiningRef.current = true;
    setIsLoading(true);
    setError(null);
    setConnectionState('CONNECTING');
    lastConfigRef.current = config;

    const startTime = performance.now();
    console.log(`[LiveKitClient] Joining channel: ${normalizedChannel} as ${config.role}`);

    // 🛰️ Native Android publish path (Capacitor + LiveKit Android SDK).
    // Only host broadcasts are routed natively for now; viewers stay on
    // web livekit-client (audience playback inside the WebView is fine).
    // Web/iOS gate=false → falls through to web Room flow below.
    if (
      config.role === 'host' &&
      !config.preloadedRoom &&
      shouldUseNativeLiveKit({ feature: 'live-broadcast' })
    ) {
      try {
        const roomType = 'host_stream';
        warmLiveKitToken(normalizedChannel, roomType).catch(() => {});
        const { token, url } = await getLiveKitToken(normalizedChannel, roomType);

        await nativeLiveKitController.connectAndPublish({
          url,
          token,
          video: true,
          audio: true,
          lens: 'front',
          resolution: '1080p',
          attachLocal: true,
        });

        usingNativeRef.current = true;
        setNativeActive(true);
        channelRef.current = normalizedChannel;
        setIsJoined(true);
        setConnectionState('CONNECTED');
        setCurrentRole('host');
        setIsLoading(false);
        isJoiningRef.current = false;
        const joinTime = performance.now() - startTime;
        console.log(`[LiveKitClient/Native] ✅ Connected in ${joinTime.toFixed(0)}ms`);
        return { uid: uidRef.current || 0, channel: normalizedChannel };
      } catch (nativeErr) {
        console.error('[LiveKitClient/Native] join failed, falling back to web:', nativeErr);
        usingNativeRef.current = false;
        setNativeActive(false);
        // Fall through to web path.
      }
    }

    try {
      // Disconnect existing room if any
      if (roomRef.current) {
        clearHostVideoRecoveryTimer();
        roomRef.current.disconnect(true);
        roomRef.current = null;
      }

      const isViewer = config.role === 'audience';
      const room = new Room({
        // CRYSTAL CLEAR: Disable adaptive stream to prevent auto quality reduction
        adaptiveStream: false,
        dynacast: false,
        reconnectPolicy: {
          nextRetryDelayInMs: (context: any) => {
            if (context.retryCount > 15) return null;
            const base = isViewer ? 120 : 250;
            return Math.min(base * Math.pow(1.3, context.retryCount), 8000);
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
        ...(isViewer ? {
          autoSubscribe: true,
        } : {}),
      });
      roomRef.current = room;

      const uid = config.uid || Math.floor(Math.random() * 100000);
      uidRef.current = uid;
      channelRef.current = normalizedChannel;

      // Set up room event handlers
      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
        const pUid = getUidForParticipant(participant.identity);
        console.log(`[LiveKitClient] Track subscribed: ${track.kind} from ${participant.identity} (uid: ${pUid})`);

        if (track.kind === Track.Kind.Audio && !isRemoteAudioMuted) {
          const audioEl = track.attach();
          audioEl.play().catch(() => {});
          // Store reference for mute control
          const existing = remoteAudioElementsRef.current.get(participant.identity) || [];
          existing.push(audioEl);
          remoteAudioElementsRef.current.set(participant.identity, existing);
        }

        if (track.kind === Track.Kind.Video) {
          try {
            publication.setVideoQuality?.(preferredVideoQualityRef.current);
          } catch {
            // ignore optional API failures
          }

          // Create a compatibility wrapper that has a videoTrack-like interface
          const userWrapper = {
            uid: pUid,
            videoTrack: track,
            audioTrack: null as any,
            hasVideo: true,
            hasAudio: false,
          };

          // Also check for audio
          participant.trackPublications.forEach(pub => {
            if (pub.track?.kind === Track.Kind.Audio) {
              userWrapper.audioTrack = pub.track;
              userWrapper.hasAudio = true;
            }
          });

          setRemoteUsers(prev => new Map(prev).set(pUid, userWrapper));
        }

        options.onUserJoined?.(pUid);
      });

      // Subscribe immediately as soon as remote track is published to reduce first-frame delay
      room.on(RoomEvent.TrackPublished, (publication: RemoteTrackPublication, participant: RemoteParticipant) => {
        try {
          publication.setSubscribed(true);
        } catch {
          // ignore optional API failures
        }

        if (publication.kind === Track.Kind.Video) {
          try {
            publication.setVideoQuality?.(preferredVideoQualityRef.current);
          } catch {
            // ignore optional API failures
          }
        }

        ensureParticipantSubscribed(participant);
      });

      room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
        const pUid = getUidForParticipant(participant.identity);
        console.log(`[LiveKitClient] Track unsubscribed: ${track.kind} from uid ${pUid}`);
        
        if (track.kind === Track.Kind.Video) {
          setRemoteUsers(prev => {
            const newMap = new Map(prev);
            newMap.delete(pUid);
            return newMap;
          });
        }

        if (track.kind === Track.Kind.Audio) {
          // Detach audio elements
          const els = remoteAudioElementsRef.current.get(participant.identity);
          if (els) {
            els.forEach(el => el.remove());
            remoteAudioElementsRef.current.delete(participant.identity);
          }
        }
      });

      room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
        const pUid = getUidForParticipant(participant.identity);
        console.log(`[LiveKitClient] Participant connected: ${participant.identity} (uid: ${pUid})`);
        ensureParticipantSubscribed(participant);
        options.onUserJoined?.(pUid);
      });

      room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
        const pUid = getUidForParticipant(participant.identity);
        console.log(`[LiveKitClient] Participant disconnected: uid ${pUid}`);
        setRemoteUsers(prev => {
          const newMap = new Map(prev);
          newMap.delete(pUid);
          return newMap;
        });
        setCoHosts(prev => {
          const newSet = new Set(prev);
          newSet.delete(pUid);
          return newSet;
        });
        options.onUserLeft?.(pUid);
        
        // Cleanup audio elements
        const els = remoteAudioElementsRef.current.get(participant.identity);
        if (els) {
          els.forEach(el => el.remove());
          remoteAudioElementsRef.current.delete(participant.identity);
        }
      });

      room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
        console.log(`[LiveKitClient] Connection state: ${state}`);
        if (state === ConnectionState.Connected) {
          setConnectionState('CONNECTED');
          setIsReconnecting(false);
          clearViewerHardReconnectTimer();

          if (config.role === 'audience') {
            setRemoteUsers(new Map());
            const resync = () => room.remoteParticipants.forEach((participant) => ensureParticipantSubscribed(participant));
            resync();
            [40, 120, 300].forEach((delay) => setTimeout(resync, delay));
          }

          // Host track publishing is handled in the dedicated host publish block below.
          // Avoid duplicate camera/mic enable calls here — these can trigger repeated
          // permission prompts on some Android WebViews when reconnect/state bounces.
        } else if (state === ConnectionState.Reconnecting) {
          setConnectionState('CONNECTING');
          setIsReconnecting(true);
          if (config.role === 'audience' && !viewerHardReconnectTimerRef.current) {
            viewerHardReconnectTimerRef.current = setTimeout(() => {
              viewerHardReconnectTimerRef.current = null;
              const lastConfig = lastConfigRef.current;
              if (!lastConfig || lastConfig.role !== 'audience' || isJoiningRef.current || isLeavingRef.current) return;
              console.warn('[LiveKitClient] Audience reconnect stalled, forcing fresh room join');
              lastConfigRef.current = null;
              room.disconnect(true);
              setRemoteUsers(new Map());
              setIsJoined(false);
              setConnectionState('CONNECTING');
              joinChannel({ ...lastConfig, preloadedRoom: undefined }).catch((err) => options.onError?.(err));
            }, 2500);
          }
        } else if (state === ConnectionState.Disconnected) {
          setConnectionState('DISCONNECTED');
        }
      });

      room.on(RoomEvent.Disconnected, () => {
        clearHostVideoRecoveryTimer();
        setIsJoined(false);
        setConnectionState('DISCONNECTED');
        if (config.role === 'audience') {
          clearViewerHardReconnectTimer();
          const lastConfig = lastConfigRef.current;
          if (lastConfig && !isLeavingRef.current && !isJoiningRef.current) {
            lastConfigRef.current = null;
            setTimeout(() => {
              if (isLeavingRef.current || isJoiningRef.current) return;
              joinChannel({ ...lastConfig, preloadedRoom: undefined }).catch((err) => options.onError?.(err));
            }, 300);
          }
        }
      });

      // Capture local tracks as they publish (covers late-publish & re-publish after recovery)
      room.on(RoomEvent.LocalTrackPublished, (publication) => {
        if (publication.track) {
          if (publication.track.kind === Track.Kind.Video) {
            console.log('[LiveKitClient] LocalTrackPublished: video');
            setLocalVideoTrack(publication.track);
            // CRYSTAL CLEAR: Set contentHint on every published video track
            try {
              const mt = publication.track.mediaStreamTrack;
              if (mt && 'contentHint' in mt) (mt as any).contentHint = 'detail';
            } catch { /* ignore */ }
          } else if (publication.track.kind === Track.Kind.Audio) {
            setLocalAudioTrack(publication.track);
          }
        }
      });

      // CRYSTAL CLEAR: Always force HIGH quality for all viewers, never downgrade
      if (config.role === 'audience') {
        // Re-enforce HIGH quality every 2 seconds to prevent any downgrade
        const qualityEnforcer = setInterval(() => {
          if (room.state !== ConnectionState.Connected) return;
          room.remoteParticipants.forEach((remote) => {
            remote.trackPublications.forEach((pub) => {
              if (pub.kind !== Track.Kind.Video || !pub.isSubscribed) return;
              try {
                pub.setVideoQuality?.(VideoQuality.HIGH);
              } catch {
                // ignore optional API failures
              }
            });
          });
        }, 2000);

        room.on(RoomEvent.Disconnected, () => clearInterval(qualityEnforcer));
      }

      // === PRELOADED ROOM FAST PATH ===
      // If a pre-connected Room was provided (from liveStreamPreloader), skip token + connect
      if (config.preloadedRoom && config.preloadedRoom.state === ConnectionState.Connected) {
        console.log(`[LiveKitClient] ⚡ Using PRELOADED room — skipping token/connect`);
        // Transfer event handlers from new room to preloaded room
        // We already set up handlers on `room` above, but preloaded room is the one connected.
        // Solution: disconnect the new empty room, use the preloaded one instead.
        room.removeAllListeners();
        roomRef.current = config.preloadedRoom;

        // Re-wire essential events on the preloaded room
        const pRoom = config.preloadedRoom;
        pRoom.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
          const pUid = getUidForParticipant(participant.identity);
          if (track.kind === Track.Kind.Audio && !isRemoteAudioMuted) {
            const audioEl = track.attach();
            audioEl.play().catch(() => {});
            const existing = remoteAudioElementsRef.current.get(participant.identity) || [];
            existing.push(audioEl);
            remoteAudioElementsRef.current.set(participant.identity, existing);
          }
          if (track.kind === Track.Kind.Video) {
            const userWrapper = { uid: pUid, videoTrack: track, audioTrack: null as any, hasVideo: true, hasAudio: false };
            participant.trackPublications.forEach(pub => {
              if (pub.track?.kind === Track.Kind.Audio) { userWrapper.audioTrack = pub.track; userWrapper.hasAudio = true; }
            });
            setRemoteUsers(prev => new Map(prev).set(pUid, userWrapper));
          }
          options.onUserJoined?.(pUid);
        });
        pRoom.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, _pub: RemoteTrackPublication, participant: RemoteParticipant) => {
          const pUid = getUidForParticipant(participant.identity);
          if (track.kind === Track.Kind.Video) {
            setRemoteUsers(prev => { const m = new Map(prev); m.delete(pUid); return m; });
          }
        });
        pRoom.on(RoomEvent.Disconnected, () => {
          clearHostVideoRecoveryTimer();
          setIsJoined(false);
          setConnectionState('DISCONNECTED');
        });

        // Immediately process existing participants
        pRoom.remoteParticipants.forEach((participant) => ensureParticipantSubscribed(participant));

        setIsJoined(true);
        setConnectionState('CONNECTED');
        setCurrentRole(config.role);
        console.log(`[LiveKitClient] ✅ Preloaded room ready in ${(performance.now() - startTime).toFixed(0)}ms`);

        // Unmute preloaded audio elements
        pRoom.remoteParticipants.forEach((p) => {
          p.trackPublications.forEach((pub) => {
            if (pub.track?.kind === Track.Kind.Audio) {
              const audioEl = pub.track.attach();
              audioEl.muted = isRemoteAudioMuted;
              audioEl.volume = 1;
              audioEl.play().catch(() => {});
              const existing = remoteAudioElementsRef.current.get(p.identity) || [];
              existing.push(audioEl);
              remoteAudioElementsRef.current.set(p.identity, existing);
            }
          });
        });

        return { uid, channel: normalizedChannel };
      }

      // Get token (determine room type from role)
      const roomType = config.role === 'host' ? 'host_stream' : 'viewer_stream';
      warmLiveKitToken(normalizedChannel, roomType).catch(() => {});
      const { token, url } = await getLiveKitToken(normalizedChannel, roomType);

      const tokenTime = performance.now() - startTime;
      console.log(`[LiveKitClient] Token ready in ${tokenTime.toFixed(0)}ms`);

      // Prepare socket/TLS path first, then connect
      await room.prepareConnection(url, token).catch(() => {});
      await room.connect(url, token);
      setIsJoined(true);
      setConnectionState('CONNECTED');
      setCurrentRole(config.role);

      const joinTime = performance.now() - startTime;
      console.log(`[LiveKitClient] ✅ Connected in ${joinTime.toFixed(0)}ms`);

      // If host, publish camera/mic. Reuse preloaded tracks when provided from GoLive preview.
      if (config.role === 'host') {
        try {
          const hasPreloadedVideo = !!config.preloadedVideoTrack && config.preloadedVideoTrack.readyState === 'live';
          const hasPreloadedAudio = !!config.preloadedAudioTrack && config.preloadedAudioTrack.readyState === 'live';

          const localPublications = Array.from(room.localParticipant.trackPublications.values());
          const alreadyHasVideo = localPublications.some(
            (pub) => pub.track?.kind === Track.Kind.Video && pub.source === Track.Source.Camera,
          );
          const alreadyHasAudio = localPublications.some(
            (pub) => pub.track?.kind === Track.Kind.Audio && pub.source === Track.Source.Microphone,
          );

          if (hasPreloadedVideo && config.preloadedVideoTrack && !alreadyHasVideo) {
            // Process through Tencent Beauty SDK (Web only, graceful fallback)
            const beautifiedTrack = await processTrackWithBeauty(config.preloadedVideoTrack);
            const videoPublication = await room.localParticipant.publishTrack(
              beautifiedTrack as any,
              { source: Track.Source.Camera } as any,
            );
            if (videoPublication?.track) {
              setLocalVideoTrack(videoPublication.track);
            }
          }

          if (hasPreloadedAudio && config.preloadedAudioTrack && !alreadyHasAudio) {
            const audioPublication = await room.localParticipant.publishTrack(
              config.preloadedAudioTrack as any,
              { source: Track.Source.Microphone } as any,
            );
            if (audioPublication?.track) {
              setLocalAudioTrack(audioPublication.track);
            }
          }

          if (!alreadyHasVideo && !hasPreloadedVideo && !alreadyHasAudio && !hasPreloadedAudio) {
            // One-shot enable path for first host join.
            await room.localParticipant.enableCameraAndMicrophone();
          } else {
            if (!alreadyHasVideo && !hasPreloadedVideo) {
              await room.localParticipant.setCameraEnabled(true);
            }
            if (!alreadyHasAudio && !hasPreloadedAudio) {
              await room.localParticipant.setMicrophoneEnabled(true);
            }
          }

          // Apply Tencent Beauty to the published camera track (Web only)
          // This handles the enableCameraAndMicrophone / setCameraEnabled path
          if (!hasPreloadedVideo) {
            const cameraPub = Array.from(room.localParticipant.trackPublications.values())
              .find((p) => p.track?.kind === Track.Kind.Video && p.source === Track.Source.Camera);
            if (cameraPub?.track) {
              const originalTrack = (cameraPub.track as any).mediaStreamTrack as MediaStreamTrack;
              if (originalTrack && originalTrack.readyState === 'live') {
                const beautifiedTrack = await processTrackWithBeauty(originalTrack);
                if (beautifiedTrack !== originalTrack) {
                  // Replace the published track with the beauty-processed one
                  try {
                    await room.localParticipant.unpublishTrack(cameraPub.track);
                    await room.localParticipant.publishTrack(beautifiedTrack as any, { source: Track.Source.Camera } as any);
                    console.log('[LiveKitClient] ✅ Replaced camera track with beauty-processed track');
                  } catch (e) {
                    console.warn('[LiveKitClient] Beauty track replacement failed, using original:', e);
                  }
                }
              }
            }
          }

          // Extract local tracks & set contentHint for crystal clear sharpness
          room.localParticipant.trackPublications.forEach(pub => {
            if (pub.track) {
              if (pub.track.kind === Track.Kind.Video) {
                setLocalVideoTrack(pub.track);
                // CRYSTAL CLEAR: Force 'detail' hint for maximum sharpness
                try {
                  const mt = pub.track.mediaStreamTrack;
                  if (mt && 'contentHint' in mt) {
                    (mt as any).contentHint = 'detail';
                  }
                } catch { /* ignore */ }
              } else if (pub.track.kind === Track.Kind.Audio) {
                setLocalAudioTrack(pub.track);
              }
            }
          });

          console.log(`[LiveKitClient] ✅ Published tracks in ${(performance.now() - startTime).toFixed(0)}ms`);

          clearHostVideoRecoveryTimer();
          let recovering = false;
          hostVideoRecoveryTimerRef.current = setInterval(() => {
            if (recovering) return;
            if (roomRef.current !== room || room.state !== ConnectionState.Connected) return;

            const videoPub = Array.from(room.localParticipant.trackPublications.values())
              .find((p) => p.track?.kind === Track.Kind.Video && p.source === Track.Source.Camera);

            const track = videoPub?.track as any;
            const mediaTrack = track?.mediaStreamTrack as MediaStreamTrack | undefined;
            if (!track || !mediaTrack) return;

            if (!mediaTrack.enabled) {
              mediaTrack.enabled = true;
            }

            if (mediaTrack.readyState === 'ended') {
              recovering = true;
              console.warn('[LiveKitClient] ⚠️ Host camera track ended, recovering...');

              room.localParticipant.setCameraEnabled(false)
                .catch(() => {})
                .then(() => new Promise((resolve) => setTimeout(resolve, 80)))
                .then(() => room.localParticipant.setCameraEnabled(true))
                .then(() => {
                  const refreshedPub = Array.from(room.localParticipant.trackPublications.values())
                    .find((p) => p.track?.kind === Track.Kind.Video && p.source === Track.Source.Camera);

                  if (refreshedPub?.track) {
                    setLocalVideoTrack(refreshedPub.track);
                  }
                })
                .catch((recoverErr) => {
                  console.error('[LiveKitClient] Host camera recovery failed:', recoverErr);
                })
                .finally(() => {
                  recovering = false;
                });
            }
          }, 1800);
        } catch (trackErr) {
          console.error('[LiveKitClient] Track creation error:', trackErr);
        }
      }

      // Force immediate subscriptions for existing participants (viewer first-frame speed)
      room.remoteParticipants.forEach((participant) => {
        ensureParticipantSubscribed(participant);
      });

      if (config.role === 'audience') {
        const readyRemoteCount = Array.from(room.remoteParticipants.values()).filter((participant) =>
          Array.from(participant.trackPublications.values()).some((pub) => pub.kind === Track.Kind.Video && pub.track)
        ).length;
        if (readyRemoteCount === 0) {
          setRemoteUsers(new Map());
        }
      }

      // Fast fallback resubscribe pass for audience clients with multiple retries
      if (config.role === 'audience') {
        // Aggressive retry passes for instant first-frame (30ms, 80ms, 200ms, 500ms)
        const retryTimers = [30, 80, 200, 500];
        retryTimers.forEach(delay => {
          setTimeout(() => {
            if (roomRef.current !== room || room.state !== ConnectionState.Connected) return;
            room.remoteParticipants.forEach((participant) => ensureParticipantSubscribed(participant));
          }, delay);
        });
      }

      return { uid, channel: normalizedChannel };
    } catch (err: any) {
      console.error('[LiveKitClient] Join error:', err);
      setError(err.message || 'Failed to join channel');
      setConnectionState('DISCONNECTED');
      options.onError?.(err);
      throw err;
    } finally {
      isJoiningRef.current = false;
      setIsLoading(false);
    }
  }, [isJoined, options, getUidForParticipant, ensureParticipantSubscribed, isRemoteAudioMuted, clearHostVideoRecoveryTimer]);

  // Leave channel
  const leaveChannel = useCallback(async () => {
    if (isLeavingRef.current) return;
    isLeavingRef.current = true;

    lastConfigRef.current = null;
    setIsReconnecting(false);

    try {
      clearViewerHardReconnectTimer();
      clearHostVideoRecoveryTimer();
      destroyBeautyProcessor();
      remoteAudioElementsRef.current.forEach(els => {
        els.forEach(el => el.remove());
      });
      remoteAudioElementsRef.current.clear();

      // 🛰️ Native publish path teardown.
      if (usingNativeRef.current) {
        try { await nativeLiveKitController.disconnect(); } catch { /* noop */ }
        usingNativeRef.current = false;
        setNativeActive(false);
      }

      if (roomRef.current) {
        roomRef.current.disconnect(true);
        roomRef.current = null;
      }

      setLocalVideoTrack(null);
      setLocalAudioTrack(null);
      setScreenTrack(null);
      setIsScreenSharing(false);
      setIsJoined(false);
      setConnectionState('DISCONNECTED');
      setRemoteUsers(new Map());
      setCoHosts(new Set());
      channelRef.current = '';
      console.log('[LiveKitClient] 👋 Left channel');
    } catch (err) {
      console.error('[LiveKitClient] Leave error:', err);
    } finally {
      isLeavingRef.current = false;
    }
  }, [clearHostVideoRecoveryTimer, clearViewerHardReconnectTimer]);

  // Toggle audio
  const toggleAudio = useCallback(async (enabled: boolean) => {
    if (usingNativeRef.current) {
      await nativeLiveKitController.setMicrophoneEnabled(enabled);
      return;
    }
    const room = roomRef.current;
    if (!room?.localParticipant) return;
    await room.localParticipant.setMicrophoneEnabled(enabled);
  }, []);

  // Toggle video
  const toggleVideo = useCallback(async (enabled: boolean) => {
    if (usingNativeRef.current) {
      await nativeLiveKitController.setCameraEnabled(enabled);
      return;
    }
    const room = roomRef.current;
    if (!room?.localParticipant) return;
    await room.localParticipant.setCameraEnabled(enabled);
  }, []);

  // Switch camera
  const switchCamera = useCallback(async () => {
    if (usingNativeRef.current) {
      await nativeLiveKitController.switchCamera();
      return;
    }
    const room = roomRef.current;
    if (!room?.localParticipant) return;

    const videoPub = Array.from(room.localParticipant.trackPublications.values())
      .find(p => p.track?.kind === Track.Kind.Video && p.source === Track.Source.Camera);
    
    if (videoPub?.track) {
      const devices = await Room.getLocalDevices('videoinput');
      if (devices.length > 1) {
        const currentId = videoPub.track.mediaStreamTrack?.getSettings()?.deviceId;
        const nextDevice = devices.find(d => d.deviceId !== currentId);
        if (nextDevice) {
          await room.switchActiveDevice('videoinput', nextDevice.deviceId);
        }
      }
    }
  }, []);

  /** Toggle native speakerphone routing during a live broadcast. No-op on web/iOS. */
  const setSpeakerOn = useCallback(async (on: boolean) => {
    if (!usingNativeRef.current) return;
    await nativeLiveKitController.setSpeakerphone(on);
  }, []);

  // Screen share
  const startScreenShare = useCallback(async () => {
    const room = roomRef.current;
    if (!room?.localParticipant || isScreenSharing) return;

    try {
      await room.localParticipant.setScreenShareEnabled(true);
      setIsScreenSharing(true);
    } catch (err) {
      console.error('[LiveKitClient] Screen share error:', err);
    }
  }, [isScreenSharing]);

  const stopScreenShare = useCallback(async () => {
    const room = roomRef.current;
    if (!room?.localParticipant) return;

    try {
      await room.localParticipant.setScreenShareEnabled(false);
      setIsScreenSharing(false);
      setScreenTrack(null);
    } catch (err) {
      console.error('[LiveKitClient] Stop screen share error:', err);
    }
  }, []);

  // Beauty effects (CSS-based, same as before)
  const applyBeautyEffect = useCallback((settings: BeautySettings) => {
    setBeautySettings(settings);
    setBeautyEnabled(true);
  }, []);

  const disableBeautyEffect = useCallback(() => {
    setBeautyEnabled(false);
  }, []);

  const getBeautyFilterCSS = useCallback(() => {
    if (!beautyEnabled) return '';
    const { smoothness, whitening, redness, sharpness, glow = 0, warmth = 0, eyeBright = 0, skinTone = 50 } = beautySettings;
    const filters: string[] = [];
    // Combined brightness from whitening + glow + eyeBright + smoothness
    const brightBoost = (whitening * 0.004) + (glow * 0.003) + (eyeBright * 0.001) + (smoothness * 0.001);
    const brightness = 1 + brightBoost;
    if (brightness > 1.001) filters.push(`brightness(${Math.min(brightness, 1.45).toFixed(3)})`);
    // Contrast: sharpness boosts, smoothness + whitening reduce
    const contrastVal = 1 + (sharpness * 0.004) - (smoothness * 0.002) - (whitening * 0.001);
    if (Math.abs(contrastVal - 1) > 0.005) filters.push(`contrast(${Math.min(Math.max(contrastVal, 0.82), 1.30).toFixed(3)})`);
    // Saturation: redness + warmth boost, whitening reduces
    const satVal = 1 + (redness * 0.004) + (warmth * 0.003) - (whitening * 0.002);
    if (Math.abs(satVal - 1) > 0.005) filters.push(`saturate(${Math.min(Math.max(satVal, 0.75), 1.50).toFixed(3)})`);
    // Sepia for warmth
    const skinWarmth = Math.max(0, (skinTone - 50)) / 50;
    const sepiaVal = (warmth * 0.002) + (skinWarmth * 0.08);
    if (sepiaVal > 0.01) filters.push(`sepia(${Math.min(sepiaVal, 0.30).toFixed(3)})`);
    // Hue rotation for cool/warm tone
    const skinCoolness = Math.max(0, (50 - skinTone)) / 50;
    const hueShift = (skinCoolness * -8) + (redness * 0.05);
    if (Math.abs(hueShift) > 0.5) filters.push(`hue-rotate(${hueShift.toFixed(1)}deg)`);
    // Subtle blur for skin smoothing
    const blurVal = smoothness * 0.006;
    if (blurVal > 0.05) filters.push(`blur(${Math.min(blurVal, 0.6).toFixed(2)}px)`);
    return filters.join(' ');
  }, [beautyEnabled, beautySettings]);

  // Co-host stubs (same API)
  const requestCoHost = useCallback(async (userName: string) => {
    console.log('[LiveKitClient] Requesting co-host:', userName);
  }, []);

  const acceptCoHostRequest = useCallback(async (uid: number) => {
    setCoHosts(prev => new Set(prev).add(uid));
    setCoHostRequests(prev => prev.filter(r => r.uid !== uid));
  }, []);

  const declineCoHostRequest = useCallback((uid: number) => {
    setCoHostRequests(prev => prev.filter(r => r.uid !== uid));
  }, []);

  // Toggle remote audio (mute/unmute for viewers)
  const toggleRemoteAudio = useCallback((muted: boolean) => {
    setIsRemoteAudioMuted(muted);
    remoteAudioElementsRef.current.forEach(els => {
      els.forEach(el => {
        el.muted = muted;
      });
    });
    console.log(`[LiveKitClient] 🔊 Remote audio ${muted ? 'muted' : 'unmuted'}`);
  }, []);

  // Retry subscription
  const retrySubscription = useCallback(async () => {
    const room = roomRef.current;
    if (!room || room.state !== ConnectionState.Connected) {
      console.log('[LiveKitClient] Cannot retry - not connected');
      return;
    }

    const now = Date.now();
    if (now - lastRetrySubscriptionAtRef.current < 160) {
      return;
    }
    lastRetrySubscriptionAtRef.current = now;

    console.log('[LiveKitClient] 🔄 Retrying subscriptions...');
    room.remoteParticipants.forEach((participant) => {
      ensureParticipantSubscribed(participant);

      participant.trackPublications.forEach((pub) => {
        if (pub.kind !== Track.Kind.Video) return;

        try {
          pub.setVideoQuality?.(preferredVideoQualityRef.current);
        } catch {
          // ignore optional API failures
        }

        if (!pub.isSubscribed) {
          try {
            pub.setSubscribed(true);
          } catch {
            // ignore
          }
          return;
        }

        // Avoid aggressive unsubscribe/resubscribe loops that can drop video while audio keeps playing.
        // Only force a re-subscribe if the publication is subscribed but has no active track.
        const publicationHasTrack = !!pub.track;
        if (!publicationHasTrack) {
          if (now - lastForcedVideoResubscribeAtRef.current > 15000) {
            lastForcedVideoResubscribeAtRef.current = now;
            try {
              pub.setSubscribed(false);
              setTimeout(() => {
                try {
                  pub.setSubscribed(true);
                } catch {
                  // ignore
                }
              }, 220);
            } catch {
              // ignore
            }
          }
          return;
        }

        try {
          pub.setSubscribed(true);
        } catch {
          // ignore
        }
      });
    });
  }, [ensureParticipantSubscribed]);

  return {
    isInitialized,
    isJoined,
    isLoading,
    isReconnecting,
    connectionState,
    localVideoTrack,
    localAudioTrack,
    screenTrack,
    isScreenSharing,
    remoteUsers,
    currentRole,
    coHosts,
    coHostRequests,
    beautyEnabled,
    beautySettings,
    error,
    isRemoteAudioMuted,
    joinChannel,
    leaveChannel,
    toggleAudio,
    toggleVideo,
    switchCamera,
    setSpeakerOn,
    startScreenShare,
    stopScreenShare,
    applyBeautyEffect,
    disableBeautyEffect,
    getBeautyFilterCSS,
    requestCoHost,
    acceptCoHostRequest,
    declineCoHostRequest,
    toggleRemoteAudio,
    retrySubscription,
  };
}
