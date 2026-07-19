import { motion } from "framer-motion";
import { Crown, Trophy, Swords, X, Sparkles } from "lucide-react";
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
  /** PK Battle Step 4 (P2): top-gifter MVP recognition. Optional — only rendered when server set mvp_user_id. */
  mvpName?: string | null;
  mvpAvatar?: string | null;
  mvpCoins?: number | null;
  /** P4: Bigo-parity reward badge — diamonds the local user earned from the 70/30 loser-score split. Winner-only. */
  rewardDiamonds?: number | null;
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
  mvpName,
  mvpAvatar,
  mvpCoins,
  rewardDiamonds,
  onClose,
}: PKBattleResultProps) => {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 40%, rgba(76,29,149,0.65) 0%, rgba(0,0,0,0.92) 70%)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />

      <motion.div
        className="relative w-full max-w-sm max-h-[95dvh] overflow-y-auto"
        initial={{ scale: 0.7, y: 60, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.85, y: 30, opacity: 0 }}
        transition={{ type: "spring", damping: 22, stiffness: 280 }}
      >
        <motion.button
          className="absolute -top-12 right-0 w-10 h-10 rounded-full flex items-center justify-center"
          style={{
            background: "rgba(0,0,0,0.45)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            border: "1px solid rgba(255,255,255,0.15)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12)",
            color: "white",
          }}
          onClick={onClose}
          whileTap={{ scale: 0.88 }}
        >
          <X className="w-5 h-5" />
        </motion.button>

        <div
          className="relative rounded-3xl overflow-hidden"
          style={{
            background:
              "linear-gradient(180deg, #1a0f33 0%, #140f23 50%, #0c0818 100%)",
            border: "1px solid rgba(255,255,255,0.12)",
            boxShadow:
              "0 30px 80px -20px rgba(0,0,0,0.8), 0 0 0 1px rgba(168,85,247,0.18), 0 0 60px -10px rgba(236,72,153,0.35), inset 0 1px 0 rgba(255,255,255,0.08)",
          }}
        >
          {/* Aurora overlay */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(80% 60% at 0% 0%, rgba(236,72,153,0.22) 0%, transparent 55%), radial-gradient(80% 60% at 100% 100%, rgba(168,85,247,0.22) 0%, transparent 55%), radial-gradient(70% 40% at 50% 0%, rgba(251,191,36,0.18) 0%, transparent 60%)",
            }}
          />
          {/* Shine sweep */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(115deg, transparent 35%, rgba(255,255,255,0.1) 50%, transparent 65%)",
              mixBlendMode: "overlay",
              animation: "giftSendShine 4.6s ease-in-out infinite",
            }}
          />

          {/* Header */}
          <div className="relative h-28 overflow-hidden">
            <motion.div
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(circle at 50% 50%, rgba(251,191,36,0.45) 0%, rgba(236,72,153,0.25) 35%, transparent 75%)",
              }}
              animate={{ scale: [1, 1.4, 1], opacity: [0.55, 1, 0.55] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <motion.div
                className="flex items-center gap-2.5"
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2, type: "spring", damping: 18 }}
              >
                <motion.div
                  animate={{ rotate: [0, -10, 0, 10, 0] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                  style={{ filter: "drop-shadow(0 0 8px rgba(251,191,36,0.85))" }}
                >
                  <Swords className="w-6 h-6 text-amber-400" />
                </motion.div>
                <h2
                  className="text-2xl font-extrabold tracking-wide"
                  style={{
                    background:
                      "linear-gradient(90deg, #fff 0%, #fde68a 50%, #fff 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    textShadow: "0 0 14px rgba(251,191,36,0.35)",
                  }}
                >
                  PK Battle
                </h2>
                <motion.div
                  animate={{ rotate: [0, 10, 0, -10, 0] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                  style={{ filter: "drop-shadow(0 0 8px rgba(251,191,36,0.85))" }}
                >
                  <Swords className="w-6 h-6 text-amber-400 transform scale-x-[-1]" />
                </motion.div>
              </motion.div>
            </div>
          </div>

          <div className="relative p-6 pt-2">
            {isDraw ? (
              <div className="text-center mb-6">
                <motion.div
                  className="text-4xl font-black mb-2 tabular-nums"
                  style={{
                    background:
                      "linear-gradient(180deg, #fde68a 0%, #fbbf24 50%, #d97706 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    filter:
                      "drop-shadow(0 2px 8px rgba(251,191,36,0.6)) drop-shadow(0 0 16px rgba(251,191,36,0.4))",
                  }}
                  initial={{ scale: 0, rotate: -8 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", delay: 0.3, damping: 14, stiffness: 220 }}
                >
                  DRAW!
                </motion.div>
                <p className="text-white/65 text-sm">Both scores are equal!</p>
              </div>
            ) : (
              <div className="text-center mb-6">
                <motion.div
                  className="inline-block"
                  initial={{ rotate: -25, scale: 0, y: -10 }}
                  animate={{ rotate: 0, scale: 1, y: 0 }}
                  transition={{ type: "spring", delay: 0.3, damping: 12, stiffness: 220 }}
                >
                  <motion.div
                    animate={{ y: [0, -4, 0] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                    style={{
                      filter:
                        "drop-shadow(0 4px 14px rgba(251,191,36,0.7)) drop-shadow(0 0 24px rgba(251,191,36,0.5))",
                    }}
                  >
                    <Trophy className="w-14 h-14 text-amber-400 mx-auto mb-2" />
                  </motion.div>
                </motion.div>
                <motion.div
                  className="text-4xl font-black tracking-wide"
                  style={{
                    background: isWinner
                      ? "linear-gradient(180deg, #fde68a 0%, #fbbf24 50%, #d97706 100%)"
                      : "linear-gradient(180deg, #e5e7eb 0%, #9ca3af 50%, #6b7280 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    filter: isWinner
                      ? "drop-shadow(0 2px 10px rgba(251,191,36,0.6)) drop-shadow(0 0 18px rgba(251,191,36,0.45))"
                      : "drop-shadow(0 2px 6px rgba(0,0,0,0.5))",
                  }}
                  initial={{ scale: 0, y: 8 }}
                  animate={{ scale: 1, y: 0 }}
                  transition={{ type: "spring", delay: 0.4, damping: 14, stiffness: 220 }}
                >
                  {isWinner ? "YOU WIN!" : "YOU LOST"}
                </motion.div>
              </div>
            )}

            <div className="flex items-center justify-between gap-4">
              {/* Winner */}
              <motion.div
                className="flex-1 text-center"
                initial={{ x: -30, opacity: 0, scale: 0.9 }}
                animate={{ x: 0, opacity: 1, scale: 1 }}
                transition={{ delay: 0.5, type: "spring", damping: 18 }}
              >
                <div className="relative inline-block mb-2">
                  <motion.div
                    className="w-20 h-20 rounded-full overflow-hidden"
                    style={{
                      border: "3px solid #fbbf24",
                      boxShadow:
                        "0 0 0 4px rgba(251,191,36,0.35), 0 0 30px rgba(251,191,36,0.65), 0 0 60px rgba(251,191,36,0.35), inset 0 1px 0 rgba(255,255,255,0.25)",
                    }}
                    animate={{ scale: [1, 1.06, 1] }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <img loading="lazy" decoding="async" 
                      src={winnerAvatar}
                      alt={winnerName}
                      className="w-full h-full object-cover" />
                  </motion.div>
                  <motion.div
                    className="absolute -top-4 left-1/2 -translate-x-1/2"
                    animate={{ y: [0, -5, 0], rotate: [0, -4, 0, 4, 0] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    style={{
                      filter:
                        "drop-shadow(0 4px 10px rgba(251,191,36,0.8)) drop-shadow(0 0 16px rgba(251,191,36,0.6))",
                    }}
                  >
                    <Crown className="w-7 h-7 text-amber-400" />
                  </motion.div>
                  {/* Confetti dots around winner */}
                  {[...Array(6)].map((_, i) => (
                    <motion.div
                      key={i}
                      className="absolute rounded-full"
                      initial={{
                        x: 0,
                        y: 0,
                        scale: 0,
                        opacity: 0,
                      }}
                      animate={{
                        x: Math.cos((i * 60 * Math.PI) / 180) * 55,
                        y: Math.sin((i * 60 * Math.PI) / 180) * 55,
                        scale: [0, 1.4, 0],
                        opacity: [0, 1, 0],
                      }}
                      transition={{
                        duration: 1.6,
                        delay: 0.7 + i * 0.1,
                        repeat: Infinity,
                        repeatDelay: 2,
                        ease: "easeOut",
                      }}
                      style={{
                        left: "50%",
                        top: "50%",
                        width: i % 2 === 0 ? 6 : 4,
                        height: i % 2 === 0 ? 6 : 4,
                        background: i % 2 === 0 ? "#fbbf24" : "#f0abfc",
                        boxShadow: `0 0 8px ${i % 2 === 0 ? "rgba(251,191,36,0.9)" : "rgba(240,171,252,0.9)"}`,
                      }}
                    />
                  ))}
                </div>
                <p
                  className="text-white font-bold text-sm truncate px-1"
                  style={{ textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}
                >
                  {winnerName}
                </p>
                <div className="flex items-center justify-center gap-1.5 mt-1.5">
                  <span className="text-xl" style={{ filter: "drop-shadow(0 2px 4px rgba(251,191,36,0.6))" }}>
                    🪙
                  </span>
                  <span
                    className="text-2xl font-black tabular-nums"
                    style={{
                      background: "linear-gradient(180deg, #fef3c7 0%, #fbbf24 100%)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      filter: "drop-shadow(0 0 10px rgba(251,191,36,0.55))",
                    }}
                  >
                    {winnerScore}
                  </span>
                </div>
              </motion.div>

              {/* VS divider */}
              <motion.div
                className="relative w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                style={{
                  background: "linear-gradient(135deg, #ec4899, #a855f7)",
                  boxShadow:
                    "0 0 0 2px rgba(255,255,255,0.18), 0 0 16px rgba(236,72,153,0.55), inset 0 1px 0 rgba(255,255,255,0.3)",
                }}
                initial={{ scale: 0, rotate: -90 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.55, type: "spring", damping: 16, stiffness: 260 }}
              >
                <span
                  className="text-white font-extrabold text-[10px]"
                  style={{ textShadow: "0 1px 2px rgba(0,0,0,0.4)" }}
                >
                  VS
                </span>
              </motion.div>

              {/* Loser */}
              <motion.div
                className="flex-1 text-center"
                initial={{ x: 30, opacity: 0, scale: 0.9 }}
                animate={{ x: 0, opacity: 0.65, scale: 1 }}
                transition={{ delay: 0.5, type: "spring", damping: 18 }}
              >
                <div className="relative inline-block mb-2">
                  <div
                    className="w-16 h-16 rounded-full overflow-hidden grayscale"
                    style={{
                      border: "2px solid rgba(255,255,255,0.2)",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)",
                    }}
                  >
                    <img loading="lazy" decoding="async" 
                      src={loserAvatar}
                      alt={loserName}
                      className="w-full h-full object-cover" />
                  </div>
                </div>
                <p
                  className="text-white/65 font-medium text-sm truncate px-1"
                  style={{ textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}
                >
                  {loserName}
                </p>
                <div className="flex items-center justify-center gap-1.5 mt-1.5">
                  <span className="text-lg opacity-60">🪙</span>
                  <span className="text-lg font-bold text-white/70 tabular-nums">
                    {loserScore}
                  </span>
                </div>
              </motion.div>
            </div>

            {isWinner && !isDraw && typeof rewardDiamonds === "number" && rewardDiamonds > 0 && (
              <motion.div
                className="mt-5 relative rounded-2xl overflow-hidden flex items-center justify-center gap-2 px-4 py-2.5"
                initial={{ y: 14, opacity: 0, scale: 0.95 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                transition={{ delay: 0.6, type: "spring", damping: 18, stiffness: 240 }}
                style={{
                  background:
                    "linear-gradient(135deg, rgba(34,197,94,0.22) 0%, rgba(16,185,129,0.14) 50%, rgba(34,197,94,0.22) 100%)",
                  border: "1px solid rgba(34,197,94,0.5)",
                  boxShadow:
                    "0 10px 24px -8px rgba(34,197,94,0.45), 0 0 16px rgba(34,197,94,0.3), inset 0 1px 0 rgba(255,255,255,0.18)",
                }}
              >
                <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-emerald-200">
                  Reward Earned
                </span>
                <span className="text-base" style={{ filter: "drop-shadow(0 1px 3px rgba(34,197,94,0.55))" }}>
                  🪙
                </span>
                <span
                  className="text-lg font-black tabular-nums"
                  style={{
                    background: "linear-gradient(180deg, #d1fae5 0%, #34d399 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    filter: "drop-shadow(0 0 8px rgba(34,197,94,0.5))",
                  }}
                >
                  +{rewardDiamonds}
                </span>
              </motion.div>
            )}

            {mvpName && (
              <motion.div
                className="mt-5 relative rounded-2xl overflow-hidden"
                initial={{ y: 16, opacity: 0, scale: 0.95 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                transition={{ delay: 0.65, type: "spring", damping: 18, stiffness: 240 }}
                style={{
                  background:
                    "linear-gradient(135deg, rgba(251,191,36,0.18) 0%, rgba(217,119,6,0.12) 50%, rgba(251,191,36,0.18) 100%)",
                  border: "1px solid rgba(251,191,36,0.45)",
                  boxShadow:
                    "0 10px 28px -8px rgba(251,191,36,0.45), 0 0 18px rgba(251,191,36,0.3), inset 0 1px 0 rgba(255,255,255,0.18)",
                }}
              >
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(115deg, transparent 35%, rgba(255,255,255,0.18) 50%, transparent 65%)",
                    animation: "giftSendShine 3.2s ease-in-out infinite",
                  }}
                />
                <div className="relative flex items-center gap-3 px-3 py-2.5">
                  <div className="relative shrink-0">
                    <motion.div
                      className="w-11 h-11 rounded-full overflow-hidden"
                      style={{
                        border: "2px solid #fbbf24",
                        boxShadow:
                          "0 0 0 2px rgba(251,191,36,0.35), 0 0 14px rgba(251,191,36,0.55), inset 0 1px 0 rgba(255,255,255,0.22)",
                      }}
                      animate={{ scale: [1, 1.05, 1] }}
                      transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                    >
                      {mvpAvatar ? (
                        <img
                          loading="lazy"
                          decoding="async"
                          src={mvpAvatar}
                          alt={mvpName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-amber-300 to-amber-600 flex items-center justify-center">
                          <Sparkles className="w-5 h-5 text-white" />
                        </div>
                      )}
                    </motion.div>
                    <motion.div
                      className="absolute -top-2.5 left-1/2 -translate-x-1/2"
                      animate={{ y: [0, -2, 0], rotate: [0, -5, 0, 5, 0] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                      style={{
                        filter:
                          "drop-shadow(0 2px 6px rgba(251,191,36,0.8)) drop-shadow(0 0 10px rgba(251,191,36,0.5))",
                      }}
                    >
                      <Crown className="w-4 h-4 text-amber-400" />
                    </motion.div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="text-[10px] font-extrabold uppercase tracking-[0.18em]"
                        style={{
                          background:
                            "linear-gradient(90deg, #fde68a 0%, #fbbf24 100%)",
                          WebkitBackgroundClip: "text",
                          WebkitTextFillColor: "transparent",
                        }}
                      >
                        MVP Gifter
                      </span>
                      <Sparkles className="w-3 h-3 text-amber-300" />
                    </div>
                    <p
                      className="text-white text-sm font-extrabold truncate"
                      style={{ textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}
                    >
                      {mvpName}
                    </p>
                  </div>
                  {typeof mvpCoins === "number" && mvpCoins > 0 && (
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-base" style={{ filter: "drop-shadow(0 1px 3px rgba(251,191,36,0.55))" }}>
                        🪙
                      </span>
                      <span
                        className="text-base font-extrabold tabular-nums"
                        style={{
                          background: "linear-gradient(180deg, #fef3c7 0%, #fbbf24 100%)",
                          WebkitBackgroundClip: "text",
                          WebkitTextFillColor: "transparent",
                          filter: "drop-shadow(0 0 8px rgba(251,191,36,0.5))",
                        }}
                      >
                        {mvpCoins}
                      </span>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            <motion.div
              className="mt-6"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.7, type: "spring", damping: 20 }}
            >
              <motion.button
                className="relative w-full h-12 rounded-full text-white font-extrabold text-base overflow-hidden"
                style={{
                  background:
                    "linear-gradient(95deg, #ec4899 0%, #d946ef 50%, #a855f7 100%)",
                  boxShadow:
                    "0 10px 28px -8px rgba(236,72,153,0.6), 0 4px 14px -6px rgba(168,85,247,0.5), inset 0 1px 0 rgba(255,255,255,0.25)",
                  animation: "giftSendBreathe 2.4s ease-in-out infinite",
                }}
                onClick={onClose}
                whileTap={{ scale: 0.97 }}
              >
                <span
                  className="relative z-10"
                  style={{ textShadow: "0 1px 2px rgba(0,0,0,0.35)" }}
                >
                  Close
                </span>
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(115deg, transparent 35%, rgba(255,255,255,0.32) 50%, transparent 65%)",
                    animation: "giftSendShine 2.6s ease-in-out infinite",
                  }}
                />
              </motion.button>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
