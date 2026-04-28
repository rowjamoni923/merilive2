import { useState, useEffect, useRef, useCallback } from "react";
import { detectAndProcessViolation } from "@/utils/contactDetection";
import { useContentModeration } from "@/hooks/useContentModeration";
import { scanImageForContactInfo } from "@/utils/imageContactDetection";
import { NumberSharingWarningDialog, useNumberSharingWarning } from "@/components/moderation/NumberSharingWarningDialog";
import { motion, AnimatePresence } from "framer-motion";
import { 
  X, 
  Users, 
  Gift, 
  Gamepad2,
  Crown,
  Mic,
  MicOff,
  Eye,
  EyeOff,
  Heart,
  Plus,
  Send,
  Sparkles,
  Smile
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { LiveGameBoard } from "@/components/games/LiveGameBoard";
import { GameSelectionModal } from "./GameSelectionModal";
// REMOVED: ChametStyleBottomBar - Using EXACT SAME inline buttons as Live Stream (ONE LINK)
// REMOVED: ChametStyleChatPanel - Using ONLY unified RoomChatOverlay (ONE LINK)
import { ChametStyleViewerPanel } from "./ChametStyleViewerPanel";
import { ChametStyleCloseModal } from "./ChametStyleCloseModal";
import { ChametStyleSettingsPanel } from "./ChametStyleSettingsPanel";
import { BackgroundPickerPanel } from "./BackgroundPickerPanel";
import { LayoutPickerPanel } from "./LayoutPickerPanel";
import { MusicPlayerPanel } from "./MusicPlayerPanel";
import { SeatSelectorPanel } from "./SeatSelectorPanel";
import BeansIcon from "@/components/common/BeansIcon";
import AvatarWithFrame from "@/components/common/AvatarWithFrame";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
// Import UNIFIED chat overlay - ONE LINK for Live Stream + Party Room
// Change here = Change everywhere (Live, Party Audio, Party Video, Party Game)
import { 
  RoomChatOverlay, 
  type JoinNotification, 
  type RoomChatMessage 
} from "@/features/shared/room";
import { fetchUserEntryAnimations } from "@/utils/fetchEntryAnimation";
import { trackTaskProgress } from "@/hooks/useTaskProgress";
import { RoomWelcomeBanner } from "@/components/room/RoomWelcomeBanner";
import { hardenVideoElementForNative } from "@/utils/videoNativeHardening";

// Real-time viewer type for header display
interface RealtimeViewer {
  id: string;
  displayName: string;
  avatarUrl?: string;
  level: number;
  frameId?: string;
}

// ==================== UNIFIED INTERFACES ====================
interface Participant {
  id: string;
  position: number;
  displayName: string;
  avatarUrl?: string;
  level: number;
  countryFlag?: string;
  beansCount?: number;
  isSpeaking?: boolean;
  isMuted?: boolean;
  isVideoOff?: boolean;
  isHost?: boolean;
  stream?: MediaStream | null;
}

interface SeatApplicant {
  id: string;
  user_id?: string; // CRITICAL: User ID for Accept/Reject callbacks
  displayName: string;
  avatarUrl?: string;
  level: number;
  requestedAt: Date;
}

interface Viewer {
  id: string;
  displayName: string;
  avatarUrl?: string;
  level: number;
  countryFlag?: string;
  frameId?: string;
}

// REMOVED: Old ChatMessage interface - Using ONLY RoomChatMessage from @/features/shared/room (ONE LINK)

interface JoinMessage {
  id: string;
  userId: string;
  userName: string;
  userLevel: number;
  avatarUrl?: string;
  type: 'join' | 'leave';
  timestamp: Date;
}

interface GameInfo {
  id: string;
  name: string;
  isActive: boolean;
}

// ==================== UNIFIED PROPS ====================
interface UnifiedPartyRoomProps {
  // Room Info
  roomType: 'video' | 'audio' | 'game';
  roomName: string;
  roomId: string;
  backgroundUrl?: string;
  backgroundGradient?: string; // ADDED: Tailwind gradient class from party_room_backgrounds
  
  // Host & Participants
  hostInfo: Participant | null;
  hostCountryFlag?: string;
  participants: Participant[];
  maxSeats: number;
  initialActiveSeats?: number; // ADDED: Current active seats from DB
  viewerCount: number;
  totalBeans?: number;
  onOpenGiftContributors?: () => void;
  
  // Current User State
  currentUserId?: string;
  localStream?: MediaStream | null;
  isHost: boolean;
  isMuted: boolean;
  isVideoOff?: boolean;
  
  // Actions
  onMicToggle: () => void;
  onVideoToggle?: () => void;
  onRequestSeat: (position: number) => void;
  onOpenGifts: () => void;
  onClose: () => void;
  onSwitchCamera?: () => void;
  onBeautyClick?: () => void;
  onStickerClick?: () => void;
  
  // Peer Streams
  getPeerStream?: (userId: string) => MediaStream | null;
  
  // Seat Requests
  seatRequests?: SeatApplicant[];
  onAcceptSeatRequest?: (userId: string) => void;
  onRejectSeatRequest?: (userId: string) => void;
  
  // Viewers
  viewers?: Viewer[];
  topViewers?: { id?: string; avatarUrl?: string; level: number; displayName?: string; frameId?: string | null }[];
  onInviteViewer?: (userId: string) => void;
  onKickViewer?: (userId: string) => void;
  
  // Waiting Status
  isWaitingForApproval?: boolean;
  
  // Chat & Join Messages
  joinMessages?: JoinMessage[];
  
  // Game (only for game rooms)
  activeGame?: GameInfo;
  onOpenGame?: () => void;
  
  // CRITICAL: Entry Animation callback - triggers SVGA animations visible to ALL participants
  onTriggerEntryEffect?: (params: {
    userId: string;
    displayName: string;
    avatarUrl?: string;
    level: number;
    entranceUrl?: string;
    entryNameBarUrl?: string;
  }) => void;
}

// ==================== HELPER COMPONENTS ====================

// Shooting Star decoration
const ShootingStar = ({ delay }: { delay: number }) => (
  <motion.div
    initial={{ x: "100%", y: "-10%", opacity: 0 }}
    animate={{ x: "-20%", y: "120%", opacity: [0, 1, 1, 0] }}
    transition={{ duration: 2.5, delay, repeat: Infinity, repeatDelay: 8 + Math.random() * 5 }}
    className="absolute w-[2px] h-16 bg-gradient-to-b from-white via-white/80 to-transparent rotate-[45deg] pointer-events-none"
    style={{
      left: `${Math.random() * 80 + 10}%`,
      top: `${Math.random() * 30}%`,
      boxShadow: '0 0 6px 2px rgba(255,255,255,0.3)'
    }}
  />
);

// Empty Seat Component
const EmptySeat = ({ position, onTap, size = 'md' }: { position: number; onTap: () => void; size?: 'sm' | 'md' | 'lg' }) => {
  const sizeClasses = {
    sm: 'w-12 h-12',
    md: 'w-14 h-14',
    lg: 'w-16 h-16'
  };
  
  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={onTap}
      className="flex flex-col items-center gap-1"
    >
      <div className={cn(
        "rounded-full flex items-center justify-center",
        "bg-white/10 border-2 border-dashed border-white/30",
        "hover:bg-white/20 hover:border-white/50 transition-all",
        sizeClasses[size]
      )}>
        <Plus className="w-5 h-5 text-white/50" />
      </div>
      <span className="text-white/50 text-[9px]">{position}</span>
    </motion.button>
  );
};

