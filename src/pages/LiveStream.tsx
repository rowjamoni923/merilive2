import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
import { subscribeToTables } from "@/hooks/useUniversalRealtime";
import { useScreenLock } from "@/hooks/useScreenLock";
import { useNativeAudioFocus } from "@/hooks/useNativeAudioFocus";
import { useAudioFocusAutoMute } from "@/hooks/useAudioFocusAutoMute";

import { BeautyFilterPanel, generateBeautyCSS } from "@/components/live/BeautyFilterPanel";
import { AnimatedViewerCount } from "@/components/live/AnimatedViewerCount";
import { VirtualBackgroundDialog } from "@/components/livekit/VirtualBackgroundDialog";
import { NoiseCancellationDialog } from "@/components/livekit/NoiseCancellationDialog";
import { PublishLayersDialog } from "@/components/livekit/PublishLayersDialog";
import { RaiseHandQueueSheet } from "@/components/livekit/RaiseHandQueueSheet";
import { FloatingReactionsOverlay } from "@/components/livekit/FloatingReactionsOverlay";
import { ReactionsQuickBar } from "@/components/livekit/ReactionsQuickBar";
import { raiseHand, lowerHand, useRaisedHands } from "@/lib/livekitRaiseHand";
import { IngressDialog } from "@/components/livekit/IngressDialog";
import { SipDialDialog } from "@/components/livekit/SipDialDialog";
import { AgentDispatchDialog } from "@/components/livekit/AgentDispatchDialog";
import { CaptionOverlay } from "@/components/livekit/CaptionOverlay";
import { useLiveKitRpcHandlers } from "@/hooks/useLiveKitRpcHandlers";
import type { BeautySettings } from "@/components/live/BeautyFilterPanel";
import StickerOverlay from "@/components/live/StickerOverlay";
import { StickerPanel } from "@/components/live/StickerPanel";
import { useBeautyState } from "@/hooks/useBeautyState";
import { detectAndProcessViolation } from "@/utils/contactDetection";
import { scanImageForContactInfo } from "@/utils/imageContactDetection";
import { NumberSharingWarningDialog, useNumberSharingWarning } from "@/components/moderation/NumberSharingWarningDialog";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useNativeAndroidPip } from "@/hooks/useNativeAndroidPip";
import { useHighRefreshRate } from "@/hooks/useHighRefreshRate";
import { useLiveFrameMonitor } from "@/hooks/useLiveFrameMonitor";
import {
  Heart,
  Share2,
  X,
  Send,
  Phone,
  Gift,
  Grid3X3,
  Users,
  Eye,
  Wand2,
  Smile,
  Sparkles,
  RotateCcw,
  ShieldCheck,
  Layers,
  Radio,
  PhoneCall,
  Gamepad2,
  Swords,
  MessageCircle,
  ClipboardList,
  Gem,
  Music,
  LogOut,
  WifiOff,
  ChevronUp,
  ChevronDown,
  Mic,
  MicOff,
  Hand,
  Bot,
} from "lucide-react";
import { BrandedGiftIcon } from "@/components/common/BrandedGiftIcon";
import { BrandedGameIcon } from "@/components/common/BrandedGameIcon";
import { BrandedVoiceIcon } from "@/components/common/BrandedVoiceIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { getAppSetting } from "@/utils/appSettingsCache";
import { hapticFeedback } from "@/utils/nativeUtils";
import { toast } from "@/utils/hybridToast";

import { useLiveKitClient } from "@/hooks/useLiveKitClient";
import { usePKOpponentRoom } from "@/hooks/usePKOpponentRoom";
import { type GiftSentDetail } from "@/lib/livekitGiftSignaling";
import { publishChatMessage, type ChatMessageDetail } from "@/lib/livekitChatSignaling";

import { LiveKitVideoPlayer } from "@/components/live/LiveKitVideoPlayer";
import { PictureInPictureButton } from "@/components/livekit/PictureInPictureButton";
import { AudioOnlyToggleButton } from "@/components/livekit/AudioOnlyToggleButton";
import { VideoQualityButton } from "@/components/livekit/VideoQualityButton";
import { PKBattlePanel } from "@/components/live/PKBattlePanel";
import { PKBattleRequest } from "@/components/live/PKBattleRequest";
import { PKBattleActive } from "@/components/live/PKBattleActive";
import { PKBattleResult } from "@/components/live/PKBattleResult";
import { PKRandomMatchNotification } from "@/components/live/PKRandomMatchNotification";
import { UnifiedViewerPanel } from "@/features/shared/viewers";
import { MusicPlayerPanel } from "@/components/live/MusicPlayerPanel";
import { useLiveStreamFilters } from "@/hooks/useLiveStreamFilters";
import { cn } from "@/lib/utils";
// UNIFIED ENTRY ANIMATION - Same architecture as Gift System
import UnifiedEntryAnimation from "@/components/live/UnifiedEntryAnimation";
import { EntryNameBarAnimation } from "@/components/live/EntryNameBarAnimation";
import { useEntryAnimations } from "@/hooks/useEntryAnimations";
import { RoomEndedModal } from "@/components/room/RoomEndedModal";
import { CallButton } from "@/components/call/CallButton";
import { CallConfirmModal } from "@/components/call/CallConfirmModal";
import { useCall } from "@/features/call";
import { GlobalGameOverlay, GlobalGameButton } from "@/components/games/GlobalGameOverlay";
import { LiveGameSelector } from "@/components/games/LiveGameSelector";
// UNIFIED GIFTING - SINGLE LINK for all sections (Live, Party, Call, Chat, Profile)
// Change @/features/shared/gifting = Change everywhere automatically
import { GiftPanel, GiftData, FlyingGiftAnimation, useFlyingGifts, sendGift } from "@/features/shared/gifting";
// UNIFIED Chat Overlay - ONE LINK for Live Stream + Party Room
// Change RoomChatOverlay = Change everywhere (Live, Party Audio, Party Video, Party Game)
import { RoomChatOverlay, type JoinNotification, type RoomChatMessage } from "@/features/shared/room";
import { useBigoJoinNotifications, BigoJoinBannerContainer } from "@/components/live/BigoStyleJoinBanner";
import { LevelBadge } from "@/components/common/LevelBadge";
import AvatarWithFrame from "@/components/common/AvatarWithFrame";
import BeansIcon from "@/components/common/BeansIcon";
import { PremiumViewerProfileCard, ViewerProfile } from "@/components/live/PremiumViewerProfileCard";
import { HostModerationSheet } from "@/components/livekit/HostModerationSheet";
import { useSound } from "@/hooks/useSound";
import { useLiveStreamLifecycle } from "@/hooks/useLiveStreamLifecycle";
import { fetchUserEntryAnimations } from "@/utils/fetchEntryAnimation";
// Room protection - blocks back button, auto-closes on network loss
import { useRoomProtection } from "@/hooks/useRoomProtection";
// Task progress tracking
import { trackTaskProgress } from "@/hooks/useTaskProgress";
import NewHostBonusCard from "@/components/live/NewHostBonusCard";
import LiveTasksCard from "@/components/live/LiveTasksCard";
// TikTok-style swipe between live streams
import { useLiveStreamSwipe } from "@/hooks/useLiveStreamSwipe";
// Room Welcome Banner - Admin configurable
import { RoomWelcomeBanner } from "@/components/room/RoomWelcomeBanner";
import { useLiveFaceDetection } from "@/hooks/useLiveFaceDetection";
import { consumePreparedHostPreviewStream } from "@/features/live/hostPreviewSession";
import { hardenVideoElementForNative } from "@/utils/videoNativeHardening";
import { Capacitor } from "@capacitor/core";
import { warmGiftForInstantPlay } from "@/utils/instantGiftWarmup";
import { consumePreloadedStream } from "@/services/liveStreamPreloader";
import { recordClientError } from "@/utils/clientErrorLog";
import { normalizeProfileMediaUrl } from "@/utils/profileMediaUrl";
import { claimAndroidWebViewCamera } from "@/lib/androidCameraHandoff";
import { PremiumCloseButton } from "@/components/ui/PremiumCloseButton";
// ChatMessage = RoomChatMessage from src/features/shared/room/types.ts

interface PKBattleState {
  isActive: boolean;
  battleId: string | null;
  isChallenger: boolean;
  challengerInfo: {
    name: string;
    avatar: string;
    level: number;
    id: string;
    streamId: string;
  } | null;
  opponentInfo: {
    name: string;
    avatar: string;
    level: number;
    id: string;
    streamId: string;
  } | null;
}

interface LiveEndStats {
  duration: string;
  audiences: number;
  giftEarnings: number;
  callEarnings: number;
}

