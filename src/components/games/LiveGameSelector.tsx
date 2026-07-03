import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { X, Gamepad2, Coins, Sparkles, Loader2 } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useMobileOrientation } from "@/hooks/useMobileOrientation";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { LiveGameBoard } from "./LiveGameBoard";
import { GameErrorBoundary } from "./GameErrorBoundary";
import { getProxiedUrl } from "@/utils/r2ProxyUrl";
import { getOptimizedImageUrl } from "@/utils/imageOptimize";
import { Skeleton } from "@/components/Skeleton";
interface GameItem {
  game_id: string;
  game_name: string;
  game_emoji: string;
  game_color: string;
  description?: string;
  game_type?: string;
  game_url?: string;
  logo_url?: string;
}

interface LiveGameSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  roomId?: string;
  onOpenGifts?: () => void;
  /** Where win bubbles should post (live stream chat vs party room chat). */
  context?: 'live' | 'party' | 'none';
}

// 3D Game Card Component
const Game3DCard = ({
  game,
  onClick,
  index
}: {
  game: GameItem;
  onClick: () => void;
  index: number;
}) => {
  // User directive: never render the DB `logo_url` for games — those are
  // generic third-party placeholder icons. Show only our own branded
  // gradient card + emoji so the panel stays on-brand.
  const showFallback = true;

  return (
    <motion.button
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.3 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className="relative group min-w-0"
    >
      {/* Game Card — LOGO ONLY (no name, no badges, no overlays) */}
      <div
        className={cn(
          "relative w-full aspect-square rounded-2xl overflow-hidden bg-white/5",
          "transition-transform duration-200 active:scale-95"
        )}
        style={{
          boxShadow: '0 14px 30px -10px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -2px 6px rgba(0,0,0,0.35)',
          border: '1px solid rgba(255,255,255,0.08)'
        }}
      >
        {/* Fallback gradient + emoji is ALWAYS rendered behind the image so the
            card is never visually empty while the (sometimes large) logo loads
            or if the request fails entirely. */}
        <div className={cn("absolute inset-0 bg-gradient-to-br", game.game_color || "from-purple-600 to-pink-600")} />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-5xl drop-shadow-2xl select-none">{game.game_emoji || "🎮"}</span>
        </div>

        {/* Top glossy sheen */}
        <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/10 to-transparent pointer-events-none z-10" />

        {/* DB `logo_url` intentionally not rendered — see showFallback above. */}
      </div>
    </motion.button>
  );
};


