import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Flame, Clock, Check, Sparkles, Gift } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import BeansIcon from "@/components/common/BeansIcon";

interface NewHostBonusCardProps {
  hostId: string;
  isStreamActive?: boolean;
  onBeansClaimed?: (beansAmount: number) => void;
}

interface HourSlot {
  hour_number: number;
  bonus_beans: number;
  target_minutes: number;
  minutes_accumulated: number;
  completed: boolean;
  claimed: boolean;
}

interface BonusState {
  eligible: boolean;
  reason?: string;
  program_day?: number;
  program_days?: number;
  hours?: HourSlot[];
  daily_total_beans?: number;
}

const NewHostBonusCard = ({ hostId, isStreamActive = true, onBeansClaimed }: NewHostBonusCardProps) => {
  const [state, setState] = useState<BonusState | null>(null);
  const [claimingHour, setClaimingHour] = useState<number | null>(null);
  const [showCelebration, setShowCelebration] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const heartbeatRef = useRef<number | undefined>(undefined);

  const fetchState = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_host_live_bonus_state", { _host_id: hostId });
    if (error) {
      console.error("[NewHostBonus] state error:", error);
      return;
    }
    setState(data as BonusState);
  }, [hostId]);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  // Realtime: refresh card the instant progress row changes (no refresh needed)
  useEffect(() => {
    if (!hostId) return;
    const channel = supabase
      .channel(`new-host-bonus-${hostId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "new_host_live_bonus_progress",
          filter: `host_id=eq.${hostId}`,
        },
        () => fetchState()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [hostId, fetchState]);

  // Server-side per-minute heartbeat (only when actively live)
  useEffect(() => {
    if (!isStreamActive) return;
    if (!state?.eligible) return;
    const allDone = (state.hours ?? []).every((h) => h.completed);
    if (allDone) return;

    const tick = async () => {
      const { data, error } = await supabase.rpc("record_host_live_minute", { _host_id: hostId });
      if (error) {
        console.warn("[NewHostBonus] heartbeat error:", error.message);
        return;
      }
      // Refresh after each minute so UI stays accurate
      fetchState();
      if ((data as any)?.capped) {
        if (heartbeatRef.current) window.clearInterval(heartbeatRef.current);
      }
    };

    // Fire immediately, then every 60s
    tick();
    heartbeatRef.current = window.setInterval(tick, 60_000);
    return () => {
      if (heartbeatRef.current) window.clearInterval(heartbeatRef.current);
    };
  }, [isStreamActive, hostId, state?.eligible, state?.hours, fetchState]);

  const handleClaim = async (hour: HourSlot) => {
    if (claimingHour !== null) return;
    if (!hour.completed || hour.claimed) return;
    setClaimingHour(hour.hour_number);
    try {
      const { data, error } = await supabase.rpc("claim_host_live_hour_bonus", {
        _host_id: hostId,
        _hour_number: hour.hour_number,
      });
      if (error) throw error;
      const result = data as any;
      if (!result?.success) {
        toast.error(result?.error === "already_claimed" ? "Already claimed" : "Claim failed");
        return;
      }
      const beans = Number(result.beans) || hour.bonus_beans;
      setShowCelebration(beans);
      setTimeout(() => setShowCelebration(null), 2500);
      toast.success(`🎉 +${beans.toLocaleString()} Beans claimed!`);
      onBeansClaimed?.(beans);
      fetchState();
    } catch (err: any) {
      console.error("[NewHostBonus] claim error:", err);
      toast.error("Failed to claim");
    } finally {
      setClaimingHour(null);
    }
  };

  if (!state || !state.eligible) return null;
  const hours = state.hours ?? [];
  if (hours.length === 0) return null;

  // Find the next claimable hour (first completed but not claimed)
  const claimableHour = hours.find((h) => h.completed && !h.claimed);
  const currentHour = hours.find((h) => !h.completed); // currently filling
  const allDone = hours.every((h) => h.claimed);
  const earnedSoFar = hours.filter((h) => h.claimed).reduce((sum, h) => sum + h.bonus_beans, 0);

  if (collapsed) {
    return (
      <motion.button
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        onClick={() => setCollapsed(false)}
        className="relative w-11 h-11 rounded-full overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #7c3aed, #ec4899)",
          boxShadow: "0 0 20px rgba(168,85,247,0.5), inset 0 1px 0 rgba(255,255,255,0.3)",
        }}
      >
        <Flame className="w-5 h-5 text-white mx-auto mt-[10px]" />
        {claimableHour && (
          <motion.div
            animate={{ scale: [1, 1.3, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
            className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 flex items-center justify-center"
          >
            <span className="text-[8px] font-bold text-white">!</span>
          </motion.div>
        )}
      </motion.button>
    );
  }

  const currentTarget = Math.max(1, currentHour?.target_minutes ?? 60);
  const progressPercent = currentHour
    ? Math.min(100, (currentHour.minutes_accumulated / currentTarget) * 100)
    : 100;
  const minutesLeft = currentHour ? Math.max(0, currentTarget - currentHour.minutes_accumulated) : 0;

  return (
    <>
      <AnimatePresence>
        {showCelebration !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none"
          >
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0, opacity: 0 }}
            >
              <div
                className="bg-gradient-to-br from-fuchsia-500 via-purple-600 to-violet-700 p-6 rounded-3xl shadow-2xl text-center"
                style={{ boxShadow: "0 0 60px rgba(168,85,247,0.6)" }}
              >
                <Sparkles className="w-12 h-12 text-amber-300 mx-auto mb-2 animate-pulse" />
                <p className="text-white font-bold text-lg">Bonus Claimed! 🎉</p>
                <div className="flex items-center justify-center gap-1 mt-2">
                  <BeansIcon size={20} />
                  <span className="text-amber-300 font-bold text-xl">+{showCelebration.toLocaleString()}</span>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        initial={{ y: -20, opacity: 0, scale: 0.9 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        className="relative w-[280px] rounded-2xl overflow-hidden"
        style={{
          background:
            "linear-gradient(145deg, rgba(15,5,30,0.95) 0%, rgba(45,27,105,0.92) 50%, rgba(15,5,30,0.95) 100%)",
          border: "1px solid rgba(168,85,247,0.35)",
          boxShadow:
            "0 8px 32px rgba(0,0,0,0.6), 0 0 20px rgba(168,85,247,0.15), inset 0 1px 0 rgba(255,255,255,0.08)",
          backdropFilter: "blur(20px)",
        }}
      >
        <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-lg bg-gradient-to-br from-fuchsia-500 to-purple-600 flex items-center justify-center"
              style={{ boxShadow: "0 0 12px rgba(217,70,239,0.4)" }}
            >
              <Flame className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-white text-[11px] font-bold">New Host Bonus</span>
                <span className="text-[8px] bg-gradient-to-r from-amber-400 to-orange-500 px-1.5 py-[1px] rounded-full font-bold text-white">
                  LIMITED
                </span>
              </div>
              <p className="text-purple-300/60 text-[9px]">
                Day {state.program_day}/{state.program_days} · {(hours[0]?.bonus_beans ?? 0).toLocaleString()}/hr · max {hours.length}h
              </p>
            </div>
          </div>
          <button onClick={() => setCollapsed(true)} className="text-white/65 hover:text-white/70 p-1">
            <span className="text-[10px]">✕</span>
          </button>
        </div>

        {currentHour && (
          <div className="px-3 pb-2">
            <div
              className="relative h-5 rounded-full overflow-hidden"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <motion.div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${Math.min(progressPercent, 100)}%`,
                  background: "linear-gradient(90deg, #a855f7, #ec4899, #f59e0b)",
                }}
                animate={{ opacity: [0.8, 1, 0.8] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
              <div className="absolute inset-0 flex items-center justify-center gap-1">
                <Clock className="w-3 h-3 text-white/80" />
                <span className="text-[10px] font-bold text-white/90">
                  Hour {currentHour.hour_number}: {currentHour.minutes_accumulated}/60 min · {minutesLeft}m left
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="px-3 pb-2">
          <div className="flex gap-1">
            {hours.map((h) => {
              const isCurrent = !h.completed && currentHour?.hour_number === h.hour_number;
              return (
                <motion.div
                  key={h.hour_number}
                  className={`flex-1 h-8 rounded-lg flex flex-col items-center justify-center transition-all ${
                    h.claimed
                      ? "bg-gradient-to-b from-fuchsia-500 to-purple-600"
                      : h.completed
                      ? "bg-gradient-to-b from-amber-400/40 to-orange-500/40 border border-amber-400/60"
                      : isCurrent
                      ? "bg-gradient-to-b from-fuchsia-500/30 to-purple-600/30 border border-fuchsia-400/50"
                      : "bg-white/5 border border-white/10"
                  }`}
                  style={h.claimed ? { boxShadow: "0 0 10px rgba(217,70,239,0.3)" } : {}}
                >
                  {h.claimed ? (
                    <Check className="w-3.5 h-3.5 text-white" />
                  ) : h.completed ? (
                    <Gift className="w-3 h-3 text-amber-300" />
                  ) : isCurrent ? (
                    <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 1.5, repeat: Infinity }}>
                      <Clock className="w-3 h-3 text-fuchsia-300" />
                    </motion.div>
                  ) : (
                    <Clock className="w-3 h-3 text-white/20" />
                  )}
                  <span
                    className={`text-[7px] font-bold ${
                      h.claimed
                        ? "text-white"
                        : h.completed
                        ? "text-amber-200"
                        : isCurrent
                        ? "text-fuchsia-300"
                        : "text-white/20"
                    }`}
                  >
                    {h.hour_number}h
                  </span>
                </motion.div>
              );
            })}
          </div>
        </div>

        <div className="px-3 pb-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-center">
              <div className="flex items-center gap-0.5">
                <BeansIcon size={12} />
                <span className="text-amber-400 font-bold text-[11px]">{earnedSoFar.toLocaleString()}</span>
              </div>
              <p className="text-[7px] text-white/30">Earned today</p>
            </div>
            <div className="w-px h-5 bg-white/10" />
            <div className="text-center">
              <span className="text-fuchsia-400 font-bold text-[11px]">
                Day {state.program_day}/{state.program_days}
              </span>
              <p className="text-[7px] text-white/30">Program</p>
            </div>
          </div>

          {claimableHour ? (
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={() => handleClaim(claimableHour)}
              disabled={claimingHour !== null}
              className="px-4 py-1.5 rounded-xl text-white text-[11px] font-bold relative overflow-hidden"
              style={{
                background: "linear-gradient(135deg, #a855f7, #ec4899)",
                boxShadow: "0 0 15px rgba(168,85,247,0.4), inset 0 1px 0 rgba(255,255,255,0.2)",
              }}
            >
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                animate={{ x: ["-100%", "100%"] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
              <span className="relative z-10 flex items-center gap-1">
                <Gift className="w-3.5 h-3.5" />
                {claimingHour !== null ? "..." : `Claim ${claimableHour.bonus_beans.toLocaleString()}`}
              </span>
            </motion.button>
          ) : allDone ? (
            <div className="px-3 py-1.5 rounded-xl bg-green-500/20 border border-green-400/30">
              <span className="text-green-400 text-[10px] font-bold flex items-center gap-1">
                <Check className="w-3 h-3" /> Done!
              </span>
            </div>
          ) : null}
        </div>
      </motion.div>
    </>
  );
};

export default NewHostBonusCard;