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

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

        <motion.div
          className="relative w-full max-w-sm bg-gradient-to-b from-purple-800 to-purple-900 rounded-3xl overflow-hidden border border-white/20 shadow-2xl"
          initial={{ scale: 0.8, y: 50 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.8, y: 50 }}
          transition={{ type: "spring", damping: 20 }}
        >
          {/* Animated Background */}
          <div className="absolute inset-0 overflow-hidden">
            <motion.div
              className="absolute -top-20 -left-20 w-40 h-40 bg-pink-500/30 rounded-full blur-3xl"
              animate={{ x: [0, 20, 0], y: [0, 20, 0] }}
              transition={{ duration: 3, repeat: Infinity }}
            />
            <motion.div
              className="absolute -bottom-20 -right-20 w-40 h-40 bg-purple-500/30 rounded-full blur-3xl"
              animate={{ x: [0, -20, 0], y: [0, -20, 0] }}
              transition={{ duration: 3, repeat: Infinity }}
            />
          </div>

          {/* Content */}
          <div className="relative z-10 p-6">
            {/* Header */}
            <div className="flex items-center justify-center gap-2 mb-6">
              <motion.div
                animate={{ rotate: [-10, 10, -10] }}
                transition={{ duration: 0.5, repeat: Infinity }}
              >
                <Swords className="w-8 h-8 text-amber-400" />
              </motion.div>
              <h2 className="text-2xl font-bold text-white">PK Battle!</h2>
              <motion.div
                animate={{ rotate: [10, -10, 10] }}
                transition={{ duration: 0.5, repeat: Infinity }}
              >
                <Swords className="w-8 h-8 text-amber-400 transform scale-x-[-1]" />
              </motion.div>
            </div>

            {/* Challenger Info */}
            <div className="flex flex-col items-center mb-6">
              <motion.div
                className="relative mb-3"
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-pink-500 ring-4 ring-pink-500/30">
                  <img
                    src={challengerAvatar || "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150"}
                    alt={challengerName}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-400 to-amber-600 px-3 py-1 rounded-full">
                  <span className="text-xs font-bold text-black">Lv{challengerLevel}</span>
                </div>
              </motion.div>

              <h3 className="text-xl font-bold text-white mb-1">{challengerName}</h3>
              <p className="text-white/60">has challenged you to a PK Battle!</p>
            </div>

            {/* Countdown */}
            <div className="flex justify-center mb-6">
              <motion.div
                className="w-16 h-16 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 flex items-center justify-center"
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              >
                <span className="text-2xl font-bold text-white">{countdown}</span>
              </motion.div>
            </div>

            {/* Buttons */}
            <div className="flex gap-3">
              <Button
                className="flex-1 h-12 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 rounded-full text-white font-bold"
                onClick={handleDecline}
                disabled={responding}
              >
                <X className="w-5 h-5 mr-2" />
                Decline
              </Button>
              <Button
                className="flex-1 h-12 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 rounded-full text-white font-bold"
                onClick={handleAccept}
                disabled={responding}
              >
                <Check className="w-5 h-5 mr-2" />
                Accept
              </Button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
