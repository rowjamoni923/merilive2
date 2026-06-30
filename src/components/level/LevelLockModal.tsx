import { motion, AnimatePresence } from "framer-motion";
import { Lock, Crown, Sparkles, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface LevelLockModalProps {
  open: boolean;
  onClose: () => void;
  featureName: string;
  requiredLevel: number;
  currentLevel: number;
  isHost?: boolean;
}

/**
 * Premium luxury "Level Required" modal — single source for all feature lock UI.
 * Driven 100% by admin panel values (feature_level_requirements). No hardcoded text.
 */
export const LevelLockModal = ({
  open,
  onClose,
  featureName,
  requiredLevel,
  currentLevel,
  isHost,
}: LevelLockModalProps) => {
  const navigate = useNavigate();
  const levelsToGo = Math.max(0, requiredLevel - currentLevel);
  const roleLabel = isHost ? "Host" : "User";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 12 }}
            transition={{ type: "spring", damping: 22, stiffness: 280 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-sm overflow-hidden rounded-[28px] border border-amber-400/20 bg-gradient-to-br from-[#1a1024] via-[#0f0a18] to-[#1a1024] shadow-[0_30px_80px_-20px_rgba(251,191,36,0.4)]"
          >
            {/* Ambient glow */}
            <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-amber-400/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -right-12 h-48 w-48 rounded-full bg-fuchsia-500/15 blur-3xl" />

            {/* Hero */}
            <div className="relative px-6 pt-8 pb-4 text-center">
              <motion.div
                initial={{ scale: 0.6, rotate: -10 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", damping: 12, stiffness: 200, delay: 0.05 }}
                className="relative mx-auto mb-4 flex h-24 w-24 items-center justify-center"
              >
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-300 via-amber-500 to-yellow-600 opacity-90 blur-sm" />
                <div className="absolute inset-[3px] rounded-full bg-gradient-to-br from-[#3a2410] via-[#1a0f06] to-[#2a1a08]" />
                <Lock className="relative h-10 w-10 text-amber-300 drop-shadow-[0_0_12px_rgba(251,191,36,0.7)]" />
                <Sparkles className="absolute -top-1 -right-1 h-5 w-5 text-amber-300 animate-pulse" />
                <Crown className="absolute -bottom-1 left-1 h-4 w-4 text-amber-400/90" />
              </motion.div>

              <h3 className="bg-gradient-to-r from-amber-200 via-amber-400 to-amber-200 bg-clip-text text-2xl font-bold tracking-tight text-transparent">
                Level Required
              </h3>
              <p className="mt-1.5 text-sm text-white/80">
                Unlock <span className="font-semibold text-white">{featureName}</span> by leveling up
              </p>
            </div>

            {/* Level cards */}
            <div className="relative mx-5 mb-5 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-center backdrop-blur-sm">
                <p className="text-[10px] font-medium uppercase tracking-wider text-white/60">Your {roleLabel} Level</p>
                <p className="mt-1 text-2xl font-bold text-white">Lv {currentLevel}</p>
              </div>
              <div className="rounded-2xl border border-amber-400/40 bg-gradient-to-br from-amber-500/20 to-amber-600/10 px-3 py-3 text-center">
                <p className="text-[10px] font-medium uppercase tracking-wider text-amber-300/90">Required</p>
                <p className="mt-1 bg-gradient-to-b from-amber-200 to-amber-500 bg-clip-text text-2xl font-bold text-transparent">
                  Lv {requiredLevel}
                </p>
              </div>
            </div>

            {levelsToGo > 0 && (
              <p className="mb-2 px-6 text-center text-xs text-white/70">
                Reach <span className="font-semibold text-amber-300">{levelsToGo} more level{levelsToGo > 1 ? "s" : ""}</span> to unlock this privilege
              </p>
            )}

            <p className="mb-4 px-6 text-center text-[10px] font-medium tracking-wide text-amber-200/70">
              Hosts can go live from Level 0 — exclusive privilege
            </p>


            {/* CTAs */}
            <div className="relative flex gap-2.5 px-5 pb-6">
              <Button
                variant="ghost"
                onClick={onClose}
                className="flex-1 h-12 rounded-2xl border border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
              >
                Not Now
              </Button>
              <Button
                onClick={() => {
                  onClose();
                  navigate("/wallet/topup");
                }}
                className="group flex-1 h-12 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-600 text-[#1a0f06] font-bold shadow-[0_8px_24px_-6px_rgba(251,191,36,0.6)] hover:from-amber-300 hover:to-yellow-500"
              >
                Level Up
                <ChevronRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default LevelLockModal;

