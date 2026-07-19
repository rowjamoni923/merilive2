import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Swords, Check, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PKRandomMatchNotificationProps {
  challengerName: string;
  challengerAvatar: string;
  challengerLevel: number;
  challengerId: string;
  onAccept: () => void;
  onDecline: () => void;
}

export const PKRandomMatchNotification = ({
  challengerName,
  challengerAvatar,
  challengerLevel,
  onAccept,
  onDecline,
}: PKRandomMatchNotificationProps) => {
  const [countdown, setCountdown] = useState(15);
  const [responding, setResponding] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onDecline();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const handleAccept = () => {
    setResponding(true);
    onAccept();
  };

  const handleDecline = () => {
    setResponding(true);
    onDecline();
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed top-16 left-0 right-0 z-[60] flex justify-center px-4"
        initial={{ y: -120, opacity: 0, scale: 0.8 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: -120, opacity: 0, scale: 0.8 }}
        transition={{ type: "spring", damping: 20, stiffness: 300 }}
      >
        <motion.div
          className="w-full max-w-sm overflow-hidden rounded-2xl border border-white/20 shadow-2xl"
          style={{
            background: "linear-gradient(135deg, rgba(88, 28, 135, 0.95), rgba(157, 23, 77, 0.95), rgba(88, 28, 135, 0.95))",
            backdropFilter: "blur(20px)",
          }}
        >
          {/* Animated glow border */}
          <motion.div
            className="absolute inset-0 rounded-2xl"
            style={{
              backgroundSize: "200% 100%",
            }}
            animate={{
              backgroundPosition: ["0% 0%", "200% 0%"],
            }}
            transition={{ duration: 2, repeat: Infinity }}
          />

          <div className="relative z-10 p-3">
            {/* Header with PK badge */}
            <div className="flex items-center gap-2 mb-2">
              <motion.div
                className="flex items-center gap-1 bg-gradient-to-r from-amber-500 to-orange-500 px-2 py-0.5 rounded-full"
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              >
                <Swords className="w-3 h-3 text-white" />
                <span className="text-[10px] font-bold text-white uppercase tracking-wider">PK Battle</span>
              </motion.div>
              <motion.div
                className="flex items-center gap-1 bg-red-500/20 px-2 py-0.5 rounded-full"
                animate={{ opacity: [1, 0.5, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              >
                <Zap className="w-3 h-3 text-red-400" />
                <span className="text-[10px] font-semibold text-red-400">RANDOM</span>
              </motion.div>
              
              {/* Countdown */}
              <div className="ml-auto">
                <motion.div
                  className="w-7 h-7 rounded-full bg-white/10 border border-white/20 flex items-center justify-center"
                  animate={{ scale: countdown <= 5 ? [1, 1.2, 1] : 1 }}
                  transition={{ duration: 0.5, repeat: countdown <= 5 ? Infinity : 0 }}
                >
                  <span className={`text-xs font-bold ${countdown <= 5 ? "text-red-400" : "text-white"}`}>
                    {countdown}
                  </span>
                </motion.div>
              </div>
            </div>

            {/* Challenger info row */}
            <div className="flex items-center gap-3">
              {/* Avatar */}
              <motion.div
                className="relative flex-shrink-0"
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-amber-400 ring-2 ring-amber-400/30">
                  <img loading="lazy" decoding="async" 
                    src={challengerAvatar || "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100"}
                    alt={challengerName}
                    className="w-full h-full object-cover" />
                </div>
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-400 to-amber-600 px-1.5 py-0.5 rounded text-[7px] font-bold text-black whitespace-nowrap">
                  Lv{challengerLevel}
                </div>
              </motion.div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-sm truncate">{challengerName}</p>
                <p className="text-white/60 text-xs">wants to PK battle with you!</p>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 flex-shrink-0">
                <Button
                  size="sm"
                  className="h-9 px-3 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 rounded-full text-white font-bold text-xs shadow-lg shadow-red-500/30"
                  onClick={handleDecline}
                  disabled={responding}
                >
                  <X className="w-3.5 h-3.5 mr-0.5" />
                  Decline
                </Button>
                <Button
                  size="sm"
                  className="h-9 px-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 rounded-full text-white font-bold text-xs shadow-lg shadow-green-500/30"
                  onClick={handleAccept}
                  disabled={responding}
                >
                  <Check className="w-3.5 h-3.5 mr-0.5" />
                  Accept
                </Button>
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-1 bg-white/10">
            <motion.div
              className="h-full bg-gradient-to-r from-amber-400 to-pink-500"
              initial={{ width: "100%" }}
              animate={{ width: "0%" }}
              transition={{ duration: 15, ease: "linear" }}
            />
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};