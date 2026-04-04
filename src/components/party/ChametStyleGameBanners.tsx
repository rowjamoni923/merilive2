import { motion } from "framer-motion";
import { Trophy, Sparkles } from "lucide-react";

interface ChametStyleGameBannersProps {
  jackpotAmount?: number;
  pkAmount?: number;
  onJackpotClick?: () => void;
  onPKClick?: () => void;
}

export const ChametStyleGameBanners = ({
  jackpotAmount = 0,
  pkAmount = 0,
  onJackpotClick,
  onPKClick
}: ChametStyleGameBannersProps) => {
  const formatAmount = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
    return num.toLocaleString();
  };

  return (
    <div className="absolute right-3 bottom-32 flex flex-col gap-2 z-30">
      {/* Big Win / Jackpot Banner */}
      {jackpotAmount > 0 && (
        <motion.button
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onJackpotClick}
          className="relative overflow-hidden rounded-xl shadow-2xl"
        >
          {/* Gradient Background */}
          <div className="bg-gradient-to-r from-purple-600 via-pink-500 to-amber-400 p-[2px] rounded-xl">
            <div className="bg-gradient-to-r from-purple-900/90 via-pink-900/90 to-amber-900/90 backdrop-blur-sm rounded-xl px-3 py-2">
              {/* Sparkle animations */}
              <motion.div
                animate={{ 
                  rotate: [0, 10, -10, 0],
                  scale: [1, 1.1, 1]
                }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute top-1 right-1"
              >
                <Sparkles className="w-4 h-4 text-yellow-300" />
              </motion.div>

              <div className="flex flex-col items-center">
                <span className="text-[10px] font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 to-amber-400 tracking-wider">
                  BIG WIN
                </span>
                <div className="flex items-center gap-1">
                  <span className="text-yellow-400">💎</span>
                  <span className="text-sm font-bold text-white">
                    {formatAmount(jackpotAmount)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Shimmer effect */}
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
            animate={{ x: ['-100%', '200%'] }}
            transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
          />
        </motion.button>
      )}

      {/* City PK Banner */}
      {pkAmount > 0 && (
        <motion.button
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onPKClick}
          className="relative overflow-hidden rounded-xl shadow-2xl"
        >
          {/* Gradient Background */}
          <div className="bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 p-[2px] rounded-xl">
            <div className="bg-gradient-to-r from-cyan-900/90 via-blue-900/90 to-purple-900/90 backdrop-blur-sm rounded-xl px-3 py-2">
              {/* Trophy icon */}
              <motion.div
                animate={{ y: [0, -2, 0] }}
                transition={{ duration: 1, repeat: Infinity }}
                className="absolute top-1 left-1"
              >
                <Trophy className="w-4 h-4 text-amber-400" />
              </motion.div>

              <div className="flex flex-col items-center">
                <div className="flex items-center gap-1">
                  <span className="text-xs font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-blue-300 to-purple-300">
                    City
                  </span>
                  <span className="text-xs font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-red-400">
                    PK
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-amber-400">🪙</span>
                  <span className="text-xs font-bold text-white">
                    {formatAmount(pkAmount)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Pulse effect */}
          <motion.div
            className="absolute inset-0 border-2 border-cyan-400/50 rounded-xl"
            animate={{ opacity: [0.5, 1, 0.5], scale: [1, 1.02, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        </motion.button>
      )}
    </div>
  );
};

export default ChametStyleGameBanners;
