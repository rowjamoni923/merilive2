import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Diamond, Star, Users, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

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
}

export function GamesSection() {
  const [games, setGames] = useState<GameSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchGames();
    // game_settings is NOT in realtime publication — no subscription needed.
    // Games list rarely changes; admin updates are reflected on next page load.
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

  const handleGameClick = (game: GameSetting) => {
    // Always go to games hub - individual games open there via iframe
    navigate("/games");
  };

  if (loading && games.length === 0) {
    return (
      <div className="px-4 py-4">
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex-shrink-0 w-40 h-28 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (games.length === 0) {
    return null;
  }

  const featuredGames = games.filter(g => g.is_featured);
  const otherGames = games.filter(g => !g.is_featured);

  return (
    <div className="px-4 py-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <span className="text-lg">🎮</span>
          </div>
          <div>
            <h2 className="text-white font-bold text-lg">Games</h2>
            <p className="text-white/50 text-xs">Win diamonds!</p>
          </div>
        </div>
        <button 
          onClick={() => navigate("/games/roulette")}
          className="flex items-center gap-1 text-purple-400 text-sm"
        >
          See All <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Featured Games */}
      {featuredGames.length > 0 && (
        <div className="mb-4">
          <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2">
            {featuredGames.map((game, index) => (
              <motion.button
                key={game.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                onClick={() => handleGameClick(game)}
                className={cn(
                  "flex-shrink-0 w-40 h-28 rounded-2xl p-3",
                  "bg-gradient-to-br",
                  game.game_color || "from-purple-500 to-pink-500",
                  "relative overflow-hidden group"
                )}
              >
                {/* Featured Badge */}
                <div className="absolute top-2 right-2 bg-yellow-400 rounded-full p-1">
                  <Star className="w-3 h-3 text-yellow-900" fill="currentColor" />
                </div>

                {/* Game Info */}
                <div className="relative z-10 h-full flex flex-col justify-between">
                  <div>
                    <span className="text-3xl">{game.game_emoji}</span>
                  </div>
                  <div>
                    <p className="text-white font-bold text-sm">{game.game_name}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <Diamond className="w-3 h-3 text-white/80" />
                      <span className="text-white/80 text-xs">×{game.max_multiplier}</span>
                    </div>
                  </div>
                </div>

                {/* Hover Effect */}
                <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
              </motion.button>
            ))}
          </div>
        </div>
      )}

      {/* Other Games Grid */}
      {otherGames.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {otherGames.map((game, index) => (
            <motion.button
              key={game.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.05 }}
              onClick={() => handleGameClick(game)}
              className={cn(
                "aspect-square rounded-xl p-2",
                "bg-gradient-to-br",
                game.game_color || "from-gray-700 to-gray-800",
                "flex flex-col items-center justify-center gap-1",
                "group hover:scale-105 transition-transform"
              )}
            >
              <span className="text-2xl">{game.game_emoji}</span>
              <p className="text-white text-xs font-medium text-center truncate w-full">
                {game.game_name}
              </p>
            </motion.button>
          ))}
        </div>
      )}
    </div>
  );
}
