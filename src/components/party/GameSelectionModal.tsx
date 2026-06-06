import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Gamepad2, Check, X, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getProxiedUrl } from "@/utils/r2ProxyUrl";
import { Skeleton } from "@/components/Skeleton";

interface Game {
  id: string;
  name: string;
  emoji: string;
  color: string;
  description: string;
  logo_url?: string | null;
}

interface GameSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectGame: (gameId: string) => void;
  selectedGame: string | null;
}

// 3D Card component with hover effects
const Game3DCard = ({ 
  game, 
  isSelected, 
  onClick, 
  index 
}: { 
  game: Game; 
  isSelected: boolean; 
  onClick: () => void; 
  index: number;
}) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <motion.button
      initial={{ opacity: 0, y: 30, rotateX: -15 }}
      animate={{ 
        opacity: 1, 
        y: 0, 
        rotateX: 0,
        scale: isHovered ? 1.05 : 1,
        z: isHovered ? 20 : 0
      }}
      exit={{ opacity: 0, y: 30, scale: 0.9 }}
      transition={{ 
        delay: index * 0.04,
        type: "spring",
        stiffness: 260,
        damping: 20
      }}
      whileTap={{ scale: 0.95, rotateX: 5 }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      onClick={onClick}
      className="relative group min-w-0 perspective-1000"
      style={{ 
        transformStyle: 'preserve-3d',
        perspective: '1000px'
      }}
    >
      {/* 3D Card Container */}
      <motion.div
        animate={{
          rotateY: isHovered ? 5 : 0,
          rotateX: isHovered ? -5 : 0,
        }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className={cn(
          "relative w-full aspect-square rounded-2xl overflow-hidden",
          "transform-gpu transition-all duration-300",
          "shadow-lg hover:shadow-2xl",
          isSelected && "ring-3 ring-white ring-offset-2 ring-offset-transparent"
        )}
        style={{ 
          transformStyle: 'preserve-3d',
          boxShadow: isHovered 
            ? '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 30px rgba(147, 51, 234, 0.3)' 
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
            x: isHovered ? '100%' : '-100%',
            opacity: isHovered ? 0.4 : 0
          }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent skew-x-12"
          style={{ transform: 'translateZ(10px)' }}
        />
        
        {/* Top Light Reflection */}
        <div 
          className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-white/40 to-transparent"
          style={{ transform: 'translateZ(5px)' }}
        />
        
        {/* Bottom Shadow */}
        <div 
          className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/30 to-transparent"
          style={{ transform: 'translateZ(5px)' }}
        />
        
        {/* Game Icon - Show Logo from Admin Panel or Fallback to Emoji */}
        <motion.div
          animate={{
            y: isHovered ? -8 : 0,
            scale: isHovered ? 1.15 : 1,
            rotateY: isHovered ? 10 : 0
          }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          className="absolute inset-0 flex items-center justify-center p-1.5"
          style={{ transform: 'translateZ(30px)' }}
        >
          {game.logo_url ? (
            <img loading="lazy" decoding="async" 
              src={getProxiedUrl(game.logo_url)} 
              alt={game.name}
              className="w-full h-full object-contain drop-shadow-2xl rounded-xl"
             
              onError={(e) => {
                // Hide image and show emoji fallback
                (e.target as HTMLImageElement).style.display = 'none';
                const parent = (e.target as HTMLImageElement).parentElement;
                if (parent) {
                  const fallback = parent.querySelector('.emoji-fallback');
                  if (fallback) (fallback as HTMLElement).style.display = 'block';
                }
              }}
            />
          ) : (
            <span className="text-6xl drop-shadow-2xl filter emoji-fallback">
              {game.emoji}
            </span>
          )}
        </motion.div>
        
        {/* Selected Checkmark */}
        <AnimatePresence>
          {isSelected && (
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0, rotate: 180 }}
              transition={{ type: "spring", stiffness: 500, damping: 25 }}
              className="absolute -top-1 -right-1 w-6 h-6 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center shadow-lg border-2 border-white"
              style={{ transform: 'translateZ(40px)' }}
            >
              <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Hover Glow Effect */}
        <motion.div
          animate={{ opacity: isHovered ? 1 : 0 }}
          className="absolute inset-0 rounded-2xl"
          style={{
            background: 'radial-gradient(circle at center, rgba(255,255,255,0.1) 0%, transparent 70%)',
            transform: 'translateZ(15px)'
          }}
        />
      </motion.div>
      
      {/* 3D Shadow */}
      <motion.div
        animate={{
          scale: isHovered ? 1.1 : 0.95,
          opacity: isHovered ? 0.3 : 0.15
        }}
        className="absolute inset-0 -bottom-2 rounded-2xl bg-black blur-xl -z-10"
        style={{ transform: 'translateZ(-10px) translateY(10px)' }}
      />
    </motion.button>
  );
};

export function GameSelectionModal({ 
  isOpen, 
  onClose, 
  onSelectGame, 
  selectedGame 
}: GameSelectionModalProps) {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchGames();
    }
  }, [isOpen]);

  const fetchGames = async () => {
    setLoading(true);
    try {
      // Fetch all active games including logo_url + row id (fallback for null game_id)
      const { data, error } = await supabase
        .from('game_settings')
        .select('id, game_id, game_name, game_emoji, game_color, description, logo_url')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (!error && data) {
        setGames(data.map(game => ({
          id: game.game_id || game.id,
          name: game.game_name,
          emoji: game.game_emoji,
          color: game.game_color,
          description: game.description || 'Play & win!',
          logo_url: game.logo_url
        })));
      }
    } catch (err) {
      console.error('Error fetching games:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center"
        >
          {/* Backdrop with blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-md"
            onClick={onClose}
          />

          {/* Modal - Slides from Bottom */}
          <motion.div
            initial={{ y: "100%", opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: "100%", opacity: 0, scale: 0.95 }}
            transition={{ 
              type: "spring", 
              damping: 30, 
              stiffness: 300,
              mass: 0.8
            }}
            className="relative z-10 w-full max-w-lg mx-2 mb-0 rounded-t-3xl overflow-hidden"
            style={{
              background: 'linear-gradient(180deg, rgba(30, 27, 75, 0.98) 0%, rgba(17, 24, 39, 0.99) 100%)',
              boxShadow: '0 -10px 60px rgba(139, 92, 246, 0.3), 0 -5px 30px rgba(0, 0, 0, 0.5)'
            }}
          >
            {/* Pull Handle */}
            <div className="flex justify-center pt-3 pb-2">
              <motion.div 
                className="w-12 h-1.5 bg-white/30 rounded-full"
                whileHover={{ scale: 1.1, backgroundColor: 'rgba(255,255,255,0.5)' }}
              />
            </div>
            
            {/* Header */}
            <div className="relative px-5 pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <motion.div 
                    className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center shadow-xl"
                    animate={{ 
                      rotate: [0, 5, -5, 0],
                      scale: [1, 1.05, 1]
                    }}
                    transition={{ 
                      duration: 3, 
                      repeat: Infinity, 
                      repeatType: "reverse" 
                    }}
                    style={{
                      boxShadow: '0 8px 30px rgba(168, 85, 247, 0.4)'
                    }}
                  >
                    <Gamepad2 className="w-6 h-6 text-white" />
                  </motion.div>
                  <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                      Select Game
                      <Sparkles className="w-4 h-4 text-yellow-400" />
                    </h2>
                    <p className="text-xs text-white/60">Choose your game mode</p>
                  </div>
                </div>
                <motion.button
                  whileHover={{ scale: 1.1, rotate: 90 }}
                  whileTap={{ scale: 0.9 }}
                  className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/20 transition-colors"
                  onClick={onClose}
                >
                  <X className="w-5 h-5" />
                </motion.button>
              </div>
            </div>

            {/* Games Grid with 3D Cards */}
            <div className="px-3 pb-6 max-h-[60vh] overflow-y-auto overscroll-contain">
              {loading ? (
                <div className="grid grid-cols-3 gap-3">
                  {Array.from({ length: 9 }).map((_, i) => (
                    <div key={i} className="flex flex-col items-center gap-2">
                      <Skeleton className="w-full aspect-square rounded-2xl" />
                      <Skeleton className="h-3 w-2/3" />
                    </div>
                  ))}
                </div>
              ) : games.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/10 flex items-center justify-center">
                    <Gamepad2 className="w-8 h-8 text-white/40" />
                  </div>
                  <p className="text-white/60">No games available</p>
                </div>
              ) : (
                <motion.div 
                  className="grid grid-cols-3 gap-3"
                  initial="hidden"
                  animate="visible"
                  variants={{
                    hidden: { opacity: 0 },
                    visible: {
                      opacity: 1,
                      transition: { staggerChildren: 0.05 }
                    }
                  }}
                >
                  {games.map((game, index) => (
                    <Game3DCard
                      key={game.id}
                      game={game}
                      isSelected={selectedGame === game.id}
                      onClick={() => onSelectGame(game.id)}
                      index={index}
                    />
                  ))}
                </motion.div>
              )}
            </div>

            {/* Footer with Start Button */}
            <AnimatePresence>
              {selectedGame && (
                <motion.div
                  initial={{ y: 50, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 50, opacity: 0 }}
                  transition={{ type: "spring", damping: 25, stiffness: 300 }}
                  className="px-5 pb-6 pt-2"
                >
                  <motion.div
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Button
                      onClick={onClose}
                      className={cn(
                        "w-full h-14 rounded-2xl text-white font-bold text-base",
                        "bg-gradient-to-r shadow-xl",
                        "hover:brightness-110 transition-all",
                        games.find(g => g.id === selectedGame)?.color || "from-purple-600 to-pink-600"
                      )}
                      style={{
                        boxShadow: '0 10px 40px rgba(168, 85, 247, 0.4), inset 0 2px 0 rgba(255,255,255,0.2)'
                      }}
                    >
                      <motion.span
                        animate={{ x: [0, 3, 0] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                        className="flex items-center gap-2"
                      >
                        <Gamepad2 className="w-5 h-5" />
                        Start Game
                        <span className="text-xl">{games.find(g => g.id === selectedGame)?.emoji}</span>
                      </motion.span>
                    </Button>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
            
            {/* Bottom Safe Area */}
            <div className="h-2 bg-gradient-to-t from-black/20 to-transparent" />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
