import { useState, useEffect, useMemo } from "react";
import { useContentModeration } from "@/hooks/useContentModeration";
import { useStableChatScroll } from "@/hooks/useStableChatScroll";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { 
  Mic, 
  MicOff, 
  Crown, 
  Gift,
  Send,
  Users,
  LayoutGrid,
  Heart,
  X,
  Plus,
  Sparkles,
  Gamepad2,
  ChevronRight,
  Armchair
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import AvatarWithFrame from "@/components/common/AvatarWithFrame";
import BeansIcon from "@/components/common/BeansIcon";
import { ChametStyleBottomBar } from "./ChametStyleBottomBar";
import { ChametStyleViewerPanel } from "./ChametStyleViewerPanel";
import { ChametStyleCloseModal } from "./ChametStyleCloseModal";
import { ChametStyleSettingsPanel } from "./ChametStyleSettingsPanel";
import { BackgroundPickerPanel } from "./BackgroundPickerPanel";
import { LayoutPickerPanel } from "./LayoutPickerPanel";
import { MusicPlayerPanel } from "./MusicPlayerPanel";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { RoomChatBubble } from "@/components/chat/UnifiedChatMessage";

interface SpeakerInfo {
  id: string;
  position: number;
  displayName: string;
  avatarUrl?: string;
  level: number;
  beans?: number;
  countryFlag?: string;
  isSpeaking: boolean;
  isMuted: boolean;
  isHost: boolean;
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
}

interface JoinMessage {
  id: string;
  userId: string;
  userName: string;
  userLevel: number;
  avatarUrl?: string;
  type: 'join' | 'leave';
  timestamp: Date;
}

interface ProfessionalAudioRoomProps {
  roomName: string;
  roomId: string;
  hostInfo: SpeakerInfo | null;
  speakers: SpeakerInfo[];
  maxSeats: number;
  viewerCount: number;
  currentUserId?: string;
  onMicToggle: () => void;
  onRequestSeat: (position: number) => void;
  onOpenGifts: () => void;
  onOpenChat: () => void;
  onClose: () => void;
  onOpenGame?: () => void;
  onOpenMenu?: () => void;
  backgroundUrl?: string;
  isMuted: boolean;
  totalBeans?: number;
  topViewers?: { id: string; displayName: string; avatarUrl?: string; level: number; }[];
  // Real seat requests from database
  seatRequests?: SeatApplicant[];
  onAcceptSeatRequest?: (userId: string) => void;
  onRejectSeatRequest?: (userId: string) => void;
  // Real viewers (audience)
  viewers?: Viewer[];
  onInviteViewer?: (userId: string) => void;
  // Current user waiting status
  isWaitingForApproval?: boolean;
  onJoinRequest?: () => void;
  isHost?: boolean;
  // Join messages from parent
  joinMessages?: JoinMessage[];
}

// Shooting Star Component — PR-2.4: randoms frozen via useMemo.
const ShootingStar = ({ delay }: { delay: number }) => {
  const stable = useMemo(() => ({
    left: `${Math.random() * 80 + 10}%`,
    top: `${Math.random() * 30}%`,
    repeatDelay: 8 + Math.random() * 5,
  }), []);
  return (
    <motion.div
      initial={{ x: "100%", y: "-10%", opacity: 0 }}
      animate={{ x: "-20%", y: "120%", opacity: [0, 1, 1, 0] }}
      transition={{ duration: 2.5, delay, repeat: Infinity, repeatDelay: stable.repeatDelay }}
      className="absolute w-[2px] h-16 bg-gradient-to-b from-white via-white/80 to-transparent rotate-[45deg] pointer-events-none"
      style={{
        boxShadow: '0 0 6px 2px rgba(255,255,255,0.3)'
      }}
    />
  );
};

// Premium Host Frame with Crown - LUXURY SIZE
const PremiumHostFrame = ({ 
  speaker, 
  onTap,
  isCurrentUser 
}: { 
  speaker: SpeakerInfo;
  onTap: () => void;
  isCurrentUser: boolean;
}) => {
  const [waveHeights, setWaveHeights] = useState<number[]>([3, 3, 3, 3, 3]);
  
  useEffect(() => {
    if (speaker.isSpeaking && !speaker.isMuted) {
      const interval = setInterval(() => {
        setWaveHeights(Array.from({ length: 5 }, () => Math.random() * 16 + 3));
      }, 80);
      return () => clearInterval(interval);
    } else {
      setWaveHeights([3, 3, 3, 3, 3]);
    }
  }, [speaker.isSpeaking, speaker.isMuted]);

  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center relative"
      onClick={() => onTap()}
    >
      {/* Speaking glow */}
      <AnimatePresence>
        {speaker.isSpeaking && !speaker.isMuted && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ 
              opacity: [0.3, 0.7, 0.3], 
              scale: [1, 1.3, 1] 
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2, repeat: Infinity }}
            className="absolute -inset-4 -z-10 rounded-full"
            style={{
              background: 'radial-gradient(circle, #f59e0b 0%, transparent 70%)',
              filter: 'blur(15px)'
            }}
          />
        )}
      </AnimatePresence>

      <div className="relative">
        {/* Floating Crown */}
        <motion.div 
          className="absolute -top-4 left-1/2 -translate-x-1/2 z-30"
          animate={{ y: [0, -3, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <Crown className="w-5 h-5 text-yellow-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.9)]" fill="#fbbf24" />
        </motion.div>

        {/* Host Avatar - MD size for prominent display */}
        <AvatarWithFrame
          userId={speaker.id}
          src={speaker.avatarUrl}
          name={speaker.displayName}
          level={speaker.level || 1}
          isHost={true}
          size="md"
          showFrame={true}
          showAnimation={true}
          showGlow={!speaker.isMuted && speaker.isSpeaking}
        />

        {/* Sparkles */}
        <motion.div
          className="absolute -top-1 -right-1 z-30"
          animate={{ scale: [1, 1.3, 1], rotate: [0, 15, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <Sparkles className="w-3 h-3 text-yellow-300" />
        </motion.div>

        {/* Mic badge */}
        <motion.div 
          className={cn(
            "absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center z-20",
            speaker.isMuted ? "bg-red-500" : "bg-green-500"
          )}
          animate={speaker.isSpeaking ? { scale: [1, 1.15, 1] } : {}}
          transition={{ duration: 0.5, repeat: speaker.isSpeaking ? Infinity : 0 }}
        >
          {speaker.isMuted ? (
            <MicOff className="w-3 h-3 text-white" />
          ) : (
            <Mic className="w-3 h-3 text-white" />
          )}
        </motion.div>
      </div>

      {/* Stylized Name Plate */}
      <div className="flex flex-col items-center mt-1.5">
        <div 
          className="px-2.5 py-0.5 rounded-md text-[9px] font-bold text-white truncate max-w-[65px]"
          style={{
            border: '1px solid rgba(255,215,0,0.4)',
            textShadow: '0 0 6px rgba(255,215,0,0.5)',
            letterSpacing: '0.5px'
          }}
        >
          🎙️ {speaker.displayName?.split(' ')[0]?.slice(0, 6) || 'Host'}
        </div>
        <div 
          className="px-1.5 py-0.5 rounded-full text-[7px] font-bold text-white mt-0.5"
          style={{
              ? 'linear-gradient(135deg, #fbbf24, #f97316)' 
              : speaker.level >= 20 
                ? 'linear-gradient(135deg, #ec4899, #a855f7)'
                : 'linear-gradient(135deg, #8b5cf6, #6366f1)'
          }}
        >
          ⭐Lv{speaker.level}
        </div>
      </div>

      {/* Audio Visualization */}
      {speaker.isSpeaking && !speaker.isMuted && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 flex items-end gap-0.5 h-3">
          {waveHeights.map((height, i) => (
            <motion.div
              key={i}
              className="w-0.5 bg-gradient-to-t from-yellow-500 to-amber-300 rounded-full"
              animate={{ height }}
              transition={{ duration: 0.08 }}
            />
          ))}
        </div>
      )}
    </motion.button>
  );
};

// Empty Seat - Luxury size (64px)
const EmptySeat = ({ 
  position, 
  onTap 
}: { 
  position: number;
  onTap: () => void;
}) => (
  <motion.button
    initial={{ opacity: 0, scale: 0.8 }}
    animate={{ opacity: 1, scale: 1 }}
    transition={{ delay: position * 0.03 }}
    onClick={onTap}
    className="flex flex-col items-center justify-start"
  >
    <div 
      className="w-[64px] h-[64px] rounded-full flex items-center justify-center hover:scale-105 transition-all"
      style={{
        background: 'radial-gradient(circle, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)',
        border: '2px dashed rgba(255,255,255,0.2)',
        boxShadow: 'inset 0 0 20px rgba(139,92,246,0.1)'
      }}
    >
      <Armchair className="w-6 h-6 text-white/30" />
    </div>
    <div className="h-[28px]" />
  </motion.button>
);

// Occupied Seat - With Avatar Frame (MD Size for luxury layout)
const OccupiedSeat = ({ 
  speaker, 
  position,
  onTap,
  isCurrentUser 
}: { 
  speaker: SpeakerInfo;
  position: number;
  onTap: () => void;
  isCurrentUser: boolean;
}) => {
  const [waveHeights, setWaveHeights] = useState<number[]>([2, 2, 2]);
  
  useEffect(() => {
    if (speaker.isSpeaking && !speaker.isMuted) {
      const interval = setInterval(() => {
        setWaveHeights(Array.from({ length: 3 }, () => Math.random() * 8 + 2));
      }, 100);
      return () => clearInterval(interval);
    } else {
      setWaveHeights([2, 2, 2]);
    }
  }, [speaker.isSpeaking, speaker.isMuted]);

  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: position * 0.03 }}
      className="flex flex-col items-center justify-start relative"
      onClick={onTap}
    >
      {/* Speaking glow */}
      {speaker.isSpeaking && !speaker.isMuted && (
        <motion.div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[64px] h-[64px] rounded-full"
          animate={{ 
            boxShadow: [
              '0 0 15px 3px rgba(34, 197, 94, 0.3)',
              '0 0 25px 8px rgba(34, 197, 94, 0.5)',
              '0 0 15px 3px rgba(34, 197, 94, 0.3)'
            ]
          }}
          transition={{ duration: 1, repeat: Infinity }}
        />
      )}
      
      {/* Avatar with Frame - SM Size (renders at 64px with frame) */}
      <div className="relative">
        <AvatarWithFrame
          userId={speaker.id}
          src={speaker.avatarUrl}
          name={speaker.displayName}
          level={speaker.level || 1}
          size="sm"
          showFrame={true}
          showAnimation={true}
          showGlow={speaker.isSpeaking}
        />
        
        {/* Mic badge */}
        <motion.div 
          className={cn(
            "absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center z-20",
            speaker.isMuted ? "bg-red-500" : "bg-green-500"
          )}
          animate={speaker.isSpeaking ? { scale: [1, 1.15, 1] } : {}}
          transition={{ duration: 0.5, repeat: speaker.isSpeaking ? Infinity : 0 }}
        >
          {speaker.isMuted ? (
            <MicOff className="w-3 h-3 text-white" />
          ) : (
            <Mic className="w-3 h-3 text-white" />
          )}
        </motion.div>

        {/* Beans/fire badge if present */}
        {speaker.beans && speaker.beans > 0 && (
          <div 
            className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full z-20"
            style={{
              background: 'linear-gradient(135deg, rgba(239,68,68,0.9), rgba(234,88,12,0.9))',
              border: '1px solid rgba(255,255,255,0.3)',
              fontSize: '7px'
            }}
          >
            🔥{speaker.beans}
          </div>
        )}
      </div>
      
      {/* Stylized Name Plate */}
      <div className="flex flex-col items-center mt-1 h-[28px]">
        <div 
          className="px-2 py-0.5 rounded-md text-[8px] font-bold text-white truncate max-w-[60px]"
          style={{
            letterSpacing: '0.3px'
          }}
        >
          {speaker.countryFlag || ''}{speaker.displayName?.split(' ')[0]?.slice(0, 6) || 'User'}
        </div>
        <div 
          className="px-1 py-0.5 rounded-full text-[6px] font-bold text-white mt-0.5"
          style={{
              ? 'linear-gradient(135deg, #fbbf24, #f97316)' 
              : speaker.level >= 20 
                ? 'linear-gradient(135deg, #ec4899, #a855f7)'
                : 'linear-gradient(135deg, #8b5cf6, #6366f1)'
          }}
        >
          ⭐Lv{speaker.level}
        </div>
      </div>
    </motion.button>
  );
};

