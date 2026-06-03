import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useContentModeration } from "@/hooks/useContentModeration";
import { createPortal } from "react-dom";
import { isNativeAndroidApp } from "@/utils/nativeUtils";
import RequireNativeAndroidGate from "@/components/native/RequireNativeAndroidGate";
import { PhoneOff, Mic, MicOff, Eye, EyeOff, Gift, Volume2, VolumeX, Maximize2, Minimize2, TrendingUp, SwitchCamera, ShieldCheck, Lock, MessageCircle, MoreVertical, Send, Sparkles, Smile } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useLiveKitCall } from "@/hooks/useLiveKitCall";
import { useProCamera } from "@/camera/useProCamera";
import { useNativeAndroidPip } from "@/hooks/useNativeAndroidPip";
import { useBeautyState } from "@/hooks/useBeautyState";
import { BeautyFilterPanel } from "@/components/live/BeautyFilterPanel";
import StickerOverlay from "@/components/live/StickerOverlay";

import AvatarWithFrame from "@/components/common/AvatarWithFrame";
import { LiveKitVideoPlayer } from "@/components/live/LiveKitVideoPlayer";
import { PictureInPictureButton } from "@/components/livekit/PictureInPictureButton";
import { AudioOnlyToggleButton } from "@/components/livekit/AudioOnlyToggleButton";
import { VideoQualityButton } from "@/components/livekit/VideoQualityButton";
import { GiftPanel, GiftData, FlyingGiftAnimation, FlyingGift, useFlyingGifts, sendGift } from "@/features/shared/gifting";
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
}: ActiveCallScreenProps) {
  // Pkg416 — claim the single professional camera for private-call. If
  // face-verify holds the camera (verification family), this returns a
  // conflict error and we surface a friendly toast instead of starting
  // LiveKit (which would otherwise hit a Camera2 ownership race and show
  // a permanent white preview).
  const proCamera = useProCamera('private-call', isOpen);
  useEffect(() => {
    if (proCamera.error) {
      toast.error('Camera is busy with face verification. Please finish that first.');
      // Pkg418 hard gate: end the call so LiveKit never tries to claim
      // the camera while verification holds it.
      try { onEndCall?.(); } catch { /* ignore */ }
    }
  }, [proCamera.error, onEndCall]);

  // REAL native beauty integration (Pkg417 — actually drives GPUPixel now)
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
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const [myDisplayName, setMyDisplayName] = useState<string>("You");
  const [myAvatarUrl, setMyAvatarUrl] = useState<string | null>(null);
  const [myLevel, setMyLevel] = useState<number>(1);
  
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

  // WebRTC hook
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
    cleanup,
  } = useLiveKitCall(isOpen ? callId : null, userId, isHost);

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
  const showNativeCallSurface = isNativeMediaActive && isConnected && !localVideoTrack && !remoteVideoTrack;
  const showNativeCallingSurface = isNativeMediaActive && !localVideoTrack;
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
  const isLiveConnected = callStatus === 'connected' && isConnected;
  const connectionBadgeLabel = isLiveConnected ? 'LIVE' : callStatus === 'ringing' ? 'RINGING' : callStatus === 'calling' ? 'DIALING' : 'SYNC';
  const connectionBadgeTone = isLiveConnected ? 'text-emerald-300' : 'text-amber-300';

  // Pkg207 — Auto-shrink to native Android PiP when user presses home
  // mid-call (WhatsApp / Google Meet parity). 9:16 for video calls, 1:1
  // for audio-only. inPip flips true while in floating window — use it
  // to collapse the heavy chat / gift / settings overlays below.
  const { inPip: isInNativePip } = useNativeAndroidPip({
    active: isOpen && callStatus === 'connected' && !callEnded,
    aspect: '9:16',
  });



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

      playSound('gift');
      addFlyingGift({
        senderId: detail.senderId,
        senderName: detail.senderName || "User",
        senderAvatar: detail.senderAvatar || undefined,
        receiverName: remoteUserName,
        giftName: detail.giftName || 'Gift',
        giftIcon: "🎁",
        giftImageUrl: detail.giftIconUrl || undefined,
        animationUrl: detail.giftAnimationUrl || detail.giftIconUrl || undefined,
        soundUrl: detail.giftSoundUrl || undefined,
        giftColor: "bg-pink-500/50",
        count: detail.count || 1,
        coins: detail.giftCoins || 0,
        isReceiverGift: true,
        beansEarned: detail.receiverBeans ?? undefined,
      });
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

      const result = await sendGift({
        giftId: gift.id,
        senderId: userId,
        receiverId: remoteUserId,
        quantity: count,
        context: 'call',
        callId: callId || undefined,
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to send gift');
      }

      // Show local animation for sender immediately
      addFlyingGift({
        senderId: userId,
        senderName: "You",
        giftName: gift.name,
        giftIcon: "🎁",
        giftImageUrl: gift.icon_url || undefined,
        animationUrl: gift.animation_url || gift.icon_url || undefined,
        soundUrl: gift.sound_url || undefined,
        giftColor: "bg-pink-500/50",
        count,
        coins: gift.coins,
        isOwnGift: true,
      });

      setShowGiftPanel(false);
      playSound('gift');
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
    // End immediately on both sides, but keep the LiveKit room registered until
    // CallProvider publishes the hangup packet. Cleaning media first unregisters
    // the room and makes the peer wait for DB realtime instead of instant close.
    try {
      await Promise.resolve(onEndCall());
    } finally {
      cleanup();
    }
  };
  useEffect(() => {
    if (!isOpen || callEnded) return;
    if (connectionState === 'failed' || connectionState === 'closed') {
      console.log('[ActiveCall] ☠️ WebRTC died - auto-ending call (NO reconnect)');
      handleEndCall();
    }
  }, [connectionState, isOpen, callEnded]);

  // Enhanced Privacy Protection - Screen Recording & Screenshot Prevention
  // ✅ Native FLAG_SECURE + Web CSS protection
  useEffect(() => {
    if (isOpen) {
      // Screen black-out protection disabled by request (no app-wide black behavior)
      
      // Add CSS class for screenshot prevention
      document.body.classList.add('no-screenshot', 'secure-call');
      
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
        .secure-call video {
          -webkit-touch-callout: none;
          -webkit-user-select: none;
          user-select: none;
          pointer-events: none;
        }
        .secure-call::before {
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
          .secure-call * {
            display: none !important;
          }
        }
      `;
      document.head.appendChild(style);

      return () => {
        document.body.classList.remove('no-screenshot', 'secure-call');
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

  // Auto-scroll chat
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

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

  // Browser calling enabled — web uses LiveKit web SDK + getUserMedia,
  // native Android still uses the native LiveKit plugin (handled inside
  // useLiveKitCall via shouldUseNativeLiveKit). Old hard block removed so
  // users on web actually see remote video + hear remote audio.

  const callUi = (
    <div
      data-room-shell
      className="fixed inset-0 z-[100] flex select-none overflow-hidden"
      style={{ 
        userSelect: 'none', 
        WebkitUserSelect: 'none',
        contain: 'layout style paint',
        willChange: 'transform',
        width: '100vw',
        height: '100dvh',
        // Pkg415: when native LiveKit TextureView is mounted behind the
        // WebView, the gradient layer below already fades out via opacity;
        // ensure this fixed root itself is transparent so the camera shows.
        background: isNativeMediaActive ? 'transparent' : undefined,
      }}
    >
      {/* Background - lightweight solid gradient (transparent when native video is mounted behind WebView) */}
      <div
        className="absolute inset-0 bg-gradient-to-b from-[#050208] via-[#0d0520] to-[#080312]"
        style={{ opacity: showNativeCallingSurface ? 0 : 1 }}
      />

      {/* Pkg145: Realtime captions (rides Pkg116 transcription kill-switch) */}
      {callId && <CaptionOverlay scope="call" id={callId} hideToggle />}

      {/* Pkg189: Removed top utility buttons (PiP / Audio-only / Quality) per user request */}





      {/* Privacy Warning Overlay */}
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

      {/* ===== TOP BAR - Ultra Premium Glassmorphic ===== */}
      <div 
        className="absolute top-0 left-0 right-0 z-10 safe-area-top"
        style={{ contain: 'layout' }}
      >
        <div className="mx-2 sm:mx-3 mt-2 flex items-center justify-between gap-1.5 sm:gap-2">
          {/* Left - User info pill (3D glass) */}
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

              {/* Remote user avatar mini */}
              <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full overflow-hidden border-2 border-white/30"
                style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4), 0 4px 10px -4px rgba(236,72,153,0.4)' }}
              >
                {remoteUserAvatar ? (
                  <img src={normalizeProfileMediaUrl(remoteUserAvatar) || remoteUserAvatar} alt="" className="w-full h-full object-cover"/>
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-fuchsia-500 to-pink-500 flex items-center justify-center text-[10px] text-white font-extrabold">
                    {remoteUserName?.charAt(0)}
                  </div>
                )}
              </div>

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

            {/* Signal bars */}
            <div className="hidden sm:flex items-center gap-1 px-2.5 py-2 rounded-full backdrop-blur-xl"
              style={{
                background: isConnected
                  ? 'linear-gradient(135deg, rgba(16,185,129,0.2) 0%, rgba(5,150,105,0.15) 100%)'
                  : 'linear-gradient(135deg, rgba(245,158,11,0.2) 0%, rgba(234,88,12,0.15) 100%)',
                border: `1px solid ${isConnected ? 'rgba(110,231,183,0.5)' : 'rgba(252,211,77,0.5)'}`,
                boxShadow: `0 6px 14px -6px ${isConnected ? 'rgba(16,185,129,0.45)' : 'rgba(245,158,11,0.45)'}, inset 0 1px 0 rgba(255,255,255,0.25)`,
              }}
            >
              <div className="flex items-end gap-[2px]">
                {[1,2,3].map(i => (
                  <div key={i} className={cn(
                    "w-[3px] rounded-full transition-all",
                    i === 1 ? "h-1.5" : i === 2 ? "h-2.5" : "h-3",
                    isConnected
                      ? "bg-emerald-300"
                      : i <= 1 ? "bg-amber-300" : "bg-white/20"
                  )}
                    style={isConnected ? { boxShadow: '0 0 4px rgba(16,185,129,0.55)' } : undefined}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== MAIN VIDEO VIEW ===== */}
      <div 
        className="absolute inset-0 flex items-center justify-center"
        style={{ contain: 'layout' }}
      >
        {/* ===== CALLING/RINGING STATE: Show local camera feed immediately ===== */}
        {!isLiveConnected && !showNativeCallingSurface && (
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
                <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/20 to-black/70" />
              </div>
            ) : (
              <div className="absolute inset-0">
                <div className="absolute inset-0 bg-gradient-to-br from-[#050208] via-[#0d0520] to-[#080312]" />
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
              <div className="flex items-center gap-2 mt-2.5 px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15"
                style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2), 0 4px 12px rgba(0,0,0,0.35)' }}
              >
                <div className="flex gap-1">
                  {[0,1,2].map(i => (
                    <div key={i} className="w-1.5 h-1.5 rounded-full bg-white animate-bounce" style={{ animationDelay: `${i * 0.15}s`, boxShadow: '0 0 4px rgba(255,255,255,0.6)' }} />
                  ))}
                </div>
                <span className="text-white/90 text-xs font-bold tracking-wide">
                  {callStatus === 'ringing' ? 'Ringing...' : callStatus === 'calling' ? 'Calling...' : 'Connecting...'}
                </span>
              </div>
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
          </div>
        )}

        {/* ===== LIVE CONNECTED VIDEO LAYOUT - Vertical Top/Bottom ===== */}
        {isLiveConnected && !showNativeCallSurface && (
          <div className="absolute inset-0 z-[3]">
            {/* Full-screen primary (remote) video */}
            <div className="absolute inset-0">
              {primaryHasVideo && primaryVideoTrack ? (
                <LiveKitVideoPlayer
                  videoTrack={primaryVideoTrack}
                  mirror={primaryMirror}
                  fit="cover"
                  className="w-full h-full"
                  enablePictureInPicture
                  pipId="call-primary"
                />

              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#0c0818] via-[#050208] to-black">
                  {/* Pkg381: No large user icon in call — use blurred avatar as background fallback only */}
                  { (isSwapped ? myAvatarUrl : remoteUserAvatar) && (
                    <img 
                      src={isSwapped ? myAvatarUrl : remoteUserAvatar} 
                      alt="" 
                      className="absolute inset-0 w-full h-full object-cover opacity-20 blur-2xl"
                    />
                  )}
                  <div className="relative z-10 flex flex-col items-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-white/20 animate-pulse mb-2" />
                  </div>
                </div>
              )}
            </div>

            {/* PIP secondary (local) video - tap to swap */}
            <motion.div
              whileTap={{ scale: 0.93 }}
              onClick={handleSwapVideos}
              className="absolute top-24 right-4 w-[110px] h-[155px] rounded-2xl overflow-hidden border-2 border-white/30 z-10 cursor-pointer"
              style={{
                boxShadow:
                  '0 12px 30px -8px rgba(0,0,0,0.65), 0 4px 12px -2px rgba(168,85,247,0.35), inset 0 1px 0 rgba(255,255,255,0.25)',
              }}
            >
              {secondaryHasVideo && secondaryVideoTrack ? (
                <LiveKitVideoPlayer
                  videoTrack={secondaryVideoTrack}
                  mirror={secondaryMirror}
                  fit="cover"
                  className="w-full h-full"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#0c0818] via-[#050208] to-black">
                  { (isSwapped ? remoteUserAvatar : myAvatarUrl) && (
                    <img
                      src={isSwapped ? remoteUserAvatar : myAvatarUrl}
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
              <div
                aria-hidden
                className="absolute right-1.5 bottom-1.5 w-5 h-5 rounded-full border border-white/30 flex items-center justify-center backdrop-blur-md"
                style={{
                  background: 'linear-gradient(135deg, rgba(0,0,0,0.55), rgba(20,10,40,0.55))',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)',
                }}
              >
                <SwitchCamera className="w-3 h-3 text-white/85" />
              </div>
            </motion.div>
          </div>
        )}
      </div>

      {/* ===== INLINE CHAT MESSAGES (positioned above bottom controls) ===== */}
      {chatMessages.length > 0 && (
        <div
          ref={chatScrollRef}
          className="absolute bottom-[116px] left-3 right-16 z-10 max-h-[40vh] overflow-y-auto"
          style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}
        >
          <div className="space-y-1.5 pb-1">
            {chatMessages.slice(-30).map((msg) => {
              const isMe = msg.senderId === userId;
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex justify-start"
                >
                  <div
                    className="max-w-[80%] px-3 py-1.5 rounded-2xl rounded-bl-sm text-xs backdrop-blur-md border border-white/10"
                    style={{
                      background: isMe
                        ? 'linear-gradient(135deg, rgba(168,85,247,0.35), rgba(99,102,241,0.3))'
                        : 'linear-gradient(135deg, rgba(0,0,0,0.55), rgba(30,15,55,0.5))',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), 0 4px 12px -6px rgba(0,0,0,0.5)',
                    }}
                  >
                    <span className={cn(
                      "text-[10px] font-extrabold block mb-0.5 tracking-wide",
                      isMe ? "text-purple-200" : "text-pink-200"
                    )}
                      style={{ textShadow: '0 1px 1px rgba(0,0,0,0.4)' }}
                    >
                      {msg.senderName}
                    </span>
                    <span className="text-white/95" style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}>{msg.message}</span>
                  </div>
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
            className="absolute bottom-24 right-3 z-30 backdrop-blur-xl"
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
      <div className="absolute bottom-0 left-0 right-0 z-20 safe-area-bottom">
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
              <Gift className="w-5 h-5 text-white relative" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.45))' }} />
            </motion.button>

            {/* Three dot menu */}
            <motion.button
              whileTap={{ scale: 0.88, y: 0 }}
              whileHover={{ y: -2 }}
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 backdrop-blur-xl"
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

      <GiftPanel
        isOpen={showGiftPanel}
        onClose={() => setShowGiftPanel(false)}
        onSendGift={handleSendGift}
        userCoins={userCoins}
      />
      
      {/* Flying Gift Animations */}
      <AnimatePresence>
        {flyingGifts.map((gift) => (
          <FlyingGiftAnimation
            key={gift.id}
            gift={gift}
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

  return createPortal(callUi, document.body);
}