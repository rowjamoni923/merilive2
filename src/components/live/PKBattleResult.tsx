import { motion } from "framer-motion";
import { Crown, Trophy, Swords, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PKBattleResultProps {
  isWinner: boolean;
  isDraw: boolean;
  winnerName: string;
  winnerAvatar: string;
  winnerScore: number;
  loserName: string;
  loserAvatar: string;
  loserScore: number;
  onClose: () => void;
}

export const PKBattleResult = ({
  isWinner,
  isDraw,
  winnerName,
  winnerAvatar,
  winnerScore,
  loserName,
  loserAvatar,
  loserScore,
  onClose,
}: PKBattleResultProps) => {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

      <motion.div
        className="relative w-full max-w-sm"
        initial={{ scale: 0.5, y: 50 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.5, y: 50 }}
        transition={{ type: "spring", damping: 15 }}
      >
        <Button
          size="icon"
          variant="ghost"
          className="absolute -top-12 right-0 w-10 h-10 rounded-full bg-white/10 text-white"
          onClick={onClose}
        >
          <X className="w-5 h-5" />
        </Button>

        <div className="bg-gradient-to-b from-purple-800 via-purple-900 to-purple-950 rounded-3xl overflow-hidden border border-white/20 shadow-2xl">
          <div className="relative h-24 bg-gradient-to-r from-pink-500/20 via-amber-500/20 to-purple-500/20 overflow-hidden">
            <motion.div
              className="absolute inset-0"
              style={{
                background: "radial-gradient(circle at 50% 50%, rgba(251,191,36,0.3) 0%, transparent 70%)",
              }}
              animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            
            <div className="absolute inset-0 flex items-center justify-center">
              <motion.div
                className="flex items-center gap-2"
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                <Swords className="w-6 h-6 text-amber-400" />
                <h2 className="text-2xl font-bold text-white">PK Battle</h2>
                <Swords className="w-6 h-6 text-amber-400 transform scale-x-[-1]" />
              </motion.div>
            </div>
          </div>

          <div className="p-6">
            {isDraw ? (
              <div className="text-center mb-6">
                <motion.div
                  className="text-3xl font-bold text-amber-400 mb-2"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", delay: 0.3 }}
                >
                  DRAW!
                </motion.div>
                <p className="text-white/60">Both scores are equal!</p>
              </div>
            ) : (
              <div className="text-center mb-6">
                <motion.div
                  className="inline-block"
                  initial={{ rotate: -20, scale: 0 }}
                  animate={{ rotate: 0, scale: 1 }}
                  transition={{ type: "spring", delay: 0.3 }}
                >
                  <Trophy className="w-12 h-12 text-amber-400 mx-auto mb-2" />
                </motion.div>
                <motion.div
                  className="text-3xl font-bold"
                  style={{
                    background: "linear-gradient(135deg, #fbbf24, #f59e0b, #fbbf24)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", delay: 0.4 }}
                >
                  {isWinner ? "YOU WIN!" : "YOU LOST"}
                </motion.div>
              </div>
            )}

            <div className="flex items-center justify-between gap-4">
              <motion.div
                className="flex-1 text-center"
                initial={{ x: -30, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                <div className="relative inline-block mb-2">
                  <motion.div
                    className="w-20 h-20 rounded-full overflow-hidden border-4 border-amber-400 ring-4 ring-amber-400/30"
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    <img
                      src={winnerAvatar}
                      alt={winnerName}
                      className="w-full h-full object-cover"
                    />
                  </motion.div>
                  <motion.div
                    className="absolute -top-3 left-1/2 -translate-x-1/2"
                    animate={{ y: [0, -5, 0] }}
                    transition={{ duration: 1, repeat: Infinity }}
                  >
                    <Crown className="w-6 h-6 text-amber-400" />
                  </motion.div>
                </div>
                <p className="text-white font-semibold">{winnerName}</p>
                <div className="flex items-center justify-center gap-1 mt-1">
                  <span className="text-2xl">🪙</span>
                  <span className="text-xl font-bold text-amber-400">{winnerScore}</span>
                </div>
              </motion.div>

              <div className="text-white/65 font-bold">VS</div>

              <motion.div
                className="flex-1 text-center opacity-60"
                initial={{ x: 30, opacity: 0 }}
                animate={{ x: 0, opacity: 0.6 }}
                transition={{ delay: 0.5 }}
              >
                <div className="relative inline-block mb-2">
                  <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-white/20 grayscale">
                    <img
                      src={loserAvatar}
                      alt={loserName}
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
                <p className="text-white/60 font-medium">{loserName}</p>
                <div className="flex items-center justify-center gap-1 mt-1">
                  <span className="text-lg">🪙</span>
                  <span className="text-lg font-bold text-white/70">{loserScore}</span>
                </div>
              </motion.div>
            </div>

            <motion.div
              className="mt-6"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.7 }}
            >
              <Button
                className="w-full h-12 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 rounded-full text-white font-bold"
                onClick={onClose}
              >
                Close
              </Button>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
