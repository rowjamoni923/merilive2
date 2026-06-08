/**
 * useLiveKitClient – Now powered by LiveKit (API-compatible replacement).
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
  AudioPresets,
  VideoQuality,
} from 'livekit-client';
import { getLiveKitToken, warmLiveKitToken } from '@/services/livekitService';
import { attachLiveKitTokenRefresh } from '@/lib/livekitTokenRefresh';
import { attachLiveKitRemoteAudioOnce, detachLiveKitRemoteAudio, getLiveKitRemoteAudioKey, primeLiveKitRoomMedia } from '@/lib/livekitMediaSystem';
import { processTrackWithBeauty, destroyBeautyProcessor } from '@/services/tencentBeautyProcessor';
import { shouldUseNativeLiveKit, whenNativeLiveKitKillSwitchReady } from '@/lib/nativeLiveKitGate';
import { nativeLiveKitController } from '@/lib/nativeLiveKitController';
import { NativeLiveKit } from '@/plugins/NativeLiveKit';
import { useNativeLiveKitEvents } from '@/hooks/useNativeLiveKitEvents';
import { useNativeLiveKitLifecycle } from '@/hooks/useNativeLiveKitLifecycle';
import {
  AUDIO_ONLY_CHANGED_EVENT,
  applyAudioOnlyToRoom,
  isAudioOnlyEnabled,
} from '@/lib/livekitAudioOnlyMode';
import {
  VIDEO_QUALITY_CHANGED_EVENT,
  applyVideoQualityToRoom,
  applyVideoQualityCapToRoom,
  getVideoQualityChoice,
  resolveVideoQuality,
} from '@/lib/livekitVideoQuality';
import { subscribeQualityHint, getQualityHint, type QualityBucket } from '@/lib/qualityHint';
import { getPublishLayerConfig } from '@/lib/livekitPublishLayers';
import { pickOptimalCodecs } from '@/lib/livekitBackupCodec';
import { publishReliableLocalMedia } from '@/lib/livekitReliableMedia';
import { registerGiftRoom, registerNativeGiftRoom, unregisterGiftRoom, unregisterNativeGiftRoom } from '@/lib/livekitGiftSignaling';
import { clearPreparedHostPreviewStream } from '@/features/live/hostPreviewSession';
import { claimAndroidWebViewCamera, releaseAndroidWebViewCamera, releaseAndroidWebViewCameraNow } from '@/lib/androidCameraHandoff';
import { toast } from 'sonner';

interface LiveKitConfig {
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

interface UseLiveKitClientOptions {
  onUserJoined?: (uid: number) => void;
  onUserLeft?: (uid: number) => void;
  onVolumeChange?: (volumes: { uid: number; level: number }[]) => void;
  onError?: (error: Error) => void;
  onCoHostRequest?: (uid: number, userName: string) => void;
  onRoleChanged?: (uid: number, role: 'host' | 'audience') => void;
  /** Pkg74: When set, the underlying Room is registered with the
   * live-stream signaling registry so `publishStreamEnded(id, …)` works
   * and incoming `stream_ended` packets reach window event listeners. */
  liveSignalingStreamId?: string | null;
  /** Pkg76: When set, the underlying Room is also registered with the
   * gift signaling registry so `publishGiftSent('live', id, …)` works
   * and incoming `gift_sent` packets reach window event listeners. */
  giftSignalingStreamId?: string | null;
  /** Pkg77: When set, the underlying Room is registered with the
   * viewer-count registry so ParticipantConnected/Disconnected events
   * dispatch a `livekit-viewer-count` window event for instant badge
   * updates. Persistence (entrance banner, history) stays on Supabase. */
  viewerCountStreamId?: string | null;
  /** Pkg79: When set, the underlying Room is registered with the
   * chat signaling registry so `publishChatMessage('live', id, …)` works
   * and incoming `chat_message` packets reach window event listeners.
   * The `stream_chat` row remains the source of truth for moderation. */
  chatSignalingStreamId?: string | null;
  /** Pkg82a: When set, the underlying Room is registered with the
   * live-events registry so `publishLiveEvent(id, …)` works and incoming
   * `viewer_joined` packets (plus local `viewer_left` from LiveKit
   * ParticipantDisconnected) reach window event listeners. The
   * `stream_viewers` rows remain the source of truth for durable state. */
  liveEventsStreamId?: string | null;
  /** Live stream filter/beauty sync. Replaces legacy Supabase broadcast
   * `stream_filters_${id}` with LiveKit DataPackets on the same Room. */
  filterSignalingStreamId?: string | null;
  /** Pkg98: When set, the underlying Room is registered with the
   * active-speaker registry so `RoomEvent.ActiveSpeakersChanged` dispatches
   * a `livekit-active-speakers` window event. Consumers use
   * `useActiveSpeakers('live', id)` to ring the speaking host avatar.
   * Zero new Supabase channels, zero polls. */
  activeSpeakerStreamId?: string | null;
  /** Pkg101: When set, the underlying Room is registered with the
   * connection-quality registry so `RoomEvent.ConnectionQualityChanged`
   * dispatches a `livekit-connection-quality` window event. Consumers use
   * `useConnectionQuality('live', id)` to render network bars. */
  connectionQualityStreamId?: string | null;
  /** Pkg105: When set (host side only), the underlying Room is registered
   * with the track-subscription-permission registry so hosts can hard-block
   * specific viewer identities at the SFU level via `setHostBlocklist`. */
  trackPermissionStreamId?: string | null;
  /** Pkg107: When set, the underlying Room is registered with the
   * participant-metadata registry so `RoomEvent.ParticipantMetadataChanged`
   * dispatches a `livekit-participant-metadata` window event. Consumers use
   * `useParticipantMetadata('live', id, identity)` to read live state. */
  metadataStreamId?: string | null;
  /** Pkg122: When set, the underlying Room is registered with the
   * room-metadata registry so `RoomEvent.RoomMetadataChanged` dispatches a
   * `livekit-room-metadata` window event. Consumers use
   * `useRoomMetadata('live', id)` to read shared room state. */
  roomMetadataStreamId?: string | null;
  /** Pkg121: When set, the underlying Room is registered with the text/byte
   * stream registry so consumers can call `registerTextStreamHandler` /
   * `registerByteStreamHandler` / `sendText` / `sendFile` with scope='live'. */
  streamsStreamId?: string | null;
  /** Pkg120: When set, the underlying Room is registered with the RPC
   * registry so consumers can call `registerRpcMethod`/`performRpc` with
   * scope='live'. */
  rpcStreamId?: string | null;
  /** Pkg116: When set, the underlying Room is registered with the
   * transcription registry so `RoomEvent.TranscriptionReceived` dispatches a
   * `livekit-transcription` window event for caption / moderation UI. */
  transcriptionStreamId?: string | null;
  /** Pkg133: When set, the underlying Room is registered with the
   * reactions registry so `publishReaction`/`useReactions` work with
   * scope='live' for floating emoji bursts. */
  reactionsStreamId?: string | null;
}


export interface CoHostRequest {
  uid: number;
  userName: string;
  timestamp: number;
}