// Occupied Seat Component
const OccupiedSeat = ({ 
  participant, 
  position,
  onTap, 
  isCurrentUser,
  showVideo = false,
  stream,
  size = 'md'
}: { 
  participant: Participant;
  position: number;
  onTap: () => void;
  isCurrentUser: boolean;
  showVideo?: boolean;
  stream?: MediaStream | null;
  size?: 'sm' | 'md' | 'lg';
}) => {
  const [waveHeights, setWaveHeights] = useState<number[]>([3, 3, 3, 3, 3]);
  
  useEffect(() => {
    if (participant.isSpeaking && !participant.isMuted) {
      const interval = setInterval(() => {
        setWaveHeights(Array.from({ length: 5 }, () => Math.random() * 12 + 3));
      }, 80);
      return () => clearInterval(interval);
    } else {
      setWaveHeights([3, 3, 3, 3, 3]);
    }
  }, [participant.isSpeaking, participant.isMuted]);

  const sizeMap = {
    sm: 'sm' as const,
    md: 'md' as const,
    lg: 'lg' as const
  };

  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center relative"
      onClick={onTap}
    >
      {/* Speaking glow */}
      <AnimatePresence>
        {participant.isSpeaking && !participant.isMuted && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.3, 0.7, 0.3], scale: [1, 1.2, 1] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2, repeat: Infinity }}
            className="absolute -inset-2 -z-10 rounded-full"
            style={{ background: 'radial-gradient(circle, #8b5cf6 0%, transparent 70%)' }}
          />
        )}
      </AnimatePresence>

      {/* Host Crown */}
      {participant.isHost && (
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-30">
          <Crown className="w-4 h-4 text-yellow-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.8)]" fill="#fbbf24" />
        </div>
      )}

      {/* Avatar with Frame */}
      <AvatarWithFrame
        userId={participant.id}
        src={participant.avatarUrl}
        name={participant.displayName}
        level={participant.level || 1}
        isHost={participant.isHost}
        size={sizeMap[size]}
        showFrame={true}
        showAnimation={true}
        showGlow={participant.level >= 10}
      />

      {/* Voice Wave (for audio rooms) */}
      {!showVideo && (
        <div className="flex items-end gap-[2px] h-4 mt-1">
          {waveHeights.map((h, i) => (
            <motion.div
              key={i}
              className={cn(
                "w-[3px] rounded-full",
                participant.isMuted ? "bg-gray-500" : "bg-gradient-to-t from-purple-500 to-pink-400"
              )}
              animate={{ height: h }}
              transition={{ duration: 0.08 }}
            />
          ))}
        </div>
      )}

      {/* Name & Level */}
      <span className="text-white text-[10px] font-medium mt-0.5 max-w-[60px] truncate">
        {participant.displayName}
      </span>
      <div 
        className="px-1.5 py-0.5 rounded text-[8px] font-bold text-white"
        style={{
          background: participant.level >= 50 
            ? 'linear-gradient(135deg, #f59e0b, #ef4444)' 
            : participant.level >= 30 
              ? 'linear-gradient(135deg, #fbbf24, #f97316)' 
              : participant.level >= 20 
                ? 'linear-gradient(135deg, #ec4899, #a855f7)'
                : participant.level >= 10
                  ? 'linear-gradient(135deg, #06b6d4, #3b82f6)'
                  : 'linear-gradient(135deg, #8b5cf6, #6366f1)'
        }}
      >
        Lv{participant.level}
      </div>
    </motion.button>
  );
};

