import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Swords, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface PKBattleRequestProps {
  battleId: string;
  challengerName: string;
  challengerAvatar: string;
  challengerLevel: number;
  onAccept: () => void;
  onDecline: () => void;
}

export const PKBattleRequest = ({
  battleId,
  challengerName,
  challengerAvatar,
  challengerLevel,
  onAccept,
  onDecline,
}: PKBattleRequestProps) => {
  const [countdown, setCountdown] = useState(15);
  const [responding, setResponding] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleDecline();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const handleAccept = async () => {
    setResponding(true);
    try {
      const { error } = await supabase
        .from("pk_battles")
        .update({
          status: "accepted",
          started_at: new Date().toISOString(),
        })
        .eq("id", battleId);

      if (error) throw error;
      onAccept();
    } catch (error) {
      console.error("Error accepting PK:", error);
      toast.error("Failed to accept PK Battle");
    } finally {
      setResponding(false);
    }
  };

  const handleDecline = async () => {
    setResponding(true);
    try {
      const { error } = await supabase
        .from("pk_battles")
        .update({ status: "declined" })
        .eq("id", battleId);

      if (error) throw error;
      onDecline();
    } catch (error) {
      console.error("Error declining PK:", error);
    } finally {
      setResponding(false);
    }
  };

  const urgent = countdown <= 5;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Premium backdrop */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 100% at 50% 0%, rgba(120,29,149,0.65) 0%, rgba(0,0,0,0.92) 70%)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
          }}
        />

        <motion.div
          className="relative w-full max-w-sm rounded-3xl overflow-hidden"
          initial={{ scale: 0.82, y: 60, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.9, y: 30, opacity: 0 }}
          transition={{ type: "spring", damping: 22, stiffness: 280 }}
          style={{
            background:
              "linear-gradient(180deg, #1a0f33 0%, #140a2a 50%, #0c0818 100%)",
            border: "1px solid rgba(255,255,255,0.10)",
            boxShadow:
              "0 0 0 1px rgba(236,72,153,0.25), 0 30px 90px -20px rgba(236,72,153,0.55), 0 20px 60px -10px rgba(139,92,246,0.45), inset 0 1px 0 rgba(255,255,255,0.08)",
          }}
        >
          {/* Aurora overlay */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(60% 50% at 10% 0%, rgba(236,72,153,0.30), transparent 60%), radial-gradient(55% 45% at 95% 100%, rgba(139,92,246,0.28), transparent 60%), radial-gradient(40% 40% at 50% 50%, rgba(251,191,36,0.10), transparent 70%)",
            }}
          />

          {/* Shine sweep */}
          <div
            className="pointer-events-none absolute inset-0 overflow-hidden"
            aria-hidden
          >
            <div
              className="absolute -inset-1"
              style={{
                background:
                  "linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.10) 50%, transparent 70%)",
                animation: "giftSendShine 4.2s ease-in-out infinite",
                mixBlendMode: "overlay",
              }}
            />
          </div>

          {/* Content */}
          <div className="relative z-10 p-6">
            {/* Header */}
            <div className="flex items-center justify-center gap-2 mb-6">
              <motion.div
                animate={{ rotate: [-10, 10, -10] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                style={{ filter: "drop-shadow(0 0 8px rgba(251,191,36,0.6))" }}
              >
                <Swords className="w-8 h-8 text-amber-400" />
              </motion.div>
              <h2
                className="text-2xl font-black bg-clip-text text-transparent"
                style={{
                  backgroundImage:
                    "linear-gradient(135deg, #fff 0%, #fde68a 50%, #fff 100%)",
                  filter: "drop-shadow(0 2px 8px rgba(251,191,36,0.35))",
                  letterSpacing: "0.5px",
                }}
              >
                PK Battle!
              </h2>
              <motion.div
                animate={{ rotate: [10, -10, 10] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                style={{ filter: "drop-shadow(0 0 8px rgba(251,191,36,0.6))" }}
              >
                <Swords className="w-8 h-8 text-amber-400 transform scale-x-[-1]" />
              </motion.div>
            </div>

            {/* Challenger Info */}
            <div className="flex flex-col items-center mb-6">
              <motion.div
                className="relative mb-4"
                animate={{ scale: [1, 1.045, 1] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
              >
                {/* Avatar halo */}
                <div
                  className="absolute inset-0 rounded-full"
                  style={{
                    boxShadow:
                      "0 0 0 3px rgba(236,72,153,0.85), 0 0 0 6px rgba(236,72,153,0.25), 0 0 32px 6px rgba(236,72,153,0.55), 0 0 60px 12px rgba(139,92,246,0.35)",
                  }}
                />
                <div className="w-24 h-24 rounded-full overflow-hidden relative">
                  <img
                    src={
                      challengerAvatar ||
                      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150"
                    }
                    alt={challengerName}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div
                  className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full"
                  style={{
                    background:
                      "linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #d97706 100%)",
                    boxShadow:
                      "inset 0 1px 0 rgba(255,255,255,0.45), 0 4px 14px rgba(251,191,36,0.55)",
                  }}
                >
                  <span
                    className="text-xs font-black text-black tabular-nums"
                    style={{ letterSpacing: "0.3px" }}
                  >
                    Lv{challengerLevel}
                  </span>
                </div>
              </motion.div>

              <h3
                className="text-xl font-bold text-white mb-1"
                style={{ textShadow: "0 2px 12px rgba(0,0,0,0.6)" }}
              >
                {challengerName}
              </h3>
              <p className="text-white/65 text-sm">
                has challenged you to a PK Battle!
              </p>
            </div>

            {/* Countdown */}
            <div className="flex justify-center mb-6">
              <motion.div
                key={urgent ? "urgent" : "normal"}
                className="w-16 h-16 rounded-full flex items-center justify-center relative"
                animate={{ scale: urgent ? [1, 1.15, 1] : [1, 1.08, 1] }}
                transition={{
                  duration: urgent ? 0.7 : 1.2,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                style={{
                  background: urgent
                    ? "linear-gradient(135deg, #ef4444 0%, #dc2626 50%, #b91c1c 100%)"
                    : "linear-gradient(135deg, #ec4899 0%, #a855f7 50%, #7c3aed 100%)",
                  boxShadow: urgent
                    ? "0 0 0 2px rgba(255,255,255,0.18), 0 0 24px rgba(239,68,68,0.75), 0 0 48px rgba(239,68,68,0.45), inset 0 1px 0 rgba(255,255,255,0.3)"
                    : "0 0 0 2px rgba(255,255,255,0.18), 0 0 22px rgba(236,72,153,0.6), 0 0 42px rgba(139,92,246,0.4), inset 0 1px 0 rgba(255,255,255,0.3)",
                }}
              >
                <span
                  className="text-2xl font-black text-white tabular-nums"
                  style={{ textShadow: "0 2px 6px rgba(0,0,0,0.5)" }}
                >
                  {countdown}
                </span>
              </motion.div>
            </div>

            {/* Buttons */}
            <div className="flex gap-3">
              <motion.div className="flex-1" whileTap={{ scale: 0.96 }}>
                <Button
                  className="w-full h-12 rounded-full text-white font-bold border-0 relative overflow-hidden"
                  onClick={handleDecline}
                  disabled={responding}
                  style={{
                    background:
                      "linear-gradient(95deg, #ef4444 0%, #dc2626 50%, #b91c1c 100%)",
                    boxShadow:
                      "0 8px 22px -4px rgba(239,68,68,0.55), inset 0 1px 0 rgba(255,255,255,0.25)",
                  }}
                >
                  <X className="w-5 h-5 mr-2 relative z-10" />
                  <span className="relative z-10">Decline</span>
                </Button>
              </motion.div>
              <motion.div className="flex-1" whileTap={{ scale: 0.96 }}>
                <Button
                  className="w-full h-12 rounded-full text-white font-bold border-0 relative overflow-hidden"
                  onClick={handleAccept}
                  disabled={responding}
                  style={{
                    background:
                      "linear-gradient(95deg, #ec4899 0%, #d946ef 50%, #a855f7 100%)",
                    boxShadow:
                      "0 0 0 1px rgba(255,255,255,0.15), 0 10px 28px -4px rgba(236,72,153,0.65), 0 6px 18px -4px rgba(168,85,247,0.55), inset 0 1px 0 rgba(255,255,255,0.3)",
                    animation:
                      "giftSendBreathe 2.4s ease-in-out infinite",
                  }}
                >
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background:
                        "linear-gradient(115deg, transparent 35%, rgba(255,255,255,0.35) 50%, transparent 65%)",
                      animation: "giftSendShine 2.6s ease-in-out infinite",
                    }}
                  />
                  <Check className="w-5 h-5 mr-2 relative z-10" />
                  <span className="relative z-10">Accept</span>
                </Button>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
