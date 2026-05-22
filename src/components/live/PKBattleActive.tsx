import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Crown, Swords, Timer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface PKBattleActiveProps {
  battleId: string;
  isChallenger: boolean;
  challengerName: string;
  challengerAvatar: string;
  challengerLevel: number;
  opponentName: string;
  opponentAvatar: string;
  opponentLevel: number;
  onBattleEnd: (winnerId: string | null) => void;
}

export const PKBattleActive = ({
  battleId,
  isChallenger,
  challengerName,
  challengerAvatar,
  challengerLevel,
  opponentName,
  opponentAvatar,
  opponentLevel,
  onBattleEnd,
}: PKBattleActiveProps) => {
  const [challengerScore, setChallengerScore] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(180); // 3 minutes
  const [battleEnded, setBattleEnded] = useState(false);

  // Pkg82e: LiveKit-purist policy — PK score sync via bounded REST poll (battle ≤180s,
  // dual hosts in SEPARATE LiveKit rooms so DataPackets can't cross-broadcast).
  // Industry pattern (Bigo/Tango/Chamet): poll pk_battles row at 5s interval during
  // active battle. Replaces 2 Supabase Realtime channels (pk_battle_live_${id} +
  // pk_gifts_${id}). Bounded duration = $1400-bill safe; Pkg62 G1 floor = 5000ms.
  useEffect(() => {
    if (battleEnded) return;
    let cancelled = false;

    const fetchBattle = async () => {
      const { data } = await supabase
        .from("pk_battles")
        .select("challenger_score, opponent_score, status, winner_id")
        .eq("id", battleId)
        .maybeSingle();

      if (cancelled || !data) return;
      setChallengerScore(data.challenger_score || 0);
      setOpponentScore(data.opponent_score || 0);

      if (data.status === "completed") {
        setBattleEnded(true);
        onBattleEnd(data.winner_id);
      }
    };

    // Immediate fetch + bounded 5s poll for the rest of the battle.
    // guard-ok: pk-battle score sync, bounded ≤180s, no Supabase Realtime fallback
    fetchBattle();
    const pollId = setInterval(fetchBattle, 5000);

    return () => {
      cancelled = true;
      clearInterval(pollId);
    };
  }, [battleId, battleEnded, onBattleEnd]);


  // Countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          endBattle();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const endBattle = async () => {
    if (battleEnded) return;
    
    const winnerId = challengerScore > opponentScore 
      ? (isChallenger ? "challenger" : "opponent")
      : challengerScore < opponentScore 
      ? (isChallenger ? "opponent" : "challenger")
      : null;

    try {
      await supabase
        .from("pk_battles")
        .update({
          status: "completed",
          ended_at: new Date().toISOString(),
          winner_id: winnerId,
        })
        .eq("id", battleId);
    } catch (error) {
      console.error("Error ending battle:", error);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const totalScore = challengerScore + opponentScore;
  const challengerPercent = totalScore > 0 ? (challengerScore / totalScore) * 100 : 50;
  const opponentPercent = totalScore > 0 ? (opponentScore / totalScore) * 100 : 50;

  const challengerWinning = challengerScore > opponentScore;
  const opponentWinning = opponentScore > challengerScore;

  const timeUrgent = timeLeft <= 30;

  return (
    <motion.div
      className="absolute top-24 left-0 right-0 z-30 px-3"
      initial={{ y: -50, opacity: 0, scale: 0.96 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      transition={{ type: "spring", damping: 24, stiffness: 320 }}
    >
      <div
        className="relative rounded-2xl overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, rgba(76,29,149,0.92) 0%, rgba(131,24,67,0.92) 50%, rgba(76,29,149,0.92) 100%)",
          backdropFilter: "blur(20px) saturate(140%)",
          WebkitBackdropFilter: "blur(20px) saturate(140%)",
          border: "1px solid rgba(255,255,255,0.14)",
          boxShadow:
            "0 18px 40px -12px rgba(236,72,153,0.45), 0 6px 20px -8px rgba(168,85,247,0.4), inset 0 1px 0 rgba(255,255,255,0.16)",
        }}
      >
        {/* Battle aurora overlay */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 80% at 0% 0%, rgba(236,72,153,0.22) 0%, transparent 55%), radial-gradient(120% 80% at 100% 100%, rgba(168,85,247,0.22) 0%, transparent 55%)",
          }}
        />
        {/* Shine sweep */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(115deg, transparent 35%, rgba(255,255,255,0.12) 50%, transparent 65%)",
            mixBlendMode: "overlay",
            animation: "giftSendShine 4.2s ease-in-out infinite",
          }}
        />

        {/* Timer and Title */}
        <div
          className="relative flex items-center justify-center gap-2 py-2"
          style={{
            background:
              "linear-gradient(90deg, rgba(236,72,153,0.22) 0%, rgba(168,85,247,0.22) 100%)",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <motion.div
            animate={{ rotate: [0, -8, 0, 8, 0] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            style={{ filter: "drop-shadow(0 0 6px rgba(251,191,36,0.7))" }}
          >
            <Swords className="w-4 h-4 text-amber-400" />
          </motion.div>
          <span
            className="font-extrabold text-sm tracking-wide"
            style={{
              background: "linear-gradient(90deg, #fff 0%, #fde68a 50%, #fff 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              textShadow: "0 0 12px rgba(251,191,36,0.3)",
            }}
          >
            PK BATTLE
          </span>
          <motion.div
            className="flex items-center gap-1 rounded-full px-2 py-0.5"
            style={{
              background: timeUrgent
                ? "linear-gradient(135deg, rgba(239,68,68,0.5), rgba(220,38,38,0.4))"
                : "rgba(0,0,0,0.35)",
              border: timeUrgent ? "1px solid rgba(252,165,165,0.5)" : "1px solid rgba(255,255,255,0.08)",
              boxShadow: timeUrgent ? "0 0 14px rgba(239,68,68,0.5)" : "none",
            }}
            animate={timeUrgent ? { scale: [1, 1.06, 1] } : {}}
            transition={{ duration: 1, repeat: Infinity }}
          >
            <Timer className={`w-3 h-3 ${timeUrgent ? "text-rose-200" : "text-amber-400"}`} />
            <span className={`font-mono text-sm tabular-nums font-bold ${timeUrgent ? "text-rose-100" : "text-amber-300"}`}>
              {formatTime(timeLeft)}
            </span>
          </motion.div>
          <motion.div
            animate={{ rotate: [0, 8, 0, -8, 0] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            style={{ filter: "drop-shadow(0 0 6px rgba(251,191,36,0.7))" }}
          >
            <Swords className="w-4 h-4 text-amber-400 transform scale-x-[-1]" />
          </motion.div>
        </div>

        {/* VS Section */}
        <div className="relative p-3">
          <div className="flex items-center justify-between gap-2">
            {/* Challenger */}
            <div className="flex-1 flex items-center gap-2">
              <div className="relative">
                <motion.div
                  className="w-12 h-12 rounded-full overflow-hidden"
                  style={{
                    border: challengerWinning ? "2px solid #fbbf24" : "2px solid #ec4899",
                    boxShadow: challengerWinning
                      ? "0 0 0 3px rgba(251,191,36,0.35), 0 0 18px rgba(251,191,36,0.6), inset 0 1px 0 rgba(255,255,255,0.2)"
                      : "0 0 0 2px rgba(236,72,153,0.35), 0 0 14px rgba(236,72,153,0.55), inset 0 1px 0 rgba(255,255,255,0.18)",
                  }}
                  animate={challengerWinning ? { scale: [1, 1.06, 1] } : {}}
                  transition={{ duration: 0.7, repeat: Infinity }}
                >
                  <img
                    src={challengerAvatar || "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150"}
                    alt={challengerName}
                    className="w-full h-full object-cover"
                  />
                </motion.div>
                {challengerWinning && (
                  <motion.div
                    className="absolute -top-2.5 left-1/2 -translate-x-1/2"
                    initial={{ y: 4, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    style={{ filter: "drop-shadow(0 0 6px rgba(251,191,36,0.9))" }}
                  >
                    <Crown className="w-4 h-4 text-amber-400" />
                  </motion.div>
                )}
                <div
                  className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-1 py-0.5 rounded text-[6px] font-extrabold text-black"
                  style={{
                    background: "linear-gradient(135deg, #fbbf24, #d97706)",
                    boxShadow: "0 0 8px rgba(251,191,36,0.5), inset 0 1px 0 rgba(255,255,255,0.4)",
                  }}
                >
                  Lv{challengerLevel}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-semibold truncate" style={{ textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}>
                  {challengerName}
                </p>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <motion.span
                    key={challengerScore}
                    initial={{ scale: 1.25, color: "#fff" }}
                    animate={{ scale: 1, color: "#fbbf24" }}
                    transition={{ duration: 0.4 }}
                    className="text-amber-400 text-lg font-extrabold tabular-nums"
                    style={{ textShadow: "0 0 10px rgba(251,191,36,0.5)" }}
                  >
                    {challengerScore}
                  </motion.span>
                  <span className="text-white/70 text-[10px]">diamonds</span>
                </div>
              </div>
            </div>

            {/* VS Badge */}
            <motion.div
              className="relative w-10 h-10 rounded-full flex items-center justify-center shrink-0"
              style={{
                background: "linear-gradient(135deg, #ec4899, #a855f7)",
                boxShadow:
                  "0 0 0 2px rgba(255,255,255,0.18), 0 0 18px rgba(236,72,153,0.6), inset 0 1px 0 rgba(255,255,255,0.3)",
              }}
              animate={{ rotate: [0, 360] }}
              transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
            >
              <span
                className="text-white font-extrabold text-xs"
                style={{ textShadow: "0 1px 2px rgba(0,0,0,0.4)" }}
              >
                VS
              </span>
            </motion.div>

            {/* Opponent */}
            <div className="flex-1 flex items-center gap-2 flex-row-reverse">
              <div className="relative">
                <motion.div
                  className="w-12 h-12 rounded-full overflow-hidden"
                  style={{
                    border: opponentWinning ? "2px solid #fbbf24" : "2px solid #a855f7",
                    boxShadow: opponentWinning
                      ? "0 0 0 3px rgba(251,191,36,0.35), 0 0 18px rgba(251,191,36,0.6), inset 0 1px 0 rgba(255,255,255,0.2)"
                      : "0 0 0 2px rgba(168,85,247,0.35), 0 0 14px rgba(168,85,247,0.55), inset 0 1px 0 rgba(255,255,255,0.18)",
                  }}
                  animate={opponentWinning ? { scale: [1, 1.06, 1] } : {}}
                  transition={{ duration: 0.7, repeat: Infinity }}
                >
                  <img
                    src={opponentAvatar || "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150"}
                    alt={opponentName}
                    className="w-full h-full object-cover"
                  />
                </motion.div>
                {opponentWinning && (
                  <motion.div
                    className="absolute -top-2.5 left-1/2 -translate-x-1/2"
                    initial={{ y: 4, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    style={{ filter: "drop-shadow(0 0 6px rgba(251,191,36,0.9))" }}
                  >
                    <Crown className="w-4 h-4 text-amber-400" />
                  </motion.div>
                )}
                <div
                  className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-1 py-0.5 rounded text-[6px] font-extrabold text-black"
                  style={{
                    background: "linear-gradient(135deg, #fbbf24, #d97706)",
                    boxShadow: "0 0 8px rgba(251,191,36,0.5), inset 0 1px 0 rgba(255,255,255,0.4)",
                  }}
                >
                  Lv{opponentLevel}
                </div>
              </div>
              <div className="flex-1 min-w-0 text-right">
                <p className="text-white text-xs font-semibold truncate" style={{ textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}>
                  {opponentName}
                </p>
                <div className="flex items-baseline gap-1 mt-0.5 justify-end">
                  <span className="text-white/70 text-[10px]">diamonds</span>
                  <motion.span
                    key={opponentScore}
                    initial={{ scale: 1.25, color: "#fff" }}
                    animate={{ scale: 1, color: "#c084fc" }}
                    transition={{ duration: 0.4 }}
                    className="text-purple-400 text-lg font-extrabold tabular-nums"
                    style={{ textShadow: "0 0 10px rgba(168,85,247,0.55)" }}
                  >
                    {opponentScore}
                  </motion.span>
                </div>
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div
            className="relative mt-3 h-2.5 rounded-full overflow-hidden flex"
            style={{
              background: "rgba(0,0,0,0.4)",
              boxShadow: "inset 0 1px 2px rgba(0,0,0,0.5), inset 0 -1px 0 rgba(255,255,255,0.06)",
            }}
          >
            <motion.div
              className="h-full relative"
              style={{
                background: "linear-gradient(90deg, #f472b6 0%, #ec4899 100%)",
                boxShadow: "0 0 10px rgba(236,72,153,0.7)",
              }}
              initial={{ width: "50%" }}
              animate={{ width: `${challengerPercent}%` }}
              transition={{ type: "spring", damping: 18, stiffness: 140 }}
            >
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(115deg, transparent 35%, rgba(255,255,255,0.45) 50%, transparent 65%)",
                  animation: "giftSendShine 2.6s ease-in-out infinite",
                }}
              />
            </motion.div>
            <motion.div
              className="h-full relative"
              style={{
                background: "linear-gradient(90deg, #a855f7 0%, #c084fc 100%)",
                boxShadow: "0 0 10px rgba(168,85,247,0.7)",
              }}
              initial={{ width: "50%" }}
              animate={{ width: `${opponentPercent}%` }}
              transition={{ type: "spring", damping: 18, stiffness: 140 }}
            >
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(115deg, transparent 35%, rgba(255,255,255,0.45) 50%, transparent 65%)",
                  animation: "giftSendShine 2.6s ease-in-out infinite 0.4s",
                }}
              />
            </motion.div>
            {/* Center divider glow */}
            <div
              className="pointer-events-none absolute top-0 bottom-0 w-px"
              style={{
                left: `${challengerPercent}%`,
                background: "rgba(255,255,255,0.8)",
                boxShadow: "0 0 6px rgba(255,255,255,0.9)",
                transform: "translateX(-0.5px)",
              }}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
};
