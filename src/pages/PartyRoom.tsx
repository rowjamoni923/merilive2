import { useState, useEffect, useRef, useCallback } from "react";
import { useContentModeration } from "@/hooks/useContentModeration";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { usePartySessionOptional } from "@/features/party-session";
import { useViewerSession } from "@/hooks/useViewerSession";
import { useScreenLock } from "@/hooks/useScreenLock";
import { useNativeAudioFocus } from "@/hooks/useNativeAudioFocus";
import { useAudioFocusAutoMute } from "@/hooks/useAudioFocusAutoMute";
import { useHighRefreshRate } from "@/hooks/useHighRefreshRate";
import { motion, AnimatePresence } from "framer-motion";
import { clearNativeMediaSurface, setNativeMediaSurface } from "@/utils/nativeMediaSurface";

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
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { subscribeToTables } from "@/hooks/useUniversalRealtime";
import { getAppSetting } from "@/utils/appSettingsCache";
import { LiveGameBoard } from "@/components/games/LiveGameBoard";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { usePartyRoomNativeLiveKit } from "@/hooks/usePartyRoomNativeLiveKit";
import LiveKitResilienceNotifier from "@/components/livekit/LiveKitResilienceNotifier";
import { useActiveSpeakers } from "@/hooks/useActiveSpeakers";
import { publishPartyClosed, type PartyClosedDetail } from "@/lib/livekitPartySignaling";
import { type GiftSentDetail } from "@/lib/livekitGiftSignaling";
import { publishChatMessage } from "@/lib/livekitChatSignaling";
import { publishPartyEvent, type PartyEventDetail, type ParticipantJoinedPayload, type SeatActionPayload, type RoomStateChangedPayload } from "@/lib/livekitPartyEventsSignaling";
import { hostKickParticipant, hostMuteParticipantAudio } from "@/lib/livekitModeration";
import { promoteToSpeaker, demoteToAudience } from "@/lib/livekitUpdatePermission";
import { ParticipantVideo } from "@/components/party/ParticipantVideo";
import { GameSelectionModal } from "@/components/party/GameSelectionModal";
// UNIFIED ENTRY ANIMATION - Same architecture as Gift System
import UnifiedEntryAnimation from "@/components/live/UnifiedEntryAnimation";
import { EntryNameBarAnimation } from "@/components/live/EntryNameBarAnimation";
import { useUnifiedEntryDispatcher } from "@/hooks/useUnifiedEntryDispatcher";
import { RoomEndedModal } from "@/components/room/RoomEndedModal";
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
import { SeatInvitePickerSheet } from "@/components/party/SeatInvitePickerSheet";
import { SeatInviteResponseSheet } from "@/components/party/SeatInviteResponseSheet";
import { EmptySeatHostActionsSheet } from "@/components/party/EmptySeatHostActionsSheet";
import PartyGiftSeatPicker, { type PartyGiftSeatPickerSeat } from "@/components/party/PartyGiftSeatPicker";
import { useSeatInvitationInbox } from "@/hooks/useSeatInvitationInbox";
import { fetchUserEntryAnimations } from "@/utils/fetchEntryAnimation";
// Room protection - blocks back button, auto-closes on network loss
import { useRoomProtection } from "@/hooks/useRoomProtection";
import { useFeatureLevelCheck } from "@/hooks/useFeatureLevelCheck";
import { useBeautyState } from "@/hooks/useBeautyState";
import { useProCamera } from "@/camera/useProCamera";
import { BeautyFilterPanel } from "@/components/live/BeautyFilterPanel";
import StickerOverlay from "@/components/live/StickerOverlay";
import { recordClientError } from "@/utils/clientErrorLog";
import { SelectiveSubscriptionButton } from "@/components/livekit/SelectiveSubscriptionButton";
import { warmGiftForInstantPlay } from "@/utils/instantGiftWarmup";
import { normalizeProfileMediaUrl } from "@/utils/profileMediaUrl";
import { getRequiredDisplayLevel } from "@/utils/stableLevel";

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
  const location = useLocation();
  const params = useParams<{ roomId: string }>();
  // Delivery 2: prefer the PartySessionProvider's roomId when present so
  // the parent container stays mounted across phase swaps. Fall back to
  // useParams for legacy `/party/:roomId` deep links (invites, profile
  // jumps, push notifications).
  const partySession = usePartySessionOptional();
  const roomId = partySession?.roomId ?? params.roomId;
  // When in a session container, end-of-room callbacks swap phases
  // instead of navigating away — Provider stays alive for EndedPhase.
  const exitToLobby = useCallback(
    (fallback: string = '/party-rooms') => {
      if (partySession) {
        partySession.goToEnded();
      } else {
        navigate(fallback);
      }
    },
    [partySession, navigate],
  );
  // Pkg443 Phase-3: keep screen awake for the entire party-room session.
  useScreenLock(true);
  // Pkg444 Phase-5: hold media audio focus for the whole party session.
  useNativeAudioFocus({ enabled: true, intent: 'media' });
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
  // NOTE: chat input state lives inside <UnifiedPartyRoom/>; do not duplicate here.
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [showGiftPanel, setShowGiftPanel] = useState(false);
  const [moderateTarget, setModerateTarget] = useState<{ id: string; name: string } | null>(null);

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
  const [userDiamonds, setUserCoins] = useState(0);
  const [myPendingRequest, setMyPendingRequest] = useState<number | null>(null);
  const [games, setGames] = useState<{id: string; name: string; emoji: string; color: string; description?: string}[]>([]);
  const [showParticipants, setShowParticipants] = useState(false);
  const [selectedParticipant, setSelectedParticipant] = useState<Participant | null>(null);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [showMusicPlayer, setShowMusicPlayer] = useState(false);
  const [showRoomClosedModal, setShowRoomClosedModal] = useState(false);
  const roomClosedRef = useRef(false);
  const [showGiftContributors, setShowGiftContributors] = useState(false);
  // Phase III.d — host-side seat invite picker target.
  const [seatInviteTarget, setSeatInviteTarget] = useState<{ id: string; name: string } | null>(null);
  // PR-2.5: per-seat lock map (seat_number -> isLocked) sourced from
  // public.party_room_seat_locks via Supabase Realtime.
  const [seatLocks, setSeatLocks] = useState<Record<number, boolean>>({});
  // PR-2.5: host action sheet target when host taps an empty seat.
  const [emptySeatTarget, setEmptySeatTarget] = useState<number | null>(null);
  // PR-2 (P0-5): password prompt modal state when enter_party_room rejects with
  // 'Password required' / 'Invalid password'. Lets viewers retry without
  // bouncing back to the lobby.
  const [passwordPrompt, setPasswordPrompt] = useState<{ show: boolean; error?: string }>({ show: false });
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  // Phase III.e — per-seat gift target (null = default to host on open).
  const [giftRecipientId, setGiftRecipientId] = useState<string | null>(null);
  const [totalRoomBeans, setTotalRoomBeans] = useState(0);
  // Per-participant SENT coin totals (sender_id -> total diamonds spent in this room)
  const [participantBeans, setParticipantBeans] = useState<Record<string, number>>({});
  // PR-2.3 (G) — Per-seat RECEIVED beans (receiver_id -> beans earned).
  // Mirrors Chamet/Bigo: each co-host seat shows their own earnings, host
  // card keeps showing room-wide total via `totalRoomBeans`.
  const [seatBeansReceived, setSeatBeansReceived] = useState<Record<string, number>>({});
  
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
  
  // Beauty state is UI-only; native beauty was removed for single-camera stability.
  const beauty = useBeautyState();

  // Pkg416 — claim the single professional camera for video/game party.
  // Audio-only rooms skip the arbiter (no camera publish). Family conflict
  // with face-verify → friendly toast, no camera start.
  const partyCameraOwner: 'video-party' | 'game-party' | null =
    room?.room_type === 'video' ? 'video-party'
    : room?.room_type === 'game' ? 'game-party'
    : null;
  const partyProCamera = useProCamera(
    partyCameraOwner ?? 'video-party',
    !!partyCameraOwner,
  );
  // Audio rooms never need camera arbitration — they're always "ready".
  const partyCameraReady = partyCameraOwner ? partyProCamera.ready : true;
  useEffect(() => {
    if (partyProCamera.error) {
      toast.error('Camera is busy with face verification. Please finish that first.');
      // Pkg418 hard gate: bounce out of the room so LiveKit never races.
      const t = setTimeout(() => { try { clearNativeMediaSurface(); navigate(-1); } catch { /* ignore */ } }, 1500);
      return () => clearTimeout(t);
    }
  }, [partyProCamera.error, navigate]);
  
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
    userCoinsRef.current = userDiamonds;
  }, [userDiamonds]);

  // Pkg424: Party participant heartbeat (30s) — keeps server-side "active" status fresh so
  // crashed/network-dropped participants are swept by cleanup_stale_party_participants_v2 cron
  // within ~90s, instead of inflating participant counts / seat lookups for up to 2 hours.
  useEffect(() => {
    const uid = currentUser?.id;
    if (!roomId || !uid) return;
    let cancelled = false;
    const beat = async () => {
      if (cancelled) return;
      try {
        await supabase.rpc('party_participant_heartbeat', { p_room_id: roomId });
      } catch {
        /* ignore — next tick will retry */
      }
    };
    // Fire immediately so a freshly-joined user has a fresh last_seen_at before any sweep.
    beat();
    const hbTimer = setInterval(beat, 30000);
    return () => {
      cancelled = true;
      clearInterval(hbTimer);
    };
  }, [roomId, currentUser?.id]);
  
  // Ref to track component mount status for async operations
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
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
    nameBarOverflowCount,
    addEntryAnimation,
    removeEntryAnimation,
    removeNameBarAnimation,
  } = useUnifiedEntryDispatcher({
    roomId: roomId ?? 'unknown',
    roomType: room?.room_type === 'audio'
      ? 'audio_party'
      : room?.room_type === 'game'
        ? 'game_party'
        : 'video_party',
    selfUserId: currentUser?.id,
    onWelcomeRow: (out) => {
      // Phase 5: coalesced welcome chat row (Bigo/Chamet parity).
      const suffix =
        out.othersCount <= 0
          ? 'joined the room ✨'
          : out.othersCount === 1
            ? 'and 1 other joined the room ✨'
            : `and ${out.othersCount} others joined the room ✨`;
      setMessages(prev => [...prev, {
        id: `welcome_${out.primary.userId}_${Date.now()}`,
        user_id: out.primary.userId,
        message: suffix,
        created_at: new Date().toISOString(),
        type: 'join',
        user: {
          display_name: out.primary.userName,
          avatar_url: out.primary.avatarUrl,
        },
      } as ChatMessage]);

    },
  });

  
  // Flying gift animation
  const { gifts: flyingGifts, addGift: addFlyingGift, removeGift: removeFlyingGift } = useFlyingGifts();
  
  // Sound hook
  const { playSound } = useSound();
  
  // Feature level check for joining party rooms
  const { checkFeatureAccess } = useFeatureLevelCheck();
  
  // Gift broadcast channel ref for instant sync
  const giftBroadcastChannelRef = useRef<any>(null);
  const optimisticGiftCountsRef = useRef<Map<string, { beans: number; diamonds: number; expiresAt: number }>>(new Map());
  const getPartyGiftRealtimeKey = useCallback((senderId?: string | null, giftId?: string | null, diamonds?: number | null, count?: number | null) => {
    return `${senderId || 'unknown'}:${giftId || 'unknown'}:${diamonds || 0}:${count || 1}`;
  }, []);
  const markOptimisticPartyGiftCount = useCallback((key: string, beans: number, diamonds: number) => {
    const now = Date.now();
    optimisticGiftCountsRef.current.set(key, { beans, diamonds, expiresAt: now + 15000 });
    optimisticGiftCountsRef.current.forEach((value, staleKey) => {
      if (value.expiresAt < now) optimisticGiftCountsRef.current.delete(staleKey);
    });
  }, []);
  
  // Track joins already processed by broadcast to deduplicate with postgres_changes
  const processedBroadcastJoinsRef = useRef(new Set<string>());
  // Pkg-audit MEDIUM: gift safety-net dedup vs LiveKit fast-path
  const recentGiftDedupRef = useRef<Map<string, number>>(new Map());
  const seenGiftTxnIdsRef = useRef<Set<string>>(new Set());

  const joinedRoomKeyRef = useRef<string | null>(null);
  const explicitLeaveRef = useRef(false);
  const [mediaReady, setMediaReady] = useState(false);

  useEffect(() => {
    explicitLeaveRef.current = false;
    setMediaReady(false);
  }, [roomId]);

  // Calculate if current user is host for room protection
  const isHostForProtection = room?.host_id === currentUser?.id;
  
  // Room protection - blocks back button, auto-closes on network loss
  useRoomProtection({
    roomType: 'party',
    enabled: !!roomId,
    onNetworkClose: async () => {
      console.log('[PartyRoom] Network lost - keeping room open while LiveKit reconnects');
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
          .select('diamond_amount, receiver_beans, sender_id, receiver_id')
          .eq('party_room_id', roomId);

        if (error) {
          console.error('[PartyRoom] Error fetching beans:', error);
          recordClientError({ label: "PartyRoom.fetchTotalBeans", message: error instanceof Error ? error.message : String(error) });
          return;
        }

        if (data && data.length > 0) {
          const totalGiftValue = data.reduce((sum, tx) => sum + (tx.diamond_amount || 0), 0);
          const hostBeans = data.reduce((sum, tx) => sum + (tx.receiver_beans ?? Math.floor((tx.diamond_amount || 0) * hostCommissionPercent / 100)), 0);
          console.log('[PartyRoom] Total beans calculated:', hostBeans, 'from', data.length, 'transactions, rate:', hostCommissionPercent);
          setTotalRoomBeans(hostBeans);

          // Per-participant gift contribution tracking (sender -> diamonds spent)
          const perUser: Record<string, number> = {};
          // PR-2.3 (G) — per-seat received beans (receiver -> beans earned)
          const perReceiver: Record<string, number> = {};
          data.forEach(tx => {
            if (tx.sender_id) {
              perUser[tx.sender_id] = (perUser[tx.sender_id] || 0) + (tx.diamond_amount || 0);
            }
            if (tx.receiver_id) {
              const b = tx.receiver_beans ?? Math.floor((tx.diamond_amount || 0) * hostCommissionPercent / 100);
              perReceiver[tx.receiver_id] = (perReceiver[tx.receiver_id] || 0) + b;
            }
          });
          setParticipantBeans(perUser);
          setSeatBeansReceived(perReceiver);
        } else {
          console.log('[PartyRoom] No gift transactions for this room yet');
          setTotalRoomBeans(0);
          setParticipantBeans({});
          setSeatBeansReceived({});
        }
      } catch (err) {
        console.error('[PartyRoom] Exception fetching beans:', err);
        recordClientError({ label: "PartyRoom.perUser", message: err instanceof Error ? err.message : String(err) });
      }
    };

    // Initial fetch
    fetchTotalBeans();

    // Pkg-audit MEDIUM: gift_transactions safety-net subscription.
    // LiveKit DataPacket is the primary instant path. But if a sender's WS
    // dropped or background-throttled, their gift was written to DB but
    // never counted on receiver UI until refresh. This realtime channel
    // tops up totals from any INSERT that LiveKit dedup didn't already mark
    // within 5s. ZERO double-count: dedup key = sender|gift|qty.
    const giftSafetyChannel = supabase
      .channel(`party-gifts-safety-${roomId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'gift_transactions', filter: `party_room_id=eq.${roomId}` },
        (payload: any) => {
          const row = payload.new;
          if (!row?.id || seenGiftTxnIdsRef.current.has(row.id)) return;
          seenGiftTxnIdsRef.current.add(row.id);
          if (seenGiftTxnIdsRef.current.size > 500) {
            const first = seenGiftTxnIdsRef.current.values().next().value;
            if (first) seenGiftTxnIdsRef.current.delete(first);
          }
          const dedupKey = `${row.sender_id}|${row.gift_id}|${row.quantity ?? 1}`;
          const lkMark = recentGiftDedupRef.current.get(dedupKey) || 0;
          if (Date.now() - lkMark < 5000) return; // LiveKit fast-path won
          // Safety-net apply
          const beans = Number(row.receiver_beans ?? Math.floor((row.diamond_amount || 0) * hostCommissionPercentRef.current / 100));
          const diamonds = Number(row.total_diamonds ?? row.diamond_amount ?? 0);
          if (beans > 0) {
            setTotalRoomBeans(prev => prev + beans);
            if (row.receiver_id) {
              setSeatBeansReceived(prev => ({
                ...prev,
                [row.receiver_id]: (prev[row.receiver_id] || 0) + beans,
              }));
            }
            const cuid = currentUserRef.current?.id;
            if (row.receiver_id === cuid) {
              try {
                window.dispatchEvent(new CustomEvent('own-beans-updated', {
                  detail: { userId: cuid, beansDelta: beans },
                }));
              } catch { /* ignore */ }
            }
          }
          if (row.sender_id && diamonds > 0) {
            setParticipantBeans(prev => ({
              ...prev,
              [row.sender_id]: (prev[row.sender_id] || 0) + diamonds,
            }));
          }
          console.log('[PartyRoom] Gift safety-net applied (LK missed):', row.id, '+', beans);
        },
      )
      .subscribe();

    return () => {
      try { supabase.removeChannel(giftSafetyChannel); } catch { /* ignore */ }
    };
  }, [roomId, hostCommissionPercent, getPartyGiftRealtimeKey]);


  // Determine if current user is host or admin
  const isHost = room?.host_id === currentUser?.id;

  // Pkg-bgcontinuity — non-host / non-speaker participants keep audio +
  // LiveKit subscriber running when minimized via MediaPlaybackForegroundService.
  // Publishers (host + anyone on a seat) get the camera+mic FGS below instead.
  const isSpeaker = isHost || (myPosition !== null && myPosition !== undefined);
  useViewerSession({ active: !!room && !isSpeaker, kind: 'party', title: 'In party room' });

  // Background continuity (2026-07-03) — publishers (host + seated speakers)
  // need CallForegroundService (camera+mic FGS type) so Android keeps our
  // LiveKit publish alive when the app is backgrounded. Verified 2026-07-03
  // that LiveKitPlugin.connect() does NOT start any FGS on its own.
  useEffect(() => {
    if (!room || !isSpeaker) return;
    let stopped = false;
    void import('@/plugins/NativeCall').then(({ startBroadcastFgs, stopBroadcastFgs }) => {
      if (stopped) return;
      void startBroadcastFgs('party', room?.name || 'Party room');
      (window as any).__stopPartyFgs = stopBroadcastFgs;
    });
    return () => {
      stopped = true;
      try { void (window as any).__stopPartyFgs?.(); } catch { /* ignore */ }
      try { delete (window as any).__stopPartyFgs; } catch { /* ignore */ }
    };
  }, [!!room, isSpeaker, room?.name]);

  const isAdmin = myRole === 'admin' || isHost;
  const canManageUsers = isHost || isAdmin;

  // Phase III.d — incoming seat invitations for the current user (audience).
  const seatInvitationInbox = useSeatInvitationInbox(currentUser?.id ?? null);

  // Initialize LiveKit (Android native) for multi-user connections
  const {
    localStream,
    peerStreams,
    isConnected,
    connectionState,
    isNativeMediaActive,
    nativeParticipants,
    isAudioEnabled,
    isVideoEnabled,
    toggleAudio,
    toggleVideo,
    cleanup: cleanupNativeLiveKit,
    getPeerStream,
  } = usePartyRoomNativeLiveKit(
    mediaReady ? roomId || null : null,
    currentUser?.id || null,
    room?.room_type || 'video',
    isHost,
    isHost || myPosition !== null,
    partyCameraReady,
    room?.host?.id || null,
    // Phase III.f — DB override wins; else audio rooms = voice (24kbps),
    // video/game rooms = music (96kbps stereo) for DJ-grade sound.
    ((room as any)?.audio_profile as 'voice' | 'music' | undefined)
      ?? (room?.room_type === 'audio' ? 'voice' : 'music')
  );

  useEffect(() => {
    setNativeMediaSurface(isNativeMediaActive);
    return () => clearNativeMediaSurface();
  }, [isNativeMediaActive]);

  // Pkg98: Real-time active speaker set, powered by LiveKit's server-side
  // RoomEvent.ActiveSpeakersChanged (registered inside usePartyRoomNativeLiveKit).
  // ~500ms hangover, sub-200ms latency — same UX Bigo/Chamet ship via Agora's
  // onAudioVolumeIndication. Replaces the previously hardcoded isSpeaking flags.
  const activeSpeakers = useActiveSpeakers('party', roomId || null);

  // Pkg444 Phase-6: auto-mute host/co-host mic on transient audio-focus
  // loss (phone call, alarm, voice assistant). Restored on focus regain
  // only if the user hadn't already muted themselves.
  useAudioFocusAutoMute({
    enabled: isHost,
    intent: 'media',
    isMicEnabled: isAudioEnabled,
    setMicEnabled: (want) => {
      if (want !== isAudioEnabled) {
        try { void toggleAudio(); } catch { /* ignore */ }
      }
    },
  });


  // Voice/silence auto-close intentionally disabled for party rooms.
  // Mobile WebView audio analyzers can report 0 analyzers during permission,
  // reconnect, or LiveKit remount races; explicit close is the only DB close path.

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
                userCoinsRef.current = userData.profile?.diamonds || 0;
          setUserCoins(userData.profile?.diamonds || 0);
          
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
              clearNativeMediaSurface();
              navigate(-1);
              return;
            }
          }
        }
        
        if (roomData.error) {
          toast.error("Room not found");
          clearNativeMediaSurface();
          navigate(-1);
          return;
        }
        
        const hostId = roomData.data?.host_id;
        const { data: hostProfile } = hostId
          ? await supabase
              .from('profiles_public')
              .select('id, display_name, avatar_url, host_level, user_level, country_code, country_flag, frame_id, equipped_frame_id')
              .eq('id', hostId)
              .maybeSingle()
          : { data: null };

        const hostFallback = hostId && userData?.id === hostId ? userData.profile : null;
        const resolvedHost = hostProfile || hostFallback;
        setRoom({
          ...(roomData.data as any),
          host: resolvedHost ? {
            ...resolvedHost,
            id: hostId,
            display_name: resolvedHost.display_name || 'Host',
            avatar_url: normalizeProfileMediaUrl(resolvedHost.avatar_url) || resolvedHost.avatar_url || null,
            frame_id: (resolvedHost as any).equipped_frame_id || (resolvedHost as any).frame_id || null,
          } : null,
        } as PartyRoom);
        
        // Fetch participants and seat requests in parallel
        await Promise.all([fetchParticipants(), fetchSeatRequests()]);
        
        if (isMountedRef.current) setLoading(false);
      } catch (error) {
        console.error('Error initializing room:', error);
        recordClientError({ label: "PartyRoom.result", message: error instanceof Error ? error.message : String(error) });
        if (isMountedRef.current) { clearNativeMediaSurface(); navigate(-1); }
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
      } else if (roomId && currentUserRef.current?.id) {
        // Pkg425: non-host guest fast-leave. Without this the guest's row sits
        // active until the Pkg424 90s cron sweep — inflates participant count for
        // up to a minute on tab-close. Scoped strictly to own user_id so a guest
        // can never accidentally mark other participants left.
        const leftAt = new Date().toISOString();
        const uidParam = encodeURIComponent(currentUserRef.current.id);
        sendPatchBeacon(
          `party_room_participants?room_id=eq.${encodeURIComponent(roomId)}&user_id=eq.${uidParam}&left_at=is.null`,
          { left_at: leftAt, seat_number: null },
        );
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    const unsubscribeSeatRequests = subscribeToTables(
      `party-room-seat-requests-${roomId}`,
      ['seat_requests'],
      (table, event, payload) => {
        const row = payload as any;
        if (row?.room_id !== roomId) return;

        console.log(`[SeatRequest Realtime] ${event} detected for room ${roomId}`);

        // Pkg361 ZERO-REFRESH: Instant seat list update
        // With REPLICA IDENTITY FULL, we always have room_id even on DELETE/UPDATE.
        void fetchSeatRequests();

        // F4 — If someone just requested a seat, host gets a real name toast
        // (Realtime payload has NO requester_name column → fetch profile).
        if (event === 'INSERT' && isHost && row.status === 'pending') {
          playSound('notification');
          const requesterId = row.requester_id || row.user_id;
          const seatPos = row.seat_position ?? row.seat_number;
          (async () => {
            let name = 'A viewer';
            if (requesterId) {
              const { data: prof } = await supabase
                .from('profiles_public')
                .select('display_name')
                .eq('id', requesterId)
                .maybeSingle();
              if (prof?.display_name) name = prof.display_name;
            }
            const seatLabel = typeof seatPos === 'number' ? ` Seat ${seatPos + 1}` : ' a seat';
            toast.info(`${name} requested${seatLabel}`);
          })().catch(() => {
            toast.info('Someone requested a seat');
          });
        }
      }
    );


    // ============= Pkg81b/c: MOST party_room postgres_changes DELETED =============
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
      if (isHostNow || roomClosedRef.current) return;

      console.log('[PartyRoom] 🟣 ⚡ Pkg75 livekit-party-closed received', detail);
      roomClosedRef.current = true;
      playSound('notification');
      setShowRoomClosedModal(true);
      cleanupNativeLiveKit();
      setTimeout(() => {
        if (isMountedRef.current) { clearNativeMediaSurface(); navigate('/'); }
      }, 7000);
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
      // Pkg-audit MEDIUM: mark dedup so Postgres safety-net skips this gift
      try {
        const k = `${giftData.senderId}|${giftData.giftId || ''}|${giftData.count || 1}`;
        recentGiftDedupRef.current.set(k, Date.now());
        if (recentGiftDedupRef.current.size > 200) {
          const cutoff = Date.now() - 10000;
          for (const [key, ts] of recentGiftDedupRef.current) {
            if (ts < cutoff) recentGiftDedupRef.current.delete(key);
          }
        }
      } catch { /* ignore */ }
      warmGiftForInstantPlay({
        icon_url: giftData.giftIconUrl || null,
        animation_url: giftData.giftAnimationUrl || null,
        animation_format: giftData.giftAnimationFormat || null,
        animation_config_url: giftData.giftAnimationConfigUrl || null,
        sound_url: giftData.giftSoundUrl || null,
      } as any);
      const broadcastBeans = Number(giftData.receiverBeans ?? Math.floor((giftData.giftCoins || 0) * (giftData.count || 1) * hostCommissionPercentRef.current / 100));
      const broadcastCoins = Number(giftData.totalDiamonds ?? (giftData.giftCoins || 0) * (giftData.count || 1));
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
        animationFormat: giftData.giftAnimationFormat || null,
        animationConfigUrl: giftData.giftAnimationConfigUrl || undefined,
        soundUrl: giftData.giftSoundUrl || undefined,
        giftColor: 'from-pink-500 to-purple-500',
        count: giftData.count || 1,
        diamonds: giftData.giftCoins || 0,
        isReceiverGift: giftData.receiverId ? giftData.receiverId === cuid : false,
      });

      if (giftData.giftKey) markOptimisticPartyGiftCount(giftData.giftKey, broadcastBeans, broadcastCoins);
      setTotalRoomBeans(prev => prev + broadcastBeans);
      if (giftData.receiverId && broadcastBeans > 0) {
        setSeatBeansReceived(prev => ({
          ...prev,
          [giftData.receiverId!]: (prev[giftData.receiverId!] || 0) + broadcastBeans,
        }));
      }
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
        if (processedBroadcastJoinsRef.current.has(joinKey)) return;
        processedBroadcastJoinsRef.current.add(joinKey);

        console.log('[PartyRoom] 🟣 ⚡ Pkg80 livekit participant_joined:', data.userName);

        setParticipants(prev => prev.some(p => p.user_id === data.userId)
          ? prev
          : [...prev, {
              id: `livekit-${data.userId}`,
              user_id: data.userId,
              role: 'audience',
              position: null,
              user: {
                id: data.userId,
                display_name: data.userName,
                avatar_url: data.userAvatar || null,
                user_level: data.userLevel,
              },
            }]);
        fetchParticipants();
        setJoinMessages(prev => [...prev.slice(-20), {
          id: `livekit_join_${Date.now()}_${data.userId}`,
          userId: data.userId,
          userName: data.userName,
          userLevel: data.userLevel,
          avatarUrl: data.userAvatar,
          type: 'join' as const,
          timestamp: new Date(),
        }]);
        // F2 — Client-side `party_room_messages` insert REMOVED.
        // DB trigger `trg_party_participants_announce_join` now writes the
        // join row exactly ONCE (was N−1 duplicates: one per receiver client).
        // F5 — Always trigger entry namebar for every viewer (gradient fallback
        // in useEntryAnimations when no equipped URL). Chamet-parity.
        addEntryAnimation({
          userId: data.userId,
          displayName: data.userName,
          avatarUrl: data.userAvatar,
          level: data.userLevel,
          entranceUrl: data.entranceAnimationUrl || undefined,
          entryNameBarUrl: data.entryNameBarUrl || undefined,
          vehicleAnimationUrl: data.vehicleAnimationUrl || undefined,
          soundUrl: data.entranceSoundUrl || undefined,
          rankCode: data.rankCode || undefined,
        });
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
        const userId = (payload as any).userId;
        console.log('[PartyRoom] 🟣 ⚡ Pkg81b livekit participant_left:', userId);
        if (userId) {
          let leftParticipant: Participant | undefined;
          setParticipants(prev => {
            leftParticipant = prev.find(p => p.user_id === userId);
            return prev.filter(p => p.user_id !== userId);
          });
          const userName = leftParticipant?.user?.display_name || 'A viewer';
          const userLevel = getRequiredDisplayLevel(leftParticipant?.user);
          const userAvatar = normalizeProfileMediaUrl(leftParticipant?.user?.avatar_url) || leftParticipant?.user?.avatar_url || undefined;
          setJoinMessages(prev => [...prev.slice(-20), {
            id: `lk_leave_${Date.now()}_${userId}`,
            userId,
            userName,
            userLevel,
            avatarUrl: userAvatar,
            type: 'leave' as const,
            timestamp: new Date(),
          }]);
        }
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
          if (!isHostNow && !roomClosedRef.current && isMountedRef.current) {
            roomClosedRef.current = true;
            setShowRoomClosedModal(true);
            cleanupNativeLiveKit();
            setTimeout(() => { if (isMountedRef.current) { clearNativeMediaSurface(); navigate('/'); } }, 7000);
          }
        }
        return;
      }
    };
    window.addEventListener('livekit-party-event', handleLiveKitPartyEvent);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('livekit-party-closed', handleLiveKitPartyClosed);
      window.removeEventListener('livekit-gift-sent', handleLiveKitPartyGift);
      window.removeEventListener('livekit-party-event', handleLiveKitPartyEvent);
      unsubscribeSeatRequests?.();
      void (async () => {
        if (explicitLeaveRef.current) {
          await leaveRoomForCleanup(roomId);
        } else {
          // SPA navigation (back button / route change) without explicit Leave —
          // still free the participant's seat so the 90s stale-cleanup cron
          // doesn't keep it blocked. Host case is skipped: host SPA-leaving
          // should NOT auto-close the room (matches Chamet/Bigo behaviour).
          try {
            const user = currentUserRef.current;
            const activeRoom = roomRef.current;
            const isHostNow = activeRoom?.host_id === user?.id;
            if (user?.id && roomId && !isHostNow) {
              const leftAt = new Date().toISOString();
              await supabase
                .from('party_room_participants')
                .update({ left_at: leftAt, seat_number: null })
                .eq('room_id', roomId)
                .eq('user_id', user.id)
                .is('left_at', null);
            }
          } catch (e) {
            console.warn('[PartyRoom] SPA-unmount seat release failed:', e);
          }
        }
        cleanupNativeLiveKit();
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
    }, [roomId, markOptimisticPartyGiftCount, leaveRoomForCleanup, cleanupNativeLiveKit]);

  useEffect(() => {
    if (!roomId || isHost) return;

    const closeFromDb = () => {
      if (roomClosedRef.current || !isMountedRef.current) return;
      roomClosedRef.current = true;
      console.log('[PartyRoom] Room detected closed by party_rooms realtime');
      playSound('notification');
      setShowRoomClosedModal(true);
      cleanupNativeLiveKit();
      setTimeout(() => { if (isMountedRef.current) { clearNativeMediaSurface(); navigate('/'); } }, 7000);
    };

    // Direct scoped channel for room close. This is the durable fallback when
    // LiveKit room_closed packet is missed and avoids shared-channel rebuild races.
    const roomCloseChannel = supabase
      .channel(`party-room-end-${roomId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'party_rooms',
        filter: `id=eq.${roomId}`,
      }, (payload) => {
        const row = (payload as any).new;
        if (row?.is_active === false || row?.ended_at) closeFromDb();
      })
      .subscribe();

    return () => { supabase.removeChannel(roomCloseChannel); };
  }, [roomId, isHost, cleanupNativeLiveKit, navigate]);


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
            .select('id, display_name, avatar_url, user_level, host_level, max_user_level, gender, is_host, frame_id, equipped_frame_id')
            .in('id', userIds)
        : { data: [] as any[] };
      const profileMap = new Map((publicProfiles || []).map((profile: any) => [profile.id, {
        ...profile,
        avatar_url: normalizeProfileMediaUrl(profile.avatar_url) || profile.avatar_url || null,
        frame_id: profile.equipped_frame_id || profile.frame_id || null,
      }]));
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
          .select('id, display_name, avatar_url, user_level, host_level, max_user_level, gender, is_host')
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

  // Pkg187: Removed 20s participants + seat_requests safety poll. LiveKit `participant_joined`/`left` + `seat_action` data events + Pkg186 optimistic deltas already deliver instant updates to all viewers.
  //
  // Pkg382 (audit-fix — host couldn't see new viewers): LiveKit DataPackets are
  // best-effort and can be silently dropped (e.g. viewer publishes packet
  // before their LiveKit Room is fully connected, host's room joins late
  // and misses earlier packets, or a transient WS hiccup). Per Core rule
  // "instant realtime — LiveKit for in-room, Supabase Realtime for everything
  // else", we keep BOTH paths: LiveKit DataPacket = primary instant path,
  // Supabase Realtime on `party_room_participants` filtered to this room =
  // authoritative DB-backed fallback. Only triggers a single debounced
  // fetchParticipants() per burst — zero polling, scoped to room lifecycle.
  useEffect(() => {
    if (!roomId) return;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const pendingJoinTimers = new Map<string, ReturnType<typeof setTimeout>>();
    const scheduleRefetch = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (isMountedRef.current) {
          void fetchParticipants();
          void fetchSeatRequests();
          // Phase 7 dedupe: notify ChametStyleViewerPanel (and any other
          // mounted listeners) so they can pull fresh data WITHOUT opening
          // their own duplicate Realtime channel.
          try {
            window.dispatchEvent(new CustomEvent('party-participants-refetched', { detail: { roomId } }));
          } catch { /* ignore */ }
        }
      }, 250);
    };
    const channel = supabase
      .channel(`party-room-participants-realtime-${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'party_room_participants', filter: `room_id=eq.${roomId}` },
        (payload: any) => {
          // Pkg-audit MEDIUM: INSTANT participant count update.
          // Don't wait 250ms debounce + REST fetch — patch state from payload
          // first so viewerCount={participants.length} updates immediately.
          // Debounced refetch still runs to hydrate full profile fields.
          try {
            const newRow = payload.new || {};
            const oldRow = payload.old || {};
            if (payload.eventType === 'INSERT' && newRow.user_id && !newRow.left_at) {
              setParticipants(prev => prev.some(p => p.user_id === newRow.user_id)
                ? prev
                : [...prev, { ...newRow } as Participant]);
            } else if (payload.eventType === 'DELETE' && oldRow.user_id) {
              setParticipants(prev => prev.filter(p => p.user_id !== oldRow.user_id));
            } else if (payload.eventType === 'UPDATE' && newRow.user_id) {
              if (newRow.left_at) {
                setParticipants(prev => prev.filter(p => p.user_id !== newRow.user_id));
              }
            }
          } catch { /* ignore */ }
          scheduleRefetch();

          // Pkg383 safety-net: welcome popup + join chat from Postgres INSERT
          // when LiveKit participant_joined fanout is missed.
          if (payload.eventType !== 'INSERT') return;
          const row = payload.new;
          const uid: string | undefined = row?.user_id;
          const myId = currentUserRef.current?.id;
          if (!uid || !row || row.left_at || uid === myId) return;
          const joinKey = `${uid}_${Math.floor(Date.now() / 5000)}`;
          if (processedBroadcastJoinsRef.current.has(joinKey)) return;
          if (pendingJoinTimers.has(uid)) return;
          const timer = setTimeout(async () => {
            pendingJoinTimers.delete(uid);
            const recheckKey = `${uid}_${Math.floor(Date.now() / 5000)}`;
            if (processedBroadcastJoinsRef.current.has(joinKey) || processedBroadcastJoinsRef.current.has(recheckKey)) return;
            processedBroadcastJoinsRef.current.add(joinKey);
            const { data: prof } = await supabase
              .from('profiles_public')
              .select('display_name, avatar_url, user_level, host_level, max_user_level, gender, is_host, equipped_entrance_id, equipped_entry_name_bar_id, equipped_vehicle_id')
              .eq('id', uid)
              .maybeSingle();
            if (!isMountedRef.current) return;
            const userName = prof?.display_name || 'User';
            const userLevel = getRequiredDisplayLevel(prof);
            const userAvatar = normalizeProfileMediaUrl(prof?.avatar_url) || prof?.avatar_url || undefined;
            setJoinMessages(prev => [...prev.slice(-20), {
              id: `pg_join_${Date.now()}_${uid}`,
              userId: uid,
              userName,
              userLevel,
              avatarUrl: userAvatar,
              type: 'join' as const,
              timestamp: new Date(),
            }]);
            try {
              const { entranceAnimationUrl, entranceSoundUrl, entryNameBarUrl, vehicleAnimationUrl, rankCode } = await fetchUserEntryAnimations(
                (prof as any)?.equipped_entrance_id,
                (prof as any)?.equipped_entry_name_bar_id,
                (prof as any)?.equipped_vehicle_id,
                userLevel,
                uid,
              );
              if (!isMountedRef.current) return;
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
              console.warn('[PartyRoom] participant fallback entry animation failed:', e);
            }
          }, 1500);
          pendingJoinTimers.set(uid, timer);
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'seat_requests', filter: `room_id=eq.${roomId}` },
        scheduleRefetch,
      )
      .subscribe();

    const seatBroadcast = supabase
      .channel(`party-seat-broadcast-${roomId}`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'seat_event' }, () => {
        scheduleRefetch();
      })
      .subscribe();
    (window as any).__partySeatBroadcast = (window as any).__partySeatBroadcast || {};
    (window as any).__partySeatBroadcast[roomId] = seatBroadcast;

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      pendingJoinTimers.forEach((t) => clearTimeout(t));
      pendingJoinTimers.clear();
      try { supabase.removeChannel(channel); } catch { /* ignore */ }
      try { supabase.removeChannel(seatBroadcast); } catch { /* ignore */ }
      try { delete (window as any).__partySeatBroadcast[roomId]; } catch { /* ignore */ }
    };
  }, [roomId, fetchParticipants, fetchSeatRequests, addEntryAnimation]);

  // ─────────────────────────────────────────────────────────────
  // PR-2.5: per-seat lock state — read once + subscribe to changes.
  // Source of truth: public.party_room_seat_locks (host-managed).
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;

    const load = async () => {
      const { data, error } = await supabase
        .from('party_room_seat_locks')
        .select('seat_number, is_locked')
        .eq('room_id', roomId);
      if (cancelled) return;
      if (error) {
        console.warn('[PartyRoom] seat_locks load failed:', error.message);
        return;
      }
      const next: Record<number, boolean> = {};
      for (const row of (data ?? []) as Array<{ seat_number: number; is_locked: boolean }>) {
        if (row.is_locked) next[row.seat_number] = true;
      }
      setSeatLocks(next);
    };
    load();

    const ch = supabase
      .channel(`party-seat-locks-${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'party_room_seat_locks', filter: `room_id=eq.${roomId}` },
        (payload: any) => {
          const row = payload.new || payload.old || {};
          const seat: number | undefined = row.seat_number;
          if (typeof seat !== 'number') return;
          if (payload.eventType === 'DELETE') {
            setSeatLocks(prev => {
              if (!prev[seat]) return prev;
              const { [seat]: _drop, ...rest } = prev;
              return rest;
            });
          } else {
            const locked = !!(payload.new && payload.new.is_locked);
            setSeatLocks(prev => {
              if (!locked) {
                if (!prev[seat]) return prev;
                const { [seat]: _drop, ...rest } = prev;
                return rest;
              }
              if (prev[seat]) return prev;
              return { ...prev, [seat]: true };
            });
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      try { supabase.removeChannel(ch); } catch { /* ignore */ }
    };
  }, [roomId]);







  // PR-2 (P1-12): defer participant_joined LiveKit publish until the SDK is
  // actually connected. Previously we published immediately after the DB
  // enter_party_room call, while LiveKit was still negotiating — the packet
  // was silently dropped and viewers saw a 1-3s gap before the join banner.
  // Now joinRoom stashes the payload in this ref and an effect flushes it
  // the moment isConnected flips true.
  const pendingJoinPublishRef = useRef<null | (() => void)>(null);

  const joinRoom = async (passwordOverride: string | null = null) => {
    if (!roomId || !currentUser) return;

    try {
      const isHostUser = room?.host_id === currentUser.id;
      const userName = currentUser.profile?.display_name || 'User';
      const userLevel = getRequiredDisplayLevel(currentUser.profile);
      const avatarUrl = normalizeProfileMediaUrl(currentUser.profile?.avatar_url) || currentUser.profile?.avatar_url || undefined;

      // First, leave all other active rooms to prevent stale participant records
      await supabase
        .from('party_room_participants')
        .update({ left_at: new Date().toISOString() })
        .eq('user_id', currentUser.id)
        .is('left_at', null)
        .neq('room_id', roomId);

      const { error: enterError } = await supabase.rpc('enter_party_room', {
        p_room_id: roomId,
        p_password: passwordOverride,
      });
      if (enterError) {
        const msg = String(enterError.message || '');
        // Password gating removed — but if a stale RPC ever raises this, just bounce to lobby cleanly.
        if (/Password required/i.test(msg) || /Invalid password/i.test(msg)) {
          toast.error('Room temporarily unavailable');
          exitToLobby('/party-rooms');
          return;
        }
        if (/Insufficient diamonds for entry fee/i.test(msg)) {
          toast.error('Not enough diamonds for this room\'s entry fee');
          exitToLobby('/party-rooms');
          return;
        }
        throw enterError;
      }

      // 🎯 HOST RULE: Host opening their OWN room should NOT see/trigger an entry effect.
      if (isHostUser) {
        console.log('[PartyRoom] 🏠 Host opened own room — skipping self-entry notification/animation/broadcast');
        await fetchParticipants();
        return;
      }

      console.log('[PartyRoom] 🚀 Self joined - checking for equipped entry animation:', userName, 'Level:', userLevel);

      // FRESH fetch of profile to ensure we have latest equipped_entrance_id
      const { data: freshProfile } = await supabase
        .from('profiles') // guard-ok: owner-only self equipped-asset fetch
        .select('equipped_entrance_id, equipped_entry_name_bar_id, equipped_vehicle_id')
        .eq('id', currentUser.id)
        .single();

      const entranceId = freshProfile?.equipped_entrance_id || currentUser.profile?.equipped_entrance_id;
      const nameBarId = freshProfile?.equipped_entry_name_bar_id || currentUser.profile?.equipped_entry_name_bar_id;
      const vehicleId = freshProfile?.equipped_vehicle_id || currentUser.profile?.equipped_vehicle_id;

      const { entranceAnimationUrl: selfEntranceUrl, entranceSoundUrl: selfEntranceSound, entryNameBarUrl: selfNameBarUrl, vehicleAnimationUrl: selfVehicleUrl, rankCode } = await fetchUserEntryAnimations(
        entranceId,
        nameBarId,
        vehicleId,
        userLevel,
        currentUser.id
      );

      // TRIGGER entry/namebar for SELF using UNIFIED system (like gifts)
      addEntryAnimation({
        userId: currentUser.id,
        displayName: userName,
        avatarUrl,
        level: userLevel,
        entranceUrl: selfEntranceUrl || undefined,
        entryNameBarUrl: selfNameBarUrl || undefined,
        vehicleAnimationUrl: selfVehicleUrl || undefined,
        soundUrl: selfEntranceSound || undefined,
        rankCode: rankCode || undefined,
      });

      // PR-2 (P1-12): stash payload; effect below publishes once LiveKit
      // reports isConnected. Avoids the prior race where this packet went
      // out before the SFU was ready and was dropped server-side.
      const publishPayload: ParticipantJoinedPayload = {
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
        rankCode: rankCode || null,
        timestamp: Date.now(),
      } as ParticipantJoinedPayload;
      pendingJoinPublishRef.current = () => {
        void publishPartyEvent(roomId, publishPayload).then((sent) => {
          if (sent) console.log('[PartyRoom] ⚡ Pkg80 livekit participant_joined published for:', userName);
        });
      };

      await fetchParticipants();
    } catch (error) {
      console.error('Error joining room:', error);
      recordClientError({ label: "PartyRoom.joinBroadcastChannel", message: error instanceof Error ? error.message : String(error) });
    }
  };

  // PR-2 (P1-12): flush deferred participant_joined publish when LiveKit
  // signals connected. One-shot per joinRoom call.
  useEffect(() => {
    if (!isConnected) return;
    const flush = pendingJoinPublishRef.current;
    if (!flush) return;
    pendingJoinPublishRef.current = null;
    flush();
  }, [isConnected]);

  useEffect(() => {
    if (!room?.id || !currentUser?.id) return;
    const joinKey = `${room.id}:${currentUser.id}`;
    if (joinedRoomKeyRef.current === joinKey) return;
    joinedRoomKeyRef.current = joinKey;
    // Must await enter_party_room (which inserts the participant row) BEFORE
    // enabling the LiveKit hook — otherwise livekit-token edge fn checks
    // party_room_participants and returns 403 not_party_participant.
    void joinRoom().then(() => setMediaReady(true));
  }, [room?.id, currentUser?.id]);

  // PR-2 (P0-5): retry handler invoked from password prompt modal.
  const handlePasswordSubmit = async () => {
    if (!passwordInput.trim() || passwordSubmitting) return;
    setPasswordSubmitting(true);
    try {
      // Allow re-entry by clearing the join key so joinRoom re-runs.
      joinedRoomKeyRef.current = null;
      const pwd = passwordInput;
      setPasswordPrompt({ show: false });
      setPasswordInput('');
      await joinRoom(pwd);
    } finally {
      setPasswordSubmitting(false);
    }
  };

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
      explicitLeaveRef.current = true;
      setMediaReady(false);
      // If host is leaving, close the room completely
      console.log('[PartyRoom] leaveRoom called - isHost:', isHost, 'roomId:', roomId, 'userId:', currentUser.id);
      
      if (isHost) {
        console.log('[PartyRoom] Host leaving - closing room with is_active: false');
        const closedAt = new Date().toISOString();

        // 1) Fanout party_closed FIRST while still connected to LiveKit.
        await publishPartyClosed(roomId, {
          hostId: currentUser.id,
          closedAt,
        }).catch((err) => {
          console.warn('[Pkg75] publishPartyClosed:', err);
          return false;
        });

        // 2) Release camera/mic immediately so host hardware is freed and
        // any next media app gets audio focus back. DB writes follow.
        try { cleanupNativeLiveKit(); } catch (e) { console.warn('[PartyRoom] cleanupNativeLiveKit failed:', e); }

        // 3) Mark room inactive in database
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
        // Regular participant leaving — release local mic/cam first.
        try { cleanupNativeLiveKit(); } catch (e) { console.warn('[PartyRoom] cleanupNativeLiveKit failed:', e); }
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

  // PR-2.5: extracted so EmptySeatHostActionsSheet "Move here" can call it.
  const hostMoveToSeat = async (position: number) => {
    if (!roomId || !currentUser) return;
    try {
      const { error: seatError } = await supabase
        .from('party_room_participants')
        .update({ seat_number: position, role: 'speaker' })
        .eq('room_id', roomId)
        .eq('user_id', currentUser.id);

      if (seatError) {
        console.error('[PartyRoom] Host seat assignment error:', seatError);
        recordClientError({ label: 'PartyRoom.seatTaken', message: seatError.message });
        toast.error('Failed to join seat');
        return;
      }
      setParticipants(prev => prev.map(p =>
        p.user_id === currentUser.id ? { ...p, position, role: 'speaker' } : p
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
    } catch (error) {
      console.error('[PartyRoom] Host seat error:', error);
      recordClientError({ label: 'PartyRoom.seatTaken', message: error instanceof Error ? error.message : String(error) });
      toast.error('Failed to join seat');
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

    // PR-2.5: Host taps empty seat → open Chamet/Bigo-style action sheet
    // (Move here / Lock / Unlock) instead of auto-joining silently.
    if (isHost) {
      setEmptySeatTarget(position);
      return;
    }
    // (Legacy host auto-join branch removed — handled by sheet → hostMoveToSeat.)
    // (Legacy host auto-join body removed — see hostMoveToSeat / EmptySeatHostActionsSheet.)


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
          user_id: currentUser.id,
          requester_id: currentUser.id,
          seat_number: position,
          seat_position: position,
          status: 'pending'
        } as any);

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

      // Safety-net Supabase Broadcast — guarantees host receives instantly
      try {
        const bc = (window as any).__partySeatBroadcast?.[roomId];
        if (bc) void bc.send({ type: 'broadcast', event: 'seat_event', payload: { kind: 'new_request', requester_id: currentUser.id, seat_position: position } });
      } catch { /* ignore */ }
      
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

    // PR-2 (P1-3): hide the request row optimistically (low-risk UI), but
    // DO NOT optimistically grant the seat. We previously mutated
    // participants → speaker BEFORE the RPC, so on rejection (seat_taken /
    // already_handled / not_host) two clients flickered a phantom speaker.
    // Seat-grant now happens only after the RPC returns ok:true.
    setSeatRequests(prev => prev.filter(r => r.id !== request.id));

    try {
      // Phase III.a: atomic server-side approval via RPC.
      const { data: rpcData, error: rpcError } = await supabase.rpc('approve_seat_request', {
        p_request_id: request.id,
      });

      const result = rpcData as { ok?: boolean; error?: string } | null;

      if (rpcError || !result?.ok) {
        const reason = result?.error || rpcError?.message || 'unknown';
        console.error('[PartyRoom] ❌ approve_seat_request failed:', reason, rpcError);
        recordClientError({ label: 'PartyRoom.approveSeatRequest', message: reason });
        if (reason === 'seat_taken') {
          toast.error('Seat already taken');
        } else if (reason === 'already_handled') {
          // Silently reconcile — another device already approved/rejected
        } else if (reason === 'not_host') {
          toast.error('Only the host can approve seats');
        } else {
          toast.error('Failed to assign seat');
        }
        await fetchSeatRequests();
        await fetchParticipants();
        return;
      }

      // PR-2 (P1-3): seat granted server-side — NOW apply local optimistic
      // promote so the UI reflects truth instantly while Realtime catches up.
      setParticipants(prev => prev.map(p =>
        p.user_id === request.requester_id
          ? { ...p, position: request.seat_position, role: 'speaker' }
          : p
      ));

      console.log('[PartyRoom] ✅ Seat assigned via RPC:', request.requester_id, 'pos:', request.seat_position);

      // Bug-fix #2 (party-publish hole): server-side promote to publisher.
      // The livekit-token edge function now issues canPublish=false to non-
      // seat audience, so we must promote them in-place the moment the host
      // approves a seat. promoteToSpeaker calls livekit-update-permission
      // which mutates ParticipantPermission server-side — no reconnect,
      // INSTANT mic/camera availability on the requester's SDK.
      try {
        const promo = await promoteToSpeaker(`party_${roomId}`, request.requester_id, 'seat_approved');
        if (!promo.success) {
          console.warn('[PartyRoom] promoteToSpeaker failed:', promo.error);
        }
      } catch (e) {
        console.warn('[PartyRoom] promoteToSpeaker threw:', e);
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

      try {
        const bc = (window as any).__partySeatBroadcast?.[roomId];
        if (bc) void bc.send({ type: 'broadcast', event: 'seat_event', payload: { kind: 'approved', request_id: request.id, requester_id: request.requester_id, seat_position: request.seat_position } });
      } catch { /* ignore */ }
      
      // Force refresh participants to update UI immediately for all users
      await fetchParticipants();
      
      toast.success(`✅ Seat ${request.seat_position + 1} approved!`);
      
      // Clean up the tracking after a delay
      setTimeout(() => {
        recentlyProcessedRequestsRef.current.delete(request.id);
      }, 7000);

    } catch (error) {
      console.error('Error approving seat:', error);
      recordClientError({ label: "PartyRoom.broadcastChannel", message: error instanceof Error ? error.message : String(error) });
      // Revert on error
      await fetchSeatRequests();
      await fetchParticipants();
    }
  };

  // Host rejects seat request (PR-1: atomic SECURITY DEFINER RPC)
  const rejectSeatRequest = async (request: SeatRequest) => {
    if (!isHost) return;

    recentlyProcessedRequestsRef.current.add(request.id);
    setSeatRequests(prev => prev.filter(r => r.id !== request.id));

    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('reject_seat_request', {
        p_request_id: request.id,
      });

      const result = rpcData as { ok?: boolean; error?: string } | null;
      if (rpcError || !result?.ok) {
        const reason = result?.error || rpcError?.message || 'unknown';
        console.error('[PartyRoom] reject_seat_request failed:', reason);
        recordClientError({ label: 'PartyRoom.rejectSeatRequest', message: reason });
        if (reason !== 'already_handled') {
          toast.error('Failed to reject seat request');
        }
        await fetchSeatRequests();
        return;
      }

      // Notify requester via LiveKit DataPacket
      void publishPartyEvent(roomId, {
        type: 'seat_action',
        roomId,
        action: 'rejected',
        requester_id: request.requester_id,
        request_id: request.id,
        timestamp: Date.now(),
      });

      try {
        const bc = (window as any).__partySeatBroadcast?.[roomId];
        if (bc) void bc.send({ type: 'broadcast', event: 'seat_event', payload: { kind: 'rejected', request_id: request.id, requester_id: request.requester_id } });
      } catch { /* ignore */ }

      setTimeout(() => {
        recentlyProcessedRequestsRef.current.delete(request.id);
      }, 7000);
    } catch (error) {
      console.error('Error rejecting seat:', error);
      recordClientError({ label: 'PartyRoom.rejectSeatRequest', message: error instanceof Error ? error.message : String(error) });
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

      // Phase-A fix: also unpublish the user's LiveKit tracks via the
      // moderation edge function. Without this the "kicked" user remains
      // visible/audible in the room until they manually close the tab.
      try {
        const lkRoomName = `party_${roomId}`;
        const res = await hostKickParticipant({ roomName: lkRoomName, identity: userId, reason: 'host_kick' });
        if (!res.success) console.warn('[PartyRoom] LiveKit kick failed:', res.error);
      } catch (e) {
        console.warn('[PartyRoom] LiveKit kick threw:', e);
      }

      // PR-1: Atomic kick + ban via SECURITY DEFINER RPC.
      // Replaces the previous raw UPDATE which let kicked users instantly
      // rejoin (no ban row was created). The RPC sets left_at, cancels
      // pending seat requests, and inserts a live_bans row (default 60min)
      // so enter_party_room rejects them on rejoin.
      const { data: kickData, error: kickError } = await supabase.rpc('kick_party_participant', {
        p_room_id: roomId,
        p_user_id: userId,
        p_reason: 'Kicked by host',
        p_ban_minutes: 60,
      });

      const kickResult = kickData as { ok?: boolean; error?: string } | null;
      if (kickError || !kickResult?.ok) {
        const reason = kickResult?.error || kickError?.message || 'unknown';
        console.error('[PartyRoom] kick_party_participant failed:', reason);
        recordClientError({ label: 'PartyRoom.kickUser', message: reason });
        if (reason === 'not_host') toast.error('Only the host can kick users');
        else if (reason === 'cannot_kick_host') toast.error('Host cannot be kicked');
        else if (reason === 'not_in_room') toast.info('User is no longer in the room');
        else toast.error('Failed to remove user');
        return;
      }

      toast.success('User removed and banned (1h)');
      await fetchParticipants();
      await fetchSeatRequests();
      setSelectedParticipant(null);

      console.log('[PartyRoom] ✅ User kicked + banned successfully');
    } catch (error) {
      console.error('Error kicking user:', error);
      recordClientError({ label: "PartyRoom.rank", message: error instanceof Error ? error.message : String(error) });
      toast.error("Failed to remove user");
    }
  };


  // Mute user (for admins/hosts) — Phase III.b: DB-persist first so the mute
  // survives reconnect, then push the LiveKit track-mute for instant effect.
  const muteUser = async (userId: string) => {
    if (!canManageUsers || !roomId) return;
    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('party_mute_seat', {
        p_room_id: roomId,
        p_target_user_id: userId,
        p_muted: true,
      });
      if (rpcErr || !(rpcRes as any)?.ok) {
        const code = (rpcRes as any)?.error || rpcErr?.message || 'unknown';
        console.warn('[PartyRoom] party_mute_seat failed:', code);
        if (code === 'not_host') {
          toast.error("Only the host can mute");
          setSelectedParticipant(null);
          return;
        }
        // participant_not_found / room_not_found → keep going, edge fn may still mute the live track
      }

      const lkRoomName = `party_${roomId}`;
      const res = await hostMuteParticipantAudio({ roomName: lkRoomName, identity: userId, reason: 'host_mute' });
      if (res.success) {
        toast.success("User muted");
        await fetchParticipants();
      } else {
        console.warn('[PartyRoom] LiveKit mute failed:', res.error);
        toast.error("Mute saved but live track update failed");
      }
    } catch (e) {
      console.error('[PartyRoom] muteUser error:', e);
      toast.error("Failed to mute user");
    }
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

  // sendMessage removed — chat handled by <UnifiedPartyRoom/> with persisted party_room_messages.

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
    const pendingRoomName = String((location.state as any)?.roomName || (location.state as any)?.name || 'Party Room');
    return (
      <div
        data-room-shell
        className="room-viewport z-0 overflow-hidden"
        style={{
          background:
            'radial-gradient(ellipse at top, hsl(270 58% 18%) 0%, hsl(262 48% 10%) 48%, hsl(250 38% 5%) 100%)',
        }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_12%,rgba(255,255,255,0.12),transparent_34%)]" />
        <header className="relative z-10 flex items-center justify-between px-3 py-3">
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-full bg-white/[0.12] animate-pulse" />
            <div className="space-y-2">
              <div className="h-3 w-24 rounded-full bg-white/[0.18] animate-pulse" />
              <div className="h-2.5 w-16 rounded-full bg-white/10 animate-pulse" />
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/', { replace: true })}
            className="grid h-9 w-9 place-items-center rounded-full bg-black/45 text-white/80 backdrop-blur-md"
            aria-label="Leave party"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <main className="relative z-10 flex h-[calc(100dvh-88px)] flex-col items-center justify-center gap-7 px-5 pb-24">
          <div className="text-center">
            <div className="mx-auto mb-3 h-16 w-16 rounded-full bg-white/[0.12] animate-pulse" />
            <div className="text-white/75 text-sm font-semibold">{pendingRoomName}</div>
          </div>
          <div className="grid w-full max-w-sm grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="aspect-square rounded-2xl bg-white/10 animate-pulse" />
            ))}
          </div>
          <div className="absolute bottom-[calc(env(safe-area-inset-bottom)+18px)] left-4 right-4 h-11 rounded-full bg-white/10 animate-pulse" />
        </main>
        <div className="sr-only" aria-label="Loading party room" />
      </div>
    );
  }


  // ==================== ALL ROOM TYPES USE UNIFIED COMPONENT ====================
  // Video, Audio, Game - same component, same design, same features
  return (
    <>
      {/* X1+X2: auto audio-only flips + 20-min hard reconnect abandon toasts. */}
      <LiveKitResilienceNotifier
        scope="party"
        id={roomId ?? null}
        onRejoin={() => { try { window.location.reload(); } catch { /* ignore */ } }}
      />
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
          Phase 3: up to 3 concurrent stacked; "+N more" chip for overflow. */}
      {nameBarAnimations.map((nb, idx) => (
        <EntryNameBarAnimation
          key={nb.id}
          userId={nb.userId}
          userName={nb.displayName}
          userLevel={nb.level}
          avatarUrl={nb.avatarUrl}
          animationUrl={nb.animationUrl}
          bottomPosition={`${12 + idx * 7}%`}
          onComplete={() => removeNameBarAnimation(nb.id)}
        />
      ))}
      {nameBarOverflowCount > 0 && (
        <div
          className="fixed left-1/2 -translate-x-1/2 z-[91] pointer-events-none"
          style={{ bottom: `${12 + nameBarAnimations.length * 7}%` }}
        >
          <div className="px-3 py-1 rounded-full bg-black/55 backdrop-blur-md border border-white/15 text-white text-[11px] font-semibold shadow-lg">
            +{nameBarOverflowCount} more
          </div>
        </div>
      )}


      {/* Flying Gift Animation */}
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
          level: getRequiredDisplayLevel(room.host),
          countryFlag: room.host.country_flag || '🌍',
          beansCount: totalRoomBeans,
          isSpeaking: room.host?.id ? activeSpeakers.has(room.host.id) : false,
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
            level: getRequiredDisplayLevel(p.user),
            countryFlag: '🌍',
            beansCount: seatBeansReceived[p.user_id] || 0,
            isSpeaking: activeSpeakers.has(p.user_id),
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
        isConnected={isConnected}
        connectionState={connectionState}
        isNativeMediaActive={isNativeMediaActive}
        nativeParticipants={nativeParticipants}
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
          if (beauty.isNativeAndroid) {
            void beauty.openBeautyPanel();
          } else {
            beauty.setShowBeautyPanel(true);
          }
        }}
        onStickerClick={() => {
          if (beauty.isNativeAndroid) {
            void beauty.toggleSticker();
          } else {
            toast("AR Stickers are available in the Android app only");
          }
        }}
        onClose={() => {
          // Instant-close: navigate on the same frame as the tap; run all
          // teardown (LiveKit leave, DB update, participant cleanup) in the
          // background. Previously the awaited `leaveRoom()` made the X
          // feel unresponsive when RPC/SFU was slow.
          explicitLeaveRef.current = true;
          try { cleanupNativeLiveKit(); } catch { /* ignore */ }
          try { clearNativeMediaSurface(); } catch { /* ignore */ }
          try { exitToLobby('/'); } catch { navigate('/', { replace: true }); }
          void leaveRoom().catch(() => undefined);
        }}
        getPeerStream={getPeerStream}
        seatRequests={seatRequests.map(sr => ({
          id: sr.id, // Request ID for lookup
          user_id: sr.requester_id, // User ID for Accept/Reject callbacks
          displayName: sr.requester?.display_name || 'User',
          avatarUrl: sr.requester?.avatar_url || undefined,
          level: getRequiredDisplayLevel(sr.requester),
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
          level: getRequiredDisplayLevel(p.user),
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
              .sort((a, b) => getRequiredDisplayLevel(b.user) - getRequiredDisplayLevel(a.user))
              .slice(0, 4)
              .map(p => ({
                id: p.user_id, // userId for AvatarWithFrame
                displayName: p.user?.display_name || 'User',
                avatarUrl: p.user?.avatar_url || undefined,
                level: getRequiredDisplayLevel(p.user),
                frameId: (p.user as any)?.frame_id // Pass frame_id for proper frame rendering
              }));
            console.log('[PartyRoom] topViewers:', filtered.length, filtered);
            return filtered;
          })()
        }
        onInviteViewer={(userId) => {
          if (!isHost) return;
          const viewer = participants.find((p) => p.user_id === userId);
          const name = viewer?.user?.display_name || 'Viewer';
          setSeatInviteTarget({ id: userId, name });
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
          partyRoomId={room.id}
        />
      )}

      {/* Phase III.d — Host: invite an audience member to a seat. */}
      {seatInviteTarget && room?.id && currentUser?.id && (
        <SeatInvitePickerSheet
          open={!!seatInviteTarget}
          onClose={() => setSeatInviteTarget(null)}
          roomId={room.id}
          inviterId={currentUser.id}
          inviteeId={seatInviteTarget.id}
          inviteeName={seatInviteTarget.name}
          maxSeats={
            room.room_type === 'audio'
              ? adminPartyLimits.max_audio_participants
              : room.room_type === 'game'
                ? adminPartyLimits.max_game_participants
                : adminPartyLimits.max_video_participants
          }
          occupiedSeats={Array.from(
            new Set(
              [0, ...participants
                .map((p) => p.position)
                .filter((s): s is number => typeof s === 'number')],
            ),
          )}
        />
      )}

      {/* PR-2.5 — Host empty-seat actions (Move / Lock / Unlock). */}
      {emptySeatTarget !== null && room?.id && isHost && (
        <EmptySeatHostActionsSheet
          open={emptySeatTarget !== null}
          onClose={() => setEmptySeatTarget(null)}
          roomId={room.id}
          seatNumber={emptySeatTarget}
          isLocked={!!seatLocks[emptySeatTarget]}
          onMoveHere={() => { void hostMoveToSeat(emptySeatTarget); }}
        />
      )}



      {/* Password prompt removed — all party rooms are public (Chamet/Bigo standard). */}



      {/* Phase III.d — Invitee: respond to seat invitation. */}
      <SeatInviteResponseSheet
        invitation={seatInvitationInbox.pending}
        onAccept={seatInvitationInbox.accept}
        onDecline={seatInvitationInbox.decline}
        onDismiss={seatInvitationInbox.dismiss}
        onAccepted={(invRoomId) => {
          // If invitee accepted while on a different page, route them into the room.
          if (invRoomId && invRoomId !== room?.id) {
            if (partySession) {
              // In-session: swap roomId in place so the Provider (and the
              // active LiveKit/native audio session) stays mounted.
              partySession.setRoomId(invRoomId);
            } else {
              navigate(`/party/${invRoomId}`);
            }
          }
        }}
      />

      {/* Floating reactions + raise-hand FABs removed — features available via bottom bar */}






      {/* Gift Panel */}
      <AnimatePresence>
        {showGiftPanel && (() => {
          // Phase III.e — derive seated participants (host + speakers) for the gift target picker.
          const hostId = room?.host?.id ?? room?.host_id ?? null;
          const seatedMap = new Map<string, PartyGiftSeatPickerSeat>();
          participants.forEach((p) => {
            const uid = p.user_id;
            if (!uid) return;
            const seatNumber = typeof p.position === 'number' ? p.position : -1;
            if (seatNumber < 0) return; // only seated participants
            seatedMap.set(uid, {
              userId: uid,
              displayName: p.user?.display_name ?? null,
              avatarUrl: p.user?.avatar_url ?? null,
              seatNumber,
              isHost: uid === hostId,
            });
          });
          // Always include host (even if missing from participants list yet).
          if (hostId && !seatedMap.has(hostId)) {
            seatedMap.set(hostId, {
              userId: hostId,
              displayName: room?.host?.display_name ?? null,
              avatarUrl: room?.host?.avatar_url ?? null,
              seatNumber: 0,
              isHost: true,
            });
          }
          const seats = Array.from(seatedMap.values());
          const effectiveRecipientId = giftRecipientId && seatedMap.has(giftRecipientId)
            ? giftRecipientId
            : hostId;
          return (
          <>
          <div className="fixed left-0 right-0 bottom-[60vh] z-[60] pointer-events-auto">
            <PartyGiftSeatPicker
              seats={seats}
              selectedUserId={effectiveRecipientId}
              onSelect={(uid) => setGiftRecipientId(uid)}
              selfUserId={currentUser?.id ?? null}
            />
          </div>
          <GiftPanel
            isOpen={showGiftPanel}
            onClose={() => setShowGiftPanel(false)}
            onSendGift={async (gift: GiftData, count: number) => {
              const sendingUser = currentUserRef.current || currentUser;
              const sendingRoom = roomRef.current || room;
              const sendingUserId = sendingUser?.id;
              const sendingRoomId = sendingRoom?.id;
              const fallbackReceiverId = sendingRoom?.host?.id;
              const receiverId = (effectiveRecipientId && effectiveRecipientId !== sendingUserId)
                ? effectiveRecipientId
                : fallbackReceiverId;
              if (!sendingUserId || !receiverId || !sendingRoomId) return;
              
              // CRITICAL: Prevent self-gifting
              if (sendingUserId === receiverId) {
                toast.error("You cannot send gifts to yourself!");
                return;
              }
              
              const totalCost = gift.diamonds * count;
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
              warmGiftForInstantPlay(gift as any);
              const optimisticReceiverBeans = Math.floor(totalCost * hostCommissionPercentRef.current / 100);
              const giftKey = getPartyGiftRealtimeKey(sendingUserId, gift.id, totalCost, count);
              const senderName = sendingUser?.profile?.display_name || 'You';
              const senderAvatar = sendingUser?.profile?.avatar_url || undefined;
              const senderLevel = getRequiredDisplayLevel(sendingUser?.profile);
              const giftAnimationData = {
                senderId: sendingUserId,
                senderName,
                giftName: gift.name,
                giftIcon: gift.emoji,
                giftImageUrl: gift.icon_url || undefined,
                animationUrl: gift.animation_url || gift.icon_url || undefined,
                animationFormat: gift.animation_format || null,
                animationConfigUrl: gift.animation_config_url || undefined,
                soundUrl: gift.sound_url || undefined,
                giftColor: 'from-pink-500 to-purple-500',
                count: count,
                diamonds: gift.diamonds,
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
              // publish carries real `diamondsSpent`/`hostReceived` from the RPC.

              markOptimisticPartyGiftCount(giftKey, optimisticReceiverBeans, totalCost);
              setTotalRoomBeans(prev => prev + optimisticReceiverBeans);
              setParticipantBeans(prev => ({
                ...prev,
                [sendingUserId]: (prev[sendingUserId] || 0) + totalCost,
              }));
              // PR-2.3 (G) — credit the receiving seat instantly
              if (optimisticReceiverBeans > 0) {
                setSeatBeansReceived(prev => ({
                  ...prev,
                  [receiverId]: (prev[receiverId] || 0) + optimisticReceiverBeans,
                }));
              }
              
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
                    gift,
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
                    .select("diamonds")
                    .eq("id", sendingUserId)
                    .single();

                  if (!isMountedRef.current || roomIdRef.current !== sendingRoomId) return;
                  
                  if (updatedProfile && pendingGiftCostRef.current === 0) {
                    userCoinsRef.current = updatedProfile.diamonds || 0;
                    setUserCoins(userCoinsRef.current);
                    // CRITICAL: Update global cached balance so Profile "My Diamonds" reflects instantly
                    const { updateCachedBalance } = await import("@/hooks/useUserBalance");
                    updateCachedBalance(userCoinsRef.current);
                  }
                  
                  // Save gift message to party_room_messages
                  if (result.success) {
                    const finalBeans = result.transaction?.beans_earned ?? optimisticReceiverBeans;
                    const finalCost = result.transaction?.diamonds_spent ?? totalCost;
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
                  // Refund diamonds only when the transaction itself failed before server success.
                  if (!isMountedRef.current || roomIdRef.current !== sendingRoomId) return;
                  userCoinsRef.current += totalCost;
                  setUserCoins(userCoinsRef.current);
                  toast.error(`Gift failed: ${err instanceof Error ? err.message : String(err)}`);
                }
              })();
            }}
            userDiamonds={userDiamonds}
          />
          </>
          );
        })()}
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
          clearNativeMediaSurface();
          navigate('/');
        }}
      />

      {/* Beauty Filter Panel with Stickers */}
      <BeautyFilterPanel
        isOpen={beauty.showBeautyPanel}
        onClose={() => beauty.setShowBeautyPanel(false)}
        settings={beauty.beautySettings}
        enabled={beauty.beautyEnabled}
        onSettingsChange={beauty.handleBeautySettingsChange}
        onEnabledChange={beauty.handleBeautyEnabledChange}
      />
      <StickerOverlay stickerName={beauty.activeSticker} onDismiss={() => beauty.handleStickerChange(null)} />

      {/* Pkg150: Selective video subscription picker — viewers in large rooms can cap concurrent video subs */}
      {!isHost && (room?.room_type === 'video' || room?.room_type === 'game') && (
        <SelectiveSubscriptionButton label="Video budget" />
      )}
    </>
  );
};

export default PartyRoom;
