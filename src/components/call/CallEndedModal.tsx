import { motion, AnimatePresence } from "framer-motion";
import { PhoneOff, Clock, TrendingUp, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import AvatarWithFrame from "@/components/common/AvatarWithFrame";
import BeansIcon from "@/components/common/BeansIcon";

interface CallEndedModalProps {
  isOpen: boolean;
  onClose: () => void;
  remoteUserName: string;
  remoteUserAvatar: string | null;
  remoteUserLevel?: number;
  duration: number;
  coinsSpent: number;
  hostEarned: number;
  isHost: boolean;
  endedBy: 'self' | 'remote' | 'system';
  endReason?: 'normal' | 'declined' | 'missed' | 'insufficient_coins';
}

export function CallEndedModal({
  isOpen,
  onClose,
  remoteUserName,
  remoteUserAvatar,
  remoteUserLevel = 1,
  duration,
  hostEarned,
  isHost,
  endedBy,
  endReason = 'normal',
}: CallEndedModalProps) {
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const formatCoins = (coins: number) => {
    if (coins >= 1000) return `${(coins / 1000).toFixed(1)}K`;
    return coins.toString();
  };

  // ===== CALLER/USER: Simple Banner Style - NO earnings/diamond info =====
  if (!isHost) {
    return (
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -100 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed top-0 left-0 right-0 z-[150] p-4 pt-16 safe-area-top"
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              className="max-w-sm mx-auto bg-gradient-to-r from-[#FFFBF2]/95 via-gray-800/95 to-[#F5EFDF]/95 backdrop-blur-xl rounded-2xl border border-amber-200/60 shadow-2xl overflow-hidden"
            >
              <div className="p-4">
                <div className="flex items-center gap-3">
                  {/* Call End Icon */}
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-red-500/30 to-pink-500/30 flex items-center justify-center border border-red-500/30 flex-shrink-0">
                    <PhoneOff className="w-5 h-5 text-red-400" />
                  </div>

                  {/* Text Content - NO diamond/earnings info for user privacy */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-slate-800 font-semibold text-base">
                      {endReason === 'declined' ? 'Call Declined' : 
                       endReason === 'missed' ? 'Call Missed' : 
                       endReason === 'insufficient_coins' ? 'Call Ended' :
                       'Call Ended'}
                    </h3>
                    <p className="text-slate-600 text-sm truncate">
                      {endReason === 'insufficient_coins' 
                        ? 'Insufficient balance'
                        : endedBy === 'remote' 
                          ? `${remoteUserName} ended the call`
                          : 'Thanks for using MeriLive!'
                      }
                    </p>
                  </div>

                  {/* Duration Badge - Simple, no cost info */}
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50/70 flex-shrink-0">
                    <Clock className="w-3.5 h-3.5 text-blue-400" />
                    <span className="text-slate-800 text-sm font-medium">{formatDuration(duration)}</span>
                  </div>
                </div>
              </div>

              {/* Auto-close progress bar - 4 seconds */}
              <motion.div
                initial={{ width: "100%" }}
                animate={{ width: "0%" }}
                transition={{ duration: 4, ease: "linear" }}
                onAnimationComplete={onClose}
                className="h-1 bg-gradient-to-r from-pink-500 to-purple-500"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  // ===== HOST: Full Earnings Summary Modal =====
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[150] flex items-center justify-center p-4"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 50 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 50 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            className="relative w-full max-w-sm bg-gradient-to-br from-[#FAF5EA] via-[#FFFBF2] to-[#FAF5EA] rounded-3xl border border-amber-200/60 shadow-2xl overflow-hidden"
          >
            {/* Decorative Gradient */}
            <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-green-500/20 to-transparent" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-purple-500/10 rounded-full blur-[100px]" />

            <div className="relative p-6 pt-8 text-center">
              {/* Earnings Icon */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.1, type: "spring", damping: 15 }}
                className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-green-500/30 to-emerald-500/30 flex items-center justify-center border border-green-500/30"
              >
                <TrendingUp className="w-7 h-7 text-green-400" />
              </motion.div>

              {/* Title */}
              <motion.h2
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="text-xl font-bold text-slate-800 mb-1"
              >
                {endedBy === 'remote' ? 'Caller Left' : 'Call Ended'}
              </motion.h2>

              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-slate-600 text-sm mb-6"
              >
                {endedBy === 'remote' 
                  ? `${remoteUserName} ended the call`
                  : 'Great job! Here\'s your earnings'
                }
              </motion.p>

              {/* User Avatar */}
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.25 }}
                className="flex justify-center mb-4"
              >
                <AvatarWithFrame
                  userId={remoteUserName}
                  src={remoteUserAvatar || undefined}
                  name={remoteUserName}
                  level={remoteUserLevel}
                  size="lg"
                  showFrame={true}
                />
              </motion.div>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-slate-700 text-sm mb-6"
              >
                Call with <span className="text-slate-800 font-medium">{remoteUserName}</span>
              </motion.p>

              {/* Stats Card */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
                className="bg-white/5 backdrop-blur-sm rounded-2xl p-4 border border-amber-200/60 mb-6"
              >
                <div className="grid grid-cols-2 gap-4">
                  {/* Duration */}
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <Clock className="w-4 h-4 text-blue-400" />
                      <span className="text-slate-600 text-xs">Duration</span>
                    </div>
                    <p className="text-slate-800 text-lg font-bold">{formatDuration(duration)}</p>
                  </div>

                  {/* Beans Earned */}
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <TrendingUp className="w-4 h-4 text-green-400" />
                      <span className="text-slate-600 text-xs">Earned</span>
                    </div>
                    <div className="flex items-center justify-center gap-1">
                      <BeansIcon size={18} />
                      <span className="text-green-400 text-lg font-bold">
                        +{formatCoins(hostEarned)}
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Success Message */}
              {hostEarned > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="flex items-center justify-center gap-2 mb-6 text-green-400 text-sm"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>Beans added to your wallet!</span>
                </motion.div>
              )}

              {/* Close Button */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45 }}
              >
                <Button
                  onClick={onClose}
                  className="w-full h-12 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-medium rounded-xl shadow-lg shadow-green-500/25"
                >
                  Done
                </Button>
              </motion.div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default CallEndedModal;
