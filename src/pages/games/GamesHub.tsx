import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Diamond, Star, ArrowLeft, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { BottomNavigation } from "@/components/layout/BottomNavigation";
import { useUserBalance } from "@/hooks/useUserBalance";
import Diamond3DIcon from "@/components/common/Diamond3DIcon";
import { getProxiedUrl } from "@/utils/r2ProxyUrl";
import { useGameToken } from "@/hooks/useGameToken";
import ferrisWheelLogo from "@/assets/ferris-wheel.svg";
import rouletteLogo from "@/assets/roulette-wheel.png";
import teenPattiLogo from "@/assets/teen-patti-logo.png";

// Main-app parity: built-in logo fallbacks keyed by game_id
const BUILTIN_GAME_LOGOS: Record<string, string> = {
  "ferris-wheel": ferrisWheelLogo,
  "roulette": rouletteLogo,
  "teen-patti": teenPattiLogo,
};

const resolveGameLogo = (game: { game_id: string; logo_url?: string }) =>
  game.logo_url ? getProxiedUrl(game.logo_url) : BUILTIN_GAME_LOGOS[game.game_id] || null;

interface GameSetting {
  id: string;
  game_id: string;
  game_name: string;
  game_emoji: string;
  game_color: string;
  description: string;
  game_url?: string;
  logo_url?: string;
  game_type?: string;
  is_featured: boolean;
  is_active: boolean;
  max_multiplier: number;
  iframe_height?: number;
}

