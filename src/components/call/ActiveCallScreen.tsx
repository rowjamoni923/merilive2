import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { enhanceThumbnail } from "@/utils/enhanceThumbnail";
import { useContentModeration } from "@/hooks/useContentModeration";
import { useScreenLock } from "@/hooks/useScreenLock";
import { useNativeAudioFocus } from "@/hooks/useNativeAudioFocus";
import { useAudioFocusAutoMute } from "@/hooks/useAudioFocusAutoMute";
import { useLiveVoiceMonitor } from "@/hooks/useLiveVoiceMonitor";
import { useStableChatScroll } from "@/hooks/useStableChatScroll";
import { createPortal } from "react-dom";
import { isNativeAndroidApp, hapticFeedback } from "@/utils/nativeUtils";
import RequireNativeAndroidGate from "@/components/native/RequireNativeAndroidGate";
import { NativeCall } from "@/plugins/NativeCall";
import { PhoneOff, Mic, MicOff, Eye, EyeOff, Gift, Volume2, VolumeX, Maximize2, Minimize2, TrendingUp, ShieldCheck, Lock, MessageCircle, MoreVertical, Send, Sparkles, Smile } from "lucide-react";
import { BrandedGiftIcon } from "@/components/common/BrandedGiftIcon";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useLiveKitCall } from "@/hooks/useLiveKitCall";
import { setPreparedCallMediaStream, clearPreparedCallMediaStream } from "@/features/call/preparedCallMedia";
import {
  acquireCameraSession,
  peekCameraSession,
  adoptCameraSession,
  type CameraSessionHandle,
} from "@/lib/persistentCameraSession";

import { useBeautyState } from "@/hooks/useBeautyState";
import { BeautyFilterPanel } from "@/components/live/BeautyFilterPanel";
import StickerOverlay from "@/components/live/StickerOverlay";

import AvatarWithFrame from "@/components/common/AvatarWithFrame";
import { LiveKitVideoPlayer } from "@/components/live/LiveKitVideoPlayer";
import { NativeVideoView } from "@/components/NativeVideoView";
import { AudioOnlyToggleButton } from "@/components/livekit/AudioOnlyToggleButton";
import { NetworkQualityIndicator } from "@/components/livekit/NetworkQualityIndicator";
import LiveKitResilienceNotifier from "@/components/livekit/LiveKitResilienceNotifier";

import { GiftPanel, GiftData, FlyingGiftAnimation, FlyingGift, useFlyingGifts, sendGift, InlineGiftRow, encodeInlineGiftMarker, parseInlineGiftMarker } from "@/features/shared/gifting";
import BeansIcon from "@/components/common/BeansIcon";
import { supabase } from "@/integrations/supabase/client";
import { getAppSetting } from "@/utils/appSettingsCache";
import { toast } from "sonner";
import { publishChatMessage, type ChatMessageDetail } from "@/lib/livekitChatSignaling";
import type { GiftSentDetail } from "@/lib/livekitGiftSignaling";
import { useSound } from "@/hooks/useSound";
import { ScreenSecuritySDK } from "@/sdk/ScreenSecuritySDK";
import { CaptionOverlay } from "@/components/livekit/CaptionOverlay";
import { normalizeProfileMediaUrl } from "@/utils/profileMediaUrl";
import { warmGiftForInstantPlay } from "@/utils/instantGiftWarmup";
import { useCallSignaling } from "@/hooks/useCallSignaling";
import { LowBalanceBanner } from "@/components/call/LowBalanceBanner";
import { ReconnectingOverlay } from "@/components/call/ReconnectingOverlay";
import { RoomChatBubble } from "@/components/chat/UnifiedChatMessage";




interface ActiveCallScreenProps {
  isOpen: boolean;
  callId: string | null;
  userId: string | null;
  remoteUserId?: string | null;
  remoteUserName: string;
  remoteUserAvatar: string | null;
  remoteUserLevel?: number;
  duration: number;
  coinsPerMinute: number;
  totalCoinsSpent?: number;
  hostEarned?: number;
  callerRemainingCoins?: number;
  callStatus?: 'idle' | 'calling' | 'ringing' | 'connected' | 'ended';
  onEndCall: () => void | Promise<void>;
  onMediaConnected?: (callId: string) => void;
  isHost?: boolean;
  proCameraReady?: boolean;
}

