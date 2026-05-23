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
import { CountryFlag } from "@/components/common/CountryFlag";
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
// Pkg81b: fetchUserEntryAnimations no longer needed — Pkg80 LiveKit envelope
// carries pre-resolved entrance/entry-name-bar/vehicle URLs from the sender.
import { getEquippedBubble } from "@/utils/fetchEquippedBubbles";
import { trackTaskProgress } from "@/hooks/useTaskProgress";
// Pkg81c: LiveKit-only in-room chat (replaces `party-chat-${roomId}` Supabase channel).
import { publishChatMessage, type ChatMessageDetail } from "@/lib/livekitChatSignaling";
// Pkg81b: LiveKit-only participant join/leave (replaces `unified-party-joins-*`
// and `unified-room-viewers-*` Supabase channels).
import type { PartyEventDetail, ParticipantJoinedPayload } from "@/lib/livekitPartyEventsSignaling";
import { RoomWelcomeBanner } from "@/components/room/RoomWelcomeBanner";
import { hardenVideoElementForNative } from "@/utils/videoNativeHardening";
import { CaptionOverlay } from "@/components/livekit/CaptionOverlay";

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
  hostCountryCode?: string | null;
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
  onModerateViewer?: (userId: string, displayName: string) => void;
  
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
  hostCountryCode,
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
  hostCountryCode?: string | null;
  totalRoomBeans?: number;
  onBeansClick?: () => void;
}) => {
  const streamToUse = isMyself ? localStream : peerStream;
  const hasRenderableVideoTrack = Boolean(
    streamToUse?.getVideoTracks().some((track) => track.readyState === 'live' && track.enabled !== false)
  );
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const shieldRef = useRef<HTMLDivElement | null>(null);
  const canRenderVideo = Boolean(hasRenderableVideoTrack && !participant.isVideoOff && streamToUse);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    const timers: ReturnType<typeof setTimeout>[] = [];
    let cancelled = false;

    const clearVideo = () => {
      try { el.pause(); } catch { /* ignore */ }
      if (el.srcObject) el.srcObject = null;
    };

    if (!canRenderVideo || !streamToUse) {
      clearVideo();
      return;
    }

    if (el.srcObject !== streamToUse) {
      hardenVideoElementForNative(el, { muted: true });
      el.srcObject = streamToUse;
      el.muted = true;
      el.playsInline = true;
    }

    const tryPlay = () => {
      if (cancelled || el.srcObject !== streamToUse) return;
      el.play().catch(() => {
        if (!cancelled) timers.push(setTimeout(tryPlay, 300));
      });
    };

    const hideShield = () => {
      const shield = shieldRef.current;
      if (!shield || cancelled) return;
      shield.style.opacity = '0';
      timers.push(setTimeout(() => {
        if (!cancelled && shieldRef.current) shieldRef.current.style.display = 'none';
      }, 300));
    };

    tryPlay();
    const shield = shieldRef.current;
    if (shield) {
      shield.style.display = 'flex';
      shield.style.opacity = '1';
      if ('requestVideoFrameCallback' in el) {
        (el as any).requestVideoFrameCallback(hideShield);
      } else {
        timers.push(setTimeout(hideShield, 600));
      }
      timers.push(setTimeout(hideShield, 1500));
    }

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      clearVideo();
    };
  }, [canRenderVideo, streamToUse]);
  
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
      {canRenderVideo ? (
        <>
          <video
            ref={videoRef}
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
          {/* Shield: hides native HTML5 play overlay icon until real frames arrive */}
          <div
            ref={shieldRef}
            data-video-shield
            className="absolute inset-0 z-10 bg-gradient-to-br from-purple-700/80 to-indigo-800/80 flex items-center justify-center pointer-events-none transition-opacity duration-300"
          >
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
        </>
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
          {participant.isHost ? (
            <CountryFlag code={hostCountryCode} emoji={hostCountryFlag || participant.countryFlag || '🌍'} className="w-[18px] h-[12px]" />
          ) : (
            <CountryFlag emoji={participant.countryFlag || '🌍'} className="w-[18px] h-[12px]" />
          )}
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
  hostCountryCode,
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
  onModerateViewer,
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

  // 🛡️ Party premium chat dedup guard: enforces id uniqueness regardless
  // of which append path ran (realtime, broadcast, optimistic, welcome).
  useEffect(() => {
    setPremiumMessages(prev => {
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
  }, [premiumMessages]);
  const [currentUserProfile, setCurrentUserProfile] = useState<{ display_name?: string | null; avatar_url?: string | null; user_level?: number | null } | null>(null);
  
  // Join notifications for stacking display
  const [joinNotifications, setJoinNotifications] = useState<JoinNotification[]>([]);
  
  // CRITICAL: Real-time viewers state for header display (NOT relying on props)
  const [realtimeViewers, setRealtimeViewers] = useState<RealtimeViewer[]>([]);
  const [realtimeViewerCount, setRealtimeViewerCount] = useState<number | null>(null);
  const roomIdRef = useRef(roomId);
  const viewerFetchSeqRef = useRef(0);
  const chatLoadSeqRef = useRef(0);
  
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

  useEffect(() => {
    let cancelled = false;
    if (!currentUserId) {
      setCurrentUserProfile(null);
      return;
    }
    supabase
      .from('profiles_public')
      .select('display_name, avatar_url, user_level')
      .eq('id', currentUserId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setCurrentUserProfile(data || null);
      });
    return () => {
      cancelled = true;
    };
  }, [currentUserId]);
  
  // Store onTriggerEntryEffect in ref to avoid stale closures
  const onTriggerEntryEffectRef = useRef(onTriggerEntryEffect);
  useEffect(() => {
    onTriggerEntryEffectRef.current = onTriggerEntryEffect;
  }, [onTriggerEntryEffect]);
  
  // CRITICAL: Fetch real-time viewers for header display
  const fetchRealtimeViewers = useCallback(async () => {
    const currentRoomId = roomIdRef.current;
    if (!currentRoomId) return;
    const seq = ++viewerFetchSeqRef.current;
    
    try {
      const { data, error } = await supabase
        .from("party_room_participants")
        .select("user_id")
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
        const userIds = data.map((p: any) => p.user_id).filter(Boolean);
        const { data: publicProfiles } = userIds.length
          ? await supabase
              .from("profiles_public")
              .select("id, app_uid, display_name, avatar_url, user_level, frame_id")
              .in("id", userIds)
          : { data: [] as any[] };
        const profileMap = new Map((publicProfiles || []).map((profile: any) => [profile.id, profile]));
        const viewerList: RealtimeViewer[] = data
          .filter((p: any) => p.user_id !== currentHostId)
          .map((pv: any) => {
            const profile = profileMap.get(pv.user_id);
            return {
              id: profile?.id || pv.user_id,
              displayName: profile?.display_name || profile?.app_uid || "Anonymous",
              avatarUrl: profile?.avatar_url,
              level: profile?.user_level || 1,
              frameId: profile?.frame_id || undefined,
            };
          })
          .sort((a: RealtimeViewer, b: RealtimeViewer) => b.level - a.level); // Sort by level descending
        
        if (seq !== viewerFetchSeqRef.current || roomIdRef.current !== currentRoomId) return;
        setRealtimeViewers(viewerList);
        setRealtimeViewerCount(data.length); // Total including host
        console.log('[UnifiedPartyRoom] ✅ Real-time viewers updated:', viewerList.length, 'host excluded:', currentHostId);
      }
    } catch (err) {
      console.error('[UnifiedPartyRoom] Exception fetching viewers:', err);
    }
  }, []); // No dependencies - uses refs
  
  // Pkg81b: `unified-room-viewers-${roomId}` Supabase channel DELETED.
  // Viewer list now refreshes off LiveKit `participant_joined` /
  // `participant_left` window events dispatched by livekitPartyEventsSignaling
  // (registered once per room in usePartyRoomWebRTC). Late-join state =
  // initial fetchRealtimeViewers() on mount; PartyRoom keeps a 20s REST
  // safety poll for native packet-loss recovery.
  useEffect(() => {
    if (!roomId) return;

    console.log('[UnifiedPartyRoom] 🚀 LiveKit-only viewer sync for room:', roomId);
    fetchRealtimeViewers();

    const handlePartyEvent = (ev: Event) => {
      const detail = (ev as CustomEvent<PartyEventDetail>).detail;
      const p = detail?.payload as any;
      if (!p || p.roomId !== roomId) return;
      if (p.type === 'participant_joined' || p.type === 'participant_left') {
        console.log('[UnifiedPartyRoom] 📡 Pkg81b viewer event:', p.type);
        fetchRealtimeViewers();
      }
    };
    window.addEventListener('livekit-party-event', handlePartyEvent);

    return () => {
      window.removeEventListener('livekit-party-event', handlePartyEvent);
    };
  }, [roomId, fetchRealtimeViewers]);
  
  // Re-fetch viewers when hostInfo changes (to properly filter)
  useEffect(() => {
    if (hostInfo?.id && roomId) {
      console.log('[UnifiedPartyRoom] Host ID updated, refetching viewers');
      fetchRealtimeViewers();
    }
  }, [hostInfo?.id, roomId, fetchRealtimeViewers]);
  
  // ==================== Pkg81b: LiveKit-only participant_joined ====================
  // `unified-party-joins-${roomId}` Supabase channel DELETED.
  // The Pkg80 `livekit-party-event` envelope already carries entrance + entry
  // name bar + vehicle animation URLs (sender pre-resolved them before
  // publishing), so receivers can render banner + entry effect without any
  // `profiles_public` round-trip — true LiveKit-only path.
  useEffect(() => {
    if (!roomId) return;

    const handlePartyEvent = (ev: Event) => {
      const detail = (ev as CustomEvent<PartyEventDetail>).detail;
      const payload = detail?.payload;
      if (!payload || (payload as any).roomId !== roomId) return;
      if (payload.type !== 'participant_joined') return;

      const data = payload as ParticipantJoinedPayload;
      const joinKey = `${data.userId}_${Math.floor(data.timestamp / 5000)}`;
      if (processedParticipantJoinsRef.current.has(joinKey)) return;
      processedParticipantJoinsRef.current.add(joinKey);

      console.log('[UnifiedPartyRoom] ⚡ Pkg81b livekit participant_joined:', data.userName);

      setJoinNotifications(prev => [...prev.slice(-5), {
        id: `livekit_join_${joinKey}`,
        userId: data.userId,
        userName: data.userName,
        userLevel: data.userLevel,
        userAvatar: data.userAvatar,
        timestamp: Date.now(),
      }]);

      const triggerCallback = onTriggerEntryEffectRef.current;
      const animationKey = `${data.userId}_${roomId}`;
      if (triggeredEntryAnimationsRef.current.has(animationKey)) return;

      const entranceUrl = data.entranceAnimationUrl || undefined;
      const entryNameBarUrl = data.entryNameBarUrl || undefined;
      const vehicleUrl = data.vehicleAnimationUrl || undefined;
      if (!entranceUrl && !entryNameBarUrl && !vehicleUrl) return;

      if (triggerCallback) {
        triggeredEntryAnimationsRef.current.add(animationKey);
        triggerCallback({
          userId: data.userId,
          displayName: data.userName,
          avatarUrl: data.userAvatar,
          level: data.userLevel,
          entranceUrl,
          entryNameBarUrl,
        });
      }
    };
    window.addEventListener('livekit-party-event', handlePartyEvent);
    return () => window.removeEventListener('livekit-party-event', handlePartyEvent);
  }, [roomId]);

  
  // ==================== LIVEKIT CHAT FANOUT ====================
  // Load history from party_room_messages; live fanout arrives via LiveKit.
  useEffect(() => {
    if (!roomId) return;
    const loadSeq = ++chatLoadSeqRef.current;
    processedMsgIdsRef.current.clear();
    processedJoinsRef.current.clear();
    processedParticipantJoinsRef.current.clear();
    triggeredEntryAnimationsRef.current.clear();
    
    console.log('[UnifiedPartyRoom] Setting up LiveKit chat fanout for room:', roomId);
    
    // Load existing chat messages - UNIFIED format only (ONE LINK)
    const loadMessages = async () => {
      const { data } = await supabase
        .from('party_room_messages')
        .select('id, user_id, content, message_type, created_at')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true })
        .limit(100);
      
      if (data) {
        const senderIds = [...new Set(data.map((m: any) => m.user_id).filter(Boolean))];
        const { data: publicProfiles } = senderIds.length
          ? await supabase
              .from('profiles_public')
              .select('id, display_name, user_level, avatar_url, is_host')
              .in('id', senderIds)
          : { data: [] as any[] };
        const profileMap = new Map((publicProfiles || []).map((profile: any) => [profile.id, profile]));

        // Load directly to unified premiumMessages - NO duplicate chatMessages
        const unifiedMsgs: RoomChatMessage[] = data.map((m: any) => {
          const profile = profileMap.get(m.user_id);
          return {
            id: m.id,
            userId: m.user_id,
            user: profile?.display_name || 'User',
            initial: (profile?.display_name || 'U').charAt(0).toUpperCase(),
            message: m.content,
            color: m.message_type === 'gift' ? 'pink' : m.message_type === 'join' ? 'emerald' : 'white',
            userLevel: profile?.user_level || 1,
            userAvatar: profile?.avatar_url,
            isHost: profile?.is_host || (m.user_id === hostInfo?.id),
            isNewUser: false,
            type: m.message_type || 'text',
            bubbleUrl: null,
          };
        });
        if (loadSeq !== chatLoadSeqRef.current || roomIdRef.current !== roomId) return;
        setPremiumMessages(unifiedMsgs);
        unifiedMsgs.forEach(m => processedMsgIdsRef.current.add(m.id));

        // Asynchronously enrich each message with sender's equipped designer chat bubble
        // (cached + de-duped per user — safe to call inside loops)
        unifiedMsgs.forEach(async (m) => {
          if (!m.userId) return;
          const bubbleUrl = await getEquippedBubble(m.userId);
          if (bubbleUrl && loadSeq === chatLoadSeqRef.current && roomIdRef.current === roomId) {
            setPremiumMessages(prev => prev.map(pm => pm.id === m.id ? { ...pm, bubbleUrl } : pm));
          }
        });
      }
    };
    
    loadMessages();
    
    // ============= Pkg81c: LiveKit-only chat fanout =============
    // `party-chat-${roomId}` Supabase postgres_changes subscription DELETED.
    // Sender (handleSendMessage below) INSERTs to party_room_messages first
    // (moderation/audit/history), then publishes a `chat_message` DataPacket
    // via livekitChatSignaling. Receivers listen to the `livekit-chat-message`
    // window event dispatched by registerChatRoom('party', roomId, room) —
    // which is wired in usePartyRoomWebRTC. ZERO Supabase Realtime channels.
    const handleLiveKitChat = (ev: Event) => {
      const data = (ev as CustomEvent<ChatMessageDetail>).detail;
      if (!data || data.scope !== 'party' || data.id !== roomId) return;
      if (processedMsgIdsRef.current.has(data.messageId)) return;
      processedMsgIdsRef.current.add(data.messageId);

      const msgType = (data.messageType || 'text') as RoomChatMessage['type'];
      const unifiedMsg: RoomChatMessage = {
        id: data.messageId,
        userId: data.userId,
        user: data.displayName || 'User',
        initial: (data.displayName || 'U').charAt(0).toUpperCase(),
        message: data.message,
        color: msgType === 'gift' ? 'pink' : msgType === 'join' ? 'emerald' : 'white',
        userLevel: data.userLevel || 1,
        userAvatar: data.avatarUrl,
        isHost: data.isHost || (data.userId === hostInfo?.id),
        isNewUser: false,
        type: msgType,
        bubbleUrl: null,
      };

      // REPLACE-OR-APPEND dedupe — same logic as old postgres_changes handler.
      setPremiumMessages(prev => {
        if (prev.some(m => m.id === data.messageId)) return prev;
        const tempIdx = prev.findIndex(m =>
          typeof m.id === 'string' && m.id.startsWith('temp-')
          && m.userId === data.userId
          && m.message === data.message
        );
        if (tempIdx >= 0) {
          const copy = prev.slice();
          copy[tempIdx] = { ...copy[tempIdx], ...unifiedMsg };
          return copy;
        }
        return [...prev.slice(-100), unifiedMsg];
      });

      // Async bubble enrichment — cached per user.
      void getEquippedBubble(data.userId).then(bubbleUrl => {
        if (!bubbleUrl || roomIdRef.current !== roomId) return;
        setPremiumMessages(prev => prev.map(pm => pm.id === data.messageId ? { ...pm, bubbleUrl } : pm));
      });
    };
    window.addEventListener('livekit-chat-message', handleLiveKitChat);

    return () => {
      window.removeEventListener('livekit-chat-message', handleLiveKitChat);
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
    
    const sendingRoomId = roomId;
    const sendingUserId = currentUserId;
    const trimmedMessage = message.trim();
    const tempId = `temp-${Date.now()}-${Math.random()}`;
    
    // Mark this message content as pending (to skip when real-time confirms)
    const msgKey = `${sendingUserId}-${trimmedMessage}`;
    pendingMessagesRef.current.add(msgKey);
    
    // OPTIMISTIC UPDATE: Instantly show message in UI before DB save
    const senderName = currentUserProfile?.display_name || (isHost ? hostInfo?.displayName : null) || 'You';
    const ownBubble = await getEquippedBubble(sendingUserId);
    if (roomIdRef.current !== sendingRoomId) {
      pendingMessagesRef.current.delete(msgKey);
      return;
    }
    const optimisticMessage: RoomChatMessage = {
      id: tempId,
      userId: sendingUserId,
      user: senderName,
      initial: senderName.charAt(0).toUpperCase(),
      message: trimmedMessage,
      userLevel: currentUserProfile?.user_level || (isHost ? hostInfo?.level : 1) || 1,
      userAvatar: currentUserProfile?.avatar_url || (isHost ? hostInfo?.avatarUrl : undefined),
      isHost: isHost,
      type: 'text',
      timestamp: new Date(),
      bubbleUrl: ownBubble,
    };

    // Add to local state immediately (instant feedback)
    setPremiumMessages(prev => [...prev, optimisticMessage]);
    
    // Run contact detection for hosts - non-blocking with error handling
    detectAndProcessViolation(sendingUserId, trimmedMessage, 'chat', sendingRoomId)
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
    checkToxic(trimmedMessage, { contextType: 'party_room', roomId: sendingRoomId }).catch(() => {});
    
    // Save to party_room_messages table - background operation
    const { data, error } = await supabase.from('party_room_messages').insert({
      room_id: sendingRoomId,
      user_id: sendingUserId,
      content: trimmedMessage,
      message_type: 'chat'
    }).select('id').single();
    if (roomIdRef.current !== sendingRoomId) {
      pendingMessagesRef.current.delete(msgKey);
      return;
    }
    
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

      // Pkg81c: publish chat over LiveKit DataPacket. Receivers render
      // sub-50ms without any postgres_changes subscription. DB row above
      // remains the moderation/audit/late-join history source.
      void publishChatMessage('party', sendingRoomId, {
        messageId: data.id,
        userId: sendingUserId,
        displayName: senderName,
        avatarUrl: currentUserProfile?.avatar_url || (isHost ? hostInfo?.avatarUrl : undefined),
        userLevel: currentUserProfile?.user_level || (isHost ? hostInfo?.level : 1) || 1,
        isHost,
        message: trimmedMessage,
        messageType: 'chat',
      });

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
  const hostActualPosition = participants.find(p => p.id === hostInfo?.id)?.position ?? 
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
      <header className="relative z-20 flex items-center justify-between px-3 py-2">
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
              <CountryFlag code={hostCountryCode} emoji={hostCountryFlag || '🌍'} className="w-[16px] h-[11px]" />
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

          {/* Close Button — 36px tap target */}
          <Button
            variant="ghost"
            size="icon"
            aria-label={isHost ? 'End party' : 'Leave party'}
            className="w-9 h-9 rounded-full bg-black/50 text-white hover:bg-black/70"
            onClick={() => onClose()}
          >
            <X className="w-[18px] h-[18px]" />
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
            "grid gap-1.5",
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
                hostCountryCode={hostCountryCode}
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

        {/* Pkg145: Realtime captions overlay (rides Pkg116 transcription kill-switch) */}
        {roomId && <CaptionOverlay scope="party" id={roomId} hideToggle />}


        {/* Game Board - Works for ALL room types (video, audio, game) */}
        {/* MUST be AFTER messages in DOM so it renders ON TOP of messages */}
        {/* z-50 > z-30, so game board covers messages when visible */}
        {((roomType === 'game' && activeGame && !isGameBoardMinimized) || showGameBoard) && (
          <motion.div 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="absolute left-2 right-2 z-50 live-game-dock overflow-hidden"
            style={{ 
              bottom: '64px',
              // Use dynamic viewport for mobile URL-bar safety
              maxHeight: 'calc(100dvh - 300px)'
            }}
          >
            {/* Game Content */}
            <div className="max-h-[55dvh] overflow-y-auto overflow-x-hidden scrollbar-hide">
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
            
            {/* Close button — 36px tap target, doesn't overlap bet controls */}
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
              aria-label="Close mini-game"
              className="absolute top-2 right-2 z-50 w-9 h-9 rounded-full bg-black/70 flex items-center justify-center text-white hover:bg-black/90 border border-white/20 shadow-lg"
            >
              <X className="w-[18px] h-[18px]" />
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
      <div className="absolute bottom-0 left-0 right-0 z-20">
        {/* Input & Action Buttons Bar — unified 40px tap targets */}
        <div className="px-2 flex items-center gap-1.5 bg-gradient-to-t from-black/70 via-black/30 to-transparent pt-2 pb-3">
          {/* Chat Input — 40px tap target */}
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
              className="w-full h-10 bg-black/60 border border-white/20 rounded-full text-white placeholder:text-white/50 pr-10 text-[11px] pl-3.5 focus:outline-none"
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.form?.requestSubmit()}
            />
            <button
              type="submit"
              disabled={!chatInput.trim()}
              aria-label="Send message"
              className="absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full text-white hover:bg-white/10 flex items-center justify-center disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>

          {/* Mic Button */}
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={onMicToggle}
            aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center shadow-lg shrink-0",
              isMuted 
                ? "bg-gradient-to-r from-red-500 to-rose-500" 
                : "bg-gradient-to-r from-green-500 to-emerald-500"
            )}
          >
            {isMuted ? <MicOff className="w-[18px] h-[18px] text-white" /> : <Mic className="w-[18px] h-[18px] text-white" />}
          </motion.button>

          {/* Game Button - Opens Game Selection for ALL room types */}
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={() => {
              console.log('[UnifiedPartyRoom] 🎮 Game button clicked! roomType:', roomType, 'isMinimized:', isGameBoardMinimized);
              // If game board is minimized (in game room), restore it
              if (roomType === 'game' && isGameBoardMinimized) {
                setIsGameBoardMinimized(false);
              } else {
                setShowGameSelection(true);
              }
            }}
            aria-label="Open games"
            className={cn(
              "w-10 h-10 rounded-full text-white flex items-center justify-center shadow-lg shrink-0",
              (showGameBoard || (roomType === 'game' && activeGame && !isGameBoardMinimized))
                ? "bg-gradient-to-r from-green-500 to-emerald-500" 
                : "bg-gradient-to-r from-purple-500 to-violet-600"
            )}
          >
            <Gamepad2 className="w-[18px] h-[18px]" />
          </motion.button>

          {/* Beauty Button — REAL DeepAR Native */}
          {onBeautyClick && (
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={onBeautyClick}
              aria-label="Beauty filters"
              className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white flex items-center justify-center shadow-lg shrink-0"
            >
              <Sparkles className="w-[18px] h-[18px]" />
            </motion.button>
          )}

          {/* Sticker Button — REAL DeepAR Native */}
          {onStickerClick && (
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={onStickerClick}
              aria-label="AR stickers"
              className="w-10 h-10 rounded-full bg-gradient-to-r from-orange-400 to-amber-500 text-white flex items-center justify-center shadow-lg shrink-0"
            >
              <Smile className="w-[18px] h-[18px]" />
            </motion.button>
          )}

          {/* Gift Button */}
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={onOpenGifts}
            aria-label="Send gift"
            className="w-10 h-10 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 text-white flex items-center justify-center shadow-lg shrink-0"
          >
            <Gift className="w-[18px] h-[18px]" />
          </motion.button>

          {/* More Options Button - Same 3D Design as Live Stream */}
          <motion.button
            whileTap={{ scale: 0.92 }}
            whileHover={{ scale: 1.05 }}
            onClick={() => setShowSettingsPanel(true)}
            aria-label="More options"
            className="relative w-10 h-10 rounded-xl overflow-hidden shrink-0"
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
        viewers={(realtimeViewers.length > 0 ? realtimeViewers : viewers.length > 0 ? viewers : topViewers.map((v, i) => ({
          id: v.id || `viewer-${i}`,
          displayName: v.displayName || `Viewer ${i + 1}`,
          avatarUrl: v.avatarUrl,
          level: v.level,
          countryFlag: '🌍',
          frameId: v.frameId || undefined
        })))}
        applicants={seatRequests}
        isHost={isHost}
        onAcceptApplicant={onAcceptSeatRequest}
        onRejectApplicant={onRejectSeatRequest}
        onInviteViewer={onInviteViewer}
        onKickViewer={onKickViewer}
        onModerateViewer={onModerateViewer}
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
