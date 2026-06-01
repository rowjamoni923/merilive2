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
  AudioPresets,
  VideoQuality,
} from 'livekit-client';
import { getLiveKitToken, warmLiveKitToken } from '@/services/livekitService';
import { attachLiveKitTokenRefresh } from '@/lib/livekitTokenRefresh';
import { attachLiveKitRemoteAudioOnce, detachLiveKitRemoteAudio, getLiveKitRemoteAudioKey, primeLiveKitRoomMedia } from '@/lib/livekitMediaSystem';
import { publishReliableLocalMedia } from '@/lib/livekitReliableMedia';
import { pickOptimalCodecs } from '@/lib/livekitBackupCodec';
import { consumePreparedHostPreviewStream } from '@/features/live/hostPreviewSession';
import { processTrackWithBeauty, destroyBeautyProcessor } from '@/services/tencentBeautyProcessor';
import { registerPartyRoom, unregisterPartyRoom } from '@/lib/livekitPartySignaling';
import { registerGiftRoom, unregisterGiftRoom } from '@/lib/livekitGiftSignaling';
import { registerPartyEventsRoom, unregisterPartyEventsRoom } from '@/lib/livekitPartyEventsSignaling';
import { registerChatRoom, unregisterChatRoom } from '@/lib/livekitChatSignaling';
import { registerActiveSpeakerRoom, unregisterActiveSpeakerRoom } from '@/lib/livekitActiveSpeaker';
import { registerConnectionQualityRoom, unregisterConnectionQualityRoom } from '@/lib/livekitConnectionQuality';
import { registerAutoAudioOnlyRoom, unregisterAutoAudioOnlyRoom } from '@/lib/livekitAutoAudioOnly';
import { registerMetadataRoom, unregisterMetadataRoom } from '@/lib/livekitMetadata';
import { registerRoomMetadataRoom, unregisterRoomMetadataRoom } from '@/lib/livekitRoomMetadata';
import { registerStreamRoom, unregisterStreamRoom } from '@/lib/livekitStreams';
import { registerRpcRoom, unregisterRpcRoom } from '@/lib/livekitRpc';
import { registerRoomForTranscription, unregisterRoomForTranscription } from '@/lib/livekitTranscription';
import {
  SELECTIVE_SUB_CHANGED_EVENT,
  applySelectiveSubscriptions,
  getSelectiveSubConfig,
} from '@/lib/livekitSelectiveSubscription';
import { registerReactionRoom, unregisterReactionRoom } from '@/lib/livekitReactions';
import { registerViewerCountRoom, unregisterViewerCountRoom } from '@/lib/livekitViewerCount';
import { claimAndroidWebViewCamera, releaseAndroidWebViewCamera } from '@/lib/androidCameraHandoff';
import { toast } from 'sonner';

interface PartyWebRTCState {
  localStream: MediaStream | null;
  peerStreams: Map<string, MediaStream>;
  isConnected: boolean;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
}

const isVideoPartyType = (roomType: 'video' | 'audio' | 'game') => roomType === 'video' || roomType === 'game';

const claimWebViewCameraIfAndroid = async (shouldClaim: boolean) => {
  if (!shouldClaim) return;
  await claimAndroidWebViewCamera('party-room');
};

const releaseWebViewCameraIfAndroid = () => {
  releaseAndroidWebViewCamera('party-room');
};