export default function GamesHub() {
  const [games, setGames] = useState<GameSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeGame, setActiveGame] = useState<GameSetting | null>(null);
  const [gameUrl, setGameUrl] = useState<string | null>(null);
  const [buildingUrl, setBuildingUrl] = useState(false);
  const navigate = useNavigate();
  const { balance } = useUserBalance();
  const { buildGameUrl } = useGameToken();

  useEffect(() => {
    fetchGames();
  }, []);

  const fetchGames = async () => {
    const { data, error } = await supabase
      .from("game_settings")
      .select("*")
      .eq("is_active", true)
      .order("display_order", { ascending: true });

    if (!error && data) {
      setGames(data as unknown as GameSetting[]);
    }
    setLoading(false);
  };

  const handleGameClick = async (game: GameSetting) => {
    if (!game.game_url) return;

    // For internal games (roulette, ferris-wheel, teen-patti)
    if (game.game_url.startsWith("/")) {
      navigate(game.game_url);
      return;
    }

    // For external/iframe games
    setActiveGame(game);
    setBuildingUrl(true);
    try {
      const url = await buildGameUrl(game.game_url, game.game_id, undefined);
      setGameUrl(url);
    } catch {
      setGameUrl(game.game_url);
    }
    setBuildingUrl(false);
  };

  const closeGame = () => {
    setActiveGame(null);
    setGameUrl(null);
  };

  const featuredGames = games.filter(g => g.is_featured);
  const otherGames = games.filter(g => !g.is_featured);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Full-screen game overlay */}
      <AnimatePresence>
        {activeGame && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black flex flex-col"
          >
            {/* Game header */}
            <div className="flex items-center justify-between px-4 py-3 bg-black/80 border-b border-white/10">
              <div className="flex items-center gap-2">
                {(() => {
                  const logo = resolveGameLogo(activeGame);
                  return logo ? (
                    <img src={logo} alt={activeGame.game_name} width={24} height={24} className="w-6 h-6 rounded object-contain" />
                  ) : (
                    <span className="text-xl">{activeGame.game_emoji}</span>
                  );
                })()}
                <span className="text-white font-semibold">{activeGame.game_name}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 bg-white/10 px-3 py-1 rounded-full">
                  <Diamond3DIcon size={16} />
                  <span className="text-white text-sm font-medium">{balance?.toLocaleString() || 0}</span>
                </div>
                <button onClick={closeGame} className="p-2 rounded-full bg-white/10 hover:bg-white/20">
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>

            {/* Game iframe */}
            <div className="flex-1 relative">
              {buildingUrl ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-8 h-8 animate-spin text-white/60" />
                </div>
              ) : gameUrl ? (
                <iframe
                  src={gameUrl}
                  className="w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
                  sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                />
              ) : null}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-lg border-b border-white/5">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-1.5 rounded-full hover:bg-white/10">
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <span className="text-lg">🎮</span>
              </div>
              <h1 className="text-white font-bold text-xl">Games</h1>
            </div>
          </div>
          <div className="flex items-center gap-1 bg-white/10 px-3 py-1.5 rounded-full">
            <Diamond3DIcon size={16} />
            <span className="text-white text-sm font-bold">{balance?.toLocaleString() || 0}</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto pb-24 px-4 py-4">
        {loading ? (
          <div className="flex gap-3 overflow-hidden">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex-shrink-0 w-40 h-28 rounded-2xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : games.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <span className="text-6xl mb-4">🎮</span>
            <h2 className="text-white font-bold text-lg">No Games Available</h2>
            <p className="text-white/50 text-sm mt-1">Check back later for exciting games!</p>
          </div>
        ) : (
          <>
            {/* Featured Games */}
            {featuredGames.length > 0 && (
              <div className="mb-6">
                <h2 className="text-white/70 text-sm font-semibold uppercase tracking-wider mb-3">⭐ Featured</h2>
                <div className="grid grid-cols-2 gap-3">
                  {featuredGames.map((game, index) => (
                    <motion.button
                      key={game.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      onClick={() => handleGameClick(game)}
                      className={cn(
                        "relative rounded-2xl p-4 h-36 overflow-hidden",
                        "bg-gradient-to-br",
                        game.game_color || "from-purple-500 to-pink-500",
                        "group active:scale-[0.97] transition-transform"
                      )}
                    >
                      <div className="absolute top-2 right-2 bg-yellow-400 rounded-full p-1">
                        <Star className="w-3 h-3 text-yellow-900" fill="currentColor" />
                      </div>

                      {(() => {
                        const logo = resolveGameLogo(game);
                        return logo ? (
                          <img
                            src={logo}
                            alt={game.game_name}
                            loading="lazy"
                            width={40}
                            height={40}
                            className="absolute top-2 left-2 w-10 h-10 rounded-lg object-contain bg-white/10 backdrop-blur-sm p-1"
                          />
                        ) : null;
                      })()}

                      <div className="relative z-10 h-full flex flex-col justify-end text-left">
                        <span className="text-3xl mb-1">{game.game_emoji}</span>
                        <p className="text-white font-bold text-sm">{game.game_name}</p>
                        <div className="flex items-center gap-1 mt-1">
                          <Diamond className="w-3 h-3 text-white/80" />
                          <span className="text-white/80 text-xs">×{game.max_multiplier}</span>
                        </div>
                      </div>
                      <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </motion.button>
                  ))}
                </div>
              </div>
            )}

            {/* All Games */}
            {otherGames.length > 0 && (
              <div>
                <h2 className="text-white/70 text-sm font-semibold uppercase tracking-wider mb-3">🎲 All Games</h2>
                <div className="grid grid-cols-3 gap-2">
                  {otherGames.map((game, index) => (
                    <motion.button
                      key={game.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.03 }}
                      onClick={() => handleGameClick(game)}
                      className={cn(
                        "aspect-square rounded-xl p-2",
                        "bg-gradient-to-br",
                        game.game_color || "from-gray-700 to-gray-800",
                        "flex flex-col items-center justify-center gap-1",
                        "group active:scale-[0.95] transition-transform"
                      )}
                    >
                      {(() => {
                        const logo = resolveGameLogo(game);
                        return logo ? (
                          <img
                            src={logo}
                            alt={game.game_name}
                            loading="lazy"
                            width={40}
                            height={40}
                            className="w-10 h-10 rounded-lg object-contain"
                          />
                        ) : (
                          <span className="text-2xl">{game.game_emoji}</span>
                        );
                      })()}
                      <p className="text-white text-xs font-medium text-center truncate w-full">
                        {game.game_name}
                      </p>
                    </motion.button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <BottomNavigation activeTab="/games" onTabChange={(path) => navigate(path)} />
    </div>
  );
}