export function LiveGameSelector({ isOpen, onClose, roomId, onOpenGifts, context = 'party' }: LiveGameSelectorProps) {
  const [games, setGames] = useState<GameItem[]>([]);
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { isLandscape, isVerySmallHeight } = useMobileOrientation();


  useEffect(() => {
    if (isOpen) {
      fetchGames();
    }
  }, [isOpen]);

  // Reset selected game when sheet closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedGame(null);
    }
  }, [isOpen]);

  const fetchGames = async () => {
    setLoading(true);
    try {
      // Fetch ALL active games from database
      const { data, error } = await supabase
        .from('game_settings')
        .select('game_id, game_name, game_emoji, game_color, description, game_type, game_url, logo_url')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      console.log('Fetched games:', data, 'Error:', error);

      if (!error && data) {
        setGames(data);
      } else if (error) {
        console.error('Error fetching games:', error);
      }
    } catch (err) {
      console.error('Error fetching games:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectGame = (game: GameItem) => {
    // All games (including external/iframe) are rendered inline via LiveGameBoard
    setSelectedGame(game.game_id);
  };

  // When a game is selected, close the sheet and show LiveGameBoard
  // Using LiveGameBoard ensures SAME games work in Live Stream as in Party Room
  if (selectedGame) {
    return (
      <Sheet open={true} onOpenChange={(open) => {
        if (!open) {
          setSelectedGame(null);
          onClose();
        }
      }}>
        <SheetContent 
          side="bottom" 
          className={cn(
            "rounded-t-3xl bg-gradient-to-b from-slate-900 via-purple-900 to-slate-900 border-0 p-0 overflow-hidden",
            isLandscape ? "h-[98dvh] max-h-[98dvh]" : "h-auto max-h-[85vh]"
          )}
        >
          <div className={cn(
            "p-2 overflow-y-auto",
            isLandscape ? "max-h-[95dvh]" : "max-h-[80vh]"
          )}>

            <GameErrorBoundary gameName={selectedGame ?? undefined} onReset={() => setSelectedGame(null)}>
              <LiveGameBoard
                selectedGame={selectedGame}
                roomId={roomId}
                context={context}
                onClose={() => {
                  setSelectedGame(null);
                  onClose();
                }}
                onOpenGifts={onOpenGifts}
              />
            </GameErrorBoundary>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent 
        side="bottom" 
        className={cn(
          "rounded-t-3xl border-0 p-0 overflow-hidden [&>button]:hidden",
          "md:left-1/2 md:right-auto md:-translate-x-1/2 md:w-[800px] md:rounded-3xl md:bottom-10 md:border md:shadow-2xl",
          isLandscape ? "h-[98dvh] max-h-[98dvh]" : "h-[70vh] max-h-[70vh]"
        )}
        style={{
          background: 'linear-gradient(180deg, rgba(30, 27, 75, 0.98) 0%, rgba(15, 23, 42, 0.99) 100%)'
        }}
      >
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="h-full flex flex-col"
        >
          {/* Pull Handle */}
          <div className="flex justify-center pt-3 pb-2">
            <motion.div 
              className="w-14 h-1.5 bg-white/25 rounded-full"
              whileHover={{ scale: 1.1, backgroundColor: 'rgba(255,255,255,0.4)' }}
            />
          </div>
          
          {/* Header */}
          <div className="flex items-center justify-between px-5 pb-4">
            <div className="flex items-center gap-3">
              <motion.div 
                className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center shadow-2xl"
                animate={{ 
                  rotate: [0, 3, -3, 0],
                  scale: [1, 1.02, 1]
                }}
                transition={{ 
                  duration: 4, 
                  repeat: Infinity, 
                  repeatType: "reverse" 
                }}
                style={{
                  boxShadow: '0 10px 40px rgba(168, 85, 247, 0.5)'
                }}
              >
                <Gamepad2 className="w-7 h-7 text-white" />
              </motion.div>
              <div>
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                  Live Games
                  <motion.div
                    animate={{ rotate: [0, 15, -15, 0] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <Sparkles className="w-5 h-5 text-yellow-400" />
                  </motion.div>
                </h2>
                <p className="text-sm text-white/60">Play & win coins instantly!</p>
              </div>
            </div>
            <motion.button
              whileHover={{ scale: 1.1, rotate: 90 }}
              whileTap={{ scale: 0.9 }}
              onClick={onClose}
              className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/20"
            >
              <X className="w-5 h-5" />
            </motion.button>
          </div>

          {/* Games Grid */}
          <div className="flex-1 overflow-y-auto px-3 pb-8">
            {loading ? (
              <div className={cn("grid gap-3", isLandscape ? "grid-cols-5 md:grid-cols-6" : "grid-cols-3")}>
                {Array.from({ length: isLandscape ? 10 : 9 }).map((_, i) => (
                  <div key={i} className="flex flex-col items-center gap-2">
                    <Skeleton className="w-full aspect-square rounded-2xl" />
                    <Skeleton className="h-3 w-2/3" />
                  </div>
                ))}
              </div>
            ) : (
              <motion.div 
                className={cn(
                  "grid gap-3",
                  isLandscape ? "grid-cols-5 md:grid-cols-6" : "grid-cols-3"
                )}

                initial="hidden"
                animate="visible"
                variants={{
                  hidden: { opacity: 0 },
                  visible: {
                    opacity: 1,
                    transition: { staggerChildren: 0.06 }
                  }
                }}
              >
                {games.map((game, index) => (
                  <Game3DCard
                    key={game.game_id}
                    game={game}
                    onClick={() => handleSelectGame(game)}
                    index={index}
                  />
                ))}
              </motion.div>
            )}
          </div>

          {/* Footer Info */}
          <motion.div 
            className="px-5 py-4 border-t border-white/10"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <div className="flex items-center justify-center gap-3">
              <motion.div
                animate={{ y: [0, -3, 0] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                <Coins className="w-5 h-5 text-yellow-400" />
              </motion.div>
              <span className="text-white/70 text-sm font-medium">
                Win big with live multiplayer games!
              </span>
            </div>
          </motion.div>
        </motion.div>
      </SheetContent>
    </Sheet>
  );
}
