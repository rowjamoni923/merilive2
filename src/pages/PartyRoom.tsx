import { useState, useEffect, useRef, useCallback } from "react";
import { useContentModeration } from "@/hooks/useContentModeration";
import { useNavigate, useParams } from "react-router-dom";
import { useNativeAndroidPip } from "@/hooks/useNativeAndroidPip";
import { useHighRefreshRate } from "@/hooks/useHighRefreshRate";
import { motion, AnimatePresence } from "framer-motion";

import { 
  X, 
  Users, 
  Send, 
  Gift, 
  Mic, 
  MicOff,
  Eye,
  EyeOff,
  Wand2,
  Smile,
  Crown,
  Gamepad2,
  Heart,
  Share2,
  Settings,
  Sofa,
  ChevronRight,
  ChevronLeft,
  Volume2,
  VolumeX,
  MoreVertical,
  Lock,
  Unlock,
  UserPlus,
  Check,
  XCircle,
  Bell,
  Hand,
  Shield,
  ShieldCheck,
  UserX,
  Ban,
  Copy,
  ExternalLink,
  Music,
  WifiOff
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { getAppSetting } from "@/utils/appSettingsCache";
import { LiveGameBoard } from "@/components/games/LiveGameBoard";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { usePartyRoomWebRTC } from "@/hooks/usePartyRoomWebRTC";
import { publishPartyClosed, type PartyClosedDetail } from "@/lib/livekitPartySignaling";
import { type GiftSentDetail } from "@/lib/livekitGiftSignaling";
import { publishChatMessage } from "@/lib/livekitChatSignaling";
import { publishPartyEvent, type PartyEventDetail, type ParticipantJoinedPayload, type SeatActionPayload, type RoomStateChangedPayload } from "@/lib/livekitPartyEventsSignaling";
import { useVoiceActivityDetection } from "@/hooks/useVoiceActivityDetection";
import { ParticipantVideo } from "@/components/party/ParticipantVideo";
import { GameSelectionModal } from "@/components/party/GameSelectionModal";
// UNIFIED ENTRY ANIMATION - Same architecture as Gift System
import UnifiedEntryAnimation from "@/components/live/UnifiedEntryAnimation";
import { EntryNameBarAnimation } from "@/components/live/EntryNameBarAnimation";
import { useEntryAnimations } from "@/hooks/useEntryAnimations";
import { RoomEndedModal } from "@/components/room/RoomEndedModal";
import { useBigoJoinNotifications, BigoJoinBannerContainer } from "@/components/live/BigoStyleJoinBanner";
import { ProfessionalAudioRoom } from "@/components/party/ProfessionalAudioRoom";
import { HostModerationSheet } from "@/components/livekit/HostModerationSheet";
import { FloatingReactionsOverlay } from "@/components/livekit/FloatingReactionsOverlay";
import { ReactionsQuickBar } from "@/components/livekit/ReactionsQuickBar";
import { PartyRaiseHandUI } from "@/components/livekit/PartyRaiseHandUI";


import { ProfessionalGameOverlay } from "@/components/party/ProfessionalGameOverlay";
import { GameFooterNew } from "@/components/games/GameFooterNew";
// UNIFIED GIFTING - SINGLE LINK for all sections (Live, Party, Call, Chat, Profile)
// Change @/features/shared/gifting = Change everywhere automatically
import { GiftPanel, GiftData, FlyingGiftAnimation, useFlyingGifts, sendGift } from "@/features/shared/gifting";
import { LevelBadge, InlineLevelBadge } from "@/components/common/LevelBadge";
import FramedAvatar from "@/components/common/FramedAvatar";
import AvatarWithFrame from "@/components/common/AvatarWithFrame";
import { useSound } from "@/hooks/useSound";
import { PartyMusicPlayer } from "@/components/party/PartyMusicPlayer";
import { ChametStyleSeatGrid } from "@/components/party/ChametStyleSeatGrid";
import { ChametStyleHeader } from "@/components/party/ChametStyleHeader";
import { ChametStyleBottomBar } from "@/components/party/ChametStyleBottomBar";
import { ChametStyleGameBanners } from "@/components/party/ChametStyleGameBanners";
import { ChametStyleGameRoom } from "@/components/party/ChametStyleGameRoom";
import { ChametStyleVideoRoom } from "@/components/party/ChametStyleVideoRoom";
import { UnifiedPartyRoom } from "@/components/party/UnifiedPartyRoom";
import { GiftContributorsPanel } from "@/components/party/GiftContributorsPanel";
import { fetchUserEntryAnimations } from "@/utils/fetchEntryAnimation";
// Room protection - blocks back button, auto-closes on network loss
import { useRoomProtection } from "@/hooks/useRoomProtection";
import { useFeatureLevelCheck } from "@/hooks/useFeatureLevelCheck";
import { useDeepARBeauty } from "@/hooks/useDeepARBeauty";
import { BeautyFilterPanel } from "@/components/live/BeautyFilterPanel";
import StickerOverlay from "@/components/live/StickerOverlay";
import { recordClientError } from "@/utils/clientErrorLog";
import { SelectiveSubscriptionButton } from "@/components/livekit/SelectiveSubscriptionButton";

interface PartyRoom {
  id: string;
  name: string;
  room_type: 'video' | 'audio' | 'game';
  game_mode: string | null;
  background_url: string | null;
  background_id?: string | null; // ADDED: Background ID for dynamic backgrounds
  entry_fee: number;
  min_level: number;
  max_participants: number;
  current_participants: number;
  is_private: boolean;
  room_code: string;
  host_id: string;
  active_seats?: number; // ADDED: Current active seats from DB
  host: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    host_level: number | null;
    user_level: number | null;
    country_code: string | null;
    country_flag: string | null;
    frame_id: string | null;
  } | null;
}

interface Participant {
  id: string;
  user_id: string;
  role: string | null;
  position: number | null;
  user: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    user_level: number | null;
    frame_id?: string | null; // ADDED: For proper frame rendering in header
  } | null;
}

interface SeatRequest {
  id: string;
  room_id: string;
  requester_id: string;
  seat_position: number;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  created_at: string;
  requester?: {
    display_name: string | null;
    avatar_url: string | null;
    user_level?: number;
  };
}

interface ChatMessage {
  id: string;
  user_id: string;
  message: string;
  created_at: string;
  type?: 'message' | 'gift' | 'join' | 'leave' | 'seat_request';
  user: {
    display_name: string | null;
    avatar_url: string | null;
    user_level?: number;
  } | null;
}