export function ProfessionalAudioRoom({
  roomName,
  roomId,
  hostInfo,
  speakers,
  maxSeats,
  viewerCount,
  currentUserId,
  onMicToggle,
  onRequestSeat,
  onOpenGifts,
  onOpenChat,
  onClose,
  onOpenGame,
  onOpenMenu,
  backgroundUrl,
  isMuted,
  totalBeans = 0,
  topViewers = [],
  seatRequests = [],
  onAcceptSeatRequest,
  onRejectSeatRequest,
  viewers = [],
  onInviteViewer,
  isWaitingForApproval = false,
  onJoinRequest,
  isHost = false,
  joinMessages = []
}: ProfessionalAudioRoomProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [floatingHearts, setFloatingHearts] = useState<{ id: number; x: number }[]>([]);
  const [showViewerPanel, setShowViewerPanel] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [isMirrorMode, setIsMirrorMode] = useState(false);
  const [isFrontCamera, setIsFrontCamera] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [showBackgroundPanel, setShowBackgroundPanel] = useState(false);
  const [showLayoutPanel, setShowLayoutPanel] = useState(false);
  const [showMusicPanel, setShowMusicPanel] = useState(false);
  const [selectedBackground, setSelectedBackground] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const audioRoomChatScroll = useStableChatScroll({
    dependency: chatMessages.length,
    resetKey: roomId,
    bottomThreshold: 72,
    initialPinFrames: 3,
  });
  const [chatInput, setChatInput] = useState("");
  
  // 🔥 AWS Comprehend content moderation
  const { checkToxicContent: checkToxic } = useContentModeration(currentUserId);
  
  // Sync joinMessages from parent to local chat
  useEffect(() => {
    if (joinMessages.length > 0) {
      const latestJoin = joinMessages[joinMessages.length - 1];
      // Check if already added
      const alreadyAdded = chatMessages.some(m => m.id === latestJoin.id);
      if (!alreadyAdded) {
        setChatMessages(prev => [...prev, {
          id: latestJoin.id,
          userId: latestJoin.userId,
          userName: latestJoin.userName,
          userLevel: latestJoin.userLevel,
          message: latestJoin.type === 'join' ? 'joined the room 🎉' : 'left the room',
          type: 'join',
          timestamp: latestJoin.timestamp
        }]);
      }
    }
  }, [joinMessages]);
  
  // Create seat grid - 2 rows of 5 seats each (matching Chamet)
  const row1Seats = Array.from({ length: 5 }, (_, i) => i);
  const row2Seats = Array.from({ length: 5 }, (_, i) => i + 5);
  
  const otherSpeakers = speakers.filter(s => !s.isHost);
  const getSpeakerForPosition = (pos: number) => otherSpeakers.find(s => s.position === pos);

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toLocaleString();
  };

  const handleSendMessage = (message: string) => {
    // Get actual user level from hostInfo or default
    const actualUserLevel = hostInfo?.level || 1;
    const newMessage = {
      message,
    };
    setChatMessages(prev => [...prev, newMessage]);
    
    // 🔥 AWS Comprehend toxic content moderation (background)
    checkToxic(message, { contextType: 'party_room' }).catch(() => {});
  };

  const handleCloseConfirm = () => {
    setShowCloseModal(false);
    onClose();
  };

  const handleBannerClick = (banner: any) => {
    switch (banner.link_type) {
      case 'game':
        onOpenGame?.();
        break;
      case 'pk_battle':
        toast({ title: "⚔️ City PK", description: "PK Battle coming soon!" });
        break;
      case 'event':
        navigate('/leaderboard');
        break;
      default:
        toast({ title: banner.title, description: "Feature coming soon!" });
    }
  };
  
  return (
    <div className="fixed inset-0 flex flex-col z-50 overflow-hidden">
      {/* Luxury Cosmic Background */}
      <div 
        className="absolute inset-0"
        style={{
          background: selectedBackground || backgroundUrl 
            ? `url(${selectedBackground || backgroundUrl})` 
            : 'linear-gradient(180deg, #1a0533 0%, #2d1b69 20%, #4c1d95 40%, #7c3aed 60%, #6d28d9 75%, #1e1b4b 100%)',
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
      />
      {/* Ambient glow effects */}
      <div className="absolute inset-0 pointer-events-none" style={{
      }} />
      
      {/* Starry overlay */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Static stars */}
        {Array.from({ length: 50 }).map((_, i) => (
          <motion.div
            key={`star-${i}`}
            className="absolute w-0.5 h-0.5 bg-white rounded-full"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
            }}
            animate={{
              opacity: [0.3, 1, 0.3],
              scale: [1, 1.5, 1]
            }}
            transition={{
              duration: 2 + Math.random() * 2,
              repeat: Infinity,
              delay: Math.random() * 3
            }}
          />
        ))}
        
        {/* Larger sparkle stars */}
        {Array.from({ length: 15 }).map((_, i) => (
          <motion.div
            key={`sparkle-${i}`}
            className="absolute text-white/60"
            style={{
              fontSize: `${8 + Math.random() * 8}px`
            }}
            animate={{
            }}
            transition={{
            }}
          >
            ✦
          </motion.div>
        ))}

        {/* Shooting stars */}
        <ShootingStar delay={0} />
        <ShootingStar delay={4} />
        <ShootingStar delay={8} />
      </div>

      {/* Floating Hearts */}
      <AnimatePresence>
        {floatingHearts.map((heart) => (
          <motion.div
            key={heart.id}
            initial={{ opacity: 1, y: 0, x: `${heart.x}%`, scale: 0.5 }}
            animate={{ opacity: 0, y: -180, scale: 1.2 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2 }}
            className="absolute bottom-36 pointer-events-none z-50"
          >
            <Heart className="w-7 h-7 text-pink-500 fill-pink-500 drop-shadow-lg" />
          </motion.div>
        ))}
      </AnimatePresence>
      
      {/* Header - Premium Chamet/Bigo Style - Professional Party Room */}
      <header className="relative z-40 px-2 mt-6">
        <div className="flex items-center gap-2">
          {/* Left: Room Info Badge - Dark Glass Premium Style */}
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-1.5"
            style={{
              backdropFilter: 'blur(16px)',
              borderRadius: '22px',
              padding: '3px 12px 3px 3px',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
            }}
          >
            {/* Host Avatar with Frame */}
            {hostInfo && (
              <div 
                onClick={() => navigate(`/profile/${hostInfo.id}`)}
                className="cursor-pointer relative"
              >
                <AvatarWithFrame
                  userId={hostInfo.id}
                  src={hostInfo.avatarUrl}
                  name={hostInfo.displayName}
                  level={hostInfo.level || 1}
                  isHost={true}
                  size="xs"
                  showAnimation={true}
                  showGlow={false}
                />
              </div>
            )}
            
            {/* Room Name - Larger & More Readable */}
            <div className="flex flex-col">
              <span 
                className="text-white text-[11px] font-semibold truncate max-w-[80px]"
                style={{ 
                  textShadow: '0 1px 3px rgba(0,0,0,0.8), 0 0 8px rgba(255,255,255,0.2)',
                  letterSpacing: '0.3px'
                }}
              >
                {roomName}
              </span>
              {/* Beans Display */}
              <div className="flex items-center gap-1 mt-0.5">
                <BeansIcon size={10} />
                <span className="text-yellow-400 text-[9px] font-bold">{formatNumber(totalBeans)}</span>
              </div>
            </div>
          </motion.div>

          {/* Right Side: Stacked Viewers (With Frames) + Viewer Count Badge */}
          <div className="flex items-center gap-2 ml-auto">
            {/* Stacked Viewer Avatars WITH Frames - Exclude Host */}
            {(() => {
              const allViewers = topViewers.length > 0 ? topViewers : viewers;
              // Filter out the host from viewer list
              const filteredViewers = allViewers.filter(v => v.id !== hostInfo?.id);
              const displayViewers = filteredViewers.slice(0, 3);
              if (displayViewers.length === 0) return null;
              return (
                <div className="flex items-center -space-x-2">
                  {displayViewers.map((viewer, idx) => (
                    <motion.div 
                      key={viewer.id}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: idx * 0.05 }}
                      onClick={() => navigate(`/profile/${viewer.id}`)}
                      className="cursor-pointer relative"
                      style={{ zIndex: 10 - idx }}
                    >
                      <AvatarWithFrame
                        userId={viewer.id}
                        src={viewer.avatarUrl}
                        name={viewer.displayName}
                        level={viewer.level || 1}
                        size="xs"
                        showFrame={true}
                        showAnimation={true}
                        showGlow={false}
                      />
                    </motion.div>
                  ))}
                </div>
              );
            })()}

            {/* Viewer Count - Premium Bigo/Chamet Style Badge */}
            <motion.button
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              onClick={() => setShowViewerPanel(true)}
              className="relative flex items-center rounded-full overflow-hidden"
              style={{
              }}
            >
              {/* Eye Icon with subtle glow */}
              <div 
                className="flex items-center justify-center w-5 h-5 rounded-full mr-1"
                style={{
                }}
              >
                <Users className="w-2.5 h-2.5 text-white" />
              </div>
              <span 
                className="text-white text-[11px] font-bold"
                style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}
              >
                {viewerCount}
              </span>
            </motion.button>
          </div>
        </div>
      </header>
      
      {/* Main Content - Luxury Layout with Right-Side Actions */}
      <main className="relative z-10 flex-1 flex overflow-hidden">
        {/* Center: Seat Grid */}
        <div className="flex-1 flex flex-col items-center justify-start pt-12 px-2">
          <div className="flex flex-col items-center gap-4 w-full max-w-md">
            {/* Row 1: Host + 4 seats */}
            <div className="flex items-center justify-center gap-1.5 w-full">
              {hostInfo ? (
                <PremiumHostFrame
                  speaker={hostInfo}
                  onTap={() => navigate(`/profile/${hostInfo.id}`)}
                  isCurrentUser={hostInfo.id === currentUserId}
                />
              ) : (
                <EmptySeat position={0} onTap={() => onRequestSeat(0)} />
              )}
              
              {row1Seats.slice(1).map((pos) => {
                const speaker = getSpeakerForPosition(pos);
                return speaker ? (
                  <OccupiedSeat
                    key={pos}
                    speaker={speaker}
                    position={pos}
                    onTap={() => navigate(`/profile/${speaker.id}`)}
                    isCurrentUser={speaker.id === currentUserId}
                  />
                ) : (
                  <EmptySeat key={pos} position={pos} onTap={() => onRequestSeat(pos)} />
                );
              })}
            </div>

            {/* Row 2: 5 seats */}
            <div className="flex items-center justify-center gap-1.5 w-full">
              {row2Seats.map((pos) => {
                const speaker = getSpeakerForPosition(pos);
                return speaker ? (
                  <OccupiedSeat
                    key={pos}
                    speaker={speaker}
                    position={pos}
                    onTap={() => navigate(`/profile/${speaker.id}`)}
                    isCurrentUser={speaker.id === currentUserId}
                  />
                ) : (
                  <EmptySeat key={pos} position={pos} onTap={() => onRequestSeat(pos)} />
                );
              })}
            </div>
          </div>
        </div>

        {/* Right-Side Floating Action Icons - Like Reference */}
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col items-center gap-3 z-30">
          {/* Stickers / Emoji */}
          <motion.button
            whileTap={{ scale: 0.85 }}
            className="w-11 h-11 rounded-full flex items-center justify-center shadow-lg"
            style={{
            }}
            onClick={() => toast({ title: "😊 Stickers", description: "Coming soon!" })}
          >
            <span className="text-lg">😍</span>
          </motion.button>

          {/* Country / Region */}
          <motion.button
            whileTap={{ scale: 0.85 }}
            className="w-11 h-11 rounded-full flex flex-col items-center justify-center shadow-lg"
            style={{
            }}
          >
            <span className="text-lg">🌍</span>
            <span className="text-white/60 text-[6px] -mt-0.5"></span>
          </motion.button>

          {/* Activity / Ranking */}
          <motion.button
            whileTap={{ scale: 0.85 }}
            onClick={() => navigate('/leaderboard')}
            className="w-11 h-11 rounded-full flex flex-col items-center justify-center shadow-lg"
            style={{
            }}
          >
            <span className="text-[8px] font-bold text-yellow-300">🏆</span>
            <span className="text-white/80 text-[7px] font-medium">Activity</span>
          </motion.button>

          {/* Music */}
          <motion.button
            whileTap={{ scale: 0.85 }}
            onClick={() => setShowMusicPanel(true)}
            className="w-11 h-11 rounded-full flex flex-col items-center justify-center shadow-lg"
            style={{
            }}
          >
            <span className="text-lg">🎵</span>
            <span className="text-white/70 text-[6px]">Music</span>
          </motion.button>
        </div>
      </main>

      {/* Professional floating chat — same compact room style as Live/Party/Private Call */}
      <div className="absolute left-0 right-[56px] z-20 px-3 chat-composer-stable" style={{ bottom: 'calc(var(--kb-h, 0px) + 72px)' }}>
        <div ref={audioRoomChatScroll.scrollRef} className="space-y-1.5 max-h-[34vh] overflow-y-auto overflow-x-hidden pointer-events-auto mb-2 chat-scroll-stable" style={{ WebkitOverflowScrolling: 'touch' }}>
          <AnimatePresence mode="popLayout">
            {chatMessages.slice(-6).map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                <RoomChatBubble
                  id={msg.id}
                  userName={msg.userName}
                  userLevel={msg.userLevel || 1}
                  message={msg.message}
                  type={msg.type === 'join' ? 'join' : msg.type === 'leave' ? 'leave' : msg.type === 'system' ? 'system' : 'message'}
                  isHost={msg.userId === hostInfo?.id}
                  createdAt={msg.timestamp}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        
        {/* Ultra-Compact Premium Chat Input */}
        <form 
          onSubmit={(e) => {
            e.preventDefault();
            if (chatInput.trim()) {
              handleSendMessage(chatInput.trim());
              setChatInput("");
            }
          }}
          className="flex items-center gap-1.5"
        >
          <div 
            className="flex-1 flex items-center gap-1.5 h-8 px-3 rounded-full"
            style={{
              WebkitBackdropFilter: 'blur(16px)',
            }}
          >
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Say something..."
              className="flex-1 bg-transparent text-white text-[11px] placeholder:text-white/35 focus:outline-none"
            />
            <button type="button" className="text-sm opacity-70 hover:opacity-100 transition-opacity">😊</button>
          </div>
          <motion.button
            type="submit"
            disabled={!chatInput.trim()}
            whileTap={{ scale: 0.85 }}
            className="relative w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-30 transition-all overflow-hidden"
          >
            {/* Glow effect */}
            {chatInput.trim() && (
              <div 
                className="absolute inset-0 rounded-full blur-md"
                style={{ background: 'linear-gradient(135deg, #a855f7, #ec4899)' }}
              />
            )}
            {/* Button background */}
            <div 
              className="absolute inset-0 rounded-full"
              style={{
                  ? 'linear-gradient(135deg, #a855f7, #ec4899)' 
                  : 'rgba(255, 255, 255, 0.1)',
                  ? '0 4px 15px rgba(168, 85, 247, 0.5), inset 0 1px 0 rgba(255,255,255,0.2)' 
                  : 'inset 0 1px 0 rgba(255,255,255,0.1)'
              }}
            />
            <Send className="w-4 h-4 text-white relative z-10 rotate-[-35deg]" />
          </motion.button>
        </form>
      </div>

      
      {/* Bottom Bar - Chamet Professional Style */}
      <ChametStyleBottomBar
        onChatClick={() => {}}
        onGameClick={onOpenGame}
        onGiftClick={onOpenGifts}
        onJoinSeatClick={() => setShowViewerPanel(true)}
        onMenuClick={() => {}}
        onCloseClick={() => onClose()}
        onMicToggle={onMicToggle}
        onBackgroundClick={() => setShowBackgroundPanel(true)}
        onLayoutClick={() => setShowLayoutPanel(true)}
        onMessagesClick={() => navigate('/chat')}
        onShareClick={async () => {
          // Use production domain for sharing
          const currentPath = window.location.pathname;
          const roomIdMatch = currentPath.match(/\/party\/([^\/]+)/);
          const currentRoomId = roomIdMatch?.[1] || '';
          
          const { generatePartyRoomLink, shareLink } = await import('@/utils/shareLinks');
          const link = generatePartyRoomLink(currentRoomId);
          const success = await shareLink(link, { title: `Join ${roomName}`, text: 'Join my party room!' });
          if (!success) {
            toast({ title: "📋 Link Copied!", description: "Share link copied to clipboard" });
          }
        }}
        onTasksClick={() => navigate('/tasks')}
        onTopUpClick={() => navigate('/recharge')}
        onMusicClick={() => setShowMusicPanel(true)}
        onSettingsClick={() => setShowSettingsPanel(true)}
        isMuted={isMuted}
        showChat={true}
        unreadMessageCount={0}
        pendingTaskCount={0}
        isHost={isHost}
        isWaitingToJoin={isWaitingForApproval}
        applicantCount={seatRequests.length}
        onJoinRequest={onJoinRequest}
      />


      {/* Viewer Panel */}
      <ChametStyleViewerPanel
        isOpen={showViewerPanel}
        onClose={() => setShowViewerPanel(false)}
        viewers={viewers.length > 0 ? viewers : topViewers.map((v) => ({
          displayName: v.displayName,
          avatarUrl: v.avatarUrl,
          level: v.level,
          countryFlag: '🌍'
        }))}
        applicants={seatRequests.map(r => ({
          user_id: (r as any).user_id, // CRITICAL: Pass user_id for callbacks
          requestedAt: r.requestedAt
        }))}
        isHost={isHost}
        onAcceptApplicant={(id) => onAcceptSeatRequest?.(id)}
        onRejectApplicant={(id) => onRejectSeatRequest?.(id)}
        onInviteViewer={(id) => onInviteViewer?.(id)}
      />

      {/* Background Picker Panel */}
      <BackgroundPickerPanel
        isOpen={showBackgroundPanel}
        onClose={() => setShowBackgroundPanel(false)}
        roomId={roomId || ''}
        isHost={isHost}
        currentBackgroundId={undefined}
        onSelectBackground={(bg) => {
          if (bg?.gradient_css) {
            setSelectedBackground(bg.gradient_css);
          }
          setShowBackgroundPanel(false);
        }}
      />

      {/* Layout Picker Panel */}
      <LayoutPickerPanel
        isOpen={showLayoutPanel}
        onClose={() => setShowLayoutPanel(false)}
        onSelectLayout={(layout) => {
          toast({ title: `Layout: ${layout}`, description: "Layout changed!" });
          setShowLayoutPanel(false);
        }}
        currentLayout="grid-2x5"
      />

      {/* Music Player Panel */}
      <MusicPlayerPanel
        isOpen={showMusicPanel}
        onClose={() => setShowMusicPanel(false)}
        roomId={roomId || ''}
        isHost={isHost}
      />

      {/* Settings Panel - Chamet Style */}
      <ChametStyleSettingsPanel
        isOpen={showSettingsPanel}
        onClose={() => setShowSettingsPanel(false)}
        isCameraOn={isCameraOn}
        onCameraToggle={() => setIsCameraOn(!isCameraOn)}
        isMicOn={!isMuted}
        onMicToggle={onMicToggle}
        isMirrorMode={isMirrorMode}
        onMirrorModeToggle={() => setIsMirrorMode(!isMirrorMode)}
        isFrontCamera={isFrontCamera}
        onSwitchCamera={() => setIsFrontCamera(!isFrontCamera)}
        onBeautyClick={() => {
          setShowSettingsPanel(false);
          toast({ title: "✨ Beauty", description: "Beauty filters opening..." });
        }}
        onStickerClick={() => {
          setShowSettingsPanel(false);
          toast({ title: "😊 Stickers", description: "Sticker panel opening..." });
        }}
      />

      {/* Close Confirmation Modal */}
      <ChametStyleCloseModal
        isOpen={showCloseModal}
        onCancel={() => setShowCloseModal(false)}
        onConfirm={handleCloseConfirm}
        isHost={hostInfo?.id === currentUserId}
      />
    </div>
  );
}

export default ProfessionalAudioRoom;
