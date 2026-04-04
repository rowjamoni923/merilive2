import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { 
  Gamepad2, 
  Gift, 
  MessageSquare, 
  Settings,
  Users,
  Sparkles,
  X,
  Loader2,
  Mic,
  MicOff,
  Eye,
  EyeOff,
  Heart,
  Share2,
  Volume2,
  VolumeX,
  Crown,
  Star
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { GameFooterNew } from "@/components/games/GameFooterNew";
import { supabase } from "@/integrations/supabase/client";

interface GameInfo {
  id: string;
  name: string;
  emoji: string;
  color: string;
  isLive?: boolean;
  players?: number;
}

interface AdvancedPartyBottomBarProps {
  onOpenGifts: () => void;
  onOpenChat: () => void;
  onOpenSettings: () => void;
  onOpenGame: (gameId: string) => void;
  roomType: 'video' | 'audio' | 'game';
  currentGame?: string | null;
  roomId?: string;
  isMuted?: boolean;
  isVideoOff?: boolean;
  isSpeakerOn?: boolean;
  onToggleAudio?: () => void;
  onToggleVideo?: () => void;
  onToggleSpeaker?: () => void;
  onSendHeart?: () => void;
}

// 3D Game Card
const Game3DCard = ({
  game, isSelected, onClick, index, size = 'normal'
}: {
  game: GameInfo; isSelected: boolean; onClick: () => void; index: number; size?: 'small' | 'normal';
}) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <motion.button
      initial={{ opacity: 0, y: 30, rotateX: -15 }}
      animate={{ opacity: 1, y: 0, rotateX: 0, scale: isHovered ? 1.05 : 1 }}
      transition={{ delay: index * 0.04, type: "spring", stiffness: 280, damping: 22 }}
      whileTap={{ scale: 0.93, rotateX: 5 }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      onClick={onClick}
      className={cn("relative group", size === 'small' ? "flex-shrink-0 w-28" : "w-full")}
      style={{ transformStyle: 'preserve-3d', perspective: '1000px' }}
    >
      <motion.div
        animate={{ rotateY: isHovered ? 6 : 0, rotateX: isHovered ? -6 : 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        className={cn(
          "relative overflow-hidden rounded-2xl transform-gpu transition-all duration-300",
          size === 'small' ? "p-3" : "p-4 aspect-square",
          isSelected && "ring-2 ring-white/70"
        )}
        style={{ 
          transformStyle: 'preserve-3d',
          boxShadow: isHovered 
            ? '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 30px rgba(168, 85, 247, 0.2)' 
            : '0 10px 30px -10px rgba(0, 0, 0, 0.4)'
        }}
      >
        <div className={cn("absolute inset-0 bg-gradient-to-br transition-all duration-300", game.color)} />
        
        {/* Shine */}
        <motion.div
          animate={{ x: isHovered ? '150%' : '-150%' }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent w-1/2 skew-x-12"
          style={{ transform: 'translateZ(10px)' }}
        />
        <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/35 to-transparent" style={{ transform: 'translateZ(5px)' }} />
        
        <div className="relative z-10" style={{ transform: 'translateZ(25px)' }}>
          <motion.div
            animate={{ y: isHovered ? -5 : 0, scale: isHovered ? 1.15 : 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 18 }}
            className={cn("drop-shadow-2xl", size === 'small' ? "text-3xl mb-1" : "text-4xl mb-2")}
          >
            {game.emoji}
          </motion.div>
          <div className={cn("text-white font-bold", size === 'small' ? "text-sm" : "text-xs")}>{game.name}</div>
          {game.players && size === 'small' && (
            <div className="flex items-center gap-1 mt-1 text-white/80 text-[10px]">
              <Users className="w-3 h-3" /><span>{game.players.toLocaleString()}</span>
            </div>
          )}
        </div>
        
        {game.isLive && (
          <motion.div 
            className="absolute top-2 right-2 flex items-center gap-1 bg-green-500/90 backdrop-blur-sm px-1.5 py-0.5 rounded-full"
            style={{ transform: 'translateZ(30px)' }}
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
            <span className="text-[8px] text-white font-bold uppercase">Live</span>
          </motion.div>
        )}
      </motion.div>
      
      <motion.div
        animate={{ scale: isHovered ? 1.1 : 0.92, opacity: isHovered ? 0.3 : 0.15 }}
        className="absolute inset-0 -bottom-2 rounded-2xl bg-black blur-xl -z-10"
      />
    </motion.button>
  );
};


export function AdvancedPartyBottomBar({
  onOpenGifts, onOpenChat, onOpenSettings, onOpenGame,
  roomType, currentGame, roomId,
  isMuted = false, isVideoOff = false, isSpeakerOn = true,
  onToggleAudio, onToggleVideo, onToggleSpeaker, onSendHeart,
}: AdvancedPartyBottomBarProps) {
  const [showGameSheet, setShowGameSheet] = useState(false);
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [showGameBoard, setShowGameBoard] = useState(false);
  const [availableGames, setAvailableGames] = useState<GameInfo[]>([]);
  const [loadingGames, setLoadingGames] = useState(false);
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  
  useEffect(() => {
    const fetchGames = async () => {
      setLoadingGames(true);
      try {
        const { data, error } = await supabase
          .from('game_settings')
          .select('game_id, game_name, game_emoji, game_color, is_featured')
          .eq('is_active', true)
          .order('display_order', { ascending: true });

        if (!error && data) {
          setAvailableGames(data.map((game, index) => ({
            id: game.game_id, name: game.game_name, emoji: game.game_emoji,
            color: game.game_color, isLive: game.is_featured || index < 3,
            players: Math.floor(Math.random() * 3000) + 500
          })));
        }
      } catch (err) {
        console.error('Error fetching games:', err);
      } finally { setLoadingGames(false); }
    };
    if (showGameSheet) fetchGames();
  }, [showGameSheet]);
  
  const handleGameSelect = (gameId: string) => {
    setSelectedGame(gameId);
    setShowGameSheet(false);
    setShowGameBoard(true);
    onOpenGame(gameId);
  };
  
  const moreOptions = [
    { icon: Crown, label: 'PK', gradient: 'from-purple-500 to-indigo-700', glow: 'rgba(139,92,246,0.35)', onClick: () => {} },
    { icon: MessageSquare, label: 'Chat', gradient: 'from-pink-400 to-rose-600', glow: 'rgba(251,113,133,0.35)', onClick: onOpenChat },
    { icon: Share2, label: 'Share', gradient: 'from-orange-400 to-yellow-500', glow: 'rgba(251,146,60,0.35)', onClick: () => {} },
    { icon: Gamepad2, label: 'Games', gradient: 'from-orange-500 to-amber-700', glow: 'rgba(234,88,12,0.35)', onClick: () => setShowGameSheet(true) },
    { icon: Heart, label: 'Heart', gradient: 'from-red-400 to-pink-600', glow: 'rgba(248,113,113,0.35)', onClick: onSendHeart },
    { icon: isMuted ? MicOff : Mic, label: isMuted ? 'Unmute' : 'Mute', gradient: 'from-blue-500 to-cyan-600', glow: 'rgba(59,130,246,0.35)', onClick: onToggleAudio },
    
    { icon: isSpeakerOn ? Volume2 : VolumeX, label: 'Speaker', gradient: 'from-violet-500 to-purple-600', glow: 'rgba(139,92,246,0.35)', onClick: onToggleSpeaker },
    { icon: Settings, label: 'Settings', gradient: 'from-slate-500 to-gray-600', glow: 'rgba(148,163,184,0.25)', onClick: onOpenSettings },
  ];
  
  return (
    <>
      {/* Main Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 safe-area-bottom">
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent pointer-events-none" />
        
        <div className="relative flex items-center justify-between px-4 py-3">
          {/* Chat */}
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onOpenChat}
            className="w-12 h-12 rounded-full flex items-center justify-center relative overflow-hidden"
            style={{
              background: 'rgba(255,255,255,0.1)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(255,255,255,0.12)',
              boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
            }}
          >
            <MessageSquare className="w-5 h-5 text-white" />
          </motion.button>

          {/* Gift - Hero */}
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onOpenGifts}
            className="relative -mt-2"
          >
            <div className="w-[60px] h-[60px] rounded-[20px] flex items-center justify-center relative overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, #ec4899 0%, #a855f7 40%, #7c3aed 100%)',
                boxShadow: '0 12px 32px rgba(168,85,247,0.5), 0 0 0 2px rgba(255,255,255,0.1), inset 0 2px 0 rgba(255,255,255,0.15)',
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent" />
              <Gift className="w-7 h-7 text-white relative z-10 drop-shadow-lg" />
            </div>
            <motion.div
              animate={{ scale: [1, 1.2, 1], opacity: [0.35, 0.1, 0.35] }}
              transition={{ duration: 2.5, repeat: Infinity }}
              className="absolute inset-0 rounded-[20px] -z-10"
              style={{ background: 'linear-gradient(135deg, #ec4899, #a855f7)', filter: 'blur(14px)' }}
            />
          </motion.button>

          {/* More Options */}
          <Sheet open={showMoreOptions} onOpenChange={setShowMoreOptions}>
            <SheetTrigger asChild>
              <motion.button
                whileTap={{ scale: 0.9 }}
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  backdropFilter: 'blur(16px)',
                  border: '1px solid rgba(255,255,255,0.12)',
                }}
              >
                <Settings className="w-5 h-5 text-white" />
              </motion.button>
            </SheetTrigger>
            <SheetContent 
              side="bottom" 
              className="border-t rounded-t-[28px] h-auto p-0"
              style={{
                background: 'linear-gradient(180deg, rgba(15,10,40,0.98) 0%, rgba(25,15,55,0.98) 40%, rgba(15,10,40,0.98) 100%)',
                borderColor: 'rgba(168,85,247,0.15)',
                backdropFilter: 'blur(32px)',
              }}
            >
              {/* Close */}
              <motion.button
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setShowMoreOptions(false)}
                className="absolute -top-14 right-4 w-10 h-10 rounded-full flex items-center justify-center z-50"
                style={{
                  background: 'rgba(0,0,0,0.6)',
                  backdropFilter: 'blur(16px)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                }}
              >
                <X className="w-5 h-5 text-white" />
              </motion.button>

              {/* Handle */}
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.2)' }} />
              </div>
              
              {/* Top glow */}
              <motion.div 
                className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-[2px] rounded-full"
                style={{ background: 'linear-gradient(90deg, transparent, rgba(168,85,247,0.5), rgba(236,72,153,0.4), transparent)' }}
                animate={{ opacity: [0.4, 0.8, 0.4] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              
              {/* Grid */}
              <div className="pb-6 pt-2 px-3">
                <div className="grid grid-cols-5 gap-2">
                  {moreOptions.map((option, index) => (
                    <motion.button
                      key={index}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.03 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => {
                        option.onClick?.();
                        if (option.label !== 'Games') setShowMoreOptions(false);
                      }}
                      className="flex flex-col items-center group"
                    >
                      <div className={cn(
                        "w-12 h-12 rounded-xl flex items-center justify-center mb-1 relative overflow-hidden",
                        `bg-gradient-to-br ${option.gradient}`
                      )}
                        style={{ boxShadow: `0 6px 20px ${option.glow}` }}
                      >
                        <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent" />
                        <option.icon className="w-5 h-5 text-white relative z-10 drop-shadow-md" />
                      </div>
                      <span className="text-[9px] text-white/75 font-medium">{option.label}</span>
                    </motion.button>
                  ))}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Game Selection Sheet */}
      <Sheet open={showGameSheet} onOpenChange={setShowGameSheet}>
        <SheetContent 
          side="bottom" 
          className="h-auto max-h-[75vh] rounded-t-3xl border-0 p-0"
          style={{
            background: 'linear-gradient(180deg, rgba(15,10,40,0.98) 0%, rgba(10,15,35,0.99) 100%)',
          }}
        >
          <div className="flex justify-center pt-3 pb-3">
            <div className="w-14 h-1.5 bg-white/20 rounded-full" />
          </div>
          
          <div className="px-5 pb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <motion.div 
                className="w-12 h-12 rounded-2xl flex items-center justify-center relative overflow-hidden"
                style={{
                  background: 'linear-gradient(135deg, #a855f7, #ec4899, #f97316)',
                  boxShadow: '0 8px 24px rgba(168,85,247,0.4)',
                }}
                animate={{ rotate: [0, 3, -3, 0] }}
                transition={{ duration: 4, repeat: Infinity }}
              >
                <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent" />
                <Gamepad2 className="w-6 h-6 text-white relative z-10" />
              </motion.div>
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  Party Games
                  <Sparkles className="w-4 h-4 text-yellow-400" />
                </h2>
                <p className="text-xs text-white/50">Play with everyone</p>
              </div>
            </div>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => setShowGameSheet(false)}
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <X className="w-4 h-4 text-white" />
            </motion.button>
          </div>
          
          <div className="px-5 pb-8">
            {loadingGames ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {availableGames.map((game, index) => (
                  <Game3DCard
                    key={game.id} game={game} isSelected={selectedGame === game.id}
                    onClick={() => handleGameSelect(game.id)} index={index} size="normal"
                  />
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Game Footer */}
      {showGameBoard && selectedGame && (
        <GameFooterNew
          selectedGame={selectedGame} roomId={roomId}
          onClose={() => { setShowGameBoard(false); setSelectedGame(null); }}
          onOpenGifts={onOpenGifts}
        />
      )}
    </>
  );
}

export default AdvancedPartyBottomBar;