const PartyRoom = () => {
  const navigate = useNavigate();
  const { roomId } = useParams<{ roomId: string }>();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [room, setRoom] = useState<PartyRoom | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [seatRequests, setSeatRequests] = useState<SeatRequest[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // 🛡️ Party room chat dedup guard: same id never renders twice across
  // realtime INSERT, broadcast event, local optimistic send, seat-request
  // and gift code paths.
  useEffect(() => {
    setMessages(prev => {
      const seen = new Set<string>();
      const out: ChatMessage[] = [];
      for (const m of prev) {
        const key = String(m.id);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(m);
      }
      return out.length === prev.length ? prev : out;
    });
  }, [messages]);
  const [message, setMessage] = useState("");
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [showGiftPanel, setShowGiftPanel] = useState(false);
  const [moderateTarget, setModerateTarget] = useState<{ id: string; name: string } | null>(null);

  // Pkg245 — auto-PiP for party rooms (multi-guest grid; 1:1 square window
  // works best for 2-9 seats). Active once the room loaded successfully.
  useNativeAndroidPip({ active: !!room && !loading, aspect: '1:1' });
  // Pkg247 — boost panel to highest Hz while in the party
  useHighRefreshRate(!!room && !loading);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [showRaiseHandQueue, setShowRaiseHandQueue] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showRoomControls, setShowRoomControls] = useState(false);
  const [showSeatRequests, setShowSeatRequests] = useState(false);
  const [showSeatSelector, setShowSeatSelector] = useState(false);
  const [floatingHearts, setFloatingHearts] = useState<number[]>([]);
  const [myPosition, setMyPosition] = useState<number | null>(null);
  // REMOVED: Old fragmented entry animation states
  // Now using unified queue-based system like gifts
  // const [showEntranceAnimation, setShowEntranceAnimation] = useState(false);
  // const [entranceUserId, setEntranceUserId] = useState<string | null>(null);
  // const [entranceUserInfo, setEntranceUserInfo] = useState<{...} | null>(null);
  const [isGameExpanded, setIsGameExpanded] = useState(true);
  const [userCoins, setUserCoins] = useState(0);
  const [myPendingRequest, setMyPendingRequest] = useState<number | null>(null);
  const [games, setGames] = useState<{id: string; name: string; emoji: string; color: string; description?: string}[]>([]);
  const [showParticipants, setShowParticipants] = useState(false);
  const [selectedParticipant, setSelectedParticipant] = useState<Participant | null>(null);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [showMusicPlayer, setShowMusicPlayer] = useState(false);
  const [showRoomClosedModal, setShowRoomClosedModal] = useState(false);
  const [showGiftContributors, setShowGiftContributors] = useState(false);
  const [totalRoomBeans, setTotalRoomBeans] = useState(0);
  // Per-participant beans tracking (sender_id -> beans earned for host)
  const [participantBeans, setParticipantBeans] = useState<Record<string, number>>({});
  
  // Dynamic background state - synced via real-time from DB
  const [currentBackground, setCurrentBackground] = useState<{
    id?: string;
    image_url?: string;
    gradient_css?: string;
  } | null>(null);
  
  // Admin Panel party room limits - DYNAMIC from app_settings
  const [adminPartyLimits, setAdminPartyLimits] = useState<{
    max_video_participants: number;
    max_audio_participants: number;
    max_game_participants: number;
  }>({
    max_video_participants: 4,
    max_audio_participants: 12,
    max_game_participants: 6
  });
  
  // REAL DeepAR native beauty integration for Party Rooms
  const deepAR = useDeepARBeauty();
  
  // 🔥 AWS Comprehend content moderation
  const { checkToxicContent: checkToxic } = useContentModeration(currentUser?.id);
  
  // Refs for realtime subscription callbacks (avoid stale closure values)
  const currentUserRef = useRef<any>(null);
  const roomRef = useRef<PartyRoom | null>(null);
  const roomIdRef = useRef<string | undefined>(roomId);
  const sessionAccessTokenRef = useRef<string | null>(null);
  const hostCommissionPercentRef = useRef(55);
  const userCoinsRef = useRef(0);
  const pendingGiftCostRef = useRef(0);
  
  // Keep refs in sync with state
  useEffect(() => {
    currentUserRef.current = currentUser;
    roomRef.current = room;
    roomIdRef.current = roomId;
  }, [currentUser, room, roomId]);

  useEffect(() => {
    userCoinsRef.current = userCoins;
  }, [userCoins]);
  
  // Ref to track component mount status for async operations
  const isMountedRef = useRef(true);
  // Track recently processed requests to prevent duplicates
  const recentlyProcessedRequestsRef = useRef<Set<string>>(new Set());
  // Join messages for chat display
  const [joinMessages, setJoinMessages] = useState<{
    id: string;
    userId: string;
    userName: string;
    userLevel: number;
    avatarUrl?: string;
    type: 'join' | 'leave';
    timestamp: Date;
  }[]>([]);
  
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
  
  // Bigo-style flying join notifications for party room
  const { 
    activeNotification: activeBigoJoin, 
    addNotification: addBigoJoinNotification, 
    completeNotification: completeBigoJoin 
  } = useBigoJoinNotifications();
  
  
  // Flying gift animation
  const { gifts: flyingGifts, addGift: addFlyingGift, removeGift: removeFlyingGift } = useFlyingGifts();
  
  // Sound hook
  const { playSound } = useSound();
  
  // Feature level check for joining party rooms
  const { checkFeatureAccess } = useFeatureLevelCheck();
  
  // Gift broadcast channel ref for instant sync
  const giftBroadcastChannelRef = useRef<any>(null);
  const optimisticGiftCountsRef = useRef<Map<string, { beans: number; coins: number; expiresAt: number }>>(new Map());
  const getPartyGiftRealtimeKey = useCallback((senderId?: string | null, giftId?: string | null, coins?: number | null, count?: number | null) => {
    return `${senderId || 'unknown'}:${giftId || 'unknown'}:${coins || 0}:${count || 1}`;
  }, []);
  const markOptimisticPartyGiftCount = useCallback((key: string, beans: number, coins: number) => {
    const now = Date.now();
    optimisticGiftCountsRef.current.set(key, { beans, coins, expiresAt: now + 15000 });
    optimisticGiftCountsRef.current.forEach((value, staleKey) => {
      if (value.expiresAt < now) optimisticGiftCountsRef.current.delete(staleKey);
    });
  }, []);
  
  // Track joins already processed by broadcast to deduplicate with postgres_changes
  const processedBroadcastJoinsRef = useRef(new Set<string>());
  const joinedRoomKeyRef = useRef<string | null>(null);

  // Calculate if current user is host for room protection
  const isHostForProtection = room?.host_id === currentUser?.id;
  
  // Room protection - blocks back button, auto-closes on network loss
  useRoomProtection({
    roomType: 'party',
    enabled: !!roomId,
    onNetworkClose: async () => {
      console.log('[PartyRoom] Network lost - closing room');
      if (isHostForProtection && roomId) {
        // Mark room as inactive
        await supabase
          .from('party_rooms')
          .update({ is_active: false })
          .eq('id', roomId);
      }
      // Remove participant record
      if (currentUser?.id && roomId) {
        await supabase
          .from('party_room_participants')
          .delete()
          .eq('room_id', roomId)
          .eq('user_id', currentUser.id);
      }
    },
  });

  const leaveRoomForCleanup = useCallback(async (targetRoomId?: string) => {
    const user = currentUserRef.current;
    if (!targetRoomId || !user?.id) return;

    const activeRoom = roomRef.current;
    const isHostNow = activeRoom?.id === targetRoomId && activeRoom.host_id === user.id;
    const leftAt = new Date().toISOString();

    try {
      if (isHostNow) {
        await publishPartyClosed(targetRoomId, { hostId: user.id, closedAt: leftAt }).catch(() => false);
        await supabase.from('party_rooms').update({ is_active: false, ended_at: leftAt }).eq('id', targetRoomId);
        await supabase.from('party_room_participants').update({ left_at: leftAt, seat_number: null }).eq('room_id', targetRoomId).is('left_at', null);
      } else {
        await supabase.from('party_room_participants').update({ left_at: leftAt, seat_number: null }).eq('room_id', targetRoomId).eq('user_id', user.id);
      }

      await supabase.from('seat_requests').update({ status: 'cancelled' }).eq('room_id', targetRoomId).eq('requester_id', user.id).eq('status', 'pending');
    } catch (error) {
      console.error('[PartyRoom] cleanup leave failed:', error);
      recordClientError({ label: "PartyRoom.cleanupLeave", message: error instanceof Error ? error.message : String(error) });
    }
  }, []);

  // Fetch games from database - defer for faster initial load
  useEffect(() => {
    // Use requestIdleCallback for non-critical data
    const fetchGames = async () => {
      const { data, error } = await supabase
        .from('game_settings')
        .select('game_id, game_name, game_emoji, game_color, description')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (!error && data) {
        setGames(data.map(game => ({
          id: game.game_id,
          name: game.game_name,
          emoji: game.game_emoji,
          color: game.game_color,
          description: game.description
        })));
      }
    };
    
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(() => fetchGames());
    } else {
      setTimeout(fetchGames, 100);
    }
  }, []);

  // Fetch total room beans from gift transactions
  // ✅ Using GLOBAL SETTINGS for commission rate - Real-time sync with Admin Panel
  const [hostCommissionPercent, setHostCommissionPercent] = useState<number>(55);
  useEffect(() => {
    hostCommissionPercentRef.current = hostCommissionPercent;
  }, [hostCommissionPercent]);
  
  // ✅ UNIFIED SETTINGS SUBSCRIPTION - gift_commission + party_room_limits
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        // Fetch both settings in parallel (each goes through appSettingsCache —
        // dedupes with concurrent LiveStream / useHostCallRate fetches)
        const [commissionValue, limitsValue] = await Promise.all([
          getAppSetting<Record<string, any>>('gift_commission'),
          getAppSetting<Record<string, any>>('party_room_limits'),
        ]);

        // Gift Commission
        if (commissionValue) {
          const settings = commissionValue;
          let rate = 55;
          if (settings.host_percent !== undefined) {
            rate = settings.host_percent;
          } else if (settings.company_percent !== undefined) {
            rate = 100 - settings.company_percent;
          }
          console.log('[PartyRoom] ✅ Commission rate loaded:', rate);
          setHostCommissionPercent(rate);
        }

        // Party Limits
        if (limitsValue) {
          const limits = limitsValue;
          console.log('[PartyRoom] ✅ Party limits loaded:', limits);
          setAdminPartyLimits({
            max_video_participants: limits.max_video_participants || 4,
            max_audio_participants: limits.max_audio_participants || 12,
            max_game_participants: limits.max_game_participants || 6
          });
        }
      } catch (err) {
        console.error('[PartyRoom] Exception fetching settings:', err);
        recordClientError({ label: "PartyRoom.limits", message: err instanceof Error ? err.message : String(err) });
      }
    };
    
    fetchSettings();
    
    // Pkg87 LiveKit-Purist: admin gift_commission + party_room_limits sync via
    // Pkg37 `admin-table-update` window event (dispatched by singleton
    // useAdminBroadcastSync — kill-switch + 50k/hr cap apply). REPLACES the
    // `party-room-settings-realtime` Supabase postgres_changes channel on
    // app_settings (1 channel per party-room mount → was $1400-rule risk).
    const onAdminUpdate = (e: Event) => {
      const detail = (e as CustomEvent<{ table?: string }>).detail;
      if (detail?.table === 'app_settings') {
        fetchSettings();
      }
    };
    window.addEventListener('admin-table-update', onAdminUpdate as EventListener);
    return () => {
      window.removeEventListener('admin-table-update', onAdminUpdate as EventListener);
    };
  }, []);

  
  // ✅ BACKGROUND SYNC - Fetch background on room load and subscribe to changes
  useEffect(() => {
    if (!roomId || !room?.background_id) return;
    
    const fetchBackground = async () => {
      try {
        const { data, error } = await supabase
          .from('party_room_backgrounds')
          .select('id, image_url, gradient_css')
          .eq('id', room.background_id)
          .single();
        
        if (data && !error) {
          console.log('[PartyRoom] ✅ Background loaded:', data);
          setCurrentBackground(data);
        }
      } catch (err) {
        console.error('[PartyRoom] Error fetching background:', err);
        recordClientError({ label: "PartyRoom.fetchBackground", message: err instanceof Error ? err.message : String(err) });
      }
    };
    
    fetchBackground();
  }, [roomId, room?.background_id]);
  
  // Pkg81: `party-room-bg-${roomId}` Supabase Realtime channel DELETED.
  // Background changes now arrive via LiveKit `room_state_changed` DataPacket
  // (host publishes from BackgroundPickerPanel after the party_rooms UPDATE).
  // Late-join state = the initial `fetchBackground()` above. NO realtime
  // subscription to party_rooms from the client anymore. Saves 1 channel +
  // 1 party_room_backgrounds round-trip per background switch (sender packs
  // the row into the envelope). The handler lives in the unified
  // `livekit-party-event` listener further below.

  useEffect(() => {
    if (!roomId) return;

    const fetchTotalBeans = async () => {
      try {
        const { data, error } = await supabase
          .from('gift_transactions')
          .select('coin_amount, receiver_beans, sender_id')
          .eq('party_room_id', roomId);

        if (error) {
          console.error('[PartyRoom] Error fetching beans:', error);
          recordClientError({ label: "PartyRoom.fetchTotalBeans", message: error instanceof Error ? error.message : String(error) });
          return;
        }

        if (data && data.length > 0) {
          const totalGiftValue = data.reduce((sum, tx) => sum + (tx.coin_amount || 0), 0);
          const hostBeans = data.reduce((sum, tx) => sum + (tx.receiver_beans ?? Math.floor((tx.coin_amount || 0) * hostCommissionPercent / 100)), 0);
          console.log('[PartyRoom] Total beans calculated:', hostBeans, 'from', data.length, 'transactions, rate:', hostCommissionPercent);
          setTotalRoomBeans(hostBeans);
          
          // Per-participant gift contribution tracking
          const perUser: Record<string, number> = {};
          data.forEach(tx => {
            if (tx.sender_id) {
              perUser[tx.sender_id] = (perUser[tx.sender_id] || 0) + (tx.coin_amount || 0);
            }
          });
          setParticipantBeans(perUser);
        } else {
          console.log('[PartyRoom] No gift transactions for this room yet');
          setTotalRoomBeans(0);
          setParticipantBeans({});
        }
      } catch (err) {
        console.error('[PartyRoom] Exception fetching beans:', err);
        recordClientError({ label: "PartyRoom.perUser", message: err instanceof Error ? err.message : String(err) });
      }
    };

    // Initial fetch
    fetchTotalBeans();

    // Pkg81: `party-beans-${roomId}` Supabase Realtime channel DELETED.
    // Beans counter realtime now arrives purely via Pkg76 LiveKit
    // `livekit-gift-sent` DataPacket — the handler further below already
    // bumps `setTotalRoomBeans` + `setParticipantBeans` from the same
    // envelope. Late-join state = the initial `fetchTotalBeans()` above.
    // Net result: every active party room saves 1 Realtime channel + 1
    // gift_transactions postgres_changes subscription. ZERO functional
    // regression — the LiveKit path was already the primary; this just
    // removes the redundant fallback.
  }, [roomId, hostCommissionPercent, getPartyGiftRealtimeKey]);

  // Determine if current user is host or admin
  const isHost = room?.host_id === currentUser?.id;
  const isAdmin = myRole === 'admin' || isHost;
  const canManageUsers = isHost || isAdmin;

  // Initialize WebRTC for multi-user connections
  const {
    localStream,
    peerStreams,
    isAudioEnabled,
    isVideoEnabled,
    toggleAudio,
    toggleVideo,
    cleanup: cleanupWebRTC,
    getPeerStream,
  } = usePartyRoomWebRTC(
    roomId || null,
    currentUser?.id || null,
    room?.room_type || 'video',
    isHost,
    isHost || myPosition !== null
  );

  // Auto-close room handler when no voice activity for 10 seconds
  const handleSilenceTimeout = useCallback(async () => {
    if (!isHost || !roomId) return;
    
    console.log('[PartyRoom] Silence timeout - auto-closing room');
    toast.info("Room closed due to inactivity");
    
    try {
      // Mark room as inactive
      await supabase
        .from('party_rooms')
        .update({ is_active: false })
        .eq('id', roomId);
      
      // Leave all participants
      await supabase
        .from('party_room_participants')
        .update({ left_at: new Date().toISOString() })
        .eq('room_id', roomId)
        .is('left_at', null);
      
      cleanupWebRTC();
      navigate('/');
    } catch (error) {
      console.error('[PartyRoom] Error auto-closing room:', error);
      recordClientError({ label: "PartyRoom.handleSilenceTimeout", message: error instanceof Error ? error.message : String(error) });
    }
  }, [isHost, roomId, cleanupWebRTC, navigate]);

  // Voice activity detection for auto-close
  // DISABLED for game rooms - games have their own lifecycle
  // For audio/video rooms, only timeout after 5 MINUTES of complete silence (not 60 seconds)
  const { isVoiceActive, silenceDuration, resetSilenceTimer } = useVoiceActivityDetection({
    localStream,
    peerStreams,
    enabled: isHost && room?.room_type !== 'game', // CRITICAL: Completely disabled for game rooms
    silenceTimeoutMs: 300000, // 5 MINUTES (was 60 seconds - too aggressive)
    onSilenceTimeout: handleSilenceTimeout,
  });

  // Reset silence timer when new participant joins
  useEffect(() => {
    if (participants.length > 1) {
      resetSilenceTimer();
    }
  }, [participants.length, resetSilenceTimer]);

  // Seat positions based on room type and ADMIN PANEL settings
  const getSeatPositions = () => {
    if (!room) return [];
    
    // ✅ USE ADMIN PANEL SETTINGS for seat count
    const maxSeats = room.room_type === 'audio' 
      ? adminPartyLimits.max_audio_participants 
      : room.room_type === 'game'
        ? adminPartyLimits.max_game_participants
        : adminPartyLimits.max_video_participants;
    
    if (room.room_type === 'video') {
      return Array.from({ length: maxSeats }, (_, i) => ({
        id: i,
        label: i === 0 ? "Host" : `Seat ${i}`
      }));
    } else if (room.room_type === 'audio') {
      return Array.from({ length: maxSeats }, (_, i) => ({
        id: i,
        label: i === 0 ? "Host" : `Seat ${i}`
      }));
    } else {
      return Array.from({ length: Math.min(maxSeats, 8) }, (_, i) => ({
        id: i,
        label: i === 0 ? "Host" : `Player ${i}`
      }));
    }
  };

  // Initialize room - fetch everything in parallel for speed
  useEffect(() => {
    if (!roomId) return;
    
    // Reset mount ref on each mount
    isMountedRef.current = true;
    
    // Fetch user, room, and join in parallel
    const initRoom = async () => {
      try {
        const [userData, roomData] = await Promise.all([
          (async () => {
            const { data: { session } } = await supabase.auth.getSession();
            const user = session?.user;
            if (user) {
              const { data: profile } = await supabase
                .from('profiles') // guard-ok: owner-only self profile fetch (eq id user.id)
                .select('*')
                .eq('id', user.id)
                .single();
              return { ...user, profile, access_token: session.access_token };

            }
            return null;
          })(),
          supabase
            .from('party_rooms')
            .select('*')
            .eq('id', roomId)
            .single()
        ]);
        
        if (!isMountedRef.current) return;
        
        if (userData) {
          setCurrentUser(userData);
          sessionAccessTokenRef.current = userData.access_token || null;
                userCoinsRef.current = userData.profile?.coins || 0;
          setUserCoins(userData.profile?.coins || 0);
          
          // ✅ LEVEL CHECK: Block joining if user doesn't meet minimum level
          const isHost = roomData.data?.host_id === userData.id;
          if (!isHost) {
            const profile = userData.profile;
            const { resolveLevelFromTiers } = await import('@/utils/levelResolver');
            const resolvedLevel = await resolveLevelFromTiers({ id: userData.id, ...profile });
            const isFemaleHost = resolvedLevel.isFemaleHost;
            const currentLevel = resolvedLevel.level;
            const result = checkFeatureAccess('join_party', currentLevel, isFemaleHost);
            
            if (!result.canAccess) {
              toast.error(`Level ${result.requiredLevel} required! Your current level: ${result.currentLevel}`);
              navigate(-1);
              return;
            }
          }
        }
        
        if (roomData.error) {
          toast.error("Room not found");
          navigate(-1);
          return;
        }
        
        const hostId = roomData.data?.host_id;
        const { data: hostProfile } = hostId
          ? await supabase
              .from('profiles_public')
              .select('id, display_name, avatar_url, host_level, user_level, country_code, country_flag, frame_id')
              .eq('id', hostId)
              .maybeSingle()
          : { data: null };

        setRoom({ ...(roomData.data as any), host: hostProfile || null } as PartyRoom);
        
        // Fetch participants and seat requests in parallel
        await Promise.all([fetchParticipants(), fetchSeatRequests()]);
        
        if (isMountedRef.current) setLoading(false);
      } catch (error) {
        console.error('Error initializing room:', error);
        recordClientError({ label: "PartyRoom.result", message: error instanceof Error ? error.message : String(error) });
        if (isMountedRef.current) navigate(-1);
      }
    };
    
    initRoom();
    
    // CRITICAL: Handle browser close/tab close - close room instantly for host
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Use ref to check host status at the time of close (avoid stale closure)
      const isHostNow = roomRef.current?.host_id === currentUserRef.current?.id;
      const accessToken = sessionAccessTokenRef.current;
      const sendPatchBeacon = (path: string, payload: Record<string, unknown>) => {
        if (!accessToken) return;
        try {
          fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/${path}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              Authorization: `Bearer ${accessToken}`,
              Prefer: 'return=minimal',
            },
            body: JSON.stringify(payload),
            keepalive: true,
          }).catch(() => {});
        } catch { /* ignore unload failures */ }
      };
      
      if (isHostNow && roomId) {
        const leftAt = new Date().toISOString();
        sendPatchBeacon(`party_rooms?id=eq.${encodeURIComponent(roomId)}`, { is_active: false, ended_at: leftAt });
        sendPatchBeacon(`party_room_participants?room_id=eq.${encodeURIComponent(roomId)}&left_at=is.null`, { left_at: leftAt, seat_number: null });
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    // ============= Pkg81b/c: ALL party_room postgres_changes DELETED =============
    // Removed channels (LiveKit-only — zero Supabase Realtime inside party rooms):
    //   - `party-room-all-${roomId}` (participants INSERT/UPDATE/DELETE + seat_requests *)
    //   - `party_room_messages` INSERT subscription (join/chat fanout)
    //
    // Replacements:
    //   - participant join  → Pkg80 LiveKit `participant_joined` DataPacket
    //   - participant leave → Pkg81b LiveKit `RoomEvent.ParticipantDisconnected`
    //     translated to `participant_left` by livekitPartyEventsSignaling.
    //   - seat_requests approve/reject → Pkg80 `seat_action` DataPacket.
    //   - chat fanout → Pkg81c LiveKit `chat_message` DataPacket
    //     (UnifiedPartyRoom handles the receive side). DB INSERT stays
    //     (moderation/audit/late-join history), only the realtime
    //     SUBSCRIPTION is gone.
    // Late-join state = fetchParticipants() / fetchSeatRequests() / fetchRoom()
    // already running on mount. NO postgres_changes — LiveKit-Purist policy.
    const participantChannel: any = null;
    const participantChannelContinued: any = null;
    // ============= Pkg81: ROOM STATUS CHANNEL DELETED =============
    const roomStatusChannel: any = null;
    const roomCloseBroadcastChannel: any = null;


    // Pkg78: Supabase `party-gifts-instant-${roomId}` broadcast channel REMOVED.
    // LiveKit DataPacket (Pkg76 `livekit-gift-sent` window event handler below)
    // is the sole instant gift fanout path. DB persistence still happens via
    // sendGift RPC. Saves ~1 Realtime channel per active party room.
    const giftBroadcastChannel: any = null;
    giftBroadcastChannelRef.current = null;

    // Pkg80: Supabase `join_broadcast_party_${roomId}` channel REMOVED.
    // LiveKit DataPacket (`livekit-party-event` `participant_joined` handler
    // below) is the sole instant join notifier. DB rows remain only for
    // REST snapshots/history — no party-room postgres_changes fallback.
    const joinBroadcastChannel: any = null;

    // Pkg75: parallel LiveKit DataPacket path for room_closed.
    // Sub-50ms delivery; converges with the Supabase broadcast above via
    // `showRoomClosedModal` guard, so duplicates are no-ops.
    const handleLiveKitPartyClosed = (ev: Event) => {
      const detail = (ev as CustomEvent<PartyClosedDetail>).detail;
      if (!detail || detail.roomId !== roomId) return;
      if (!isMountedRef.current) return;
      const isHostNow = roomRef.current?.host_id === currentUserRef.current?.id;
      if (isHostNow || showRoomClosedModal) return;

      console.log('[PartyRoom] 🟣 ⚡ Pkg75 livekit-party-closed received', detail);
      playSound('notification');
      setShowRoomClosedModal(true);
      cleanupWebRTC();
      setTimeout(() => {
        if (isMountedRef.current) navigate('/');
      }, 3000);
    };
    window.addEventListener('livekit-party-closed', handleLiveKitPartyClosed);

    // Pkg76: parallel LiveKit DataPacket path for gift_sent.
    // Sub-50ms fanout; converges with Supabase broadcast above via own-gift
    // skip + 400ms envelope dedupe in livekitGiftSignaling.
    const handleLiveKitPartyGift = (ev: Event) => {
      const giftData = (ev as CustomEvent<GiftSentDetail>).detail;
      if (!giftData || !isMountedRef.current) return;
      if (giftData.scope !== 'party' || giftData.id !== roomId) return;
      const cuid = currentUserRef.current?.id;
      if (giftData.senderId === cuid) return;

      console.log('[PartyRoom] 🟣 ⚡ Pkg76 livekit-gift-sent received:', giftData.giftName);
      const broadcastBeans = Number(giftData.receiverBeans ?? Math.floor((giftData.giftCoins || 0) * (giftData.count || 1) * hostCommissionPercentRef.current / 100));
      const broadcastCoins = Number(giftData.totalCoins ?? (giftData.giftCoins || 0) * (giftData.count || 1));
      if (giftData.receiverId === cuid && broadcastBeans > 0) {
        window.dispatchEvent(new CustomEvent('own-beans-updated', {
          detail: { userId: cuid, beansDelta: broadcastBeans },
        }));
      }

      addFlyingGift({
        senderId: giftData.senderId,
        senderName: giftData.senderName || 'Someone',
        giftName: giftData.giftName,
        giftIcon: giftData.giftIcon || '🎁',
        giftImageUrl: giftData.giftIconUrl,
        animationUrl: giftData.giftAnimationUrl,
        soundUrl: giftData.giftSoundUrl || undefined,
        giftColor: 'from-pink-500 to-purple-500',
        count: giftData.count || 1,
        coins: giftData.giftCoins || 0,
        isReceiverGift: giftData.receiverId ? giftData.receiverId === cuid : false,
      });

      if (giftData.giftKey) markOptimisticPartyGiftCount(giftData.giftKey, broadcastBeans, broadcastCoins);
      setTotalRoomBeans(prev => prev + broadcastBeans);
      if (giftData.senderId) {
        setParticipantBeans(prev => ({
          ...prev,
          [giftData.senderId!]: (prev[giftData.senderId!] || 0) + broadcastCoins,
        }));
      }
      playSound('gift');
    };
    window.addEventListener('livekit-gift-sent', handleLiveKitPartyGift);

    // Pkg80: unified LiveKit DataPacket handler for party ephemeral events
    // (participant_joined + seat_action). Replaces the two Supabase channels
    // removed above. Idempotent — converges with postgres_changes fallbacks
    // via processedBroadcastJoinsRef + setMyPendingRequest state guards.
    const handleLiveKitPartyEvent = (ev: Event) => {
      const detail = (ev as CustomEvent<PartyEventDetail>).detail;
      if (!detail || !isMountedRef.current) return;
      const payload = detail.payload;
      if (!payload || (payload as any).roomId !== roomId) return;

      // --- participant_joined ---
      if (payload.type === 'participant_joined') {
        const data = payload as ParticipantJoinedPayload;
        const myId = currentUserRef.current?.id;
        if (data.userId === myId) return; // self-join already shown optimistically

        const joinKey = `${data.userId}_${Math.floor(data.timestamp / 5000)}`;
        processedBroadcastJoinsRef.current.add(joinKey);

        console.log('[PartyRoom] 🟣 ⚡ Pkg80 livekit participant_joined:', data.userName);

        fetchParticipants();
        addBigoJoinNotification({
          userId: data.userId,
          userName: data.userName,
          userAvatar: data.userAvatar,
          userLevel: data.userLevel,
        });
        setJoinMessages(prev => [...prev.slice(-20), {
          id: `livekit_join_${Date.now()}_${data.userId}`,
          userId: data.userId,
          userName: data.userName,
          userLevel: data.userLevel,
          avatarUrl: data.userAvatar,
          type: 'join' as const,
          timestamp: new Date(),
        }]);
        void supabase.from('party_room_messages').insert({
          room_id: roomId,
          user_id: data.userId,
          content: 'joined the room ✨',
          message_type: 'join',
        });
        if ((data.entranceAnimationUrl || data.entryNameBarUrl || data.vehicleAnimationUrl) && isMountedRef.current) {
          addEntryAnimation({
            userId: data.userId,
            displayName: data.userName,
            avatarUrl: data.userAvatar,
            level: data.userLevel,
            entranceUrl: data.entranceAnimationUrl || undefined,
            entryNameBarUrl: data.entryNameBarUrl || undefined,
            vehicleAnimationUrl: data.vehicleAnimationUrl || undefined,
            soundUrl: data.entranceSoundUrl || undefined,
          });
        }
        return;
      }

      // --- seat_action (Pkg186 LiveKit-Purist) ---
      // ALL viewers apply the seat change as an in-memory delta so the
      // new speaker pops onto the seat instantly (0ms) — no REST refetch.
      if (payload.type === 'seat_action') {
        const data = payload as SeatActionPayload;
        const myId = currentUserRef.current?.id;
        if (!myId) return;
        console.log('[PartyRoom] 🟣 ⚡ Pkg80 livekit seat_action:', data.action, data.requester_id);

        if (data.action === 'approved' && typeof data.seat_position === 'number') {
          // Pkg186: optimistic seat assignment for ALL viewers (not just requester)
          setParticipants(prev => prev.map(p =>
            p.user_id === data.requester_id
              ? { ...p, position: data.seat_position!, role: 'speaker' }
              : p
          ));
          if (data.requester_id === myId) {
            toast.success(`🎉 Seat approved! You are now on seat ${data.seat_position + 1}!`);
            setMyPendingRequest(null);
            setMyPosition(data.seat_position);
          }
        }

        if (data.action === 'rejected' && data.requester_id === myId) {
          toast.error('Your seat request was rejected by the host');
          setMyPendingRequest(null);
        }

        // Host-side pending queue still needs refresh (Supabase source of truth)
        fetchSeatRequests();
        return;
      }


      // --- participant_left (Pkg81b) ---
      // Translated from LiveKit RoomEvent.ParticipantDisconnected by
      // livekitPartyEventsSignaling. Replaces participants DELETE
      // postgres_changes. Just refresh participants list — DB state is
      // already reconciled by the leaving client's leaveRoom RPC.
      if (payload.type === 'participant_left') {
        console.log('[PartyRoom] 🟣 ⚡ Pkg81b livekit participant_left:', (payload as any).userId);
        fetchParticipants();
        return;
      }

      // --- room_state_changed (Pkg81 + Pkg185) ---
      if (payload.type === 'room_state_changed') {
        const data = payload as RoomStateChangedPayload;
        console.log('[PartyRoom] 🟣 ⚡ Pkg81/185 livekit room_state_changed:', data);
        if (typeof data.active_seats === 'number') {
          setRoom(prev => prev ? { ...prev, active_seats: data.active_seats! } : prev);
        }
        // Pkg185: full background apply — supports BOTH cases:
        //   a) background row (image_url + gradient_css) → currentBackground
        //   b) free preset (background_url only, no row) → reset currentBackground
        //      and patch room.background_url so the fallback chain at line 1871
        //      (`currentBackground?.image_url || room.background_url`) resolves
        //      correctly without any REST refetch. Instant viewer update.
        if (data.background) {
          setCurrentBackground({
            id: data.background.id,
            image_url: data.background.image_url ?? null,
            gradient_css: data.background.gradient_css ?? null,
          } as any);
          if (typeof data.background_url !== 'undefined') {
            setRoom(prev => prev ? { ...prev, background_url: data.background_url ?? null, background_id: data.background!.id } : prev);
          }
        } else if (typeof data.background_url !== 'undefined') {
          // Free preset: clear stale background row, set room.background_url
          setCurrentBackground(null as any);
          setRoom(prev => prev ? { ...prev, background_url: data.background_url ?? null, background_id: null } : prev);
        }
        if (data.is_active === false) {
          const isHostNow = roomRef.current?.host_id === currentUserRef.current?.id;
          if (!isHostNow && !showRoomClosedModal && isMountedRef.current) {
            setShowRoomClosedModal(true);
            cleanupWebRTC();
            setTimeout(() => { if (isMountedRef.current) navigate('/'); }, 3000);
          }
        }
        return;
      }
    };
    window.addEventListener('livekit-party-event', handleLiveKitPartyEvent);

    return () => {
      isMountedRef.current = false;
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('livekit-party-closed', handleLiveKitPartyClosed);
      window.removeEventListener('livekit-gift-sent', handleLiveKitPartyGift);
      window.removeEventListener('livekit-party-event', handleLiveKitPartyEvent);
      void (async () => {
        await leaveRoomForCleanup(roomId);
        cleanupWebRTC();
      })();
      // Pkg81b/c: participantChannel + participantChannelContinued deleted (null refs).
      if (participantChannel) supabase.removeChannel(participantChannel);
      if (participantChannelContinued) supabase.removeChannel(participantChannelContinued);
      // Pkg81: roomStatusChannel deleted (null ref).
      if (roomStatusChannel) supabase.removeChannel(roomStatusChannel);
      // Pkg78: giftBroadcastChannel + roomCloseBroadcastChannel removed (null refs).
      // Pkg80: joinBroadcastChannel removed (null ref).
      if (giftBroadcastChannel) supabase.removeChannel(giftBroadcastChannel);
      if (joinBroadcastChannel) supabase.removeChannel(joinBroadcastChannel);
      if (roomCloseBroadcastChannel) supabase.removeChannel(roomCloseBroadcastChannel);
    };
    }, [roomId, markOptimisticPartyGiftCount, leaveRoomForCleanup, cleanupWebRTC]);


  // Pkg187: Removed 20s room-status safety poll. LiveKit `room_state_changed` + `livekit-party-closed` events already deliver instant room-close to all viewers. Zero functional loss, $1400-rule safe.


  // Note: fetchCurrentUser and fetchRoom functions are now inlined in the useEffect above for parallel execution

  // CRITICAL FIX: Use useCallback with refs to prevent stale closures in realtime callbacks
  const fetchParticipants = useCallback(async () => {
    const currentRoomId = roomIdRef.current;
    if (!currentRoomId) return;

    console.log('[PartyRoom] 📥 Fetching participants for room:', currentRoomId);

    const { data, error } = await supabase
      .from('party_room_participants')
      .select('*')
      .eq('room_id', currentRoomId)
      .is('left_at', null)
      .order('seat_number', { ascending: true });

    if (error) {
      console.error('[PartyRoom] ❌ Error fetching participants:', error);
      recordClientError({ label: "PartyRoom.currentRoomId", message: error instanceof Error ? error.message : String(error) });
      return;
    }

    console.log('[PartyRoom] ✅ Fetched', data?.length || 0, 'participants');

    if (!isMountedRef.current) return;

    // Get current user ID from ref to avoid stale closure
    const currentUserId = currentUserRef.current?.id;

    if (data) {
      const userIds = [...new Set(data.map((p: any) => p.user_id).filter(Boolean))];
      const { data: publicProfiles } = userIds.length
        ? await supabase
            .from('profiles_public')
            .select('id, display_name, avatar_url, user_level, frame_id')
            .in('id', userIds)
        : { data: [] as any[] };
      const profileMap = new Map((publicProfiles || []).map((profile: any) => [profile.id, profile]));
      const hydratedParticipants = data.map((participant: any) => ({
        ...participant,
        // Section #12 pass-2: DB column is seat_number — expose it as `position` for app code.
        position: participant.seat_number ?? null,
        user: profileMap.get(participant.user_id) || null,
      }));

      setParticipants(hydratedParticipants as Participant[]);

      // Update my position and role from DB
      if (currentUserId) {
        const myParticipant = data.find(p => p.user_id === currentUserId);
        if (myParticipant) {
          setMyPosition(myParticipant.seat_number ?? null);
          setMyRole(myParticipant.role);

          // If user has a seat position, clear their pending request
          if (myParticipant.seat_number !== null && myParticipant.seat_number !== undefined) {
            setMyPendingRequest(null);
          }
        }
      }
    }
  }, []);

  const fetchSeatRequests = useCallback(async () => {
    const currentRoomId = roomIdRef.current;
    if (!currentRoomId) return;

    console.log('[PartyRoom] 📥 Fetching seat requests for room:', currentRoomId);

    const { data, error } = await supabase
      .from('seat_requests')
      .select('*')
      .eq('room_id', currentRoomId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[PartyRoom] ❌ Error fetching seat requests:', error);
      recordClientError({ label: "PartyRoom.currentRoomId", message: error instanceof Error ? error.message : String(error) });
      return;
    }

    if (!isMountedRef.current) return;

    // Filter out any recently processed requests to prevent race conditions
    const requesterIds = [...new Set((data || []).map((r: any) => r.requester_id).filter(Boolean))];
    const { data: requesterProfiles } = requesterIds.length
      ? await supabase
          .from('profiles_public')
          .select('id, display_name, avatar_url, user_level')
          .in('id', requesterIds)
      : { data: [] as any[] };
    const requesterMap = new Map((requesterProfiles || []).map((profile: any) => [profile.id, profile]));
    const hydratedRequests = (data || []).map((request: any) => ({
      ...request,
      requester: requesterMap.get(request.requester_id) || null,
    }));

    const filteredData = hydratedRequests.filter(
      r => !recentlyProcessedRequestsRef.current.has(r.id)
    );
    
    setSeatRequests(filteredData as SeatRequest[]);
    console.log('[PartyRoom] ✅ Fetched', filteredData.length, 'seat requests');
    
    // Update my pending request using ref to avoid stale closure
    const currentUserId = currentUserRef.current?.id;
    if (currentUserId) {
      const myRequest = filteredData.find(r => r.requester_id === currentUserId);
      setMyPendingRequest(myRequest?.seat_position ?? null);
    }
  }, []);

  // Pkg187: Removed 20s participants + seat_requests safety poll. LiveKit `participant_joined`/`left` + `seat_action` data events + Pkg186 optimistic deltas already deliver instant updates to all viewers. Zero functional loss, $1400-rule safe.


  const joinRoom = async () => {
    if (!roomId || !currentUser) return;

    try {
      const isHostUser = room?.host_id === currentUser.id;
      const userName = currentUser.profile?.display_name || 'User';
      const userLevel = currentUser.profile?.user_level || 1;
      const avatarUrl = currentUser.profile?.avatar_url || undefined;
      
      // First, leave all other active rooms to prevent stale participant records
      await supabase
        .from('party_room_participants')
        .update({ left_at: new Date().toISOString() })
        .eq('user_id', currentUser.id)
        .is('left_at', null)
        .neq('room_id', roomId);
      
      const { error: enterError } = await supabase.rpc('enter_party_room', {
        p_room_id: roomId,
        p_password: null,
      });
      if (enterError) throw enterError;
      
      // 🎯 HOST RULE: Host opening their OWN room should NOT see/trigger an entry effect.
      // Only viewers (and other participants) see entry banners + animations.
      if (isHostUser) {
        console.log('[PartyRoom] 🏠 Host opened own room — skipping self-entry notification/animation/broadcast');
        await fetchParticipants();
        return;
      }

      // Show self-join flying banner (viewers only)
      addBigoJoinNotification({
        userId: currentUser.id,
        userName,
        userAvatar: avatarUrl,
        userLevel,
      });
      
      // ⚡ INSTANT BROADCAST: Tell ALL other participants about this join immediately
      // This fires BEFORE postgres_changes reaches other clients (sub-100ms vs 1-3s)
      
      console.log('[PartyRoom] 🚀 Self joined - checking for equipped entry animation:', userName, 'Level:', userLevel);
      
      // FRESH fetch of profile to ensure we have latest equipped_entrance_id
      // This is critical because user might have just equipped an animation on VIP page
      const { data: freshProfile } = await supabase
        .from('profiles') // guard-ok: owner-only self equipped-asset fetch
        .select('equipped_entrance_id, equipped_entry_name_bar_id, equipped_vehicle_id')
        .eq('id', currentUser.id)
        .single();

      
      const entranceId = freshProfile?.equipped_entrance_id || currentUser.profile?.equipped_entrance_id;
      const nameBarId = freshProfile?.equipped_entry_name_bar_id || currentUser.profile?.equipped_entry_name_bar_id;
      const vehicleId = freshProfile?.equipped_vehicle_id || currentUser.profile?.equipped_vehicle_id;
      
      console.log('[PartyRoom] 🔍 FRESH Profile equipped IDs:', { entranceId, nameBarId, vehicleId });
      
      // Fetch user's equipped entrance animation - uses centralized function that checks ALL tables
      const { entranceAnimationUrl: selfEntranceUrl, entranceSoundUrl: selfEntranceSound, entryNameBarUrl: selfNameBarUrl, vehicleAnimationUrl: selfVehicleUrl } = await fetchUserEntryAnimations(
        entranceId,
        nameBarId,
        vehicleId,
        userLevel
      );
      
      console.log('[PartyRoom] 📍 Animation fetch result:', { selfEntranceUrl, selfNameBarUrl, selfVehicleUrl });
      
      if (selfEntranceUrl || selfNameBarUrl || selfVehicleUrl) {
        console.log('[PartyRoom] 🚗 Self has equipped animation:', { selfEntranceUrl, selfNameBarUrl, selfVehicleUrl });
        // TRIGGER entry animation for SELF using UNIFIED system (like gifts)
        addEntryAnimation({
          userId: currentUser.id,
          displayName: userName,
          avatarUrl,
          level: userLevel,
          entranceUrl: selfEntranceUrl || undefined,
          entryNameBarUrl: selfNameBarUrl || undefined,
          vehicleAnimationUrl: selfVehicleUrl || undefined,
          soundUrl: selfEntranceSound || undefined,
        });
      } else {
        console.log('[PartyRoom] ⚠️ Self has NO equipped entry animation');
      }
      
      // Pkg80: LiveKit DataPacket replaces Supabase `join_broadcast_party_*`
      // channel. Sub-50ms fanout; DB row remains for REST snapshot/history.
      void publishPartyEvent(roomId, {
        type: 'participant_joined',
        roomId,
        userId: currentUser.id,
        userName,
        userAvatar: avatarUrl,
        userLevel,
        entranceAnimationUrl: selfEntranceUrl || null,
        entranceSoundUrl: selfEntranceSound || null,
        entryNameBarUrl: selfNameBarUrl || null,
        vehicleAnimationUrl: selfVehicleUrl || null,
        timestamp: Date.now(),
      }).then((sent) => {
        if (sent) console.log('[PartyRoom] ⚡ Pkg80 livekit participant_joined published for:', userName);
      });
      
      await fetchParticipants();
    } catch (error) {
      console.error('Error joining room:', error);
      recordClientError({ label: "PartyRoom.joinBroadcastChannel", message: error instanceof Error ? error.message : String(error) });
    }
  };

  useEffect(() => {
    if (!room?.id || !currentUser?.id) return;
    const joinKey = `${room.id}:${currentUser.id}`;
    if (joinedRoomKeyRef.current === joinKey) return;
    joinedRoomKeyRef.current = joinKey;
    void joinRoom();
  }, [room?.id, currentUser?.id]);

  // Ensure video stream is connected when localStream changes
  useEffect(() => {
    if (localStream && videoRef.current && room?.room_type === 'video') {
      console.log("[PartyRoom] Connecting local stream to video element, tracks:", localStream.getTracks().length);
      videoRef.current.srcObject = localStream;
      videoRef.current.onloadedmetadata = () => {
        videoRef.current?.play().catch(e => console.log("Video play error:", e));
      };
    }
  }, [localStream, room?.room_type]);

  // Helper function to connect video stream to element
  const connectVideoStream = (element: HTMLVideoElement | null, stream: MediaStream | null) => {
    if (element && stream) {
      console.log("[PartyRoom] Connecting stream to video element, tracks:", stream.getTracks().length);
      element.srcObject = stream;
      element.onloadedmetadata = () => {
        element.play().catch(e => console.log("Video play error:", e));
      };
    }
  };

  const leaveRoom = async () => {
    if (!roomId || !currentUser) return;

    try {
      // If host is leaving, close the room completely
      console.log('[PartyRoom] leaveRoom called - isHost:', isHost, 'roomId:', roomId, 'userId:', currentUser.id);
      
      if (isHost) {
        console.log('[PartyRoom] Host leaving - closing room with is_active: false');
        const closedAt = new Date().toISOString();

        // Pkg78: Supabase `party-room-close-${roomId}` broadcast REMOVED.
        // LiveKit publishPartyClosed is the sole instant fanout path.

        // Pkg75 audit fix: AWAIT publishPartyClosed BEFORE the LiveKit Room
        // can be disconnected by the unmount cleanup. Previously fire-and-forget,
        // which meant `publishData(reliable)` could be queued but never flushed
        // when cleanupWebRTC ran right after leaveRoom — viewers then had to
        // wait for the 20s safety poll. Awaiting (~<50ms) guarantees the
        // packet leaves the host's Room while it is still `connected`.
        await publishPartyClosed(roomId, {
          hostId: currentUser.id,
          closedAt,
        }).catch((err) => {
          console.warn('[Pkg75] publishPartyClosed:', err);
          return false;
        });

        // Then mark room as inactive in database
        const { error: updateError } = await supabase
          .from('party_rooms')
          .update({ is_active: false, ended_at: closedAt })
          .eq('id', roomId);
        
        if (updateError) {
          console.error('[PartyRoom] Error setting is_active: false -', updateError);
          recordClientError({ label: "PartyRoom.closeChannel", message: updateError instanceof Error ? updateError.message : String(updateError) });
        } else {
          console.log('[PartyRoom] Successfully set is_active: false for room:', roomId);
        }
        
        // Leave all participants
        await supabase
          .from('party_room_participants')
          .update({ left_at: closedAt, seat_number: null })
          .eq('room_id', roomId)
          .is('left_at', null);
        
        // Pkg78: closeChannel removed; no cleanup needed.
      } else {
        // Regular participant leaving
        await supabase
          .from('party_room_participants')
          .update({ left_at: new Date().toISOString(), seat_number: null })
          .eq('room_id', roomId)
          .eq('user_id', currentUser.id);
      }

      // Cancel any pending seat requests
      await supabase
        .from('seat_requests')
        .update({ status: 'cancelled' })
        .eq('room_id', roomId)
        .eq('requester_id', currentUser.id)
        .eq('status', 'pending');
    } catch (error) {
      console.error('Error leaving room:', error);
      recordClientError({ label: "PartyRoom.closeChannel", message: error instanceof Error ? error.message : String(error) });
    }
  };

  // Request to take a seat (for non-hosts)
  const requestSeat = async (position: number) => {
    if (!roomId || !currentUser || !room) return;

    // Check if seat is already taken
    const seatTaken = participants.find(p => p.position === position);
    if (seatTaken) {
      toast.error("This seat is already taken");
      return;
    }

    // HOST AUTO-JOIN: If user is the host, directly assign seat without request
    if (isHost) {
      try {
        // Directly update participant position (host auto-joins)
        const { error: seatError } = await supabase
          .from('party_room_participants')
          .update({ seat_number: position, role: 'speaker' })
          .eq('room_id', roomId)
          .eq('user_id', currentUser.id);

        if (seatError) {
          console.error('[PartyRoom] Host seat assignment error:', seatError);
          recordClientError({ label: "PartyRoom.seatTaken", message: seatError instanceof Error ? seatError.message : String(seatError) });
          toast.error("Failed to join seat");
          return;
        }

        // Update local state immediately
        setParticipants(prev => prev.map(p => 
          p.user_id === currentUser.id 
            ? { ...p, position: position, role: 'speaker' }
            : p
        ));
        setMyPosition(position);
        setShowSeatSelector(false);
        void publishPartyEvent(roomId, {
          type: 'seat_action',
          roomId,
          action: 'approved',
          requester_id: currentUser.id,
          seat_position: position,
          request_id: `host-move-${currentUser.id}-${Date.now()}`,
          timestamp: Date.now(),
        });
        
        console.log('[PartyRoom] Host auto-joined seat:', position);
        return;
      } catch (error) {
        console.error('[PartyRoom] Host seat error:', error);
        recordClientError({ label: "PartyRoom.seatTaken", message: error instanceof Error ? error.message : String(error) });
        toast.error("Failed to join seat");
        return;
      }
    }

    // REGULAR USER: Request seat (needs host approval)
    // Check if already has a pending request
    if (myPendingRequest !== null) {
      toast.error("You already have a pending request for Seat " + myPendingRequest);
      return;
    }

    try {
      // First, check if there's already a pending request and cancel it
      await supabase
        .from('seat_requests')
        .update({ status: 'cancelled' })
        .eq('room_id', roomId)
        .eq('requester_id', currentUser.id)
        .eq('status', 'pending');
      
      // Now insert new request
      const { error } = await supabase
        .from('seat_requests')
        .insert({
          room_id: roomId,
          requester_id: currentUser.id,
          seat_position: position,
          status: 'pending'
        });

      if (error) {
        console.error('[PartyRoom] Seat request insert error:', error);
        recordClientError({ label: "PartyRoom.seatTaken", message: error instanceof Error ? error.message : String(error) });
        toast.error("Failed to send seat request. Please try again.");
        return;
      }
      
      setMyPendingRequest(position);
      setShowSeatSelector(false);
      
      // ✅ Toast notification - User knows request was sent
      toast.success(`Seat ${position + 1} request sent! Waiting for host approval...`);
      
      console.log('[PartyRoom] ✅ Seat request created for position:', position);
      
      // Pkg80: LiveKit DataPacket replaces `party-room-all-*` seat_action send.
      void publishPartyEvent(roomId, {
        type: 'seat_action',
        roomId,
        action: 'new_request',
        requester_id: currentUser.id,
        seat_position: position,
        requester_name: currentUser.profile?.display_name || 'User',
        timestamp: Date.now(),
      });
      
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        user_id: currentUser.id,
        message: `requested Seat ${position + 1}`,
        created_at: new Date().toISOString(),
        type: 'seat_request',
        user: {
          display_name: currentUser.profile?.display_name,
          avatar_url: currentUser.profile?.avatar_url
        }
      }]);
      
      await fetchSeatRequests();
    } catch (error) {
      console.error('Error requesting seat:', error);
      recordClientError({ label: "PartyRoom.broadcastChannel", message: error instanceof Error ? error.message : String(error) });
      toast.error("Failed to send seat request");
    }
  };
  
  // Get available seats for selection - USE ADMIN PANEL SETTINGS
  const getAvailableSeats = () => {
    // ✅ USE ADMIN PANEL SETTINGS for seat count
    const maxSeats = room?.room_type === 'audio' 
      ? adminPartyLimits.max_audio_participants 
      : room?.room_type === 'game'
        ? adminPartyLimits.max_game_participants
        : adminPartyLimits.max_video_participants;
    
    const takenPositions = participants.filter(p => p.position !== null).map(p => p.position);
    const pendingPositions = seatRequests.map(r => r.seat_position);
    
    return Array.from({ length: maxSeats - 1 }, (_, i) => i + 1)
      .filter(pos => !takenPositions.includes(pos));
  };


  // Host approves seat request

  // Host approves seat request
  const approveSeatRequest = async (request: SeatRequest) => {
    if (!isHost) {
      console.log('[PartyRoom] ❌ Cannot approve - not host');
      return;
    }
    
    console.log('[PartyRoom] 🎯 Host approving seat request:', request.id, 'for user:', request.requester_id, 'position:', request.seat_position);

    // Mark as recently processed to prevent realtime refetch from bringing it back
    recentlyProcessedRequestsRef.current.add(request.id);

    // Immediately update local state for faster UI update (optimistic)
    setSeatRequests(prev => prev.filter(r => r.id !== request.id));
    setParticipants(prev => prev.map(p => 
      p.user_id === request.requester_id 
        ? { ...p, position: request.seat_position, role: 'speaker' }
        : p
    ));

    try {
      // STEP 1: First assign the seat to the participant
      // This is the CRITICAL step that makes the user visible on the seat
      const { error: seatError } = await supabase
        .from('party_room_participants')
        .update({ 
          seat_number: request.seat_position, 
          role: 'speaker',
          // Ensure left_at is null so user stays in room
          left_at: null
        })
        .eq('room_id', roomId)
        .eq('user_id', request.requester_id);

      if (seatError) {
        console.error('[PartyRoom] ❌ Error assigning seat:', seatError);
        recordClientError({ label: "PartyRoom.approveSeatRequest", message: seatError instanceof Error ? seatError.message : String(seatError) });
        toast.error('Failed to assign seat');
        await fetchSeatRequests();
        await fetchParticipants();
        return;
      }

      console.log('[PartyRoom] ✅ Seat assigned to user:', request.requester_id, 'at position:', request.seat_position);

      // STEP 2: Update the request status to approved
      const { error: updateError } = await supabase
        .from('seat_requests')
        .update({ status: 'approved', responded_at: new Date().toISOString() })
        .eq('id', request.id);

      if (updateError) {
        console.error('[PartyRoom] ⚠️ Error updating seat request status (seat already assigned):', updateError);
        recordClientError({ label: "PartyRoom.approveSeatRequest", message: updateError instanceof Error ? updateError.message : String(updateError) });
      }

      // Pkg80: LiveKit DataPacket replaces `party-room-all-*` seat_action send.
      // DB status update remains for persistence/late-join REST snapshots.
      void publishPartyEvent(roomId, {
        type: 'seat_action',
        roomId,
        action: 'approved',
        requester_id: request.requester_id,
        seat_position: request.seat_position,
        request_id: request.id,
        timestamp: Date.now(),
      });
      
      // Force refresh participants to update UI immediately for all users
      await fetchParticipants();
      
      toast.success(`✅ Seat ${request.seat_position + 1} approved!`);
      
      // Clean up the tracking after a delay
      setTimeout(() => {
        recentlyProcessedRequestsRef.current.delete(request.id);
      }, 3000);

    } catch (error) {
      console.error('Error approving seat:', error);
      recordClientError({ label: "PartyRoom.broadcastChannel", message: error instanceof Error ? error.message : String(error) });
      // Revert on error
      await fetchSeatRequests();
      await fetchParticipants();
    }
  };

  // Host rejects seat request
  const rejectSeatRequest = async (request: SeatRequest) => {
    if (!isHost) return;

    // Mark as recently processed to prevent realtime refetch from bringing it back
    recentlyProcessedRequestsRef.current.add(request.id);

    // Immediately update local state (optimistic)
    setSeatRequests(prev => prev.filter(r => r.id !== request.id));

    try {
      const { error } = await supabase
        .from('seat_requests')
        .update({ status: 'rejected', responded_at: new Date().toISOString() })
        .eq('id', request.id);

      if (error) {
        console.error('[PartyRoom] Error rejecting seat request:', error);
        recordClientError({ label: "PartyRoom.rejectSeatRequest", message: error instanceof Error ? error.message : String(error) });
        await fetchSeatRequests();
        return;
      }
      
      // Pkg80: LiveKit DataPacket replaces `party-room-all-*` seat_action send.
      void publishPartyEvent(roomId, {
        type: 'seat_action',
        roomId,
        action: 'rejected',
        requester_id: request.requester_id,
        request_id: request.id,
        timestamp: Date.now(),
      });
      
      console.log('[PartyRoom] Seat rejected for request:', request.id);
      
      // Clean up the tracking after a delay
      setTimeout(() => {
        recentlyProcessedRequestsRef.current.delete(request.id);
      }, 3000);

    } catch (error) {
      console.error('Error rejecting seat:', error);
      recordClientError({ label: "PartyRoom.broadcastChannel", message: error instanceof Error ? error.message : String(error) });
      await fetchSeatRequests();
    }
  };

  // Host invites someone to a seat
  const inviteToSeat = async (userId: string, position: number) => {
    // This would be for inviting specific users - simplified for now
  };

  // Promote user to admin
  const promoteToAdmin = async (userId: string) => {
    if (!isHost || !roomId) return;
    
    try {
      await supabase
        .from('party_room_participants')
        .update({ role: 'admin' })
        .eq('room_id', roomId)
        .eq('user_id', userId);
      
      toast.success("User promoted to Admin!");
      fetchParticipants();
      setSelectedParticipant(null);
    } catch (error) {
      console.error('Error promoting user:', error);
      recordClientError({ label: "PartyRoom.promoteToAdmin", message: error instanceof Error ? error.message : String(error) });
      toast.error("Failed to promote user");
    }
  };

  // Demote admin to regular user
  const demoteFromAdmin = async (userId: string) => {
    if (!isHost || !roomId) return;
    
    try {
      await supabase
        .from('party_room_participants')
        .update({ role: 'audience' })
        .eq('room_id', roomId)
        .eq('user_id', userId);
      
      toast.success("Admin role removed");
      fetchParticipants();
      setSelectedParticipant(null);
    } catch (error) {
      console.error('Error demoting user:', error);
      recordClientError({ label: "PartyRoom.demoteFromAdmin", message: error instanceof Error ? error.message : String(error) });
      toast.error("Failed to demote user");
    }
  };

  // Kick user from room - ONLY way for users to leave seats
  const kickUser = async (userId: string) => {
    if (!canManageUsers || !roomId) {
      console.log('[PartyRoom] ❌ Cannot kick - no permission');
      return;
    }

    console.log('[PartyRoom] 🚫 Host kicking user:', userId);

    try {
      // 🛡️ Phase 4: VIP/Noble anti-kick protection check
      const moderatorId = currentUser?.id;
      if (moderatorId && moderatorId !== userId) {
        const { data: antiKick, error: antiKickErr } = await supabase.rpc(
          'check_user_anti_kick',
          { _target_user_id: userId, _moderator_user_id: moderatorId }
        );
        if (!antiKickErr) {
          const result: any = antiKick;
          if (result?.protected) {
            const rank = result?.protection_source === 'noble_card'
              ? `Noble (${result?.rank_name || ''})`
              : `VIP (${result?.tier_name || ''})`;
            toast.error(`Cannot kick — ${rank} member has anti-kick protection.`);
            console.log('[PartyRoom] 🛡️ Kick blocked by anti-kick:', result);
            return;
          }
        }
      }

      // Remove user from seat AND room
      await supabase
        .from('party_room_participants')
        .update({ 
          left_at: new Date().toISOString(), 
          seat_number: null,
          role: 'audience'
        })
        .eq('room_id', roomId)
        .eq('user_id', userId);
      
      // Also cancel any pending seat requests from this user
      await supabase
        .from('seat_requests')
        .update({ status: 'cancelled' })
        .eq('room_id', roomId)
        .eq('requester_id', userId)
        .eq('status', 'pending');
      
      toast.success("User removed from room");
      await fetchParticipants();
      await fetchSeatRequests();
      setSelectedParticipant(null);
      
      console.log('[PartyRoom] ✅ User kicked successfully');
    } catch (error) {
      console.error('Error kicking user:', error);
      recordClientError({ label: "PartyRoom.rank", message: error instanceof Error ? error.message : String(error) });
      toast.error("Failed to remove user");
    }
  };

  // Mute user (for admins/hosts)
  const muteUser = async (userId: string) => {
    if (!canManageUsers) return;
    // Would send a signal via WebRTC or database to mute
    toast.success("User muted");
    setSelectedParticipant(null);
  };

  // Share room - use production domain
  const shareRoom = async () => {
    const { generatePartyRoomLink, shareLink: doShare } = await import('@/utils/shareLinks');
    const roomUrl = generatePartyRoomLink(roomId);
    const shareText = `Join my party room: ${room?.name || 'Party Room'}`;
    
    const success = await doShare(roomUrl, {
      title: room?.name || 'Party Room',
      text: shareText
    });
    
    if (success) {
      toast.success("Room link copied!");
    }
    setShowSettings(false);
  };

  const sendMessage = () => {
    if (!message.trim()) return;
    
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      user_id: currentUser?.id,
      message: message.trim(),
      created_at: new Date().toISOString(),
      type: 'message',
      user: {
        display_name: currentUser?.profile?.display_name,
        avatar_url: currentUser?.profile?.avatar_url
      }
    }]);
    // 🔥 AWS Comprehend toxic content moderation (background)
    checkToxic(message.trim(), { contextType: 'party_room', roomId }).catch(() => {});
    setMessage("");
  };

  const sendHeart = () => {
    const newHeart = Date.now();
    setFloatingHearts(prev => [...prev, newHeart]);
    setTimeout(() => {
      setFloatingHearts(prev => prev.filter(h => h !== newHeart));
    }, 2000);
  };

  const getParticipantBySeat = (position: number) => {
    return participants.find(p => p.position === position);
  };

  const pendingRequestCount = seatRequests.length;
  const isMuted = !isAudioEnabled;
  const isVideoOff = !isVideoEnabled;


  if (!room) {
    return null;
  }

  // ==================== ALL ROOM TYPES USE UNIFIED COMPONENT ====================
  // Video, Audio, Game - same component, same design, same features
  return (
    <>
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

      {/* Flying Gift Animation */}
      <AnimatePresence>
        {flyingGifts.map(gift => (
          <FlyingGiftAnimation
            key={gift.id}
            gift={gift}
            onComplete={() => removeFlyingGift(gift.id)}
          />
        ))}
      </AnimatePresence>

      {/* ==================== UNIFIED PARTY ROOM ==================== */}
      {/* Same component for Video, Audio, Game - only layout changes */}
      <UnifiedPartyRoom
        roomType={room.room_type}
        roomName={room.name}
        roomId={room.id}
        backgroundUrl={currentBackground?.image_url || room.background_url || undefined}
        backgroundGradient={currentBackground?.gradient_css}
        hostInfo={room.host ? {
          id: room.host.id,
          // Use host's actual position from participants, default to 0
          position: participants.find(p => p.user_id === room.host?.id)?.position ?? 0,
          displayName: room.host.display_name || 'Host',
          avatarUrl: room.host.avatar_url || undefined,
          level: Math.max(room.host.host_level || 0, room.host.user_level || 1),
          countryFlag: room.host.country_flag || '🌍',
          beansCount: totalRoomBeans,
          isSpeaking: true,
          // Mic/cam flags must reflect the HOST's own publishing state.
          // Viewers don't publish, so using their local !isAudioEnabled/!isVideoEnabled
          // would falsely flag the host as muted/video-off and render the avatar
          // even though the host's tracks are subscribed and playing.
          isMuted: isHost ? !isAudioEnabled : false,
          isVideoOff: isHost ? !isVideoEnabled : false,
          isHost: true,
          // Host's own preview uses localStream; viewers consume the host's
          // remote stream via getPeerStream(host.id) inside UnifiedPartyRoom.
          stream: isHost ? localStream : getPeerStream(room.host.id)
        } : null}
        hostCountryFlag={room.host?.country_flag || '🌍'}
        hostCountryCode={room.host?.country_code || null}
        participants={participants
          // Exclude the host from participants since hostInfo handles them
          .filter(p => p.position !== null && p.user_id !== room.host?.id)
          .map(p => ({
            id: p.user_id,
            position: p.position || 0,
            displayName: p.user?.display_name || 'User',
            avatarUrl: p.user?.avatar_url || undefined,
            level: p.user?.user_level || 1,
            countryFlag: '🌍',
            beansCount: participantBeans[p.user_id] || 0,
            isSpeaking: false,
            isMuted: false,
            isVideoOff: false,
            isHost: false,
            stream: getPeerStream(p.user_id)
          }))}
        maxSeats={
          // ✅ USE ADMIN PANEL SETTINGS - Priority over room.max_participants
          room.room_type === 'audio' 
            ? adminPartyLimits.max_audio_participants 
            : room.room_type === 'game'
              ? adminPartyLimits.max_game_participants
              : adminPartyLimits.max_video_participants
        }
        initialActiveSeats={room.active_seats}
        viewerCount={participants.length}
        totalBeans={totalRoomBeans}
        onOpenGiftContributors={() => setShowGiftContributors(true)}
        currentUserId={currentUser?.id}
        localStream={localStream}
        isHost={isHost}
        isMuted={!isAudioEnabled}
        isVideoOff={!isVideoEnabled}
        onMicToggle={toggleAudio}
        onVideoToggle={toggleVideo}
        onRequestSeat={requestSeat}
        onOpenGifts={() => setShowGiftPanel(true)}
        onBeautyClick={() => {
          if (deepAR.isNativeAndroid) {
            void deepAR.openBeautyPanel();
          } else {
            deepAR.setShowBeautyPanel(true);
          }
        }}
        onStickerClick={() => {
          if (deepAR.isNativeAndroid) {
            void deepAR.toggleSticker();
          } else {
            toast("AR Stickers are available in the Android app only");
          }
        }}
        onClose={async () => {
          await leaveRoom();
          cleanupWebRTC();
          navigate('/');
        }}
        getPeerStream={getPeerStream}
        seatRequests={seatRequests.map(sr => ({
          id: sr.id, // Request ID for lookup
          user_id: sr.requester_id, // User ID for Accept/Reject callbacks
          displayName: sr.requester?.display_name || 'User',
          avatarUrl: sr.requester?.avatar_url || undefined,
          level: sr.requester?.user_level || 1,
          requestedAt: new Date(sr.created_at)
        }))}
        onAcceptSeatRequest={(userId) => {
          console.log('[PartyRoom] 🎯 Accept request received for userId:', userId);
          const request = seatRequests.find(sr => sr.requester_id === userId);
          if (request) {
            console.log('[PartyRoom] ✅ Found request, approving:', request.id);
            approveSeatRequest(request);
          } else {
            console.log('[PartyRoom] ❌ No request found for userId:', userId);
            toast.error('Request not found');
          }
        }}
        onRejectSeatRequest={(userId) => {
          console.log('[PartyRoom] 🎯 Reject request received for userId:', userId);
          const request = seatRequests.find(sr => sr.requester_id === userId);
          if (request) {
            console.log('[PartyRoom] ✅ Found request, rejecting:', request.id);
            rejectSeatRequest(request);
          } else {
            console.log('[PartyRoom] ❌ No request found for userId:', userId);
          }
        }}
        viewers={participants.filter(p => p.position === null && p.user_id !== room.host_id).map(p => ({
          id: p.user_id,
          displayName: p.user?.display_name || 'User',
          avatarUrl: p.user?.avatar_url || undefined,
          level: p.user?.user_level || 1,
          countryFlag: '🌍',
          frameId: (p.user as any)?.frame_id || undefined
        }))}
        topViewers={
          // Filter: Exclude ONLY the host (not current user - they should see other visitors)
          // Sort: By level descending (highest level first)
          // CRITICAL: Include frame_id for AvatarWithFrame rendering
          (() => {
            const filtered = participants
              .filter(p => p.user_id !== room.host_id)
              .sort((a, b) => (b.user?.user_level || 1) - (a.user?.user_level || 1))
              .slice(0, 4)
              .map(p => ({
                id: p.user_id, // userId for AvatarWithFrame
                displayName: p.user?.display_name || 'User',
                avatarUrl: p.user?.avatar_url || undefined,
                level: p.user?.user_level || 1,
                frameId: (p.user as any)?.frame_id // Pass frame_id for proper frame rendering
              }));
            console.log('[PartyRoom] topViewers:', filtered.length, filtered);
            return filtered;
          })()
        }
        onInviteViewer={(userId) => {
          toast.success(`Invitation sent to user!`);
        }}
        onKickViewer={(userId) => {
          kickUser(userId);
        }}
        onModerateViewer={isHost ? (userId, displayName) => setModerateTarget({ id: userId, name: displayName }) : undefined}
        isWaitingForApproval={myPendingRequest !== null}
        joinMessages={joinMessages}
        activeGame={room.room_type === 'game' && room.game_mode ? {
          id: room.game_mode,
          name: room.game_mode,
          isActive: true
        } : undefined}
        onOpenGame={() => setIsGameExpanded(true)}
        // CRITICAL: Entry animation callback - triggers SVGA for ALL participants
        // This callback is invoked by UnifiedPartyRoom when a participant with equipped effects joins
        onTriggerEntryEffect={(params) => {
          console.log('[PartyRoom] 🎬 onTriggerEntryEffect RECEIVED:', {
            user: params.displayName,
            hasEntranceUrl: !!params.entranceUrl,
            hasNameBarUrl: !!params.entryNameBarUrl,
            hasVehicleUrl: !!(params as any).vehicleAnimationUrl,
            isMounted: isMountedRef.current
          });
          
          if (!isMountedRef.current) {
            console.log('[PartyRoom] ⚠️ Component unmounted, skipping animation');
            return;
          }
          
          // ==================== UNIFIED ENTRY ANIMATION (LIKE GIFTS) ====================
          // Single animation, priority-based: Vehicle > Entrance > NameBar
          // No more sequential triggers or delays - just ONE animation
          console.log('[PartyRoom] 🎬 Using UNIFIED entry animation system');
          
          addEntryAnimation({
            userId: params.userId,
            displayName: params.displayName,
            avatarUrl: params.avatarUrl,
            level: params.level,
            entranceUrl: params.entranceUrl,
            entryNameBarUrl: params.entryNameBarUrl,
            vehicleAnimationUrl: (params as any).vehicleAnimationUrl,
            soundUrl: (params as any).soundUrl,
          });
        }}
      />

      {moderateTarget && room?.id && (
        <HostModerationSheet
          open={!!moderateTarget}
          onClose={() => setModerateTarget(null)}
          roomName={`party_${room.id}`}
          identity={moderateTarget.id}
          displayName={moderateTarget.name}
        />
      )}

      {/* Floating reactions + raise-hand FABs removed — features available via bottom bar */}




      {/* Gift Panel */}
      <AnimatePresence>
        {showGiftPanel && (
          <GiftPanel
            isOpen={showGiftPanel}
            onClose={() => setShowGiftPanel(false)}
            onSendGift={async (gift: GiftData, count: number) => {
              const sendingUser = currentUserRef.current || currentUser;
              const sendingRoom = roomRef.current || room;
              const sendingUserId = sendingUser?.id;
              const sendingRoomId = sendingRoom?.id;
              const receiverId = sendingRoom?.host?.id;
              if (!sendingUserId || !receiverId || !sendingRoomId) return;
              
              // CRITICAL: Prevent self-gifting
              if (sendingUserId === receiverId) {
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
              
              // Prepare gift animation data
              const optimisticReceiverBeans = Math.floor(totalCost * hostCommissionPercentRef.current / 100);
              const giftKey = getPartyGiftRealtimeKey(sendingUserId, gift.id, totalCost, count);
              const senderName = sendingUser?.profile?.display_name || 'You';
              const senderAvatar = sendingUser?.profile?.avatar_url || undefined;
              const senderLevel = sendingUser?.profile?.user_level || 1;
              const giftAnimationData = {
                senderId: sendingUserId,
                senderName,
                giftName: gift.name,
                giftIcon: gift.emoji,
                giftImageUrl: gift.icon_url || undefined,
                animationUrl: gift.animation_url || gift.icon_url || undefined,
                soundUrl: gift.sound_url || undefined,
                giftColor: 'from-pink-500 to-purple-500',
                count: count,
                coins: gift.coins,
                isOwnGift: true,
              };
              
              // Trigger flying gift animation IMMEDIATELY (for sender)
              addFlyingGift(giftAnimationData);
              
              // Pkg78: Supabase gift broadcast REMOVED — LiveKit DataPacket
              // is the sole instant fanout path.
              //
              // Pkg76 audit (Pkg90) fix: direct `publishGiftSent('party', roomId, …)`
              // REMOVED here. `GiftingService.sendGift` (called below) publishes
              // the same envelope after the RPC succeeds. Calling both produced
              // TWO envelopes with different `env.id` → 400ms dedupe missed them
              // → every other participant saw the flying-gift twice and the
              // room/sender bean counters incremented twice. GiftingService
              // publish carries real `coinsSpent`/`hostReceived` from the RPC.

              markOptimisticPartyGiftCount(giftKey, optimisticReceiverBeans, totalCost);
              setTotalRoomBeans(prev => prev + optimisticReceiverBeans);
              setParticipantBeans(prev => ({
                ...prev,
                [sendingUserId]: (prev[sendingUserId] || 0) + totalCost,
              }));
              
              // Gift animation is already playing - no toast needed
              
              // ========== BACKGROUND PROCESSING (fire-and-forget) ==========
              // Process actual transaction in background - don't block UI
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
                    senderId: sendingUserId,
                    receiverId,
                    quantity: count,
                    context: 'party',
                    roomId: sendingRoomId,
                  });

                  releasePendingCost();
                  if (!isMountedRef.current || roomIdRef.current !== sendingRoomId) return;

                  if (!result.success) {
                    userCoinsRef.current += totalCost;
                    setUserCoins(userCoinsRef.current);
                    toast.error(result.error || "Gift failed - diamonds refunded");
                    return;
                  }
                  transactionSucceeded = true;
                  
                  // Refresh actual balance from server (in case of discrepancy)
                  const { data: updatedProfile } = await supabase
                    .from("profiles") // guard-ok: owner-only self balance refresh after gift send
                    .select("coins")
                    .eq("id", sendingUserId)
                    .single();

                  if (!isMountedRef.current || roomIdRef.current !== sendingRoomId) return;
                  
                  if (updatedProfile && pendingGiftCostRef.current === 0) {
                    userCoinsRef.current = updatedProfile.coins || 0;
                    setUserCoins(userCoinsRef.current);
                    // CRITICAL: Update global cached balance so Profile "My Diamonds" reflects instantly
                    const { updateCachedBalance } = await import("@/hooks/useUserBalance");
                    updateCachedBalance(userCoinsRef.current);
                  }
                  
                  // Save gift message to party_room_messages
                  if (result.success) {
                    const finalBeans = result.transaction?.beans_earned ?? optimisticReceiverBeans;
                    const finalCost = result.transaction?.coins_spent ?? totalCost;
                    const giftChatMessage = `[GIFT:${gift.icon_url || ''}] sent ${gift.name} x${count} | -${finalCost} diamonds | +${finalBeans} beans`;
                    const { data: giftRow } = await supabase.from("party_room_messages").insert({
                      room_id: sendingRoomId,
                      user_id: sendingUserId,
                      content: giftChatMessage,
                      message_type: 'gift'
                    }).select('id').single();

                    if (!isMountedRef.current || roomIdRef.current !== sendingRoomId) return;
                    void publishChatMessage('party', sendingRoomId, {
                      messageId: giftRow?.id || `gift-${Date.now()}`,
                      userId: sendingUserId,
                      displayName: senderName,
                      avatarUrl: senderAvatar,
                      userLevel: senderLevel,
                      isHost: sendingUserId === sendingRoom.host_id,
                      message: giftChatMessage,
                      messageType: 'gift',
                    });
                  }
                } catch (err) {
                  releasePendingCost();
                  console.error('[PartyGift] Background processing error:', err);
                  recordClientError({ label: "PartyRoom.giftChatMessage", message: err instanceof Error ? err.message : String(err) });
                  if (transactionSucceeded) return;
                  // Refund coins only when the transaction itself failed before server success.
                  if (!isMountedRef.current || roomIdRef.current !== sendingRoomId) return;
                  userCoinsRef.current += totalCost;
                  setUserCoins(userCoinsRef.current);
                  toast.error(`Gift failed: ${err instanceof Error ? err.message : String(err)}`);
                }
              })();
            }}
            userCoins={userCoins}
          />
        )}
      </AnimatePresence>

      {/* Music Player */}
      <AnimatePresence>
        {showMusicPlayer && (
          <PartyMusicPlayer
            isOpen={showMusicPlayer}
            onClose={() => setShowMusicPlayer(false)}
            isHost={isHost}
          />
        )}
      </AnimatePresence>

      {/* Gift Contributors Panel */}
      <GiftContributorsPanel
        isOpen={showGiftContributors}
        onClose={() => setShowGiftContributors(false)}
        roomId={roomId || ''}
        totalBeans={totalRoomBeans}
      />

      {/* ==================== BIGO-STYLE JOIN BANNERS ==================== */}
      <BigoJoinBannerContainer
        activeNotification={activeBigoJoin}
        onComplete={completeBigoJoin}
      />

      {/* ==================== PREMIUM ROOM CLOSED MODAL ==================== */}
      <RoomEndedModal
        isOpen={showRoomClosedModal}
        hostName={room?.host?.display_name || 'Host'}
        hostAvatar={room?.host?.avatar_url || undefined}
        hostId={room?.host_id}
        roomType="party"
        viewerCount={participants.length}
        duration="0:00"
        onExit={() => {
          setShowRoomClosedModal(false);
          navigate('/');
        }}
      />

      {/* Beauty Filter Panel with Stickers */}
      <BeautyFilterPanel
        isOpen={deepAR.showBeautyPanel}
        onClose={() => deepAR.setShowBeautyPanel(false)}
        settings={deepAR.beautySettings}
        enabled={deepAR.beautyEnabled}
        onSettingsChange={deepAR.handleBeautySettingsChange}
        onEnabledChange={deepAR.handleBeautyEnabledChange}
      />
      <StickerOverlay stickerName={deepAR.activeSticker} onDismiss={() => deepAR.handleStickerChange(null)} />

      {/* Pkg150: Selective video subscription picker — viewers in large rooms can cap concurrent video subs */}
      {!isHost && room?.room_type === 'video' && (
        <SelectiveSubscriptionButton label="Video budget" />
      )}
    </>
  );
};

export default PartyRoom;
