import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { UserCheck, Sparkles, Crown } from "lucide-react";
import maleAvatar from "@/assets/male-avatar.png";
import femaleAvatar from "@/assets/female-avatar.png";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface GenderSelectionModalProps {
  isOpen: boolean;
  userId: string;
  onComplete: () => void;
}

export const GenderSelectionModal = ({ isOpen, userId, onComplete }: GenderSelectionModalProps) => {
  const [displayName, setDisplayName] = useState("");
  const [selectedGender, setSelectedGender] = useState<"male" | "female" | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!displayName.trim()) {
      toast.error("Please enter your name");
      return;
    }
    if (!selectedGender) {
      toast.error("Please select your gender");
      return;
    }

    setSaving(true);
    try {
      const deviceId = localStorage.getItem("meri_device_id");
      
      const updateData: Record<string, unknown> = { 
        display_name: displayName.trim(),
        gender: selectedGender,
        ...(deviceId && { device_id: deviceId }),
      };
      
      const { error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', userId);

      if (error) {
        console.error('[GenderSelection] update error:', error);
        throw error;
      }

      localStorage.setItem(`gender_selected_${userId}`, 'true');

      if (selectedGender === 'female') {
        toast.success("🎉 Congratulations! Your host account is now active!");
      } else {
        toast.success("Welcome! Your account is ready!");
      }
      
      setSaving(false);
      onComplete();
    } catch (error) {
      console.error('Error saving gender:', error);
      toast.error("Failed to save. Please try again.");
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/95"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 rounded-3xl p-6 max-w-sm w-full border border-purple-500/30 shadow-2xl"
            initial={{ scale: 0.8, y: 50, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.8, y: 50, opacity: 0 }}
            transition={{ type: "spring", damping: 20 }}
          >
            {/* Header */}
            <div className="text-center mb-6">
              <motion.div 
                className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-purple-500/30 to-pink-500/30 flex items-center justify-center"
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ repeat: Infinity, duration: 2 }}
              >
                <Sparkles className="w-10 h-10 text-purple-400" />
              </motion.div>
              <h2 className="text-2xl font-bold text-white mb-2">
                Welcome! 🎉
              </h2>
              <p className="text-white/60 text-sm">
                Enter your name & select gender
              </p>
            </div>

            {/* Name Input */}
            <div className="mb-5">
              <label className="text-white/70 text-xs font-medium mb-1.5 block">Your Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter your name"
                className="w-full h-11 px-4 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-white/30 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 text-sm"
                maxLength={30}
              />
            </div>

            {/* Gender Options */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              {/* Male Option */}
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => setSelectedGender("male")}
                className={`relative p-4 rounded-2xl border-2 transition-all ${
                  selectedGender === "male"
                    ? "border-blue-500 bg-blue-500/20"
                    : "border-white/10 bg-white/5 hover:border-white/20"
                }`}
              >
                <div className="flex flex-col items-center gap-3">
                  <div className={`w-16 h-16 rounded-full overflow-hidden flex items-center justify-center ${
                    selectedGender === "male"
                      ? "ring-2 ring-blue-500"
                      : ""
                  }`}>
                    <img src={maleAvatar} alt="Male" className="w-full h-full object-cover" />
                  </div>
                  <span className={`font-semibold ${
                    selectedGender === "male" ? "text-blue-400" : "text-white/70"
                  }`}>
                    Male
                  </span>
                  <span className="text-[10px] text-white/40">
                    User Account
                  </span>
                </div>
                {selectedGender === "male" && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center"
                  >
                    <UserCheck className="w-4 h-4 text-white" />
                  </motion.div>
                )}
              </motion.button>

              {/* Female Option */}
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => setSelectedGender("female")}
                className={`relative p-4 rounded-2xl border-2 transition-all ${
                  selectedGender === "female"
                    ? "border-pink-500 bg-pink-500/20"
                    : "border-white/10 bg-white/5 hover:border-white/20"
                }`}
              >
                <div className="flex flex-col items-center gap-3">
                  <div className={`w-16 h-16 rounded-full overflow-hidden flex items-center justify-center ${
                    selectedGender === "female"
                      ? "ring-2 ring-pink-500"
                      : ""
                  }`}>
                    <img src={femaleAvatar} alt="Female" className="w-full h-full object-cover" />
                  </div>
                  <span className={`font-semibold ${
                    selectedGender === "female" ? "text-pink-400" : "text-white/70"
                  }`}>
                    Female
                  </span>
                  <div className="flex items-center gap-1">
                    <Crown className="w-3 h-3 text-yellow-400" />
                    <span className="text-[10px] text-yellow-400">
                      Host Account
                    </span>
                  </div>
                </div>
                {selectedGender === "female" && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-pink-500 flex items-center justify-center"
                  >
                    <UserCheck className="w-4 h-4 text-white" />
                  </motion.div>
                )}
              </motion.button>
            </div>

            {/* Info Notice */}
            {selectedGender === "female" && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 rounded-xl bg-gradient-to-r from-pink-500/10 to-purple-500/10 border border-pink-500/20 mb-4"
              >
                <p className="text-pink-300 text-xs text-center">
                  <Crown className="w-3 h-3 inline mr-1" />
                  Selecting Female will automatically convert your account to a Host account!
                </p>
              </motion.div>
            )}

            {/* Continue Button */}
            <Button
              onClick={handleSave}
              disabled={!displayName.trim() || !selectedGender || saving}
              className="w-full h-12 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold text-lg disabled:opacity-50"
            >
              {saving ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Sparkles className="w-5 h-5 mr-2" />
                  Get Started
                </>
              )}
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
