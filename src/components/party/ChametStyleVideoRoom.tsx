import { useState, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  X, 
  Users, 
  Gift, 
  MessageCircle, 
  Gamepad2,
  Diamond,
  UserPlus,
  Crown,
  Mic,
  MicOff,
  Eye,
  EyeOff,
  Heart,
  Armchair
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
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
import { hardenVideoElementForNative } from "@/utils/videoNativeHardening";

interface VideoParticipant {
  id: string;
  position: number;
  displayName: string;
  avatarUrl?: string;
  level: number;
  countryFlag?: string;
  giftCount: number;
  beansCount: number;
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
}

interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  userLevel: number;
  message: string;
  type?: 'text' | 'system' | 'join';
  timestamp: Date;
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

interface ChametStyleVideoRoomProps {
  roomName: string;
  roomId: string;
  hostInfo: VideoParticipant | null;
  hostCountryFlag?: string;
  participants: VideoParticipant[];
  maxSeats: number;
  viewerCount: number;
  totalBeans: number;
  currentUserId?: string;
  localStream?: MediaStream | null;
  isHost: boolean;
  isMuted: boolean;
  isVideoOff: boolean;
  onMicToggle: () => void;
  onVideoToggle: () => void;
  onRequestSeat: (position: number) => void;
  onOpenGifts: () => void;
  onOpenChat: () => void;
  onOpenGames: () => void;
  onJoinSeat: () => void;
  onClose: () => void;
  onSwitchCamera?: () => void;
  onBeautyClick?: () => void;
  onStickerClick?: () => void;
  backgroundUrl?: string;
  topViewers?: { id?: string; avatarUrl?: string; level: number; displayName?: string }[];
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
  // Chat messages from parent
  chatMessages?: ChatMessage[];
  onSendChatMessage?: (message: string) => void;
  // Join messages from parent
  joinMessages?: JoinMessage[];
}

const StableStreamVideo = ({
  stream,
  mirror,
}: {
  stream: MediaStream;
  mirror: boolean;
}) => {
  const [remountKey, setRemountKey] = useState(0);
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
      key={`${mediaTrack?.id || 'stream'}-${remountKey}`}
      videoTrack={videoTrack}
      mirror={mirror}
      fit="cover"
      onVideoStalled={() => setRemountKey((value) => value + 1)}
      className="w-full h-full"
    />
  );
};

