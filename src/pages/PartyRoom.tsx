import { useState, useEffect, useRef, useCallback } from "react";
import { useContentModeration } from "@/hooks/useContentModeration";
import { useNavigate, useParams } from "react-router-dom";
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
import { LiveGameBoard } from "@/components/games/LiveGameBoard";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { usePartyRoomWebRTC } from "@/hooks/usePartyRoomWebRTC";
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
import { AdvancedPartyBottomBar } from "@/components/party/AdvancedPartyBottomBar";
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
  const [message, setMessage] = useState("");
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [showGiftPanel, setShowGiftPanel] = useState(false);
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
  const hostCommissionPercentRef = useRef(55);
  
  // Keep refs in sync with state
  useEffect(() => {
    currentUserRef.current = currentUser;
    roomRef.current = room;
    roomIdRef.current = roomId;
  }, [currentUser, room, roomId]);
  
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
        // Fetch both settings in parallel
        const [commissionRes, limitsRes] = await Promise.all([
          supabase.from('app_settings').select('setting_value').eq('setting_key', 'gift_commission').maybeSingle(),
          supabase.from('app_settings').select('setting_value').eq('setting_key', 'party_room_limits').maybeSingle()
        ]);
        
        // Gift Commission
        if (commissionRes.data?.setting_value) {
          const settings = commissionRes.data.setting_value as any;
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
        if (limitsRes.data?.setting_value) {
          const limits = limitsRes.data.setting_value as any;
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
    
    // ✅ UNIFIED REAL-TIME SUBSCRIPTION for ALL app_settings changes
    const settingsChannel = supabase
      .channel('party-room-settings-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'app_settings'
      }, (payload: any) => {
        const settingKey = payload.new?.setting_key;
        const settingValue = payload.new?.setting_value;
        
        if (!settingKey || !settingValue) return;
        
        // Handle gift_commission updates
        if (settingKey === 'gift_commission') {
          console.log('[PartyRoom] ⚡ Gift commission updated in real-time:', settingValue);
          let rate = 55;
          if (settingValue.host_percent !== undefined) {
            rate = settingValue.host_percent;
          } else if (settingValue.company_percent !== undefined) {
            rate = 100 - settingValue.company_percent;
          }
          setHostCommissionPercent(rate);
        }
        
        // Handle party_room_limits updates
        if (settingKey === 'party_room_limits') {
          console.log('[PartyRoom] ⚡ Party limits updated in real-time:', settingValue);
          setAdminPartyLimits({
            max_video_participants: settingValue.max_video_participants || 4,
            max_audio_participants: settingValue.max_audio_participants || 12,
            max_game_participants: settingValue.max_game_participants || 6
          });
        }
      })
      .subscribe();
    
    return () => {
      supabase.removeChannel(settingsChannel);
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
  
  // ✅ REAL-TIME BACKGROUND SYNC - Listen for party_rooms.background_id changes
  useEffect(() => {
    if (!roomId) return;
    
    const bgChannel = supabase
      .channel(`party-room-bg-${roomId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'party_rooms',
        filter: `id=eq.${roomId}`
      }, async (payload: any) => {
        const newBgId = payload.new?.background_id;
        
        if (newBgId && newBgId !== currentBackground?.id) {
          console.log('[PartyRoom] ⚡ Background updated via real-time:', newBgId);
          
          // Fetch new background data
          const { data, error } = await supabase
            .from('party_room_backgrounds')
            .select('id, image_url, gradient_css')
            .eq('id', newBgId)
            .single();
          
          if (data && !error) {
            setCurrentBackground(data);
          }
        }
        
        // Also handle active_seats updates
        if (payload.new?.active_seats !== undefined) {
          setRoom(prev => prev ? { ...prev, active_seats: payload.new.active_seats } : prev);
        }
      })
      .subscribe();
    
    return () => {
      supabase.removeChannel(bgChannel);
    };
  }, [roomId, currentBackground?.id]);

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

    // Subscribe for realtime updates to gift transactions
    // CRITICAL: No UUID filter — Supabase Realtime UUID filters can fail silently
    const giftChannel = supabase
      .channel(`party-beans-${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'gift_transactions',
        },
        (payload: any) => {
          // CLIENT-SIDE FILTER: Only count gifts for THIS party room
          if (payload.new?.party_room_id !== roomId) return;
          
          const newGiftValue = payload.new?.coin_amount || 0;
          const newHostBeans = payload.new?.receiver_beans ?? Math.floor(newGiftValue * hostCommissionPercent / 100);
          const senderId = payload.new?.sender_id;
          const giftKey = getPartyGiftRealtimeKey(senderId, payload.new?.gift_id, newGiftValue, payload.new?.quantity);
          const optimistic = optimisticGiftCountsRef.current.get(giftKey);
          if (optimistic) {
            optimisticGiftCountsRef.current.delete(giftKey);
            if (optimistic.beans !== newHostBeans || optimistic.coins !== newGiftValue) {
              setTotalRoomBeans(prev => Math.max(0, prev - optimistic.beans + newHostBeans));
              if (senderId) {
                setParticipantBeans(prev => ({
                  ...prev,
                  [senderId]: Math.max(0, (prev[senderId] || 0) - optimistic.coins + newGiftValue),
                }));
              }
            }
            console.log('[PartyRoom] Gift confirmed by DB:', newHostBeans, 'from:', senderId);
            return;
          }
          console.log('[PartyRoom] New gift received! Adding beans:', newHostBeans, 'from:', senderId);
          setTotalRoomBeans(prev => prev + newHostBeans);
          
          // Update per-participant beans
          if (senderId) {
            setParticipantBeans(prev => ({
              ...prev,
              [senderId]: (prev[senderId] || 0) + newGiftValue
            }));
          }
        }
      )
      .subscribe((status) => {
        console.log('[PartyRoom] Beans realtime subscription status:', status);
      });

    return () => {
      supabase.removeChannel(giftChannel);
    };
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
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();
              return { ...user, profile };
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
              .select('id, display_name, avatar_url, host_level, user_level, country_flag, frame_id')
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
      
      if (isHostNow && roomId) {
        const updateData = JSON.stringify({ is_active: false });
        navigator.sendBeacon(
          `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/party_rooms?id=eq.${roomId}`,
          new Blob([updateData], { type: 'application/json' })
        );
        
        const participantData = JSON.stringify({ left_at: new Date().toISOString() });
        navigator.sendBeacon(
          `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/party_room_participants?room_id=eq.${roomId}&left_at=is.null`,
          new Blob([participantData], { type: 'application/json' })
        );
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    // Setup realtime subscriptions
    console.log('[PartyRoom] Setting up realtime subscription for room:', roomId);
    
    // CRITICAL FIX: Use a single channel for all participant events to prevent race conditions
    // and ensure animations work for ALL room types (Audio, Video, Game)
    const participantChannel = supabase
      .channel(`party-room-all-${roomId}`)
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'party_room_participants', filter: `room_id=eq.${roomId}` },
        async (payload: any) => {
          console.log('[PartyRoom] ⚡ Participant INSERT detected:', payload.new?.user_id);
          
          // CRITICAL: Refresh participants for ALL users in the room immediately
          fetchParticipants();
          
          // DEDUP: Skip join notification if already handled by instant broadcast
          const userId = payload.new?.user_id;
          const joinKey = `${userId}_${Math.floor(Date.now() / 5000)}`;
          if (processedBroadcastJoinsRef.current.has(joinKey)) {
            console.log('[PartyRoom] Skipping postgres_changes join - already handled by broadcast:', userId);
            return;
          }
          
          // IMPORTANT: Show join notification to EVERYONE including the joiner themselves
          // This ensures host, visitors, and the joining user all see the notification
          // NO SKIPPING - All participants should see the join notification
          
          // Get current values from refs to avoid stale closure
          const currentUserVal = currentUserRef.current;
          const roomVal = roomRef.current;
          
          // Show animation for ALL users joining (including self for consistency)
          if (payload.new?.user_id && isMountedRef.current) {
            console.log('[PartyRoom] 🎬 Fetching profile for new participant:', payload.new.user_id);
            // Fetch user profile with entry effect info
            const { data: profile } = await supabase
              .from('profiles_public')
              .select('display_name, avatar_url, user_level, host_level, is_host, equipped_entrance_id, equipped_entry_name_bar_id')
              .eq('id', payload.new.user_id)
              .single();
            
            const { resolveLevelFromTiers } = await import('@/utils/levelResolver');
            const resolvedParticipantLevel = profile
              ? await resolveLevelFromTiers({ id: payload.new.user_id, ...profile }).then(result => result.level).catch(() => profile.user_level || profile.host_level || 1)
              : 1;

            console.log('[PartyRoom] Profile fetched:', profile?.display_name, 'Level:', resolvedParticipantLevel);
            
            if (profile && isMountedRef.current) {
              const userName = profile.display_name || 'User';
              const userLevel = resolvedParticipantLevel;
              const avatarUrl = profile.avatar_url || undefined;
              
              console.log('[PartyRoom] Adding join message for:', userName, 'Level:', userLevel);
              
              // Save join message to party_room_messages table - VISIBLE TO ALL via realtime
              // This ensures host, visitors, and joining user ALL see the message
              await supabase.from('party_room_messages').insert({
                room_id: roomId,
                user_id: payload.new.user_id,
                content: 'joined the room ✨',
                message_type: 'join'
              });
              
              // Also update local state for immediate feedback
              setJoinMessages(prev => [...prev.slice(-20), {
                id: `realtime_${Date.now()}_${payload.new.user_id}`,
                userId: payload.new.user_id,
                userName,
                userLevel,
                avatarUrl,
                type: 'join' as const,
                timestamp: new Date()
              }]);
              
              // Show flying join banner (Bigo-style)
              addBigoJoinNotification({
                userId: payload.new.user_id,
                userName,
                userAvatar: avatarUrl,
                userLevel,
              });
              
              // NOTE: Entry animations are now triggered via UnifiedPartyRoom's onTriggerEntryEffect callback
              // This ensures consistent real-time subscription handling and prevents duplicate animations
              // The UnifiedPartyRoom component fetches and triggers entry effects for ALL participants
            }
          }
        }
      )
      .on('postgres_changes', 
        { event: 'UPDATE', schema: 'public', table: 'party_room_participants', filter: `room_id=eq.${roomId}` },
        (payload: any) => {
          console.log('[PartyRoom] 👤 Participant UPDATE detected:', payload.new?.user_id, 'position:', payload.new?.position);
          // CRITICAL: Refresh participants for ALL users in the room
          fetchParticipants();
        }
      )
      .on('postgres_changes', 
        { event: 'DELETE', schema: 'public', table: 'party_room_participants', filter: `room_id=eq.${roomId}` },
        (payload: any) => {
          console.log('[PartyRoom] 👋 Participant DELETE detected:', payload.old?.user_id);
          // CRITICAL: Refresh participants for ALL users in the room
          fetchParticipants();
        }
      )
      // Also listen for seat requests in the same channel
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'seat_requests', filter: `room_id=eq.${roomId}` },
        (payload: any) => {
          console.log('[PartyRoom] 💺 Seat request change:', payload.eventType, payload.new);
          
          // Use ref for INSTANT user check - NO async auth.getUser() call
          const myId = currentUserRef.current?.id;
          
          // For the REQUESTER: Check if their request was approved
          if (payload.eventType === 'UPDATE' && payload.new?.status === 'approved') {
            if (myId && payload.new.requester_id === myId) {
              const seatPosition = payload.new.seat_position;
              console.log('[PartyRoom] 🎉 MY seat request approved! Position:', seatPosition);
              toast.success(`🎉 Seat approved! You are now on seat ${seatPosition + 1}!`);
              
              // Clear pending request IMMEDIATELY
              setMyPendingRequest(null);
              
              // Update my position in LOCAL STATE immediately - this persists the seat
              setMyPosition(seatPosition);
              
              // Also update participants local state to show me on the seat instantly
              setParticipants(prev => prev.map(p => 
                p.user_id === myId 
                  ? { ...p, position: seatPosition, role: 'speaker' }
                  : p
              ));
              
              // Also refresh from DB after a short delay to ensure consistency
              setTimeout(() => {
                if (isMountedRef.current) {
                  fetchParticipants();
                }
              }, 500);
              
              console.log('[PartyRoom] ✅ Requester PERSISTED on seat:', seatPosition);
            }
          }
          
          // For REJECTED requests
          if (payload.eventType === 'UPDATE' && payload.new?.status === 'rejected') {
            if (myId && payload.new.requester_id === myId) {
              console.log('[PartyRoom] ❌ MY seat request was rejected');
              toast.error('Your seat request was rejected by the host');
              setMyPendingRequest(null);
            }
          }
          
          // Refresh seat requests list (for host) - INSTANT
          fetchSeatRequests();
        }
      )
      // INSTANT broadcast listener for seat actions (faster than postgres_changes)
      .on('broadcast', { event: 'seat_action' }, (payload: any) => {
        const myId = currentUserRef.current?.id;
        if (!myId) return;
        
        const data = payload.payload;
        console.log('[PartyRoom] ⚡ INSTANT seat_action broadcast:', data);
        
        if (data.action === 'approved' && data.requester_id === myId) {
          console.log('[PartyRoom] 🎉 INSTANT: My seat approved at position:', data.seat_position);
          toast.success(`🎉 Seat approved! You are now on seat ${data.seat_position + 1}!`);
          setMyPendingRequest(null);
          setMyPosition(data.seat_position);
          setParticipants(prev => prev.map(p => 
            p.user_id === myId 
              ? { ...p, position: data.seat_position, role: 'speaker' }
              : p
          ));
          // Refresh from DB for consistency
          setTimeout(() => {
            if (isMountedRef.current) fetchParticipants();
          }, 300);
        }
        
        if (data.action === 'rejected' && data.requester_id === myId) {
          console.log('[PartyRoom] ❌ INSTANT: My seat request rejected');
          toast.error('Your seat request was rejected by the host');
          setMyPendingRequest(null);
        }
        
        // For all users: refresh seat requests
        fetchSeatRequests();
      });
    // ============= SEPARATE ROOM STATUS CHANNEL =============
    // CRITICAL: Use a DEDICATED channel for room status to ensure visitors see room close
    // This avoids filter issues with the combined channel
    console.log('[PartyRoom] 🔌 Setting up DEDICATED room status channel for room:', roomId);
    
    const roomStatusChannel = supabase
      .channel(`party-room-status-${roomId}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'party_rooms', filter: `id=eq.${roomId}` },
        async (payload: any) => {
          console.log('[PartyRoom] 📡 Room update received:', {
            is_active: payload.new?.is_active,
            background_id: payload.new?.background_id,
            background_url: payload.new?.background_url,
            active_seats: payload.new?.active_seats
          });
          
          // Handle active_seats updates - sync to ALL participants in real-time
          if (payload.new?.active_seats !== undefined && isMountedRef.current) {
            console.log('[PartyRoom] 🪑 Active seats changed:', payload.new.active_seats);
            setRoom(prev => prev ? {
              ...prev,
              active_seats: payload.new.active_seats
            } : null);
          }
          
          // Handle background updates - REMOVED (handled by dedicated bgChannel listener above)
          // This prevents conflict between two listeners updating different state
          // Background sync is now only handled by the `party-room-bg-${roomId}` channel
          
          // Handle room close
          if (payload.new?.is_active === false && isMountedRef.current) {
            console.log('[PartyRoom] 🔴 Room closed by host - showing modal to visitors');
            
            // Use ref to check host status (avoid stale closure)
            const isHostNow = roomRef.current?.host_id === currentUserRef.current?.id;
            
            console.log('[PartyRoom] isHostNow:', isHostNow, 'hostId:', roomRef.current?.host_id, 'currentUserId:', currentUserRef.current?.id);
            
            // Only show modal to non-hosts (visitors)
            if (!isHostNow) {
              console.log('[PartyRoom] 🎬 Showing RoomEndedModal to visitor');
              setShowRoomClosedModal(true);
              cleanupWebRTC();
              
              // Auto-redirect after 3 seconds
              setTimeout(() => {
                if (isMountedRef.current) {
                  console.log('[PartyRoom] 🏠 Auto-redirecting visitor to home');
                  navigate('/');
                }
              }, 3000);
            } else {
              // Host just navigates away
              console.log('[PartyRoom] 👋 Host closing room - redirecting');
              cleanupWebRTC();
              navigate('/');
            }
          }
        }
      )
      .subscribe((status) => {
        console.log('[PartyRoom] 📡 Room status subscription:', status);
        if (status === 'SUBSCRIBED') {
          console.log('[PartyRoom] ✅ Room status listener ACTIVE - will detect room close & background changes');
        }
      });
    
    // ============= INSTANT ROOM CLOSE BROADCAST LISTENER =============
    // CRITICAL: Use broadcast channel for INSTANT room close notification (no DB delay)
    // This ensures visitors see the modal IMMEDIATELY when host clicks close
    console.log('[PartyRoom] 🔌 Setting up INSTANT room close broadcast listener');
    
    const roomCloseBroadcastChannel = supabase
      .channel(`party-room-close-${roomId}`)
      .on('broadcast', { event: 'room_closed' }, (payload: any) => {
        console.log('[PartyRoom] 🔴 ⚡ INSTANT room_closed broadcast received!', payload);
        
        if (!isMountedRef.current) return;
        
        // Check if we are not the host (only visitors should see modal)
        const isHostNow = roomRef.current?.host_id === currentUserRef.current?.id;
        
        if (!isHostNow && !showRoomClosedModal) {
          console.log('[PartyRoom] 🎬 INSTANT: Showing RoomEndedModal to visitor');
          
          // Play sound for notification
          playSound('notification');
          
          // Show modal immediately
          setShowRoomClosedModal(true);
          cleanupWebRTC();
          
          // Auto-redirect after 3 seconds
          setTimeout(() => {
            if (isMountedRef.current) {
              console.log('[PartyRoom] 🏠 Auto-redirecting visitor to home');
              navigate('/');
            }
          }, 3000);
        }
      })
      .subscribe((status) => {
        console.log('[PartyRoom] 🔌 Room close broadcast subscription:', status);
        if (status === 'SUBSCRIBED') {
          console.log('[PartyRoom] ✅ INSTANT room close broadcast listener ACTIVE');
        }
      });

    // Continue with the participant channel for messages only
    const participantChannelContinued = participantChannel
      // Listen for join/chat messages
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'party_room_messages', filter: `room_id=eq.${roomId}` },
        async (payload: any) => {
          console.log('[PartyRoom] 📨 New message received:', payload.new?.message_type, payload.new?.content);
          
          if (!isMountedRef.current) return;
          
          const messageType = payload.new?.message_type;
          const senderId = payload.new?.user_id;
          
          // Handle join messages - show notification to EVERYONE
          if (messageType === 'join' && senderId) {
            // Fetch sender profile for display
            const { data: senderProfile } = await supabase
              .from('profiles_public')
              .select('display_name, avatar_url, user_level')
              .eq('id', senderId)
              .single();
            
            if (senderProfile && isMountedRef.current) {
              const userName = senderProfile.display_name || 'User';
              const userLevel = senderProfile.user_level || 1;
              const avatarUrl = senderProfile.avatar_url || undefined;
              
              console.log('[PartyRoom] ✨ Showing join notification for:', userName, 'to all participants');
              
              // Add to local join messages state - visible to ALL
              setJoinMessages(prev => {
                // Prevent duplicates
                const exists = prev.some(m => m.userId === senderId && Date.now() - m.timestamp.getTime() < 5000);
                if (exists) return prev;
                
                return [...prev.slice(-20), {
                  id: `msg_${payload.new.id}`,
                  userId: senderId,
                  userName,
                  userLevel,
                  avatarUrl,
                  type: 'join' as const,
                  timestamp: new Date(payload.new.created_at)
                }];
              });
            }
          }
        }
      )
      .subscribe((status) => {
        console.log('[PartyRoom] 📡 UNIFIED realtime subscription status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('[PartyRoom] ✅ ALL real-time subscriptions ACTIVE (participants, seat requests, room status, messages)');
        }
      });

    // ============= INSTANT GIFT BROADCAST CHANNEL =============
    // Use Supabase Broadcast for INSTANT gift sync (no database wait)
    // When sender sends gift, they broadcast to all participants immediately
    console.log('[PartyRoom] 🔌 Setting up INSTANT gift broadcast channel for room:', roomId);
    
    const giftBroadcastChannel = supabase
      .channel(`party-gifts-instant-${roomId}`)
      .on('broadcast', { event: 'gift_sent' }, (payload: any) => {
        console.log('[PartyRoom] 🎁 ⚡ INSTANT gift broadcast received:', payload);
        
        if (!isMountedRef.current) return;
        
        const giftData = payload.payload;
        if (!giftData) return;
        
        // Don't show our own gift (we already triggered it locally)
        // Use ref to avoid stale closure
        const currentUserId = currentUserRef.current?.id;
        if (giftData.senderId === currentUserId) {
          console.log('[PartyRoom] Skipping own gift broadcast');
          return;
        }
        
        console.log('[PartyRoom] 🎁 🎉 INSTANT ANIMATION for:', giftData.giftName, 'from', giftData.senderName);
        const broadcastBeans = Number(giftData.receiverBeans ?? Math.floor((giftData.coins || 0) * (giftData.count || 1) * hostCommissionPercentRef.current / 100));
        const broadcastCoins = Number(giftData.totalCoins ?? (giftData.coins || 0) * (giftData.count || 1));
        
        // Trigger flying gift animation IMMEDIATELY (no DB fetch delay!)
        addFlyingGift({
          senderName: giftData.senderName || 'Someone',
          giftName: giftData.giftName,
          giftIcon: giftData.giftIcon || '🎁',
          giftImageUrl: giftData.giftImageUrl,
          animationUrl: giftData.animationUrl,
          soundUrl: giftData.soundUrl || undefined,
          giftColor: 'from-pink-500 to-purple-500',
          count: giftData.count || 1,
          coins: giftData.coins || 0,
          isReceiverGift: giftData.receiverId
            ? giftData.receiverId === currentUserId
            : false,
        });
        
        // Host + room counters update instantly from broadcast, DB confirmation dedupes later
        if (giftData.giftKey) markOptimisticPartyGiftCount(giftData.giftKey, broadcastBeans, broadcastCoins);
        setTotalRoomBeans(prev => prev + broadcastBeans);
        if (giftData.senderId) {
          setParticipantBeans(prev => ({
            ...prev,
            [giftData.senderId]: (prev[giftData.senderId] || 0) + broadcastCoins,
          }));
        }
        
        // Play gift sound for all participants
        playSound('gift');
      })
      .subscribe((status) => {
        console.log('[PartyRoom] 🔌 Gift broadcast status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('[PartyRoom] ✅ INSTANT gift broadcast ACTIVE - zero-latency gift sync enabled');
        }
      });
    
    // Store channel ref for broadcasting gifts
    giftBroadcastChannelRef.current = giftBroadcastChannel;

    // ============= INSTANT JOIN BROADCAST CHANNEL =============
    // Receives instant join notifications BEFORE postgres_changes (sub-100ms vs 1-3s)
    console.log('[PartyRoom] 🔌 Setting up INSTANT join broadcast channel for room:', roomId);
    
    const joinBroadcastChannel = supabase
      .channel(`join_broadcast_party_${roomId}`)
      .on('broadcast', { event: 'participant_joined' }, async (payload: any) => {
        const data = payload.payload;
        if (!data || !isMountedRef.current) return;
        
        // Skip own join (already shown via optimistic UI)
        const currentUserId = currentUserRef.current?.id;
        if (data.userId === currentUserId) return;
        
        // Track this join to deduplicate with postgres_changes
        const joinKey = `${data.userId}_${Math.floor(data.timestamp / 5000)}`;
        processedBroadcastJoinsRef.current.add(joinKey);
        
        console.log('[PartyRoom] ⚡ INSTANT join broadcast received:', data.userName);
        
        // 1. INSTANT participant refresh
        fetchParticipants();
        
        // 2. INSTANT flying join banner (Bigo-style)
        addBigoJoinNotification({
          userId: data.userId,
          userName: data.userName,
          userAvatar: data.userAvatar,
          userLevel: data.userLevel,
        });
        
        // 3. INSTANT join message to chat
        setJoinMessages(prev => [...prev.slice(-20), {
          id: `broadcast_join_${Date.now()}_${data.userId}`,
          userId: data.userId,
          userName: data.userName,
          userLevel: data.userLevel,
          avatarUrl: data.userAvatar,
          type: 'join' as const,
          timestamp: new Date()
        }]);
        
        // 3. Save join message to DB (non-blocking)
        void supabase.from('party_room_messages').insert({
          room_id: roomId,
          user_id: data.userId,
          content: 'joined the room ✨',
          message_type: 'join'
        });
        
        // 4. INSTANT entry animation (animation URLs already included in broadcast)
        if ((data.entranceAnimationUrl || data.entryNameBarUrl || data.vehicleAnimationUrl) && isMountedRef.current) {
          addEntryAnimation({
            userId: data.userId,
            displayName: data.userName,
            avatarUrl: data.userAvatar,
            level: data.userLevel,
            entranceUrl: data.entranceAnimationUrl || undefined,
            entryNameBarUrl: data.entryNameBarUrl || undefined,
            vehicleAnimationUrl: data.vehicleAnimationUrl || undefined,
          });
        }
      })
      .subscribe((status) => {
        console.log('[PartyRoom] 🔌 Join broadcast status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('[PartyRoom] ✅ INSTANT join broadcast ACTIVE');
        }
      });

    return () => {
      isMountedRef.current = false;
      window.removeEventListener('beforeunload', handleBeforeUnload);
      leaveRoom();
      cleanupWebRTC();
      supabase.removeChannel(participantChannel);
      supabase.removeChannel(roomStatusChannel);
      supabase.removeChannel(giftBroadcastChannel);
      supabase.removeChannel(joinBroadcastChannel);
      supabase.removeChannel(roomCloseBroadcastChannel);
    };
    }, [roomId, markOptimisticPartyGiftCount]);

  // ============= POLLING FALLBACK FOR ROOM CLOSE DETECTION =============
  // In case realtime subscription fails, poll every 5 seconds to check room status
  useEffect(() => {
    if (!roomId || !currentUser) return;
    
    const pollRoomStatus = async () => {
      try {
        const { data, error } = await supabase
          .from('party_rooms')
          .select('is_active, host_id')
          .eq('id', roomId)
          .single();
        
        if (error || !data) {
          console.log('[PartyRoom] 🔍 Poll: Room not found');
          return;
        }
        
        if (data.is_active === false && isMountedRef.current) {
          console.log('[PartyRoom] 🔍 Poll detected room closed!');
          
          const isHostNow = data.host_id === currentUserRef.current?.id;
          
          if (!isHostNow && !showRoomClosedModal) {
            console.log('[PartyRoom] 🎬 Poll: Showing RoomEndedModal to visitor');
            setShowRoomClosedModal(true);
            cleanupWebRTC();
            
            // Auto-redirect after 3 seconds
            setTimeout(() => {
              if (isMountedRef.current) {
                navigate('/');
              }
            }, 3000);
          }
        }
      } catch (err) {
        console.error('[PartyRoom] Poll error:', err);
        recordClientError({ label: "PartyRoom.isHostNow", message: err instanceof Error ? err.message : String(err) });
      }
    };
    
    // PERFORMANCE: Faster fallback poll (3s) while realtime handles primary instant updates
    const pollInterval = setInterval(pollRoomStatus, 3000);
    
    return () => {
      clearInterval(pollInterval);
    };
  }, [roomId, currentUser, showRoomClosedModal, cleanupWebRTC, navigate]);

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
      .order('position', { ascending: true });

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
        user: profileMap.get(participant.user_id) || null,
      }));

      setParticipants(hydratedParticipants as Participant[]);
      
      // Update my position and role from DB
      if (currentUserId) {
        const myParticipant = data.find(p => p.user_id === currentUserId);
        if (myParticipant) {
          setMyPosition(myParticipant.position);
          setMyRole(myParticipant.role);
          
          // If user has a seat position, clear their pending request
          if (myParticipant.position !== null) {
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

  // NATIVE APP FALLBACK: Polling for participants & seat requests every 3 seconds
  // This ensures data stays fresh even when Supabase realtime fails on native platforms
  useEffect(() => {
    if (!roomId || !currentUser) return;
    
    // Polling every 3 seconds as fallback for native apps
    const pollInterval = setInterval(() => {
      console.log('[PartyRoom] 🔄 Native fallback: Polling participants & seat requests');
      fetchParticipants();
      fetchSeatRequests();
    }, 3000);
    
    return () => {
      clearInterval(pollInterval);
    };
  }, [roomId, currentUser, fetchParticipants, fetchSeatRequests]);

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
      
      await supabase
        .from('party_room_participants')
        .upsert({
          room_id: roomId,
          user_id: currentUser.id,
          role: isHostUser ? 'host' : 'viewer',
          position: isHostUser ? 0 : null,
          left_at: null // Reset left_at in case rejoining
        }, { onConflict: 'room_id,user_id' });
      
      // Show self-join flying banner
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
        .from('profiles')
        .select('equipped_entrance_id, equipped_entry_name_bar_id, equipped_vehicle_id')
        .eq('id', currentUser.id)
        .single();
      
      const entranceId = freshProfile?.equipped_entrance_id || currentUser.profile?.equipped_entrance_id;
      const nameBarId = freshProfile?.equipped_entry_name_bar_id || currentUser.profile?.equipped_entry_name_bar_id;
      const vehicleId = freshProfile?.equipped_vehicle_id || currentUser.profile?.equipped_vehicle_id;
      
      console.log('[PartyRoom] 🔍 FRESH Profile equipped IDs:', { entranceId, nameBarId, vehicleId });
      
      // Fetch user's equipped entrance animation - uses centralized function that checks ALL tables
      const { entranceAnimationUrl: selfEntranceUrl, entryNameBarUrl: selfNameBarUrl, vehicleAnimationUrl: selfVehicleUrl } = await fetchUserEntryAnimations(
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
        });
      } else {
        console.log('[PartyRoom] ⚠️ Self has NO equipped entry animation');
      }
      
      // ⚡ INSTANT BROADCAST: Send join event with all profile + animation data to all participants
      const joinBroadcastChannel = supabase.channel(`join_broadcast_party_${roomId}`);
      joinBroadcastChannel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          joinBroadcastChannel.send({
            type: 'broadcast',
            event: 'participant_joined',
            payload: {
              userId: currentUser.id,
              userName,
              userAvatar: avatarUrl,
              userLevel,
              entranceAnimationUrl: selfEntranceUrl || null,
              entryNameBarUrl: selfNameBarUrl || null,
              vehicleAnimationUrl: selfVehicleUrl || null,
              timestamp: Date.now(),
            }
          });
          console.log('[PartyRoom] ⚡ INSTANT join broadcast sent for:', userName);
        }
      });
      
      await fetchParticipants();
    } catch (error) {
      console.error('Error joining room:', error);
      recordClientError({ label: "PartyRoom.joinBroadcastChannel", message: error instanceof Error ? error.message : String(error) });
    }
  };

  useEffect(() => {
    if (room && currentUser) {
      joinRoom();
    }
  }, [room, currentUser]);

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
        
        // CRITICAL: Broadcast room close to ALL participants FIRST (instant notification)
        // This ensures visitors see the modal immediately, before database update
        const closeChannel = supabase.channel(`party-room-close-${roomId}`);
        await closeChannel.subscribe();
        await closeChannel.send({
          type: 'broadcast',
          event: 'room_closed',
          payload: { 
            roomId, 
            hostId: currentUser.id,
            closedAt: new Date().toISOString()
          }
        });
        console.log('[PartyRoom] ✅ Broadcast room_closed sent to all participants');
        
        // Then mark room as inactive in database
        const { error: updateError } = await supabase
          .from('party_rooms')
          .update({ is_active: false, ended_at: new Date().toISOString() })
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
          .update({ left_at: new Date().toISOString(), position: null })
          .eq('room_id', roomId)
          .is('left_at', null);
        
        // Cleanup broadcast channel
        supabase.removeChannel(closeChannel);
      } else {
        // Regular participant leaving
        await supabase
          .from('party_room_participants')
          .update({ left_at: new Date().toISOString(), position: null })
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
          .update({ position: position, role: 'speaker' })
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
      
      // Send INSTANT broadcast to host about new seat request
      const broadcastChannel = supabase.channel(`party-room-all-${roomId}`);
      broadcastChannel.send({
        type: 'broadcast',
        event: 'seat_action',
        payload: {
          action: 'new_request',
          requester_id: currentUser.id,
          seat_position: position,
          requester_name: currentUser.profile?.display_name || 'User'
        }
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
          position: request.seat_position, 
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

      // STEP 3: Send INSTANT broadcast notification to the requester
      // This is faster than postgres_changes (which can have 1-2s delay)
      const broadcastChannel = supabase.channel(`party-room-all-${roomId}`);
      broadcastChannel.send({
        type: 'broadcast',
        event: 'seat_action',
        payload: {
          action: 'approved',
          requester_id: request.requester_id,
          seat_position: request.seat_position,
          request_id: request.id
        }
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
      
      // Send INSTANT broadcast notification to the requester
      const broadcastChannel = supabase.channel(`party-room-all-${roomId}`);
      broadcastChannel.send({
        type: 'broadcast',
        event: 'seat_action',
        payload: {
          action: 'rejected',
          requester_id: request.requester_id,
          request_id: request.id
        }
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
          position: null,
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
          isMuted: !isAudioEnabled,
          isVideoOff: !isVideoEnabled,
          isHost: true,
          stream: isHost ? localStream : null
        } : null}
        hostCountryFlag={room.host?.country_flag || '🌍'}
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
          });
        }}
      />

      {/* Gift Panel */}
      <AnimatePresence>
        {showGiftPanel && (
          <GiftPanel
            isOpen={showGiftPanel}
            onClose={() => setShowGiftPanel(false)}
            onSendGift={async (gift: GiftData, count: number) => {
              if (!currentUser?.id || !room.host?.id || !room.id) return;
              
              // CRITICAL: Prevent self-gifting
              if (currentUser.id === room.host.id) {
                toast.error("You cannot send gifts to yourself!");
                return;
              }
              
              const totalCost = gift.coins * count;
              if (userCoins < totalCost) {
                toast.error("Not enough diamonds!");
                return;
              }
              
              // ========== INSTANT UI UPDATE (< 100ms) ==========
              // Close panel immediately for instant feedback
              setShowGiftPanel(false);
              
              // Optimistic coin deduction (instant visual feedback)
              setUserCoins(prev => prev - totalCost);
              
              // Play gift sound IMMEDIATELY
              playSound('gift');
              
              // Prepare gift animation data
              const optimisticReceiverBeans = Math.floor(totalCost * hostCommissionPercentRef.current / 100);
              const giftKey = getPartyGiftRealtimeKey(currentUser.id, gift.id, totalCost, count);
              const giftAnimationData = {
                senderName: currentUser?.profile?.display_name || 'You',
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
              
              // INSTANT BROADCAST: Send gift to ALL participants immediately
              // No database wait - direct WebSocket broadcast for zero-latency sync
              if (giftBroadcastChannelRef.current) {
                console.log('[PartyRoom] 📡 INSTANT broadcasting gift to all participants...');
                giftBroadcastChannelRef.current.send({
                  type: 'broadcast',
                  event: 'gift_sent',
                  payload: {
                    senderId: currentUser.id,
                    senderName: currentUser?.profile?.display_name || 'Someone',
                    receiverId: room.host?.id,
                    giftName: gift.name,
                    giftIcon: gift.emoji,
                    giftImageUrl: gift.icon_url,
                    animationUrl: gift.animation_url || gift.icon_url,
                    soundUrl: gift.sound_url || undefined,
                    count: count,
                    coins: gift.coins,
                    totalCoins: totalCost,
                    receiverBeans: optimisticReceiverBeans,
                    giftId: gift.id,
                    giftKey,
                  }
                });
                console.log('[PartyRoom] ✅ Gift broadcast sent instantly!');
              }
              markOptimisticPartyGiftCount(giftKey, optimisticReceiverBeans, totalCost);
              setTotalRoomBeans(prev => prev + optimisticReceiverBeans);
              setParticipantBeans(prev => ({
                ...prev,
                [currentUser.id]: (prev[currentUser.id] || 0) + totalCost,
              }));
              
              // Gift animation is already playing - no toast needed
              
              // ========== BACKGROUND PROCESSING (fire-and-forget) ==========
              // Process actual transaction in background - don't block UI
              (async () => {
                try {
                  const result = await sendGift({
                    giftId: gift.id,
                    senderId: currentUser.id,
                    receiverId: room.host!.id,
                    quantity: count,
                    context: 'party',
                    roomId: room.id,
                  });

                  if (!result.success) {
                    setUserCoins(prev => prev + totalCost);
                    toast.error(result.error || "Gift failed - diamonds refunded");
                    return;
                  }
                  
                  // Refresh actual balance from server (in case of discrepancy)
                  const { data: updatedProfile } = await supabase
                    .from("profiles")
                    .select("coins")
                    .eq("id", currentUser.id)
                    .single();
                  
                  if (updatedProfile) {
                    setUserCoins(updatedProfile.coins || 0);
                    // CRITICAL: Update global cached balance so Profile "My Diamonds" reflects instantly
                    const { updateCachedBalance } = await import("@/hooks/useUserBalance");
                    updateCachedBalance(updatedProfile.coins || 0);
                  }
                  
                  // Save gift message to party_room_messages
                  if (result.success) {
                    const finalBeans = result.transaction?.beans_earned ?? optimisticReceiverBeans;
                    const finalCost = result.transaction?.coins_spent ?? totalCost;
                    const giftChatMessage = `[GIFT:${gift.icon_url || ''}] sent ${gift.name} x${count} | -${finalCost} diamonds | +${finalBeans} beans`;
                    await supabase.from("party_room_messages").insert({
                      room_id: room.id,
                      user_id: currentUser.id,
                      content: giftChatMessage,
                      message_type: 'gift'
                    });
                  }
                } catch (err) {
                  console.error('[PartyGift] Background processing error:', err);
                  recordClientError({ label: "PartyRoom.giftChatMessage", message: err instanceof Error ? err.message : String(err) });
                  // Refund coins on complete failure
                  setUserCoins(prev => prev + totalCost);
                  toast.error("Gift failed - diamonds refunded");
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
    </>
  );
};

export default PartyRoom;
