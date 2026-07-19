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
        <div className="flex items-center gap-2.5">
          <motion.div
            whileHover={{ scale: 1.05, rotate: -4 }}
            whileTap={{ scale: 0.94 }}
            className="w-10 h-10 rounded-2xl flex items-center justify-center relative overflow-hidden"
            style={{
              background: 'radial-gradient(120% 120% at 30% 20%, #f0abfc 0%, #a855f7 45%, #6b21a8 100%)',
              boxShadow: '0 10px 24px -8px rgba(168,85,247,0.55), inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -2px 6px rgba(0,0,0,0.35)'
            }}
          >
            <span className="text-lg drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]">🎮</span>
            <div className="absolute inset-x-2 top-1 h-2 rounded-full bg-white/35 blur-[2px]" />
          </motion.div>
          <div>
            <h2 className="text-white font-extrabold text-lg tracking-wide drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">Games</h2>
            <p className="text-white/55 text-[11px] font-medium">Win diamonds instantly!</p>
          </div>
        </div>
        <motion.button
          whileHover={{ scale: 1.05, x: 2 }}
          whileTap={{ scale: 0.94 }}
          onClick={() => navigate("/games/roulette")}
          className="flex items-center gap-1 px-3 py-1.5 rounded-full text-purple-200 text-xs font-semibold bg-white/5 border border-white/10 backdrop-blur-md hover:bg-white/10"
          style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15)' }}
        >
          See All <ArrowRight className="w-3.5 h-3.5" />
        </motion.button>
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
                transition={{ delay: index * 0.08 }}
                whileHover={{ y: -3, scale: 1.03 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => handleGameClick(game)}
                className={cn(
                  "flex-shrink-0 w-40 h-28 rounded-2xl p-3",
                  "bg-gradient-to-br",
                  game.game_color || "from-purple-500 to-pink-500",
                  "relative overflow-hidden group"
                )}
                style={{
                }}
              >
                <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent pointer-events-none" />

                <div className="absolute top-2 right-2 bg-yellow-400 rounded-full p-1 shadow-[0_2px_8px_rgba(250,204,21,0.6)] ring-1 ring-yellow-200/60">
                  <Star className="w-3 h-3 text-yellow-900" fill="currentColor" />
                </div>

                <div className="relative z-10 h-full flex flex-col justify-between">
                  <div>
                    <span className="text-3xl drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)]">{game.game_emoji}</span>
                  </div>
                  <div>
                    <p className="text-white font-bold text-sm drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">{game.game_name}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <Diamond className="w-3 h-3 text-white/85" />
                      <span className="text-white/85 text-xs font-semibold">×{game.max_multiplier}</span>
                    </div>
                  </div>
                </div>

                <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/25 to-transparent skew-x-12" />
              </motion.button>
            ))}
          </div>
        </div>
      )}

      {/* Other Games Grid */}
      {otherGames.length > 0 && (
        <div className="grid grid-cols-3 gap-2.5">
          {otherGames.map((game, index) => (
            <motion.button
              key={game.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.05 }}
              whileHover={{ y: -2, scale: 1.05 }}
              whileTap={{ scale: 0.94 }}
              onClick={() => handleGameClick(game)}
              className={cn(
                "aspect-square rounded-2xl p-2 relative overflow-hidden",
                "bg-gradient-to-br",
                game.game_color || "from-gray-700 to-gray-800",
                "flex flex-col items-center justify-center gap-1"
              )}
              style={{
              }}
            >
              <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/20 to-transparent pointer-events-none" />
              <span className="text-2xl relative drop-shadow-[0_2px_3px_rgba(0,0,0,0.4)]">{game.game_emoji}</span>
              <p className="text-white text-[11px] font-semibold text-center truncate w-full relative drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
                {game.game_name}
              </p>
            </motion.button>
          ))}
        </div>
      )}
    </div>
  );
}