export function ChametStyleVideoRoom({
  roomName,
  roomId,
  hostInfo,
  hostCountryFlag,
  participants,
  maxSeats,
  viewerCount,
  totalBeans,
  currentUserId,
  localStream,
  isHost,
  isMuted,
  isVideoOff,
  onMicToggle,
  onVideoToggle,
  onRequestSeat,
  onOpenGifts,
  onOpenChat,
  onOpenGames,
  onJoinSeat,
  onClose,
  onSwitchCamera,
  onBeautyClick,
  onStickerClick,
  backgroundUrl,
  topViewers = [],
  getPeerStream,
  seatRequests = [],
  onAcceptSeatRequest,
  onRejectSeatRequest,
  viewers = [],
  onInviteViewer,
  isWaitingForApproval = false,
  chatMessages: externalChatMessages = [],
  onSendChatMessage,
  joinMessages = [],
}: ChametStyleVideoRoomProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [floatingHearts, setFloatingHearts] = useState<number[]>([]);
  const [showChatPanel, setShowChatPanel] = useState(false);
  const [showViewerPanel, setShowViewerPanel] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [showBackgroundPanel, setShowBackgroundPanel] = useState(false);
  const [showLayoutPanel, setShowLayoutPanel] = useState(false);
  const [showMusicPanel, setShowMusicPanel] = useState(false);
  const [isMirrorMode, setIsMirrorMode] = useState(false);
  const [isFrontCamera, setIsFrontCamera] = useState(true);
  const [selectedBackground, setSelectedBackground] = useState<string | null>(null);
  const [selectedLayout, setSelectedLayout] = useState('grid-2x2');
  const [localChatMessages, setLocalChatMessages] = useState<ChatMessage[]>([]);
  
  // Sync joinMessages from parent to local chat
  useEffect(() => {
    if (joinMessages.length > 0) {
      const latestJoin = joinMessages[joinMessages.length - 1];
      const alreadyAdded = localChatMessages.some(m => m.id === latestJoin.id);
      if (!alreadyAdded) {
        setLocalChatMessages(prev => [...prev, {
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
  
  // Combine external and local messages
  const chatMessages = [...externalChatMessages, ...localChatMessages];

  // Dynamic seat grid — supports up to 9 seats (3x3) like Chamet/Bigo video party.
  // Falls back to 4 (2x2) when admin caps the room smaller.
  const totalSeats = Math.max(1, Math.min(maxSeats || 4, 9));
  const seatGrid = Array.from({ length: totalSeats }, (_, i) => {
    if (i === 0 && hostInfo) {
      return { ...hostInfo, position: 0 };
    }
    const participant = participants.find(p => p.position === i);
    return participant || null;
  });

  // Column count: 1→1col, 2→2col, 3-4→2col, 5-9→3col (industry-standard video party grid).
  const gridColsClass =
    totalSeats <= 1 ? 'grid-cols-1' :
    totalSeats <= 4 ? 'grid-cols-2' :
    'grid-cols-3';


  // Add floating heart animation
  const addHeart = () => {
    const id = Date.now();
    setFloatingHearts(prev => [...prev, id]);
    setTimeout(() => {
      setFloatingHearts(prev => prev.filter(h => h !== id));
    }, 2000);
  };

  // Get level-based gradient frame
  const getLevelFrame = (level: number) => {
    if (level >= 50) return { gradient: 'from-purple-600 via-pink-500 to-orange-400', glow: 'purple-500' };
    if (level >= 40) return { gradient: 'from-cyan-400 via-blue-500 to-purple-500', glow: 'cyan-400' };
    if (level >= 30) return { gradient: 'from-yellow-400 via-orange-500 to-red-500', glow: 'yellow-500' };
    if (level >= 20) return { gradient: 'from-green-400 via-emerald-500 to-teal-500', glow: 'green-400' };
    if (level >= 10) return { gradient: 'from-blue-400 via-indigo-500 to-purple-500', glow: 'blue-400' };
    return { gradient: 'from-gray-400 via-gray-500 to-gray-600', glow: 'gray-400' };
  };

  const handleSendMessage = (message: string) => {
    // If parent has handler, use it
    if (onSendChatMessage) {
      onSendChatMessage(message);
    } else {
      // Otherwise add locally
      const newMessage: ChatMessage = {
        id: Date.now().toString(),
        userId: currentUserId || 'guest',
        userName: 'You',
        userLevel: 15,
        message,
        type: 'text',
        timestamp: new Date()
      };
      setLocalChatMessages(prev => [...prev, newMessage]);
    }
  };

  const handleCloseConfirm = () => {
    setShowCloseModal(false);
    onClose();
  };

  const handleBannerClick = (banner: any) => {
    switch (banner.link_type) {
      case 'game':
        onOpenGames();
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
    <div className="fixed inset-0 flex flex-col overflow-hidden">
      {/* Background */}
      <div 
        className="absolute inset-0 bg-gradient-to-br from-purple-900 via-indigo-900 to-blue-900"
        style={backgroundUrl ? { 
          backgroundImage: `url(${backgroundUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        } : undefined}
      >
        <div className="absolute inset-0 bg-black/30" />
      </div>

      {/* Header */}
      <header className="relative z-20 flex items-center justify-between px-3 py-2 safe-area-top">
        <div className="flex items-center gap-2">
          {/* Host Avatar with Frame */}
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
            <div className="flex items-center gap-1 bg-gradient-to-r from-purple-600/80 to-pink-600/80 rounded-full px-3 py-1">
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
            {topViewers.slice(0, 4).map((viewer, i) => (
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
            {topViewers.length === 0 && (
              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                <Users className="w-4 h-4 text-white/40" />
              </div>
            )}
          </button>
          
          {/* Viewer Count Badge */}
          <button
            onClick={() => setShowViewerPanel(true)}
            className="flex items-center gap-1 bg-pink-500/80 rounded-full px-2.5 py-1"
          >
            <Users className="w-3.5 h-3.5 text-white" />
            <span className="text-white text-xs font-bold">{viewerCount}</span>
          </button>
        </div>
      </header>

      {/* Video Grid - 2x2 Layout matching Chamet — fixed equal seat sizes */}
      <main className="relative z-10 flex-1 px-2 py-2">
        <div className={cn("grid gap-1.5 w-full max-w-md mx-auto", gridColsClass)}>
          {seatGrid.map((participant, index) => {
            const isMyself = participant?.id === currentUserId;
            const isEmpty = !participant;
            const streamToUse = isMyself ? localStream : (participant && getPeerStream ? getPeerStream(participant.id) : null);
            const hasVideo = !!streamToUse && !participant?.isVideoOff;

            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.05 }}
                className={cn(
                  "relative overflow-hidden rounded-2xl aspect-square w-full",
                  isEmpty
                    ? "bg-purple-800/40 border border-purple-500/20 cursor-pointer"
                    : ""
                )}
                onClick={() => isEmpty && onRequestSeat(index)}
              >
                {participant ? (
                  <div className="w-full h-full relative">
                    {/* Use unified LiveKitVideoPlayer for better reliability and Android watchdog */}
                    {hasVideo ? (
                      <StableStreamVideo stream={streamToUse!} mirror={isMyself} />
                    ) : (
                      <div
                        className={cn(
                          "absolute inset-0 flex items-center justify-center bg-gradient-to-br from-purple-700/80 to-indigo-800/80 transition-opacity duration-300 pointer-events-none"
                        )}
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
                        />
                      </div>
                    )}

                    {/* Gradient Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent pointer-events-none" />

                    {/* Host Crown Badge */}
                    {participant.isHost && (
                      <div className="absolute top-2 left-2">
                        <div className="w-6 h-6 rounded-full bg-yellow-500 flex items-center justify-center shadow-lg">
                          <Crown className="w-3.5 h-3.5 text-yellow-900" />
                        </div>
                      </div>
                    )}

                    {/* Bean Count - Top Right */}
                    <div className="absolute top-2 right-2">
                      <Badge className="bg-yellow-500/90 text-black text-[10px] px-2 h-5 border-0 font-bold flex items-center gap-1">
                        <BeansIcon size={10} /> {participant.beansCount}
                      </Badge>
                    </div>

                    {/* Bottom Info - Country Flag + Level Stars */}
                    <div className="absolute bottom-0 left-0 right-0 p-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-base">
                          {participant.isHost && hostCountryFlag
                            ? hostCountryFlag
                            : (participant.countryFlag || '🌍')}
                        </span>
                        <span className="text-yellow-300 text-[10px]">
                          {'⭐'.repeat(Math.min(Math.floor(participant.level / 10) + 1, 7))}
                        </span>
                      </div>
                    </div>

                    {/* Speaking Glow Effect */}
                    {participant.isSpeaking && !participant.isMuted && (
                      <motion.div
                        className="absolute inset-0 rounded-2xl pointer-events-none"
                        animate={{
                          boxShadow: [
                            'inset 0 0 0 2px rgba(34, 197, 94, 0.3)',
                            'inset 0 0 0 4px rgba(34, 197, 94, 0.6)',
                            'inset 0 0 0 2px rgba(34, 197, 94, 0.3)'
                          ]
                        }}
                        transition={{ duration: 0.8, repeat: Infinity }}
                      />
                    )}
                  </div>
                ) : (
                  /* Empty Seat - Sofa Icon like Chamet */
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-4">
                    <Armchair className="w-12 h-12 text-purple-400/50" />
                    <span className="text-purple-200/60 text-xs font-medium">Seat {index + 1}</span>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </main>

      {/* Chat Messages Overlay */}
      <div className="relative z-10 px-3 mb-2 max-h-32 overflow-hidden">
        <div className="space-y-1.5">
          {chatMessages.slice(-5).map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className={cn(
                "py-1.5 px-3 rounded-xl max-w-[90%]",
                msg.type === 'system' 
                  ? "bg-purple-900/70 border border-purple-400/20"
                  : msg.type === 'join'
                    ? "bg-gradient-to-r from-green-500/30 to-emerald-500/30 border border-green-400/30"
                    : "bg-black/40"
              )}
            >
              {msg.type === 'system' ? (
                <p className="text-purple-200/90 text-xs leading-relaxed">{msg.message}</p>
              ) : msg.type === 'join' ? (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge className={cn(
                    "text-white text-[8px] px-1.5 h-4 border-0",
                    msg.userLevel >= 50 ? "bg-gradient-to-r from-amber-500 to-red-500" :
                    msg.userLevel >= 30 ? "bg-gradient-to-r from-yellow-500 to-orange-500" :
                    msg.userLevel >= 20 ? "bg-gradient-to-r from-pink-500 to-purple-500" :
                    msg.userLevel >= 10 ? "bg-gradient-to-r from-cyan-500 to-blue-500" :
                    "bg-gradient-to-r from-purple-500 to-indigo-500"
                  )}>
                    ✦Lv{msg.userLevel}
                  </Badge>
                  <span className="text-green-400 font-semibold text-xs">{msg.userName}</span>
                  <span className="text-green-300/90 text-xs">{msg.message}</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge className="bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-[8px] px-1.5 h-4 border-0">
                    ✦Lv{msg.userLevel}
                  </Badge>
                  <span className="text-pink-400 font-semibold text-xs">{msg.userName}</span>
                  <span className="text-white/90 text-xs">{msg.message}</span>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </div>


      {/* Floating Hearts */}
      <AnimatePresence>
        {floatingHearts.map((id) => (
          <motion.div
            key={id}
            initial={{ opacity: 1, y: 0, x: Math.random() * 60 - 30, scale: 0.5 }}
            animate={{ opacity: 0, y: -150, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2 }}
            className="absolute bottom-32 right-16 pointer-events-none z-30"
          >
            <Heart className="w-6 h-6 text-pink-500 fill-pink-500" />
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Bottom Bar - Chamet Professional Style */}
      <ChametStyleBottomBar
        onChatClick={() => setShowChatPanel(true)}
        onGameClick={onOpenGames}
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
          const success = await shareLink(link, { 
            title: `Join ${roomName}`, 
            text: 'Come join my party room!'
          });
          if (!success) {
            toast({ title: "📋 Link Copied!", description: "Party room link copied to clipboard." });
          }
        }}
        onTasksClick={() => navigate('/tasks')}
        onTopUpClick={() => navigate('/recharge')}
        onMusicClick={() => setShowMusicPanel(true)}
        onSettingsClick={() => setShowSettingsPanel(true)}
        onJoinRequest={() => {
          onJoinSeat();
        }}
        isMuted={isMuted}
        showChat={true}
        unreadMessageCount={0}
        pendingTaskCount={0}
        isHost={isHost}
        isWaitingToJoin={isWaitingForApproval}
        applicantCount={seatRequests.length}
      />

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
        viewers={viewers.length > 0 ? viewers : topViewers.map((v, i) => ({
          id: v.id || `viewer-${i}`,
          displayName: v.displayName || `Viewer ${i + 1}`,
          avatarUrl: v.avatarUrl,
          level: v.level,
          countryFlag: '🌍'
        }))}
        applicants={seatRequests}
        isHost={isHost}
        onAcceptApplicant={(id) => {
          // Call parent's accept handler
          if (onAcceptSeatRequest) {
            onAcceptSeatRequest(id);
          }
        }}
        onRejectApplicant={(id) => {
          // Call parent's reject handler
          if (onRejectSeatRequest) {
            onRejectSeatRequest(id);
          }
        }}
        onInviteViewer={(id) => {
          if (onInviteViewer) {
            onInviteViewer(id);
          }
        }}
      />

      {/* Settings Panel - Chamet Style */}
      <ChametStyleSettingsPanel
        isOpen={showSettingsPanel}
        onClose={() => setShowSettingsPanel(false)}
        isCameraOn={!isVideoOff}
        onCameraToggle={onVideoToggle}
        isMicOn={!isMuted}
        onMicToggle={onMicToggle}
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

      {/* Background Picker Panel */}
      <BackgroundPickerPanel
        isOpen={showBackgroundPanel}
        onClose={() => setShowBackgroundPanel(false)}
        roomId={roomId || ''}
        isHost={true}
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
        currentLayout={selectedLayout}
        onSelectLayout={(layout) => {
          setSelectedLayout(layout);
          setShowLayoutPanel(false);
          toast({ title: "✅ Layout Changed", description: `Layout set to ${layout}` });
        }}
      />

      {/* Music Player Panel */}
      <MusicPlayerPanel
        isOpen={showMusicPanel}
        onClose={() => setShowMusicPanel(false)}
        roomId={roomId || ''}
        isHost={true}
      />

      {/* Close Confirmation Modal */}
      <ChametStyleCloseModal
        isOpen={showCloseModal}
        onCancel={() => setShowCloseModal(false)}
        onConfirm={handleCloseConfirm}
        isHost={isHost}
      />
    </div>
  );
}
