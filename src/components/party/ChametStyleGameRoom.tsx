import { useState, useEffect, useMemo } from "react";
import { GiftComboTracker } from "@/components/live/GiftComboTracker";
import { motion, AnimatePresence } from "framer-motion";
import { 
  X, 
  Gift, 
  LayoutGrid, 
  Crown,
  Eye,
  EyeOff,
  Armchair,
  Users,
  Diamond,
  HelpCircle,
  BarChart3,
  Power,
  Minus,
  Plus,
  Hand
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { hardenVideoElementForNative } from "@/utils/videoNativeHardening";
import { ChametStyleBottomBar } from "./ChametStyleBottomBar";
import { ChametStyleChatPanel } from "./ChametStyleChatPanel";
import { ChametStyleViewerPanel } from "./ChametStyleViewerPanel";
import { ChametStyleCloseModal } from "./ChametStyleCloseModal";
import { ChametStyleSettingsPanel } from "./ChametStyleSettingsPanel";
import { BackgroundPickerPanel } from "./BackgroundPickerPanel";
import { LayoutPickerPanel } from "./LayoutPickerPanel";
import { MusicPlayerPanel } from "./MusicPlayerPanel";
import BeansIcon from "@/components/common/BeansIcon";
import AvatarWithFrame from "@/components/common/AvatarWithFrame";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { LiveKitVideoPlayer } from "@/components/live/LiveKitVideoPlayer";
import { LiveGameBoard } from "@/components/games/LiveGameBoard";

interface GameParticipant {
  id: string;
  position: number;
  displayName: string;
  avatarUrl?: string;
  level: number;
  countryFlag?: string;
  beansCount: number;
  isHost?: boolean;
  stream?: MediaStream | null;
  isVideoOff?: boolean;
}

interface GameInfo {
  id: string;
  name: string;
  icon: string;
  playerCount: number;
  totalBet: number;
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

interface ChametStyleGameRoomProps {
  roomName: string;
  roomId: string;
  hostInfo: GameParticipant | null;
  hostCountryFlag?: string;
  participants: GameParticipant[];
  viewerCount: number;
  totalBeans: number;
  currentUserId?: string;
  localStream?: MediaStream | null;
  isHost: boolean;
  isMuted?: boolean;
  isVideoOff: boolean;
  onVideoToggle: () => void;
  onMicToggle?: () => void;
  onRequestSeat: (position: number) => void;
  onOpenGifts: () => void;
  onClose: () => void;
  onJoinRequest?: () => void;
  onSwitchCamera?: () => void;
  onBeautyClick?: () => void;
  onStickerClick?: () => void;
  userDiamonds?: number;
  activeGame?: GameInfo | null;
  getPeerStream?: (userId: string) => MediaStream | null;
  // Real seat requests from database
  seatRequests?: SeatApplicant[];
  onAcceptSeatRequest?: (userId: string) => void;
  onRejectSeatRequest?: (userId: string) => void;
  // Real viewers (audience)
  viewers?: Viewer[];
  onInviteViewer?: (userId: string) => void;
  // Current user waiting status
  isWaitingForApproval?: boolean;
  // Join messages from parent
  joinMessages?: JoinMessage[];
}

const StableGameStreamVideo = ({
  stream,
  mirror,
}: {
  stream: MediaStream;
  mirror: boolean;
}) => {
  const mediaTrack = stream.getVideoTracks().find((track) => track.readyState === 'live' && track.enabled !== false) ?? null;
  const videoTrack = useMemo(() => {
    if (!mediaTrack) return null;
    return {
      mediaStreamTrack: mediaTrack,
      attach: (el: HTMLVideoElement) => {
        el.srcObject = new MediaStream([mediaTrack]);
        return el;
      },
      detach: (el: HTMLVideoElement) => {
        el.srcObject = null;
        return el;
      }
    } as any;
  }, [mediaTrack?.id]);

  if (!videoTrack) return null;
  return (
    <LiveKitVideoPlayer
      videoTrack={videoTrack}
      mirror={mirror}
      className="w-full h-full"
    />
  );
};

// Game Overlay Component - Lucky 28 Style
const Lucky28GameOverlay = ({
  playerCount,
  totalBet,
  userDiamonds,
  onClose
}: {
  playerCount: number;
  totalBet: number;
  userDiamonds: number;
  onClose: () => void;
}) => {
  const [betAmount, setBetAmount] = useState(0);
  const [selectedBet, setSelectedBet] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(4);
  const [slotValues] = useState([0, 0, 0]);

  const betOptions = [
    { id: 'small', label: 'S', name: 'Small' },
    { id: 'big', label: 'B', name: 'Big' },
    { id: 'even', label: 'E', name: 'Even' },
    { id: 'odd', label: 'O', name: 'Odd' },
  ];

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
    return num.toString();
  };

  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", damping: 25, stiffness: 300 }}
      className="absolute bottom-0 left-0 right-0 z-30"
      style={{ height: "55%" }}
    >
      {/* Game Container */}
      <div className="h-full bg-gradient-to-b from-purple-900 via-purple-800 to-indigo-900 rounded-t-3xl overflow-hidden relative">
        {/* Decorative rays */}
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200%] h-[200%]">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="absolute top-1/2 left-1/2 w-1 h-[50%] bg-gradient-to-t from-purple-500/0 via-purple-400/20 to-purple-300/0"
                style={{
                  transform: `rotate(${i * 30}deg)`,
                  transformOrigin: 'bottom center'
                }}
              />
            ))}
          </div>
        </div>

        {/* Header */}
        <div className="relative z-10 flex items-center justify-between px-4 py-3 border-b border-purple-500/30">
          {/* Left: Player count & total bet */}
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5 text-white/80 text-xs">
              <Users className="w-3.5 h-3.5 text-yellow-400" />
              <span>{playerCount}</span>
            </div>
            <div className="flex items-center gap-1.5 text-white/80 text-xs">
              <Diamond className="w-3.5 h-3.5 text-yellow-400" />
              <span>{formatNumber(totalBet)}</span>
            </div>
          </div>

          {/* Center: Game Title */}
          <div className="absolute left-1/2 -translate-x-1/2">
            <motion.div
              animate={{ scale: [1, 1.02, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="text-center"
            >
              <span className="text-2xl font-black bg-gradient-to-b from-yellow-300 via-yellow-400 to-orange-500 bg-clip-text text-transparent drop-shadow-lg"
                style={{ textShadow: '0 2px 10px rgba(234, 179, 8, 0.5)' }}>
                Lucky
              </span>
              <span className="text-3xl font-black bg-gradient-to-b from-yellow-300 via-yellow-400 to-orange-500 bg-clip-text text-transparent drop-shadow-lg ml-1"
                style={{ textShadow: '0 2px 10px rgba(234, 179, 8, 0.5)' }}>
                28
              </span>
            </motion.div>
          </div>

          {/* Right: User diamonds */}
          <div className="flex items-center gap-2 bg-black/30 rounded-full px-3 py-1.5">
            <Diamond className="w-4 h-4 text-yellow-400" />
            <span className="text-white font-bold text-sm">{formatNumber(userDiamonds)}</span>
            <button className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
              <Plus className="w-3 h-3 text-white" />
            </button>
          </div>
        </div>

        {/* Slot Machine Area */}
        <div className="relative z-10 flex flex-col items-center py-4">
          {/* Info buttons */}
          <div className="flex items-center justify-between w-full px-4 mb-2">
            <div className="flex gap-2">
              <button className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                <HelpCircle className="w-4 h-4 text-white/70" />
              </button>
              <button className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                <BarChart3 className="w-4 h-4 text-white/70" />
              </button>
            </div>
            <button className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
              <Power className="w-4 h-4 text-white/70" />
            </button>
          </div>

          {/* Slot display */}
          <div className="relative">
            {/* Golden frame */}
            <div className="absolute -inset-2 rounded-2xl border-4 border-yellow-500/50 bg-gradient-to-b from-yellow-600/20 to-orange-600/20" />
            
            {/* Slots */}
            <div className="relative flex gap-2 bg-gradient-to-b from-gray-100 to-gray-300 rounded-xl p-3 shadow-inner">
              {slotValues.map((value, i) => (
                <motion.div
                  key={i}
                  className="w-16 h-20 bg-white rounded-lg shadow-lg flex items-center justify-center border-2 border-gray-200"
                  animate={{ y: [0, -2, 0] }}
                  transition={{ duration: 0.5, delay: i * 0.1, repeat: Infinity, repeatDelay: 2 }}
                >
                  <span className="text-4xl font-black text-red-500">{value}</span>
                </motion.div>
              ))}
            </div>

            {/* Side arrows */}
            <div className="absolute left-0 top-1/2 -translate-x-6 -translate-y-1/2 text-yellow-400 text-2xl">›</div>
            <div className="absolute right-0 top-1/2 translate-x-6 -translate-y-1/2 text-yellow-400 text-2xl">‹</div>
          </div>

          {/* Countdown */}
          <div className="mt-3 text-pink-400 font-bold text-lg">{countdown}s</div>
        </div>

        {/* Bet Options */}
        <div className="relative z-10 flex justify-center gap-3 px-4 py-3">
          {betOptions.map((option) => (
            <motion.button
              key={option.id}
              whileTap={{ scale: 0.95 }}
              onClick={() => setSelectedBet(option.id)}
              className={cn(
                "flex-1 py-4 rounded-xl font-bold text-xl flex flex-col items-center gap-1 transition-all",
                selectedBet === option.id
                  ? "bg-gradient-to-b from-purple-400 to-purple-600 text-white shadow-lg shadow-purple-500/50 ring-2 ring-purple-300"
                  : "bg-gradient-to-b from-purple-600/80 to-purple-800/80 text-white/90 hover:from-purple-500 hover:to-purple-700"
              )}
            >
              <span className="text-2xl">{option.label}</span>
              <span className="text-[10px] font-normal opacity-70">{option.name}</span>
            </motion.button>
          ))}
        </div>

        {/* Mode selector */}
        <div className="flex justify-center py-2">
          <button className="flex items-center gap-2 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-full px-4 py-1.5 text-white font-semibold text-sm shadow-lg">
            Basic
            <span className="text-lg">🔄</span>
          </button>
        </div>

        {/* Bet Controls */}
        <div className="relative z-10 flex items-center justify-between px-4 py-3 bg-gradient-to-t from-indigo-950 to-transparent">
          {/* Bet amount */}
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setBetAmount(Math.max(0, betAmount - 10))}
              className="w-10 h-10 rounded-lg bg-gradient-to-b from-yellow-500 to-amber-600 flex items-center justify-center shadow-lg"
            >
              <Minus className="w-5 h-5 text-white" />
            </button>
            <div className="flex items-center gap-1 bg-gradient-to-r from-yellow-600/30 to-amber-600/30 rounded-lg px-4 py-2">
              <Diamond className="w-4 h-4 text-yellow-400" />
              <span className="text-white font-bold text-lg min-w-[60px] text-center">{betAmount}</span>
            </div>
            <button 
              onClick={() => setBetAmount(betAmount + 10)}
              className="w-10 h-10 rounded-lg bg-gradient-to-b from-yellow-500 to-amber-600 flex items-center justify-center shadow-lg"
            >
              <Plus className="w-5 h-5 text-white" />
            </button>
          </div>

          {/* Play button */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            className="flex-1 ml-3 py-3 rounded-xl bg-gradient-to-b from-yellow-600 via-yellow-700 to-amber-800 text-white font-bold text-xl shadow-xl"
            style={{ 
              boxShadow: '0 4px 15px rgba(202, 138, 4, 0.4), inset 0 1px 0 rgba(255,255,255,0.2)'
            }}
          >
            Play
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
};

export function ChametStyleGameRoom({
  roomName,
  roomId,
  hostInfo,
  hostCountryFlag,
  participants,
  viewerCount,
  totalBeans,
  currentUserId,
  localStream,
  isHost,
  isMuted = false,
  isVideoOff,
  onVideoToggle,
  onMicToggle,
  onRequestSeat,
  onOpenGifts,
  onClose,
  onJoinRequest,
  onSwitchCamera,
  onBeautyClick,
  onStickerClick,
  userDiamonds = 5030,
  activeGame,
  getPeerStream,
  seatRequests = [],
  onAcceptSeatRequest,
  onRejectSeatRequest,
  viewers = [],
  onInviteViewer,
  isWaitingForApproval = false,
  joinMessages = [],
}: ChametStyleGameRoomProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [showChatPanel, setShowChatPanel] = useState(false);
  const [showViewerPanel, setShowViewerPanel] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [showGame, setShowGame] = useState(true);
  const [isMirrorMode, setIsMirrorMode] = useState(false);
  const [isFrontCamera, setIsFrontCamera] = useState(true);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  
  // Sync joinMessages from parent to local chat
  useEffect(() => {
    if (joinMessages.length > 0) {
      const latestJoin = joinMessages[joinMessages.length - 1];
      const alreadyAdded = chatMessages.some(m => m.id === latestJoin.id);
      if (!alreadyAdded) {
        setChatMessages(prev => [...prev, {
          id: latestJoin.id,
          userId: latestJoin.userId,
          userName: latestJoin.userName,
          userLevel: latestJoin.userLevel,
          message: latestJoin.type === 'join' ? 'joined the room 🎉' : 'left the room',
          type: 'join' as const,
          timestamp: latestJoin.timestamp
        }]);
      }
    }
  }, [joinMessages]);

  // Create 4 seat grid positions (2x2) like Chamet game room
  const seatGrid = Array.from({ length: 4 }, (_, i) => {
    if (i === 0 && hostInfo) {
      return { ...hostInfo, position: 0 };
    }
    const participant = participants.find(p => p.position === i);
    return participant || null;
  });

  const handleSendMessage = (message: string) => {
    const newMessage = {
      message,
    };
    setChatMessages(prev => [...prev, newMessage]);
  };

  const handleCloseConfirm = () => {
    setShowCloseModal(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-purple-900 via-indigo-900 to-blue-900" />

      {/* Header */}
      <header className="relative z-20 flex items-center justify-between px-3 py-2 safe-area-top">
        <div className="flex items-center gap-2">
          {hostInfo && (
            <div className="relative">
              <AvatarWithFrame
                userId={hostInfo.id}
                src={hostInfo.avatarUrl}
                name={hostInfo.displayName}
                level={hostInfo.level}
                isHost={true}
                size="sm"
                showAnimation={true}
                showGlow={true}
              />
            </div>
          )}
          <div className="flex flex-col">
            <div className="flex items-center gap-1 bg-gradient-to-r from-purple-600/80 to-pink-600/80 backdrop-blur-sm rounded-full px-3 py-1">
              <span className="text-white font-bold text-sm truncate max-w-[100px]">{roomName}</span>
            </div>
            <div className="flex items-center gap-1 text-white/70 text-xs mt-0.5">
              <BeansIcon size={12} />
              <span className="text-yellow-400">{totalBeans}</span>
            </div>
          </div>
        </div>

        {/* Right Side - Viewer Avatars with Frames + Count */}
        <div className="flex items-center gap-2">
          {/* Viewer Avatars - Stacked with Frames */}
          <button
            onClick={() => setShowViewerPanel(true)}
            className="flex items-center -space-x-2"
          >
            {viewers.slice(0, 4).map((viewer, i) => (
              <div 
                key={viewer.id}
                className="relative"
                style={{ zIndex: 4 - i }}
              >
                <AvatarWithFrame
                  userId={viewer.id}
                  src={viewer.avatarUrl}
                  name={viewer.displayName}
                  level={viewer.level}
                  size="xs"
                  showAnimation={false}
                  showFrame={true}
                  showGlow={false}
                />
              </div>
            ))}
            {viewers.length === 0 && (
              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                <Users className="w-4 h-4 text-white/40" />
              </div>
            )}
          </button>
          
          {/* Viewer Count Badge */}
          <button
            onClick={() => setShowViewerPanel(true)}
            className="flex items-center gap-1 bg-pink-500/80 backdrop-blur-sm rounded-full px-2.5 py-1"
          >
            <Users className="w-3.5 h-3.5 text-white" />
            <span className="text-white text-xs font-bold">{viewerCount}</span>
          </button>
        </div>
      </header>

      {/* Video Grid - 2x2 at top when game is active */}
      <main className="relative z-10 flex-1 px-2 py-2">
        <div className={cn(
          "grid grid-cols-2 gap-1.5 transition-all",
          showGame ? "h-[40vh]" : "h-[55vh] grid-rows-2"
        )}>
          {seatGrid.map((participant, index) => {
            const isMyself = participant?.id === currentUserId;
            const isEmpty = !participant;
            const streamToUse = isMyself ? localStream : (participant && getPeerStream ? getPeerStream(participant.id) : null);

            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.05 }}
                className={cn(
                  "relative overflow-hidden rounded-2xl",
                  isEmpty 
                    ? "bg-purple-800/40 backdrop-blur-sm border border-purple-500/20 cursor-pointer"
                    : ""
                )}
                onClick={() => isEmpty && onRequestSeat(index)}
              >
                {participant ? (
                  <div className="w-full h-full relative">
                    {/* Video Feed via unified LiveKitVideoPlayer */}
                    {streamToUse && !participant.isVideoOff ? (
                      <StableGameStreamVideo stream={streamToUse} mirror={isMyself} />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-purple-700/80 to-indigo-800/80 transition-opacity duration-300 pointer-events-none">
                        <AvatarWithFrame
                          userId={participant.id}
                          src={participant.avatarUrl}
                          name={participant.displayName}
                          level={participant.level}
                          isHost={participant.isHost}
                          size="md"
                          showAnimation={true}
                          showGlow={true}
                        />
                      </div>
                    )}

                    {/* Gradient Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />

                    {/* Host Crown Badge */}
                    {participant.isHost && (
                      <div className="absolute top-2 left-2">
                        <div className="w-6 h-6 rounded-full bg-yellow-500 flex items-center justify-center shadow-lg">
                          <Crown className="w-3.5 h-3.5 text-yellow-900" />
                        </div>
                      </div>
                    )}

                    {/* Bean Count */}
                    <div className="absolute top-2 right-2">
                      <Badge className="bg-yellow-500/90 text-black text-[10px] px-2 h-5 border-0 font-bold flex items-center gap-1">
                        <BeansIcon size={10} /> {participant.beansCount}
                      </Badge>
                    </div>

                    {/* Bottom Info */}
                    <div className="absolute bottom-0 left-0 right-0 p-2">
                      <div className="flex items-center gap-1.5">
                        {participant.countryFlag && (
                          <span className="text-base">{participant.countryFlag}</span>
                        )}
                        <span className="text-yellow-300 text-[10px]">
                          {'⭐'.repeat(Math.min(Math.floor(participant.level / 10) + 1, 7))}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Armchair className="w-10 h-10 text-purple-400/50" />
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>

        {/* Floating Chat Messages - Same as Audio Room */}
        <div className="absolute bottom-[140px] left-0 right-0 z-20 px-3">
          <div className="space-y-1 max-h-28 overflow-hidden pointer-events-none mb-2">
            <AnimatePresence mode="popLayout">
              {chatMessages.slice(-5).map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, x: -30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                >
                  {msg.type === 'system' ? (
                    <div className="inline-flex items-center py-1 px-2.5 rounded-full bg-black/30 backdrop-blur-sm w-fit">
                      <span className="text-purple-200/90 text-[10px]">🔔 {msg.message}</span>
                    </div>
                  ) : msg.type === 'join' ? (
                    <div className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-full bg-gradient-to-r from-green-500/30 to-emerald-500/30 backdrop-blur-sm w-fit border border-green-400/30">
                      <span 
                        className="inline-flex items-center h-4 px-1.5 rounded text-[8px] font-bold text-white shadow-sm"
                        style={{
                          background: msg.userLevel >= 50 
                            ? 'linear-gradient(135deg, #f59e0b, #ef4444)' 
                            : msg.userLevel >= 30 
                              ? 'linear-gradient(135deg, #fbbf24, #f97316)' 
                              : msg.userLevel >= 20 
                                ? 'linear-gradient(135deg, #ec4899, #a855f7)'
                                : msg.userLevel >= 10
                                  ? 'linear-gradient(135deg, #06b6d4, #3b82f6)'
                                  : 'linear-gradient(135deg, #8b5cf6, #6366f1)'
                        }}
                      >
                        Lv{msg.userLevel}
                      </span>
                      <span className="text-green-300 font-semibold text-[11px]">{msg.userName}</span>
                      <span className="text-green-200/80 text-[10px]">{msg.message}</span>
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-1 py-1 px-2 rounded-lg bg-black/35 backdrop-blur-sm w-fit">
                      <span 
                        className="inline-flex items-center h-4 px-1.5 rounded text-[8px] font-bold text-white shadow-sm"
                        style={{
                            ? 'linear-gradient(135deg, #f59e0b, #ef4444)' 
                            : msg.userLevel >= 30 
                              ? 'linear-gradient(135deg, #fbbf24, #f97316)' 
                              : msg.userLevel >= 20 
                                ? 'linear-gradient(135deg, #ec4899, #a855f7)'
                                : msg.userLevel >= 10
                                  ? 'linear-gradient(135deg, #06b6d4, #3b82f6)'
                                  : 'linear-gradient(135deg, #8b5cf6, #6366f1)'
                        }}
                      >
                        Lv{msg.userLevel}
                      </span>
                      <span className="text-pink-300 font-semibold text-[11px]">{msg.userName}</span>
                      <span className="text-white/90 text-[11px]">{msg.message}</span>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* Mini Control Bar - Shows when game is active */}
        {showGame && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute right-2 top-[42vh] flex gap-2 z-20"
          >

            {/* Join Now / Waiting Button - Only for visitors */}
            {!isHost && (
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => {
                  if (!isWaitingForApproval) {
                    onJoinRequest?.();
                  }
                }}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg transition-all",
                  isWaitingForApproval
                    ? "bg-gradient-to-r from-amber-400 via-orange-500 to-amber-600 shadow-orange-500/40"
                    : "bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 shadow-blue-500/40"
                )}
              >
                {isWaitingForApproval ? (
                  <>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                      className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
                    />
                    <span className="text-white font-bold text-sm">Waiting...</span>
                  </>
                ) : (
                  <>
                    <Hand className="w-5 h-5 text-white" />
                    <span className="text-white font-bold text-sm">Join Now</span>
                  </>
                )}
              </motion.button>
            )}

            {/* Gift Button */}
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={onOpenGifts}
              className="w-11 h-11 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center shadow-lg shadow-pink-500/30"
            >
              <Gift className="w-5 h-5 text-white" />
            </motion.button>

            {/* More Options */}
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => setShowMoreMenu(true)}
              className="relative w-11 h-11 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/20"
            >
              <LayoutGrid className="w-5 h-5 text-white" />
              <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full" />
            </motion.button>

            {/* Close */}
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => onClose()}
              className="w-11 h-11 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/20"
            >
              <X className="w-5 h-5 text-white" />
            </motion.button>
          </motion.div>
        )}
      </main>

      {/* Bottom Bar - Chamet Professional Style - Always visible */}
      <ChametStyleBottomBar
        onChatClick={() => setShowChatPanel(true)}
        onGameClick={() => setShowGame(true)}
        onGiftClick={onOpenGifts}
        onJoinSeatClick={() => setShowViewerPanel(true)}
        onMenuClick={() => setShowMoreMenu(true)}
        onCloseClick={() => onClose()}
        onMicToggle={onMicToggle}
        onBackgroundClick={() => toast({ title: "Background", description: "Coming soon!" })}
        onLayoutClick={() => toast({ title: "Layout", description: "Coming soon!" })}
        onMessagesClick={() => navigate('/chat')}
        onShareClick={async () => {
          // Use production domain for sharing
          const currentPath = window.location.pathname;
          const roomIdMatch = currentPath.match(/\/party\/([^\/]+)/);
          const currentRoomId = roomIdMatch?.[1] || '';
          
          const { generatePartyRoomLink, shareLink } = await import('@/utils/shareLinks');
          const link = generatePartyRoomLink(currentRoomId);
          const success = await shareLink(link, { 
            title: `Join ${roomName}`, 
            text: 'Join my game room!'
          });
          if (!success) {
            toast({ title: "📋 Link Copied!", description: "Share link copied to clipboard" });
          }
        }}
        onTasksClick={() => navigate('/tasks')}
        onTopUpClick={() => navigate('/recharge')}
        onMusicClick={() => toast({ title: "Music", description: "Coming soon!" })}
        onSettingsClick={() => setShowSettingsPanel(true)}
        onJoinRequest={() => {
          if (!isWaitingForApproval) {
            onJoinRequest?.();
          }
        }}
        isMuted={isMuted}
        showChat={true}
        unreadMessageCount={0}
        pendingTaskCount={0}
        isHost={isHost}
        isWaitingToJoin={isWaitingForApproval}
        applicantCount={seatRequests.length}
      />

      {/* Game Overlay - Dynamic using LiveGameBoard - Full height for mobile */}
      <AnimatePresence>
        {showGame && activeGame && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 z-40 rounded-t-3xl overflow-hidden"
            style={{ 
              height: "70%",
              maxHeight: "calc(100vh - 80px)",
              paddingBottom: 'env(safe-area-inset-bottom)'
            }}
          >
            {/* Handle */}
            <div 
              className="flex justify-center pt-2 pb-1 cursor-pointer"
              onClick={() => setShowGame(false)}
            >
              <motion.div 
                className="w-12 h-1.5 bg-white/30 rounded-full"
                whileHover={{ scale: 1.1, backgroundColor: 'rgba(255,255,255,0.5)' }}
              />
            </div>
            
            {/* Live Game Board - Scrollable */}
            <div className="h-[calc(100%-20px)] overflow-y-auto overflow-x-hidden px-2 pb-4 scrollbar-hide">
              <LiveGameBoard 
                selectedGame={activeGame.id}
                roomId={roomId}
                onClose={() => setShowGame(false)}
                onOpenGifts={onOpenGifts}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* More Options Menu */}
      <AnimatePresence>
        {showMoreMenu && (
          <ChametStyleBottomBar
            onChatClick={() => {
              setShowMoreMenu(false);
              setShowChatPanel(true);
            }}
            onGiftClick={() => {
              setShowMoreMenu(false);
              onOpenGifts();
            }}
            onCloseClick={() => setShowMoreMenu(false)}
            onBackgroundClick={() => toast({ title: "Background", description: "Coming soon!" })}
            onLayoutClick={() => toast({ title: "Layout", description: "Coming soon!" })}
            onMessagesClick={() => navigate('/chat')}
            onShareClick={() => navigator.share?.({ title: roomName, url: window.location.href })}
            onTasksClick={() => navigate('/tasks')}
            onTopUpClick={() => navigate('/recharge')}
            onMusicClick={() => toast({ title: "Music", description: "Coming soon!" })}
            onSettingsClick={() => {
              setShowMoreMenu(false);
              setShowSettingsPanel(true);
            }}
            showChat={false}
            unreadMessageCount={0}
            pendingTaskCount={0}
          />
        )}
      </AnimatePresence>

      {/* Chat Panel */}
      <ChametStyleChatPanel
        isOpen={showChatPanel}
        onClose={() => setShowChatPanel(false)}
        messages={chatMessages}
        onSendMessage={handleSendMessage}
        currentUserId={currentUserId}
      />

      {/* Viewer Panel - Now using real data from props */}
      <ChametStyleViewerPanel
        isOpen={showViewerPanel}
        onClose={() => setShowViewerPanel(false)}
        viewers={viewers}
        applicants={seatRequests}
        isHost={isHost}
        onAcceptApplicant={(id) => {
          if (onAcceptSeatRequest) onAcceptSeatRequest(id);
        }}
        onRejectApplicant={(id) => {
          if (onRejectSeatRequest) onRejectSeatRequest(id);
        }}
        onInviteViewer={(id) => {
          if (onInviteViewer) onInviteViewer(id);
        }}
      />

      {/* Settings Panel - Chamet Style */}
      <ChametStyleSettingsPanel
        isOpen={showSettingsPanel}
        onClose={() => setShowSettingsPanel(false)}
        isCameraOn={!isVideoOff}
        onCameraToggle={onVideoToggle}
        isMicOn={!isMuted}
        onMicToggle={onMicToggle || (() => {})}
        isMirrorMode={isMirrorMode}
        onMirrorModeToggle={() => setIsMirrorMode(!isMirrorMode)}
        isFrontCamera={isFrontCamera}
        onSwitchCamera={() => {
          setIsFrontCamera(!isFrontCamera);
          onSwitchCamera?.();
        }}
        onBeautyClick={() => {
          setShowSettingsPanel(false);
          if (onBeautyClick) {
            onBeautyClick();
          } else {
            toast({ title: "✨ Beauty", description: "Beauty filters opening..." });
          }
        }}
        onStickerClick={() => {
          setShowSettingsPanel(false);
          if (onStickerClick) {
            onStickerClick();
          } else {
            toast({ title: "😊 Stickers", description: "Sticker panel opening..." });
          }
        }}
      />

      {/* Close Confirmation Modal */}
      <ChametStyleCloseModal
        isOpen={showCloseModal}
        onCancel={() => setShowCloseModal(false)}
        onConfirm={handleCloseConfirm}
        isHost={isHost}
      />

      {/* Pkg-audit Phase 17: Chamet/Bigo-style edge combo counter. */}
      {roomId && <GiftComboTracker scope="party" id={roomId} receiverName="Game Party" />}
    </div>
  );
}

export default ChametStyleGameRoom;
