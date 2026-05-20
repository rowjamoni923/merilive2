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

  // Subscribe to battle updates
  useEffect(() => {
    const channel = supabase
      .channel(`pk_battle_live_${battleId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "pk_battles",
          filter: `id=eq.${battleId}`,
        },
        (payload: any) => {
          setChallengerScore(payload.new.challenger_score || 0);
          setOpponentScore(payload.new.opponent_score || 0);
          
          if (payload.new.status === "completed") {
            setBattleEnded(true);
            onBattleEnd(payload.new.winner_id);
          }
        }
      )
      .subscribe();

    // Also subscribe to gift transactions for this battle
    const giftChannel = supabase
      .channel(`pk_gifts_${battleId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "pk_battle_gifts",
          filter: `battle_id=eq.${battleId}`,
        },
        async () => {
          // Refetch scores when new gift is received
          const { data } = await supabase
            .from("pk_battles")
            .select("challenger_score, opponent_score")
            .eq("id", battleId)
            .single();
          
          if (data) {
            setChallengerScore(data.challenger_score || 0);
            setOpponentScore(data.opponent_score || 0);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(giftChannel);
    };
  }, [battleId]);

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

  return (
    <motion.div
      className="absolute top-24 left-0 right-0 z-30 px-3"
      initial={{ y: -50, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", damping: 20 }}
    >
      <div className="bg-gradient-to-r from-purple-900/90 via-pink-900/90 to-purple-900/90 backdrop-blur-xl rounded-2xl border border-white/20 overflow-hidden shadow-2xl">
        {/* Timer and Title */}
        <div className="flex items-center justify-center gap-2 py-2 bg-gradient-to-r from-pink-500/20 to-purple-500/20">
          <Swords className="w-4 h-4 text-amber-400" />
          <span className="text-white font-bold text-sm">PK BATTLE</span>
          <div className="flex items-center gap-1 bg-black/30 rounded-full px-2 py-0.5">
            <Timer className="w-3 h-3 text-amber-400" />
            <span className="text-amber-400 font-mono text-sm">{formatTime(timeLeft)}</span>
          </div>
          <Swords className="w-4 h-4 text-amber-400 transform scale-x-[-1]" />
        </div>

        {/* VS Section */}
        <div className="p-3">
          <div className="flex items-center justify-between gap-2">
            {/* Challenger */}
            <div className="flex-1 flex items-center gap-2">
              <div className="relative">
                <motion.div
                  className={`w-12 h-12 rounded-full overflow-hidden border-2 ${
                    challengerWinning ? "border-amber-400 ring-2 ring-amber-400/50" : "border-pink-500"
                  }`}
                  animate={challengerWinning ? { scale: [1, 1.05, 1] } : {}}
                  transition={{ duration: 0.5, repeat: Infinity }}
                >
                  <img
                    src={challengerAvatar || "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150"}
                    alt={challengerName}
                    className="w-full h-full object-cover"
                  />
                </motion.div>
                {challengerWinning && (
                  <Crown className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 text-amber-400" />
                )}
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-400 to-amber-600 px-1 py-0.5 rounded text-[6px] font-bold text-black">
                  Lv{challengerLevel}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-medium truncate">{challengerName}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-amber-400 text-lg font-bold">{challengerScore}</span>
                  <span className="text-white/70 text-[10px]">diamonds</span>
                </div>
              </div>
            </div>

            {/* VS Badge */}
            <motion.div
              className="w-10 h-10 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 flex items-center justify-center shrink-0"
              animate={{ rotate: [0, 360] }}
              transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
            >
              <span className="text-white font-bold text-xs">VS</span>
            </motion.div>

            {/* Opponent */}
            <div className="flex-1 flex items-center gap-2 flex-row-reverse">
              <div className="relative">
                <motion.div
                  className={`w-12 h-12 rounded-full overflow-hidden border-2 ${
                    opponentWinning ? "border-amber-400 ring-2 ring-amber-400/50" : "border-purple-500"
                  }`}
                  animate={opponentWinning ? { scale: [1, 1.05, 1] } : {}}
                  transition={{ duration: 0.5, repeat: Infinity }}
                >
                  <img
                    src={opponentAvatar || "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150"}
                    alt={opponentName}
                    className="w-full h-full object-cover"
                  />
                </motion.div>
                {opponentWinning && (
                  <Crown className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 text-amber-400" />
                )}
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-400 to-amber-600 px-1 py-0.5 rounded text-[6px] font-bold text-black">
                  Lv{opponentLevel}
                </div>
              </div>
              <div className="flex-1 min-w-0 text-right">
                <p className="text-white text-xs font-medium truncate">{opponentName}</p>
                <div className="flex items-center gap-1 mt-0.5 justify-end">
                  <span className="text-white/70 text-[10px]">diamonds</span>
                  <span className="text-purple-400 text-lg font-bold">{opponentScore}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-3 h-2 rounded-full bg-black/30 overflow-hidden flex">
            <motion.div
              className="h-full bg-gradient-to-r from-pink-500 to-pink-400"
              initial={{ width: "50%" }}
              animate={{ width: `${challengerPercent}%` }}
              transition={{ type: "spring", damping: 15 }}
            />
            <motion.div
              className="h-full bg-gradient-to-r from-purple-400 to-purple-500"
              initial={{ width: "50%" }}
              animate={{ width: `${opponentPercent}%` }}
              transition={{ type: "spring", damping: 15 }}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
};
