import { useEffect, useCallback, useRef } from "react";
import { Phone, PhoneOff, Radio, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useSound } from "@/hooks/useSound";
import AvatarWithFrame from "@/components/common/AvatarWithFrame";

interface IncomingCallModalProps {
  isOpen: boolean;
  callerName: string;
  callerAvatar: string | null;
  callerLevel?: number;
  onAccept: () => void;
  onDecline: () => void;
}

export function IncomingCallModal({
  isOpen,
  callerName,
  callerAvatar,
  callerLevel = 1,
  onAccept,
  onDecline,
}: IncomingCallModalProps) {
  const { startRingtone, stopRingtone, playSound } = useSound();
  // Section#5 pass-2 (Bug F): in-flight guard so rapid double-tap can't
  // fire onAccept/onDecline twice and race CallProvider's accept/decline.
  const processingRef = useRef(false);

  // Play ringtone when modal opens
  useEffect(() => {
    if (isOpen) {
      processingRef.current = false; // reset on each new incoming call
      startRingtone();
    } else {
      stopRingtone();
    }
    return () => {
      stopRingtone();
    };
  }, [isOpen, startRingtone, stopRingtone]);

  const handleAccept = useCallback(() => {
    if (processingRef.current) return;
    processingRef.current = true;
    console.log('[IncomingCall] Accept button clicked');
    stopRingtone();
    onAccept();
  }, [stopRingtone, onAccept]);

  const handleDecline = useCallback(() => {
    if (processingRef.current) return;
    processingRef.current = true;
    console.log('[IncomingCall] Decline button clicked');
    stopRingtone();
    onDecline();
  }, [stopRingtone, onDecline]);

  // Section#5 pass-2 (Bug G): removed `if (!isOpen) return null;` early-return —
  // it unmounted the motion children before AnimatePresence could play the
  // exit transition. The inner `{isOpen && (...)}` already gates rendering.

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Subtle backdrop - tappable to ignore but keeps context visible */}
          <motion.div
            key="incoming-call-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[99] bg-black/30 backdrop-blur-[2px]"
          />

          {/* Card notification - slides down from top */}
          <motion.div
            key="incoming-call-card"
            initial={{ y: -120, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -120, opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", damping: 24, stiffness: 300 }}
            className="fixed top-4 left-3 right-3 z-[100] max-w-md mx-auto"
            style={{ willChange: 'transform, opacity' }}
          >
            <div
              className="relative overflow-hidden rounded-3xl border border-white/10"
              style={{
                background: 'linear-gradient(135deg, rgba(15, 5, 36, 0.97) 0%, rgba(26, 10, 53, 0.98) 50%, rgba(13, 4, 32, 0.97) 100%)',
                boxShadow: '0 20px 60px rgba(0, 0, 0, 0.6), 0 0 40px rgba(34, 197, 94, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
              }}
            >
              {/* Animated top glow bar */}
              <div className="absolute top-0 left-0 right-0 h-[2px] overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-transparent via-green-400 to-transparent animate-pulse"
                  style={{ animationDuration: '1.5s' }}
                />
              </div>

              {/* Ambient glow orbs */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-green-500/15 to-transparent rounded-full blur-2xl" />
              <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-purple-500/10 to-transparent rounded-full blur-xl" />

              {/* Card content */}
              <div className="relative p-4">
                {/* Top row: Label + call type */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                    <span className="text-green-300/90 text-[11px] font-semibold uppercase tracking-widest">
                      Incoming Video Call
                    </span>
                  </div>
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/20">
                    <Radio className="w-3 h-3 text-green-400" />
                    <span className="text-green-300 text-[10px] font-medium">Live</span>
                  </div>
                </div>

                {/* Main row: Avatar + Info + Buttons */}
                <div className="flex items-center gap-3">
                  {/* Caller Avatar with ripple */}
                  <div className="relative flex-shrink-0">
                    {/* Ripple ring */}
                    <div 
                      className="absolute -inset-1.5 rounded-full border border-green-400/30 animate-ping"
                      style={{ animationDuration: '2s' }}
                    />
                    <div
                      className="relative rounded-full"
                      style={{ boxShadow: '0 0 20px rgba(34, 197, 94, 0.4)' }}
                    >
                      <AvatarWithFrame
                        src={callerAvatar}
                        name={callerName}
                        level={callerLevel}
                        size="md"
                        showAnimation={false}
                      />
                    </div>
                  </div>

                  {/* Caller info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-white font-bold text-base truncate">
                        {callerName}
                      </h3>
                      {callerLevel >= 20 && (
                        <Sparkles className="w-4 h-4 text-amber-400 flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-white/40 text-xs mt-0.5">
                      Tap to answer the call
                    </p>
                  </div>

                  {/* Action buttons - compact */}
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {/* Decline */}
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDecline();
                      }}
                      type="button"
                      className="w-12 h-12 rounded-full bg-gradient-to-br from-red-500 to-red-600 active:from-red-600 active:to-red-700 text-white flex items-center justify-center touch-manipulation active:scale-90 transition-transform"
                      style={{
                        boxShadow: '0 4px 15px rgba(239, 68, 68, 0.4), 0 2px 8px rgba(0, 0, 0, 0.3)',
                      }}
                    >
                      <PhoneOff className="w-5 h-5" />
                    </button>

                    {/* Accept - slightly larger with pulse */}
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleAccept();
                      }}
                      type="button"
                      className="w-14 h-14 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 active:from-green-500 active:to-emerald-600 text-white flex items-center justify-center touch-manipulation active:scale-90 transition-transform"
                      style={{
                        boxShadow: '0 4px 20px rgba(34, 197, 94, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3)',
                        animation: 'pulse 1.5s ease-in-out infinite',
                      }}
                    >
                      <Phone className="w-6 h-6" />
                    </button>
                  </div>
                </div>

                {/* Bottom sound wave */}
                <div className="flex justify-center gap-1 mt-3 opacity-40">
                  {[...Array(12)].map((_, i) => (
                    <div
                      key={i}
                      className="w-1 rounded-full bg-gradient-to-t from-green-500/80 to-green-300/80 animate-bounce"
                      style={{
                        height: `${8 + Math.sin(i * 0.8) * 6}px`,
                        animationDelay: `${i * 0.06}s`,
                        animationDuration: '0.5s',
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