const LiveStream = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const location = useLocation();
  // Pkg443 Phase-3: keep screen on for the entire viewer/host session.
  useScreenLock(true);
  // Pkg444 Phase-5: hold media audio focus for the whole live session.
  useNativeAudioFocus({ enabled: true, intent: 'media' });
  
  
  // isHost will be verified from database, not just from location state
  const [isHost, setIsHost] = useState(location.state?.isHost || false);
  const numberWarning = useNumberSharingWarning();
  const [isHostVerified, setIsHostVerified] = useState(false);
  const [isHostMicMuted, setIsHostMicMuted] = useState(false);
  const streamTitle = location.state?.title || "";

  // Pkg245 — auto-PiP when user taps home button while watching/hosting a
  // live stream (Bigo/YouTube parity). 9:16 portrait window; reuses native
  // bridge (Pkg207). No-op on web/iOS.
  useNativeAndroidPip({ active: isHostVerified || !isHost, aspect: '9:16' });
  // Pkg247 — boost to 90/120Hz while live for smooth video + chat scroll
  useHighRefreshRate(isHostVerified || !isHost);
  // Live frame health monitor (face_lost / sleeping / multi-face / NSFW etc.)
  // Hosts only, once per 30s; results logged to live_frame_alerts + admin broadcast.
  const [hostTransitionPreviewStream, setHostTransitionPreviewStream] = useState<MediaStream | null>(() => {
    if (location.state?.isHost === true) {
      return consumePreparedHostPreviewStream();
    }
    return null;
  });
  const hostTransitionVideoRef = useRef<HTMLVideoElement>(null);
  const [hostInfo, setHostInfo] = useState<{
    name: string;
    avatar: string;
    country: string;
    language: string;
    gender: string;
    level: number;
    id: string;
    frameId?: string | null;
    appUid?: string | null;
    isVerifiedHost: boolean; // NEW: Track if streamer is a verified host (can receive calls)
  } | null>(() => location.state?.hostInfo ? {
    name: location.state.hostInfo.name || "Host",
    avatar: location.state.hostInfo.avatar || "",
    country: location.state.hostInfo.country || "🌍",
    language: location.state.hostInfo.language || "English",
    gender: location.state.hostInfo.gender || "female",
    level: Number(location.state.hostInfo.level || 1),
    id: location.state.hostInfo.id || "",
    frameId: location.state.hostInfo.frameId || null,
    appUid: location.state.hostInfo.appUid || null,
    isVerifiedHost: true,
  } : null);
  
  const [currentUser, setCurrentUser] = useState<{
    gender: string;
    id: string;
    coins: number;
    is_host?: boolean;
    display_name?: string;
    avatar_url?: string;
    user_level?: number;
    host_level?: number;
    country_flag?: string;
  } | null>(null);
  
  const [viewerCount, setViewerCount] = useState(0);
  const [message, setMessage] = useState("");
  const [showGiftPanel, setShowGiftPanel] = useState(false);
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  // REAL native beauty native beauty integration
  const beauty = useBeautyState();
  const [showBeautyPanel, setShowBeautyPanel] = useState(false);
  const [showStickerPanel, setShowStickerPanel] = useState(false);
  // Pkg125: Virtual Background dialog (web hosts only)
  const [showVirtualBackground, setShowVirtualBackground] = useState(false);
  const [showNoiseCancellation, setShowNoiseCancellation] = useState(false);
  const [showIngress, setShowIngress] = useState(false);
  const [showSipDial, setShowSipDial] = useState(false);
  // Pkg152: Publish-layer (simulcast tier) picker — host only, portrait 9:16 enforced.
  const [showPublishLayers, setShowPublishLayers] = useState(false);
  const [showAgentDispatch, setShowAgentDispatch] = useState(false);
  const [showRaiseHandQueue, setShowRaiseHandQueue] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [showLiveEndSummary, setShowLiveEndSummary] = useState(false);
  const [showCallConfirm, setShowCallConfirm] = useState(false);
  const [userCoins, setUserCoins] = useState(0);
  const userCoinsRef = useRef(0);
  const pendingGiftCostRef = useRef(0);
  const [floatingHearts, setFloatingHearts] = useState<{ id: number; x: number }[]>([]);
  const [streamStartTime, setStreamStartTime] = useState(Date.now());
  const [streamData, setStreamData] = useState<any>(null);
  const [totalBeans, setTotalBeans] = useState(0); // Total gifts/beans received
  
  // ✅ REAL-TIME ADMIN SETTINGS - Gift Commission from Admin Panel
  const [adminGiftCommission, setAdminGiftCommission] = useState<number>(55);

  useEffect(() => {
    if (pendingGiftCostRef.current === 0) {
      userCoinsRef.current = userCoins;
    }
  }, [userCoins]);
  
  // PK Battle States
  const [showPKPanel, setShowPKPanel] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showPKRequest, setShowPKRequest] = useState(false);
  const [incomingPKRequest, setIncomingPKRequest] = useState<{
    battleId: string;
    challengerId: string;
    challengerName: string;
    challengerAvatar: string;
    challengerLevel: number;
  } | null>(null);

  const [pkBattleState, setPKBattleState] = useState<PKBattleState>({
    isActive: false,
    battleId: null,
    isChallenger: false,
    challengerInfo: null,
    opponentInfo: null,
  });
  const [showPKResult, setShowPKResult] = useState(false);
  const [pkResult, setPKResult] = useState<{
    isWinner: boolean;
    isDraw: boolean;
    winnerName: string;
    winnerAvatar: string;
    winnerScore: number;
    loserName: string;
    loserAvatar: string;
    loserScore: number;
  } | null>(null);
  
  // Random PK Match state
  const [randomPKRequest, setRandomPKRequest] = useState<{
    challengerId: string;
    challengerName: string;
    challengerAvatar: string;
    challengerLevel: number;
    challengerStreamId: string;
  } | null>(null);
  const [showRandomPKNotification, setShowRandomPKNotification] = useState(false);
  
  const connectionInitiated = useRef(false);
  const mountedRef = useRef(true);
  const verifiedHostRef = useRef<boolean | null>(null); // Store verified host status
  const streamEndedRef = useRef(false); // Track if stream has ended (for task progress safety)
  
  const [liveEndStats, setLiveEndStats] = useState<LiveEndStats>({
    duration: "00:00:00",
    audiences: 0,
    giftEarnings: 0,
    callEarnings: 0,
  });
  
  // Real chat messages from database - UNIFIED type from shared/room
  const [messages, setMessages] = useState<RoomChatMessage[]>([]);

  // 🛡️ Live chat dedup guard: covers every code path (initial fetch,
  // realtime INSERT, optimistic send, gift broadcast, welcome msg, join
  // notifications, viewer enter). Same id never renders twice.
  useEffect(() => {
    setMessages(prev => {
      const seen = new Set<string>();
      const out: RoomChatMessage[] = [];
      for (const m of prev) {
        const key = String(m.id);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(m);
      }
      return out.length === prev.length ? prev : out;
    });
  }, [messages]);
  
  // Viewer list panel
  const [showViewerList, setShowViewerList] = useState(false);
  
  // Recent viewer avatars for display in header
  const [recentViewerAvatars, setRecentViewerAvatars] = useState<{id: string; app_uid?: string | null; avatar_url: string | null; name: string; user_level: number}[]>([]);
  
  // Music player panel
  const [showMusicPlayer, setShowMusicPlayer] = useState(false);

  const mapStreamChatRow = useCallback((msg: any, profile: any, hostId: string): RoomChatMessage => {
    const displayName = profile?.display_name || "User";
    const userCreatedAt = profile?.created_at ? new Date(profile.created_at) : null;
    const isNewUser = userCreatedAt ? (Date.now() - userCreatedAt.getTime()) < 7 * 24 * 60 * 60 * 1000 : false;

    return {
      id: msg.id,
      user: displayName,
      initial: displayName.charAt(0),
      message: msg.message || "",
      color: "text-white",
      userLevel: profile?.user_level || 1,
      userAvatar: normalizeProfileMediaUrl(profile?.avatar_url) || profile?.avatar_url || undefined,
      isHost: msg.user_id === hostId,
      isNewUser,
      countryFlag: profile?.country_flag || undefined,
    };
  }, []);

  const [showGamePanel, setShowGamePanel] = useState(false);
  
  // Flying gift animation
  const { gifts: flyingGifts, addGift: addFlyingGift, removeGift: removeFlyingGift } = useFlyingGifts();
  
  // Bigo-style flying join notifications - shows one at a time, flies in from left
  const { 
    activeNotification: activeBigoJoin, 
    addNotification: addBigoJoinNotification, 
    completeNotification: completeBigoJoin 
  } = useBigoJoinNotifications();
  const [liveJoinNotifications, setLiveJoinNotifications] = useState<JoinNotification[]>([]);

  useEffect(() => {
    if (liveJoinNotifications.length === 0) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setLiveJoinNotifications((prev) => prev.filter((n) => now - n.timestamp < 6000));
    }, 300);
    return () => window.clearInterval(timer);
  }, [liveJoinNotifications.length]);

  const addLiveJoinNotification = useCallback((notification: Omit<JoinNotification, 'id' | 'timestamp'>) => {
    const now = Date.now();
    const next: JoinNotification = {
      ...notification,
      id: `live_join_${notification.userId}_${now}`,
      timestamp: now,
    };
    setLiveJoinNotifications((prev) => {
      const withoutRecentDuplicate = prev.filter((n) => n.userId !== notification.userId || now - n.timestamp > 1200);
      return [...withoutRecentDuplicate.slice(-5), next];
    });
  }, []);
  
  // Sound hook
  const { playSound } = useSound();
  
  // Call system - use unified call hook for proper call management
  const { startCall: unifiedStartCall, isInCall } = useCall();
  
  // Host busy on call state - for viewer overlay
  const [hostBusyOnCall, setHostBusyOnCall] = useState(false);
  const [hostPhotos, setHostPhotos] = useState<string[]>([]);
  
  // ==================== UNIFIED ENTRY ANIMATION SYSTEM ====================
  // Same queue-based architecture as Gift System
  // Shows ONE animation at a time, priority: Vehicle > Entrance > NameBar
  const { 
    entryAnimations, 
    nameBarAnimations,
    addEntryAnimation, 
    removeEntryAnimation,
    removeNameBarAnimation,
  } = useEntryAnimations();

  // Deduplicate optimistic/broadcast gift counters against DB realtime confirmation
  const recentBroadcastGiftKeysRef = useRef<Map<string, { beans: number; expiresAt: number }>>(new Map());
  const activeViewerIdsRef = useRef<Set<string>>(new Set());
  const activeViewerIdsHydratedRef = useRef(false);
  const sessionAccessTokenRef = useRef<string | null>(null);
  const streamEndRedirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Pkg383: shared join-notify dedup map (LiveKit viewer_joined vs Postgres stream_viewers INSERT safety-net)
  const joinNotifyDedupRef = useRef<Map<string, number>>(new Map());
  const pendingJoinFallbackTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    activeViewerIdsRef.current = new Set();
    activeViewerIdsHydratedRef.current = false;
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) sessionAccessTokenRef.current = data.session?.access_token ?? null;
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      sessionAccessTokenRef.current = session?.access_token ?? null;
    });
    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, [id]);

  useEffect(() => {
    if (!id || !currentUserId || isHost) return;
    const sendViewerLeave = () => {
      const accessToken = sessionAccessTokenRef.current;
      if (!accessToken) return;
      try {
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/leave_live_stream_viewer`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ p_stream_id: id }),
          keepalive: true,
        }).catch(() => {});
      } catch { /* ignore unload failures */ }
    };
    window.addEventListener('pagehide', sendViewerLeave);
    window.addEventListener('beforeunload', sendViewerLeave);
    // Pkg425: also fire on tab-hidden + Capacitor app background. iOS Safari and
    // Android WebView kill tabs without firing pagehide/beforeunload reliably; the
    // 90s cron cleans those up but the count stays inflated until then. Visibility
    // and appStateChange give us a sub-second leave on app switch / lock screen.
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') sendViewerLeave();
    };
    document.addEventListener('visibilitychange', onVisibility);
    let appStateDetach: (() => void) | null = null;
    try {
      // Lazy-load Capacitor App so web builds don't pull native plugin code.
      void import('@capacitor/app').then(({ App }) => {
        try {
          const handle = App.addListener('appStateChange', ({ isActive }) => {
            if (!isActive) sendViewerLeave();
          });
          appStateDetach = () => { try { (handle as any)?.remove?.(); } catch { /* noop */ } };
        } catch { /* ignore — non-Capacitor runtime */ }
      }).catch(() => { /* ignore */ });
    } catch { /* ignore */ }
    // Pkg423: 30s viewer heartbeat. Server cron sweeps viewers with last_seen_at
    // older than 90s and recomputes live_streams.viewer_count, so abandoned tabs
    // (network drop, app kill, OS suspend) no longer inflate the counter.
    let hbTimer: ReturnType<typeof setInterval> | null = null;
    const sendHeartbeat = () => {
      try {
        supabase
          .rpc('viewer_heartbeat', { p_stream_id: id })
          .then(({ data }) => {
            if (typeof data === 'number' && mountedRef.current) {
              setViewerCount(data);
            }
          });
      } catch { /* ignore */ }
    };
    // First ping after 30s; join RPC already establishes presence at t=0.
    hbTimer = setInterval(sendHeartbeat, 30000);
    return () => {
      window.removeEventListener('pagehide', sendViewerLeave);
      window.removeEventListener('beforeunload', sendViewerLeave);
      document.removeEventListener('visibilitychange', onVisibility);
      if (appStateDetach) appStateDetach();
      if (hbTimer) clearInterval(hbTimer);
    };
  }, [id, currentUserId, isHost]);


  const getGiftRealtimeKey = useCallback((senderId?: string | null, giftId?: string | null, coins?: number | null, count?: number | null) => {
    return `${senderId || 'unknown'}:${giftId || 'unknown'}:${coins || 0}:${count || 1}`;
  }, []);

  const markOptimisticGiftCount = useCallback((key: string, beans: number) => {
    const now = Date.now();
    recentBroadcastGiftKeysRef.current.set(key, { beans, expiresAt: now + 15000 });
    recentBroadcastGiftKeysRef.current.forEach((value, staleKey) => {
      if (value.expiresAt < now) recentBroadcastGiftKeysRef.current.delete(staleKey);
    });
  }, []);

  // Profile card states
  const [showProfileCard, setShowProfileCard] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<ViewerProfile | null>(null);
  // Pkg130 — host moderation sheet
  const [moderateTarget, setModerateTarget] = useState<{ id: string; name: string } | null>(null);

  // Live stream lifecycle - auto end stream when host leaves app
  const handleStreamEndCallback = async () => {
    console.log('[LiveStream] Stream ended via lifecycle hook');
    await leaveChannel();
    navigate('/');
  };
  
  useLiveStreamLifecycle({
    streamId: id,
    isHost,
    isHostVerified,
    onStreamEnd: handleStreamEndCallback,
  });

  // ========== PERIODIC LIVE MINUTES TRACKER (every 60 seconds) ==========
  // ⚠️ CRITICAL: Do NOT add `streamData` to deps — it re-fetches on viewer/gift/music
  // changes and would reset the interval + lastTrackedMinuteRef, breaking task progress.
  const lastTrackedMinuteRef = useRef(0);
  useEffect(() => {
    // Only track when stream is ACTIVELY live (not after ending)
    if (!isHost || !isHostVerified || !id || showLiveEndSummary) return;
    
    // Reset tracking state for this stream session (per stream id)
    lastTrackedMinuteRef.current = 0;
    streamEndedRef.current = false;

    const trackNow = async () => {
      // ⛔ BULLETPROOF: Use ref to check if stream ended (avoids stale closure)
      if (streamEndedRef.current) {
        console.log('[LiveStream] ⛔ Stream ended - skipping task tracking');
        return;
      }
      
      const elapsedMinutes = Math.floor((Date.now() - streamStartTime) / 60000);
      const minutesSinceLastTrack = elapsedMinutes - lastTrackedMinuteRef.current;
      if (minutesSinceLastTrack > 0) {
        if (streamEndedRef.current) return;
        
        trackTaskProgress('live_minutes', { increment: minutesSinceLastTrack });
        lastTrackedMinuteRef.current = elapsedMinutes;
        console.log('[LiveStream] Tracked live minutes increment:', minutesSinceLastTrack, 'total this session:', elapsedMinutes);
      }
    };

    trackNow();

    const interval = setInterval(trackNow, 60000);

    return () => {
      clearInterval(interval);
      console.log('[LiveStream] 🛑 Live minutes tracker stopped');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, isHostVerified, id, showLiveEndSummary, streamStartTime]);

  // ========== Pkg105: HOST HARD-BLOCK (LiveKit track-subscription permissions) ==========
  // Host-only. Fetches `blocked_users` (where blocker_id = host) on mount + when
  // admin or another tab pushes `blocked_users` via Pkg37 `admin-table-update`.
  // No new Supabase channels, no polls. Self-only RLS read.
  useEffect(() => {
    if (!isHost || !isHostVerified || !id || !currentUserId) return;
    let cancelled = false;

    const refresh = async () => {
      try {
        const { data, error } = await supabase
          .from('blocked_users')
          .select('blocked_id')
          .eq('blocker_id', currentUserId);
        if (error || cancelled) return;
        const set = new Set<string>((data ?? []).map((r: any) => r.blocked_id).filter(Boolean));
        const mod = await import('@/lib/livekitTrackPermissions');
        if (cancelled) return;
        mod.setHostBlocklist('live', id, set);
      } catch (e) {
        console.warn('[Pkg105] refresh blocklist failed:', e);
      }
    };

    refresh();

    const onAdminUpdate = (ev: Event) => {
      const detail = (ev as CustomEvent).detail || {};
      if (detail?.table === 'blocked_users') refresh();
    };
    window.addEventListener('admin-table-update', onAdminUpdate as EventListener);
    // No-auto-refresh: admin-table-update event pushes blocklist changes; no visibility refetch.
    return () => {
      cancelled = true;
      window.removeEventListener('admin-table-update', onAdminUpdate as EventListener);
    };
  }, [isHost, isHostVerified, id, currentUserId]);



  // Room protection - blocks back button, auto-closes on network loss
  useRoomProtection({
    roomType: 'live',
    enabled: true,
    onNetworkClose: async () => {
      console.log('[LiveStream] Network lost - keeping live open and letting LiveKit reconnect');
      if (!isHost) {
        await retrySubscription();
      }
    },
  });

  // TikTok-style swipe navigation between live streams
  const {
    hasNext,
    hasPrevious,
    handleTouchStart: swipeTouchStart,
    handleTouchEnd: swipeTouchEnd,
    currentIndex: streamIndex,
    totalStreams,
  } = useLiveStreamSwipe(id);

  // ===== HORIZONTAL SWIPE: Hide/Show UI overlay (Chamet-style full-screen toggle) =====
  const [isUIHidden, setIsUIHidden] = useState(false);
  const hSwipeStartX = useRef(0);
  const hSwipeStartY = useRef(0);

  const handleCombinedTouchStart = useCallback((e: React.TouchEvent) => {
    hSwipeStartX.current = e.touches[0].clientX;
    hSwipeStartY.current = e.touches[0].clientY;
    swipeTouchStart(e);
  }, [swipeTouchStart]);

  const handleCombinedTouchEnd = useCallback((e: React.TouchEvent) => {
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const deltaX = endX - hSwipeStartX.current;
    const deltaY = endY - hSwipeStartY.current;

    // Only trigger horizontal swipe if horizontal movement > vertical and > 60px threshold
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 60) {
      if (deltaX > 0) {
        // Swipe right → hide UI
        setIsUIHidden(true);
      } else {
        // Swipe left → show UI
        setIsUIHidden(false);
      }
      return; // Don't trigger vertical swipe
    }

    swipeTouchEnd(e);
  }, [swipeTouchEnd]);

  const {
    filterState,
    setBeautyEnabled,
    setBeautySettings,
    updateFilter,
    setActiveSticker,
    generateFilterCSS: generateSyncedFilterCSS,
  } = useLiveStreamFilters(id, isHost);

  // LiveKit client
  const {
    isInitialized,
    isJoined,
    isLoading,
    connectionState,
    localVideoTrack,
    localAudioTrack,
    isNativeMediaActive,
    remoteUsers,
    error: livekitError,
    isRemoteAudioMuted,
    joinChannel,
    leaveChannel,
    getBeautyFilterCSS,
    switchCamera,
    toggleRemoteAudio,
    toggleAudio,
    retrySubscription,
  } = useLiveKitClient({
    liveSignalingStreamId: id,
    giftSignalingStreamId: id,
    viewerCountStreamId: id,
    chatSignalingStreamId: id,
    liveEventsStreamId: id,
    filterSignalingStreamId: id,
    activeSpeakerStreamId: id,
    connectionQualityStreamId: id,
    // Pkg122: room-wide metadata sync (current song/poll/theme/pinned chat).
   roomMetadataStreamId: id,
   streamsStreamId: id,
   rpcStreamId: id,
  transcriptionStreamId: id,
  reactionsStreamId: id,
    // Pkg105: host-only — registers Room for SFU-level viewer block enforcement.
    trackPermissionStreamId: isHost && isHostVerified ? id : null,

    onUserJoined: (uid) => {
      console.log('👤 Viewer joined (LiveKit):', uid);
    },
    onUserLeft: (uid) => {
      console.log('👋 Viewer left (LiveKit):', uid);
    },
    onError: (error) => {
      console.error('❌ LiveKit error:', error);
      const msg = error instanceof Error ? error.message : String(error);
      recordClientError({ label: "LiveStream.deltaY", message: msg });
      // Viewer-side: stream ended/inactive → friendly toast + navigate home (no blank screen)
      if (location.state?.isHost !== true && /stream_inactive|must_enter_stream_first|not_stream_host/i.test(msg)) {
        toast.info('This live stream has ended.');
        try { navigate('/', { replace: true }); } catch { /* ignore */ }
        return;
      }
      // 🚨 Host-visible toast on camera/publish failure so they aren't stuck
      // on a black "Starting camera..." screen indefinitely.
      if (location.state?.isHost === true) {
        if (/camera|microphone|publish|getUserMedia|NotAllowed|NotReadable|Permission/i.test(msg)) {
          toast.error('Camera failed to start — please check camera permission and try again.');
        }
      }
    },
  });

  // Pkg444 Phase-6: host mic auto-mutes on transient audio-focus loss
  // (incoming phone call, alarm, voice assistant) and restores on gain
  // — unless the host had already muted themselves.
  useAudioFocusAutoMute({
    enabled: isHost,
    intent: 'media',
    isMicEnabled: !isHostMicMuted,
    setMicEnabled: (want) => {
      const wantMuted = !want;
      if (wantMuted !== isHostMicMuted) {
        setIsHostMicMuted(wantMuted);
        try { void toggleAudio(want); } catch { /* ignore */ }
      }
    },
  });



  // Pkg100: PK Cross-room Audio Bridge — secondary subscribe-only connection
  // to the opponent's stream room so both hosts + all audiences hear each other.
  const opponentStreamId = pkBattleState.isActive
    ? pkBattleState.isChallenger
      ? pkBattleState.opponentInfo?.streamId || null
      : pkBattleState.challengerInfo?.streamId || null
    : null;
  const opponentRoom = usePKOpponentRoom(opponentStreamId);

  // ========== FACE DETECTION FOR HOST ==========
  const faceDetection = useLiveFaceDetection({
    localVideoTrack,
    streamId: id || null,
    userId: currentUser?.id || null,
    isHost,
    isStreaming: isJoined,
    streamStartTimeMs: streamStartTime,
    onAutoClose: () => {
      console.log('[FaceDetection] Auto-closing stream due to face absence');
      handleEndStream();
    },
  });

  // ========== EXTERNAL FRAME MONITOR (verify.merilive.com) ==========
  // 15s cadence — provider checks for sleeping / face_lost / multi-face / NSFW /
  // weapons / drugs / identity. 3 critical strikes in 5 min OR identity mismatch
  // → server signals end_stream; we tear down immediately. Best-effort; failures
  // are silent.
  useLiveFrameMonitor({
    enabled: isHost && isHostVerified && isJoined,
    userId: currentUserId,
    track:
      (localVideoTrack?.mediaStreamTrack as MediaStreamTrack | undefined) ??
      (typeof localVideoTrack?.getMediaStreamTrack === 'function'
        ? (localVideoTrack.getMediaStreamTrack() as MediaStreamTrack | null)
        : null),
    context: 'live_stream',
    streamId: id ?? null,
    intervalMs: 15_000,
    onWarning: (resp) => {
      const a = resp.result?.alerts?.[0];
      if (a === 'looking_away') toast.warning('আপনি ক্যামেরা থেকে দূরে তাকিয়ে আছেন');
      else if (a === 'low_quality') toast.warning('ভিডিও কোয়ালিটি কম — আলো বাড়ান');
    },
    onCritical: (resp) => {
      const a = resp.result?.alerts?.[0] ?? 'নিয়ম লঙ্ঘন';
      const msg =
        a === 'face_lost' ? 'মুখ দেখা যাচ্ছে না — সামনে আসুন'
        : a === 'sleeping' ? 'ঘুমিয়ে পড়েছেন? জেগে উঠুন'
        : a === 'multiple_faces' ? 'একাধিক মুখ — নিয়ম ভঙ্গ'
        : a === 'identity_mismatch' ? 'অন্য ব্যক্তি detect হয়েছে'
        : a.startsWith('moderation:') ? 'অনুপযুক্ত content detect হয়েছে'
        : 'সতর্কতা — admin notified';
      toast.error(msg, { description: `Strike ${resp.strikes ?? '?'}/3 — ৩বার হলে stream auto-end` });
    },
    onForceEnd: (resp) => {
      toast.error('Stream auto-ended', {
        description: resp.result?.alerts?.includes('identity_mismatch')
          ? 'অন্য ব্যক্তি detect — instant end'
          : '৩বার নিয়ম ভঙ্গ — auto-end',
      });
      console.log('[FrameMonitor] Auto-ending stream due to', resp.result?.alerts);
      handleEndStream();
    },
  });



  // Fetch current user and stream data from database - VERIFY host status
  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    let selfJoinTimer: ReturnType<typeof setTimeout> | null = null;

    const fetchData = async () => {
      if (cancelled || !mountedRef.current) return;
      
      // PARALLEL: Fetch user auth + stream data simultaneously for instant load
      const { getCachedUser } = await import('@/utils/cachedAuth');
      
      // Start BOTH fetches in parallel - don't wait for auth before fetching stream
      const userPromise = getCachedUser();
      const streamPromise = id ? supabase
        .from("live_streams")
        .select("*")
        .eq("id", id)
        .single() : null;
      
      const [cachedUser, streamResult] = await Promise.all([userPromise, streamPromise]);
      if (cancelled || !mountedRef.current) return;
      let currentUserId: string | null = null;
      
      // Process stream data first to determine host
      const stream = id && streamResult ? streamResult.data : null;
      const { data: hostProfile } = stream?.host_id
        ? await supabase
            .from("profiles_public")
            .select("id, app_uid, display_name, avatar_url, gender, user_level, host_level, country_flag, country_name, is_host, frame_id, equipped_frame_id")
            .eq("id", stream.host_id)
            .maybeSingle()
        : { data: null };
      
      if (cachedUser) {
        currentUserId = cachedUser.id;
        setCurrentUserId(cachedUser.id);
      }
      
      // PARALLEL BATCH: user profile + session gifts + self profile (all independent)
      const isActualHost = currentUserId !== null && stream?.host_id === currentUserId;
      
      const [userProfileRes, sessionGiftsRes, selfProfileRes] = await Promise.all([
        // User profile
        cachedUser ? supabase.from("profiles").select("id, gender, coins, is_host, display_name, avatar_url, user_level, host_level, country_flag").eq("id", cachedUser.id).single() : Promise.resolve({ data: null }), // guard-ok: owner-only self balance/profile fetch
        // Session gifts
        stream && id ? supabase.from("gift_transactions").select("coin_amount, receiver_beans").eq("stream_id", id).eq("receiver_id", stream.host_id) : Promise.resolve({ data: null }),
        // Self profile for viewer join notification
        !isActualHost && currentUserId ? supabase.from("profiles_public").select("app_uid, display_name, avatar_url, user_level, equipped_entrance_id, equipped_entry_name_bar_id, equipped_vehicle_id").eq("id", currentUserId).single() : Promise.resolve({ data: null }),
      ]);
      if (cancelled || !mountedRef.current) return;
      
      // Process user profile
      if (userProfileRes.data && mountedRef.current) {
        const profile = userProfileRes.data;
        const profileCoins = profile.coins || 0;
        setCurrentUser({
          gender: profile.gender || "male",
          id: cachedUser!.id,
          coins: profileCoins,
          is_host: profile.is_host === true,
          display_name: profile.display_name,
          avatar_url: profile.avatar_url,
          user_level: profile.user_level || 1,
          host_level: profile.host_level || 0,
          country_flag: profile.country_flag,
        });
        if (pendingGiftCostRef.current === 0) {
          userCoinsRef.current = profileCoins;
          setUserCoins(profileCoins);
        }
      }
      
      // Process stream data
      if (stream && mountedRef.current) {
        setStreamData({ ...stream, profiles: hostProfile, host: hostProfile });
        setStreamStartTime(new Date(stream.started_at || stream.created_at).getTime());
        setViewerCount(stream.viewer_count || 0);
        
        const sessionBeans = sessionGiftsRes.data?.reduce((sum: number, tx: any) => sum + Number(tx.receiver_beans ?? tx.coin_amount ?? 0), 0) || 0;
        setTotalBeans(sessionBeans);
        console.log('[LiveStream] Session beans calculated:', sessionBeans, 'from', sessionGiftsRes.data?.length, 'transactions');
        
        verifiedHostRef.current = isActualHost;
        setIsHost(isActualHost);
        setIsHostVerified(true);
        console.log(`🔐 Host verification: currentUser=${currentUserId}, streamHost=${stream.host_id}, isHost=${isActualHost}`);
        
        // Always set hostInfo (with fallbacks) so header pill never disappears
        // even if profiles_public fetch silently fails (RLS race / network / deleted).
        {
          const hostAvatar = normalizeProfileMediaUrl(hostProfile?.avatar_url) || hostProfile?.avatar_url || "";
          const hostLevel = Number(hostProfile?.host_level || hostProfile?.user_level || 1);
          setHostInfo({
            name: hostProfile?.display_name || "Host",
            avatar: hostAvatar,
            country: hostProfile?.country_flag || "🌍",
            language: "English",
            gender: hostProfile?.gender || "female",
            level: hostLevel > 0 ? hostLevel : 1,
            id: hostProfile?.id || stream.host_id,
            frameId: hostProfile?.equipped_frame_id || hostProfile?.frame_id || null,
            appUid: hostProfile?.app_uid || null,
            isVerifiedHost: hostProfile?.is_host === true,
          });
        }

        // Pkg100: Detect active PK battle on mount (viewer or host refresh).
        // If this stream is part of an accepted PK battle, set up state + opponent room.
        const { data: activeBattle } = await supabase
          .from("pk_battles")
          .select("id, challenger_id, opponent_id, challenger_stream_id, opponent_stream_id, challenger_score, opponent_score, status")
          .or(`challenger_stream_id.eq.${id},opponent_stream_id.eq.${id}`)
          .eq("status", "accepted")
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (activeBattle && mountedRef.current) {
          const isChallengerSide = activeBattle.challenger_stream_id === id;
          const isOpponentSide = activeBattle.opponent_stream_id === id;
          if (!isChallengerSide && !isOpponentSide) return;

          // Resolve challenger and opponent profiles
          const challengerProfileRes = await supabase
            .from("profiles_public")
            .select("id, display_name, avatar_url, user_level")
            .eq("id", activeBattle.challenger_id)
            .maybeSingle();
          const opponentProfileRes = await supabase
            .from("profiles_public")
            .select("id, display_name, avatar_url, user_level")
            .eq("id", activeBattle.opponent_id)
            .maybeSingle();
          const cp = challengerProfileRes.data;
          const op = opponentProfileRes.data;
          const challengerAvatar = normalizeProfileMediaUrl(cp?.avatar_url) || cp?.avatar_url || "";
          const opponentAvatar = normalizeProfileMediaUrl(op?.avatar_url) || op?.avatar_url || "";

          setPKBattleState({
            isActive: true,
            battleId: activeBattle.id,
            isChallenger: isChallengerSide,
            challengerInfo: {
              name: cp?.display_name || "Host",
              avatar: challengerAvatar,
              level: cp?.user_level || 1,
              id: activeBattle.challenger_id || "",
              streamId: activeBattle.challenger_stream_id || "",
            },
            opponentInfo: {
              name: op?.display_name || "Host",
              avatar: opponentAvatar,
              level: op?.user_level || 1,
              id: activeBattle.opponent_id || "",
              streamId: activeBattle.opponent_stream_id || "",
            },
          });
        }
        
        // If viewer, add to stream_viewers and show join notification
        if (!isActualHost && currentUserId) {
          const selfProfile = selfProfileRes.data;

          // ⚡ INSTANT: Optimistically increment viewer count BEFORE DB write
          activeViewerIdsRef.current.add(currentUserId);
          setViewerCount(prev => Math.max(prev, activeViewerIdsRef.current.size));

          // Reliable server-side join (no silent fail) + exact count sync
          void supabase
            .rpc("join_live_stream_viewer", { p_stream_id: id! })
            .then(async ({ data, error }) => {
              if (error) {
                console.error('[LiveStream] ❌ Viewer join RPC failed:', error);
                recordClientError({ label: "LiveStream.selfProfile", message: error instanceof Error ? error.message : String(error) });
                // Revert optimistic update on failure
                setViewerCount(prev => Math.max(0, prev - 1));
                return;
              }

              console.log('[LiveStream] Viewer joined:', currentUserId);

              if (mountedRef.current && typeof data === 'number') {
                setViewerCount(data);
              }
            });
          
          // Show self-join notification (viewer sees their own entry)
          if (selfProfile) {
            const userName = selfProfile.display_name || "User";
            const userLevel = selfProfile.user_level || 1;
            const avatarUrl = normalizeProfileMediaUrl(selfProfile.avatar_url) || selfProfile.avatar_url || undefined;
            
            console.log('[LiveStream] 🎬 Self profile equipped_entrance_id:', selfProfile.equipped_entrance_id);
            
            // Delay to let the component fully mount
            selfJoinTimer = setTimeout(async () => {
              if (cancelled || !mountedRef.current) return;
              // Add Bigo-style flying join banner
              addBigoJoinNotification({
                userId: currentUserId,
                userName,
                userAvatar: avatarUrl,
                userLevel,
              });
              
              // Also add a welcome chat message with actual user level
              setMessages(prev => [...prev, {
                id: `welcome_${Date.now()}`,
                user: userName,
                initial: userName.charAt(0),
                message: `entered the live room ✨`,
                color: "text-green-400",
                userLevel,
                userAvatar: avatarUrl,
              }]);
              
              // 🎬 TRIGGER SELF ENTRY ANIMATION - Viewer sees their own entrance effect!
              console.log('[LiveStream] 🎬 Checking self entry animation for:', userName, 'entranceId:', selfProfile.equipped_entrance_id);
              
              const { entranceAnimationUrl, entranceSoundUrl, entryNameBarUrl, vehicleAnimationUrl, rankCode } = await fetchUserEntryAnimations(
                selfProfile.equipped_entrance_id,
                selfProfile.equipped_entry_name_bar_id,
                selfProfile.equipped_vehicle_id,
                userLevel,
                currentUserId // Pass userId for Noble rank lookup
              );
              if (cancelled || !mountedRef.current) return;
              
              console.log('[LiveStream] 📍 Animation fetch result:', { entranceAnimationUrl, entryNameBarUrl, vehicleAnimationUrl, rankCode });
              
              if (entranceAnimationUrl || entryNameBarUrl || vehicleAnimationUrl || rankCode) {
                console.log('[LiveStream] 🚗 Self has equipped animation or rank:', { entranceAnimationUrl, entryNameBarUrl, vehicleAnimationUrl, rankCode });
                addEntryAnimation({
                  userId: currentUserId,
                  displayName: userName,
                  avatarUrl,
                  level: userLevel,
                  entranceUrl: entranceAnimationUrl || undefined,
                  entryNameBarUrl: entryNameBarUrl || undefined,
                  vehicleAnimationUrl: vehicleAnimationUrl || undefined,
                  soundUrl: entranceSoundUrl || undefined,
                  rankCode: rankCode || undefined,
                });
              } else {
                console.log('[LiveStream] ⚠️ No animation URL found for self');
              }
              
              // ⚡ Pkg82a: LiveKit-ONLY viewer_joined publish (replaces Supabase
              // `join_broadcast_${id}` broadcast). Fires after `stream_viewers`
              // INSERT has happened, so receivers can patch UI in <50ms while
              // late-joiners pick up state from the durable row.
              //
              // 🔁 RETRY-UNTIL-CONNECTED: the viewer's LiveKit Room is often
              // not yet `connected` at this point (subscribe latency 1-3s),
              // which causes publishLiveEvent to silently return false and the
              // host never sees the entrance. We retry every 400ms for up to
              // 12s until the publish actually succeeds.
              try {
                const { publishViewerJoined } = await import('@/lib/livekitLiveEventsSignaling');
                const payload = {
                  userId: currentUserId,
                  appUid: selfProfile.app_uid || null,
                  userName,
                  userAvatar: avatarUrl,
                  userLevel,
                  entranceAnimationUrl: entranceAnimationUrl || null,
                  entranceSoundUrl: entranceSoundUrl || null,
                  entryNameBarUrl: entryNameBarUrl || null,
                  vehicleAnimationUrl: vehicleAnimationUrl || null,
                  rankCode: rankCode || null,
                };
                let published = false;
                for (let i = 0; i < 30 && !published && mountedRef.current && !cancelled; i++) {
                  published = await publishViewerJoined(id!, payload);
                  if (published) {
                    console.log('[LiveStream] ⚡ Pkg82a viewer_joined published for:', userName, 'attempt', i + 1);
                    break;
                  }
                  await new Promise((r) => setTimeout(r, 400));
                }
                if (!published) {
                  console.warn('[LiveStream] Pkg82a viewer_joined never published (room never connected) for:', userName);
                }
              } catch (e) {
                console.warn('[LiveStream] Pkg82a publishViewerJoined failed:', e);
              }

            }, 500);
          }
        }
      }
    };
    
    fetchData();
    
    return () => {
      cancelled = true;
      if (selfJoinTimer) {
        clearTimeout(selfJoinTimer);
        selfJoinTimer = null;
      }
      mountedRef.current = false;
    };
  }, [id, addBigoJoinNotification]);

  // ✅ REAL-TIME ADMIN SETTINGS - Subscribe to gift_commission changes
  useEffect(() => {
    const fetchGiftCommission = async () => {
      try {
        const settingValue = await getAppSetting<Record<string, any>>('gift_commission');

        if (settingValue) {
          const settings = settingValue;
          let rate = 55;
          if (settings.host_percent !== undefined) {
            rate = settings.host_percent;
          } else if (settings.company_percent !== undefined) {
            rate = 100 - settings.company_percent;
          }
          console.log('[LiveStream] ✅ Gift commission loaded:', rate);
          setAdminGiftCommission(rate);
        }
      } catch (err) {
        console.error('[LiveStream] Error fetching gift commission:', err);
        recordClientError({ label: "LiveStream.settings", message: err instanceof Error ? err.message : String(err) });
      }
    };
    
    fetchGiftCommission();
    
    // Pkg82c: Supabase `livestream-gift-commission-realtime` channel DELETED.
    // Replaced by Pkg37 `admin-table-update` window event (dispatched by the
    // singleton `useAdminBroadcastSync` hook) → re-fetch on app_settings change.
    const handleAdminTableUpdate = (evt: Event) => {
      const detail = (evt as CustomEvent).detail || {};
      if (detail.table === 'app_settings') {
        fetchGiftCommission();
      }
    };
    window.addEventListener('admin-table-update', handleAdminTableUpdate);

    return () => {
      window.removeEventListener('admin-table-update', handleAdminTableUpdate);
    };
  }, []);


  // Subscribe to real-time chat messages - FIXED: Proper deduplication and race condition handling
  useEffect(() => {
    if (!id || !streamData?.host_id) return; // Wait for streamData to be available
    
    const hostId = streamData.host_id;
    
    // Fetch existing chat messages
    const fetchMessages = async () => {
      const { data: chatMessages } = await supabase
        .from("stream_chat")
        .select("id, message, message_type, created_at, user_id")
        .eq("stream_id", id)
        .order("created_at", { ascending: true })
        .limit(50);
      
      if (chatMessages?.length) {
        const userIds = [...new Set(chatMessages.map((msg: any) => msg.user_id).filter(Boolean))];
        const { data: profiles } = await supabase
          .from("profiles_public")
          .select("id, display_name, user_level, avatar_url, country_flag, created_at")
          .in("id", userIds);
        const profileMap = new Map((profiles || []).map((profile: any) => [profile.id, profile]));
        setMessages(chatMessages.map((msg: any) => mapStreamChatRow(msg, profileMap.get(msg.user_id), hostId)));
      }
    };
    
    fetchMessages();



    // Pkg79: LiveKit DataPacket chat — replaces the Supabase
    // `stream_chat_${id}` postgres_changes subscription entirely.
    // The `stream_chat` row is still INSERTed by the sender for
    // moderation/persistence, but viewers receive the bubble via
    // sub-50ms LiveKit fanout instead of a Realtime round-trip.
    const handleLiveKitChat = (event: Event) => {
      const detail = (event as CustomEvent<ChatMessageDetail>).detail;
      if (!detail || detail.scope !== 'live' || detail.id !== id) return;
      // Skip own messages (already added optimistically).
      if (detail.userId === currentUserId) {
        // Replace temp row id with the real server id if present.
        setMessages(prev => {
          const hasTemp = prev.some(m => m.id.startsWith('temp_') && m.message === detail.message);
          if (!hasTemp) return prev;
          return prev.map(m =>
            m.id.startsWith('temp_') && m.message === detail.message
              ? { ...m, id: detail.messageId }
              : m
          );
        });
        return;
      }
      setMessages(prev => {
        if (prev.some(m => m.id === detail.messageId)) return prev;
        return [...prev, {
          id: detail.messageId,
          user: detail.displayName || "User",
          initial: (detail.displayName || "U").charAt(0),
          message: detail.message,
          color: "text-white",
          userLevel: detail.userLevel || 1,
          userAvatar: detail.avatarUrl,
          isHost: detail.userId === hostId,
          isNewUser: false,
          countryFlag: detail.countryFlag,
        }];
      });
    };
    window.addEventListener('livekit-chat-message', handleLiveKitChat as EventListener);

    // Pkg361 ZERO-REFRESH: Subscribe to ALL relevant tables for the livestream
    const unsubscribeRealtime = subscribeToTables(
      `livestream-realtime-${id}`,
      ['live_streams', 'stream_viewers', 'stream_chat', 'gift_transactions'],
      (table, event, payload) => {
        const row = payload as any;
        
        // 1. Stream ended or updated
        if (table === 'live_streams' && row.id === id) {
          if (row.status === 'ended' || row.is_active === false) {
            handleStreamEndCallback();
          } else {
            setStreamData(prev => prev ? { ...prev, ...row } : row);
          }
        }
        
        // 2. Viewer count updates + welcome popup safety-net
        if (table === 'stream_viewers' && row.stream_id === id) {
          supabase.from('stream_viewers').select('id', { count: 'exact', head: true }).eq('stream_id', id).is('left_at', null)
            .then(({ count }) => {
              if (count !== null) setViewerCount(count);
            });
          // Pkg383 safety-net: if LiveKit viewer_joined doesn't arrive within 1.5s,
          // fire welcome popup + join chat + entry animation from Postgres INSERT
          // so other viewers always see the new viewer's entrance instantly.
          if (event === 'INSERT' && row.viewer_id && row.viewer_id !== currentUserId && !row.left_at) {
            const uid = row.viewer_id as string;
            const lastMark = joinNotifyDedupRef.current.get(uid) || 0;
            if (Date.now() - lastMark < 5000) return; // LiveKit already handled
            if (pendingJoinFallbackTimersRef.current.has(uid)) return;
            const timer = setTimeout(async () => {
              pendingJoinFallbackTimersRef.current.delete(uid);
              const lastMark2 = joinNotifyDedupRef.current.get(uid) || 0;
              if (Date.now() - lastMark2 < 5000) return; // LiveKit won the race
              joinNotifyDedupRef.current.set(uid, Date.now());
              // F6 — fetch profile WITH equipped IDs so fallback can dispatch
              // the entry animation when LiveKit publish never arrived.
              const { data: prof } = await supabase
                .from('profiles_public')
                .select('display_name, avatar_url, user_level, equipped_entrance_id, equipped_entry_name_bar_id, equipped_vehicle_id')
                .eq('id', uid)
                .maybeSingle();
              if (!mountedRef.current) return;
              const userName = prof?.display_name || 'User';
              const userLevel = prof?.user_level || 1;
              const userAvatar = normalizeProfileMediaUrl(prof?.avatar_url) || prof?.avatar_url || undefined;
              activeViewerIdsRef.current.add(uid);
              setRecentViewerAvatars((prev) => [
                { id: uid, app_uid: null, avatar_url: userAvatar || null, name: userName, user_level: userLevel },
                ...prev.filter((v: any) => v.id !== uid),
              ].slice(0, 5));
              addBigoJoinNotification({ userId: uid, userName, userAvatar, userLevel });
              addLiveJoinNotification({ userId: uid, userName, userAvatar, userLevel });
              setMessages((prev) => {
                if (prev.some((m) => m.id.startsWith(`join_${uid}_`) && Date.now() - Number(m.id.split('_').at(-1) || 0) < 5000)) return prev;
                return [...prev, {
                  id: `join_${uid}_${Date.now()}`,
                  user: userName,
                  initial: userName.charAt(0),
                  message: 'entered the live room 🎉',
                  color: 'text-green-400',
                  userLevel,
                }];
              });
              // F6 — fallback entry animation (LiveKit-fast-path lost). The 5s
              // dedup in useEntryAnimations prevents double-play if LiveKit
              // packet arrives just after this fires.
              try {
                const { entranceAnimationUrl, entranceSoundUrl, entryNameBarUrl, vehicleAnimationUrl, rankCode } =
                  await fetchUserEntryAnimations(
                    (prof as any)?.equipped_entrance_id,
                    (prof as any)?.equipped_entry_name_bar_id,
                    (prof as any)?.equipped_vehicle_id,
                    userLevel,
                    uid,
                  );
                if (!mountedRef.current) return;
                addEntryAnimation({
                  userId: uid,
                  displayName: userName,
                  avatarUrl: userAvatar,
                  level: userLevel,
                  entranceUrl: entranceAnimationUrl || undefined,
                  entryNameBarUrl: entryNameBarUrl || undefined,
                  vehicleAnimationUrl: vehicleAnimationUrl || undefined,
                  soundUrl: entranceSoundUrl || undefined,
                  rankCode: rankCode || undefined,
                });
              } catch (e) {
                console.warn('[LiveStream] F6 fallback entry animation failed:', e);
              }
            }, 1500);
            pendingJoinFallbackTimersRef.current.set(uid, timer);
          }
        }

        // 3. Gift transactions (backup)
        if (table === 'gift_transactions' && row.stream_id === id && event === 'INSERT') {
          console.log('[LiveStream] Gift transaction detected via Realtime:', row);
        }
      }
    );

    // ============= Safety-net: Supabase Realtime on stream_chat =============
    // LiveKit DataPacket is the fast-path (<50ms). But when a viewer's LiveKit
    // room isn't connected yet, is subscribe-only, or mobile background-drops
    // the WS, messages never arrive. This Postgres realtime channel guarantees
    // delivery to EVERY participant — host AND every viewer — so public chat
    // is truly public. Dedup via message id ensures no double-render.
    const seenMsgIds = new Set<string>();
    const chatChannel = supabase
      .channel(`live-chat-rt-${id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'stream_chat',
        filter: `stream_id=eq.${id}`,
      }, async (payload) => {
        const row: any = payload.new;
        if (!row?.id || !row?.user_id) return;
        if (seenMsgIds.has(row.id)) return;
        seenMsgIds.add(row.id);

        // F1 — Skip trigger-written system_join rows in realtime: the live
        // in-memory join message (LiveKit fast-path or Postgres safety-net)
        // already renders the entrance. Trigger row exists only for
        // late-joiner history (fetched on mount).
        if (row.message_type === 'system_join') return;

        // Skip own messages — already optimistically rendered by sender.
        if (row.user_id === currentUserId) return;


        // Resolve sender profile for display
        const { data: profile } = await supabase
          .from('profiles_public')
          .select('id, display_name, user_level, avatar_url, country_flag, created_at')
          .eq('id', row.user_id)
          .maybeSingle();

        setMessages(prev => {
          if (prev.some(m => m.id === row.id)) return prev;
          return [...prev, mapStreamChatRow(row, profile, hostId)];
        });
      })
      .subscribe();

    return () => {
      window.removeEventListener('livekit-chat-message', handleLiveKitChat as EventListener);
      try { supabase.removeChannel(chatChannel); } catch {}
      unsubscribeRealtime?.();
      pendingJoinFallbackTimersRef.current.forEach((t) => clearTimeout(t));
      pendingJoinFallbackTimersRef.current.clear();
    };

  }, [id, streamData?.host_id, currentUserId, mapStreamChatRow]);


  // ========== Pkg82b: session_beans_${id} Supabase channel DELETED ==========
  // LiveKit-Purist policy: gift bean updates flow through Pkg76 envelope
  // (`livekit-gift-sent` window event handled below) — sole instant path.
  // gift_transactions DB write still occurs via process_gift_transaction RPC
  // for audit/leaderboard, but no realtime subscription on it.


  // ========== Pkg78: LiveKit-ONLY gift broadcast receiver ==========
  // Supabase `gift_broadcast_${id}` channel removed — LiveKit DataPacket
  // (Pkg76 `livekit-gift-sent` window event) is the sole instant fanout path.
  // Persistent gift_transactions DB writes still happen via sendGift RPC.
  useEffect(() => {
    if (!id || !currentUserId) return;

    const handleLiveKitGift = (ev: Event) => {
      const data = (ev as CustomEvent<GiftSentDetail>).detail;
      if (!data || !mountedRef.current) return;
      if (data.scope !== 'live' || data.id !== id) return;
      if (data.senderId === currentUserId) return;

      console.log('[LiveStream] ⚡ Pkg76 livekit-gift-sent received:', data.giftName, 'from', data.senderName);
      warmGiftForInstantPlay({
        icon_url: data.giftIconUrl || null,
        animation_url: data.giftAnimationUrl || null,
        animation_format: data.giftAnimationFormat || null,
        animation_config_url: data.giftAnimationConfigUrl || null,
        sound_url: data.giftSoundUrl || null,
      } as any);

      addFlyingGift({
        senderId: data.senderId,
        senderName: data.senderName || 'User',
        senderAvatar: data.senderAvatar || undefined,
        giftName: data.giftName,
        giftIcon: data.giftIcon || '🎁',
        giftImageUrl: data.giftIconUrl || undefined,
        animationUrl: data.giftAnimationUrl || data.giftIconUrl || undefined,
        animationFormat: data.giftAnimationFormat || null,
        animationConfigUrl: data.giftAnimationConfigUrl || undefined,
        soundUrl: data.giftSoundUrl || undefined,
        giftColor: 'bg-pink-500/50',
        count: data.count || 1,
        coins: data.giftCoins || 0,
        isReceiverGift: isHost,
      });

      const giftAmount = Number(data.receiverBeans ?? (data.giftCoins || 0) * (data.count || 1));
      if (data.giftKey) markOptimisticGiftCount(data.giftKey, giftAmount);
      setTotalBeans(prev => prev + giftAmount);
      if (isHost && giftAmount > 0) {
        window.dispatchEvent(new CustomEvent('own-beans-updated', {
          detail: { userId: currentUserId, beansDelta: giftAmount },
        }));
      }
      if (isHost) trackTaskProgress('first_gift');

      const giftChatMessage = `[GIFT:${data.giftIconUrl || ''}] sent ${data.giftName} x${data.count || 1}`;
      const tempGiftMsgId = `livekit_gift_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      setMessages(prev => [...prev, {
        id: tempGiftMsgId,
        user: data.senderName || 'User',
        initial: (data.senderName || 'U').charAt(0),
        message: giftChatMessage,
        color: 'text-pink-400',
        userLevel: data.senderLevel || 1,
        userAvatar: data.senderAvatar,
        isHost: false,
        isNewUser: false,
        giftIconUrl: data.giftIconUrl || undefined,
      }]);

      playSound('gift');
    };
    window.addEventListener('livekit-gift-sent', handleLiveKitGift);

    return () => {
      window.removeEventListener('livekit-gift-sent', handleLiveKitGift);
    };
  }, [id, currentUserId, addFlyingGift, playSound, isHost, markOptimisticGiftCount]);

  // ========== Pkg82a: LIVE EVENT RECEIVER (viewer_joined / viewer_left) ==========
  // Replaces 3 Supabase Realtime channels:
  //   - `join_broadcast_${id}` (broadcast viewer_joined)
  //   - `stream_viewers_entrance_${id}` (postgres_changes entrance trigger)
  //   - `stream_viewers_realtime_${id}` (postgres_changes viewer list patch)
  // Sender packs ALL needed metadata + entry animation URLs into the envelope,
  // so receivers render with ZERO extra `profiles_public` / asset fetches.
  useEffect(() => {
    if (!id || !currentUserId) return;

    const handleLiveEvent = (evt: Event) => {
      const detail = (evt as CustomEvent<import('@/lib/livekitLiveEventsSignaling').LiveEventDetail>).detail;
      if (!detail || !mountedRef.current) return;
      const p = detail.payload;
      if (p.streamId !== id) return;

      if (p.type === 'viewer_left') {
        // LiveKit ParticipantDisconnected — translated locally on every client.
        activeViewerIdsRef.current.delete(p.userId);
        setViewerCount(prev => activeViewerIdsHydratedRef.current ? activeViewerIdsRef.current.size : Math.max(0, prev - 1));
        setRecentViewerAvatars((prev) => prev.filter((v: any) => v.id !== p.userId));
        return;
      }

      if (p.type !== 'viewer_joined') return;
      // Pkg383: mark dedup so Postgres safety-net skips this user
      joinNotifyDedupRef.current.set(p.userId, Date.now());
      const pendingTimer = pendingJoinFallbackTimersRef.current.get(p.userId);
      if (pendingTimer) { clearTimeout(pendingTimer); pendingJoinFallbackTimersRef.current.delete(p.userId); }
      // Skip own join (already shown via optimistic UI)
      if (p.userId === currentUserId) return;

      // 1. INSTANT viewer count + avatar list patch
      activeViewerIdsRef.current.add(p.userId);
      setViewerCount(prev => Math.max(prev, activeViewerIdsRef.current.size));
      setRecentViewerAvatars((prev) => [
        {
          id: p.userId,
          app_uid: p.appUid || null,
          avatar_url: p.userAvatar || null,
          name: p.userName || 'User',
          user_level: p.userLevel || 1,
        },
        ...prev.filter((v: any) => v.id !== p.userId),
      ].slice(0, 5));

      // 2. INSTANT flying join banner
      addBigoJoinNotification({
        userId: p.userId,
        userName: p.userName,
        userAvatar: p.userAvatar || undefined,
        userLevel: p.userLevel,
      });
      addLiveJoinNotification({
        userId: p.userId,
        userName: p.userName,
        userAvatar: p.userAvatar || undefined,
        userLevel: p.userLevel,
      });

      // 3. INSTANT chat message (dedup within 5s window)
      setMessages((prev) => {
        const hasJoinMessage = prev.some(
          (m) =>
            m.id.startsWith(`join_${p.userId}_`) &&
            Date.now() - Number(m.id.split('_').at(-1) || 0) < 5000,
        );
        if (hasJoinMessage) return prev;
        return [
          ...prev,
          {
            id: `join_${p.userId}_${Date.now()}`,
            user: p.userName,
            initial: p.userName.charAt(0),
            message: 'entered the live room 🎉',
            color: 'text-green-400',
            userLevel: p.userLevel,
          },
        ];
      });

      // 4. INSTANT entry animation — URLs are pre-resolved in the envelope,
      // ZERO extra fetch round-trips needed.
      // F5 — Always trigger entry namebar for every viewer (Chamet-parity).
      // useEntryAnimations renders a gradient fallback namebar when no URL,
      // so even plain viewers without equipped items get a visible entrance.
      if (mountedRef.current) {
        addEntryAnimation({
          userId: p.userId,
          displayName: p.userName,
          avatarUrl: p.userAvatar || undefined,
          level: p.userLevel,
          entranceUrl: p.entranceAnimationUrl || undefined,
          entryNameBarUrl: p.entryNameBarUrl || undefined,
          vehicleAnimationUrl: p.vehicleAnimationUrl || undefined,
          soundUrl: p.entranceSoundUrl || undefined,
          rankCode: p.rankCode || undefined,
        });
      }
    };

    window.addEventListener('livekit-live-event', handleLiveEvent);
    return () => {
      window.removeEventListener('livekit-live-event', handleLiveEvent);
    };
  }, [id, currentUserId, addBigoJoinNotification, addEntryAnimation]);


  // Zero-refresh policy: no gift reconciliation REST poll. LiveKit envelopes,
  // own-beans/app-sync pushes, and explicit gift events are the instant paths.


  // State for stream ended modal (for viewers)
  const [showStreamEndedModal, setShowStreamEndedModal] = useState(false);
  const [streamEndedBy, setStreamEndedBy] = useState<string>("");

  const showViewerStreamEnded = useCallback(async (hostName?: string) => {
    if (isHost || streamEndedRef.current) return;
    streamEndedRef.current = true;
    setStreamEndedBy(hostName || hostInfo?.name || "Host");
    setShowStreamEndedModal(true);
    await leaveChannel().catch(() => {});
    if (streamEndRedirectTimerRef.current) clearTimeout(streamEndRedirectTimerRef.current);
    streamEndRedirectTimerRef.current = setTimeout(() => {
      navigate('/', { replace: true });
    }, 3000);
  }, [hostInfo?.name, isHost, leaveChannel, navigate]);

  // Pkg78: LiveKit-ONLY stream-ended + viewer-count signaling.
  // Removed: Supabase `live-stream-close-${id}` broadcast + `stream_viewer_count_${id}` postgres_changes.
  // Safety net: live_streams row realtime + 30s stale-stream poll covers
  // the rare LiveKit disconnect case.
  useEffect(() => {
    if (!id) return;

    // ⚡ Pkg74: LiveKit DataPacket listener — sub-50ms peer notify on host end.
    const handleLiveKitStreamEnded = (evt: Event) => {
      const detail = (evt as CustomEvent).detail || {};
      if (detail.streamId !== id) return;
      if (isHost) return;
      console.log('[LiveStream] ⚡ Pkg74 livekit-stream-ended received');
      void showViewerStreamEnded(detail.hostName || hostInfo?.name || 'Host');
    };
    window.addEventListener('livekit-stream-ended', handleLiveKitStreamEnded);

    // ⚡ Pkg77: LiveKit ParticipantConnected/Disconnected → instant viewer count badge.
    const handleLiveKitViewerCount = (evt: Event) => {
      const detail = (evt as CustomEvent).detail || {};
      if (detail.streamId !== id) return;
      const lkCount: number = typeof detail.count === 'number' ? detail.count : 0;
      setViewerCount(Math.max(0, lkCount));
    };
    window.addEventListener('livekit-viewer-count', handleLiveKitViewerCount);

    return () => {
      if (streamEndRedirectTimerRef.current) {
        clearTimeout(streamEndRedirectTimerRef.current);
        streamEndRedirectTimerRef.current = null;
      }
      window.removeEventListener('livekit-stream-ended', handleLiveKitStreamEnded);
      window.removeEventListener('livekit-viewer-count', handleLiveKitViewerCount);
    };
  }, [id, isHost, hostInfo?.name, showViewerStreamEnded]);

  // VIEWER: stream-ended detection via LiveKit + live_streams realtime only.
  useEffect(() => {
    if (!id || isHost) return;

    const showEndedFromDb = () => {
      console.log('[LiveStream] Stream detected as ended by live_streams update');
      void showViewerStreamEnded(hostInfo?.name || "Host");
    };

    // Direct scoped channel for the current stream end-state. This avoids any
    // shared-channel rebuild race and is the durable fallback when the LiveKit
    // stream_ended packet is missed.
    const streamChannel = supabase
      .channel(`live-stream-end-${id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'live_streams',
        filter: `id=eq.${id}`,
      }, (payload) => {
        const row = (payload as any).new;
        if (row?.is_active === false || row?.status === 'ended' || row?.ended_at) showEndedFromDb();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(streamChannel);
      if (streamEndRedirectTimerRef.current) {
        clearTimeout(streamEndRedirectTimerRef.current);
        streamEndRedirectTimerRef.current = null;
      }
    };
  }, [id, isHost, hostInfo?.name, showViewerStreamEnded]);

  // ========== VIEWER: Detect host busy on call ==========
  // Source of truth = active private_calls (prevents stale is_in_call false positives)
  useEffect(() => {
    if (!id || isHost || !hostInfo?.id) return;

    // Fetch host photos from verification submissions
    const fetchHostPhotos = async () => {
      try {
        const { data } = await supabase
          .from('face_verification_submissions' as any)
          .select('host_photos')
          .eq('user_id', hostInfo!.id)
          .eq('status', 'approved')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const photos = (data as any)?.host_photos;
        if (photos && Array.isArray(photos) && photos.length > 0) {
          setHostPhotos(photos.map((photo) => normalizeProfileMediaUrl(photo) || photo).filter(Boolean));
        }
      } catch {
        // silent fallback
      }
    };

    const refreshHostBusyStatus = async () => {
      const { data: activeCall } = await supabase
        .from('private_calls')
        .select('id')
        .eq('host_id', hostInfo.id)
        .in('status', ['pending', 'ringing', 'connected'])
        .is('ended_at', null)
        .limit(1)
        .maybeSingle();

      setHostBusyOnCall(!!activeCall);
    };

    fetchHostPhotos();
    refreshHostBusyStatus();

    // Pkg305: Restore Supabase Realtime on private_calls for instant host-busy
    // detection (Core rule — polling cannot replace realtime). 30s poll kept
    // as safety-net only.
    const unsubscribeCalls = subscribeToTables(
      `livestream-host-calls-${hostInfo.id}`,
      ['private_calls'],
      (_table, _event, payload) => {
        const row = (payload?.new ?? payload?.old ?? payload) as any;
        if (!row || row.host_id !== hostInfo.id) return;
        refreshHostBusyStatus();
      }
    );
    // No-auto-refresh policy: rely on private_calls realtime above; removed 30s poll.
    return () => {
      unsubscribeCalls?.();
    };
  }, [id, isHost, hostInfo?.id]);


  // Pkg82a: REMOVED Supabase `stream_viewers_entrance_${id}` postgres_changes
  // subscription. Entry animations are now triggered by the unified
  // `livekit-live-event` handler above (viewer_joined envelope carries
  // pre-resolved entranceAnimationUrl / entryNameBarUrl / vehicleAnimationUrl
  // packed by the sender — zero extra fetches, sub-50ms latency).



  // Fetch recent viewer avatars for header display
  useEffect(() => {
    if (!id) return;
    
    const fetchRecentViewers = async () => {
      const [{ data: streamViewers, error: streamViewersError }, { count, error: countError }] = await Promise.all([
        supabase
          .from("stream_viewers")
          .select("viewer_id")
          .eq("stream_id", id)
          .is("left_at", null)
          .order("joined_at", { ascending: false }),
        supabase
          .from("stream_viewers")
          .select("*", { count: "exact", head: true })
          .eq("stream_id", id)
          .is("left_at", null),
      ]);

      if (streamViewersError) {
        console.error('[LiveStream] Error fetching recent viewers:', streamViewersError);
        recordClientError({ label: "LiveStream.fetchRecentViewers", message: streamViewersError instanceof Error ? streamViewersError.message : String(streamViewersError) });
        return;
      }

      if (countError) {
        console.error('[LiveStream] Error fetching viewer count:', countError);
        recordClientError({ label: "LiveStream.fetchRecentViewers", message: countError instanceof Error ? countError.message : String(countError) });
      }

      const viewerIds = (streamViewers || [])
        .map((sv: any) => sv.viewer_id)
        .filter(Boolean);

      const profileMap = new Map<string, any>();

      if (viewerIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from("profiles_public")
          .select("id, app_uid, display_name, avatar_url, user_level")
          .in("id", viewerIds);

        if (profilesError) {
          console.error('[LiveStream] Error fetching recent viewer profiles:', profilesError);
          recordClientError({ label: "LiveStream.profileMap", message: profilesError instanceof Error ? profilesError.message : String(profilesError) });
        }

        profiles?.forEach((profile: any) => {
          profileMap.set(profile.id, profile);
        });
      }

      const avatars = viewerIds.map((viewerId: string) => {
        const profile = profileMap.get(viewerId);

        return {
          id: profile?.id || viewerId,
          app_uid: profile?.app_uid || null,
          avatar_url: profile?.avatar_url || null,
          name: profile?.display_name || "User",
          user_level: profile?.user_level || 1,
        };
      });

      if (mountedRef.current) {
        activeViewerIdsRef.current = new Set(viewerIds);
        activeViewerIdsHydratedRef.current = true;
        setRecentViewerAvatars(avatars);

        if (typeof count === 'number') {
          setViewerCount(Math.max(count, avatars.length));
        } else {
          setViewerCount((prev) => Math.max(prev, avatars.length));
        }
      }
    };

    // Pkg188: One-shot initial fetch only. Steady-state viewer count + avatar
    // list now driven 100% by LiveKit events:
    //   • viewer_joined → in-memory add (handler above, lines 1167-1183)
    //   • viewer_left   → in-memory delete (handler above, lines 1159-1164)
    // The 15s safety-net poll has been removed (Pkg184/Pkg187 parity — pure
    // LiveKit delta, $1400-rule safe, ~80% additional DB read reduction on
    // top of the previous 3s→15s cost-optimisation).
    fetchRecentViewers();
  }, [id, currentUserId]);




  // Pkg82d (FCM-only): listen for incoming PK signals via `pk-notification`
  // window event (dispatched by useNotifications when a `pk_*` notification
  // row arrives over the whitelisted notifications realtime subscription).
  // Replaces TWO deleted Supabase channels:
  //   • `pk_incoming_${currentUserId}` (postgres_changes pk_battles INSERT)
  //   • `pk_random_match` (broadcast bus)
  useEffect(() => {
    if (!currentUserId || !isHost) return;

    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as any;
      if (!detail || typeof detail.type !== "string") return;
      const data = detail.data ?? {};

      if (detail.type === "pk_invite") {
        if (!data.battleId || !data.fromUserId) return;
        setIncomingPKRequest({
          battleId: data.battleId,
          challengerId: data.fromUserId,
          challengerName: data.fromName || "Host",
          challengerAvatar: data.fromAvatar || "",
          challengerLevel: data.fromLevel || 1,
        });
        setShowPKRequest(true);

      } else if (detail.type === "pk_random_invite") {
        if (pkBattleState.isActive || showPKRequest) return;
        if (data.fromUserId === currentUserId) return;
        setRandomPKRequest({
          challengerId: data.fromUserId,
          challengerName: data.fromName || "Host",
          challengerAvatar: data.fromAvatar || "",
          challengerLevel: data.fromLevel || 1,
          challengerStreamId: data.fromStreamId || "",
        });
        setShowRandomPKNotification(true);
      } else if (detail.type === "pk_invite_accepted" || detail.type === "pk_invite_declined") {
        // Reply to direct-invite sent FROM this host — handled in PKBattlePanel
        // via the same window event (no Supabase channel needed).
      }
    };

    window.addEventListener("pk-notification", handler);
    return () => window.removeEventListener("pk-notification", handler);
  }, [currentUserId, isHost, pkBattleState.isActive, showPKRequest]);


  // Keep host preview visible while publishing starts (no second play flash)
  useEffect(() => {
    if (!isHost || !hostTransitionPreviewStream || !hostTransitionVideoRef.current) return;

    const previewEl = hostTransitionVideoRef.current;
    hardenVideoElementForNative(previewEl, { muted: true });
    previewEl.srcObject = hostTransitionPreviewStream;

    const playPreview = () => {
      previewEl.play().catch(() => {});
    };

    playPreview();
    previewEl.onloadedmetadata = playPreview;

    return () => {
      previewEl.onloadedmetadata = null;
      if (previewEl.srcObject === hostTransitionPreviewStream) {
        previewEl.srcObject = null;
      }
    };
  }, [isHost, hostTransitionPreviewStream]);

  useEffect(() => {
    if (localVideoTrack && hostTransitionPreviewStream) {
      setHostTransitionPreviewStream(null);
    }
  }, [localVideoTrack, hostTransitionPreviewStream]);

  // ULTRA-FAST Channel join - Start connection IMMEDIATELY, don't wait for full verification
  // This reduces connection time from 2-4 seconds to under 1 second
  useEffect(() => {
    // CRITICAL: Prevent multiple connection attempts
    if (connectionInitiated.current) {
      console.log('🔒 Connection already initiated, skipping...');
      return;
    }
    
    if (!id) return;
    
    const initialHostRole = location.state?.isHost === true;
    
    connectionInitiated.current = true;
    const channelName = `live_${id}`;
    
    const startTime = performance.now();
    console.log(`🚀 INSTANT JOIN: Starting as ${initialHostRole ? 'HOST' : 'VIEWER'}`);
    
    // 🚀 CHECK FOR PRELOADED ROOM FIRST (instant video!)
    const preloaded = !initialHostRole ? consumePreloadedStream(id) : null;
    
    const preloadedVideoTrack = initialHostRole
      ? hostTransitionPreviewStream?.getVideoTracks().find((track) => track.readyState === 'live')
      : undefined;
    const preloadedAudioTrack = initialHostRole
      ? hostTransitionPreviewStream?.getAudioTracks().find((track) => track.readyState === 'live')
      : undefined;

    const enterBeforeJoin = async () => {
      if (!initialHostRole) {
        const { data, error } = await supabase.rpc('enter_live_stream', {
          p_stream_id: id,
          p_password: null,
        });
        const result = data as any;
        if (error || result?.success === false) {
          throw new Error(error?.message || result?.reason || 'Unable to enter live stream');
        }
      }

      return joinChannel({
      channelName,
      role: initialHostRole ? 'host' : 'audience',
      preloadedVideoTrack,
      preloadedAudioTrack,
      preloadedRoom: preloaded?.room || undefined,
      });
    };

    enterBeforeJoin().then(() => {
      const elapsed = performance.now() - startTime;
      console.log(`⚡ Connected in ${elapsed.toFixed(0)}ms${preloaded ? ' (PRELOADED!)' : ''}`);
    }).catch(err => {
      console.error('Join failed:', err);
      recordClientError({ label: "LiveStream.elapsed", message: err instanceof Error ? err.message : String(err) });
      toast.error(err instanceof Error ? err.message : 'Unable to join live stream');
      connectionInitiated.current = false;
    });

      // Cleanup only on unmount
    return () => {
      console.log('🧹 Component unmounting, cleaning up...');
      const wasHost = verifiedHostRef.current === true || initialHostRole;
      
      // Pkg385: Enhanced host cleanup. We still avoid closing on momentary
      // churn (e.g. PiP transition), but we MUST close if the user is truly
      // navigating away from the stream (e.g. Back button, home button).
      if (wasHost && !streamEndedRef.current) {
        // If we are unmounting but the stream didn't "end" via the X button,
        // it's a navigation or background event.
        // We let useLiveStreamLifecycle handle the auto-end-in-background.
        // But for UI/Camera consistency, we ensure native disconnect runs.
        console.log('[LiveStream] Host unmounting without explicit end — verifying navigation');
      }

      streamEndedRef.current = true; // Stop viewer/task cleanup immediately on unmount
      if (connectionInitiated.current) {
        leaveChannel();
        connectionInitiated.current = false;
        if (!wasHost && id) {
            supabase
              .rpc('leave_live_stream_viewer', { p_stream_id: id })
              .then(({ error }) => {
                if (error) console.error('[LiveStream] Viewer leave RPC failed:', error);
              });
        }
      }
    };
  }, [id, location.state?.isHost]); // Only depends on id and initial isHost

  // Call button shows only for female hosts - visible to all viewers
  const shouldShowCallButton = hostInfo?.isVerifiedHost && (hostInfo?.gender === "female" || hostInfo?.gender === "Female") && !isHost;

  const handleLike = () => {
    const newHeart = { id: Date.now(), x: Math.random() * 30 };
    setFloatingHearts(prev => [...prev, newHeart]);
    setTimeout(() => {
      setFloatingHearts(prev => prev.filter(h => h.id !== newHeart.id));
    }, 2000);
  };

  const handleSendMessage = async () => {
    if (!message.trim() || !currentUserId || !id) return;
    
    const messageText = message.trim();
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    
    // 🔍 BLOCKING: Detect contact info BEFORE sending
    const { detectContactInfo, maskContactContent } = await import('@/utils/contactDetection');
    const detection = detectContactInfo(messageText);
    
    let contentToSend = messageText;
    if (currentUser?.is_host === true && detection.hasViolation) {
      contentToSend = maskContactContent(messageText, detection);
      console.log('[ContactDetection] LiveStream BLOCKED, masked:', contentToSend);
      
      // Process violation (warning + bean deduction)
      detectAndProcessViolation(currentUserId, messageText, 'live_stream', id)
        .then(res => {
          if (res.detected && res.violationNumber) {
            numberWarning.showWarning(res.violationNumber, res.beansDeducted || 0, res.isBanned || false);
          } else if (res.detected) {
            numberWarning.showGenericWarning();
          }
        })
        .catch(err => console.error('[ContactDetection] LiveStream error:', err));
    }
    
    // Optimistic update - show MASKED message
    setMessages(prev => [...prev, {
      id: tempId,
      user: currentUser?.display_name || "User",
      initial: (currentUser?.display_name || "U").charAt(0),
      message: contentToSend,
      color: "text-white",
      userLevel: currentUser?.user_level || 1,
      userAvatar: currentUser?.avatar_url || undefined,
      isHost: currentUserId === streamData?.host_id,
      isNewUser: false,
      countryFlag: currentUser?.country_flag || undefined,
    }]);
    
    // Clear input immediately
    setMessage("");
    
    // Save MASKED message to database (moderation/persistence source of truth)
    const { data: insertedRow, error } = await supabase
      .from("stream_chat")
      .insert({
        stream_id: id,
        user_id: currentUserId,
        message: contentToSend,
      })
      .select("id")
      .single();

    if (error) {
      console.error('Failed to send message:', error);
      recordClientError({ label: "LiveStream.detection", message: error instanceof Error ? error.message : String(error) });
      setMessages(prev => prev.filter(m => m.id !== tempId));
    } else {
      trackTaskProgress('messages_sent', { increment: 1 });
      // Pkg79: sub-50ms peer delivery via LiveKit DataPacket.
      void publishChatMessage('live', id, {
        messageId: insertedRow?.id || tempId,
        userId: currentUserId,
        displayName: currentUser?.display_name || "User",
        avatarUrl: currentUser?.avatar_url || undefined,
        userLevel: currentUser?.user_level || 1,
        isHost: currentUserId === streamData?.host_id,
        countryFlag: currentUser?.country_flag || undefined,
        message: contentToSend,
        messageType: 'text',
      });
    }
  };


  const calculateDuration = () => {
    const diff = Date.now() - streamStartTime;
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Pkg361 ZERO-REFRESH: Subscribe to this specific live_stream row for instant status updates.
  // Replaces the 15s heartbeat-only path with <100ms DB change detection.
  useEffect(() => {
    if (!id) return;

    const unsubscribe = subscribeToTables(
      `live-stream-status-${id}`,
      ['live_streams'],
      (table, event, payload) => {
        const row = payload as any;
        if (row.id !== id) return;

        console.log(`[LiveStream Realtime] Status update for ${id}: is_active=${row.is_active}`);
        
        // If stream is marked inactive in DB, end it locally
        if (row.is_active === false && !streamEndedRef.current) {
          console.log('[LiveStream Realtime] Stream ended from DB side');
          toast.info('This live stream has ended.');
          handleStreamEndCallback();
        }

        // Also sync viewer count if it changes in DB
        if (typeof row.viewer_count === 'number') {
          setViewerCount(row.viewer_count);
        }
        
        // Sync music state if it changes
        if (row.current_music_url !== undefined) {
          setStreamData((prev: any) => prev ? { ...prev, ...row } : row);
        }
      }
    );

    return unsubscribe;
  }, [id]);

  const handleEndStream = async () => {

    // ⛔ IMMEDIATELY mark stream as ended to stop task progress tracking
    streamEndedRef.current = true;

    // Calculate SESSION-SPECIFIC earnings (only gifts received during THIS live stream)
    let giftEarnings = 0;
    let callEarnings = 0;
    let audiences = viewerCount;

    try {
      if (id && streamData?.host_id) {
        // Signal FIRST while the host is still connected to LiveKit. If we wait
        // for DB/stat queries first, the host can disconnect before reliable
        // DataPacket flushes and viewers stay on a blank live screen.
        const hostName = hostInfo?.name || 'Host';
        try {
          const { publishStreamEnded } = await import('@/lib/livekitLiveSignaling');
          await publishStreamEnded(id, {
            endedBy: currentUserId || 'host',
            hostName,
          });
        } catch (e) {
          console.warn('[LiveStream] Pkg74 publishStreamEnded failed:', e);
        }
        console.log('[LiveStream] ⚡ stream_ended sent before DB end flow');

        // SESSION-SPECIFIC: Get gift earnings only for THIS stream session
        const { data: sessionGifts } = await supabase
          .from("gift_transactions")
          .select("coin_amount")
          .eq("stream_id", id)
          .eq("receiver_id", streamData.host_id);

        if (sessionGifts && sessionGifts.length > 0) {
          // Sum all coin_amount for this session
          const totalCoins = sessionGifts.reduce((sum, tx) => sum + (tx.coin_amount || 0), 0);

          // ✅ USE REAL-TIME adminGiftCommission from state (already synced with Admin Panel)
          // No need to fetch again - using the live value from real-time subscription
          const hostPercent = adminGiftCommission;

          console.log('[LiveStream] Using real-time gift commission for earnings:', hostPercent);

          // Calculate host's actual earnings after commission
          giftEarnings = Math.floor((totalCoins * hostPercent) / 100);
        }

        // Call earnings for this session (if any)
        // For now, use the real-time totalBeans as a fallback
        // In future, implement session-specific call tracking

        // Get unique viewers count
        const { data: viewers } = await supabase
          .from("stream_viewers")
          .select("viewer_id")
          .eq("stream_id", id);

        if (viewers) {
          audiences = viewers.length;
        }

        // Server-side end flow is the source of truth: marks stream ended,
        // closes active stream_viewers rows, resets viewer_count, and returns
        // exact session stats. No Supabase Realtime channel is used here.
        const { data: endResult, error: endError } = await supabase.rpc('end_live_stream', {
          p_stream_id: id,
        });

        if (endError) {
          console.error('[LiveStream] end_live_stream RPC failed:', endError);
          recordClientError({ label: 'LiveStream.end_live_stream', message: endError.message });
        } else if (endResult && typeof endResult === 'object') {
          const result = endResult as any;
          audiences = Number(result.audience_count ?? audiences) || audiences;
          giftEarnings = Number(result.beans_earned ?? giftEarnings) || giftEarnings;
        }

      }
    } catch (error) {
      console.error('[LiveStream] Error while ending stream stats flow:', error);
      recordClientError({ label: "LiveStream.hostPercent", message: error instanceof Error ? error.message : String(error) });
    }

    const stats: LiveEndStats = {
      duration: calculateDuration(),
      audiences,
      giftEarnings, // SESSION-SPECIFIC: Only gifts from THIS live stream
      callEarnings, // Call earnings (placeholder for future)
    };
    setLiveEndStats(stats);

    // Note: live_minutes are now tracked periodically every 60s via useEffect below
    try {
      await leaveChannel();
    } finally {
      setShowLiveEndSummary(true);
    }
  };

  const handleCloseSummary = () => {
    setShowLiveEndSummary(false);
    navigate('/');
  };

  // Handle viewer leaving the stream
  const handleLeaveStream = async () => {
    // Server-side leave flow keeps stream_viewers + live_streams.viewer_count in sync.
    if (!isHost && currentUserId && id) {
      const { data, error } = await supabase.rpc('leave_live_stream_viewer', { p_stream_id: id });
      if (error) {
        console.error('[LiveStream] Viewer leave RPC failed:', error);
      } else if (typeof data === 'number') {
        activeViewerIdsRef.current.delete(currentUserId);
        setViewerCount(data);
      }
    }
    
    await leaveChannel();
    // Navigate directly to home page - NOT navigate(-1) which causes double tab issue
    navigate('/', { replace: true });
  };

  const handleCall = () => {
    // Pkg: Direct call as requested - bypassing confirmation modal
    handleConfirmCall();
  };

  const handleConfirmCall = async () => {
    if (!hostInfo?.id || !currentUserId) return;
    
    setShowCallConfirm(false);
    
    // ✅ FIX: Use unified call system (useCall) instead of direct RPC
    // This ensures proper call state management, billing, and prevents auto-close
    try {
      const callId = await unifiedStartCall(hostInfo.id, id || undefined);
      if (callId) {
        console.log('[LiveStream] Call started via unified system:', callId);
      }
    } catch (error: any) {
      console.error("Error starting call:", error);
      recordClientError({ label: "LiveStream.callId", message: error instanceof Error ? error.message : String(error) });
      toast.error(error.message || "Failed to start call");
    }
  };

  const handleShare = async () => {
    // Use production domain for sharing
    const { generateLiveStreamLink, shareLink } = await import('@/utils/shareLinks');
    const link = generateLiveStreamLink(id || '');
    const success = await shareLink(link, {
      title: `${streamData?.host?.display_name || 'Host'}'s Live Stream`,
      text: 'Join my live stream on MeriLive!'
    });
    if (success) toast.success("Share link copied!");
  };

  // Handle profile click - fetch full profile data and show premium card
  const handleProfileClick = async (userId: string) => {
    try {
      const { data: profile } = await supabase
        .from("profiles_public")
        .select("id, display_name, avatar_url, user_level, is_verified, country_name, country_flag, bio, app_uid")
        .eq("id", userId)
        .single();
      
      if (profile) {
        // Get follower/following counts
        const [{ count: followersCount }, { count: followingCount }] = await Promise.all([
          supabase.from("followers").select("*", { count: "exact", head: true }).eq("following_id", userId),
          supabase.from("followers").select("*", { count: "exact", head: true }).eq("follower_id", userId),
        ]);

        // Check if current user follows this profile
        let isFollowing = false;
        if (currentUserId) {
          const { data: followData } = await supabase
            .from("followers")
            .select("id")
            .eq("follower_id", currentUserId)
            .eq("following_id", userId)
            .maybeSingle();
          isFollowing = !!followData;
        }

        setSelectedProfile({
          id: profile.id,
          name: profile.display_name || "User",
          avatar: normalizeProfileMediaUrl(profile.avatar_url) || profile.avatar_url || "",
          level: profile.user_level || 1,
          coins: 0,
          beans: 0,
          isFollowing,
          isVIP: (profile.user_level || 1) >= 30,
          isVerified: profile.is_verified || false,
          totalGiftsSent: 0,
          totalGiftsReceived: 0,
          followers: followersCount || 0,
          following: followingCount || 0,
          country: profile.country_name,
          countryFlag: profile.country_flag,
          bio: profile.bio,
          uid: profile.app_uid,
        });
        setShowProfileCard(true);
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
      recordClientError({ label: "LiveStream.handleProfileClick", message: error instanceof Error ? error.message : String(error) });
    }
  };

  const handleFollowFromCard = async (viewerId: string) => {
    if (!currentUserId) {
      toast.error("Please login first");
      return;
    }
    
    try {
      if (selectedProfile?.isFollowing) {
        await supabase
          .from("followers")
          .delete()
          .eq("follower_id", currentUserId)
          .eq("following_id", viewerId);
        toast.success("Unfollowed successfully");
      } else {
        await supabase
          .from("followers")
          .insert({ follower_id: currentUserId, following_id: viewerId });
        toast.success("Following!");
      }
      
      // Update local state
      setSelectedProfile(prev => prev ? { ...prev, isFollowing: !prev.isFollowing } : null);
    } catch (error) {
      console.error("Error following:", error);
      recordClientError({ label: "LiveStream.handleFollowFromCard", message: error instanceof Error ? error.message : String(error) });
    }
  };

  // Follow Host from header heart button
  const [isFollowingHost, setIsFollowingHost] = useState(false);
  
  // Check if already following host on mount
  useEffect(() => {
    const checkFollowStatus = async () => {
      if (!currentUserId || !hostInfo?.id) return;
      
      const { data } = await supabase
        .from("followers")
        .select("id")
        .eq("follower_id", currentUserId)
        .eq("following_id", hostInfo.id)
        .maybeSingle();
      
      setIsFollowingHost(!!data);
    };
    checkFollowStatus();
  }, [currentUserId, hostInfo?.id]);

  const handleFollowHost = async () => {
    if (!currentUserId) {
      toast.error("Please login first");
      return;
    }
    if (!hostInfo?.id) return;
    
    try {
      if (isFollowingHost) {
        await supabase
          .from("followers")
          .delete()
          .eq("follower_id", currentUserId)
          .eq("following_id", hostInfo.id);
        setIsFollowingHost(false);
        toast.success("Unfollowed");
      } else {
        await supabase
          .from("followers")
          .insert({ follower_id: currentUserId, following_id: hostInfo.id });
        setIsFollowingHost(true);
        toast.success("Following! ❤️");
      }
    } catch (error) {
      console.error("Error following host:", error);
      recordClientError({ label: "LiveStream.handleFollowHost", message: error instanceof Error ? error.message : String(error) });
    }
  };

  const handleMessageFromCard = (viewerId: string) => {
    setShowProfileCard(false);
    navigate(`/chat/${viewerId}`);
  };

  const handleGiftFromCard = (viewerId: string) => {
    setShowProfileCard(false);
    setShowGiftPanel(true);
  };

  const gifts = [
    { id: "1", name: "Rose", icon: "🌹", coins: 10 },
    { id: "2", name: "Heart", icon: "❤️", coins: 50 },
    { id: "3", name: "Kiss", icon: "💋", coins: 100 },
    { id: "4", name: "Diamond", icon: "💎", coins: 500 },
    { id: "5", name: "Crown", icon: "👑", coins: 1000 },
    { id: "6", name: "Rocket", icon: "🚀", coins: 5000 },
  ];

  // PK Battle handlers
  const handleOpenPKPanel = () => {
    if (!isHost) {
      toast.error("Only hosts can start PK Battle");
      return;
    }
    setShowMoreOptions(false);
    setShowPKPanel(true);
  };

  const handlePKBattleStarted = (battleId: string, opponentInfo: any) => {
    if (!hostInfo) return;
    setShowPKPanel(false);
    setPKBattleState({
      isActive: true,
      battleId,
      isChallenger: true,
      challengerInfo: {
        name: hostInfo.name,
        avatar: hostInfo.avatar,
        level: hostInfo.level,
        id: currentUserId || "",
        streamId: id || "",
      },
      opponentInfo: {
        name: opponentInfo.display_name,
        avatar: opponentInfo.avatar_url,
        level: opponentInfo.user_level,
        id: opponentInfo.id,
        streamId: opponentInfo.stream_id || "",
      },
    });
  };

  const handlePKRequestAccept = async () => {
    if (!incomingPKRequest || !hostInfo || !currentUserId) return;

    setShowPKRequest(false);

    // Persist accept on the battle row (audit/state of truth).
    await supabase
      .from("pk_battles")
      .update({ status: "accepted", started_at: new Date().toISOString() })
      .eq("id", incomingPKRequest.battleId);

    // Pkg82d: notify challenger via FCM (replaces `pk_battle_${battleId}` channel).
    try {
      await supabase.functions.invoke("pk-invite-deliver", {
        body: {
          kind: "accept",
          battleId: incomingPKRequest.battleId,
          toUserId: incomingPKRequest.challengerId,
          fromUserId: currentUserId,
          fromName: hostInfo.name,
          fromAvatar: hostInfo.avatar,
          fromLevel: hostInfo.level,
        },
      });
    } catch (err) {
      console.warn("[LiveStream] pk-invite-deliver accept failed:", err);
    }

    // Fetch battle row for stream IDs (needed for PK cross-room audio bridge).
    const { data: battle } = await supabase
      .from("pk_battles")
      .select("challenger_stream_id, opponent_stream_id, challenger_id, opponent_id")
      .eq("id", incomingPKRequest.battleId)
      .maybeSingle();

    const challengerStreamId = battle?.challenger_stream_id || "";
    const opponentStreamId = battle?.opponent_stream_id || "";

    setPKBattleState({
      isActive: true,
      battleId: incomingPKRequest.battleId,
      isChallenger: false,
      challengerInfo: {
        name: incomingPKRequest.challengerName,
        avatar: incomingPKRequest.challengerAvatar,
        level: incomingPKRequest.challengerLevel,
        id: incomingPKRequest.challengerId,
        streamId: challengerStreamId,
      },
      opponentInfo: {
        name: hostInfo.name,
        avatar: hostInfo.avatar,
        level: hostInfo.level,
        id: currentUserId || "",
        streamId: opponentStreamId,
      },
    });
  };

  const handlePKRequestDecline = async () => {
    setShowPKRequest(false);
    if (incomingPKRequest && currentUserId && hostInfo) {
      try {
        await supabase
          .from("pk_battles")
          .update({ status: "declined" })
          .eq("id", incomingPKRequest.battleId);
        await supabase.functions.invoke("pk-invite-deliver", {
          body: {
            kind: "decline",
            battleId: incomingPKRequest.battleId,
            toUserId: incomingPKRequest.challengerId,
            fromUserId: currentUserId,
            fromName: hostInfo.name,
            fromAvatar: hostInfo.avatar,
            fromLevel: hostInfo.level,
          },
        });
      } catch (err) {
        console.warn("[LiveStream] pk-invite-deliver decline failed:", err);
      }
    }
    setIncomingPKRequest(null);

  };

  // Random PK handlers
  const handleRandomPKAccept = async () => {
    if (!randomPKRequest || !hostInfo || !currentUserId || !id) return;

    setShowRandomPKNotification(false);

    // Pkg82d: send `random_accept` via pk-invite-deliver (FCM) — replaces
    // `pk_random_match` Supabase broadcast bus.
    try {
      await supabase.functions.invoke("pk-invite-deliver", {
        body: {
          kind: "random_accept",
          toUserId: randomPKRequest.challengerId,
          fromUserId: currentUserId,
          fromName: hostInfo.name,
          fromAvatar: hostInfo.avatar,
          fromLevel: hostInfo.level,
          fromStreamId: id,
        },
      });
    } catch (err) {
      console.warn("[LiveStream] pk-invite-deliver random_accept failed:", err);
    }

    // Challenger receives FCM and creates the pk_battles row with status='accepted'
    // (see PKBattlePanel sendRandomPKRequest handler). Poll briefly for it.
    setTimeout(async () => {
      const { data: battle } = await supabase
        .from("pk_battles")
        .select("id, challenger_stream_id, opponent_stream_id, challenger_id, opponent_id")
        .or(
          `and(challenger_id.eq.${randomPKRequest.challengerId},opponent_id.eq.${currentUserId}),and(challenger_id.eq.${currentUserId},opponent_id.eq.${randomPKRequest.challengerId})`
        )
        .eq("status", "accepted")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (battle) {
        setPKBattleState({
          isActive: true,
          battleId: battle.id,
          isChallenger: false,
          challengerInfo: {
            name: randomPKRequest.challengerName,
            avatar: randomPKRequest.challengerAvatar,
            level: randomPKRequest.challengerLevel,
            id: randomPKRequest.challengerId,
            streamId: battle.challenger_stream_id || "",
          },
          opponentInfo: {
            name: hostInfo.name,
            avatar: hostInfo.avatar,
            level: hostInfo.level,
            id: currentUserId,
            streamId: battle.opponent_stream_id || "",
          },
        });
      }
    }, 2000);

    setRandomPKRequest(null);
  };


  const handleRandomPKDecline = () => {
    setShowRandomPKNotification(false);
    setRandomPKRequest(null);
  };

  const handlePKBattleEnd = (winnerId: string | null) => {
    if (!pkBattleState.challengerInfo || !pkBattleState.opponentInfo) return;

    const isDraw = winnerId === null;
    const isWinner = winnerId === currentUserId;

    setPKResult({
      isWinner,
      isDraw,
      winnerName: isWinner || isDraw ? pkBattleState.challengerInfo.name : pkBattleState.opponentInfo.name,
      winnerAvatar: isWinner || isDraw ? pkBattleState.challengerInfo.avatar : pkBattleState.opponentInfo.avatar,
      winnerScore: 0, // Will be updated from battle data
      loserName: isWinner ? pkBattleState.opponentInfo.name : pkBattleState.challengerInfo.name,
      loserAvatar: isWinner ? pkBattleState.opponentInfo.avatar : pkBattleState.challengerInfo.avatar,
      loserScore: 0,
    });
    
    setPKBattleState({
      isActive: false,
      battleId: null,
      isChallenger: false,
      challengerInfo: null,
      opponentInfo: null,
    });
    
    setShowPKResult(true);
  };

  const handleClosePKResult = () => {
    setShowPKResult(false);
    setPKResult(null);
  };

  // Pkg131: raise-hand queue (live) — used for viewer toggle label + host count badge.
  const raisedHands = useRaisedHands('live', id);
  useLiveKitRpcHandlers('live', id);
  const iHaveRaised = !!(currentUserId && raisedHands.some(h => h.identity === currentUserId));

  const handleToggleRaiseHand = async () => {
    if (!id) return;
    setShowMoreOptions(false);
    try {
      if (iHaveRaised) {
        await lowerHand('live', id);
        toast.success("Hand lowered");
      } else {
        const ok = await raiseHand('live', id);
        if (ok) toast.success("Hand raised — host will see your request");
        else toast.error("Couldn't raise hand. Try again.");
      }
    } catch {
      toast.error("Couldn't update raise-hand state.");
    }
  };

  // Base options for ALL users (viewers + host). Now includes Like — per UX
  // refresh the heart button moved off the bottom bar into More so the chat
  // input gets more breathing room.
  const baseOptions = [
    { id: "like", name: "Like", iconName: "Heart" as const, color: "from-rose-400 to-pink-500", shadowColor: "shadow-rose-500/40", action: () => { setShowMoreOptions(false); handleLike(); } },
    { id: "share", name: "Share", iconName: "Share2" as const, color: "from-cyan-400 to-blue-500", shadowColor: "shadow-cyan-500/40", action: handleShare },
    { id: "tasks", name: "Tasks", iconName: "ClipboardList" as const, color: "from-amber-400 to-orange-500", shadowColor: "shadow-amber-500/40", action: () => navigate("/tasks") },
    { id: "topup", name: "Top Up", iconName: "Gem" as const, color: "from-emerald-400 to-teal-500", shadowColor: "shadow-emerald-500/40", action: () => navigate("/recharge") },
    { id: "music", name: "Music", iconName: "Music" as const, color: "from-fuchsia-400 to-pink-500", shadowColor: "shadow-fuchsia-500/40", action: () => { setShowMoreOptions(false); setShowMusicPlayer(true); } },
    { id: "react", name: "React", iconName: "Smile" as const, color: "from-yellow-400 to-orange-500", shadowColor: "shadow-yellow-500/40", action: () => { setShowMoreOptions(false); setShowReactionPicker(true); } },
  ];

  // Host-only options: Beauty + Mic toggle + PK Battle (all moved off bottom
  // bar). Beauty uses its own Sparkles icon (was rendering blank before).
  const hostOnlyOptions = [
    { id: "mic", name: isHostMicMuted ? "Unmute" : "Mute", iconName: (isHostMicMuted ? "MicOff" as const : "Mic" as const), color: isHostMicMuted ? "from-red-400 to-rose-600" : "from-cyan-400 to-teal-500", shadowColor: "shadow-cyan-500/40", action: () => { setShowMoreOptions(false); const next = !isHostMicMuted; setIsHostMicMuted(next); toggleAudio(!next); } },
    { id: "pk", name: "PK Battle", iconName: "Swords" as const, color: "from-amber-400 to-orange-600", shadowColor: "shadow-amber-500/40", action: () => { setShowMoreOptions(false); handleOpenPKPanel(); } },
    { id: "beauty", name: "Beauty", iconName: "Sparkles" as const, color: "from-pink-400 to-purple-500", shadowColor: "shadow-pink-500/40", action: () => { setShowMoreOptions(false); setShowBeautyPanel(true); if (beauty.isNativeAndroid) { void beauty.openBeautyPanel().catch(() => { /* native optional */ }); } } },
  ];

  // Combined options - host sees host-only + base, viewers see base only
  const moreOptions = isHost ? [...hostOnlyOptions, ...baseOptions] : baseOptions;

  const handleSendGift = async (gift: typeof gifts[0]) => {
    if (!currentUserId || !hostInfo || !id) return;
    
    if (userCoins < gift.coins) {
      hapticFeedback('error');
      toast.error("Not enough diamonds!");
      return;
    }

    
    const result = await sendGift({
      giftId: gift.id,
      gift: {
        id: gift.id,
        name: gift.name,
        coins: gift.coins,
        category: 'popular',
        icon_url: (gift as any).icon_url || (gift as any).icon,
        animation_url: (gift as any).animation_url,
        animation_format: (gift as any).animation_format || null,
        animation_config_url: (gift as any).animation_config_url,
        sound_url: (gift as any).sound_url,
      },
      senderId: currentUserId,
      receiverId: hostInfo.id,
      quantity: 1,
      context: 'live',
      streamId: id,
    });

    if (result.success) {
      hapticFeedback('gift');
      setUserCoins(prev => prev - (result.transaction?.coins_spent || gift.coins));
      setShowGiftPanel(false);
    } else {
      hapticFeedback('error');
      toast.error(result?.error || "Failed to send gift");
    }

  };

  // Get remote video track (for viewers) - with logging for debugging
  const firstRemoteUser = Array.from(remoteUsers.values()).find((user: any) => user?.hasVideo && user?.videoTrack)
    ?? Array.from(remoteUsers.values())[0];
  const remoteVideoTrack = firstRemoteUser?.videoTrack ?? null;
  const showNativeHostSurface = isHost && isNativeMediaActive && !localVideoTrack;
  const showHostTransitionPreview = isHost && !localVideoTrack && !!hostTransitionPreviewStream;
  // Debug: Log remote video state changes
  useEffect(() => {
    if (!isHost) {
      console.log(`🎥 Viewer video state: remoteUsers=${remoteUsers.size}, hasVideoTrack=${!!remoteVideoTrack}, isJoined=${isJoined}, connectionState=${connectionState}`);
    }
  }, [remoteUsers.size, !!remoteVideoTrack, isJoined, connectionState, isHost]);

  // Auto-retry subscription for viewers - ultra-fast early retries for first-frame speed
  // Plus a long-term watchdog that keeps retrying every 4s for up to 60s so a
  // viewer never gets stranded on the blurred-avatar fallback after the 1.2s burst.
  useEffect(() => {
    if (isHost || !isJoined || remoteVideoTrack) return;

    const retryDelays = [0, 90, 220, 420, 760, 1150];
    const retryTimers = retryDelays.map((delay, index) =>
      setTimeout(() => {
        if (!remoteVideoTrack) {
          console.log(`⏰ No remote video after ${delay}ms, retrying subscription (${index + 1}/${retryDelays.length})...`);
          retrySubscription();
        }
      }, delay)
    );

    // Long-term recovery: keep nudging the SFU every 4s for the first minute.
    // Stops as soon as remoteVideoTrack arrives (effect re-runs and skips early).
    let longAttempts = 0;
    const longTimer = setInterval(() => {
      if (remoteVideoTrack) { clearInterval(longTimer); return; }
      longAttempts++;
      if (longAttempts > 15) { clearInterval(longTimer); return; }
      console.log(`⏰ Long-watchdog: no remote video, retry ${longAttempts}/15`);
      try { retrySubscription(); } catch { /* ignore */ }
    }, 4000);

    return () => {
      retryTimers.forEach(clearTimeout);
      clearInterval(longTimer);
    };
  }, [isHost, isJoined, remoteVideoTrack, retrySubscription]);

  // 🚨 Host camera watchdog — if isJoined but no localVideoTrack arrives within
  // 6s (and we're not on native surface), show a visible recover overlay so the
  // host is never stuck staring at a blank/white/dark screen silently.
  const [showHostCameraRecover, setShowHostCameraRecover] = useState(false);
  useEffect(() => {
    if (!isHost || !isJoined) { setShowHostCameraRecover(false); return; }
    if (localVideoTrack || isNativeMediaActive) { setShowHostCameraRecover(false); return; }
    const t = setTimeout(() => setShowHostCameraRecover(true), 6000);
    return () => clearTimeout(t);
  }, [isHost, isJoined, localVideoTrack, isNativeMediaActive]);

  const handleHostCameraRecover = useCallback(async () => {
    setShowHostCameraRecover(false);
    try {
      const { nativeLiveKitController } = await import('@/lib/nativeLiveKitController');
      try { await nativeLiveKitController.setCameraEnabled(false); } catch { /* ignore */ }
      await new Promise((r) => setTimeout(r, 120));
      try { await nativeLiveKitController.setCameraEnabled(true); } catch { /* ignore */ }
    } catch { /* ignore */ }
    try {
      // Force a clean re-publish through the LiveKit room (web path)
      const { Track } = await import('livekit-client');
      const roomAny: any = (window as any).__livekitRoom;
      if (roomAny?.localParticipant) {
        try { await roomAny.localParticipant.setCameraEnabled(false); } catch { /* ignore */ }
        await new Promise((r) => setTimeout(r, 120));
        try { await claimAndroidWebViewCamera('livestream:web-recover-camera'); } catch { /* ignore */ }
        try { await roomAny.localParticipant.setCameraEnabled(true); } catch { /* ignore */ }
        try { await roomAny.localParticipant.setMicrophoneEnabled(true); } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
    // Pkg418: track was just republished — re-apply beauty filters so the
    // host's professional look survives the recover handshake.
    try { window.dispatchEvent(new CustomEvent('beauty:reapply')); } catch { /* ignore */ }
    toast.info('Restarting camera…');
  }, []);

  const syncedFilterCSS = generateSyncedFilterCSS();
  const combinedFilterCSS = syncedFilterCSS || getBeautyFilterCSS();

  // Live End Summary Modal
  // Minimal loading state - show spinner in corner only (fast perceived load)
  // Do NOT block the entire screen with heavy loading overlay

  // ⚡ INSTANT ENGAGEMENT: No reconnecting overlay - video keeps playing in background
  // Reconnection happens silently without blocking the user experience

  if (showLiveEndSummary && hostInfo) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-purple-950 to-slate-950 flex flex-col items-center justify-center p-6 relative overflow-hidden">
        {/* Animated Background Orbs */}
        <motion.div
          animate={{
            scale: [1, 1.3, 1],
            opacity: [0.2, 0.4, 0.2],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute top-1/4 left-1/4 w-72 h-72 bg-purple-600/20 rounded-full"
        />
        <motion.div
          animate={{
            scale: [1.2, 1, 1.2],
            opacity: [0.2, 0.4, 0.2],
          }}
          transition={{
            duration: 5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute bottom-1/3 right-1/4 w-56 h-56 bg-pink-600/20 rounded-full"
        />

        {/* Single primary close action lives in the "Back to Home" button below — duplicate X removed */}

        {/* Host Avatar with Premium Ring */}
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", damping: 15 }}
          className="relative mb-6"
        >
          {/* Animated Glow Ring */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
            className="absolute -inset-3 rounded-full bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500 opacity-60"
          />
          
          <div className="relative w-28 h-28 rounded-full overflow-hidden border-4 border-white/20 shadow-2xl">
            <img loading="lazy" decoding="async" src={hostInfo.avatar || "/placeholder.svg"} alt={hostInfo.name} className="w-full h-full object-cover" />
          </div>
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-400 to-amber-600 px-3 py-0.5 rounded-full shadow-lg">
            <span className="text-xs font-bold text-black">Lv{hostInfo.level}</span>
          </div>
        </motion.div>

        {/* Host Name - NO STARS */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-center mb-4"
        >
          <h2 className="text-2xl font-bold text-white mb-2">
            {hostInfo.name}
          </h2>
          <div className="flex items-center justify-center gap-2">
            <Badge className="bg-white/10 text-white border-white/10">
              {hostInfo.country}
            </Badge>
            <Badge className="bg-white/10 text-white border-white/10">
              🗣️ {hostInfo.language}
            </Badge>
          </div>
        </motion.div>

        {/* Live Ended Text */}
        <motion.h3
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-lg text-white/50 mb-8"
        >
          Live Ended
        </motion.h3>

        {/* Premium Stats Card */}
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="w-full max-w-sm bg-gradient-to-br from-purple-600/90 via-purple-700/90 to-purple-800/90 rounded-3xl p-6 border border-white/10 shadow-2xl shadow-purple-500/20"
        >
          {/* Top Glow Line */}
          <div className="absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
          
          <div className="grid grid-cols-2 gap-4">
            {/* Live Duration */}
            <div className="text-center py-2">
              <p className="text-white/60 text-xs mb-1 uppercase tracking-wide">Live Duration</p>
              <p className="text-2xl font-bold text-white">{liveEndStats.duration}</p>
            </div>
            
            {/* Audiences */}
            <div className="text-center py-2">
              <p className="text-white/60 text-xs mb-1 uppercase tracking-wide">Audiences</p>
              <p className="text-2xl font-bold text-white">{liveEndStats.audiences}</p>
            </div>
            
            {/* Gift Earnings */}
            <div className="text-center py-2">
              <p className="text-white/60 text-xs mb-1 uppercase tracking-wide">Gift Earnings</p>
              <div className="flex items-center justify-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-amber-500 shadow-lg shadow-amber-500/50" />
                <span className="text-2xl font-bold text-amber-400">{liveEndStats.giftEarnings}</span>
              </div>
            </div>
            
            {/* Call Earnings */}
            <div className="text-center py-2">
              <p className="text-white/60 text-xs mb-1 uppercase tracking-wide">Call Earnings</p>
              <div className="flex items-center justify-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-amber-500 shadow-lg shadow-amber-500/50" />
                <span className="text-2xl font-bold text-amber-400">{liveEndStats.callEarnings}</span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Back to Home Button */}
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="w-full max-w-sm mt-6"
        >
          <Button
            onClick={handleCloseSummary}
            className="w-full relative overflow-hidden bg-gradient-to-r from-purple-600 via-pink-600 to-purple-600 hover:from-purple-500 hover:via-pink-500 hover:to-purple-500 text-white font-semibold rounded-2xl py-4 shadow-lg shadow-purple-500/20 transition-all duration-300 hover:shadow-purple-500/40"
          >
            {/* Shine Effect */}
            <motion.div
              animate={{
                x: ['-100%', '200%'],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                repeatDelay: 3,
                ease: "easeInOut",
              }}
              className="absolute inset-0 w-1/3 bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12"
            />
            <span className="relative">Back to Home</span>
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div 
      data-room-shell
      className={cn(
        "room-viewport flex flex-col overflow-hidden",
        // Pkg415: on native Android host path the TextureView lives behind the
        // WebView — any opaque background here paints WHITE over the camera for
        // 600-1200ms until nativeActive flips. Default to transparent on Android,
        // bg-muted only for web/iOS where a CSS-only fallback is in use.
        isNativeMediaActive || Capacitor.getPlatform() === 'android' ? "bg-transparent" : "bg-muted"
      )}
      style={{ 
        paddingTop: 'max(env(safe-area-inset-top, 0px), var(--min-top-inset, 20px))',
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), var(--min-bottom-inset, 0px))'
      }}
      onTouchStart={handleCombinedTouchStart}
      onTouchEnd={handleCombinedTouchEnd}
    >
      {/* Tap anywhere to restore UI when hidden */}
      {isUIHidden && (
        <div 
          className="absolute inset-0 z-[100]" 
          onClick={() => setIsUIHidden(false)}
        />
      )}

      {/* Swipe navigation works via touch gestures - no visible indicators */}
      {/* ==================== UNIFIED ENTRY ANIMATION ====================
          Same architecture as Gift Animation - Queue-based, ONE at a time */}
      <AnimatePresence>
        {entryAnimations.length > 0 && (
          <UnifiedEntryAnimation
            key={entryAnimations[0].id}
            entry={entryAnimations[0]}
            onComplete={() => removeEntryAnimation(entryAnimations[0].id)}
          />
        )}
      </AnimatePresence>

      {/* ==================== ENTRY NAME BAR (Compact Banner) ====================
          Queue-based: shows ONE at a time, next plays after current completes */}
      {nameBarAnimations.length > 0 && (
        <EntryNameBarAnimation
          key={nameBarAnimations[0].id}
          userName={nameBarAnimations[0].displayName}
          userLevel={nameBarAnimations[0].level}
          avatarUrl={nameBarAnimations[0].avatarUrl}
          animationUrl={nameBarAnimations[0].animationUrl}
          onComplete={() => removeNameBarAnimation(nameBarAnimations[0].id)}
        />
      )}

      {/* Bigo-Style Flying Join Banner - Shows when viewers join */}
      <BigoJoinBannerContainer
        activeNotification={activeBigoJoin}
        onComplete={completeBigoJoin}
      />

      <div className="absolute inset-0 flex items-center justify-center" style={{ background: showNativeHostSurface ? 'transparent' : 'hsl(var(--background))' }}>
        {/* Instant blurred host avatar background — visible only until video track arrives */}
        {!isHost && !remoteVideoTrack && hostInfo?.avatar && (
          <div className="absolute inset-0 z-[0]">
            <img loading="lazy" decoding="async"
              src={hostInfo.avatar}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              style={{ filter: 'blur(30px) brightness(0.4)', transform: 'scale(1.2)' }}
             
              draggable={false}
 />
          </div>
        )}
        {/* Pkg100: PK split-screen — both hosts visible during active battle */}
        {pkBattleState.isActive && opponentRoom.videoTrack ? (
          <div className="flex w-full h-full">
            {/* Left: current stream */}
            <div className="w-1/2 h-full relative border-r border-white/10">
              {isHost && localVideoTrack ? (
                <div className="w-full h-full relative" style={{ filter: combinedFilterCSS || undefined }}>
                  <LiveKitVideoPlayer
                    videoTrack={localVideoTrack}
                    mirror={true}
                    fit="cover"
                    className="absolute inset-0 w-full h-full"
                  />
                </div>
              ) : remoteVideoTrack ? (
                <div className="w-full h-full relative" style={{ filter: combinedFilterCSS || undefined }}>
                  <LiveKitVideoPlayer
                    videoTrack={remoteVideoTrack}
                    mirror={false}
                    fit="cover"
                    onVideoStalled={() => retrySubscription()}
                    className="absolute inset-0 w-full h-full"
                  />
                </div>
              ) : null}
              {/* Host label */}
              <div className="absolute bottom-2 left-2 z-10 bg-black/50 backdrop-blur-sm rounded-full px-2 py-0.5">
                <span className="text-white/90 text-[10px] font-medium">
                  {pkBattleState.isChallenger ? pkBattleState.challengerInfo?.name : pkBattleState.opponentInfo?.name}
                </span>
              </div>
            </div>
            {/* Right: opponent stream (cross-room bridge) */}
            <div className="w-1/2 h-full relative">
              <LiveKitVideoPlayer
                videoTrack={opponentRoom.videoTrack}
                mirror={false}
                fit="cover"
                className="absolute inset-0 w-full h-full"
              />
              {/* Opponent label */}
              <div className="absolute bottom-2 right-2 z-10 bg-black/50 backdrop-blur-sm rounded-full px-2 py-0.5">
                <span className="text-white/90 text-[10px] font-medium">
                  {pkBattleState.isChallenger ? pkBattleState.opponentInfo?.name : pkBattleState.challengerInfo?.name}
                </span>
              </div>
            </div>
          </div>
        ) : isHost && localVideoTrack ? (
          <div 
            className="w-full h-full relative flex items-center justify-center"
            style={{ filter: combinedFilterCSS || undefined }}
          >
            <LiveKitVideoPlayer
              videoTrack={localVideoTrack}
              mirror={true}
              fit="cover"
              className="absolute inset-0 w-full h-full"
            />
          </div>
        ) : showNativeHostSurface ? (
          <div className="absolute inset-0 pointer-events-none bg-transparent" />
        ) : showHostTransitionPreview ? (
          <video 
            ref={hostTransitionVideoRef}
            autoPlay
            playsInline
            muted
            controls={false}
            disablePictureInPicture
            disableRemotePlayback
            controlsList="nodownload nofullscreen noremoteplayback noplaybackrate"
            poster=""
            // @ts-ignore
            x5-video-player-type="h5"
            x5-video-player-fullscreen="false"
            x5-video-orientation="portrait"
            x5-playsinline="true"
            webkit-playsinline="true"
            x-webkit-airplay="deny"
            className="absolute inset-0 w-full h-full object-cover pointer-events-none camera-locked"
            style={{
              transform: 'scaleX(-1)',
              filter: combinedFilterCSS || undefined,
              WebkitAppearance: 'none',
            }}/>
        ) : isHost ? (
          <div className="absolute inset-0 z-[1] flex flex-col items-center justify-center">
            {/* Pkg381: No generic user icon — show loading shimmer behind the transparent video element */}
            <div className={`w-full h-full ${isNativeMediaActive ? 'bg-transparent' : 'bg-gradient-to-b from-slate-950 via-[#0c0818] to-slate-950'}`} />
            {showHostCameraRecover && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center z-10">
                <div className="text-white text-base font-semibold">Camera not visible</div>
                <div className="text-white/70 text-xs max-w-[260px]">
                  Your camera didn't start. Tap below to restart it. Make sure no other app is using the camera and that camera permission is granted.
                </div>
                <button
                  onClick={handleHostCameraRecover}
                  className="mt-2 px-5 py-2 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 text-white text-sm font-bold shadow-lg shadow-purple-500/30 active:scale-95 transition"
                >
                  🔄 Restart Camera
                </button>
              </div>
            )}
          </div>

        ) : remoteVideoTrack ? (
          <div 
            className="w-full h-full relative flex items-center justify-center"
            style={{ filter: combinedFilterCSS || undefined }}
          >
            <LiveKitVideoPlayer
              videoTrack={remoteVideoTrack}
              mirror={false}
              fit="cover"
              onVideoStalled={() => {
                console.log('⚠️ Remote video stalled, forcing resubscribe...');
                retrySubscription();
              }}
              className="absolute inset-0 w-full h-full"
              enablePictureInPicture
              pipId="live-host"
            />

          </div>
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/80 pointer-events-none" />
      </div>

      {/* Screen share overlay removed for privacy */}


      {/* ⚡ INSTANT ENGAGEMENT: No loading spinners - stream loads instantly */}

      {/* New Host Bonus Card - Host Only, positioned above chat - HIDE when stream ended */}
      {isHost && currentUserId && !showLiveEndSummary && (
        <div className="absolute left-3 z-35" style={{ bottom: '280px' }}>
          <NewHostBonusCard hostId={currentUserId} isStreamActive={!showLiveEndSummary} onBeansClaimed={(amount) => setTotalBeans(prev => prev + amount)} />
        </div>
      )}

      {/* Live Tasks Card - Bottom left, above chat - HIDE when stream ended */}
      {isHost && currentUserId && !showLiveEndSummary && (
        <div className="absolute left-3 z-35" style={{ bottom: '200px', maxWidth: '280px', width: '75%' }}>
          <LiveTasksCard hostId={currentUserId} />
        </div>
      )}

      {/* Floating Hearts */}
      <div className="absolute right-16 bottom-40 w-12 h-40 pointer-events-none overflow-hidden z-30">
        <AnimatePresence>
          {floatingHearts.map((heart) => (
            <motion.div
              key={heart.id}
              className="absolute bottom-0"
              style={{ left: `${heart.x}%` }}
              initial={{ y: 0, opacity: 1, scale: 1 }}
              animate={{ y: -150, opacity: 0, scale: [1, 1.3, 0.9] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 2, ease: "easeOut" }}
            >
              <Heart className="w-6 h-6 text-pink-500 fill-pink-500" />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Top Bar - Premium Professional Design */}
      <motion.div 
        animate={{ opacity: isUIHidden ? 0 : 1, y: isUIHidden ? -60 : 0 }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        className="fixed left-0 right-0 z-[90] px-2.5 sm:px-3"
        data-testid="live-host-identity-header"
        style={{
          top: 'max(calc(env(safe-area-inset-top, 0px) + 8px), 12px)',
          pointerEvents: isUIHidden ? 'none' : 'auto',
        }}
      >
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-1.5 w-full">
          {/* Left Section - Live Badge + Host Info */}
          <div className="min-w-0 flex items-center">
            {/* Host Info Pill with embedded LIVE indicator */}
            {hostInfo ? (
              <motion.div 
                className="min-w-0 max-w-[calc(100vw-108px)] flex items-center gap-2 rounded-full p-[4px] pr-2.5"
                style={{
                  background: 'linear-gradient(135deg, rgba(0,0,0,0.76) 0%, rgba(30,20,50,0.82) 100%)',
                  border: '1px solid rgba(255,255,255,0.16)',
                  boxShadow: '0 6px 24px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.1)',
                  backdropFilter: 'blur(14px)',
                }}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ type: "spring", damping: 20, stiffness: 150 }}
              >
                {/* LIVE indicator dot - positioned on avatar */}
                <div className="relative shrink-0">
                  <button 
                    type="button"
                    className="block cursor-pointer"
                    onClick={() => navigate(`/profile/${hostInfo.id}`)}
                    aria-label={`${hostInfo.name} profile`}
                  >
                    <AvatarWithFrame
                      userId={hostInfo.id}
                      src={hostInfo.avatar}
                      name={hostInfo.name}
                      level={hostInfo.level}
                      isHost={true}
                      gender={(hostInfo.gender || '').toLowerCase() === 'male' ? 'male' : 'female'}
                      size="sm"
                      showFrame={true}
                      showAnimation={true}
                      showGlow={hostInfo.level >= 10}
                      frameId={hostInfo.frameId || undefined}
                    />
                  </button>
                  <div className="absolute -top-1 -left-1 z-20">
                    <div className="relative flex items-center gap-[2px] px-[5px] py-[1px] rounded-full" 
                      style={{ background: 'linear-gradient(135deg, #ff3b5c, #ff1744)' }}>
                      <div className="w-[4px] h-[4px] bg-white rounded-full animate-pulse" />
                      <span className="text-white text-[6px] font-black tracking-wider">LIVE</span>
                    </div>
                  </div>
                </div>
                
                <button 
                  type="button"
                  className="min-w-0 flex flex-col items-start cursor-pointer text-left"
                  onClick={() => navigate(`/profile/${hostInfo.id}`)}
                >
                  <div className="min-w-0 flex items-center gap-1.5 max-w-[112px] sm:max-w-[160px]">
                    <span className="text-white font-semibold text-[12px] truncate leading-tight">{hostInfo.name}</span>
                    <LevelBadge level={hostInfo.level} size="xs" animated={false} />
                  </div>
                  <div className="flex items-center gap-1 leading-none mt-0.5">
                    <span className="text-white/65 text-[8px] font-semibold">ID {hostInfo.appUid || hostInfo.id.slice(0, 6)}</span>
                    <span className="text-white/35 text-[8px]">•</span>
                    <BeansIcon size={10} />
                    <span className="text-[9px] font-bold" style={{ color: '#ffb74d' }}>
                      {totalBeans >= 1000 ? `${(totalBeans / 1000).toFixed(1)}K` : totalBeans}
                    </span>
                  </div>
                </button>
                
                {!isFollowingHost ? (
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.85 }}
                    onClick={handleFollowHost}
                    aria-label="Follow host"
                    className="relative w-7 h-7 shrink-0 flex items-center justify-center rounded-full overflow-hidden"
                    style={{
                      background: 'linear-gradient(135deg, #ec4899, #f43f5e)',
                      boxShadow: '0 2px 8px rgba(236,72,153,0.5)',
                    }}
                  >
                    <Heart className="w-3.5 h-3.5 text-white relative z-10" strokeWidth={2.5} />
                  </motion.button>
                ) : (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg, #34d399, #10b981)' }}
                  >
                    <Heart className="w-3.5 h-3.5 text-white fill-white" strokeWidth={0} />
                  </motion.div>
                )}
              </motion.div>
            ) : (
              <div className="h-12 w-[180px] rounded-full bg-black/55 border border-white/10 backdrop-blur-md" />
            )}
          </div>

          {/* Right Section - Viewer Avatars + Count + Close */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Recent Viewer Avatars + Count combined pill */}
            <button
              onClick={() => setShowViewerList(true)}
              className="flex items-center gap-0.5 px-1 py-[3px] rounded-full"
              style={{
                background: 'linear-gradient(135deg, rgba(0,0,0,0.64), rgba(20,15,35,0.76))',
                border: '1px solid rgba(255,255,255,0.12)',
                boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
                backdropFilter: 'blur(12px)',
              }}
            >
              {/* Viewer Avatars inside the pill */}
              <div className="flex items-center -space-x-1.5 ml-0.5">
                {recentViewerAvatars.length > 0 ? (
                  recentViewerAvatars.slice(0, 2).map((viewer, i) => (
                    <div 
                      key={viewer.id}
                      className="relative"
                      style={{ 
                        zIndex: 4 - i,
                        width: 30,
                        height: 30,
                      }}
                    >
                      <AvatarWithFrame
                        userId={viewer.id}
                        src={viewer.avatar_url}
                        name={viewer.name}
                        level={viewer.user_level || 1}
                        size="xxs"
                        showAnimation={false}
                        showFrame={true}
                        showGlow={false}
                      />
                    </div>
                  ))
                ) : (
                  <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center">
                    <Users className="w-3 h-3 text-white/50" />
                  </div>
                )}
              </div>
              {/* Count */}
              <div className="flex items-center gap-[3px] px-1.5">
                <div className="w-[5px] h-[5px] rounded-full" style={{ background: connectionState === 'CONNECTED' ? '#4ade80' : '#facc15', boxShadow: connectionState === 'CONNECTED' ? '0 0 6px #4ade80' : '0 0 6px #facc15' }} />
                <AnimatedViewerCount value={viewerCount} connected={connectionState === 'CONNECTED'} />
              </div>
            </button>

            {/* Close Button — Premium shared component w/ double-fire guard */}
            <PremiumCloseButton
              variant="dark"
              size={36}
              iconSize={16}
              onClick={isHost ? handleEndStream : handleLeaveStream}
              aria-label={isHost ? 'End live stream' : 'Leave live stream'}
            />
          </div>
        </div>
      </motion.div>

      {/* Legacy top-bar copy intentionally disabled: restored header above is fixed and safe-area locked. */}
      {false && (
      <motion.div 
        animate={{ opacity: isUIHidden ? 0 : 1, y: isUIHidden ? -60 : 0 }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        className="relative z-20 px-3 pt-2 pb-1"
        style={{ pointerEvents: isUIHidden ? 'none' : 'auto' }}
      >
        <div className="flex items-center justify-between">
          {/* Left Section - Live Badge + Host Info */}
          <div className="flex items-center gap-1.5">
            {/* Host Info Pill with embedded LIVE indicator */}
            {hostInfo && (
              <motion.div 
                className="flex items-center gap-1.5 rounded-full p-[3px] pr-2"
                style={{
                  background: 'linear-gradient(135deg, rgba(0,0,0,0.7) 0%, rgba(30,20,50,0.75) 100%)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  boxShadow: '0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)',
                }}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ type: "spring", damping: 20, stiffness: 150 }}
              >
                {/* LIVE indicator dot - positioned on avatar */}
                <div className="relative">
                  <div 
                    className="cursor-pointer"
                    onClick={() => navigate(`/profile/${hostInfo.id}`)}
                  >
                    <AvatarWithFrame
                      userId={hostInfo.id}
                      src={hostInfo.avatar}
                      name={hostInfo.name}
                      level={hostInfo.level}
                      isHost={true}
                      size="xs"
                      showFrame={true}
                      showAnimation={true}
                      showGlow={hostInfo.level >= 10}
                    />
                  </div>
                  {/* Live pulse dot on avatar */}
                  <div className="absolute -top-0.5 -left-0.5 z-20">
                    <div className="relative flex items-center gap-[2px] px-[5px] py-[1px] rounded-full" 
                      style={{ background: 'linear-gradient(135deg, #ff3b5c, #ff1744)' }}>
                      <div className="w-[4px] h-[4px] bg-white rounded-full animate-pulse" />
                      <span className="text-white text-[6px] font-black tracking-wider">LIVE</span>
                    </div>
                  </div>
                </div>
                
                <div 
                  className="flex flex-col min-w-0 cursor-pointer"
                  onClick={() => navigate(`/profile/${hostInfo.id}`)}
                >
                  <span className="text-white font-semibold text-[11px] truncate max-w-[55px] leading-tight">{hostInfo.name}</span>
                  {/* Beans Display */}
                  <div className="flex items-center gap-0.5">
                    <BeansIcon size={10} />
                    <span className="text-[9px] font-bold leading-tight" style={{ color: '#ffb74d' }}>
                      {totalBeans >= 1000 ? `${(totalBeans / 1000).toFixed(1)}K` : totalBeans}
                    </span>
                  </div>
                </div>
                
                {/* Follow/Love Button */}
                {!isFollowingHost ? (
                  <motion.button
                    whileTap={{ scale: 0.85 }}
                    onClick={handleFollowHost}
                    className="relative w-[22px] h-[22px] flex items-center justify-center rounded-full overflow-hidden ml-0.5"
                    style={{
                      background: 'linear-gradient(135deg, #ec4899, #f43f5e)',
                      boxShadow: '0 2px 8px rgba(236,72,153,0.5)',
                    }}
                  >
                    <Heart className="w-3 h-3 text-white relative z-10" strokeWidth={2.5} />
                  </motion.button>
                ) : (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="w-[22px] h-[22px] rounded-full flex items-center justify-center ml-0.5"
                    style={{ background: 'linear-gradient(135deg, #34d399, #10b981)' }}
                  >
                    <Heart className="w-3 h-3 text-white fill-white" strokeWidth={0} />
                  </motion.div>
                )}
              </motion.div>
            )}
          </div>

          {/* Right Section - Viewer Avatars + Count + Close */}
          <div className="flex items-center gap-1">
            {/* Recent Viewer Avatars + Count combined pill */}
            <button
              onClick={() => setShowViewerList(true)}
              className="flex items-center gap-0.5 px-1 py-[3px] rounded-full"
              style={{
                background: 'linear-gradient(135deg, rgba(0,0,0,0.6), rgba(20,15,35,0.7))',
                border: '1px solid rgba(255,255,255,0.12)',
                boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
              }}
            >
              {/* Viewer Avatars inside the pill */}
              <div className="flex items-center -space-x-1.5 ml-0.5">
                {recentViewerAvatars.length > 0 ? (
                  recentViewerAvatars.slice(0, 3).map((viewer, i) => (
                    <div 
                      key={viewer.id}
                      className="relative"
                      style={{ 
                        zIndex: 4 - i,
                        width: 34,
                        height: 34,
                      }}
                    >
                      <AvatarWithFrame
                        userId={viewer.id}
                        src={viewer.avatar_url}
                        name={viewer.name}
                        level={viewer.user_level || 1}
                        size="xs"
                        showAnimation={false}
                        showFrame={true}
                        showGlow={false}
                      />
                    </div>
                  ))
                ) : (
                  <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center">
                    <Users className="w-3 h-3 text-white/50" />
                  </div>
                )}
              </div>
              {/* Count */}
              <div className="flex items-center gap-[3px] px-1.5">
                <div className="w-[5px] h-[5px] rounded-full" style={{ background: connectionState === 'CONNECTED' ? '#4ade80' : '#facc15', boxShadow: connectionState === 'CONNECTED' ? '0 0 6px #4ade80' : '0 0 6px #facc15' }} />
                <AnimatedViewerCount value={viewerCount} connected={connectionState === 'CONNECTED'} />
              </div>
            </button>

            {/* Close Button — 36px tap target */}
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={isHost ? handleEndStream : handleLeaveStream}
              aria-label={isHost ? 'End live stream' : 'Leave live stream'}
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, rgba(0,0,0,0.6), rgba(20,15,35,0.7))',
                border: '1px solid rgba(255,255,255,0.1)',
                boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
              }}
            >
              <X className="w-4 h-4 text-white/85" />
            </motion.button>
          </div>
        </div>
      </motion.div>
      )}

      {/* ==================== MESSAGES AREA - ABOVE INPUT BOX ==================== */}
      {/* Public chat area visible to all viewers */}
      {/* Welcome message at bottom, messages stack upward - SAME as Party Room */}
      <motion.div 
        animate={{ opacity: isUIHidden ? 0 : 1, y: isUIHidden ? 80 : 0 }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        className="absolute left-0 right-0 z-30 flex flex-col justify-end pointer-events-none"
        style={{ bottom: '72px', maxHeight: '40vh', pointerEvents: isUIHidden ? 'none' : undefined }}
      >
        <div className="px-3 pointer-events-auto" style={{ pointerEvents: isUIHidden ? 'none' : 'auto' }}>
          {/* UNIFIED Chat Overlay - ONE LINK for Live + Party */}
          {/* Change RoomChatOverlay in shared/room = Change here + Party Room */}
          {/* All messages are PUBLIC and visible to everyone */}
          <RoomChatOverlay 
            messages={messages}
            joinNotifications={liveJoinNotifications}
            maxMessages={60}
            maxHeight="45vh"
            showWelcome={true}
            hostName={hostInfo?.name}
            hostLevel={hostInfo?.level}
            roomTitle={streamTitle || streamData?.title}
            roomType="live"
            adminBannerRoomType="live"
          />
        </div>
      </motion.div>

      {/* Pkg145: Realtime captions overlay (rides Pkg116 transcription kill-switch) */}
      {id && <CaptionOverlay scope="live" id={id} hideToggle />}

      {/* Pkg189: Removed top-left utility buttons (PiP / Audio-only / Quality) per user request */}




      {/* Bottom Section - Input Bar & Action Buttons */}
      <motion.div 
        animate={{ opacity: isUIHidden ? 0 : 1, y: isUIHidden ? 100 : 0 }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        className="absolute bottom-0 left-0 right-0 z-20"
        style={{ pointerEvents: isUIHidden ? 'none' : 'auto' }}
      >

        {/* Host Filter Controls - Ultra Compact */}
        {/* Host filter controls moved to More Options panel */}

        {/* Input & Action Buttons Bar - Premium 3D Design */}
        <div className="px-1.5 md:px-6 flex items-center gap-1 md:gap-3 pt-3 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] md:pb-[calc(env(safe-area-inset-bottom)+1rem)]"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.28) 65%, transparent 100%)' }}
        >
          {/* Chat Input — Glass pill with gradient send FAB */}
          <div className="flex-1 min-w-[88px] relative">
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Say something..."
              className="w-full h-9 md:h-10 rounded-full text-white text-xs pl-3.5 md:pl-4 pr-10 placeholder:text-white/55"
              style={{
                background: 'linear-gradient(180deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.06) 100%)',
                border: '1px solid rgba(255,255,255,0.18)',
                color: 'white',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), 0 4px 14px rgba(0,0,0,0.35)',
                backdropFilter: 'blur(14px)',
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
            />
            <motion.button
              type="button"
              whileTap={{ scale: 0.88 }}
              whileHover={{ scale: 1.06 }}
              aria-label="Send message"
              className="absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center overflow-hidden"
              style={{
                background: 'radial-gradient(120% 120% at 30% 20%, #c4b5fd 0%, #8b5cf6 40%, #6d28d9 100%)',
                boxShadow: '0 4px 12px rgba(139,92,246,0.55), inset 0 1px 0 rgba(255,255,255,0.55), inset 0 -2px 4px rgba(0,0,0,0.25)',
              }}
              onClick={handleSendMessage}
            >
              <span className="absolute inset-x-1 top-0.5 h-1.5 rounded-full pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.6), transparent)' }} />
              <Send className="w-4 h-4 text-white relative z-10" strokeWidth={2.3} />
            </motion.button>
          </div>

          {/* Action Buttons — Premium 3D orbs */}
          {shouldShowCallButton && (
            <motion.button
              whileTap={{ scale: 0.88 }}
              whileHover={{ scale: 1.06 }}
              onClick={handleCall}
              aria-label="Start private call"
              className="relative w-9 h-9 md:w-12 md:h-12 rounded-full flex items-center justify-center shrink-0 overflow-hidden"
              style={{
                background: 'radial-gradient(120% 120% at 30% 20%, #86efac 0%, #22c55e 45%, #047857 100%)',
                boxShadow: '0 6px 18px rgba(34,197,94,0.55), inset 0 1px 0 rgba(255,255,255,0.55), inset 0 -3px 6px rgba(0,0,0,0.22)',
              }}
            >
              <span className="absolute inset-x-1 top-0.5 h-2 rounded-full pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.55), transparent)' }} />
              <Phone className="w-4 h-4 md:w-5 md:h-5 text-white relative z-10" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.35))' }} />
            </motion.button>
          )}

          <motion.button
            whileTap={{ scale: 0.88 }}
            whileHover={{ scale: 1.06 }}
            onClick={() => setShowGamePanel(true)}
            aria-label="Open games"
            className="relative w-9 h-9 md:w-12 md:h-12 rounded-full flex items-center justify-center shrink-0 overflow-hidden"
            style={{
              background: 'radial-gradient(120% 120% at 30% 20%, #c4b5fd 0%, #8b5cf6 45%, #5b21b6 100%)',
              boxShadow: '0 6px 18px rgba(139,92,246,0.55), inset 0 1px 0 rgba(255,255,255,0.55), inset 0 -3px 6px rgba(0,0,0,0.22)',
            }}
          >
            <span className="absolute inset-x-1 top-0.5 h-2 rounded-full pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.55), transparent)' }} />
            <BrandedGameIcon className="w-6 h-6 md:w-8 md:h-8 relative z-10" />
          </motion.button>

          {/* Mic, PK Battle, and Like buttons moved into More Options sheet
              (per UX refresh) — chat input now gets the freed horizontal space. */}


          {/* Gift Button — Premium pink orb with shine sweep */}
          <motion.button
            whileTap={{ scale: 0.88 }}
            whileHover={{ scale: 1.06 }}
            onClick={() => setShowGiftPanel(true)}
            aria-label="Send gift"
            className="relative w-9 h-9 md:w-12 md:h-12 rounded-full flex items-center justify-center shrink-0 overflow-hidden"
            style={{
              background: 'radial-gradient(120% 120% at 30% 20%, #fbcfe8 0%, #ec4899 45%, #9d174d 100%)',
              boxShadow: '0 6px 20px rgba(236,72,153,0.6), inset 0 1px 0 rgba(255,255,255,0.6), inset 0 -3px 6px rgba(0,0,0,0.22)',
            }}
          >
            <span className="absolute inset-x-1 top-0.5 h-2 rounded-full pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.6), transparent)' }} />
            <motion.span
              className="absolute inset-0 pointer-events-none"
              style={{ background: 'linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.45) 50%, transparent 70%)' }}
              animate={{ x: ['-100%', '100%'] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut', repeatDelay: 1.6 }}
            />
            <BrandedGiftIcon className="w-6 h-6 md:w-7 md:h-7 relative z-10 rounded-md" />
          </motion.button>

          {/* More Options Button — Glass orb */}
          <Sheet open={showMoreOptions} onOpenChange={setShowMoreOptions}>
            <SheetTrigger asChild>
              <motion.button
                whileTap={{ scale: 0.88 }}
                whileHover={{ scale: 1.06 }}
                aria-label="More options"
                className="relative w-9 h-9 md:w-12 md:h-12 rounded-full flex items-center justify-center shrink-0 overflow-hidden"
                style={{
                  background: 'radial-gradient(120% 120% at 30% 20%, rgba(255,255,255,0.22) 0%, rgba(40,30,55,0.85) 45%, rgba(10,8,20,0.95) 100%)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  boxShadow: '0 6px 18px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.28), inset 0 -2px 4px rgba(0,0,0,0.3)',
                  backdropFilter: 'blur(14px)',
                }}
              >
                <span className="absolute inset-x-1 top-0.5 h-2 rounded-full pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.35), transparent)' }} />
                <Grid3X3 className="w-4 h-4 md:w-5 md:h-5 text-white relative z-10" />
              </motion.button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-[28px] h-auto p-0 border-0"
              style={{
                background: 'linear-gradient(180deg, rgba(20,14,40,0.98) 0%, rgba(10,8,22,0.99) 100%)',
                borderTop: '1px solid rgba(255,255,255,0.1)',
                boxShadow: '0 -20px 60px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.08)',
              }}
            >
              {/* Glass top sheen */}
              <div className="absolute inset-x-0 top-0 h-24 pointer-events-none rounded-t-[28px]" style={{ background: 'radial-gradient(80% 100% at 50% 0%, rgba(139,92,246,0.22), transparent 70%)' }} />

              {/* Handle */}
              <div className="relative flex justify-center pt-3 pb-2">
                <div className="w-10 h-[4px] rounded-full" style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.15), rgba(255,255,255,0.35), rgba(255,255,255,0.15))' }} />
              </div>

              {/* Title */}
              <div className="relative px-5 pb-3">
                <h3 className="text-white text-[15px] font-bold tracking-tight" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.4)' }}>More Options</h3>
                <p className="text-white/55 text-[11px] mt-0.5">Tools and controls for your live session</p>
              </div>

              <div className="relative pb-8 pt-1 px-4">
                <div className="grid grid-cols-5 gap-y-5 gap-x-2">
                  {moreOptions.map((option, index) => {
                    const iconMap: Record<string, React.ReactNode> = {
                      Wand2: <Wand2 className="w-6 h-6" strokeWidth={1.8} />,
                      Smile: <Smile className="w-6 h-6" strokeWidth={1.8} />,
                      RotateCcw: <RotateCcw className="w-6 h-6" strokeWidth={1.8} />,
                      Gamepad2: <Gamepad2 className="w-6 h-6" strokeWidth={1.8} />,
                      Phone: <Phone className="w-6 h-6" strokeWidth={1.8} />,
                      Swords: <Swords className="w-6 h-6" strokeWidth={1.8} />,
                      MessageCircle: <MessageCircle className="w-6 h-6" strokeWidth={1.8} />,
                      Share2: <Share2 className="w-6 h-6" strokeWidth={1.8} />,
                      ClipboardList: <ClipboardList className="w-6 h-6" strokeWidth={1.8} />,
                      Gem: <Gem className="w-6 h-6" strokeWidth={1.8} />,
                      Music: <Music className="w-6 h-6" strokeWidth={1.8} />,
                      LogOut: <LogOut className="w-6 h-6" strokeWidth={1.8} />,
                      ShieldCheck: <ShieldCheck className="w-6 h-6" strokeWidth={1.8} />,
                      Layers: <Layers className="w-6 h-6" strokeWidth={1.8} />,
                      Radio: <Radio className="w-6 h-6" strokeWidth={1.8} />,
                      PhoneCall: <PhoneCall className="w-6 h-6" strokeWidth={1.8} />,
                      Hand: <Hand className="w-6 h-6" strokeWidth={1.8} />,
                      Sparkles: <Sparkles className="w-6 h-6" strokeWidth={1.8} />,
                      Heart: <Heart className="w-6 h-6 fill-current" strokeWidth={1.8} />,
                      Mic: <Mic className="w-6 h-6" strokeWidth={1.8} />,
                      MicOff: <MicOff className="w-6 h-6" strokeWidth={1.8} />,
                    };
                    const IconComponent = iconMap[option.iconName];

                    return (
                      <motion.button
                        key={option.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.025 }}
                        className="flex flex-col items-center gap-1.5"
                        whileTap={{ scale: 0.9 }}
                        whileHover={{ y: -2 }}
                        onClick={option.action}
                      >
                        <div
                          className={`relative w-[52px] h-[52px] rounded-2xl bg-gradient-to-br ${option.color} flex items-center justify-center overflow-hidden`}
                          style={{
                            boxShadow: '0 8px 22px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -2px 4px rgba(0,0,0,0.25)',
                          }}
                        >
                          <span className="absolute inset-x-1.5 top-1 h-3 rounded-xl pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.45), transparent)' }} />
                          <div className="text-white relative z-10" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.4))' }}>
                            {IconComponent}
                          </div>
                        </div>
                        <span className="text-white/85 text-[10px] font-semibold tracking-tight">{option.name}</span>
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </motion.div>

      {/* PK Battle Active Overlay */}
      {pkBattleState.isActive && pkBattleState.battleId && pkBattleState.challengerInfo && pkBattleState.opponentInfo && (
        <PKBattleActive
          battleId={pkBattleState.battleId}
          isChallenger={pkBattleState.isChallenger}
          challengerName={pkBattleState.challengerInfo.name}
          challengerAvatar={pkBattleState.challengerInfo.avatar}
          challengerLevel={pkBattleState.challengerInfo.level}
          challengerId={pkBattleState.challengerInfo.id}
          opponentName={pkBattleState.opponentInfo.name}
          opponentAvatar={pkBattleState.opponentInfo.avatar}
          opponentLevel={pkBattleState.opponentInfo.level}
          opponentId={pkBattleState.opponentInfo.id}
          onBattleEnd={handlePKBattleEnd}
        />
      )}

      {/* PK Battle Panel */}
      <PKBattlePanel
        isOpen={showPKPanel}
        onClose={() => setShowPKPanel(false)}
        currentStreamId={id || ""}
        currentUserId={currentUserId || ""}
        currentUserName={hostInfo?.name || ""}
        currentUserAvatar={hostInfo?.avatar || ""}
        currentUserLevel={hostInfo?.level || 1}
        onBattleStarted={handlePKBattleStarted}
      />

      {/* Incoming PK Request */}
      {showPKRequest && incomingPKRequest && (
        <PKBattleRequest
          battleId={incomingPKRequest.battleId}
          challengerName={incomingPKRequest.challengerName}
          challengerAvatar={incomingPKRequest.challengerAvatar}
          challengerLevel={incomingPKRequest.challengerLevel}
          onAccept={handlePKRequestAccept}
          onDecline={handlePKRequestDecline}
        />
      )}

      {/* Random PK Match Notification - In-stream beautiful notification */}
      {showRandomPKNotification && randomPKRequest && (
        <PKRandomMatchNotification
          challengerName={randomPKRequest.challengerName}
          challengerAvatar={randomPKRequest.challengerAvatar}
          challengerLevel={randomPKRequest.challengerLevel}
          challengerId={randomPKRequest.challengerId}
          onAccept={handleRandomPKAccept}
          onDecline={handleRandomPKDecline}
        />
      )}

      {/* PK Battle Result */}
      {showPKResult && pkResult && (
        <PKBattleResult
          isWinner={pkResult.isWinner}
          isDraw={pkResult.isDraw}
          winnerName={pkResult.winnerName}
          winnerAvatar={pkResult.winnerAvatar}
          winnerScore={pkResult.winnerScore}
          loserName={pkResult.loserName}
          loserAvatar={pkResult.loserAvatar}
          loserScore={pkResult.loserScore}
          onClose={handleClosePKResult}
        />
      )}

      {/* Room Welcome Banner - Removed from here, now integrated into RoomChatOverlay */}

      {/* Viewer List Panel - Unified (Same as Party Room) */}
      {id && (
        <UnifiedViewerPanel
          isOpen={showViewerList}
          onClose={() => setShowViewerList(false)}
          streamId={id}
          viewerCount={viewerCount}
          roomType="live"
          isHost={isHost}
          onViewProfile={handleProfileClick}
        />
      )}

      {/* Music Player Panel */}
      <MusicPlayerPanel
        isOpen={showMusicPlayer}
        onClose={() => setShowMusicPlayer(false)}
        isHost={isHost}
      />


      {/* Call Confirm Modal */}
      {hostInfo && (
        <CallConfirmModal
          isOpen={showCallConfirm}
          onClose={() => setShowCallConfirm(false)}
          onConfirm={handleConfirmCall}
          hostId={hostInfo.id}
          hostName={hostInfo.name}
          hostAvatar={hostInfo.avatar}
          hostLevel={hostInfo.level}
          userCoins={userCoins}
        />
      )}

      {/* Gift Panel - INSTANT with optimistic updates */}
      <GiftPanel
        isOpen={showGiftPanel}
        onClose={() => setShowGiftPanel(false)}
        onSendGift={async (gift: GiftData, count: number) => {
          if (!currentUserId || !hostInfo?.id || !id) return;
          
          // CRITICAL: Prevent self-gifting
          if (currentUserId === hostInfo.id) {
            toast.error("You cannot send gifts to yourself!");
            return;
          }
          
          const totalCost = gift.coins * count;
          const availableCoins = userCoinsRef.current;
          if (availableCoins < totalCost) {
            toast.error("Not enough diamonds!");
            return;
          }
          
          // ========== INSTANT UI UPDATE (< 100ms) ==========
          // NOTE: Do NOT close panel — keeping it open enables professional combo gifting
          
          // Optimistic coin deduction (instant visual feedback)
          userCoinsRef.current = Math.max(0, availableCoins - totalCost);
          pendingGiftCostRef.current += totalCost;
          setUserCoins(userCoinsRef.current);
          
          // Play gift sound IMMEDIATELY
          playSound('gift');
          
          // Get sender info for animation (from currentUser - already loaded)
          const senderName = currentUser?.display_name || "User";
          const senderAvatar = currentUser?.avatar_url || undefined;
          const senderLevel = currentUser?.user_level || 1;
          
          const optimisticReceiverBeans = Math.floor(totalCost * adminGiftCommission / 100);
          const giftKey = getGiftRealtimeKey(currentUserId, gift.id, totalCost, count);
          warmGiftForInstantPlay(gift as any);

          // Trigger flying gift animation IMMEDIATELY
          addFlyingGift({
            senderId: currentUserId,
            senderName: senderName,
            senderAvatar: senderAvatar,
            giftName: gift.name,
            giftIcon: gift.emoji || "🎁",
            giftImageUrl: gift.icon_url || undefined,
            animationUrl: gift.animation_url || gift.icon_url || undefined,
            animationFormat: gift.animation_format || null,
            animationConfigUrl: gift.animation_config_url || undefined,
            soundUrl: gift.sound_url || undefined,
            giftColor: "bg-pink-500/50",
            count: count,
            coins: gift.coins,
            isOwnGift: true,
          });
          
          // Add gift message to chat IMMEDIATELY (optimistic)
          const giftChatMessage = `[GIFT:${gift.icon_url || ''}] sent ${gift.name} x${count} | -${totalCost} diamonds | +${optimisticReceiverBeans} beans`;
          const tempGiftMsgId = `gift_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          setMessages(prev => [...prev, {
            id: tempGiftMsgId,
            user: senderName,
            initial: senderName.charAt(0),
            message: giftChatMessage,
            color: "text-pink-400",
            userLevel: senderLevel,
            userAvatar: senderAvatar,
            isHost: currentUserId === streamData?.host_id,
            isNewUser: false,
            giftIconUrl: gift.icon_url || undefined,
          }]);
          
          // Gift animation is already playing - no toast needed
          
          // Pkg78: Supabase gift broadcast REMOVED — LiveKit DataPacket is
          // the sole instant fanout path.
          //
          // Pkg76 audit (Pkg90) fix: direct `publishGiftSent('live', id, …)`
          // REMOVED here. `GiftingService.sendGift` (called below) publishes
          // the same envelope after the RPC succeeds. Calling both produced
          // TWO envelopes with different `env.id` → 400ms dedupe missed them
          // → every other viewer saw the flying-gift animation twice and the
          // bean counter incremented twice. GiftingService publish carries
          // the real `coinsSpent`/`hostReceived` from the RPC, so receivers
          // also get accurate values (vs optimistic estimates here).


          markOptimisticGiftCount(giftKey, optimisticReceiverBeans);
          setTotalBeans(prev => prev + optimisticReceiverBeans);
          
          // ========== BACKGROUND PROCESSING (fire-and-forget) ==========
          (async () => {
            let transactionSucceeded = false;
            let pendingReleased = false;
            const releasePendingCost = () => {
              if (pendingReleased) return;
              pendingGiftCostRef.current = Math.max(0, pendingGiftCostRef.current - totalCost);
              pendingReleased = true;
            };
            try {
              const result = await sendGift({
                giftId: gift.id,
                gift,
                senderId: currentUserId,
                receiverId: hostInfo!.id,
                quantity: count,
                context: 'live',
                streamId: id,
              });

              releasePendingCost();
              if (!result.success) {
                userCoinsRef.current += totalCost;
                setUserCoins(userCoinsRef.current);
                toast.error(result.error || "Gift failed - diamonds refunded");
                return;
              }
              transactionSucceeded = true;
              
              // Refresh actual balance from server
              const { data: updatedProfile } = await supabase
                .from("profiles") // guard-ok: owner-only self balance refresh after gift send
                .select("coins")
                .eq("id", currentUserId)
                .single();
              
              if (updatedProfile && pendingGiftCostRef.current === 0) {
                userCoinsRef.current = updatedProfile.coins || 0;
                setUserCoins(userCoinsRef.current);
                // CRITICAL: Update global cached balance so Profile "My Diamonds" reflects instantly
                const { updateCachedBalance } = await import("@/hooks/useUserBalance");
                updateCachedBalance(userCoinsRef.current);
              }
              
              // Save gift message to database for other participants
              if (result.success) {
                const finalBeans = result.transaction?.beans_earned ?? optimisticReceiverBeans;
                const finalCost = result.transaction?.coins_spent ?? totalCost;
                if (finalBeans !== optimisticReceiverBeans) {
                  const optimistic = recentBroadcastGiftKeysRef.current.get(giftKey);
                  if (optimistic) {
                    recentBroadcastGiftKeysRef.current.set(giftKey, { ...optimistic, beans: finalBeans });
                  }
                  setMessages(prev => prev.map(m => m.id === tempGiftMsgId ? {
                    ...m,
                    message: `[GIFT:${gift.icon_url || ''}] sent ${gift.name} x${count} | -${finalCost} diamonds | +${finalBeans} beans`,
                  } : m));
                }
                const finalGiftMessage = `[GIFT:${gift.icon_url || ''}] sent ${gift.name} x${count} | -${finalCost} diamonds | +${finalBeans} beans`;
                const { data: giftRow } = await supabase
                  .from("stream_chat")
                  .insert({
                    stream_id: id,
                    user_id: currentUserId,
                    message: finalGiftMessage,
                    message_type: 'gift',
                  })
                  .select("id")
                  .single();
                // Pkg79: also mirror the gift bubble row through LiveKit chat
                // so viewers see it without the Supabase Realtime round-trip.
                if (id) {
                  void publishChatMessage('live', id, {
                    messageId: giftRow?.id || `gift-${Date.now()}`,
                    userId: currentUserId,
                    displayName: currentUser?.display_name || "User",
                    avatarUrl: currentUser?.avatar_url || undefined,
                    userLevel: currentUser?.user_level || 1,
                    isHost: currentUserId === streamData?.host_id,
                    countryFlag: currentUser?.country_flag || undefined,
                    message: finalGiftMessage,
                    messageType: 'gift',
                  });
                }
              }

            } catch (err) {
              releasePendingCost();
              console.error('[Gift] Background processing error:', err);
              recordClientError({ label: "LiveStream.finalGiftMessage", message: err instanceof Error ? err.message : String(err) });
              if (transactionSucceeded) return;
              // Refund coins on complete failure
              userCoinsRef.current += totalCost;
              setUserCoins(userCoinsRef.current);
              toast.error(`Gift failed: ${err instanceof Error ? err.message : String(err)}`);
            }
          })();
        }}
        userCoins={userCoins}
      />
      
      {/* Join Notifications moved to chat area - see bottom section */}

      {/* ========== HOST BUSY ON CALL OVERLAY (for viewers) ========== */}
      <AnimatePresence>
        {hostBusyOnCall && !isHost && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/80"
          >
            {/* Host Avatar */}
            <div className="relative mb-6">
              <div className="w-24 h-24 rounded-full border-4 border-amber-400/60 overflow-hidden shadow-2xl bg-gradient-to-br from-purple-600 to-pink-500 flex items-center justify-center">
                {hostInfo?.avatar ? (
                  <img loading="lazy" decoding="async" 
                    src={hostInfo.avatar}
                    alt={hostInfo?.name || 'Host'}
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <span className="text-white text-3xl font-bold">{(hostInfo?.name || 'H').charAt(0).toUpperCase()}</span>
                )}
              </div>
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-gradient-to-r from-green-400 to-emerald-500 flex items-center justify-center border-2 border-black"
              >
                <Phone className="w-4 h-4 text-white" />
              </motion.div>
            </div>

            <h3 className="text-white text-xl font-bold mb-2">
              {hostInfo?.name || 'Host'} is on a Private Call
            </h3>
            <p className="text-white/60 text-sm mb-8">
              Please wait, the host will be back soon!
            </p>

            {/* Host Photos Gallery */}
            {hostPhotos.length > 0 && (
              <div className="flex gap-3 px-6">
                {hostPhotos.slice(0, 3).map((photo, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.15 }}
                    className="w-24 h-32 rounded-xl overflow-hidden border-2 border-white/20 shadow-lg"
                  >
                    <img loading="lazy" decoding="async" 
                      src={photo}
                      alt={`${hostInfo?.name} photo ${idx + 1}`}
                      className="w-full h-full object-cover" />
                  </motion.div>
                ))}
              </div>
            )}

            <motion.div
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="mt-8 flex items-center gap-2 text-amber-400 text-sm"
            >
              <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              Waiting for host...
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Premium Stream Ended Modal */}
      <RoomEndedModal
        isOpen={showStreamEndedModal}
        hostName={hostInfo?.name || streamEndedBy}
        hostAvatar={hostInfo?.avatar}
        hostId={streamData?.host_id || hostInfo?.id}
        roomType="live"
        viewerCount={viewerCount}
        duration={(() => {
          const elapsed = Math.floor((Date.now() - streamStartTime) / 1000);
          const mins = Math.floor(elapsed / 60);
          const secs = elapsed % 60;
          return `${mins}:${secs.toString().padStart(2, '0')}`;
        })()}
        onExit={async () => {
          setShowStreamEndedModal(false);
          await leaveChannel();
          navigate('/');
        }}
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

      {/* Global Live Game Selector — context="live" routes win bubbles to stream_chat */}
      <LiveGameSelector
        isOpen={showGamePanel}
        onClose={() => setShowGamePanel(false)}
        roomId={id}
        context="live"
        onOpenGifts={() => setShowGiftPanel(true)}
      />

      {/* Premium Viewer Profile Card */}
      <PremiumViewerProfileCard
        viewer={selectedProfile}
        isOpen={showProfileCard}
        onClose={() => setShowProfileCard(false)}
        onFollow={handleFollowFromCard}
        onMessage={handleMessageFromCard}
        onGift={handleGiftFromCard}
        onCall={(viewerId) => {
          setShowProfileCard(false);
          handleCall();
        }}
        onViewProfile={(viewerId) => {
          setShowProfileCard(false);
          navigate(`/profile/${viewerId}`);
        }}
        onModerate={isHost && isHostVerified
          ? (viewerId) => setModerateTarget({ id: viewerId, name: selectedProfile?.name || "" })
          : undefined}
      />
      <HostModerationSheet
        open={!!moderateTarget}
        onClose={() => setModerateTarget(null)}
        roomName={id ? `live_${id}` : null}
        identity={moderateTarget?.id}
        displayName={moderateTarget?.name}
      />

      <NumberSharingWarningDialog
        open={numberWarning.warningState.open}
        onClose={numberWarning.closeWarning}
        violationNumber={numberWarning.warningState.violationNumber}
        beansDeducted={numberWarning.warningState.beansDeducted}
        isBanned={numberWarning.warningState.isBanned}
        isGenericWarning={numberWarning.warningState.isGenericWarning}
      />
      {/* Beauty Filter Panel with Stickers for Host */}
      {isHost && (
        <>
          <BeautyFilterPanel
            isOpen={showBeautyPanel}
            onClose={() => setShowBeautyPanel(false)}
            settings={beauty.beautySettings}
            enabled={beauty.beautyEnabled}
            onSettingsChange={beauty.handleBeautySettingsChange}
            onEnabledChange={beauty.handleBeautyEnabledChange}
          />
          <StickerOverlay stickerName={beauty.activeSticker} onDismiss={() => { setActiveSticker(null); beauty.handleStickerChange(null); }} />
          <StickerPanel
            isOpen={showStickerPanel}
            onClose={() => setShowStickerPanel(false)}
            activeSticker={beauty.activeSticker}
            onStickerChange={(name) => { setActiveSticker(name); beauty.handleStickerChange(name); }}
          />
          <VirtualBackgroundDialog
            open={showVirtualBackground}
            onClose={() => setShowVirtualBackground(false)}
            localVideoTrack={localVideoTrack}
            isNative={beauty.isNativeAndroid}
          />
          <NoiseCancellationDialog
            open={showNoiseCancellation}
            onClose={() => setShowNoiseCancellation(false)}
            localAudioTrack={localAudioTrack}
            isNative={beauty.isNativeAndroid}
          />

          <IngressDialog
            open={showIngress}
            onClose={() => setShowIngress(false)}
            streamId={id}
          />
          <SipDialDialog
            open={showSipDial}
            onClose={() => setShowSipDial(false)}
            streamId={id}
          />
          {/* Recording & Simulcast dialogs removed for privacy */}
          <PublishLayersDialog
            open={showPublishLayers}
            onClose={() => setShowPublishLayers(false)}
          />
          <AgentDispatchDialog
            open={showAgentDispatch}
            onClose={() => setShowAgentDispatch(false)}
            roomName={id ? `live_${id}` : ""}
            scope="live"
          />
          <RaiseHandQueueSheet
            open={showRaiseHandQueue}
            onClose={() => setShowRaiseHandQueue(false)}
            scope="live"
            id={id}
            roomName={id ? `live_${id}` : null}
          />
          <ReactionsQuickBar
            open={showReactionPicker}
            onClose={() => setShowReactionPicker(false)}
            scope="live"
            id={id}
            bottomOffset={100}
            leftOffset={16}
          />
          <FloatingReactionsOverlay scope="live" id={id} bottomOffset={120} />

        </>
      )}
    </div>
  );
};

export default LiveStream;