export function ActiveCallScreen({
  isOpen,
  callId,
  userId,
  remoteUserId,
  remoteUserName,
  remoteUserAvatar,
  remoteUserLevel = 20,
  duration,
  coinsPerMinute,
  totalCoinsSpent = 0,
  hostEarned = 0,
  callerRemainingCoins = 0,
  callStatus = 'calling',
  onEndCall,
  onMediaConnected,
  isHost = false,
  proCameraReady = true,
}: ActiveCallScreenProps) {
  // Pkg443 Phase-3: keep screen awake for the entire active call.
  useScreenLock(isOpen);
  // Pkg444 Phase-5: own native audio focus + switch to in_communication
  // mode so Spotify/YouTube auto-pause and the earpiece routes correctly.
  useNativeAudioFocus({ enabled: isOpen, intent: 'call' });
  const proCameraEndRef = useRef(false);
  useEffect(() => {
    if (!isOpen || proCameraReady) {
      proCameraEndRef.current = false;
      return;
    }
    toast.error('Camera is busy with face verification. Please finish that first.');
    if (!proCameraEndRef.current) {
      proCameraEndRef.current = true;
      try { onEndCall?.(); } catch { /* ignore */ }
    }
  }, [isOpen, proCameraReady, onEndCall]);

  // Beauty state is UI-only; native beauty was removed for single-camera stability.
  const beauty = useBeautyState();
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [callEnded, setCallEnded] = useState(false);
  const [showGiftPanel, setShowGiftPanel] = useState(false);
  const [userCoins, setUserCoins] = useState(0);
  const [remoteStreamReady, setRemoteStreamReady] = useState(false);
  const [showPrivacyWarning, setShowPrivacyWarning] = useState(false);
  const [isSwapped, setIsSwapped] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<Array<{id: string; senderId: string; senderName: string; message: string; timestamp: number}>>([]);
  const callChatScroll = useStableChatScroll({
    dependency: chatMessages.length,
    resetKey: callId,
    bottomThreshold: 72,
    initialPinFrames: 4,
  });
  const chatInputRef = useRef<HTMLInputElement>(null);
  const [nativeInCallOpen, setNativeInCallOpen] = useState(false);
  const [nativeRemoteSid, setNativeRemoteSid] = useState<string | null>(null);
  const nativeInCallOpenedForRef = useRef<string | null>(null);
  const [myDisplayName, setMyDisplayName] = useState<string>("You");
  const [myAvatarUrl, setMyAvatarUrl] = useState<string | null>(null);
  const [myLevel, setMyLevel] = useState<number>(1);

  // ============================================================
  // PREVIEW-ONLY camera fallback (Lovable web preview).
  // Production web is always gated by RequireNativeAndroidGate;
  // here we mirror the local webcam into both tiles so QA can
  // visually verify the call screen layout (faces, chat, gifts)
  // without an APK + paired peer device.
  // ============================================================
  const isPreviewWeb = useMemo(() => {
    if (typeof window === 'undefined') return false;
    if (isNativeAndroidApp()) return false;
    const h = window.location.hostname;
    return (
      h === 'localhost' ||
      h === '127.0.0.1' ||
      h.endsWith('.lovableproject.com') ||
      /^id-preview--[a-z0-9-]+\.lovable\.app$/i.test(h)
    );
  }, []);
  const previewVideoRefPrimary = useRef<HTMLVideoElement | null>(null);
  const previewVideoRefPip = useRef<HTMLVideoElement | null>(null);
  const previewVideoRefRinging = useRef<HTMLVideoElement | null>(null);
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  // Pkg-shirt Phase-B: reuse the global persistentCameraSession that
  // CallProvider warmed during ringing/dialing. This makes accept feel
  // instant — same MediaStream, no fresh getUserMedia, no permission
  // re-prompt, no black flash. Falls back to a direct getUserMedia +
  // adopt if no warm session exists (deep-link to active call, etc.).
  const callCameraHandleRef = useRef<CameraSessionHandle | null>(null);
  useEffect(() => {
    if (!isOpen || !isPreviewWeb || !callId) return;
    let cancelled = false;
    (async () => {
      try {
        // Try warm session first (Provider already acquired during ring).
        const warm = peekCameraSession();
        if (warm) {
          const handle = await acquireCameraSession({ video: true, audio: true });
          if (cancelled) { handle.release(); return; }
          callCameraHandleRef.current?.release();
          callCameraHandleRef.current = handle;
          setPreviewStream(handle.stream);
          setPreparedCallMediaStream(callId, handle.stream);
          return;
        }
        // Cold path — no Provider warm-up reached us. Acquire fresh and
        // register so subsequent screens (Live/Party) can reuse it too.
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'user' },
            width: { ideal: 1080 },
            height: { ideal: 1920 },
            aspectRatio: { ideal: 9 / 16 },
            frameRate: { ideal: 30 },
          },
          audio: true,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        try {
          callCameraHandleRef.current?.release();
          callCameraHandleRef.current = adoptCameraSession(stream, {
            video: true,
            audio: true,
          });
        } catch { /* non-fatal */ }
        setPreviewStream(stream);
        setPreparedCallMediaStream(callId, stream);
      } catch (err) {
        console.warn('[ActiveCall][preview] camera acquire failed:', err);
      }
    })();
    return () => {
      cancelled = true;
      clearPreparedCallMediaStream(callId);
      // Pkg-shirt Phase-B: do NOT stop tracks — release our refcount and
      // let the global session decide. CallProvider still holds its own
      // refcount while ringing, and after end-call the next consumer
      // (or disposeCameraSessionIfIdle) frees the camera.
      callCameraHandleRef.current?.release();
      callCameraHandleRef.current = null;
      setPreviewStream(null);
    };
  }, [isOpen, isPreviewWeb, callId]);

  // Pkg502 — ref-callback attachment so srcObject is wired both when the
  // stream arrives and when a video element mounts later (calling→connected
  // transition mounts a new tile after the stream is already set).
  const attachPreview = useCallback((el: HTMLVideoElement | null, slot: 'primary' | 'pip' | 'ringing') => {
    const refMap = { primary: previewVideoRefPrimary, pip: previewVideoRefPip, ringing: previewVideoRefRinging };
    refMap[slot].current = el;
    if (el && previewStream && el.srcObject !== previewStream) {
      el.srcObject = previewStream;
    }
  }, [previewStream]);
  useEffect(() => {
    if (!previewStream) return;
    [previewVideoRefPrimary, previewVideoRefPip, previewVideoRefRinging].forEach((r) => {
      if (r.current && r.current.srcObject !== previewStream) r.current.srcObject = previewStream;
    });
  }, [previewStream]);
  
  // Host photos for calling/ringing screen
  const [hostPhotos, setHostPhotos] = useState<string[]>([]);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  
  // ✅ REAL-TIME Admin Settings - Gift Commission
  const [adminGiftCommission, setAdminGiftCommission] = useState<number>(55);
  
  // Flying gift animations for real-time display
  const { gifts: flyingGifts, addGift: addFlyingGift, removeGift: removeFlyingGift } = useFlyingGifts();
  const mountedRef = useRef(true);
  const userCoinsRef = useRef(0);
  // Section#5 pass-3 (Bug M): in-flight guard so rapid double-tap on a gift
  // tile can't pass the same userCoinsRef.current balance check twice and
  // double-deduct / double-send.
  const sendingGiftRef = useRef(false);
  // Section#5 pass-3 (Bug J): in-flight guard so the End Call button can't
  // fire onEndCall twice (CallProvider would then run end-call cleanup,
  // Telecom reportCallEnded, billing finalize, etc. twice).
  const endingRef = useRef(false);

  useEffect(() => {
    userCoinsRef.current = userCoins;
  }, [userCoins]);
  
  // ✅ REAL-TIME: Fetch and subscribe to gift commission
  useEffect(() => {
    const fetchCommission = async () => {
      const settings = await getAppSetting<Record<string, any>>('gift_commission');
      if (settings) {
        const rate = settings.host_percent ?? (100 - (settings.company_percent ?? 45));
        setAdminGiftCommission(rate);
      }
    };
    fetchCommission();
    
    // Pkg83 LiveKit-Purist: admin commission rate sync via Pkg37
    // admin-table-update window event. REPLACES `activecall-gift-commission-
    // realtime-*` Supabase postgres_changes channel.
    const onAdminUpdate = (e: Event) => {
      const detail = (e as CustomEvent<{ table?: string }>).detail;
      if (detail?.table === 'app_settings') fetchCommission();
    };
    window.addEventListener('admin-table-update', onAdminUpdate as EventListener);
    return () => {
      window.removeEventListener('admin-table-update', onAdminUpdate as EventListener);
    };
  }, [callId, userId]);
  
  // BILLING DISPLAY LOGIC:
  // The actual deduction happens on the backend every 60 seconds
  // We only show the ACTUAL billed amounts from the database (updated every 5s)
  // NO calculations or interpolation - Admin panel settings are the only source
  // totalCoinsSpent = actual coins deducted from caller (set by admin: e.g., 2000/min)
  // hostEarned = actual beans credited to host (admin commission: e.g., 60% = 1200 beans)
  const displayedCoinsSpent = totalCoinsSpent;
  const displayedHostEarned = hostEarned;

  // Pkg83: chat now flows over LiveKit DataPacket (no Supabase channel ref).
  
  
  // Sound hook - must be before useEffects that use it
  const { playSound, startRingtone, stopRingtone } = useSound();

  // LiveKit (Android native) hook
  const {
    localStream,
    remoteStream,
    remoteVideoTrack,
    localVideoTrack,
    isNativeMediaActive,
    localMediaReady,
    isConnected,
    isAudioEnabled,
    isVideoEnabled,
    connectionState,
    toggleAudio,
    toggleVideo,
    setSpeakerOn,
    isInPip,
    networkQuality,
    cleanup,
  } = useLiveKitCall(isOpen ? callId : null, userId, isHost);

  // Pkg444 Phase-6: auto-mute mic on incoming phone call / alarm /
  // assistant (AUDIOFOCUS_LOSS_TRANSIENT). Restored on focus regain
  // only if we were the ones who muted.
  useAudioFocusAutoMute({
    enabled: isOpen,
    intent: 'call',
    isMicEnabled: isAudioEnabled,
    setMicEnabled: (want) => {
      if (want !== isAudioEnabled) {
        try { void toggleAudio(); } catch { /* ignore */ }
      }
    },
  });

  // F7 — Voice moderation for private calls. Reuses the LiveKit local audio
  // MediaStream (no second mic open). Runs for BOTH parties — either side
  // sharing contact info is penalized identically to text/F6.
  useLiveVoiceMonitor({
    enabled: isOpen && isConnected,
    userId,
    context: "call",
    sourceId: callId,
    isMicEnabled: isAudioEnabled,
    getMediaStream: () => localStream,
    onViolation: ({ matches, beansDeducted, violationNumber }) => {
      const matchPreview = matches.slice(0, 2).join(", ");
      toast.error(
        `Contact info detected in call: ${matchPreview}` +
          (beansDeducted ? ` • -${beansDeducted} beans` : "") +
          (violationNumber ? ` • violation #${violationNumber}` : ""),
      );
    },
  });






  // Bug-fix: actually push speaker on/off to native audio routing whenever the
  // user toggles it (previously the menu button only flipped React state).
  useEffect(() => {
    if (!isOpen) return;
    try { setSpeakerOn?.(isSpeakerOn); } catch { /* ignore */ }
  }, [isOpen, isSpeakerOn, setSpeakerOn]);

  // Bug-fix: real front↔back camera flip via native LiveKit plugin.
  const handleFlipCamera = useCallback(async () => {
    try {
      const { nativeLiveKitController } = await import('@/lib/nativeLiveKitController');
      await nativeLiveKitController.switchCamera();
    } catch (err) {
      console.warn('[ActiveCall] switchCamera failed:', err);
    }
  }, []);
  
  const mediaConnectedNotifiedRef = useRef<string | null>(null);

  // ✅ Track remote video readiness via LiveKitVideoPlayer
  useEffect(() => {
    setRemoteStreamReady(!!remoteVideoTrack);
  }, [remoteVideoTrack]);

  const hasRemoteVideo = !!remoteVideoTrack && remoteStreamReady;
  const showNativeRemoteSurface = isNativeMediaActive && isConnected && !!nativeRemoteSid && !remoteVideoTrack;
  const showNativeLocalSurface = isNativeMediaActive && isConnected && !localVideoTrack;
  const primaryVideoTrack = isSwapped ? localVideoTrack : remoteVideoTrack;
  const secondaryVideoTrack = isSwapped ? remoteVideoTrack : localVideoTrack;
  const primaryHasVideo = isSwapped ? !!localVideoTrack && isVideoEnabled : hasRemoteVideo;
  const secondaryHasVideo = isSwapped ? hasRemoteVideo : !!localVideoTrack && isVideoEnabled;
  const primaryMirror = isSwapped;
  const secondaryMirror = !isSwapped;
  const primaryLabel = isSwapped ? 'You' : remoteUserName;
  const secondaryLabel = isSwapped ? remoteUserName : 'You';
  
  // 🔥 AWS Comprehend content moderation
  const { checkToxicContent: checkToxic } = useContentModeration(userId);
  // Do not keep the UI trapped on the branded "Calling/Ringing" overlay once
  // LiveKit media has actually connected. Backend callStatus can arrive a few
  // frames later than the native room join; if we wait for it, the remote
  // NativeVideoView is never mounted and users see "Connecting…" instead of
  // each other's faces.
  const hasLocalCallMedia = localMediaReady || !!localStream || isNativeMediaActive || !!localVideoTrack;
  const hasRemoteCallPresence = !!nativeRemoteSid || hasRemoteVideo || !!remoteStream || !!remoteVideoTrack;
  // Do NOT promote the accepted private call into the connected video canvas
  // from callStatus alone. The DB status can flip to `connected` before the
  // native/Web LiveKit remote participant/track is bindable; that rendered the
  // weak fallback "Connecting…" canvas instead of our branded accept screen and
  // delayed the two-face layout. Keep the premium waiting shell until local
  // media is alive AND the peer is visible/present, then mount bounded slots.
  const mediaRoomConnected = isConnected && hasLocalCallMedia && hasRemoteCallPresence;
  const isLiveConnected = mediaRoomConnected;
  const revealNativeConnectedCanvas = isNativeMediaActive && isLiveConnected;
  const connectionBadgeLabel = isLiveConnected ? 'LIVE' : callStatus === 'ringing' ? 'RINGING' : callStatus === 'calling' ? 'DIALING' : 'SYNC';
  const connectionBadgeTone = isLiveConnected ? 'text-emerald-300' : 'text-amber-300';

  // Android private-call UI must stay in our React premium shell so chat, gifts,
  // balance warnings and host/user controls remain visible. The old opaque
  // PrivateCallActivity had no chat surface and made the receiver see an OEM-
  // looking screen, so React is now the only visible in-call screen.
  useEffect(() => {
    if (!isOpen || !callId) {
      setNativeInCallOpen(false);
      nativeInCallOpenedForRef.current = null;
      return;
    }
    setNativeInCallOpen(false);
    nativeInCallOpenedForRef.current = null;
  }, [isOpen, callId]);

  useEffect(() => {
    if (!isOpen || !isNativeAndroidApp() || !isNativeMediaActive || !isConnected) {
      setNativeRemoteSid(null);
      return;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        const { nativeLiveKitController } = await import('@/lib/nativeLiveKitController');
        const participants = await nativeLiveKitController.getRemoteParticipants();
        if (!cancelled) setNativeRemoteSid(participants[0]?.sid || null);
      } catch { /* old APK/no native room */ }
    };
    void poll();
    // Fast first-window polling after Accept removes the visible delay before
    // <NativeVideoView kind="remote" /> mounts. After ~7s it relaxes itself.
    let fastPolls = 0;
    let slowTimer: number | null = null;
    const timer = window.setInterval(() => {
      fastPolls += 1;
      void poll();
      if (fastPolls >= 44) {
        window.clearInterval(timer);
        if (!cancelled) slowTimer = window.setInterval(poll, 700);
      }
    }, 160);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      if (slowTimer != null) window.clearInterval(slowTimer);
    };
  }, [isOpen, isNativeMediaActive, isConnected]);

  // Pkg207 — Auto-shrink to native Android PiP when user presses home
  // mid-call (WhatsApp / Google Meet parity). 9:16 for video calls, 1:1
  // for audio-only. isInPip flips true while in floating window — use it
  // to collapse the heavy chat / gift / settings overlays below.
  const isInNativePip = isInPip;
  // Never make the connecting canvas transparent for a private call. If native
  // media is warming up underneath, the user should still see the branded React
  // caller card instead of a raw full-screen camera surface.
  const shouldExposeNativePreview = false;



  // Start timer/billing only when actual media is live (camera+connection)
  useEffect(() => {
    if (!isOpen || !callId || callStatus !== 'connected') {
      if (!callId) mediaConnectedNotifiedRef.current = null;
      return;
    }

    const mediaLive = (localMediaReady || !!localStream || isNativeMediaActive) && isConnected;
    if (!mediaLive) return;
    if (mediaConnectedNotifiedRef.current === callId) return;

    mediaConnectedNotifiedRef.current = callId;
    onMediaConnected?.(callId);
  }, [isOpen, callId, callStatus, localMediaReady, localStream, isNativeMediaActive, isConnected, onMediaConnected]);

  // Connecting-stuck watchdog: if callStatus has flipped to 'connected' but the
  // LiveKit room never actually finishes joining (isConnected stays false), we
  // were previously stuck on the "Connecting…" badge forever — user had to
  // hang up manually. Fire onEndCall after 25s so endCall persistence runs
  // (RPC end_private_call + is_in_call reset + Telecom teardown).
  useEffect(() => {
    if (!isOpen || !callId || callStatus !== 'connected' || isConnected) return;
    const t = window.setTimeout(() => {
      try {
        console.warn('[ActiveCall] connecting-stuck watchdog firing endCall', { callId });
        Promise.resolve(onEndCall()).catch(() => {});
      } catch { /* ignore */ }
    }, 25000);
    return () => window.clearTimeout(t);
  }, [isOpen, callId, callStatus, isConnected, onEndCall]);

  // Fetch user coins, display name AND host photos
  useEffect(() => {
    const fetchUserInfo = async () => {
      if (!userId) return;
      const { data } = await supabase
        .from('profiles') // guard-ok: owner-only balance read for authenticated caller/host, not cross-user.
        .select('coins, display_name, avatar_url, user_level')
        .eq('id', userId)
        .single();
      if (data) {
        userCoinsRef.current = data.coins || 0;
        setUserCoins(data.coins || 0);
        if (data.display_name) setMyDisplayName(data.display_name);
        if (data.avatar_url) setMyAvatarUrl(normalizeProfileMediaUrl(data.avatar_url) || data.avatar_url);
        if (data.user_level) setMyLevel(data.user_level);
      }
    };
    
    // Fetch host photos for the remote user (shown during calling/ringing)
    const fetchHostPhotos = async () => {
      if (!remoteUserId) return;
      const { data } = await supabase
        .from('face_verification_submissions')
        .select('host_photos, profile_photo_url')
        .eq('user_id', remoteUserId)
        .eq('status', 'approved')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (data) {
        const photos: string[] = [];
        if (data.host_photos?.length) photos.push(...data.host_photos);
        if (data.profile_photo_url) photos.push(data.profile_photo_url);
        const normalizedPhotos = photos
          .map((photo) => normalizeProfileMediaUrl(photo) || photo)
          .filter(Boolean);
        setHostPhotos(normalizedPhotos);
      }
    };
    
    if (isOpen) {
      fetchUserInfo();
      fetchHostPhotos();
    }
  }, [isOpen, userId, remoteUserId]);
  
  // Auto-cycle host photos during calling/ringing
  useEffect(() => {
    if (hostPhotos.length <= 1 || isLiveConnected) return;
    const interval = setInterval(() => {
      setCurrentPhotoIndex(prev => (prev + 1) % hostPhotos.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [hostPhotos.length, isLiveConnected]);

  // Pkg83 LiveKit-Purist: in-call gift animations via LiveKit DataPacket.
  // REPLACES `call_gift_animations_${callId}` postgres_changes channel
  // (which was UNFILTERED — every gift INSERT on the platform hit every
  // active-call client → catastrophic $1400-pattern read amplification).
  // Sender publishes via `publishGiftSent('call', callId, …)` in
  // GiftingService; receivers listen to `livekit-gift-sent` window event.
  useEffect(() => {
    if (!isOpen || !callId || !remoteUserId) return;
    mountedRef.current = true;

    const handler = (e: Event) => {
      const detail = (e as CustomEvent<GiftSentDetail>).detail;
      if (!detail || detail.scope !== 'call' || detail.id !== callId) return;
      // Only show gifts where I'm the receiver and remote is the sender.
      if (detail.senderId === userId) return; // sender already showed local anim
      if (detail.receiverId && detail.receiverId !== userId) return;
      if (detail.senderId !== remoteUserId) return;
      if (!mountedRef.current) return;

      warmGiftForInstantPlay({
        icon_url: detail.giftIconUrl || null,
        animation_url: detail.giftAnimationUrl || null,
        animation_format: detail.giftAnimationFormat || null,
        animation_config_url: detail.giftAnimationConfigUrl || null,
        sound_url: detail.giftSoundUrl || null,
      } as any);
      playSound('gift');
      hapticFeedback('gift');

      addFlyingGift({
        senderId: detail.senderId,
        senderName: detail.senderName || "User",
        senderAvatar: detail.senderAvatar || undefined,
        receiverName: remoteUserName,
        giftName: detail.giftName || 'Gift',
        giftIcon: "🎁",
        giftImageUrl: detail.giftIconUrl || undefined,
        animationUrl: detail.giftAnimationUrl || detail.giftIconUrl || undefined,
        animationFormat: detail.giftAnimationFormat || null,
        animationConfigUrl: detail.giftAnimationConfigUrl || undefined,
        soundUrl: detail.giftSoundUrl || undefined,
        giftColor: "bg-pink-500/50",
        count: detail.count || 1,
        coins: detail.giftCoins || 0,
        isReceiverGift: true,
        beansEarned: detail.receiverBeans ?? undefined,
      });
      // Unified chat trace — same canonical InlineGiftRow as DM/Live/Party
      setChatMessages((prev) => [
        ...prev,
        {
          id: `gift-recv-${detail.senderId}-${Date.now()}`,
          senderId: detail.senderId,
          senderName: detail.senderName || 'User',
          message: encodeInlineGiftMarker({
            giftName: detail.giftName || 'Gift',
            count: detail.count || 1,
            coins: detail.giftCoins || 0,
            iconUrl: detail.giftIconUrl || '',
          }),
          timestamp: Date.now(),
        },
      ]);
      if ((detail.receiverBeans || 0) > 0) {
        window.dispatchEvent(new CustomEvent('own-beans-updated', {
          detail: { userId, beansDelta: Number(detail.receiverBeans || 0) },
        }));
      }
    };

    window.addEventListener('livekit-gift-sent', handler as EventListener);
    return () => {
      mountedRef.current = false;
      window.removeEventListener('livekit-gift-sent', handler as EventListener);
    };
  }, [isOpen, callId, remoteUserId, userId, remoteUserName, addFlyingGift, playSound]);

  // Phase 3 Step 3 — Low-balance + force-end signals from server billing tick.
  // Viewer (caller) only sees the warning banner; host doesn't need recharge CTA.
  const callSignal = useCallSignaling(callId);
  useEffect(() => {
    if (callSignal.forceEnded && isOpen) {
      try { toast.error('Call ended: ' + (callSignal.forceEndReason === 'insufficient_balance' ? 'insufficient balance' : 'connection ended')); } catch { /* noop */ }
      Promise.resolve(onEndCall()).catch(() => { /* noop */ });
    }
  }, [callSignal.forceEnded, callSignal.forceEndReason, isOpen, onEndCall]);

  const handleRechargeFromBanner = useCallback(() => {
    try { hapticFeedback('light'); } catch { /* noop */ }
    // Navigate without unmounting via SPA history when possible.
    if (typeof window !== 'undefined') {
      window.location.assign('/recharge');
    }
  }, []);

  // Format helpers

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const formatCoins = (coins: number) => {
    if (coins >= 1000) return `${(coins / 1000).toFixed(1)}K`;
    return coins.toString();
  };

  // Gift sending via unified gifting service (single source of truth)
  const handleSendGift = async (gift: GiftData, count: number) => {
    if (!userId || !remoteUserId) return;
    // Section#5 pass-3 (Bug M): swallow duplicate rapid taps.
    if (sendingGiftRef.current) return;

    const totalCost = gift.coins * count;
    const availableCoins = userCoinsRef.current;
    if (availableCoins < totalCost) {
      toast.error("Not enough diamonds!");
      return;
    }

    const previousCoins = availableCoins;
    sendingGiftRef.current = true;

    try {
      // Optimistic local balance update for this screen only.
      // Pkg85 made GiftingService the single source for global cached balance
      // deduction after the RPC succeeds. Do NOT also update useUserBalance here,
      // or call gifts double-deduct the app-wide diamond cache.
      userCoinsRef.current = Math.max(0, availableCoins - totalCost);
      setUserCoins(userCoinsRef.current);
      hapticFeedback('gift');
      warmGiftForInstantPlay(gift as any);


      // Show local animation immediately; the receiver gets the LiveKit packet
      // from sendGift's optimistic path without waiting for the DB round-trip.
      addFlyingGift({
        senderId: userId,
        senderName: "You",
        giftName: gift.name,
        giftIcon: "🎁",
        giftImageUrl: gift.icon_url || undefined,
        animationUrl: gift.animation_url || gift.icon_url || undefined,
        animationFormat: gift.animation_format || null,
        animationConfigUrl: gift.animation_config_url || undefined,
        soundUrl: gift.sound_url || undefined,
        giftColor: "bg-pink-500/50",
        count,
        coins: gift.coins,
        isOwnGift: true,
      });
      // Unified chat trace — same canonical InlineGiftRow as DM/Live/Party
      setChatMessages((prev) => [
        ...prev,
        {
          id: `gift-send-${Date.now()}`,
          senderId: userId,
          senderName: myDisplayName || 'You',
          message: encodeInlineGiftMarker({
            giftName: gift.name,
            count,
            coins: gift.coins,
            iconUrl: gift.icon_url || '',
          }),
          timestamp: Date.now(),
        },
      ]);
      playSound('gift');

      const result = await sendGift({
        giftId: gift.id,
        gift,
        senderId: userId,
        receiverId: remoteUserId,
        quantity: count,
        context: 'call',
        callId: callId || undefined,
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to send gift');
      }

      setShowGiftPanel(false);
    } catch (error) {
      console.error("Gift send error:", error);
      // Rollback optimistic update
      userCoinsRef.current = previousCoins;
      setUserCoins(previousCoins);
      toast.error("Failed to send gift");
    } finally {
      // Small cooldown to absorb mechanical double-tap; the GiftPanel itself
      // also has its own guard, but this is the last line of defense.
      setTimeout(() => { sendingGiftRef.current = false; }, 250);
    }
  };
  const handleEndCall = async () => {
    // Section#5 pass-3 (Bug J): block double-tap so onEndCall (and its
    // downstream Telecom + billing finalize) only fires once.
    if (endingRef.current) return;
    endingRef.current = true;
    setCallEnded(true);
    // BUG-2 fix: previously called `proCamera.release()` here for an
    // "immediate" slot drop, but useProCamera's useEffect cleanup ALSO
    // calls release on unmount. Both firing for the same owner decrements
    // the ref-count by 2 (from 2 → 0), prematurely clearing the family
    // while CallProvider's prejoin ref is still logically alive. Rely on
    // the hook's cleanup as the single source of truth — the CallEnded
    // modal unmount is the same tick window in practice.
    // Finalize app/server/native call state first, then tear down LiveKit.
    // This prevents double-end races where LiveKit closes early and the
    // provider loses the chance to settle billing/notifications cleanly.
    try {
      await Promise.resolve(onEndCall());
    } catch (error) {
      console.warn('[ActiveCall] endCall finalize failed:', error);
    } finally {
      // Release camera/native renderers after finalize attempt so the screen
      // never stays visually "running" after hangup, even on network failure.
      try { cleanup(); } catch { /* noop */ }
    }
  };
  useEffect(() => {
    if (!isOpen || callEnded || endingRef.current) return;
    if (connectionState === 'failed' || connectionState === 'closed') {
      console.log('[ActiveCall] ☠️ LiveKit (Android native) died - auto-ending call (NO reconnect)');
      handleEndCall();
    }
  }, [connectionState, isOpen, callEnded]);

  // Enhanced Privacy Protection - Screen Recording & Screenshot Prevention
  // ✅ Native FLAG_SECURE + Web CSS protection
  useEffect(() => {
    if (isOpen) {
      // Screen black-out protection disabled by request (no app-wide black behavior)
      
      // Add CSS class for screenshot prevention
      document.body.classList.add('no-screenshot');
      
      // Prevent right-click
      const preventContextMenu = (e: MouseEvent) => {
        e.preventDefault();
        setShowPrivacyWarning(true);
        setTimeout(() => setShowPrivacyWarning(false), 2000);
      };
      document.addEventListener('contextmenu', preventContextMenu);

      // Prevent screenshot keyboard shortcuts
      const preventScreenshot = (e: KeyboardEvent) => {
        if (
          e.key === 'PrintScreen' ||
          (e.ctrlKey && e.shiftKey && e.key === 'S') ||
          (e.metaKey && e.shiftKey && (e.key === '3' || e.key === '4' || e.key === '5')) ||
          (e.altKey && e.key === 'PrintScreen') ||
          (e.ctrlKey && e.key === 'p') ||
          (e.metaKey && e.key === 'p')
        ) {
          e.preventDefault();
          e.stopPropagation();
          setShowPrivacyWarning(true);
          setTimeout(() => setShowPrivacyWarning(false), 2000);
          return false;
        }
      };
      document.addEventListener('keydown', preventScreenshot, true);
      document.addEventListener('keyup', preventScreenshot, true);

      // Detect visibility changes (potential screen recording)
      const handleVisibilityChange = () => {
        if (document.hidden) {
          console.log('[Privacy] Screen may be recording - app went to background');
        }
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);

      // Prevent drag and drop
      const preventDrag = (e: DragEvent) => {
        e.preventDefault();
      };
      document.addEventListener('dragstart', preventDrag);
      document.addEventListener('drop', preventDrag);

      // Block media capture API detection
      const originalGetDisplayMedia = navigator.mediaDevices?.getDisplayMedia;
      if (navigator.mediaDevices && originalGetDisplayMedia) {
        navigator.mediaDevices.getDisplayMedia = async () => {
          setShowPrivacyWarning(true);
          setTimeout(() => setShowPrivacyWarning(false), 2000);
          throw new Error('Screen sharing is disabled during private calls');
        };
      }

      // Add secure overlay style
      const style = document.createElement('style');
      style.id = 'secure-call-style';
      style.textContent = `
        [data-room-shell="call"] video {
          -webkit-touch-callout: none;
          -webkit-user-select: none;
          user-select: none;
          pointer-events: none;
        }
        [data-room-shell="call"]::before {
          content: '';
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          pointer-events: none;
          z-index: 99999;
          background: transparent;
        }
        @media print {
          [data-room-shell="call"] * {
            display: none !important;
          }
        }
      `;
      document.head.appendChild(style);

      return () => {
        document.body.classList.remove('no-screenshot');
        document.removeEventListener('contextmenu', preventContextMenu);
        document.removeEventListener('keydown', preventScreenshot, true);
        document.removeEventListener('keyup', preventScreenshot, true);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        document.removeEventListener('dragstart', preventDrag);
        document.removeEventListener('drop', preventDrag);
        
        if (navigator.mediaDevices && originalGetDisplayMedia) {
          navigator.mediaDevices.getDisplayMedia = originalGetDisplayMedia;
        }
        
        const styleEl = document.getElementById('secure-call-style');
        if (styleEl) styleEl.remove();
        
        // Turn off native security after call ends to avoid global black-screen behavior
        void ScreenSecuritySDK.disableSecureMode();
      };
    }
  }, [isOpen]);

  // Swap video views
  const handleSwapVideos = () => {
    setIsSwapped(!isSwapped);
  };

  // Pkg501 — Native chat bridge.
  // 1) Forward EVERY accepted incoming peer chat msg into the native
  //    PrivateCallActivity chat overlay (no-op on old APKs / web).
  // 2) Listen for `native-call-chat-send` events fired by the native
  //    composer and publish them via the SAME LiveKit DataPacket path
  //    so transport remains the single source of truth.
  useEffect(() => {
    if (!callId || !isOpen) return;
    let detach: (() => void) | null = null;
    const onPeer = (e: Event) => {
      const detail = (e as CustomEvent<ChatMessageDetail>).detail;
      if (!detail || detail.scope !== 'call' || detail.id !== callId) return;
      if (!nativeInCallOpen) return;
      void NativeCall.pushChatMessage({
        callId,
        messageId: detail.messageId,
        userId: detail.userId,
        displayName: detail.displayName,
        avatarUrl: detail.avatarUrl ?? null,
        message: detail.message,
        isSelf: detail.userId === userId,
        timestamp: detail.timestamp || Date.now(),
      }).catch(() => { /* old APK no-op */ });
    };
    window.addEventListener('livekit-chat-message', onPeer as EventListener);
    (async () => {
      try {
        const handle = await NativeCall.addListener('native-call-chat-send', (ev) => {
          if (!ev || ev.callId !== callId || !ev.text?.trim()) return;
          const msg = {
            id: ev.clientId || `${ev.ts}-${userId}`,
            senderId: userId || '',
            senderName: myDisplayName,
            message: ev.text.trim(),
            timestamp: ev.ts || Date.now(),
          };
          setChatMessages((prev) => [...prev, msg]);
          checkToxic(ev.text, { contextType: 'call', callId }).catch(() => {});
          void publishChatMessage('call', callId, {
            messageId: msg.id,
            userId: userId || '',
            displayName: myDisplayName,
            message: ev.text.trim(),
            messageType: 'text',
            timestamp: msg.timestamp,
          }).catch(() => { /* non-fatal */ });
          // Echo own msg back into native overlay too so the user sees
          // their own bubble immediately.
          void NativeCall.pushChatMessage({
            callId,
            messageId: msg.id,
            userId: userId || '',
            displayName: myDisplayName,
            avatarUrl: myAvatarUrl,
            message: ev.text.trim(),
            isSelf: true,
            timestamp: msg.timestamp,
          }).catch(() => {});
        });
        detach = () => { try { handle.remove(); } catch { /* ignore */ } };
      } catch { /* listener API missing on old APK — fine */ }
    })();
    return () => {
      window.removeEventListener('livekit-chat-message', onPeer as EventListener);
      detach?.();
    };
  }, [callId, isOpen, userId, myDisplayName, myAvatarUrl, nativeInCallOpen, checkToxic]);

  // Pkg83 LiveKit-Purist: in-call chat via LiveKit DataPacket (Pkg79 chat
  // signaling, scope='call'). REPLACES `call-chat-${callId}` Supabase
  // broadcast channel — useLiveKitCall already registers the call Room
  // for chat scope, so we just listen here.
  useEffect(() => {
    if (!callId || !isOpen) return;

    const handler = (e: Event) => {
      const detail = (e as CustomEvent<ChatMessageDetail>).detail;
      if (!detail || detail.scope !== 'call' || detail.id !== callId) return;
      if (detail.userId === userId) return; // already shown locally on send
      setChatMessages((prev) => [
        ...prev,
        {
          id: detail.messageId,
          senderId: detail.userId,
          senderName: detail.displayName || 'User',
          message: detail.message,
          timestamp: detail.timestamp || Date.now(),
        },
      ]);
    };

    window.addEventListener('livekit-chat-message', handler as EventListener);
    return () => {
      window.removeEventListener('livekit-chat-message', handler as EventListener);
    };
  }, [callId, isOpen, userId]);

  const sendChatMessage = async () => {
    const text = chatInput.trim();
    if (!text || !callId || !userId) return;

    const msg = {
      id: `${Date.now()}-${userId}`,
      senderId: userId,
      senderName: myDisplayName,
      message: text,
      timestamp: Date.now(),
    };

    setChatMessages((prev) => [...prev, msg]);
    setChatInput("");

    // 🔥 AWS Comprehend toxic content moderation (background)
    checkToxic(text, { contextType: 'call', callId }).catch(() => {});

    // Pkg83: fan out via LiveKit DataPacket (chat scope='call').
    void publishChatMessage('call', callId, {
      messageId: msg.id,
      userId,
      displayName: myDisplayName,
      message: text,
      messageType: 'text',
      timestamp: msg.timestamp,
    }).catch(() => { /* non-fatal */ });
  };

  if (!isOpen || typeof document === 'undefined') return null;

  // X1+X2: surface auto-audio-only flips + 20-min hard reconnect abandon as
  // professional toasts. Headless; safe to mount unconditionally while open.
  const resilienceNotifier = (
    <LiveKitResilienceNotifier
      scope="call"
      id={callId ?? null}
      onRejoin={() => { Promise.resolve(onEndCall()).catch(() => {}); }}
    />
  );

  // Private calls are Android-native only. The hook also fails closed before
  // any web getUserMedia path can run.

  const callUi = (
    <div
      data-room-shell="call"
      className="fixed inset-0 z-[2147483600] isolate flex select-none overflow-hidden"
      style={{ 
        position: 'relative',
        userSelect: 'none', 
        WebkitUserSelect: 'none',
        contain: 'layout style paint',
        willChange: 'transform',
        width: '100vw',
        height: '100dvh',
        // Keep the accepted/connecting shell opaque and branded. Only the final
        // two-person media canvas is transparent so bounded Android TextureView
        // slots can show through; this prevents a raw native preview/fullscreen
        // surface from becoming the visible "third-class" UI during accept.
        background: (revealNativeConnectedCanvas && !callEnded) ? 'transparent' : '#050208',
      }}
    >
      <div
        className="absolute inset-0 bg-gradient-to-b from-[#050208] via-[#0d0520] to-[#080312]"
        style={{ opacity: revealNativeConnectedCanvas && !isPreviewWeb ? 0 : 1 }}
      />

      {callId && <CaptionOverlay scope="call" id={callId} hideToggle />}

      <AnimatePresence>
        {showPrivacyWarning && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-5 py-3 rounded-2xl bg-gradient-to-r from-red-600/90 to-rose-500/90 border border-red-400/30 shadow-2xl shadow-red-500/30"
          >
            <Lock className="w-5 h-5 text-white" />
            <span className="text-white text-sm font-semibold">Screen capture is not allowed</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Phase 3 Step 3 — viewer-only low-balance warning banner */}
      {!isHost && (
        <LowBalanceBanner
          visible={callSignal.lowBalance && !callSignal.forceEnded}
          severity={callSignal.severity}
          remainingMinutes={callSignal.remainingMinutes}
          onRecharge={handleRechargeFromBanner}
        />
      )}

      {/* JS P2 polish — reconnecting overlay (billing paused). Shown to both
          sides; the host benefits from knowing the freeze is transient too. */}
      <ReconnectingOverlay callId={callId} />




      {!isInNativePip && (
        <div 
          className="absolute top-0 left-0 right-0 z-[90] safe-area-top"
          style={{ contain: 'layout' }}
        >
          <div className="mx-2 sm:mx-3 mt-2 flex items-center justify-between gap-1.5 sm:gap-2">
            <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 sm:gap-2 px-2 py-1.5 sm:px-3 sm:py-2 rounded-full backdrop-blur-xl"
              style={{
                background: 'linear-gradient(135deg, rgba(0,0,0,0.55) 0%, rgba(30,15,55,0.65) 100%)',
                border: '1px solid rgba(255,255,255,0.14)',
                boxShadow: '0 8px 24px -8px rgba(168,85,247,0.35), inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -2px 6px rgba(0,0,0,0.35)',
              }}
            >
              {/* Live indicator dot */}
              <div className="relative">
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  isLiveConnected ? "bg-red-500" : "bg-amber-500"
                )}
                  style={{ boxShadow: isLiveConnected ? '0 0 8px rgba(239,68,68,0.7)' : '0 0 8px rgba(245,158,11,0.7)' }}
                />
                {isLiveConnected && (
                  <div className="absolute inset-0 w-2 h-2 rounded-full bg-red-500 animate-ping opacity-75" />
                )}
              </div>

              {/* Remote user avatar mini (with frame) */}
              <AvatarWithFrame
                userId={remoteUserId}
                src={remoteUserAvatar}
                name={remoteUserName}
                level={remoteUserLevel}
                size="xxs"
                showFrame={true}
                showAnimation={false}
              />

              <div className="flex flex-col leading-tight">
                <span
                  className="text-white text-[10px] sm:text-[11px] font-extrabold max-w-[64px] sm:max-w-[88px] truncate"
                  style={{ textShadow: '0 1px 2px rgba(0,0,0,0.55)' }}
                >
                  {remoteUserName}
                </span>
                <span className={cn(
                  "text-[9px] font-extrabold tracking-[0.12em] uppercase",
                  isLiveConnected ? "text-emerald-300" : "text-amber-300"
                )}
                  style={{ textShadow: '0 1px 1px rgba(0,0,0,0.5)' }}
                >
                  {connectionBadgeLabel}
                </span>
            </div>
          </div>
          </div>

          {/* Center - Duration timer */}
          <div className="flex items-center gap-1 sm:gap-1.5 px-2.5 py-1.5 sm:px-3.5 sm:py-2 rounded-full backdrop-blur-xl shrink-0"
            style={{
              background: 'linear-gradient(135deg, rgba(0,0,0,0.55) 0%, rgba(20,8,40,0.6) 100%)',
              border: '1px solid rgba(255,255,255,0.12)',
              boxShadow: '0 8px 20px -8px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.16)',
            }}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"
              style={{ boxShadow: '0 0 8px rgba(239,68,68,0.75)' }}
            />
            <span
              className="text-white font-mono font-extrabold text-[11px] sm:text-xs tracking-[0.1em] sm:tracking-[0.14em] tabular-nums"
              style={{ textShadow: '0 1px 2px rgba(0,0,0,0.55)' }}
            >
              {formatDuration(duration)}
            </span>
          </div>

          {/* Right - Earnings/Coins + Connection */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {!isInNativePip && (
              <NetworkQualityIndicator 
                quality={networkQuality as any} 
                showLabel={false}
                className="mr-1"
              />
            )}
            {isHost ? (

              <div className="flex items-center gap-1 sm:gap-1.5 px-2 py-1.5 sm:px-3 sm:py-2 rounded-full backdrop-blur-xl"
                style={{
                  background: 'linear-gradient(135deg, rgba(245,158,11,0.28) 0%, rgba(234,88,12,0.22) 100%)',
                  border: '1px solid rgba(252,211,77,0.5)',
                  boxShadow: '0 8px 20px -6px rgba(245,158,11,0.45), inset 0 1px 0 rgba(255,255,255,0.35)',
                }}
              >
                <BeansIcon size={14} />
                <span
                  className="text-amber-100 font-extrabold text-xs tabular-nums"
                  style={{ textShadow: '0 1px 1px rgba(0,0,0,0.4)' }}
                >
                  +{formatCoins(displayedHostEarned)}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-2 rounded-full backdrop-blur-xl"
                style={{
                  background: 'linear-gradient(135deg, rgba(16,185,129,0.22) 0%, rgba(5,150,105,0.18) 100%)',
                  border: '1px solid rgba(110,231,183,0.45)',
                  boxShadow: '0 8px 18px -6px rgba(16,185,129,0.4), inset 0 1px 0 rgba(255,255,255,0.3)',
                }}
              >
                <ShieldCheck className="w-3 h-3 text-emerald-200" />
                <span
                  className="text-[9px] font-extrabold text-emerald-100 tracking-[0.14em] uppercase"
                  style={{ textShadow: '0 1px 1px rgba(0,0,0,0.4)' }}
                >
                  E2E
                </span>
              </div>
            )}

          </div>
        </div>
      </div>
      )}

      {/* ===== MAIN VIDEO VIEW ===== */}
      <div 
        className="absolute inset-0 flex items-center justify-center"
        style={{ contain: 'layout' }}
      >
        {/* ===== CALLING/RINGING STATE: Show local camera feed immediately ===== */}
        {!isLiveConnected && (
          <div className="absolute inset-0 z-[2]">
            {/* Show local camera feed as background during calling/ringing */}
            {localVideoTrack ? (
              <div className="absolute inset-0">
                <LiveKitVideoPlayer
                  videoTrack={localVideoTrack}
                  mirror={true}
                  fit="cover"
                  className="w-full h-full"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/50" />
              </div>
            ) : isPreviewWeb && previewStream ? (
              <div className="absolute inset-0">
                <video
                  ref={(el) => attachPreview(el, 'ringing')}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover bg-transparent"
                  style={{ transform: 'scaleX(-1)' }}
                />
                <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/50" />
              </div>
            ) : (
              <div className="absolute inset-0">
                <div
                  className={cn(
                    "absolute inset-0 overflow-hidden",
                    shouldExposeNativePreview ? "bg-transparent" : "bg-gradient-to-br from-[#1a0526] via-[#230733] to-[#07020d]"
                  )}
                >
                  {!shouldExposeNativePreview && remoteUserAvatar && (
                    <>
                      <img
                        src={remoteUserAvatar}
                        alt=""
                        aria-hidden="true"
                        className="absolute inset-0 w-full h-full object-cover opacity-35 blur-2xl scale-110"
                      />
                      <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/45 to-black/70" />
                    </>
                  )}
                  {!shouldExposeNativePreview && (
                    <div className="absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fuchsia-500/20 blur-3xl" />
                  )}
                </div>
              </div>
            )}
            
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-[3]">
              <AvatarWithFrame
                userId={remoteUserId}
                src={remoteUserAvatar}
                name={remoteUserName}
                level={remoteUserLevel}
                size="xl"
                showFrame={true}
                showAnimation={false}
              />
              <h2
                className="text-white text-2xl font-extrabold mt-4 tracking-wide"
                style={{ textShadow: '0 2px 8px rgba(0,0,0,0.6)' }}
              >
                {remoteUserName}
              </h2>
              {(callStatus === 'ringing' || callStatus === 'calling') && (
                <div className="flex items-center gap-2 mt-2.5 px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15"
                  style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2), 0 4px 12px rgba(0,0,0,0.35)' }}
                >
                  <div className="flex gap-1">
                    {[0,1,2].map(i => (
                      <div key={i} className="w-1.5 h-1.5 rounded-full bg-white animate-bounce" style={{ animationDelay: `${i * 0.15}s`, boxShadow: '0 0 4px rgba(255,255,255,0.6)' }} />
                    ))}
                  </div>
                  <span className="text-white/90 text-xs font-bold tracking-wide">
                    {callStatus === 'ringing' ? 'Ringing...' : 'Calling...'}
                  </span>
                </div>
              )}
              {isHost && (
                <div className="flex items-center gap-2.5 mt-4 px-5 py-2.5 rounded-2xl border border-emerald-300/40 backdrop-blur-xl"
                  style={{
                    background: 'linear-gradient(135deg, rgba(16,185,129,0.28) 0%, rgba(5,150,105,0.2) 100%)',
                    boxShadow: '0 8px 22px -8px rgba(16,185,129,0.5), inset 0 1px 0 rgba(255,255,255,0.25)',
                  }}
                >
                  <TrendingUp className="w-4 h-4 text-emerald-200" />
                  <BeansIcon size={18} />
                  <span className="text-emerald-200 text-lg font-bold">{formatCoins(displayedHostEarned)}</span>
                </div>
              )}
            </div>

            {/* Native local preview is allowed only as a bounded PiP, never as
                the full-screen background while accepting/connecting. */}
            {showNativeLocalSurface && !isInNativePip && (
              <motion.div
                whileTap={{ scale: 0.93 }}
                onClick={handleSwapVideos}
                className="absolute top-20 sm:top-24 right-3 sm:right-4 w-[92px] h-[130px] sm:w-[110px] sm:h-[155px] rounded-2xl overflow-hidden border-2 border-white/30 z-[8] cursor-pointer bg-transparent"
                style={{
                  boxShadow:
                    '0 12px 30px -8px rgba(0,0,0,0.65), 0 4px 12px -2px rgba(168,85,247,0.35), inset 0 1px 0 rgba(255,255,255,0.25)',
                }}
              >
                <NativeVideoView kind="local" mirror={true} className="w-full h-full" />
                <div
                  className="absolute left-1.5 top-1.5 px-2 py-0.5 rounded-full text-[9px] font-extrabold text-white border border-white/20 backdrop-blur-md"
                  style={{
                    background: 'linear-gradient(135deg, rgba(0,0,0,0.6), rgba(30,15,55,0.55))',
                    textShadow: '0 1px 1px rgba(0,0,0,0.5)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18)',
                  }}
                >
                  You
                </div>
              </motion.div>
            )}
          </div>
        )}

        {/* ===== LIVE CONNECTED VIDEO LAYOUT - Vertical Top/Bottom ===== */}
        {isLiveConnected && (
          <div className="absolute inset-0 z-[3]">
            {/* Full-screen primary (remote) video */}
            <div className="absolute inset-0">
              {isSwapped && showNativeLocalSurface ? (
                <NativeVideoView kind="local" mirror={true} className="w-full h-full" />
              ) : !isSwapped && showNativeRemoteSurface && nativeRemoteSid ? (
                <NativeVideoView kind="remote" sid={nativeRemoteSid} className="w-full h-full" />
              ) : primaryHasVideo && primaryVideoTrack ? (
                <LiveKitVideoPlayer
                  videoTrack={primaryVideoTrack}
                  mirror={primaryMirror}
                  fit="cover"
                  className="w-full h-full"
                />

              ) : (
                <div className={cn(
                  "w-full h-full flex flex-col items-center justify-center",
                  isNativeMediaActive ? "bg-transparent" : "bg-gradient-to-br from-[#17051f] via-[#0b0312] to-[#050208]"
                )}>
                  {/* Pkg381: No large user icon in call — use blurred avatar as background fallback only */}
                  { !isNativeMediaActive && (isSwapped ? myAvatarUrl : remoteUserAvatar) && (
                    <img loading="lazy" decoding="async" 
                      src={enhanceThumbnail(isSwapped ? myAvatarUrl : remoteUserAvatar, { width: 64, quality: 60 })} 
                      alt="" 
                      className="absolute inset-0 w-full h-full object-cover opacity-20 blur-2xl"
 />
                  )}
                  <div className="relative z-10 flex flex-col items-center">
                    {(isSwapped ? myAvatarUrl : remoteUserAvatar) ? (
                      <img
                        src={enhanceThumbnail(isSwapped ? myAvatarUrl : remoteUserAvatar, { width: 160, quality: 86 })}
                        alt={isSwapped ? 'You' : remoteUserName}
                        className="w-24 h-24 rounded-full object-cover border-2 border-primary-foreground/35 shadow-2xl shadow-foreground/50"
                      />
                    ) : (
                      <div className="w-24 h-24 rounded-full border-2 border-primary-foreground/25 bg-primary-foreground/10 flex items-center justify-center text-3xl font-bold text-on-dark">
                        {(isSwapped ? 'Y' : remoteUserName?.charAt(0) || 'U').toUpperCase()}
                      </div>
                    )}
                    <div className="mt-4 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-white/85 text-xs font-semibold backdrop-blur-md">
                      Connecting…
                    </div>
                  </div>
          </div>
        )}

        {/* ===== PREVIEW-ONLY camera mirror (Lovable web) ===== */}
        {isPreviewWeb && previewStream && (
          <>
            <video
              ref={(el) => attachPreview(el, 'primary')}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover bg-transparent z-[4]"
              style={{ transform: 'scaleX(-1)' }}
            />
            <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[6] px-3 py-1 rounded-full text-[10px] font-bold tracking-wide bg-amber-500/90 text-black border border-amber-200/60 shadow-lg">
              PREVIEW MODE — your camera mirrored to both tiles
            </div>
            <motion.div
              whileTap={{ scale: 0.93 }}
              onClick={handleSwapVideos}
              className="absolute top-20 sm:top-24 right-3 sm:right-4 w-[92px] h-[130px] sm:w-[110px] sm:h-[155px] rounded-2xl overflow-hidden border-2 border-white/30 z-[7] cursor-pointer bg-black"
              style={{
                boxShadow:
                  '0 12px 30px -8px rgba(0,0,0,0.65), 0 4px 12px -2px rgba(168,85,247,0.35), inset 0 1px 0 rgba(255,255,255,0.25)',
              }}
            >
              <video
                ref={(el) => attachPreview(el, 'pip')}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover bg-black"
                style={{ transform: 'scaleX(-1)' }}
              />
              <div className="absolute left-1.5 top-1.5 px-2 py-0.5 rounded-full text-[9px] font-extrabold text-white border border-white/20 backdrop-blur-md bg-black/60">
                You
              </div>
            </motion.div>
          </>
        )}
      </div>

            {/* PIP secondary (local) video - tap to swap */}
            <motion.div
              whileTap={{ scale: 0.93 }}
              onClick={handleSwapVideos}
              className="absolute top-20 sm:top-24 right-3 sm:right-4 w-[92px] h-[130px] sm:w-[110px] sm:h-[155px] rounded-2xl overflow-hidden border-2 border-white/30 z-10 cursor-pointer"
              style={{
                boxShadow:
                  '0 12px 30px -8px rgba(0,0,0,0.65), 0 4px 12px -2px rgba(168,85,247,0.35), inset 0 1px 0 rgba(255,255,255,0.25)',
              }}
            >
              {!isSwapped && showNativeLocalSurface ? (
                <NativeVideoView kind="local" mirror={true} className="w-full h-full" />
              ) : isSwapped && showNativeRemoteSurface && nativeRemoteSid ? (
                <NativeVideoView kind="remote" sid={nativeRemoteSid} className="w-full h-full" />
              ) : secondaryHasVideo && secondaryVideoTrack ? (
                <LiveKitVideoPlayer
                  videoTrack={secondaryVideoTrack}
                  mirror={secondaryMirror}
                  fit="cover"
                  className="w-full h-full"
                />
              ) : (
                <div className={cn(
                  "w-full h-full flex flex-col items-center justify-center",
                  isNativeMediaActive ? "bg-transparent" : "bg-gradient-to-br from-[#0c0818] via-[#050208] to-black"
                )}>
                  { !isNativeMediaActive && (isSwapped ? remoteUserAvatar : myAvatarUrl) && (
                    <img loading="lazy" decoding="async"
                      src={enhanceThumbnail(isSwapped ? remoteUserAvatar : myAvatarUrl, { width: 64, quality: 60 })}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover opacity-20 blur-lg"
 />
                  )}
                  <div className="w-1 h-1 rounded-full bg-white/30 animate-pulse" />
                </div>
              )}
              <div
                className="absolute left-1.5 top-1.5 px-2 py-0.5 rounded-full text-[9px] font-extrabold text-white border border-white/20 backdrop-blur-md"
                style={{
                  background: 'linear-gradient(135deg, rgba(0,0,0,0.6), rgba(30,15,55,0.55))',
                  textShadow: '0 1px 1px rgba(0,0,0,0.5)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18)',
                }}
              >
                {secondaryLabel}
              </div>
            </motion.div>
          </div>
        )}
      </div>

      {/* ===== INLINE CHAT MESSAGES (positioned above bottom controls) ===== */}
      {chatMessages.length > 0 && !isInNativePip && (
        <div
          ref={callChatScroll.scrollRef}
        className="absolute left-2 sm:left-3 right-[108px] sm:right-16 z-[90] max-h-[36vh] sm:max-h-[40vh] overflow-y-auto chat-scroll-stable"
          style={{ bottom: 'calc(var(--kb-h, 0px) + 108px)', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}
        >
          <div className="space-y-1.5 pb-1">
            {chatMessages.slice(-30).map((msg) => {
              const isMe = msg.senderId === userId;
              const giftMarker = parseInlineGiftMarker(msg.message);

              // Unified inline gift row (canonical, same as DM/Live/Party)
              if (giftMarker) {
                return (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex justify-start"
                  >
                    <InlineGiftRow
                      senderName={msg.senderName}
                      giftName={giftMarker.giftName}
                      giftIconUrl={giftMarker.iconUrl || undefined}
                      count={giftMarker.count}
                      coins={giftMarker.coins}
                      isSelf={isMe}
                      surface="overlay"
                      compact
                    />
                  </motion.div>
                );
              }

              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex justify-start"
                >
                  <RoomChatBubble
                    id={msg.id}
                    userName={msg.senderName}
                    userLevel={isMe ? myLevel : remoteUserLevel}
                    message={msg.message}
                    type="message"
                    isHost={isMe && isHost}
                    createdAt={msg.timestamp}
                  />
                </motion.div>
              );
            })}
          </div>
        </div>
      )}




      {/* Three dot menu - positioned on right side above bottom bar */}
      <AnimatePresence>
        {showMoreMenu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 20 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            className="absolute bottom-24 right-3 z-[100] backdrop-blur-xl"
            style={{
              background: 'linear-gradient(135deg, rgba(0,0,0,0.85) 0%, rgba(25,12,50,0.88) 100%)',
              border: '1px solid rgba(255,255,255,0.18)',
              borderRadius: '20px',
              padding: '8px',
              minWidth: '180px',
              boxShadow: '0 18px 44px -10px rgba(0,0,0,0.7), 0 0 24px rgba(168,85,247,0.18), inset 0 1px 0 rgba(255,255,255,0.16)',
            }}
          >
            <button onClick={() => { toggleAudio(); setShowMoreMenu(false); }} className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-white/90 hover:bg-white/10 active:bg-white/15 transition-all">
              {isAudioEnabled ? <Mic className="w-5 h-5 text-emerald-300" /> : <MicOff className="w-5 h-5 text-red-300" />}
              <span className="text-xs font-bold tracking-wide">{isAudioEnabled ? 'Mute' : 'Unmute'}</span>
            </button>
            <button onClick={() => { handleSwapVideos(); setShowMoreMenu(false); }} className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-white/90 hover:bg-white/10 active:bg-white/15 transition-all">
              <Maximize2 className="w-5 h-5 text-cyan-300" />
              <span className="text-xs font-bold tracking-wide">Swap View</span>
            </button>
              <button onClick={() => { beauty.setShowBeautyPanel(true); setShowMoreMenu(false); }} className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-white/90 hover:bg-white/10 active:bg-white/15 transition-all">
                <Sparkles className="w-5 h-5 text-pink-300" />
                <span className="text-xs font-bold tracking-wide">Beauty</span>
              </button>
            {beauty.isNativeAndroid && (
              <button onClick={() => { void beauty.toggleSticker(); setShowMoreMenu(false); }} className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-white/90 hover:bg-white/10 active:bg-white/15 transition-all">
                <Smile className="w-5 h-5 text-orange-300" />
                <span className="text-xs font-bold tracking-wide">{beauty.stickerActive ? 'Remove Sticker' : 'Sticker'}</span>
              </button>
            )}
            <button onClick={() => { setIsSpeakerOn(!isSpeakerOn); setShowMoreMenu(false); }} className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-white/90 hover:bg-white/10 active:bg-white/15 transition-all">
              {isSpeakerOn ? <Volume2 className="w-5 h-5 text-amber-300" /> : <VolumeX className="w-5 h-5 text-red-300" />}
              <span className="text-xs font-bold tracking-wide">{isSpeakerOn ? 'Speaker On' : 'Speaker Off'}</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== BOTTOM BAR - Live Stream Style ===== */}
      {!isInNativePip && (
        <div className="absolute bottom-kb left-0 right-0 z-[90] safe-area-bottom chat-composer-stable">
          <div className="px-2 sm:px-3 pb-3 sm:pb-4 pt-2">
          {/* Chat input row (always visible like live stream) */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Message input pill */}
            <div className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2 sm:px-3.5 sm:py-2.5 rounded-full backdrop-blur-xl"
              style={{
                background: 'linear-gradient(135deg, rgba(0,0,0,0.5) 0%, rgba(25,12,50,0.5) 100%)',
                border: '1px solid rgba(255,255,255,0.14)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), 0 6px 16px -8px rgba(0,0,0,0.5)',
              }}
            >
              <input
                ref={chatInputRef}
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendChatMessage()}
                placeholder="Say something..."
                className="flex-1 bg-transparent text-white text-xs font-medium outline-none placeholder:text-white/40 min-w-0"
              />
              {chatInput.trim() && (
                <motion.button
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  whileTap={{ scale: 0.85 }}
                  onClick={sendChatMessage}
                  className="w-7 h-7 rounded-full flex items-center justify-center border border-white/25"
                  style={{
                    background: 'linear-gradient(135deg, #a855f7, #ec4899)',
                    boxShadow: '0 4px 12px -4px rgba(236,72,153,0.55), inset 0 1px 0 rgba(255,255,255,0.4)',
                  }}
                >
                  <Send className="w-3.5 h-3.5 text-white" style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.4))' }} />
                </motion.button>
              )}
            </div>

            {/* Call End button */}
            <motion.button
              whileTap={{ scale: 0.88, y: 0 }}
              whileHover={{ y: -2 }}
              onClick={handleEndCall}
              className="relative w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center shrink-0 overflow-hidden"
              style={{
                background: 'radial-gradient(120% 120% at 30% 20%, #fca5a5 0%, #ef4444 40%, #b91c1c 100%)',
                boxShadow: '0 10px 24px -6px rgba(239,68,68,0.65), 0 4px 10px -2px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.5), inset 0 -3px 8px rgba(0,0,0,0.3)',
                border: '1px solid rgba(252,165,165,0.45)',
              }}
              aria-label="End call"
            >
              <span aria-hidden className="pointer-events-none absolute inset-0 rounded-full"
                style={{ background: 'radial-gradient(60% 40% at 50% 18%, rgba(255,255,255,0.55), transparent 70%)' }} />
              <PhoneOff className="w-5 h-5 text-white relative" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }} />
            </motion.button>

            {/* Gift button */}
            <motion.button
              whileTap={{ scale: 0.88, y: 0 }}
              whileHover={{ y: -2 }}
              onClick={() => setShowGiftPanel(true)}
              className="relative w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center shrink-0 overflow-hidden"
              style={{
                background: 'radial-gradient(120% 120% at 30% 20%, #f9a8d4 0%, #ec4899 40%, #a855f7 100%)',
                boxShadow: '0 10px 24px -6px rgba(236,72,153,0.55), 0 4px 10px -2px rgba(168,85,247,0.35), inset 0 1px 0 rgba(255,255,255,0.5), inset 0 -3px 8px rgba(0,0,0,0.28)',
                border: '1px solid rgba(249,168,212,0.4)',
              }}
              aria-label="Send gift"
            >
              <span aria-hidden className="pointer-events-none absolute inset-0 rounded-full"
                style={{ background: 'radial-gradient(60% 40% at 50% 18%, rgba(255,255,255,0.5), transparent 70%)' }} />
              <BrandedGiftIcon className="w-7 h-7 relative rounded-md" />
            </motion.button>

            {/* Three dot menu */}
            <motion.button
              whileTap={{ scale: 0.88, y: 0 }}
              whileHover={{ y: -2 }}
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              className="w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center shrink-0 backdrop-blur-xl"
              style={{
                background: 'linear-gradient(135deg, rgba(0,0,0,0.55) 0%, rgba(25,12,50,0.55) 100%)',
                border: '1px solid rgba(255,255,255,0.18)',
                boxShadow: '0 8px 20px -8px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.2)',
              }}
            >
              <MoreVertical className="w-5 h-5 text-white/85" />
            </motion.button>
          </div>
        </div>
      </div>
    )}

      <GiftPanel
        isOpen={showGiftPanel}
        onClose={() => setShowGiftPanel(false)}
        onSendGift={handleSendGift}
        userCoins={userCoins}
      />
      
      {/* Flying Gift Animations */}
      <AnimatePresence>
        {flyingGifts.map((gift, idx) => (
          <FlyingGiftAnimation
            key={gift.id}
            gift={gift}
            stackIndex={idx}
            onComplete={() => removeFlyingGift(gift.id)}
          />
        ))}
      </AnimatePresence>

      {/* Beauty Filter Panel */}
      <BeautyFilterPanel
        isOpen={beauty.showBeautyPanel}
        onClose={() => beauty.setShowBeautyPanel(false)}
        settings={beauty.beautySettings}
        enabled={beauty.beautyEnabled}
        onSettingsChange={beauty.handleBeautySettingsChange}
        onEnabledChange={beauty.handleBeautyEnabledChange}
      />
      <StickerOverlay stickerName={beauty.activeSticker} onDismiss={() => beauty.handleStickerChange(null)} />
    </div>
  );

  return createPortal(
    <RequireNativeAndroidGate feature="call">
      {resilienceNotifier}
      {callUi}
    </RequireNativeAndroidGate>,
    document.body,
  );
};
