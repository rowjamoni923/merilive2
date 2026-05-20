import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { 
  Gamepad2, 
  Gift, 
  MessageSquare, 
  Settings,
  Sparkles,
  X,
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { LiveGameBoard } from "@/components/games/LiveGameBoard";
import { supabase } from "@/integrations/supabase/client";
import { getProxiedUrl } from "@/utils/r2ProxyUrl";

interface GameInfo {
  id: string;
  name: string;
  emoji: string;
  color: string;
  isLive?: boolean;
  logo_url?: string | null;
}

interface ProfessionalBottomBarProps {
  onOpenGifts: () => void;
  onOpenChat: () => void;
  onOpenSettings: () => void;
  onOpenGame: (gameId: string) => void;
  roomType: 'video' | 'audio' | 'game';
  currentGame?: string | null;
  roomId?: string;
}

// 3D Game Card Component
const Game3DCard = ({
  game,
  isSelected,
  onClick,
  index,
  size = 'normal'
}: {
  game: GameInfo;
  isSelected: boolean;
  onClick: () => void;
  index: number;
  size?: 'small' | 'normal';
}) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <motion.button
      initial={{ opacity: 0, y: 30, rotateX: -15 }}
      animate={{ 
        opacity: 1, 
        y: 0, 
        rotateX: 0,
        scale: isHovered ? 1.05 : 1
      }}
      transition={{ 
        delay: index * 0.04,
        type: "spring",
        stiffness: 280,
        damping: 22
      }}
      whileTap={{ scale: 0.93, rotateX: 5 }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      onClick={onClick}
      className={cn(
        "relative group min-w-0",
        size === 'small' ? "flex-shrink-0 w-28" : "w-full"
      )}
      style={{ 
        transformStyle: 'preserve-3d',
        perspective: '1000px'
      }}
    >
      <motion.div
        animate={{
          rotateY: isHovered ? 6 : 0,
          rotateX: isHovered ? -6 : 0,
        }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        className={cn(
          "relative overflow-hidden rounded-2xl",
          "transform-gpu transition-all duration-300",
          size === 'small' ? "aspect-square p-1.5" : "p-1.5 aspect-square",
          isSelected && "ring-2 ring-white/70"
        )}
        style={{ 
          transformStyle: 'preserve-3d',
          background: `linear-gradient(135deg, var(--tw-gradient-stops))`,
          boxShadow: isHovered 
            ? '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 30px rgba(168, 85, 247, 0.2)' 
            : '0 10px 30px -10px rgba(0, 0, 0, 0.4)'
        }}
      >
        {/* Background Gradient */}
        <div className={cn(
          "absolute inset-0 bg-gradient-to-br transition-all duration-300",
          game.color
        )} />
        
        {/* Shine Effect */}
        <motion.div
          animate={{
            x: isHovered ? '150%' : '-150%',
          }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent w-1/2 skew-x-12"
          style={{ transform: 'translateZ(10px)' }}
        />
        
        {/* Top Light */}
        <div 
          className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/35 to-transparent"
          style={{ transform: 'translateZ(5px)' }}
        />
        
        {/* Bottom Shadow */}
        <div 
          className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/30 to-transparent"
          style={{ transform: 'translateZ(5px)' }}
        />
        
        {/* Content */}
        <div className="absolute inset-0 z-10 flex items-center justify-center p-1.5" style={{ transform: 'translateZ(25px)' }}>
          <motion.div
            animate={{
              y: isHovered ? -5 : 0,
              scale: isHovered ? 1.15 : 1,
            }}
            transition={{ type: "spring", stiffness: 300, damping: 18 }}
            className="w-full h-full flex items-center justify-center drop-shadow-2xl"
          >
            {game.logo_url ? (
              <img src={getProxiedUrl(game.logo_url)} alt={game.name} className="w-full h-full rounded-xl object-contain" loading="lazy" decoding="async" draggable={false} />
            ) : (
              <span className={cn(size === 'small' ? "text-5xl" : "text-6xl")}>{game.emoji}</span>
            )}
          </motion.div>
        </div>
      </motion.div>
      
      {/* 3D Shadow */}
      <motion.div
        animate={{
          scale: isHovered ? 1.1 : 0.92,
          opacity: isHovered ? 0.3 : 0.15
        }}
        className="absolute inset-0 -bottom-2 rounded-2xl bg-black blur-xl -z-10"
      />
    </motion.button>
  );
};

export function ProfessionalBottomBar({
  onOpenGifts,
  onOpenChat,
  onOpenSettings,
  onOpenGame,
  roomType,
  currentGame,
  roomId
}: ProfessionalBottomBarProps) {
  const [showGameSheet, setShowGameSheet] = useState(false);
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [showGameBoard, setShowGameBoard] = useState(false);
  const [availableGames, setAvailableGames] = useState<GameInfo[]>([]);
  const [loadingGames, setLoadingGames] = useState(false);

  useEffect(() => {
    const fetchGames = async () => {
      setLoadingGames(true);
      try {
        // Fetch all active games - no restriction on game IDs
        const { data, error } = await supabase
          .from('game_settings')
          .select('game_id, game_name, game_emoji, game_color, is_featured, logo_url')
          .eq('is_active', true)
          .order('display_order', { ascending: true });

        if (!error && data) {
          setAvailableGames(data.map((game, index) => ({
            id: game.game_id,
            name: game.game_name,
            emoji: game.game_emoji,
            color: game.game_color,
            logo_url: game.logo_url,
            isLive: game.is_featured || index < 3
          })));
        }
      } catch (err) {
        console.error('Error fetching games:', err);
      } finally {
        setLoadingGames(false);
      }
    };

    if (showGameSheet) {
      fetchGames();
    }
  }, [showGameSheet]);
  
  const handleGameSelect = (gameId: string) => {
    setSelectedGame(gameId);
    setShowGameSheet(false);
    setShowGameBoard(true);
    onOpenGame(gameId);
  };
  
  return (
    <>
      {/* Bottom Navigation Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 safe-area-bottom">
        <div className="bg-gradient-to-t from-black/90 via-black/80 to-transparent pt-6 pb-2 px-3">
          <div className="flex items-center justify-around">
            {/* Game Button */}
            <Sheet open={showGameSheet} onOpenChange={setShowGameSheet}>
              <SheetTrigger asChild>
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button
                    variant="ghost"
                    className="flex flex-col items-center gap-0.5 h-auto py-2 px-3 rounded-xl bg-gradient-to-br from-purple-600/80 to-pink-600/80 border border-purple-400/30"
                  >
                    <div className="relative">
                      <Gamepad2 className="w-6 h-6 text-white" />
                      <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                    </div>
                    <span className="text-[10px] text-white font-medium">Games</span>
                  </Button>
                </motion.div>
              </SheetTrigger>
              <SheetContent 
                side="bottom" 
                className="h-auto max-h-[75vh] rounded-t-3xl border-0 p-0"
                style={{
                  background: 'linear-gradient(180deg, rgba(30, 27, 75, 0.98) 0%, rgba(15, 23, 42, 0.99) 100%)'
                }}
              >
                {/* Handle */}
                <div className="flex justify-center pt-3 pb-3">
                  <motion.div 
                    className="w-14 h-1.5 bg-white/25 rounded-full"
                    whileHover={{ scale: 1.1, backgroundColor: 'rgba(255,255,255,0.4)' }}
                  />
                </div>
                
                {/* Header */}
                <div className="px-5 pb-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <motion.div 
                      className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center shadow-xl"
                      animate={{ rotate: [0, 3, -3, 0] }}
                      transition={{ duration: 4, repeat: Infinity }}
                      style={{
                        boxShadow: '0 10px 40px rgba(168, 85, 247, 0.4)'
                      }}
                    >
                      <Gamepad2 className="w-7 h-7 text-white" />
                    </motion.div>
                    <div>
                      <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        Party Games
                        <Sparkles className="w-5 h-5 text-yellow-400" />
                      </h2>
                      <p className="text-sm text-white/60">Play with everyone in the room</p>
                    </div>
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.1, rotate: 90 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setShowGameSheet(false)}
                    className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white"
                  >
                    <X className="w-5 h-5" />
                  </motion.button>
                </div>
                
                {/* Live Games Section */}
                <div className="px-5 pb-4">
                  <div className="flex items-center gap-2 mb-3">
                    <motion.div
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    >
                      <Sparkles className="w-4 h-4 text-green-400" />
                    </motion.div>
                    <span className="text-green-400 font-semibold text-sm">Live Games</span>
                    <div className="flex-1 h-px bg-gradient-to-r from-green-500/40 to-transparent" />
                  </div>
                  {loadingGames ? (
                    <div className="flex items-center justify-center py-6">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      >
                        <Loader2 className="w-8 h-8 text-purple-400" />
                      </motion.div>
                    </div>
                  ) : (
                    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                      {availableGames.filter(g => g.isLive).map((game, index) => (
                        <Game3DCard
                          key={game.id}
                          game={game}
                          isSelected={selectedGame === game.id}
                          onClick={() => handleGameSelect(game.id)}
                          index={index}
                          size="small"
                        />
                      ))}
                    </div>
                  )}
                </div>
                
                {/* All Games Grid */}
                <div className="px-5 pb-8">
                  <div className="flex items-center gap-2 mb-3">
                    <Gamepad2 className="w-4 h-4 text-white/60" />
                    <span className="text-white/60 font-medium text-sm">All Games</span>
                    <div className="flex-1 h-px bg-gradient-to-r from-white/20 to-transparent" />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {availableGames.map((game, index) => (
                      <Game3DCard
                        key={game.id}
                        game={game}
                        isSelected={selectedGame === game.id}
                        onClick={() => handleGameSelect(game.id)}
                        index={index}
                        size="normal"
                      />
                    ))}
                  </div>
                </div>
              </SheetContent>
            </Sheet>
            
            {/* Gift Button */}
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                variant="ghost"
                onClick={onOpenGifts}
                className="flex flex-col items-center gap-0.5 h-auto py-2 px-3 rounded-xl bg-gradient-to-br from-pink-600/80 to-red-600/80 border border-pink-400/30"
              >
                <Gift className="w-6 h-6 text-white" />
                <span className="text-[10px] text-white font-medium">Gift</span>
              </Button>
            </motion.div>
            
            {/* Chat Button */}
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                variant="ghost"
                onClick={onOpenChat}
                className="flex flex-col items-center gap-0.5 h-auto py-2 px-3 rounded-xl bg-white/10 border border-white/10"
              >
                <MessageSquare className="w-6 h-6 text-white" />
                <span className="text-[10px] text-white/80 font-medium">Chat</span>
              </Button>
            </motion.div>
            
            {/* Settings Button */}
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                variant="ghost"
                onClick={onOpenSettings}
                className="flex flex-col items-center gap-0.5 h-auto py-2 px-3 rounded-xl bg-white/10 border border-white/10"
              >
                <Settings className="w-6 h-6 text-white" />
                <span className="text-[10px] text-white/80 font-medium">More</span>
              </Button>
            </motion.div>
          </div>
        </div>
      </div>
      
      {/* Game Board Overlay - Slides from Bottom */}
      <AnimatePresence>
        {showGameBoard && selectedGame && (
          <motion.div
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 z-50 h-[65vh] rounded-t-3xl overflow-hidden"
            style={{
              background: 'linear-gradient(180deg, rgba(30, 27, 75, 0.98) 0%, rgba(15, 23, 42, 0.99) 100%)',
              boxShadow: '0 -10px 60px rgba(139, 92, 246, 0.25)'
            }}
          >
            {/* Handle */}
            <div 
              className="flex justify-center pt-3 pb-2 cursor-pointer"
              onClick={() => setShowGameBoard(false)}
            >
              <motion.div 
                className="w-14 h-1.5 bg-white/30 rounded-full"
                whileHover={{ scale: 1.1, backgroundColor: 'rgba(255,255,255,0.5)' }}
              />
            </div>
            
            {/* Game Board */}
            <div className="h-[calc(100%-28px)] overflow-y-auto px-2 pb-4">
              <LiveGameBoard 
                selectedGame={selectedGame}
                roomId={roomId}
                onClose={() => {
                  setShowGameBoard(false);
                  setSelectedGame(null);
                }}
                onOpenGifts={onOpenGifts}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default ProfessionalBottomBar;
