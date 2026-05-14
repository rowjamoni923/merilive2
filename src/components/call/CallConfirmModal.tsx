import React from "react";
import { Phone, X, Diamond, Clock, Sparkles, User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useHostCallRate } from "@/hooks/useHostCallRate";

interface CallConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  hostId: string;
  hostName: string;
  hostAvatar: string | null;
  hostLevel?: number;
  userCoins: number;
}

export const CallConfirmModal = React.forwardRef<HTMLDivElement, CallConfirmModalProps>(function CallConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  hostId,
  hostName,
  hostAvatar,
  hostLevel = 1,
  userCoins,
}, _ref) {
  const navigate = useNavigate();
  
  // Use centralized hook for consistent rate across all components
  // This will automatically update when host changes their rate
  const { callRate, loading } = useHostCallRate(isOpen ? hostId : null);

  // Check if rate is configured and user has enough coins
  const rateConfigured = callRate !== null && callRate > 0;
  const hasEnoughCoins = rateConfigured && userCoins >= callRate;

  // Handle call or redirect to recharge
  const handleAction = () => {
    if (!rateConfigured) {
      // Rate not set - cannot call
      return;
    }
    if (hasEnoughCoins) {
      onConfirm();
    } else {
      onClose();
      navigate("/recharge");
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0, y: 50 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.8, opacity: 0, y: 50 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-sm bg-gradient-to-b from-[#FFFBF2] via-[#FAF5EA] to-[#F5EFDF] rounded-3xl overflow-hidden border border-amber-200/60 shadow-2xl"
        >
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-amber-50/70 flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-amber-50 transition-all z-10"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Host Info Section */}
          <div className="relative pt-8 pb-6 px-6">
            {/* Background Glow */}
            <div className="absolute inset-0 bg-gradient-to-b from-pink-500/20 via-purple-500/10 to-transparent" />
            
            {/* Avatar with Ripple */}
            <div className="relative flex justify-center mb-4">
              <motion.div
                animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0, 0.3] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute inset-0 bg-gradient-to-r from-pink-500 to-purple-500 rounded-full"
                style={{ width: 120, height: 120, top: -10, left: "50%", marginLeft: -60 }}
              />
              <Avatar className="w-24 h-24 border-4 border-pink-500 shadow-xl shadow-pink-500/30 relative z-10">
                <AvatarImage src={hostAvatar || undefined} />
                <AvatarFallback className="bg-gradient-to-br from-pink-500 to-purple-600 text-white text-2xl">
                  <User className="w-10 h-10" />
                </AvatarFallback>
              </Avatar>
              
              {/* Level Badge */}
              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-400 to-amber-600 px-3 py-0.5 rounded-full shadow-lg z-20">
                <span className="text-xs font-bold text-black">Lv.{hostLevel}</span>
              </div>
            </div>

            {/* Host Name */}
            <h2 className="text-slate-800 text-xl font-bold text-center relative z-10">{hostName}</h2>
          </div>

          {/* Call Rate Section */}
          <div className="px-6 pb-4">
            <motion.div 
              className="bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-pink-500/20 rounded-2xl p-4 border border-amber-500/30"
              animate={{ boxShadow: ["0 0 20px rgba(245,158,11,0.2)", "0 0 30px rgba(245,158,11,0.4)", "0 0 20px rgba(245,158,11,0.2)"] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/30">
                    <Diamond className="w-6 h-6 text-slate-800" />
                  </div>
                  <div>
                    <p className="text-slate-600 text-xs">Per minute</p>
                    <div className="flex items-center gap-1">
                      <motion.span 
                        className="text-2xl font-bold text-amber-400"
                        key={callRate}
                        initial={{ scale: 1.2 }}
                        animate={{ scale: 1 }}
                      >
                        {loading ? "..." : (callRate !== null ? callRate : "Not Set")}
                      </motion.span>
                      {callRate !== null && <span className="text-amber-400/60 text-sm">💎</span>}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-1.5 bg-black/30 px-3 py-1.5 rounded-full">
                  <Clock className="w-4 h-4 text-slate-600" />
                  <span className="text-slate-700 text-sm font-medium">/min</span>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Action Buttons */}
          <div className="px-6 pb-6 space-y-3">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleAction}
              disabled={loading || !rateConfigured}
              className={`w-full py-4 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-3 ${
                loading || !rateConfigured
                  ? "bg-amber-50/70 text-slate-500 cursor-not-allowed"
                  : hasEnoughCoins 
                    ? "bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 text-white shadow-lg shadow-pink-500/30"
                    : "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/30"
              }`}
            >
              {!rateConfigured ? (
                <>
                  <X className="w-5 h-5" />
                  <span>Call Rate Not Set</span>
                </>
              ) : hasEnoughCoins ? (
                <>
                  <motion.div
                    animate={{ rotate: [0, 10, -10, 0] }}
                    transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 1 }}
                  >
                    <Phone className="w-5 h-5" />
                  </motion.div>
                  <span>Video Call</span>
                  <Sparkles className="w-4 h-4" />
                </>
              ) : (
                <>
                  <Diamond className="w-5 h-5" />
                  <span>Recharge Now</span>
                </>
              )}
            </motion.button>

            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl font-medium text-slate-600 hover:text-white hover:bg-white/5 transition-all"
            >
              Cancel
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
});