export function useLiveKitClient(options: UseLiveKitClientOptions = {}) {
  const [isInitialized, setIsInitialized] = useState(true); // LiveKit doesn't need SDK preload
  const [isJoined, setIsJoined] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [connectionState, setConnectionState] = useState<'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'DISCONNECTING'>('DISCONNECTED');
  const [localVideoTrack, setLocalVideoTrack] = useState<any>(null);
  const [localAudioTrack, setLocalAudioTrack] = useState<any>(null);
  const [isNativeMediaActive, setIsNativeMediaActive] = useState(false);
  const [screenTrack, setScreenTrack] = useState<any>(null);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [remoteUsers, setRemoteUsers] = useState<Map<number, any>>(new Map());
  // Pkg102: remote screen-share tracks (keyed by participant identity), kept
  // separate from camera userWrapper so screen share never overwrites face cam.
  const [remoteScreenTracks, setRemoteScreenTracks] = useState<Map<string, any>>(new Map());
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
  // Audit-fix (Live #2): ref-mirror of isRemoteAudioMuted so late-attached
  // audio tracks always read the LATEST mute state without needing the
  // join effect to re-run (which would tear down the room).
  const isRemoteAudioMutedRef = useRef(false);

  const roomRef = useRef<Room | null>(null);
  // Pkg189: token auto-refresh detach handle (replaces JWT before expiry so
  // long live/party sessions survive past the 6h TTL without disconnect).
  const tokenRefreshDetachRef = useRef<(() => void) | null>(null);
  const isJoiningRef = useRef(false);
  const isLeavingRef = useRef(false);
  const channelRef = useRef<string>('');
  const uidRef = useRef<number>(0);
  const lastConfigRef = useRef<LiveKitConfig | null>(null);
  // Map participant identity to a stable numeric UID for backward compat
  const participantUidMapRef = useRef<Map<string, number>>(new Map());
  const remoteAudioElementsRef = useRef<Map<string, HTMLAudioElement[]>>(new Map());
  const remoteAudioTrackKeysRef = useRef<Set<string>>(new Set());
  const hostVideoRecoveryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const viewerHardReconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastForcedVideoResubscribeAtRef = useRef(0);
  const lastRetrySubscriptionAtRef = useRef(0);
  const preferredVideoQualityRef = useRef<VideoQuality>(resolveVideoQuality(getVideoQualityChoice()));
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
      if (isLeavingRef.current || !usingNativeRef.current) return;
      setConnectionState('CONNECTING');
      toast.loading('Restoring live camera…', { id: 'lk-live-reconnect' });
      nativeLiveKitController.reconnectNow().then((ok) => {
        if (ok) {
          setNativeActive(true);
          setIsJoined(true);
          setConnectionState('CONNECTED');
          window.dispatchEvent(new Event('beauty:reapply'));
          setTimeout(() => window.dispatchEvent(new Event('beauty:reapply')), 800);
          toast.success('Reconnected', { id: 'lk-live-reconnect', duration: 1500 });
        } else {
          setConnectionState('CONNECTING');
        }
      }).catch(() => {
        setConnectionState('CONNECTING');
      });
    },
    // Step 19 — sticky reconnect toast for live broadcasters/viewers.
    onConnectionState: (s) => {
      if (s === 'reconnecting') {
        toast.loading('Reconnecting to live…', { id: 'lk-live-reconnect' });
        setConnectionState('CONNECTING');
      } else if (s === 'degraded' || s === 'reconnect-failed' || s === 'lost') {
        toast.loading('Restoring live camera…', { id: 'lk-live-reconnect' });
        nativeLiveKitController.reconnectNow().catch(() => {});
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
    onCameraState: (s) => {
      if (s === 'started') {
        window.dispatchEvent(new Event('beauty:reapply'));
        nativeLiveKitController.attachAllRemotes().catch(() => {});
      } else {
        toast.loading('Restoring live camera…', { id: 'lk-live-reconnect' });
        nativeLiveKitController.reconnectNow().catch(() => {});
      }
    },
    onVideoStall: (s, isLocal) => {
      if (s === 'failed' && isLocal) {
        toast.loading('Restoring live camera…', { id: 'lk-live-reconnect' });
        nativeLiveKitController.reconnectNow().catch(() => {});
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

  const attachRemoteAudioOnce = useCallback((track: RemoteTrack, participantIdentity: string, publication?: RemoteTrackPublication) => {
    const trackKey = getLiveKitRemoteAudioKey('live', participantIdentity, publication, track);
    if (remoteAudioTrackKeysRef.current.has(trackKey)) return;
    const audioEl = attachLiveKitRemoteAudioOnce({ scope: 'live', key: trackKey, track, muted: isRemoteAudioMutedRef.current });
    if (!audioEl) return;
    remoteAudioTrackKeysRef.current.add(trackKey);
    const existing = remoteAudioElementsRef.current.get(participantIdentity) || [];
    if (!existing.includes(audioEl)) existing.push(audioEl);
    remoteAudioElementsRef.current.set(participantIdentity, existing);
  }, []);

  const ensureParticipantSubscribed = useCallback((participant: RemoteParticipant) => {
    const pUid = getUidForParticipant(participant.identity);

    // Pkg381: Ensure ALL participants (especially the host) are in the map
    // even before their tracks arrive. This prevents the "nothing but
    // background" viewer symptom.
    setRemoteUsers((prev) => {
      const existing = prev.get(pUid);

      const userWrapper = existing || {
        uid: pUid,
        videoTrack: null as any,
        audioTrack: null as any,
        hasVideo: false,
        hasAudio: false,
      };

      let changed = !existing;

      participant.trackPublications.forEach((pub) => {
        // Pkg155: FORCE SUBSCRIBE to all tracks immediately to fix "no audio/video"
        if ((pub.kind === Track.Kind.Video || pub.kind === Track.Kind.Audio)) {
          if (!pub.isSubscribed) {
            try { 
              pub.setSubscribed(true); 
              console.log(`[LiveKitClient] Subscribing to ${pub.kind} for ${participant.identity}`);
            } catch (err) { 
              console.warn(`[LiveKitClient] Failed to subscribe to ${pub.kind}:`, err);
            }
          }
        }

        if (pub.kind === Track.Kind.Video && pub.track && pub.track !== userWrapper.videoTrack) {
          userWrapper.videoTrack = pub.track;
          userWrapper.hasVideo = true;
          changed = true;
        }

        if (pub.kind === Track.Kind.Audio && pub.track && pub.track !== userWrapper.audioTrack) {
          userWrapper.audioTrack = pub.track;
          userWrapper.hasAudio = true;
          changed = true;
          
          // Pkg155: Also attach audio immediately
          attachRemoteAudioOnce(pub.track as RemoteTrack, participant.identity, pub as RemoteTrackPublication);
        }
      });

      if (changed) {
        return new Map(prev).set(pUid, { ...userWrapper });
      }
      return prev;
    });
  }, [getUidForParticipant, attachRemoteAudioOnce]);



  // Join channel - creates a LiveKit room connection
  const joinChannel = useCallback(async (config: LiveKitConfig) => {
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

    // 🛰️ Native Android live path (Capacitor + LiveKit Android SDK).
    // Android hosts AND viewers use native LiveKit only; WebView RTC is dev/web fallback only.
    if (
      !config.preloadedRoom &&
      shouldUseNativeLiveKit({ feature: 'live-broadcast' })
    ) {
      try {
        await whenNativeLiveKitKillSwitchReady();
        if (!shouldUseNativeLiveKit({ feature: 'live-broadcast' })) {
          throw new Error('native_livekit_disabled_after_settings_sync');
        }

        const roomType = config.role === 'host' ? 'host_stream' : 'viewer_stream';
        warmLiveKitToken(normalizedChannel, roomType).catch(() => {});
        const { token, url } = await getLiveKitToken(normalizedChannel, roomType);

        // Section#5 pass-6 (Bug K — DUAL CAMERA CONFLICT): if we are about to use
        // the native Android publisher, we MUST kill the web-based preview
        // stream immediately. Otherwise WebView's getUserMedia holds the
        // hardware handle and Native Camera2 fails to start (black screen).
        clearPreparedHostPreviewStream({ stopTracks: true });
        try { config.preloadedVideoTrack?.stop(); } catch { /* noop */ }
        try { config.preloadedAudioTrack?.stop(); } catch { /* noop */ }
        await releaseAndroidWebViewCameraNow('live:native-before-connect');
        await new Promise((resolve) => setTimeout(resolve, 900));

        // Native LiveKit publish with one quick retry — Camera2 device may
        // be transiently held by the previous CameraX preview during the
        // GoLive→/live navigation. A 600ms wait + retry recovers cleanly.
        let nativeAttempt = 0;
        let lastNativeErr: unknown = null;
        // Phase I — pin H.264 for live broadcast: wider HW encoder support
        // on entry-level Android (Chamet/Bigo baseline). No-op on web/iOS
        // and on devices without HW H.264 (controller falls back to auto).
        try { await NativeLiveKit.setPreferredCodec({ codec: 'h264' }); } catch { /* noop */ }
        while (nativeAttempt < 2) {
          nativeAttempt++;
          try {
            await nativeLiveKitController.connectAndPublish({
              url,
              token,
              video: config.role === 'host',
              audio: config.role === 'host',
              lens: 'front',
              resolution: '1080p',
              attachLocal: config.role === 'host',
              // Phase I — Bigo/Chamet-style LIVE foreground notification
              // ("🔴 LIVE · {viewers} watching" + "End Live" action) instead
              // of the call-style "Call in progress" UI used for 1:1 calls.
              broadcastMode: 'live',
              audioProfile: 'broadcast',
              callType: 'Live broadcast',
              roomScope: 'live',
            });
            lastNativeErr = null;
            break;
          } catch (e) {
            lastNativeErr = e;
            if (nativeAttempt < 2) {
              console.warn('[LiveKitClient/Native] connect failed, retrying in 600ms:', e);
              try { await nativeLiveKitController.disconnect(); } catch { /* noop */ }
              await new Promise((r) => setTimeout(r, 600));
            }
          }
        }
        if (lastNativeErr) throw lastNativeErr;

        usingNativeRef.current = true;
        setNativeActive(true);
        setIsNativeMediaActive(true);
        channelRef.current = normalizedChannel;
        setIsJoined(true);
        setConnectionState('CONNECTED');
        setCurrentRole(config.role);
        setIsLoading(false);
        isJoiningRef.current = false;
        const joinTime = performance.now() - startTime;
        console.log(`[LiveKitClient/Native] ✅ Connected in ${joinTime.toFixed(0)}ms`);
        return { uid: uidRef.current || 0, channel: normalizedChannel };
      } catch (nativeErr) {
        console.error('[LiveKitClient/Native] join failed after retry:', nativeErr);
        usingNativeRef.current = false;
        setNativeActive(false);
        setIsNativeMediaActive(false);
        try { await nativeLiveKitController.disconnect(); } catch { /* noop */ }
        lastConfigRef.current = null;
        setConnectionState('DISCONNECTED');
        setIsLoading(false);
        isJoiningRef.current = false;
        try { options.onError?.(nativeErr instanceof Error ? nativeErr : new Error(String((nativeErr as any)?.message || nativeErr))); } catch { /* ignore */ }
        throw nativeErr instanceof Error ? nativeErr : new Error(String((nativeErr as any)?.message || nativeErr));
      }
    }

    try {
      // Disconnect existing room if any
      if (roomRef.current) {
        clearHostVideoRecoveryTimer();
        if (tokenRefreshDetachRef.current) {
          try { tokenRefreshDetachRef.current(); } catch { /* ignore */ }
          tokenRefreshDetachRef.current = null;
        }
        roomRef.current.disconnect(true);
        roomRef.current = null;
      }

      const isViewer = config.role === 'audience';
      // Pkg152: host-selected publish tier (portrait 9:16 enforced inside preset).
      // Viewers ignore this — they only subscribe.
      const layerCfg = !isViewer
        ? (() => {
            try {
              return getPublishLayerConfig();
            } catch {
              return null;
            }
          })()
        : null;
      const captureRes = layerCfg
        ? { width: layerCfg.resolution.width, height: layerCfg.resolution.height, frameRate: layerCfg.resolution.frameRate }
        : VideoPresets.h1080.resolution;
      const videoEnc = layerCfg
        ? { maxBitrate: layerCfg.videoEncoding.maxBitrate, maxFramerate: layerCfg.videoEncoding.maxFramerate }
        : { maxBitrate: 6_500_000, maxFramerate: 30 };
      const simulcastLayers = layerCfg?.simulcastLayers ?? [];
      const useSimulcast = simulcastLayers.length > 0;
      const room = new Room({
        // Pkg155: Chamet/Bigo-parity — adaptive stream + dynacast ON
        // Viewers auto-receive only the simulcast layer matching their video element size + bandwidth.
        // Host's `maintain-resolution` degradation preference + simulcastLayers below keep top-layer crisp;
        // adaptive only switches DOWN-layer for off-screen / small / poor-net viewers. Net result: smoother,
        // no stalls for weak networks, no quality loss for strong networks.
        adaptiveStream: true,
        dynacast: true,
        reconnectPolicy: {
          nextRetryDelayInMs: (context: any) => {
            if (context.retryCount > 15) return null;
            const base = isViewer ? 120 : 250;
            return Math.min(base * Math.pow(1.3, context.retryCount), 8000);
          },
        },
        videoCaptureDefaults: {
          resolution: captureRes,
          facingMode: 'user',
        },
        // Pkg163: Chamet/Bigo-parity professional voice — full WebRTC voice processing
        // chain ON (AEC+NS+AGC) at 48kHz mono. Krisp BVC layer applied on top (livekitNoiseFilter).
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 48000,
        },
        publishDefaults: {
          videoEncoding: videoEnc,
          degradationPreference: 'maintain-resolution',
          simulcast: useSimulcast,
          ...(useSimulcast ? { videoSimulcastLayers: simulcastLayers } : {}),
          // Pkg205 (M3): device-aware codec selection.
          // iOS/desktop Safari → H.264 primary (no VP9/AV1 hardware decode).
          // Chromium with AV1 hw → AV1, else VP9. H.264 backup preferred
          // over VP8 for broader receiver hardware coverage.
          ...pickOptimalCodecs(),
          // Pkg163: high-quality voice opus encoder + RED (packet loss resilience).
          // dtx:false → continuous audio (no silence-detection clipping during pauses).
          audioPreset: AudioPresets.musicHighQuality,
          dtx: false,
          red: true,
        },
        ...(isViewer ? {
          autoSubscribe: true,
        } : {}),
      });
      roomRef.current = room;
      primeLiveKitRoomMedia(room);

      const uid = config.uid || Math.floor(Math.random() * 100000);
      uidRef.current = uid;
      channelRef.current = normalizedChannel;

      // Set up room event handlers
      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
        const pUid = getUidForParticipant(participant.identity);
        console.log(`[LiveKitClient] Track subscribed: ${track.kind}/${publication.source} from ${participant.identity} (uid: ${pUid})`);

        // Pkg102: route screen-share video into separate map so it doesn't
        // clobber the host camera tile. Viewer renders it as an overlay.
        if (track.kind === Track.Kind.Video && publication.source === Track.Source.ScreenShare) {
          setRemoteScreenTracks(prev => {
            const next = new Map(prev);
            next.set(participant.identity, track);
            return next;
          });
          options.onUserJoined?.(pUid);
          return;
        }

        if (track.kind === Track.Kind.Audio) {
          // Audit-fix: ALWAYS attach the audio element, then honor the
          // current mute state via ref. Previously we skipped attach when
          // muted, so toggling unmute on a late-subscribed track had no
          // <audio> element to act on and the viewer heard silence.
          attachRemoteAudioOnce(track, participant.identity, publication);
        }

        if (track.kind === Track.Kind.Video) {
          // Data-saver must never hide the host camera. Keep video subscribed;
          // only reduce quality so visitors still see live/video-party/call faces.
          if (isAudioOnlyEnabled()) {
            try { publication.setVideoQuality?.(VideoQuality.LOW); } catch { /* ignore */ }
          }
          try {
            publication.setVideoQuality?.(isAudioOnlyEnabled() ? VideoQuality.LOW : preferredVideoQualityRef.current);
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
            if (pub.track?.kind === Track.Kind.Audio && pub.source !== Track.Source.ScreenShareAudio) {
              userWrapper.audioTrack = pub.track;
              userWrapper.hasAudio = true;
            }
          });

          setRemoteUsers(prev => new Map(prev).set(pUid, userWrapper));
        }

        options.onUserJoined?.(pUid);
      });

      // Pkg102: clean up screen-share map on unsubscribe / unpublish.
      room.on(RoomEvent.TrackUnsubscribed, (_track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
        if (publication.source === Track.Source.ScreenShare) {
          setRemoteScreenTracks(prev => {
            if (!prev.has(participant.identity)) return prev;
            const next = new Map(prev);
            next.delete(participant.identity);
            return next;
          });
        }
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
          // Keep the entry alive if audio is still flowing — only blank the video slot.
          // This prevents the host card from disappearing during a transient video
          // republish (camera switch, ICE restart, quality renegotiation).
          setRemoteUsers(prev => {
            const existing = prev.get(pUid);
            const hasAudioStill = Array.from(participant.trackPublications.values())
              .some(pub => pub.kind === Track.Kind.Audio && pub.isSubscribed && pub.track);
            const newMap = new Map(prev);
            if (hasAudioStill && existing) {
              newMap.set(pUid, { ...existing, videoTrack: null, hasVideo: false });
            } else {
              newMap.delete(pUid);
            }
            return newMap;
          });
          const mediaTrack = (track as any)?.mediaStreamTrack as MediaStreamTrack | undefined;
          if (mediaTrack?.readyState === 'ended') {
            try { publication.setSubscribed(true); } catch { /* ignore */ }
          }
        }

        if (track.kind === Track.Kind.Audio) {
          // Detach audio elements
          const els = remoteAudioElementsRef.current.get(participant.identity);
          if (els) {
            els.forEach(el => {
              const key = el.dataset.livekitAudioKey;
              if (key) {
                remoteAudioTrackKeysRef.current.delete(key);
                detachLiveKitRemoteAudio(key);
              }
            });
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
          els.forEach(el => {
            const key = el.dataset.livekitAudioKey;
            if (key) {
              remoteAudioTrackKeysRef.current.delete(key);
              detachLiveKitRemoteAudio(key);
            }
          });
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
            // Pkg-audit Bug G: do NOT wipe remoteUsers synchronously — that
            // blanks the viewer's video tile for 0-300ms on every reconnect.
            // Instead, re-subscribe to current participants and drop any that
            // are no longer in the room AFTER the resync runs.
            const resync = () => {
              if (roomRef.current !== room || room.state !== ConnectionState.Connected) return;
              const liveUids = new Set<number>();
              room.remoteParticipants.forEach((participant) => {
                liveUids.add(getUidForParticipant(participant.identity));
                ensureParticipantSubscribed(participant);
              });
              // Diff-remove anyone who actually left
              setRemoteUsers((prev) => {
                let changed = false;
                const next = new Map(prev);
                for (const id of next.keys()) {
                  if (!liveUids.has(id)) { next.delete(id); changed = true; }
                }
                return changed ? next : prev;
              });
            };

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
        } else if (config.role === 'host') {
          // Phase-D fix: previously a HOST-side full Disconnected (SFU drop,
          // network flap that exceeded LiveKit's internal reconnect budget,
          // token expiry past the auto-refresh window) had ZERO auto-rejoin
          // path. The host's stream would silently die — viewers see "Host
          // left" and the host stares at a frozen UI until they manually
          // restart. Now we bounded-retry the join with backoff.
          const lastConfig = lastConfigRef.current;
          if (lastConfig && !isLeavingRef.current && !isJoiningRef.current) {
            lastConfigRef.current = null;
            const HOST_REJOIN_DELAYS = [800, 1800, 3500, 6500];
            let attempt = 0;
            const tryRejoin = () => {
              if (isLeavingRef.current || isJoiningRef.current) return;
              if (roomRef.current && roomRef.current.state === ConnectionState.Connected) return;
              console.warn('[LiveKitClient] Host auto-rejoin attempt', attempt + 1);
              setConnectionState('CONNECTING');
              joinChannel({ ...lastConfig, preloadedRoom: undefined })
                .then(() => {
                  console.log('[LiveKitClient] ✅ Host auto-rejoin succeeded');
                })
                .catch((err) => {
                  attempt += 1;
                  if (attempt < HOST_REJOIN_DELAYS.length) {
                    setTimeout(tryRejoin, HOST_REJOIN_DELAYS[attempt]);
                  } else {
                    console.error('[LiveKitClient] 🛑 Host auto-rejoin gave up after', attempt, 'attempts');
                    try {
                      options.onError?.(err instanceof Error ? err : new Error('Live connection lost. Please restart the stream.'));
                    } catch { /* ignore */ }
                  }
                });
            };
            setTimeout(tryRejoin, HOST_REJOIN_DELAYS[0]);
          }
        }
      });

      // Capture local tracks as they publish (covers late-publish & re-publish after recovery)
      room.on(RoomEvent.LocalTrackPublished, (publication) => {
        if (publication.track) {
          if (publication.track.kind === Track.Kind.Video) {
              setIsNativeMediaActive(false);
            console.log('[LiveKitClient] LocalTrackPublished: video');
            setLocalVideoTrack(publication.track);
            // CRYSTAL CLEAR: Set contentHint on every published video track
            try {
              const mt = publication.track.mediaStreamTrack;
              if (mt && 'contentHint' in mt) (mt as any).contentHint = 'detail';
            } catch { /* ignore */ }
            // Pkg417 — re-apply professional GPUPixel beauty on every
            // (re)publish so adaptive-tier track swaps / recovery
            // republishes don't drop the beauty processor.
            try { window.dispatchEvent(new CustomEvent('beauty:reapply')); } catch { /* ignore */ }
          } else if (publication.track.kind === Track.Kind.Audio) {
            setLocalAudioTrack(publication.track);
          }
        }
      });

      // CRYSTAL CLEAR: Keep HIGH quality for viewers without sub-5s polling.
      // This touches only LiveKit track state (no DB), but must still respect
      // the $1400 zero-tolerance guard for live/call/party intervals.
      let qualityEnforcer: ReturnType<typeof setInterval> | null = null;
      if (config.role === 'audience') {
        // Re-enforce HIGH quality every 10 seconds to prevent any downgrade.
        qualityEnforcer = setInterval(() => {
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
        }, 10000);

        room.on(RoomEvent.Disconnected, () => clearInterval(qualityEnforcer));
      }

      // === PRELOADED ROOM FAST PATH ===
      // If a pre-connected Room was provided (from liveStreamPreloader), skip token + connect
      if (config.preloadedRoom && config.preloadedRoom.state === ConnectionState.Connected) {
        console.log(`[LiveKitClient] ⚡ Using PRELOADED room — skipping token/connect`);
        // Transfer event handlers from new room to preloaded room
        // We already set up handlers on `room` above, but preloaded room is the one connected.
        // Solution: disconnect the new empty room, use the preloaded one instead.
        if (qualityEnforcer) {
          clearInterval(qualityEnforcer);
          qualityEnforcer = null;
        }
        room.removeAllListeners();
        roomRef.current = config.preloadedRoom;
        primeLiveKitRoomMedia(config.preloadedRoom);

        // Re-wire essential events on the preloaded room
        const pRoom = config.preloadedRoom;
        pRoom.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
          const pUid = getUidForParticipant(participant.identity);
          if (track.kind === Track.Kind.Audio) {
            // Audit-fix: always attach; honor current mute via ref.
            attachRemoteAudioOnce(track, participant.identity, publication);
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
          if (track.kind === Track.Kind.Audio) {
            const els = remoteAudioElementsRef.current.get(participant.identity);
            if (els) {
              els.forEach(el => {
                const key = el.dataset.livekitAudioKey;
                if (key) {
                  remoteAudioTrackKeysRef.current.delete(key);
                  detachLiveKitRemoteAudio(key);
                }
              });
              remoteAudioElementsRef.current.delete(participant.identity);
            }
          }
        });
        pRoom.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
          const pUid = getUidForParticipant(participant.identity);
          setRemoteUsers(prev => { const m = new Map(prev); m.delete(pUid); return m; });
          const els = remoteAudioElementsRef.current.get(participant.identity);
          if (els) {
            els.forEach(el => {
              const key = el.dataset.livekitAudioKey;
              if (key) {
                remoteAudioTrackKeysRef.current.delete(key);
                detachLiveKitRemoteAudio(key);
              }
            });
            remoteAudioElementsRef.current.delete(participant.identity);
          }
        });
        pRoom.on(RoomEvent.Disconnected, () => {
          clearHostVideoRecoveryTimer();
          setIsJoined(false);
          setConnectionState('DISCONNECTED');
        });
        pRoom.on(RoomEvent.LocalTrackPublished, (publication) => {
          if (publication.track?.kind === Track.Kind.Video) {
            setLocalVideoTrack(publication.track);
            try { window.dispatchEvent(new CustomEvent('beauty:reapply')); } catch { /* ignore */ }
          } else if (publication.track?.kind === Track.Kind.Audio) {
            setLocalAudioTrack(publication.track);
          }
        });

        // FIX (Pkg-audit HIGH): Preloaded room was missing TrackPublished + ParticipantConnected
        // re-wires. If host published video AFTER preloaded handoff but BEFORE TrackSubscribed
        // fired, viewer saw a black screen until reconnect. Mirror the normal-path handlers.
        pRoom.on(RoomEvent.TrackPublished, (publication: RemoteTrackPublication, participant: RemoteParticipant) => {
          try { publication.setSubscribed(true); } catch { /* ignore */ }
          if (publication.kind === Track.Kind.Video) {
            try { publication.setVideoQuality?.(preferredVideoQualityRef.current); } catch { /* ignore */ }
          }
          ensureParticipantSubscribed(participant);
        });
        pRoom.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
          const pUid = getUidForParticipant(participant.identity);
          ensureParticipantSubscribed(participant);
          options.onUserJoined?.(pUid);
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
              attachRemoteAudioOnce(pub.track as RemoteTrack, p.identity, pub as RemoteTrackPublication);
            }
          });
        });

        return { uid, channel: normalizedChannel };
      }

      // Get token (determine room type from role)
      const roomType = config.role === 'host' ? 'host_stream' : 'viewer_stream';
      warmLiveKitToken(normalizedChannel, roomType).catch(() => {});
      const tokenResp = await getLiveKitToken(normalizedChannel, roomType);
      const { token, url, ttl } = tokenResp;

      const tokenTime = performance.now() - startTime;
      console.log(`[LiveKitClient] Token ready in ${tokenTime.toFixed(0)}ms`);

      // Prepare socket/TLS path first, then connect
      await room.prepareConnection(url, token).catch(() => {});
      await room.connect(url, token);
      setIsJoined(true);
      setConnectionState('CONNECTED');
      setCurrentRole(config.role);

      // Pkg189: schedule silent token refresh before TTL expiry.
      if (tokenRefreshDetachRef.current) {
        try { tokenRefreshDetachRef.current(); } catch { /* ignore */ }
      }
      tokenRefreshDetachRef.current = attachLiveKitTokenRefresh(
        room,
        async () => {
          const fresh = await getLiveKitToken(normalizedChannel, roomType);
          return { token: fresh.token, url: fresh.url, ttl: fresh.ttl };
        },
        ttl ?? 60 * 60 * 6,
        { label: `lk-live-${roomType}` }
      );

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

          if (!alreadyHasVideo || !alreadyHasAudio) {
            const preparedTracks = [config.preloadedVideoTrack, config.preloadedAudioTrack]
              .filter((track): track is MediaStreamTrack => !!track && track.readyState === 'live');
            await publishReliableLocalMedia(room, {
              needVideo: true,
              needAudio: true,
              preparedStream: preparedTracks.length ? new MediaStream(preparedTracks) : null,
            });
          }

          // Pkg103: apply Krisp noise filter to whichever mic we just published
          import('@/lib/livekitNoiseFilter').then((m) => m.applyKrispToRoomMic(room)).catch(() => {});

          // Pkg204: tag camera track with contentHint='motion' — tells WebRTC
          // to prefer framerate over fidelity during congestion (Bigo/TikTok-grade
          // perceptual upgrade for live faces + beauty filter motion).
          import('@/lib/livekitCameraTuning').then((m) => m.applyMotionHint(room)).catch(() => {});

          // Pkg144: apply saved pre-join device preferences (camera/mic/speaker)
          import('@/lib/livekitDevicePreferences').then(({ getDevicePreferences }) => {
            const prefs = getDevicePreferences();
            if (prefs.audioinput) room.switchActiveDevice('audioinput', prefs.audioinput).catch(() => {});
            if (prefs.videoinput) room.switchActiveDevice('videoinput', prefs.videoinput).catch(() => {});
            if (prefs.audiooutput) room.switchActiveDevice('audiooutput', prefs.audiooutput).catch(() => {});
          }).catch(() => {});

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
                  // Replace the published track with the beauty-processed one.
                  // CRITICAL: pass `false` as the second arg to unpublishTrack so LiveKit
                  // does NOT call stop() on the underlying camera MediaStreamTrack.
                  // The beauty pipeline keeps reading that exact track as its source —
                  // stopping it would freeze the canvas captureStream and viewers would
                  // see a black/frozen face for the entire stream.
                  try {
                    await room.localParticipant.unpublishTrack(cameraPub.track, false);
                    const replacementPub = await room.localParticipant.publishTrack(beautifiedTrack as any, { source: Track.Source.Camera } as any);
                    // Pkg-audit Bug H: if the beauty publish returned no track,
                    // fall back to the original camera publication so the host
                    // preview never goes blank while we're still broadcasting.
                    if (replacementPub?.track) {
                      setLocalVideoTrack(replacementPub.track);
                    } else if (cameraPub.track) {
                      setLocalVideoTrack(cameraPub.track);
                    }
                    console.log('[LiveKitClient] ✅ Replaced camera track with beauty-processed track');
                  } catch (e) {
                    console.warn('[LiveKitClient] Beauty track replacement failed, using original:', e);
                    // Defense-in-depth: re-anchor preview to the original track
                    if (cameraPub.track) setLocalVideoTrack(cameraPub.track);
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
          // Phase-C fix: bound camera-recovery attempts. Without a cap, a
          // permanently-revoked camera (user denied permission mid-stream,
          // device camera locked by another app, hardware failure) caused
          // the 3s poller to retry recoverHostCamera() forever — burning
          // CPU/battery and spamming logs. After MAX consecutive failures
          // we stop and surface a single error to UI so the host sees a
          // clear message instead of a silent black preview.
          const MAX_RECOVERY_FAILURES = 5;
          let recoveryFailures = 0;
          let recoveryGivenUp = false;
          const recoverHostCamera = () => {
            if (recovering || recoveryGivenUp) return;
            const activeRoom = roomRef.current;
            if (activeRoom !== room || room.state !== ConnectionState.Connected) return;
            recovering = true;
            console.warn('[LiveKitClient] ⚠️ Host camera lost, recovering...', { attempt: recoveryFailures + 1 });
            // Phase-C: small exponential backoff between settle + retry so
            // we don't hammer the camera HAL on a flapping device.
            const settleMs = Math.min(80 * (recoveryFailures + 1), 600);
            room.localParticipant.setCameraEnabled(false)
              .catch(() => {})
              .then(() => new Promise((resolve) => setTimeout(resolve, settleMs)))
              .then(async () => {
                await claimAndroidWebViewCamera('live:web-recover-camera');
                return room.localParticipant.setCameraEnabled(true);
              })
              .then(() => {
                const refreshedPub = Array.from(room.localParticipant.trackPublications.values())
                  .find((p) => p.track?.kind === Track.Kind.Video && p.source === Track.Source.Camera);
                if (refreshedPub?.track) {
                  setLocalVideoTrack(refreshedPub.track);
                  // Re-attach onended listener to the fresh track
                  const freshMt = (refreshedPub.track as any).mediaStreamTrack as MediaStreamTrack | undefined;
                  if (freshMt) attachOnEnded(freshMt);
                  // Phase-C: success → reset failure counter so a future
                  // (unrelated) glitch isn't penalized by prior history.
                  recoveryFailures = 0;
                }
              })
              .catch((recoverErr) => {
                recoveryFailures += 1;
                console.error('[LiveKitClient] Host camera recovery failed', { attempt: recoveryFailures, err: recoverErr });
                if (recoveryFailures >= MAX_RECOVERY_FAILURES) {
                  recoveryGivenUp = true;
                  console.error('[LiveKitClient] 🛑 Camera recovery gave up after', MAX_RECOVERY_FAILURES, 'attempts');
                  try {
                    options.onError?.(new Error('Camera unavailable. Please check camera permission or close other apps using the camera, then restart the stream.'));
                  } catch { /* ignore */ }
                  clearHostVideoRecoveryTimer();
                }
              })
              .finally(() => { recovering = false; });
          };

          // Pkg-audit Camera-bulletproof: instant onended listener (0ms detection)
          // vs the 3s polling timer below. Camera unplug / OS-revocation / hardware
          // error now triggers recovery immediately instead of up to 3s later.
          const attachedTracksRef = new WeakSet<MediaStreamTrack>();
          const attachOnEnded = (mt: MediaStreamTrack) => {
            if (attachedTracksRef.has(mt)) return;
            attachedTracksRef.add(mt);
            try {
              mt.addEventListener('ended', () => {
                console.warn('[LiveKitClient] 📷 Camera track ended (instant detect)');
                recoverHostCamera();
              });
            } catch { /* ignore */ }
          };
          // Attach to current camera track
          const initialPub = Array.from(room.localParticipant.trackPublications.values())
            .find((p) => p.track?.kind === Track.Kind.Video && p.source === Track.Source.Camera);
          const initialMt = (initialPub?.track as any)?.mediaStreamTrack as MediaStreamTrack | undefined;
          if (initialMt) attachOnEnded(initialMt);

          hostVideoRecoveryTimerRef.current = setInterval(() => {
            if (roomRef.current !== room || room.state !== ConnectionState.Connected) return;
            const videoPub = Array.from(room.localParticipant.trackPublications.values())
              .find((p) => p.track?.kind === Track.Kind.Video && p.source === Track.Source.Camera);
            const track = videoPub?.track as any;
            const mediaTrack = track?.mediaStreamTrack as MediaStreamTrack | undefined;
            if (!track || !mediaTrack) return;
            // Belt-and-suspenders: re-attach onended in case the track was swapped
            attachOnEnded(mediaTrack);
            if (!mediaTrack.enabled) mediaTrack.enabled = true;
            if (mediaTrack.readyState === 'ended') recoverHostCamera();
          }, 3000); // Polling kept as safety-net; onended is the primary path.


        } catch (trackErr: any) {
          console.error('[LiveKitClient] Track creation error:', trackErr);
          // 🚨 Surface the error so the host sees a clear toast instead of
          // staring at a "Starting camera..." screen forever.
          try { options.onError?.(trackErr instanceof Error ? trackErr : new Error(String(trackErr?.message || trackErr))); } catch { /* ignore */ }
          // Pkg-audit Camera-bulletproof: multi-attempt retry with backoff
          // (was single 1.2s retry — Android WebView camera handoff can take
          // 2-4s when transitioning from native preview). 3 attempts: 800ms,
          // 1800ms, 3500ms. Surfaces error each time so UI can update status.
          const retryDelays = [800, 1800, 3500];
          let retryIdx = 0;
          const attemptRetry = () => {
            if (retryIdx >= retryDelays.length) return;
            const delay = retryDelays[retryIdx++];
            setTimeout(() => {
              if (roomRef.current !== room || room.state !== ConnectionState.Connected) return;
              const hasVideo = Array.from(room.localParticipant.trackPublications.values())
                .some((p) => p.track?.kind === Track.Kind.Video && p.source === Track.Source.Camera);
              if (hasVideo) return;
              console.log(`[LiveKitClient] 🔁 Camera publish retry ${retryIdx}/${retryDelays.length}`);
              publishReliableLocalMedia(room, { needVideo: true, needAudio: true })
                .then(() => {
                  room.localParticipant.trackPublications.forEach((pub) => {
                    if (pub.track?.kind === Track.Kind.Video) setLocalVideoTrack(pub.track);
                    if (pub.track?.kind === Track.Kind.Audio) setLocalAudioTrack(pub.track);
                  });
                  console.log('[LiveKitClient] ✅ Camera publish succeeded on retry');
                })
                .catch((retryErr) => {
                  console.error(`[LiveKitClient] Camera publish retry ${retryIdx} failed:`, retryErr);
                  if (retryIdx >= retryDelays.length) {
                    try { options.onError?.(retryErr instanceof Error ? retryErr : new Error(String(retryErr?.message || retryErr))); } catch { /* ignore */ }
                  } else {
                    attemptRetry();
                  }
                });
            }, delay);
          };
          attemptRetry();
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
    // Audit-fix: removed isRemoteAudioMuted from deps — mute state is now
    // read via isRemoteAudioMutedRef.current at attach time. Including it
    // here used to invalidate joinChannel on every mute toggle, risking
    // re-joins from upstream effects that depend on its identity.
  }, [isJoined, options, getUidForParticipant, ensureParticipantSubscribed, attachRemoteAudioOnce, clearHostVideoRecoveryTimer]);

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
      if (tokenRefreshDetachRef.current) {
        try { tokenRefreshDetachRef.current(); } catch { /* ignore */ }
        tokenRefreshDetachRef.current = null;
      }
      remoteAudioElementsRef.current.forEach(els => {
        els.forEach(el => {
          const key = el.dataset.livekitAudioKey;
          if (key) detachLiveKitRemoteAudio(key);
        });
      });
      remoteAudioElementsRef.current.clear();
      remoteAudioTrackKeysRef.current.clear();

      // 🛰️ Native publish path teardown.
      // Fix 6 — race native disconnect with a 3s timeout. The plugin's
      // `disconnect()` waits on a busy-flag (waitForIdle) and an OEM grace,
      // both of which can stall behind a stuck reconnect. We must not let the
      // user's next join attempt block forever on this teardown.
      if (usingNativeRef.current) {
        try {
          await nativeLiveKitController.disconnect();
        } catch { /* noop */ }
        usingNativeRef.current = false;
        setNativeActive(false);
        setIsNativeMediaActive(false);
      }

      // Pkg-fix: explicitly stop local hardware tracks BEFORE disconnect so the
      // camera/mic LEDs go off immediately on Android WebViews even if a React
      // ref somewhere still holds the track reference. Read from the live room
      // (not React state) so stale closures don't leak tracks.
      try {
        const lp: any = roomRef.current?.localParticipant;
        const pubs = lp?.trackPublications ? Array.from(lp.trackPublications.values()) : [];
        pubs.forEach((pub: any) => {
          const t = pub?.track;
          if (!t) return;
          try { if (typeof t.stop === 'function') t.stop(); } catch {}
          try { if (t.mediaStreamTrack?.stop) t.mediaStreamTrack.stop(); } catch {}
        });
      } catch { /* noop */ }

      if (roomRef.current) {
        roomRef.current.disconnect(true);
        roomRef.current = null;
      }
      await releaseAndroidWebViewCameraNow('livekit:leaveChannel-force');

      setLocalVideoTrack(null);
      setLocalAudioTrack(null);
      setIsNativeMediaActive(false);
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
    if (enabled) {
      import('@/lib/livekitNoiseFilter').then((m) => m.applyKrispToRoomMic(room)).catch(() => {});
    }
  }, []);

  // Toggle video
  const toggleVideo = useCallback(async (enabled: boolean) => {
    if (usingNativeRef.current) {
      await nativeLiveKitController.setCameraEnabled(enabled);
      return;
    }
    const room = roomRef.current;
    if (!room?.localParticipant) return;
    if (enabled) await claimAndroidWebViewCamera('live:web-toggle-video');
    await room.localParticipant.setCameraEnabled(enabled);
    if (!enabled) releaseAndroidWebViewCamera('live:web-toggle-video-off');
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
    if (isScreenSharing) return;

    // Pkg102 native: route to Android MediaProjection when running on native LiveKit
    if (usingNativeRef.current) {
      try {
        const ok = await nativeLiveKitController.startScreenShare();
        if (ok) setIsScreenSharing(true);
      } catch (err) {
        setIsScreenSharing(false);
        throw err;
      }
      return;
    }

    const room = roomRef.current;
    if (!room?.localParticipant) return;

    try {
      await room.localParticipant.setScreenShareEnabled(true);
      setIsScreenSharing(true);
      // Pkg102: expose the published screen track so the host UI can render
      // its own preview overlay (LiveKit only auto-renders remote tracks).
      try {
        const pub = room.localParticipant.getTrackPublication(Track.Source.ScreenShare);
        const t = (pub as any)?.videoTrack || (pub as any)?.track || null;
        if (t) setScreenTrack(t);
      } catch { /* ignore */ }
    } catch (err) {
      console.error('[LiveKitClient] Screen share error:', err);
      setIsScreenSharing(false);
      throw err;
    }
  }, [isScreenSharing]);

  const stopScreenShare = useCallback(async () => {
    if (usingNativeRef.current) {
      await nativeLiveKitController.stopScreenShare();
      setIsScreenSharing(false);
      setScreenTrack(null);
      return;
    }
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

  // Beauty effects — CSS path PERMANENTLY REMOVED (user request, 2026-06-07).
  // The only real beauty engine is now the native GPUPixel pipeline
  // (3D MarsFace landmarks + skin smoothing + whitening + thin-face +
  // big-eye + lipstick + blusher). It is wired into the outgoing LiveKit
  // broadcast track by `applyBroadcastBeauty()` → `NativeLiveKit.setBeautyBroadcast`,
  // and the local preview shows the processed track directly. The old CSS
  // blur/brightness filter was just blur — no 3D face beauty — and looked
  // ugly. It is gone on every platform; web preview is a visual no-op for
  // beauty, matching Chamet/Bigo behaviour.
  const applyBeautyEffect = useCallback((settings: BeautySettings) => {
    setBeautySettings(settings);
    setBeautyEnabled(true);
  }, []);

  const disableBeautyEffect = useCallback(() => {
    setBeautyEnabled(false);
  }, []);

  const getBeautyFilterCSS = useCallback(() => '', []);

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
    isRemoteAudioMutedRef.current = muted; // keep ref in sync for late attaches
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

  // Pkg147: Audio-only viewer mode — apply on join + on every preference change.
  useEffect(() => {
    if (!isJoined) return;
    const apply = () => applyAudioOnlyToRoom(roomRef.current, isAudioOnlyEnabled());
    apply();
    const onChange = () => apply();
    window.addEventListener(AUDIO_ONLY_CHANGED_EVENT, onChange as EventListener);
    return () => window.removeEventListener(AUDIO_ONLY_CHANGED_EVENT, onChange as EventListener);
  }, [isJoined]);

  // Pkg149: Adaptive video quality — sync ref + re-apply across every remote video pub.
  // Pkg443 (Phase 4): also react to unified QualityHint (network + thermal + battery)
  // and cap the simulcast layer when the device/connection is under pressure. The
  // user's manual choice still wins when it's already lower than the auto-cap.
  useEffect(() => {
    if (!isJoined) return;
    const bucketToCap = (b: QualityBucket): VideoQuality | null => {
      switch (b) {
        case 'critical':
        case 'poor':      return VideoQuality.LOW;
        case 'fair':      return VideoQuality.MEDIUM;
        case 'good':
        case 'excellent':
        default:          return null;
      }
    };
    const apply = () => {
      const choice = getVideoQualityChoice();
      preferredVideoQualityRef.current = resolveVideoQuality(choice);
      applyVideoQualityToRoom(roomRef.current, choice);
      const cap = bucketToCap(getQualityHint().bucket);
      if (cap !== null) applyVideoQualityCapToRoom(roomRef.current, cap);
    };
    apply();
    const onChange = () => apply();
    window.addEventListener(VIDEO_QUALITY_CHANGED_EVENT, onChange as EventListener);
    const unsubHint = subscribeQualityHint(() => apply());
    return () => {
      window.removeEventListener(VIDEO_QUALITY_CHANGED_EVENT, onChange as EventListener);
      unsubHint();
    };
  }, [isJoined]);

  // Pkg74: Bind streamId → Room for LiveKit-based stream_ended signaling.
  // Re-runs whenever the join state flips or the streamId changes.
  useEffect(() => {
    const streamId = options.liveSignalingStreamId;
    if (!streamId || !isJoined) return;
    const room = roomRef.current;
    // Lazy import to avoid pulling signaling code into non-live paths.
    let cancelled = false;
    (async () => {
      try {
        const mod = await import('@/lib/livekitLiveSignaling');
        if (cancelled) return;
        if (room) mod.registerStreamRoom(streamId, room);
        else if (isNativeMediaActive) mod.registerNativeStreamRoom(streamId);
      } catch (e) {
        console.warn('[Pkg74] registerStreamRoom failed:', e);
      }
    })();
    return () => {
      cancelled = true;
      import('@/lib/livekitLiveSignaling').then((mod) => {
        mod.unregisterStreamRoom(streamId);
        mod.unregisterNativeStreamRoom(streamId);
      }).catch(() => {});
    };
  }, [options.liveSignalingStreamId, isJoined, isNativeMediaActive]);

  // Pkg76: Bind streamId → Room for LiveKit-based gift_sent signaling.
  // Reuses the SAME Room as Pkg74 (DataReceived supports multiple listeners).
  useEffect(() => {
    const streamId = options.giftSignalingStreamId;
    if (!streamId || !isJoined) return;
    const room = roomRef.current;
    try {
      if (room) registerGiftRoom('live', streamId, room);
      else if (isNativeMediaActive) registerNativeGiftRoom('live', streamId);
    } catch (e) {
      console.warn('[Pkg76] registerGiftRoom(live) failed:', e);
    }
    return () => {
      unregisterGiftRoom('live', streamId);
      unregisterNativeGiftRoom('live', streamId);
    };
  }, [options.giftSignalingStreamId, isJoined, isNativeMediaActive]);

  // Pkg77: Bind streamId → Room for INSTANT viewer count via LiveKit
  // ParticipantConnected/Disconnected. Same Room reused, zero new channels.
  useEffect(() => {
    const streamId = options.viewerCountStreamId;
    if (!streamId || !isJoined) return;
    const room = roomRef.current;
    if (!room) return;
    let cancelled = false;
    (async () => {
      try {
        const mod = await import('@/lib/livekitViewerCount');
        if (cancelled) return;
        mod.registerViewerCountRoom(streamId, room);
      } catch (e) {
        console.warn('[Pkg77] registerViewerCountRoom failed:', e);
      }
    })();
    return () => {
      cancelled = true;
      import('@/lib/livekitViewerCount').then((mod) => {
        mod.unregisterViewerCountRoom(streamId);
      }).catch(() => {});
    };
  }, [options.viewerCountStreamId, isJoined]);

  // Pkg79: Bind streamId → Room for LiveKit-based chat_message signaling.
  // Reuses the SAME Room as Pkg74/76/77 (DataReceived supports multiple listeners).
  useEffect(() => {
    const streamId = options.chatSignalingStreamId;
    if (!streamId || !isJoined) return;
    const room = roomRef.current;
    let cancelled = false;
    (async () => {
      try {
        const mod = await import('@/lib/livekitChatSignaling');
        if (cancelled) return;
        if (room) mod.registerChatRoom('live', streamId, room);
        else if (isNativeMediaActive) mod.registerNativeChatRoom('live', streamId);
      } catch (e) {
        console.warn('[Pkg79] registerChatRoom(live) failed:', e);
      }
    })();
    return () => {
      cancelled = true;
      import('@/lib/livekitChatSignaling').then((mod) => {
        mod.unregisterChatRoom('live', streamId);
        mod.unregisterNativeChatRoom('live', streamId);
      }).catch(() => {});
    };
  }, [options.chatSignalingStreamId, isJoined, isNativeMediaActive]);

  // Pkg82a: Bind streamId → Room for LiveKit-based viewer presence signaling.
  // Reuses the SAME Room (DataReceived + ParticipantDisconnected support
  // multiple listeners). Replaces 3 Supabase Realtime channels in LiveStream.tsx.
  useEffect(() => {
    const streamId = options.liveEventsStreamId;
    if (!streamId || !isJoined) return;
    const room = roomRef.current;
    let cancelled = false;
    (async () => {
      try {
        const mod = await import('@/lib/livekitLiveEventsSignaling');
        if (cancelled) return;
        if (room) mod.registerLiveEventsRoom(streamId, room);
        else if (isNativeMediaActive) mod.registerNativeLiveEventsRoom(streamId);
      } catch (e) {
        console.warn('[Pkg82a] registerLiveEventsRoom failed:', e);
      }
    })();
    return () => {
      cancelled = true;
      import('@/lib/livekitLiveEventsSignaling').then((mod) => {
        mod.unregisterLiveEventsRoom(streamId);
        mod.unregisterNativeLiveEventsRoom(streamId);
      }).catch(() => {});
    };
  }, [options.liveEventsStreamId, isJoined, isNativeMediaActive]);

  // Bind streamId → Room for LiveKit-based filter_update signaling.
  useEffect(() => {
    const streamId = options.filterSignalingStreamId;
    if (!streamId || !isJoined) return;
    const room = roomRef.current;
    if (!room) return;
    let cancelled = false;
    (async () => {
      try {
        const mod = await import('@/lib/livekitLiveFilterSignaling');
        if (cancelled) return;
        mod.registerLiveFilterRoom(streamId, room);
      } catch (e) {
        console.warn('[LiveFilter] registerLiveFilterRoom failed:', e);
      }
    })();
    return () => {
      cancelled = true;
      import('@/lib/livekitLiveFilterSignaling').then((mod) => {
        mod.unregisterLiveFilterRoom(streamId);
      }).catch(() => {});
    };
  }, [options.filterSignalingStreamId, isJoined]);

  // Pkg98: Bind streamId → Room for LiveKit ActiveSpeakersChanged events.
  // Reuses the SAME Room as Pkg74/76/77/79/82a. Server-side speaker detection
  // is built into LiveKit Cloud — no extra cost, no new channels.
  useEffect(() => {
    const streamId = options.activeSpeakerStreamId;
    if (!streamId || !isJoined) return;
    const room = roomRef.current;
    if (!room) return;
    let cancelled = false;
    (async () => {
      try {
        const mod = await import('@/lib/livekitActiveSpeaker');
        if (cancelled) return;
        mod.registerActiveSpeakerRoom('live', streamId, room);
      } catch (e) {
        console.warn('[Pkg98] registerActiveSpeakerRoom(live) failed:', e);
      }
    })();
    return () => {
      cancelled = true;
      import('@/lib/livekitActiveSpeaker').then((mod) => {
        mod.unregisterActiveSpeakerRoom('live', streamId);
      }).catch(() => {});
    };
  }, [options.activeSpeakerStreamId, isJoined]);

  // Pkg101: bind for connection-quality bars.
  useEffect(() => {
    const streamId = options.connectionQualityStreamId;
    if (!streamId || !isJoined) return;
    const room = roomRef.current;
    if (!room) return;
    let cancelled = false;
    (async () => {
      try {
        const mod = await import('@/lib/livekitConnectionQuality');
        if (cancelled) return;
        mod.registerConnectionQualityRoom('live', streamId, room);
      } catch (e) {
        console.warn('[Pkg101] registerConnectionQualityRoom(live) failed:', e);
      }
      // Pkg154: auto audio-only on poor connection.
      try {
        const mod = await import('@/lib/livekitAutoAudioOnly');
        if (cancelled) return;
        mod.registerAutoAudioOnlyRoom('live', streamId, room);
      } catch (e) {
        console.warn('[Pkg154] registerAutoAudioOnlyRoom(live) failed:', e);
      }
    })();
    return () => {
      cancelled = true;
      import('@/lib/livekitConnectionQuality').then((mod) => {
        mod.unregisterConnectionQualityRoom('live', streamId);
      }).catch(() => {});
      import('@/lib/livekitAutoAudioOnly').then((mod) => {
        mod.unregisterAutoAudioOnlyRoom('live', streamId);
      }).catch(() => {});
    };
  }, [options.connectionQualityStreamId, isJoined]);

  // Pkg107: bind for participant metadata sync (host AFK / theme / mod flags).
  useEffect(() => {
    const streamId = options.metadataStreamId;
    if (!streamId || !isJoined) return;
    const room = roomRef.current;
    if (!room) return;
    let cancelled = false;
    (async () => {
      try {
        const mod = await import('@/lib/livekitMetadata');
        if (cancelled) return;
        mod.registerMetadataRoom('live', streamId, room);
      } catch (e) {
        console.warn('[Pkg107] registerMetadataRoom(live) failed:', e);
      }
    })();
    return () => {
      cancelled = true;
      import('@/lib/livekitMetadata').then((mod) => {
        mod.unregisterMetadataRoom('live', streamId);
      }).catch(() => {});
    };
  }, [options.metadataStreamId, isJoined]);

  // Pkg122: bind for room-wide metadata sync (shared room state blob).
  useEffect(() => {
    const streamId = options.roomMetadataStreamId;
    if (!streamId || !isJoined) return;
    const room = roomRef.current;
    if (!room) return;
    let cancelled = false;
    (async () => {
      try {
        const mod = await import('@/lib/livekitRoomMetadata');
        if (cancelled) return;
        mod.registerRoomMetadataRoom('live', streamId, room);
      } catch (e) {
        console.warn('[Pkg122] registerRoomMetadataRoom(live) failed:', e);
      }
    })();
    return () => {
      cancelled = true;
      import('@/lib/livekitRoomMetadata').then((mod) => {
        mod.unregisterRoomMetadataRoom('live', streamId);
      }).catch(() => {});
    };
  }, [options.roomMetadataStreamId, isJoined]);

  // Pkg121: bind for text/byte stream transport (chunked chat / file send).
  useEffect(() => {
    const streamId = options.streamsStreamId;
    if (!streamId || !isJoined) return;
    const room = roomRef.current;
    if (!room) return;
    let cancelled = false;
    (async () => {
      try {
        const mod = await import('@/lib/livekitStreams');
        if (cancelled) return;
        mod.registerStreamRoom('live', streamId, room);
      } catch (e) {
        console.warn('[Pkg121] registerStreamRoom(live) failed:', e);
      }
    })();
    return () => {
      cancelled = true;
      import('@/lib/livekitStreams').then((mod) => {
        mod.unregisterStreamRoom('live', streamId);
      }).catch(() => {});
    };
  }, [options.streamsStreamId, isJoined]);

  // Pkg120: bind for participant RPC (typed peer request/response).
  useEffect(() => {
    const streamId = options.rpcStreamId;
    if (!streamId || !isJoined) return;
    const room = roomRef.current;
    if (!room) return;
    let cancelled = false;
    (async () => {
      try {
        const mod = await import('@/lib/livekitRpc');
        if (cancelled) return;
        mod.registerRpcRoom('live', streamId, room);
      } catch (e) {
        console.warn('[Pkg120] registerRpcRoom(live) failed:', e);
      }
    })();
    return () => {
      cancelled = true;
      import('@/lib/livekitRpc').then((mod) => {
        mod.unregisterRpcRoom('live', streamId);
      }).catch(() => {});
    };
  }, [options.rpcStreamId, isJoined]);

  // Pkg116: bind for realtime transcription / captions.
  useEffect(() => {
    const streamId = options.transcriptionStreamId;
    if (!streamId || !isJoined) return;
    const room = roomRef.current;
    if (!room) return;
    let cancelled = false;
    (async () => {
      try {
        const mod = await import('@/lib/livekitTranscription');
        if (cancelled) return;
        mod.registerRoomForTranscription('live', streamId, room);
      } catch (e) {
        console.warn('[Pkg116] registerRoomForTranscription(live) failed:', e);
      }
    })();
    return () => {
      cancelled = true;
      import('@/lib/livekitTranscription').then((mod) => {
        mod.unregisterRoomForTranscription('live', streamId);
      }).catch(() => {});
    };
  }, [options.transcriptionStreamId, isJoined]);
  // Pkg133: bind for floating emoji reactions on live streams.
  useEffect(() => {
    const streamId = options.reactionsStreamId;
    if (!streamId || !isJoined) return;
    const room = roomRef.current;
    let cancelled = false;
    (async () => {
      try {
        const mod = await import('@/lib/livekitReactions');
        if (cancelled) return;
        if (room) mod.registerReactionRoom('live', streamId, room);
        else if (isNativeMediaActive) mod.registerNativeReactionRoom('live', streamId);
      } catch (e) {
        console.warn('[Pkg133] registerReactionRoom(live) failed:', e);
      }
    })();
    return () => {
      cancelled = true;
      import('@/lib/livekitReactions').then((mod) => {
        mod.unregisterReactionRoom('live', streamId);
        mod.unregisterNativeReactionRoom('live', streamId);
      }).catch(() => {});
    };
  }, [options.reactionsStreamId, isJoined, isNativeMediaActive]);
  // Pkg105: bind for track-subscription permissions (host hard-block).
  useEffect(() => {
    const streamId = options.trackPermissionStreamId;
    if (!streamId || !isJoined) return;
    const room = roomRef.current;
    if (!room) return;
    let cancelled = false;
    let off: (() => void) | undefined;
    (async () => {
      try {
        const mod = await import('@/lib/livekitTrackPermissions');
        if (cancelled) return;
        off = mod.registerTrackPermissionRoom('live', streamId, room);
      } catch (e) {
        console.warn('[Pkg105] registerTrackPermissionRoom(live) failed:', e);
      }
    })();
    return () => {
      cancelled = true;
      try { off?.(); } catch { /* noop */ }
    };
  }, [options.trackPermissionStreamId, isJoined]);









  return {

    isInitialized,
    isJoined,
    isLoading,
    isReconnecting,
    connectionState,
    localVideoTrack,
    localAudioTrack,
    isNativeMediaActive,
    screenTrack,
    remoteScreenTracks,
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