// Video Grid Seat (for Video & Game rooms)
const VideoGridSeat = ({
  participant,
  position,
  onTap,
  onRequestSeat,
  isMyself,
  localStream,
  peerStream,
  hostCountryFlag,
  totalRoomBeans,
  onBeansClick
}: {
  participant: Participant | null;
  position: number;
  onTap: () => void;
  onRequestSeat: () => void;
  isMyself: boolean;
  localStream?: MediaStream | null;
  peerStream?: MediaStream | null;
  hostCountryFlag?: string;
  totalRoomBeans?: number;
  onBeansClick?: () => void;
}) => {
  const streamToUse = isMyself ? localStream : peerStream;
  const hasRenderableVideoTrack = Boolean(
    streamToUse?.getVideoTracks().some((track) => track.readyState === 'live' && track.enabled !== false)
  );
  
  // Format number with shortcut (20M, 1.5K, etc.)
  const formatBeans = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1).replace(/\.0$/, '')}K`;
    return num.toString();
  };
  
  const getLevelFrame = (level: number) => {
    if (level >= 50) return { gradient: 'from-purple-600 via-pink-500 to-orange-400', glow: 'purple-500' };
    if (level >= 30) return { gradient: 'from-yellow-500 via-orange-500 to-red-500', glow: 'orange-500' };
    if (level >= 20) return { gradient: 'from-cyan-400 via-blue-500 to-purple-500', glow: 'blue-500' };
    if (level >= 10) return { gradient: 'from-green-400 via-teal-500 to-cyan-500', glow: 'teal-500' };
    return { gradient: 'from-indigo-400 via-purple-500 to-pink-500', glow: 'purple-400' };
  };

  if (!participant) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative overflow-hidden rounded-2xl bg-purple-800/40 border border-purple-500/20 cursor-pointer h-full"
        onClick={onRequestSeat}
      >
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-white/10 border-2 border-dashed border-white/30 flex items-center justify-center mb-2">
            <Plus className="w-6 h-6 text-white/50" />
          </div>
          <span className="text-white/50 text-xs">Seat {position + 1}</span>
        </div>
      </motion.div>
    );
  }

  const frameStyle = getLevelFrame(participant.level);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="relative overflow-hidden rounded-2xl h-full"
      onClick={onTap}
    >
      {/* Video or Avatar */}
      {hasRenderableVideoTrack && !participant.isVideoOff ? (
        <video
          ref={(el) => {
            if (el && streamToUse && hasRenderableVideoTrack && el.srcObject !== streamToUse) {
              hardenVideoElementForNative(el, { muted: true });
              el.srcObject = streamToUse;
              el.muted = true;
              el.playsInline = true;
              const tryPlay = () => {
                el.play().catch(() => {
                  setTimeout(tryPlay, 300);
                });
              };
              tryPlay();
            }
          }}
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
          x5-playsinline="true"
          webkit-playsinline="true"
          className={cn(
            "absolute inset-0 w-full h-full object-cover pointer-events-none",
            isMyself && "transform scale-x-[-1]"
          )}
          style={{ touchAction: 'none', WebkitAppearance: 'none' } as React.CSSProperties}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-purple-700/80 to-indigo-800/80">
          <AvatarWithFrame
            userId={participant.id}
            src={participant.avatarUrl}
            name={participant.displayName}
            level={participant.level}
            isHost={participant.isHost}
            size="lg"
            showAnimation={true}
            showGlow={true}
            showFrame={true}
          />
        </div>
      )}

      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent pointer-events-none" />

      {/* Host Crown */}
      {participant.isHost && (
        <div className="absolute top-2 left-2">
          <div className="w-6 h-6 rounded-full bg-yellow-500 flex items-center justify-center shadow-lg">
            <Crown className="w-3.5 h-3.5 text-yellow-900" />
          </div>
        </div>
      )}

      {/* Bean Count - Clickable for host to show contributors */}
      <button 
        className="absolute top-2 right-2"
        onClick={(e) => {
          e.stopPropagation();
          if (participant.isHost && onBeansClick) {
            onBeansClick();
          }
        }}
      >
        <Badge className={cn(
          "bg-yellow-500/90 text-black text-[10px] px-2 h-5 border-0 font-bold flex items-center gap-1",
          participant.isHost && onBeansClick && "cursor-pointer hover:bg-yellow-400"
        )}>
          <BeansIcon size={10} /> {formatBeans(participant.beansCount || 0)}
        </Badge>
      </button>

      {/* Bottom Info */}
      <div className="absolute bottom-0 left-0 right-0 p-2">
        <div className="flex items-center gap-1.5">
          <span className="text-base">
            {participant.isHost && hostCountryFlag ? hostCountryFlag : (participant.countryFlag || '🌍')}
          </span>
          <span className="text-yellow-300 text-[10px]">
            {'⭐'.repeat(Math.min(Math.floor(participant.level / 10) + 1, 7))}
          </span>
        </div>
        <p className="text-white text-xs font-semibold truncate">{participant.displayName}</p>
      </div>
    </motion.div>
  );
};

// ==================== MAIN COMPONENT ====================
export function UnifiedPartyRoom({
  roomType,
  roomName,
  roomId,
  backgroundUrl,
  backgroundGradient, // ADDED
  hostInfo,
  hostCountryFlag,
  participants,
  maxSeats,
  initialActiveSeats, // ADDED
  viewerCount,
  totalBeans = 0,
  currentUserId,
  localStream,
  isHost,
  isMuted,
  isVideoOff = false,
  onMicToggle,
  onVideoToggle,
  onRequestSeat,
  onOpenGifts,
  onClose,
  onSwitchCamera,
  onBeautyClick,
  onStickerClick,
  getPeerStream,
  seatRequests = [],
  onAcceptSeatRequest,
  onRejectSeatRequest,
  viewers = [],
  topViewers = [],
  onInviteViewer,
  onKickViewer,
  isWaitingForApproval = false,
  joinMessages = [],
  activeGame,
  onOpenGame,
  onOpenGiftContributors,
  onTriggerEntryEffect
}: UnifiedPartyRoomProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const numberWarning = useNumberSharingWarning();
  
  // UI State
  const [showChatPanel, setShowChatPanel] = useState(false);
  const [showViewerPanel, setShowViewerPanel] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [showBackgroundPanel, setShowBackgroundPanel] = useState(false);
  const [showLayoutPanel, setShowLayoutPanel] = useState(false);
  const [showMusicPanel, setShowMusicPanel] = useState(false);
  const [showSeatSelectorPanel, setShowSeatSelectorPanel] = useState(false);
  const [activeSeats, setActiveSeats] = useState(initialActiveSeats || maxSeats);
  const [isMirrorMode, setIsMirrorMode] = useState(false);
  const [isFrontCamera, setIsFrontCamera] = useState(true);
  // Background can be set locally (optimistic) OR come from parent via real-time
  const [selectedBackground, setSelectedBackground] = useState<string | null>(null);
  // REMOVED: chatMessages - use ONLY unified premiumMessages (ONE LINK)
  const [chatInput, setChatInput] = useState("");
  
  // 🔥 AWS Comprehend content moderation
  const { checkToxicContent: checkToxic } = useContentModeration(currentUserId);
  const [roomClosed, setRoomClosed] = useState(false);
  const processedJoinsRef = useRef<Set<string>>(new Set());
  const processedMsgIdsRef = useRef<Set<string>>(new Set());
  
  // GAME STATE - Allow games in ALL room types (video, audio, game)
  const [showGameSelection, setShowGameSelection] = useState(false);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [showGameBoard, setShowGameBoard] = useState(false);
  const [isGameBoardMinimized, setIsGameBoardMinimized] = useState(false); // For closing game board in game rooms
  
  // Unified chat format state - SAME as Live Stream (ONE LINK)
  // Only premiumMessages used - no separate joinNotifications (prevents duplicates)
  const [premiumMessages, setPremiumMessages] = useState<RoomChatMessage[]>([]);
  
  // Join notifications for stacking display
  const [joinNotifications, setJoinNotifications] = useState<JoinNotification[]>([]);
  
  // CRITICAL: Real-time viewers state for header display (NOT relying on props)
  const [realtimeViewers, setRealtimeViewers] = useState<RealtimeViewer[]>([]);
  const [realtimeViewerCount, setRealtimeViewerCount] = useState(0);
  const roomIdRef = useRef(roomId);
  
  // Update roomId ref when it changes
  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);
  
  // CRITICAL: Sync activeSeats when parent updates (real-time sync from DB)
  useEffect(() => {
    if (initialActiveSeats !== undefined && initialActiveSeats > 0) {
      setActiveSeats(initialActiveSeats);
    }
  }, [initialActiveSeats]);
  
  // CRITICAL: Sync background when parent updates (real-time sync from DB)
  // This clears local selection when DB syncs, ensuring all participants see same background
  useEffect(() => {
    // Only clear local selection if parent provides a new background
    // This allows DB sync to override local optimistic updates
    if (backgroundGradient || backgroundUrl) {
      console.log('[UnifiedPartyRoom] 🎨 Background synced from DB:', { backgroundGradient, backgroundUrl });
      setSelectedBackground(null);
    }
  }, [backgroundGradient, backgroundUrl]);
  
  // Flying Join Banner REMOVED - EntryNameBarAnimation handles join notifications now
  
  // Track processed participant joins to prevent duplicates
  const processedParticipantJoinsRef = useRef<Set<string>>(new Set());
  
  // Track triggered entry animations to prevent duplicate SVGA playback
  // Key: `userId_roomId` - ensures each user's animation only plays ONCE per room session
  const triggeredEntryAnimationsRef = useRef<Set<string>>(new Set());
  
  // Store hostId in ref to avoid stale closures
  const hostIdRef = useRef(hostInfo?.id);
  useEffect(() => {
    hostIdRef.current = hostInfo?.id;
  }, [hostInfo?.id]);
  
  // Store onTriggerEntryEffect in ref to avoid stale closures
  const onTriggerEntryEffectRef = useRef(onTriggerEntryEffect);
  useEffect(() => {
    onTriggerEntryEffectRef.current = onTriggerEntryEffect;
  }, [onTriggerEntryEffect]);
  
  // CRITICAL: Fetch real-time viewers for header display
  const fetchRealtimeViewers = useCallback(async () => {
    const currentRoomId = roomIdRef.current;
    if (!currentRoomId) return;
    
    try {
      const { data, error } = await supabase
        .from("party_room_participants")
        .select(`
          user_id,
          profiles!party_room_participants_user_id_fkey (
            id,
            display_name,
            avatar_url,
            user_level,
            frame_id
          )
        `)
        .eq("room_id", currentRoomId)
        .is("left_at", null)
        .order("joined_at", { ascending: false });

      if (error) {
        console.error('[UnifiedPartyRoom] Error fetching viewers:', error);
        return;
      }

      if (data) {
        // Filter out host from viewer list - use ref to avoid stale closure
        const currentHostId = hostIdRef.current;
        const viewerList: RealtimeViewer[] = data
          .filter((p: any) => p.user_id !== currentHostId)
          .map((pv: any) => ({
            id: pv.profiles?.id || pv.user_id,
            displayName: pv.profiles?.display_name || "Anonymous",
            avatarUrl: pv.profiles?.avatar_url,
            level: pv.profiles?.user_level || 1,
            frameId: pv.profiles?.frame_id || undefined,
          }))
          .sort((a: RealtimeViewer, b: RealtimeViewer) => b.level - a.level); // Sort by level descending
        
        setRealtimeViewers(viewerList);
        setRealtimeViewerCount(data.length); // Total including host
        console.log('[UnifiedPartyRoom] ✅ Real-time viewers updated:', viewerList.length, 'host excluded:', currentHostId);
      }
    } catch (err) {
      console.error('[UnifiedPartyRoom] Exception fetching viewers:', err);
    }
  }, []); // No dependencies - uses refs
  
  // Real-time subscription for viewer updates in header
  useEffect(() => {
    if (!roomId) return;
    
    console.log('[UnifiedPartyRoom] 🚀 Setting up viewer subscription for room:', roomId);
    
    // Initial fetch
    fetchRealtimeViewers();
    
    // Real-time subscription for ALL participant events
    const viewerChannel = supabase
      .channel(`unified-room-viewers-${roomId}-${Date.now()}`) // Unique channel name
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "party_room_participants",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          console.log('[UnifiedPartyRoom] 📡 Viewer update event:', payload.eventType);
          // Refetch all viewers to ensure accurate list
          fetchRealtimeViewers();
        }
      )
      .subscribe((status) => {
        console.log('[UnifiedPartyRoom] Viewer subscription status:', status);
        if (status === 'CHANNEL_ERROR') {
          console.log('[UnifiedPartyRoom] ⚠️ Channel error - will rely on polling');
        }
      });
    
    // POLLING FALLBACK for native apps (in case realtime fails)
    // Ensures viewers see participant list without manual refresh
    const pollInterval = setInterval(() => {
      console.log('[UnifiedPartyRoom] 🔄 Polling viewer refresh');
      fetchRealtimeViewers();
    }, 5000); // Poll every 5 seconds

    return () => {
      console.log('[UnifiedPartyRoom] Cleaning up viewer subscription and polling');
      clearInterval(pollInterval);
      supabase.removeChannel(viewerChannel);
    };
  }, [roomId, fetchRealtimeViewers]);
  
  // Re-fetch viewers when hostInfo changes (to properly filter)
  useEffect(() => {
    if (hostInfo?.id && roomId) {
      console.log('[UnifiedPartyRoom] Host ID updated, refetching viewers');
      fetchRealtimeViewers();
    }
  }, [hostInfo?.id, roomId, fetchRealtimeViewers]);
  
  // ==================== REAL-TIME PARTICIPANT JOIN SUBSCRIPTION ====================
  // CRITICAL: Subscribe DIRECTLY to party_room_participants for instant join banners
  // This ensures ALL users (host & visitors) see join animations in real-time
  useEffect(() => {
    if (!roomId) return;
    
    console.log('[UnifiedPartyRoom] 🚀 Setting up DIRECT participant join subscription for room:', roomId);
    
    const participantChannel = supabase
      .channel(`unified-party-joins-${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'party_room_participants',
          filter: `room_id=eq.${roomId}`
        },
        async (payload) => {
          const newParticipant = payload.new as any;
          const joinKey = `${newParticipant.user_id}_${newParticipant.joined_at}`;
          
          // Prevent duplicate processing
          if (processedParticipantJoinsRef.current.has(joinKey)) {
            console.log('[UnifiedPartyRoom] Skipping duplicate join:', joinKey);
            return;
          }
          processedParticipantJoinsRef.current.add(joinKey);
          
          console.log('[UnifiedPartyRoom] ⚡ NEW participant detected via direct subscription:', newParticipant.user_id);
          
          // Fetch user profile with entry effect info for display
          const { data: profile } = await supabase
            .from('profiles')
            .select('display_name, user_level, avatar_url, equipped_entrance_id, equipped_entry_name_bar_id')
            .eq('id', newParticipant.user_id)
            .single();
          
          if (profile) {
            const userName = profile.display_name || 'User';
            const userLevel = profile.user_level || 1;
            const avatarUrl = profile.avatar_url || undefined;
            
            console.log('[UnifiedPartyRoom] 🎉 User joined:', userName, 'Level:', userLevel);
            
            // Also add to join notifications for stacking display
            setJoinNotifications(prev => [...prev.slice(-5), {
              id: `direct_join_${joinKey}`,
              userId: newParticipant.user_id,
              userName,
              userLevel,
              userAvatar: avatarUrl,
              timestamp: Date.now()
            }]);
            
            // CRITICAL FIX: ONLY trigger entry animation for users who have ACTUAL animation URLs
            // NOT just users with equipped IDs - the ID must resolve to a valid URL
            console.log('[UnifiedPartyRoom] 🔍 Checking entry animations for:', userName,
              'entranceId:', profile.equipped_entrance_id,
              'nameBarId:', profile.equipped_entry_name_bar_id);
            
            // Get the callback reference BEFORE any async operations to avoid stale closure
            const triggerCallback = onTriggerEntryEffectRef.current;
            
            // CRITICAL: Check if we've already triggered animation for this user in this room session
            const animationKey = `${newParticipant.user_id}_${roomId}`;
            if (triggeredEntryAnimationsRef.current.has(animationKey)) {
              console.log('[UnifiedPartyRoom] ⏭️ Animation already triggered for user, skipping:', userName);
              return;
            }
            
            // Check if user has equipped IDs OR qualifies for level-based entry name bar
            const hasEquippedItems = profile.equipped_entrance_id || profile.equipped_entry_name_bar_id;
            if (!hasEquippedItems && userLevel < 20) {
              console.log('[UnifiedPartyRoom] ℹ️ User has NO equipped entry items and level < 20 - skipping animation lookup');
              return;
            }
            
            try {
              // Fetch actual animation URLs from database (includes level-based auto-assign)
              const { entranceAnimationUrl, entryNameBarUrl } = await fetchUserEntryAnimations(
                profile.equipped_entrance_id,
                profile.equipped_entry_name_bar_id,
                undefined,
                userLevel,
                newParticipant.user_id
              );
              
              console.log('[UnifiedPartyRoom] 📍 Animation lookup result:', {
                equippedEntranceId: profile.equipped_entrance_id,
                equippedNameBarId: profile.equipped_entry_name_bar_id,
                resolvedEntranceUrl: entranceAnimationUrl || 'NOT FOUND - NO ANIMATION',
                resolvedEntryNameBarUrl: entryNameBarUrl || 'NOT FOUND - NO ANIMATION'
              });
              
              // CRITICAL SAFETY: Only trigger if we have ACTUAL animation URLs
              // Having an equipped ID is NOT enough - we need the actual URL to display
              const hasValidEntranceUrl = entranceAnimationUrl && entranceAnimationUrl.length > 0;
              const hasValidNameBarUrl = entryNameBarUrl && entryNameBarUrl.length > 0;
              
              if (!hasValidEntranceUrl && !hasValidNameBarUrl) {
                console.log('[UnifiedPartyRoom] ⛔ NO valid animation URLs found - NOT triggering animation for:', userName);
                return;
              }
              
              if (triggerCallback) {
                // Mark as triggered BEFORE calling callback to prevent race conditions
                triggeredEntryAnimationsRef.current.add(animationKey);
                
                console.log('[UnifiedPartyRoom] 🎬 TRIGGERING entry effect for:', userName, 
                  '| Entrance:', hasValidEntranceUrl ? '✅' : '❌',
                  '| NameBar:', hasValidNameBarUrl ? '✅' : '❌');
                
                // Use setTimeout to ensure state updates are not batched
                triggerCallback({
                  userId: newParticipant.user_id,
                  displayName: userName,
                  avatarUrl,
                  level: userLevel,
                  entranceUrl: hasValidEntranceUrl ? entranceAnimationUrl : undefined,
                  entryNameBarUrl: hasValidNameBarUrl ? entryNameBarUrl : undefined
                });
              } else {
                console.log('[UnifiedPartyRoom] ⚠️ No callback available for triggering animation');
              }
            } catch (err) {
              console.error('[UnifiedPartyRoom] Error fetching entry animations:', err);
            }
          }
        }
      )
      .subscribe((status) => {
        console.log('[UnifiedPartyRoom] Participant join subscription status:', status);
      });
    
    return () => {
      console.log('[UnifiedPartyRoom] Cleaning up participant join subscription');
      supabase.removeChannel(participantChannel);
    };
  }, [roomId]);
  
  // ==================== REAL-TIME CHAT SUBSCRIPTION ====================
  // Subscribe to party_room_messages for real-time messages (Party Room specific table)
  useEffect(() => {
    if (!roomId) return;
    
    console.log('[UnifiedPartyRoom] Setting up real-time chat subscription for room:', roomId);
    
    // Load existing chat messages - UNIFIED format only (ONE LINK)
    const loadMessages = async () => {
      const { data } = await supabase
        .from('party_room_messages')
        .select('id, sender_id, content, message_type, created_at, profiles:sender_id(display_name, user_level, avatar_url, is_host)')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true })
        .limit(100);
      
      if (data) {
        // Load directly to unified premiumMessages - NO duplicate chatMessages
        const unifiedMsgs: RoomChatMessage[] = data.map((m: any) => ({
          id: m.id,
          userId: m.sender_id,
          user: m.profiles?.display_name || 'User',
          initial: (m.profiles?.display_name || 'U').charAt(0).toUpperCase(),
          message: m.content,
          color: m.message_type === 'gift' ? 'pink' : m.message_type === 'join' ? 'emerald' : 'white',
          userLevel: m.profiles?.user_level || 1,
          userAvatar: m.profiles?.avatar_url,
          isHost: m.profiles?.is_host || (m.sender_id === hostInfo?.id),
          isNewUser: false,
          type: m.message_type || 'text'
        }));
        setPremiumMessages(unifiedMsgs);
        unifiedMsgs.forEach(m => processedMsgIdsRef.current.add(m.id));
      }
    };
    
    loadMessages();
    
    // Real-time subscription - NOW using party_room_messages table
    const channel = supabase
      .channel(`party-chat-${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'party_room_messages',
          filter: `room_id=eq.${roomId}`
        },
        async (payload) => {
          const newMsg = payload.new as any;
          
          // CRITICAL: Skip if already processed by ID
          if (processedMsgIdsRef.current.has(newMsg.id)) {
            console.log('[UnifiedPartyRoom] Skipping duplicate by ID:', newMsg.id);
            return;
          }
          
          // CRITICAL: Skip if this is our own pending message (optimistic update already showing)
          // Check using sender + content combination
          const msgKey = `${newMsg.sender_id}-${newMsg.content}`;
          if (pendingMessagesRef.current.has(msgKey)) {
            console.log('[UnifiedPartyRoom] Skipping own pending message:', msgKey);
            // Mark the real ID as processed but don't add duplicate
            processedMsgIdsRef.current.add(newMsg.id);
            return;
          }
          
          processedMsgIdsRef.current.add(newMsg.id);
          
          // Fetch sender info with avatar
          const { data: senderData } = await supabase
            .from('profiles')
            .select('display_name, user_level, avatar_url, is_host')
            .eq('id', newMsg.sender_id)
            .single();
          
          const msgType = newMsg.message_type || 'text';
          
          // Add ONLY to unified messages (SAME format as Live Stream - ONE LINK)
          const unifiedMsg: RoomChatMessage = {
            id: newMsg.id,
            userId: newMsg.sender_id,
            user: senderData?.display_name || 'User',
            initial: (senderData?.display_name || 'U').charAt(0).toUpperCase(),
            message: newMsg.content,
            color: msgType === 'gift' ? 'pink' : msgType === 'join' ? 'emerald' : 'white',
            userLevel: senderData?.user_level || 1,
            userAvatar: senderData?.avatar_url,
            isHost: senderData?.is_host || (newMsg.sender_id === hostInfo?.id),
            isNewUser: false,
            type: msgType
          };
          setPremiumMessages(prev => [...prev.slice(-100), unifiedMsg]);
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, hostInfo?.id]);
  
  // ==================== LEGACY: JOIN MESSAGES FROM PROPS (for chat only) ====================
  // joinMessages prop comes from PartyRoom.tsx realtime subscription
  // NOTE: Flying banner is NOW triggered by direct participant subscription above
  // This handler ONLY adds join messages to chat - NO flying banner trigger (prevents duplicates)
  useEffect(() => {
    if (!joinMessages || joinMessages.length === 0) return;
    
    joinMessages.forEach(jm => {
      // Skip if already processed
      if (processedJoinsRef.current.has(jm.id)) return;
      processedJoinsRef.current.add(jm.id);
      
      // NOTE: Flying banner is handled by direct participant subscription
      // This only adds chat message to prevent duplicate banners
      
      // Add to chat as a join message (SINGLE ADD - no duplicates)
      const joinChatMsg: RoomChatMessage = {
        id: `join-${jm.id}`,
        userId: jm.userId,
        user: jm.userName,
        initial: jm.userName.charAt(0).toUpperCase(),
        message: jm.type === 'join' ? 'joined the room ✨' : 'left the room',
        color: 'emerald',
        userLevel: jm.userLevel,
        userAvatar: jm.avatarUrl,
        isHost: false,
        isNewUser: false,
        type: 'join'
      };
      
      setPremiumMessages(prev => {
        // Don't add duplicate join messages
        if (prev.some(m => m.id === joinChatMsg.id)) return prev;
        return [...prev.slice(-100), joinChatMsg];
      });
    });
  }, [joinMessages]);
  
  // ==================== ROOM CLOSED DETECTION ====================

  // ==================== SEND MESSAGE TO DATABASE (OPTIMISTIC UPDATE) ====================
  // Track pending messages to prevent duplicate when real-time confirms
  const pendingMessagesRef = useRef<Set<string>>(new Set());
  
  const handleSendMessage = async (message: string) => {
    if (!roomId || !currentUserId || !message.trim()) return;
    
    const trimmedMessage = message.trim();
    const tempId = `temp-${Date.now()}-${Math.random()}`;
    
    // Mark this message content as pending (to skip when real-time confirms)
    const msgKey = `${currentUserId}-${trimmedMessage}`;
    pendingMessagesRef.current.add(msgKey);
    
    // OPTIMISTIC UPDATE: Instantly show message in UI before DB save
    const senderName = hostInfo?.displayName || 'You';
    const optimisticMessage: RoomChatMessage = {
      id: tempId,
      userId: currentUserId,
      user: senderName,
      initial: senderName.charAt(0).toUpperCase(),
      message: trimmedMessage,
      userLevel: hostInfo?.level || 1,
      userAvatar: hostInfo?.avatarUrl,
      isHost: isHost,
      type: 'text',
      timestamp: new Date()
    };
    
    // Add to local state immediately (instant feedback)
    setPremiumMessages(prev => [...prev, optimisticMessage]);
    
    // Run contact detection for hosts - non-blocking with error handling
    detectAndProcessViolation(currentUserId, trimmedMessage, 'chat', roomId)
      .then(res => {
        console.log('[ContactDetection] PartyRoom result:', res);
        if (res.detected && res.violationNumber) {
          numberWarning.showWarning(res.violationNumber, res.beansDeducted || 0, res.isBanned || false);
        } else if (res.detected) {
          numberWarning.showGenericWarning();
        }
      })
       .catch(err => console.error('[ContactDetection] PartyRoom error:', err));

    // 🔥 AWS Comprehend toxic content moderation (background)
    checkToxic(trimmedMessage, { contextType: 'party_room', roomId }).catch(() => {});
    
    // Save to party_room_messages table - background operation
    const { data, error } = await supabase.from('party_room_messages').insert({
      room_id: roomId,
      sender_id: currentUserId,
      content: trimmedMessage,
      message_type: 'chat'
    }).select('id').single();
    
    if (error) {
      console.error('[UnifiedPartyRoom] Failed to send message:', error);
      // Remove optimistic message on failure
      setPremiumMessages(prev => prev.filter(m => m.id !== tempId));
      pendingMessagesRef.current.delete(msgKey);
      toast({ title: "Failed to send message", variant: "destructive" });
    } else if (data) {
      // SUCCESS: Replace temp ID with real DB ID to prevent real-time duplicate
      processedMsgIdsRef.current.add(data.id);
      setPremiumMessages(prev => prev.map(m => 
        m.id === tempId ? { ...m, id: data.id } : m
      ));
      pendingMessagesRef.current.delete(msgKey);
      
      // Track message sent for task progress
      trackTaskProgress('messages_sent', { increment: 1 });
    }
  };

  const handleCloseConfirm = () => {
    setShowCloseModal(false);
    onClose();
  };

  // Build seat grid based on room type - USE activeSeats from host selection!
  const getSeatGrid = () => {
    // Use activeSeats (host's current selection) for dynamic rendering
    const currentSeats = activeSeats;
    
    if (roomType === 'audio') {
      // Audio rooms: use 2 rows with dynamic columns based on activeSeats
      const cols = Math.ceil(currentSeats / 2);
      return {
        rows: currentSeats <= cols ? 1 : 2,
        cols: cols,
        totalSeats: currentSeats
      };
    } else {
      // Video/Game rooms: dynamic grid based on activeSeats
      // 2 seats = 1 row x 2 cols
      // 4 seats = 2 rows x 2 cols
      // 6 seats = 2 rows x 3 cols (smaller seats)
      if (currentSeats <= 2) {
        return { rows: 1, cols: 2, totalSeats: currentSeats };
      } else if (currentSeats <= 4) {
        return { rows: 2, cols: 2, totalSeats: currentSeats };
      } else {
        return { rows: 2, cols: 3, totalSeats: currentSeats };
      }
    }
  };

  const seatConfig = getSeatGrid();
  
  // Create seat positions - Host can move between seats
  // Find host's actual position from participants
  const hostActualPosition = participants.find(p => p.isHost)?.position ?? 
                             (hostInfo ? 0 : null);
  
  const allSeats = Array.from({ length: seatConfig.totalSeats }, (_, i) => {
    // If this is the host's actual current position, show them here
    if (hostInfo && hostActualPosition === i) {
      return { ...hostInfo, position: i };
    }
    // For other positions, find participant (excluding host since we handled them above)
    const participant = participants.find(p => p.position === i && !p.isHost);
    return participant || null;
  });

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toLocaleString();
  };

  return (
    <div className="room-viewport flex flex-col overflow-hidden"
      style={{ 
        paddingTop: 'max(env(safe-area-inset-top, 0px), var(--min-top-inset, 20px))',
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), var(--min-bottom-inset, 0px))'
      }}
    >
      {/* ROOM CLOSED OVERLAY (when host leaves) */}
      <AnimatePresence>
        {roomClosed && !isHost && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-black/90"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-center space-y-4"
            >
              <div className="w-20 h-20 mx-auto rounded-full bg-red-500/20 flex items-center justify-center">
                <X className="w-10 h-10 text-red-400" />
              </div>
              <h2 className="text-white text-2xl font-bold">Room Closed</h2>
              <p className="text-white/60">The host has ended this party</p>
              <p className="text-white/40 text-sm">Redirecting to home...</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Background - Priority: selectedBackground > backgroundGradient > backgroundUrl > default */}
      {/* Handle both gradient CSS classes and image URLs properly */}
      {(() => {
        // Determine the effective background source
        const effectiveBg = selectedBackground || backgroundGradient || backgroundUrl;
        const isGradientClass = effectiveBg && effectiveBg.startsWith('bg-gradient');
        const isImageUrl = effectiveBg && (effectiveBg.startsWith('http') || effectiveBg.startsWith('/'));
        
        return (
          <div 
            className={cn(
              "absolute inset-0",
              // Apply Tailwind gradient class directly if it's a gradient class
              isGradientClass && effectiveBg
            )}
            style={
              isImageUrl 
                ? { 
                    backgroundImage: `url(${effectiveBg})`, 
                    backgroundSize: 'cover', 
                    backgroundPosition: 'center' 
                  }
                : isGradientClass
                  ? {} // Tailwind class handles it via className
                  : effectiveBg
                    ? { background: effectiveBg } // Inline gradient style
                    : { background: 'linear-gradient(to bottom right, rgb(88, 28, 135), rgb(49, 46, 129), rgb(30, 58, 138))' }
            }
          />
        );
      })()}
      
      {/* Shooting Stars */}
      {[0, 3, 7].map((delay) => (
        <ShootingStar key={delay} delay={delay} />
      ))}
      
      {/* FLYING JOIN BANNER REMOVED - EntryNameBarAnimation handles join notifications */}

      {/* ==================== UNIFIED HEADER ==================== */}
      <header className="relative z-20 flex items-center justify-between px-3 py-2 safe-area-top">
        {/* Left: Room Info */}
        <div className="flex items-center gap-2">
          {/* Host Avatar */}
          {hostInfo && (
            <AvatarWithFrame
              userId={hostInfo.id}
              src={hostInfo.avatarUrl}
              name={hostInfo.displayName}
              level={hostInfo.level}
              isHost={true}
              size="xs"
              showFrame={true}
            />
          )}
          <div className="flex flex-col">
            <span className="text-white font-semibold text-sm truncate max-w-[120px]">{roomName}</span>
            <div className="flex items-center gap-1.5 text-[10px]">
              <span className="text-white/60">{hostCountryFlag || '🌍'}</span>
              <button
                onClick={onOpenGiftContributors}
                className="inline-flex items-center"
              >
                <Badge className="bg-yellow-500/20 text-yellow-300 border-yellow-500/30 text-[9px] px-1.5 h-4 cursor-pointer hover:bg-yellow-500/30 transition-colors">
                  <BeansIcon size={8} className="mr-0.5" /> {formatNumber(totalBeans)}
                </Badge>
              </button>
            </div>
          </div>
        </div>

        {/* Right: Viewers + Close + PENDING REQUEST BADGE */}
        <div className="flex items-center gap-2">
          {/* Viewer Avatars Stack - WITH LEVELS (Same as Live Stream) */}
          {/* CRITICAL: Use realtimeViewers for instant updates, fallback to topViewers */}
          <button 
            onClick={() => setShowViewerPanel(true)}
            className="flex items-center -space-x-2 relative"
          >
            {((realtimeViewers.length > 0 ? realtimeViewers : topViewers).slice(0, 3)).map((v, i) => (
              <div key={v.id || i} className="relative" style={{ zIndex: 3 - i }}>
                <AvatarWithFrame
                  userId={v.id || `viewer-${i}`}
                  src={v.avatarUrl}
                  level={v.level || 1}
                  size="xs"
                  showFrame={true}
                  frameId={v.frameId || undefined}
                />
                {/* Level Badge - Same as Live Stream */}
                <div 
                  className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 px-1 py-0.5 rounded text-[6px] font-bold text-white shadow-sm"
                  style={{
                    background: (v.level || 1) >= 50 
                      ? 'linear-gradient(135deg, #f59e0b, #ef4444)' 
                      : (v.level || 1) >= 30 
                        ? 'linear-gradient(135deg, #fbbf24, #f97316)' 
                        : (v.level || 1) >= 20 
                          ? 'linear-gradient(135deg, #ec4899, #a855f7)'
                          : (v.level || 1) >= 10
                            ? 'linear-gradient(135deg, #06b6d4, #3b82f6)'
                            : 'linear-gradient(135deg, #8b5cf6, #6366f1)'
                  }}
                >
                  {v.level || 1}
                </div>
              </div>
            ))}
            <div className="flex items-center gap-1 bg-black/40 px-2 py-0.5 rounded-full ml-1">
              <Users className="w-3 h-3 text-white/70" />
              {/* CRITICAL: Use realtimeViewerCount for instant updates */}
              <span className="text-white text-[10px] font-medium">{realtimeViewerCount > 0 ? realtimeViewerCount : viewerCount}</span>
            </div>
            
            {/* 🔴 PENDING SEAT REQUEST BADGE - ONLY for Host */}
            {isHost && seatRequests.length > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -top-1 -right-1 min-w-5 h-5 px-1.5 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full shadow-lg ring-2 ring-black/50 z-10"
              >
                {seatRequests.length}
              </motion.span>
            )}
          </button>

          {/* Close Button - Visitors exit instantly (no modal), Host gets confirmation */}
          <Button
            variant="ghost"
            size="icon"
            className="w-8 h-8 rounded-full bg-black/50 text-white hover:bg-black/70"
            onClick={() => onClose()}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </header>

      {/* ==================== MAIN CONTENT ==================== */}
      <main className="relative z-10 flex-1 px-2 py-2 overflow-hidden">
        {/* SEAT GRID - Different for Audio vs Video/Game */}
        {roomType === 'audio' && !showGameBoard ? (
          // AUDIO ROOM: Dynamic Seat Grid based on activeSeats
          <div className="flex flex-col items-center justify-start pt-8 h-full">
            <div className="flex flex-col items-center gap-4 w-full max-w-md">
              {/* Dynamic rows based on activeSeats: 2->1row, 4->2x2, 6->2x3, 8->2x4, 10->2x5 */}
              {activeSeats <= 5 ? (
                // Single row for 2-5 seats
                <div className="flex items-center justify-center gap-3 w-full">
                  {allSeats.slice(0, activeSeats).map((seat, i) => (
                    seat ? (
                      <OccupiedSeat
                        key={i}
                        participant={seat}
                        position={i}
                        onTap={() => navigate(`/profile/${seat.id}`)}
                        isCurrentUser={seat.id === currentUserId}
                        showVideo={false}
                        size="sm"
                      />
                    ) : (
                      <EmptySeat key={i} position={i + 1} onTap={() => onRequestSeat(i)} size="sm" />
                    )
                  ))}
                </div>
              ) : (
                // Two rows for 6+ seats
                <>
                  <div className="flex items-center justify-center gap-3 w-full">
                    {allSeats.slice(0, Math.ceil(activeSeats / 2)).map((seat, i) => (
                      seat ? (
                        <OccupiedSeat
                          key={i}
                          participant={seat}
                          position={i}
                          onTap={() => navigate(`/profile/${seat.id}`)}
                          isCurrentUser={seat.id === currentUserId}
                          showVideo={false}
                          size="sm"
                        />
                      ) : (
                        <EmptySeat key={i} position={i + 1} onTap={() => onRequestSeat(i)} size="sm" />
                      )
                    ))}
                  </div>
                  <div className="flex items-center justify-center gap-3 w-full">
                    {allSeats.slice(Math.ceil(activeSeats / 2), activeSeats).map((seat, idx) => {
                      const pos = idx + Math.ceil(activeSeats / 2);
                      return seat ? (
                        <OccupiedSeat
                          key={pos}
                          participant={seat}
                          position={pos}
                          onTap={() => navigate(`/profile/${seat.id}`)}
                          isCurrentUser={seat.id === currentUserId}
                          showVideo={false}
                          size="sm"
                        />
                      ) : (
                        <EmptySeat key={pos} position={pos + 1} onTap={() => onRequestSeat(pos)} size="sm" />
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        ) : roomType === 'audio' && showGameBoard ? (
          // AUDIO ROOM WITH GAME: Seats at top, Game Board at BOTTOM
          <div className="flex flex-col h-full">
            {/* Compact Audio Seats - Dynamic based on activeSeats */}
            <div className="flex items-center justify-center gap-2 shrink-0 flex-wrap">
              {allSeats.slice(0, Math.min(activeSeats, 5)).map((seat, i) => (
                seat ? (
                  <OccupiedSeat
                    key={i}
                    participant={seat}
                    position={i}
                    onTap={() => navigate(`/profile/${seat.id}`)}
                    isCurrentUser={seat.id === currentUserId}
                    showVideo={false}
                    size="sm"
                  />
                ) : (
                  <EmptySeat key={i} position={i + 1} onTap={() => onRequestSeat(i)} size="sm" />
                )
              ))}
            </div>
            {/* Spacer to push game board to bottom */}
            <div className="flex-1" />
          </div>
        ) : (
          // VIDEO & GAME ROOM: Dynamic Grid based on activeSeats
          // 2 seats = 1 row (bigger), 4 seats = 2x2 grid, 6 seats = 2x3 grid (smaller)
          <div className={cn(
            "grid gap-1",
            // Dynamic grid columns based on seat count
            activeSeats <= 2 ? "grid-cols-2 grid-rows-1" :
            activeSeats <= 4 ? "grid-cols-2 grid-rows-2" :
            "grid-cols-3 grid-rows-2",
            // Height adjusts based on seat count - more seats = smaller
            activeSeats <= 2 ? "h-[18vh]" :
            activeSeats <= 4 ? ((roomType === 'game' || showGameBoard) ? "h-[28vh]" : "h-[32vh]") :
            ((roomType === 'game' || showGameBoard) ? "h-[26vh]" : "h-[30vh]")
          )}>
            {allSeats.slice(0, activeSeats).map((seat, i) => (
              <VideoGridSeat
                key={i}
                participant={seat}
                position={i}
                onTap={() => seat && navigate(`/profile/${seat.id}`)}
                onRequestSeat={() => onRequestSeat(i)}
                isMyself={seat?.id === currentUserId}
                localStream={localStream}
                peerStream={seat && getPeerStream ? getPeerStream(seat.id) : null}
                hostCountryFlag={hostCountryFlag}
                totalRoomBeans={totalBeans}
                onBeansClick={onOpenGiftContributors}
              />
            ))}
          </div>
        )}

        {/* ==================== MESSAGES AREA - ABOVE INPUT BOX ==================== */}
        {/* Public chat area visible to all participants */}
        {/* Welcome message at bottom, messages stack upward */}
        {/* z-30 = BEHIND game board (z-50) */}
        <div 
          className="absolute left-0 right-0 z-30 pointer-events-none flex flex-col justify-end"
          style={{ 
            bottom: '72px',
            maxHeight: (roomType === 'game' || showGameBoard) ? '22vh' : '42vh',
          }}
        >
          <div className="px-3 pointer-events-auto">
            {/* UNIFIED Chat Overlay - ONE LINK for all Party Room types */}
            {/* Shows: Welcome + Join banners + Chat + Gifts + Game Wins */}
            {/* All messages are PUBLIC and visible to everyone */}
            <RoomChatOverlay 
              messages={premiumMessages}
              joinNotifications={joinNotifications}
              maxMessages={(roomType === 'game' || showGameBoard) ? 3 : 20}
              maxHeight={(roomType === 'game' || showGameBoard) ? "18vh" : "35vh"}
              showWelcome={true}
              hostName={hostInfo?.displayName}
              hostLevel={hostInfo?.level}
              roomTitle={roomName}
              roomType={roomType}
              adminBannerRoomType={
                roomType === 'audio' ? 'party_audio' : 
                roomType === 'video' ? 'party_video' : 
                'party_game'
              }
            />
          </div>
        </div>

        {/* Game Board - Works for ALL room types (video, audio, game) */}
        {/* MUST be AFTER messages in DOM so it renders ON TOP of messages */}
        {/* z-50 > z-30, so game board covers messages when visible */}
        {((roomType === 'game' && activeGame && !isGameBoardMinimized) || showGameBoard) && (
          <motion.div 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="absolute left-2 right-2 z-50 bg-gradient-to-br from-slate-900/98 via-purple-900/95 to-slate-900/98 rounded-2xl border border-purple-500/30 overflow-hidden"
            style={{ 
              bottom: '55px',
              // Same size for Audio and Video rooms
              maxHeight: 'calc(100vh - 280px)'
            }}
          >
            {/* Game Content */}
            <div className="max-h-[55vh] overflow-y-auto overflow-x-hidden scrollbar-hide">
              <LiveGameBoard 
                selectedGame={activeGame?.id || selectedGameId || 'teen_patti'}
                roomId={roomId}
                onClose={() => {
                  console.log('[UnifiedPartyRoom] Closing game board from LiveGameBoard');
                  setShowGameBoard(false);
                  setSelectedGameId(null);
                  // For game rooms, minimize the board
                  if (roomType === 'game') {
                    setIsGameBoardMinimized(true);
                  }
                }}
                onOpenGifts={onOpenGifts}
              />
            </div>
            
            {/* Close button - top-right so it doesn't overlap bet controls */}
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => {
                console.log('[UnifiedPartyRoom] Closing game board via X button');
                setShowGameBoard(false);
                setSelectedGameId(null);
                // For game rooms, minimize the board
                if (roomType === 'game') {
                  setIsGameBoardMinimized(true);
                }
              }}
              className="absolute top-2 right-2 z-50 w-7 h-7 rounded-full bg-black/70 flex items-center justify-center text-white hover:bg-black/90 border border-white/20 shadow-lg"
            >
              <X className="w-4 h-4" />
            </motion.button>
          </motion.div>
        )}
        
        {/* ⏳ WAITING FOR APPROVAL BANNER */}
        {isWaitingForApproval && !isHost && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute bottom-[20%] left-3 right-3 z-40"
          >
            <div className="bg-gradient-to-r from-amber-500/90 to-orange-500/90 rounded-xl px-4 py-3 shadow-lg border border-white/20">
              <div className="flex items-center gap-3">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center"
                >
                  <Users className="w-4 h-4 text-white" />
                </motion.div>
                <div className="flex-1">
                  <p className="text-white font-semibold text-sm">Seat Request Pending...</p>
                  <p className="text-white/80 text-[11px]">You will join the seat once the host approves</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </main>

      {/* ==================== BOTTOM BAR - EXACT SAME AS LIVE STREAM ==================== */}
      <div className="absolute bottom-0 left-0 right-0 z-20 pb-2 safe-area-bottom">
        {/* Input & Action Buttons Bar - SAME Design as Live Stream */}
        <div className="px-2 flex items-center gap-1 bg-gradient-to-t from-black/70 via-black/30 to-transparent pt-2 pb-4 mb-2">
          {/* Chat Input - Compact (Same as Live Stream) */}
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              if (chatInput.trim()) {
                handleSendMessage(chatInput.trim());
                setChatInput("");
              }
            }}
            className="flex-1 min-w-0 relative"
          >
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Say something..."
              className="w-full h-8 bg-black/60 border border-white/20 rounded-full text-white placeholder:text-white/50 pr-8 text-[11px] pl-3 focus:outline-none"
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.form?.requestSubmit()}
            />
            <button
              type="submit"
              disabled={!chatInput.trim()}
              className="absolute right-0.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full text-white hover:bg-white/10 flex items-center justify-center"
            >
              <Send className="w-3 h-3" />
            </button>
          </form>

          {/* Mic Button - Party Room Specific */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={onMicToggle}
            className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center shadow-lg",
              isMuted 
                ? "bg-gradient-to-r from-red-500 to-rose-500" 
                : "bg-gradient-to-r from-green-500 to-emerald-500"
            )}
          >
            {isMuted ? <MicOff className="w-3.5 h-3.5 text-white" /> : <Mic className="w-3.5 h-3.5 text-white" />}
          </motion.button>

          {/* Game Button - Opens Game Selection for ALL room types */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              console.log('[UnifiedPartyRoom] 🎮 Game button clicked! roomType:', roomType, 'isMinimized:', isGameBoardMinimized);
              // If game board is minimized (in game room), restore it
              if (roomType === 'game' && isGameBoardMinimized) {
                setIsGameBoardMinimized(false);
              } else {
                setShowGameSelection(true);
              }
            }}
            className={cn(
              "w-8 h-8 rounded-full text-white flex items-center justify-center shadow-lg",
              (showGameBoard || (roomType === 'game' && activeGame && !isGameBoardMinimized))
                ? "bg-gradient-to-r from-green-500 to-emerald-500" 
                : "bg-gradient-to-r from-purple-500 to-violet-600"
            )}
          >
            <Gamepad2 className="w-3.5 h-3.5" />
          </motion.button>

          {/* Beauty Button — REAL DeepAR Native */}
          {onBeautyClick && (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={onBeautyClick}
              className="w-8 h-8 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white flex items-center justify-center shadow-lg"
            >
              <Sparkles className="w-3.5 h-3.5" />
            </motion.button>
          )}

          {/* Sticker Button — REAL DeepAR Native */}
          {onStickerClick && (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={onStickerClick}
              className="w-8 h-8 rounded-full bg-gradient-to-r from-orange-400 to-amber-500 text-white flex items-center justify-center shadow-lg"
            >
              <Smile className="w-3.5 h-3.5" />
            </motion.button>
          )}

          {/* Gift Button - Same as Live Stream */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={onOpenGifts}
            className="w-8 h-8 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 text-white flex items-center justify-center shadow-lg"
          >
            <Gift className="w-3.5 h-3.5" />
          </motion.button>

          {/* More Options Button - Same 3D Design as Live Stream */}
          <motion.button
            whileTap={{ scale: 0.92 }}
            whileHover={{ scale: 1.05 }}
            onClick={() => setShowSettingsPanel(true)}
            className="relative w-9 h-9 rounded-xl overflow-hidden"
          >
            {/* Outer glow ring */}
            <div className="absolute inset-0 bg-gradient-to-br from-violet-500 via-purple-600 to-fuchsia-600 rounded-xl" />
            
            {/* Inner 3D effect */}
            <div className="absolute inset-[1.5px] bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 rounded-[10px] flex items-center justify-center">
              {/* Top glass shine */}
              <div className="absolute top-0 left-0 right-0 h-1/3 bg-gradient-to-b from-white/20 to-transparent rounded-t-[10px]" />
              
              {/* Grid dots pattern */}
              <div className="relative grid grid-cols-3 gap-[3px] p-1">
                {[...Array(9)].map((_, i) => (
                  <div 
                    key={i}
                    className="w-[5px] h-[5px] rounded-full bg-gradient-to-br from-white to-purple-200 shadow-[0_0_3px_rgba(255,255,255,0.5)]"
                  />
                ))}
              </div>
            </div>
            
            {/* Bottom shadow for depth */}
            <div className="absolute -bottom-1 left-1 right-1 h-2 bg-purple-900/50 rounded-full" />
          </motion.button>
        </div>
      </div>

      {/* ==================== ALL PANELS (SAME FOR ALL ROOM TYPES) ==================== */}
      {/* Room Welcome Banner - Removed from here, now integrated into RoomChatOverlay */}

      {/* REMOVED: Old ChametStyleChatPanel - Using ONLY unified RoomChatOverlay (ONE LINK) */}
      {/* The floating chat overlay is already rendered above with premium styling */}

      {/* Viewer Panel - CRITICAL: Pass roomId for real-time sync */}
      <ChametStyleViewerPanel
        isOpen={showViewerPanel}
        onClose={() => setShowViewerPanel(false)}
        viewers={viewers.length > 0 ? viewers : topViewers.map((v, i) => ({
          id: v.id || `viewer-${i}`,
          displayName: v.displayName || `Viewer ${i + 1}`,
          avatarUrl: v.avatarUrl,
          level: v.level,
          countryFlag: '🌍',
          frameId: v.frameId || undefined
        }))}
        applicants={seatRequests}
        isHost={isHost}
        onAcceptApplicant={onAcceptSeatRequest}
        onRejectApplicant={onRejectSeatRequest}
        onInviteViewer={onInviteViewer}
        onKickViewer={onKickViewer}
        roomId={roomId}
      />

      {/* Settings Panel */}
      <ChametStyleSettingsPanel
        isOpen={showSettingsPanel}
        onClose={() => setShowSettingsPanel(false)}
        isCameraOn={!isVideoOff}
        onCameraToggle={onVideoToggle || (() => {})}
        isMicOn={!isMuted}
        onMicToggle={onMicToggle}
        isMirrorMode={isMirrorMode}
        onMirrorModeToggle={() => setIsMirrorMode(!isMirrorMode)}
        isFrontCamera={isFrontCamera}
        onSwitchCamera={() => {
          setIsFrontCamera(!isFrontCamera);
          onSwitchCamera?.();
        }}
        onSeatClick={() => {
          setShowSettingsPanel(false);
          setShowSeatSelectorPanel(true);
        }}
        onBackgroundClick={() => {
          setShowSettingsPanel(false);
          setShowBackgroundPanel(true);
        }}
        onMusicClick={() => {
          setShowSettingsPanel(false);
          setShowMusicPanel(true);
        }}
      />

      {/* Background Picker */}
      <BackgroundPickerPanel
        isOpen={showBackgroundPanel}
        onClose={() => setShowBackgroundPanel(false)}
        roomId={roomId}
        isHost={isHost}
        currentBackgroundId={undefined}
        onSelectBackground={(bg) => {
          if (bg) {
            // Set local background for INSTANT feedback (optimistic update)
            // DB sync will override via useEffect when parent updates
            const localBg = bg.image_url || bg.gradient_css;
            if (localBg) {
              console.log('[UnifiedPartyRoom] 🎨 Local background set (optimistic):', localBg);
              setSelectedBackground(localBg);
            }
          }
          setShowBackgroundPanel(false);
        }}
      />

      {/* Seat Selector Panel */}
      <SeatSelectorPanel
        isOpen={showSeatSelectorPanel}
        onClose={() => setShowSeatSelectorPanel(false)}
        roomId={roomId}
        currentSeats={activeSeats}
        maxSeatsAllowed={maxSeats}
        isHost={isHost}
        onSeatsChanged={(newCount) => {
          setActiveSeats(newCount);
          setShowSeatSelectorPanel(false);
        }}
      />

      {/* Layout Picker */}
      <LayoutPickerPanel
        isOpen={showLayoutPanel}
        onClose={() => setShowLayoutPanel(false)}
        currentLayout="grid-2x2"
        onSelectLayout={(layout) => {
          setShowLayoutPanel(false);
          // System notification hidden per design requirements
        }}
      />

      {/* Music Player */}
      <MusicPlayerPanel
        isOpen={showMusicPanel}
        onClose={() => setShowMusicPanel(false)}
        roomId={roomId}
        isHost={isHost}
      />

      {/* Close Modal */}
      <ChametStyleCloseModal
        isOpen={showCloseModal}
        onCancel={() => setShowCloseModal(false)}
        onConfirm={handleCloseConfirm}
        isHost={isHost}
      />
      
      {/* Game Selection Modal - Works for ALL room types */}
      <GameSelectionModal
        isOpen={showGameSelection}
        onClose={() => setShowGameSelection(false)}
        onSelectGame={(gameId) => {
          setSelectedGameId(gameId);
          setShowGameSelection(false);
          setShowGameBoard(true);
        }}
        selectedGame={selectedGameId}
      />
      <NumberSharingWarningDialog
        open={numberWarning.warningState.open}
        onClose={numberWarning.closeWarning}
        violationNumber={numberWarning.warningState.violationNumber}
        beansDeducted={numberWarning.warningState.beansDeducted}
        isBanned={numberWarning.warningState.isBanned}
        isGenericWarning={numberWarning.warningState.isGenericWarning}
      />
    </div>
  );
}

export default UnifiedPartyRoom;