export function usePartyRoomWebRTC(
  roomId: string | null,
  userId: string | null,
  roomType: 'video' | 'audio' | 'game',
  _isHost: boolean,
  /** When false, LiveKit token is subscribe-only (audience); no local camera/mic publish. */
  partyCanPublish: boolean,
  /**
   * Pkg418: ProCamera arbiter clearance. Defaults to true so audio-only
   * rooms (which never publish video) and legacy callers keep working.
   * Video/game rooms MUST pass `useProCamera('video-party'|'game-party').ready`
   * — otherwise every `setCameraEnabled(true)` site below short-circuits
   * to false (no LiveKit camera publish) so the streaming family never
   * races face-verify for /dev/video0.
   */
  cameraReady: boolean = true
) {
  const partyCanPublishRef = useRef(partyCanPublish);
  partyCanPublishRef.current = partyCanPublish;
  const cameraReadyRef = useRef(cameraReady);
  cameraReadyRef.current = cameraReady;
  const [state, setState] = useState<PartyWebRTCState>({
    localStream: null,
    peerStreams: new Map(),
    isConnected: false,
    isAudioEnabled: true,
    isVideoEnabled: true, // Auto-enable camera by default for 100% video experience

  });
  const [restartNonce, setRestartNonce] = useState(0);

  const roomRef = useRef<Room | null>(null);
  const sessionSeqRef = useRef(0);
  // Pkg189: token refresh detach handle.
  const tokenRefreshDetachRef = useRef<(() => void) | null>(null);
  const peerStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const audioElementsRef = useRef<Map<string, HTMLAudioElement[]>>(new Map());
  const remoteAudioTrackKeysRef = useRef<Set<string>>(new Set());
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initRetryCountRef = useRef(0);
  const deadRef = useRef(false);

  const getRemoteAudioTrackKey = (
    identity: string,
    pub?: RemoteTrackPublication | null,
    track?: RemoteTrack | null,
  ) => getLiveKitRemoteAudioKey('party', identity, pub, track);

  const attachRemoteAudioOnce = (identity: string, pub: RemoteTrackPublication | null, track: RemoteTrack) => {
    const key = getRemoteAudioTrackKey(identity, pub, track);
    if (remoteAudioTrackKeysRef.current.has(key)) return;

    const audioEl = attachLiveKitRemoteAudioOnce({ scope: 'party', key, track });
    if (!audioEl) return;
    audioEl.dataset.partyAudioKey = key;

    const existing = audioElementsRef.current.get(identity) || [];
    if (!existing.includes(audioEl)) existing.push(audioEl);
    audioElementsRef.current.set(identity, existing);
    remoteAudioTrackKeysRef.current.add(key);
  };

  const detachAudioForIdentity = (identity: string) => {
    const els = audioElementsRef.current.get(identity);
    if (els) {
      els.forEach((el) => {
        const key = el.dataset?.partyAudioKey;
        if (key) {
          remoteAudioTrackKeysRef.current.delete(key);
          detachLiveKitRemoteAudio(key);
        }
      });
      audioElementsRef.current.delete(identity);
    }
    Array.from(remoteAudioTrackKeysRef.current)
      .filter((key) => key.startsWith(`party:${identity}:`))
      .forEach((key) => {
        remoteAudioTrackKeysRef.current.delete(key);
        detachLiveKitRemoteAudio(key);
      });
  };

  const detachAllAudio = () => {
    Array.from(audioElementsRef.current.keys()).forEach(detachAudioForIdentity);
    remoteAudioTrackKeysRef.current.clear();
  };

  const cleanup = useCallback(() => {
    console.log('[PartyLiveKit] Cleaning up...');
    deadRef.current = true;

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    // Pkg75/76/80/81c: detach signaling handlers before disconnecting the Room.
    try { unregisterPartyRoom(roomId); } catch { /* ignore */ }
    try { unregisterGiftRoom('party', roomId); } catch { /* ignore */ }
    try { unregisterPartyEventsRoom(roomId); } catch { /* ignore */ }
    try { unregisterChatRoom('party', roomId); } catch { /* ignore */ }
    try { unregisterActiveSpeakerRoom('party', roomId); } catch { /* ignore */ }
    try { unregisterConnectionQualityRoom('party', roomId); } catch { /* ignore */ }
    try { unregisterAutoAudioOnlyRoom('party', roomId); } catch { /* ignore */ }
    try { unregisterMetadataRoom('party', roomId); } catch { /* ignore */ }
    try { unregisterRoomMetadataRoom('party', roomId); } catch { /* ignore */ }
    try { unregisterStreamRoom('party', roomId); } catch { /* ignore */ }
    try { unregisterRpcRoom('party', roomId); } catch { /* ignore */ }
    try { unregisterRoomForTranscription('party', roomId); } catch { /* ignore */ }
    // Pkg133: drop reactions registration.
    try { unregisterReactionRoom('party', roomId); } catch { /* ignore */ }
    try { unregisterViewerCountRoom(roomId); } catch { /* ignore */ }

    if (tokenRefreshDetachRef.current) {
      try { tokenRefreshDetachRef.current(); } catch { /* ignore */ }
      tokenRefreshDetachRef.current = null;
    }
    if (roomRef.current) {
      // Pkg-fix: explicitly stop hardware tracks BEFORE room.disconnect so the
      // camera LED / busy state clears immediately on Android WebView. Without
      // this the next session (Live → close → Party) may get a black/blank
      // preview because the camera is still "in use" from the prior room.
      try {
        const lp: any = roomRef.current.localParticipant;
        const pubs = lp?.trackPublications ? Array.from(lp.trackPublications.values()) : [];
        pubs.forEach((pub: any) => {
          const t = pub?.track;
          if (!t) return;
          try { t.stop?.(); } catch { /* ignore */ }
          try { t.mediaStreamTrack?.stop?.(); } catch { /* ignore */ }
        });
      } catch { /* ignore */ }
      roomRef.current.disconnect(true);
      roomRef.current = null;
    }

    destroyBeautyProcessor();
    releaseWebViewCameraIfAndroid();
    detachAllAudio();
    peerStreamsRef.current.clear();

    setState({
      localStream: null,
      peerStreams: new Map(),
      isConnected: false,
      isAudioEnabled: true,
      isVideoEnabled: true,
    });
  }, [roomId]);

  const toggleAudio = useCallback(() => {
    if (!partyCanPublishRef.current) return;
    const room = roomRef.current;
    if (!room?.localParticipant) return;

    const newEnabled = !state.isAudioEnabled;
    room.localParticipant.setMicrophoneEnabled(newEnabled);
    if (newEnabled) {
      import('@/lib/livekitNoiseFilter').then((m) => m.applyKrispToRoomMic(room)).catch(() => {});
    }
    setState(prev => ({ ...prev, isAudioEnabled: newEnabled }));
  }, [state.isAudioEnabled]);

  const toggleVideo = useCallback(async () => {
    if (!partyCanPublishRef.current) return;
    const room = roomRef.current;
    if (!room?.localParticipant) return;

    const newEnabled = !state.isVideoEnabled;
    // Pkg418 hard gate: only acquire camera when arbiter says we're clear.
    if (newEnabled && !cameraReadyRef.current) {
      toast.error('Camera is busy with face verification. Please finish that first.');
      return;
    }
    try {
      if (newEnabled) await claimWebViewCameraIfAndroid(isVideoPartyType(roomType));
      await room.localParticipant.setCameraEnabled(newEnabled);
      if (!newEnabled) releaseWebViewCameraIfAndroid();
      setState(prev => ({ ...prev, isVideoEnabled: newEnabled }));
    } catch (err) {
      if (newEnabled) releaseWebViewCameraIfAndroid();
      console.warn('[PartyLiveKit] Video toggle failed:', err);
      toast.error('Camera could not start. Please close other camera screens and try again.');
    }
  }, [roomType, state.isVideoEnabled]);

  useEffect(() => {
    if (!roomId || !userId) {
      console.log('[PartyLiveKit] Skipping init - roomId:', roomId, 'userId:', userId, 'roomType:', roomType);
      return;
    }

    deadRef.current = false;
    const sessionSeq = ++sessionSeqRef.current;
    const delayedTimers: ReturnType<typeof setTimeout>[] = [];
    const isActiveSession = (expectedRoom: Room | null) => !!expectedRoom && !deadRef.current && sessionSeqRef.current === sessionSeq && roomRef.current === expectedRoom;
    const scheduleSessionTask = (fn: () => void, delayMs: number) => {
      const timer = setTimeout(() => {
        if (isActiveSession(room)) fn();
      }, delayMs);
      delayedTimers.push(timer);
      return timer;
    };

    const roomName = `party_${roomId}`;
    let room: Room | null = null;

    const init = async () => {
      try {
        console.log('[PartyLiveKit] Initializing for room:', roomId);

        room = new Room({
          // Pkg155: Chamet/Bigo-parity — adaptive stream + dynacast ON
          // Viewer auto-receives only the simulcast layer matching visible video size + bandwidth.
          // Saves uplink/downlink bandwidth, prevents "host crisp, viewers blurry" stalls.
          adaptiveStream: true,
          dynacast: true,
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
          // Pkg163: pro-grade voice (AEC+NS+AGC + 48kHz mono) for party rooms.
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
        });
        roomRef.current = room;
        primeLiveKitRoomMedia(room);

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

        const setPeerStreamForParticipant = (participant: RemoteParticipant, stream: MediaStream) => {
          const keys = new Set([participant.identity]);
          const userId = (participant as RemoteParticipant & { metadata?: string | null }).metadata;
          if (userId) keys.add(userId);
          stream.getTracks().forEach((track) => {
            if (track.readyState !== 'live') return;
            try { if ('contentHint' in track) (track as any).contentHint = 'motion'; } catch {}
          });
          keys.forEach((key) => peerStreamsRef.current.set(key, stream));
        };

        const deletePeerStreamForParticipant = (participant: RemoteParticipant) => {
          peerStreamsRef.current.delete(participant.identity);
          const userId = (participant as RemoteParticipant & { metadata?: string | null }).metadata;
          if (userId) peerStreamsRef.current.delete(userId);
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
          const preparedStream = previewStream?.getTracks().every((track) => track.readyState === 'live') ? previewStream : undefined;
          // Pkg418 hard gate: if arbiter not clear, publish audio-only.
          const needsVideo = isVideoPartyType(roomType) && cameraReadyRef.current;
          let cameraClaimed = false;
          let lastError: unknown = null;

          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              if (attempt > 1) {
                await resetLocalPublications();
                await new Promise((resolve) => setTimeout(resolve, 350 * attempt));
              }

              if (needsVideo && !cameraClaimed) {
                await claimWebViewCameraIfAndroid(true);
                cameraClaimed = true;
              }
              if (preparedStream && attempt === 1) console.log('[PartyLiveKit] ♻️ Reusing preloaded camera tracks from CreateParty');
              await publishReliableLocalMedia(room, {
                needVideo: needsVideo,
                needAudio: true,
                preparedStream,
                processVideoTrack: needsVideo ? processTrackWithBeauty : undefined,
              });

              await new Promise((resolve) => setTimeout(resolve, 250));
              rebuildLocalStream();
              // Pkg103: apply Krisp noise filter to published mic
              import('@/lib/livekitNoiseFilter').then((m) => m.applyKrispToRoomMic(room)).catch(() => {});

              // Pkg204: contentHint='motion' on camera track — smoother under congestion.
              import('@/lib/livekitCameraTuning').then((m) => m.applyMotionHint(room)).catch(() => {});

              const hasVideo = Array.from(room.localParticipant.trackPublications.values())
                .some((pub) => pub.kind === Track.Kind.Video && pub.track?.mediaStreamTrack?.readyState === 'live');
              const hasAudio = Array.from(room.localParticipant.trackPublications.values())
                .some((pub) => pub.kind === Track.Kind.Audio && pub.track?.mediaStreamTrack?.readyState === 'live');

              if ((roomType === 'audio' || hasVideo) && hasAudio) {
                console.log(`[PartyLiveKit] ✅ Local media published on attempt ${attempt}`);
                return;
              }

              throw new Error(`party_media_missing_tracks video=${hasVideo} audio=${hasAudio}`);
            } catch (error) {
              lastError = error;
              console.warn(`[PartyLiveKit] Local media publish attempt ${attempt} failed:`, error);
            }
          }

          // Pkg371: Surface the actual cause instead of a generic "failed" toast.
          // Browser MediaDevices errors have well-known names — map each to a
          // specific, actionable message so the host can fix the real problem.
          const err: any = lastError;
          if (cameraClaimed) releaseWebViewCameraIfAndroid();
          const errName: string = err?.name || err?.error?.name || '';
          const errMsg: string = String(err?.message || err || '').toLowerCase();
          const isVideo = roomType === 'video';
          let friendly: string;
          if (errName === 'NotAllowedError' || errMsg.includes('permission denied') || errMsg.includes('not allowed')) {
            friendly = isVideo
              ? 'Camera & mic permission denied. Open device Settings → Permissions and allow Camera + Microphone for this app, then retry.'
              : 'Mic permission denied. Open device Settings → Permissions and allow Microphone for this app, then retry.';
          } else if (errName === 'NotFoundError' || errMsg.includes('requested device not found')) {
            friendly = isVideo
              ? 'No camera or microphone found on this device.'
              : 'No microphone found on this device.';
          } else if (errName === 'NotReadableError' || errMsg.includes('could not start') || errMsg.includes('device in use')) {
            friendly = isVideo
              ? 'Camera/Mic is being used by another app. Close other camera apps and retry.'
              : 'Mic is being used by another app. Close other mic apps and retry.';
          } else if (errName === 'OverconstrainedError') {
            friendly = 'Your camera does not support the required quality. Please reopen the room.';
          } else if (errName === 'SecurityError' || errMsg.includes('insecure')) {
            friendly = 'Camera/Mic requires a secure (HTTPS) connection.';
          } else {
            friendly = isVideo
              ? 'Camera or mic failed to start. Please reopen the party room.'
              : 'Mic failed to start. Please reopen the party room.';
          }
          toast.error(friendly, { duration: 7000 });
          throw lastError instanceof Error ? lastError : new Error(String(lastError || 'party_media_publish_failed'));
        };

        room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, pub: RemoteTrackPublication, participant: RemoteParticipant) => {
          console.log(`[PartyLiveKit] Track subscribed: ${track.kind} from ${participant.identity}`);

          if (track.kind === Track.Kind.Audio) {
            attachRemoteAudioOnce(participant.identity, pub, track);
          }

          if (track.kind === Track.Kind.Video) {
            try {
              pub.setVideoQuality?.(VideoQuality.HIGH);
            } catch {
              // ignore optional API failure
            }
          }

          // Pkg381: Ensure peer is in state even if track arrives late
          const peerStream = buildPeerStream(participant);
          setPeerStreamForParticipant(participant, peerStream);
          setState(prev => ({
            ...prev,
            peerStreams: new Map(peerStreamsRef.current),
          }));
        });

        room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
          console.log(`[PartyLiveKit] Participant connected: ${participant.identity}`);
          participant.trackPublications.forEach((pub) => {
            if (!pub.isSubscribed) {
              try { pub.setSubscribed(true); } catch { /* ignore */ }
            }
            if (pub.kind === Track.Kind.Video) {
              try { pub.setVideoQuality?.(VideoQuality.HIGH); } catch { /* ignore */ }
            }
          });
          // Pkg381: Immediately add to state with empty stream so UI can show placeholder
          const peerStream = buildPeerStream(participant);
          setPeerStreamForParticipant(participant, peerStream);
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
            setPeerStreamForParticipant(participant, peerStream);
            setState(prev => ({
              ...prev,
              peerStreams: new Map(peerStreamsRef.current),
            }));
          }
        });

        room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, pub: RemoteTrackPublication, participant: RemoteParticipant) => {
          const audioKey = track.kind === Track.Kind.Audio
            ? getRemoteAudioTrackKey(participant.identity, pub, track)
            : null;
          if (track.kind === Track.Kind.Audio) {
            remoteAudioTrackKeysRef.current.delete(audioKey!);
            detachLiveKitRemoteAudio(audioKey!);
          }
          track.detach().forEach(el => el.remove());

          if (track.kind === Track.Kind.Audio) {
            // Drop only the detached audio element; keep other audio tracks for this identity alive.
            const remaining = (audioElementsRef.current.get(participant.identity) || []).filter(
              (el) => el.dataset?.partyAudioKey !== audioKey,
            );
            if (remaining.length > 0) {
              audioElementsRef.current.set(participant.identity, remaining);
            } else {
              audioElementsRef.current.delete(participant.identity);
            }
          }

          const peerStream = buildPeerStream(participant);
          if (peerStream.getTracks().length > 0) {
            setPeerStreamForParticipant(participant, peerStream);
          } else {
            deletePeerStreamForParticipant(participant);
          }
          setState(prev => ({
            ...prev,
            peerStreams: new Map(peerStreamsRef.current),
          }));
        });

        room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
          console.log('[PartyLiveKit] Participant left:', participant.identity);
          detachAudioForIdentity(participant.identity);
          deletePeerStreamForParticipant(participant);
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
            // Pkg417 — re-apply pro beauty on every (re)publish so
            // video-party / game-party also keep the GPUPixel processor
            // attached after seat changes / track recovery.
            try { window.dispatchEvent(new CustomEvent('beauty:reapply')); } catch { /* ignore */ }
          }
          rebuildLocalStream();
        });
        room.on(RoomEvent.LocalTrackUnpublished, () => {
          rebuildLocalStream();
        });

        // Get token and connect (audience: subscribe-only token)
        warmLiveKitToken(roomName, 'party', undefined, undefined, partyCanPublish).catch(() => {});
        const tokenResp = await getLiveKitToken(roomName, 'party', undefined, undefined, partyCanPublish);
        const { token, url, ttl } = tokenResp;
        if (!isActiveSession(room)) return;
        await room.prepareConnection(url, token).catch(() => {});
        if (!isActiveSession(room)) return;
        await room.connect(url, token);
        if (!isActiveSession(room)) {
          try { room.disconnect(true); } catch { /* ignore */ }
          return;
        }
        console.log('[PartyLiveKit] ✅ Connected to room');

        // Pkg189: silent token refresh before TTL expiry.
        if (tokenRefreshDetachRef.current) {
          try { tokenRefreshDetachRef.current(); } catch { /* ignore */ }
        }
        tokenRefreshDetachRef.current = attachLiveKitTokenRefresh(
          room,
          async () => {
            const fresh = await getLiveKitToken(roomName, 'party', undefined, undefined, partyCanPublish);
            return { token: fresh.token, url: fresh.url, ttl: fresh.ttl };
          },
          ttl ?? 60 * 60 * 6,
          { label: 'lk-party' }
        );

        // Pkg75: bind this LiveKit Room to the party roomId so the host
        // can publish `room_closed` packets and viewers can receive them
        // with sub-50ms latency. Reuses the existing Room — zero new
        // Supabase Realtime channels, zero polling.
        try {
          registerPartyRoom(roomId, room);
        } catch (err) {
          console.warn('[Pkg75] registerPartyRoom failed:', err);
        }

        // Pkg76: also bind for high-fanout gift_sent envelopes on the
        // SAME Room. DataReceived supports multiple listeners.
        try {
          registerGiftRoom('party', roomId, room);
        } catch (err) {
          console.warn('[Pkg76] registerGiftRoom(party) failed:', err);
        }

        // Pkg80: bind for participant_joined + seat_action ephemeral events.
        try {
          registerPartyEventsRoom(roomId, room);
        } catch (err) {
          console.warn('[Pkg80] registerPartyEventsRoom failed:', err);
        }
        try {
          registerViewerCountRoom(roomId, room);
        } catch (err) {
          console.warn('[PartyLiveKit] registerViewerCountRoom failed:', err);
        }

        // Pkg81c: bind for in-room chat DataPackets. Replaces the
        // `party-chat-${roomId}` Supabase postgres_changes subscription.
        try {
          registerChatRoom('party', roomId, room);
        } catch (err) {
          console.warn('[Pkg81c] registerChatRoom(party) failed:', err);
        }

        // Pkg98: bind for active-speaker detection. LiveKit server-side
        // speech detection fires ActiveSpeakersChanged ~200ms after voice
        // activity — used by useActiveSpeakers('party', roomId) to ring
        // the speaking seat avatar.
        try {
          registerActiveSpeakerRoom('party', roomId, room);
        } catch (err) {
          console.warn('[Pkg98] registerActiveSpeakerRoom(party) failed:', err);
        }
        // Pkg101: connection-quality network bars for each seat.
        try {
          registerConnectionQualityRoom('party', roomId, room);
        } catch (err) {
          console.warn('[Pkg101] registerConnectionQualityRoom(party) failed:', err);
        }
        // Pkg154: auto audio-only on sustained poor connection.
        try {
          registerAutoAudioOnlyRoom('party', roomId, room);
        } catch (err) {
          console.warn('[Pkg154] registerAutoAudioOnlyRoom(party) failed:', err);
        }
        // Pkg107: participant metadata sync (AFK/mod flags/theme).
        try {
          registerMetadataRoom('party', roomId, room);
        } catch (err) {
          console.warn('[Pkg107] registerMetadataRoom(party) failed:', err);
        }
        // Pkg122: room-wide metadata sync (current song, poll, theme, pinned).
        try {
          registerRoomMetadataRoom('party', roomId, room);
        } catch (err) {
          console.warn('[Pkg122] registerRoomMetadataRoom(party) failed:', err);
        }
        // Pkg121: bind for text/byte streams (chunked chat, file attachments).
        try {
          registerStreamRoom('party', roomId, room);
        } catch (err) {
          console.warn('[Pkg121] registerStreamRoom(party) failed:', err);
        }
        // Pkg120: bind for participant RPC (moderator commands, seat-ack).
        try {
          registerRpcRoom('party', roomId, room);
        } catch (err) {
          console.warn('[Pkg120] registerRpcRoom(party) failed:', err);
        }
        // Pkg116: bind for realtime transcription / captions.
        try {
          registerRoomForTranscription('party', roomId, room);
        } catch (err) {
          console.warn('[Pkg116] registerRoomForTranscription(party) failed:', err);
        }
        // Pkg133: bind for floating emoji reactions.
        try {
          registerReactionRoom('party', roomId, room);
        } catch (err) {
          console.warn('[Pkg133] registerReactionRoom(party) failed:', err);
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

        const partyVideoRecovery = setInterval(() => {
          if (deadRef.current || !isVideoPartyType(roomType) || !partyCanPublishRef.current || !cameraReadyRef.current) return;
          const activeRoom = roomRef.current;
          if (!activeRoom || activeRoom.state !== ConnectionState.Connected) return;
          const vPub = Array.from(activeRoom.localParticipant.trackPublications.values())
            .find((p: any) => p.track?.kind === Track.Kind.Video && p.source === Track.Source.Camera);
          const mediaTrack = (vPub?.track as any)?.mediaStreamTrack as MediaStreamTrack | undefined;
          if (mediaTrack?.readyState !== 'ended') return;
          console.warn('[PartyLiveKit] camera track ended, recovering');
          activeRoom.localParticipant.setCameraEnabled(false).catch(() => {})
            .then(() => new Promise((resolve) => setTimeout(resolve, 180)))
            .then(() => claimWebViewCameraIfAndroid(true))
            .then(() => activeRoom.localParticipant.setCameraEnabled(true))
            .then(() => window.dispatchEvent(new Event('beauty:reapply')))
            .catch((e) => console.warn('[PartyLiveKit] camera recovery failed:', e));
        }, 4000);
        delayedTimers.push(partyVideoRecovery as unknown as ReturnType<typeof setTimeout>);

        // Build local stream (initial pass)
        rebuildLocalStream();

        // Safety: rebuild again after short delays to catch late-publishing tracks
        scheduleSessionTask(rebuildLocalStream, 500);
        scheduleSessionTask(rebuildLocalStream, 1500);

        // Handle existing participants
        room.remoteParticipants.forEach(participant => {
          const peerStream = buildPeerStream(participant);
          if (peerStream.getTracks().length > 0) {
            setPeerStreamForParticipant(participant, peerStream);
          }
          // Play audio for existing participants
          participant.trackPublications.forEach(pub => {
            if (pub.track?.kind === Track.Kind.Audio && pub.isSubscribed) {
              attachRemoteAudioOnce(participant.identity, pub, pub.track as RemoteTrack);
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
              setPeerStreamForParticipant(participant, peerStream);
            }
          });
          setState(prev => ({
            ...prev,
            peerStreams: new Map(peerStreamsRef.current),
          }));
        };

        forceSubscribePass();
        scheduleSessionTask(forceSubscribePass, 30);
        scheduleSessionTask(forceSubscribePass, 80);
        scheduleSessionTask(forceSubscribePass, 200);
        scheduleSessionTask(forceSubscribePass, 500);
        initRetryCountRef.current = 0;

      } catch (error) {
        console.error('[PartyLiveKit] Initialization error:', error);
        if (sessionSeqRef.current !== sessionSeq) return;
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
      delayedTimers.forEach(clearTimeout);
      cleanup();
    };
    // NOTE: `partyCanPublish` is INTENTIONALLY excluded from this dep list.
    // The Chamet-parity token now always grants publish capability for party
    // rooms, so we never need to disconnect/reconnect to upgrade an audience
    // member to a seat speaker. A separate effect below flips mic/camera
    // instantly when the local user is approved onto a seat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, userId, roomType, restartNonce]);

  // Instant seat upgrade: when partyCanPublish flips true (host approved seat),
  // enable mic (+ camera for video rooms) WITHOUT reconnecting. When it flips
  // false (user left seat / kicked), mute both again immediately.
  useEffect(() => {
    const room = roomRef.current;
    if (!room || room.state !== 'connected') return;
    let cancelled = false;
    (async () => {
      try {
        if (partyCanPublish) {
          if (isVideoPartyType(roomType)) {
            // Pkg418 hard gate: skip camera publish when arbiter isn't clear.
            if (cameraReadyRef.current) {
              await claimWebViewCameraIfAndroid(true);
              await room.localParticipant.setCameraEnabled(true);
            }
          }
          await room.localParticipant.setMicrophoneEnabled(true);
          if (cancelled) return;
          // Apply Krisp noise filter on the freshly-published mic.
          import('@/lib/livekitNoiseFilter')
            .then((m) => m.applyKrispToRoomMic(room))
            .catch(() => {});
          setState((prev) => ({
            ...prev,
            isAudioEnabled: true,
            isVideoEnabled: roomType === 'video' || roomType === 'game' ? true : prev.isVideoEnabled,
          }));
        } else {
          await room.localParticipant.setCameraEnabled(false);
          releaseWebViewCameraIfAndroid();
          await room.localParticipant.setMicrophoneEnabled(false);
          setState((prev) => ({
            ...prev,
            isAudioEnabled: false,
            isVideoEnabled: false,
          }));
        }
      } catch (err) {
        console.warn('[PartyLiveKit] Instant seat-upgrade mic toggle failed:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [partyCanPublish, roomType, state.isConnected]);

  // Pkg150: Selective video subscription — cap concurrent remote video subs to
  // top-N by recent active speakers. Audio is never touched. Pure client SFU
  // control: zero Supabase channels, zero polls, zero cross-user reads.
  useEffect(() => {
    if (!state.isConnected || !roomId) return;
    const recentRef: string[] = [];

    const apply = () => {
      const cfg = getSelectiveSubConfig();
      if (!cfg.enabled) {
        // When disabled, re-enable subs across the board so users see all videos.
        const room = roomRef.current;
        if (!room) return;
        try {
          room.remoteParticipants.forEach((p) => {
            p.trackPublications.forEach((pub) => {
              if (pub.kind === 'video' && !pub.isSubscribed) {
                try { pub.setSubscribed(true); } catch { /* ignore */ }
              }
            });
          });
        } catch {
          // ignore
        }
        return;
      }
      applySelectiveSubscriptions(roomRef.current, cfg, { recentSpeakers: recentRef.slice() });
    };

    const onSpeakers = (e: Event) => {
      const detail = (e as CustomEvent<{ scope: string; id: string; identities: string[] }>).detail;
      if (!detail || detail.scope !== 'party' || detail.id !== roomId) return;
      // LRU buffer of recent speakers, newest first, cap 16.
      for (const id of detail.identities) {
        const ix = recentRef.indexOf(id);
        if (ix !== -1) recentRef.splice(ix, 1);
        recentRef.unshift(id);
      }
      if (recentRef.length > 16) recentRef.length = 16;
      apply();
    };

    const onCfg = () => apply();

    // Initial apply + subscribe to drivers.
    apply();
    window.addEventListener('livekit-active-speakers', onSpeakers as EventListener);
    window.addEventListener(SELECTIVE_SUB_CHANGED_EVENT, onCfg as EventListener);
    // Run a couple of catch-up applies after late TrackPublished events.
    const t1 = setTimeout(apply, 1000);
    const t2 = setTimeout(apply, 3000);

    return () => {
      window.removeEventListener('livekit-active-speakers', onSpeakers as EventListener);
      window.removeEventListener(SELECTIVE_SUB_CHANGED_EVENT, onCfg as EventListener);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [state.isConnected, roomId]);



  return {
    ...state,
    toggleAudio,
    toggleVideo,
    cleanup,
    getPeerStream: (peerId: string) => {
      const direct = state.peerStreams.get(peerId);
      if (direct) return direct;
      const hyphen = peerId.startsWith('user-') ? peerId.slice(5) : `user-${peerId}`;
      const underscore = peerId.startsWith('user_') ? peerId.slice(5) : `user_${peerId}`;
      return state.peerStreams.get(hyphen)
        ?? state.peerStreams.get(underscore)
        ?? Array.from(state.peerStreams.entries()).find(([key]) => key.includes(peerId))?.[1];
    },
  };
}
