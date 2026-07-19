import { motion, AnimatePresence } from "framer-motion";
import { Gem, Trophy, Sparkles, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { getProxiedUrl } from "@/utils/r2ProxyUrl";
import { getOptimizedImageUrl } from "@/utils/imageOptimize";

interface WinPopupProps {
  show: boolean;
  amount: number;
  multiplier?: number;
  emoji?: string;
  logoUrl?: string; // NEW: Game logo from Admin Panel
  message?: string;
  isWin?: boolean; // true = win, false = lose
  duration?: number; // How long to show (default 3000ms)
}

export function WinPopup({ show, amount, multiplier, emoji, logoUrl, message, isWin = true, duration = 3000 }: WinPopupProps) {
  const winEmoji = emoji || "🎉";
  const loseEmoji = "😢";
  const displayEmoji = isWin ? winEmoji : loseEmoji;
  const [mounted, setMounted] = useState(false);
  const [imageError, setImageError] = useState(false);
  
  // Reset image error when popup shows again
  useEffect(() => {
    if (show) {
      setImageError(false);
    }
  }, [show]);
  
  // Ensure we only render portal after component mounts (for SSR safety)
  useEffect(() => {
    setMounted(true);
  }, []);
  
  // DEBUG: Log every show state change
  useEffect(() => {
    if (show) {
      console.log('[WinPopup] 🎯 POPUP TRIGGERED!', { show, amount, isWin, message, logoUrl });
    }
  }, [show, amount, isWin, message, logoUrl]);
  
  // Don't render anything if not mounted or not showing
  if (!mounted) return null;
  
  // Determine if we should show logo or emoji
  const showLogo = isWin && logoUrl && !imageError;
  
  const popupContent = (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, scale: 0.3, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.5, y: -20 }}
          transition={{ 
            type: "spring", 
            stiffness: 300, 
            damping: 20,
            duration: 0.5
          }}
          // CRITICAL: Fixed position with maximum z-index to appear above EVERYTHING
          className="fixed inset-0 flex items-center justify-center pointer-events-none"
          style={{ 
            zIndex: 999999, // Maximum z-index to be above all elements
            isolation: 'isolate'
          }}
        >
          <div className={cn(
            "relative rounded-2xl p-4 shadow-2xl border-2 overflow-hidden max-w-[220px] mx-auto pointer-events-auto",
            isWin 
              ? "bg-gradient-to-br from-yellow-400 via-amber-500 to-orange-600 shadow-yellow-500/50 border-yellow-300/60" 
              : "bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 shadow-slate-500/40 border-slate-500/50"
          )}>
            {/* Animated Background Glow - only for wins */}
            {isWin && (
              <motion.div
                className="absolute inset-0 bg-gradient-radial from-white/30 via-transparent to-transparent"
                animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
                transition={{ duration: 1.5, repeat: 1, ease: "easeInOut" }}
              />
            )}

            {/* Shimmer effect - only for wins */}
            {isWin && (
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent skew-x-12"
                animate={{ x: ["-150%", "150%"] }}
                transition={{ duration: 1.5, repeat: 1, ease: "easeInOut", repeatDelay: 0.5 }}
              />
            )}
            
            {/* Sparkle particles - only for wins */}
            {isWin && [...Array(8)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute"
                style={{
                  left: `${10 + Math.random() * 80}%`,
                  top: `${10 + Math.random() * 80}%`,
                }}
                animate={{
                  scale: [0, 1.5, 0],
                  opacity: [0, 1, 0],
                  rotate: [0, 180, 360],
                }}
                transition={{
                  duration: 1,
                  repeat: 1,
                  delay: i * 0.2,
                }}
              >
                <Sparkles className="w-3 h-3 text-yellow-200" />
              </motion.div>
            ))}

            {/* Flying Stars for Win */}
            {isWin && [...Array(4)].map((_, i) => (
              <motion.div
                key={`star-${i}`}
                className="absolute"
                initial={{ 
                  left: "50%", 
                  top: "50%",
                  scale: 0 
                }}
                animate={{ 
                  left: `${-20 + i * 40}%`,
                  top: `${-20 + (i % 2) * 140}%`,
                  scale: [0, 1, 0],
                  rotate: [0, 360],
                }}
                transition={{
                  duration: 1.2,
                  delay: 0.2 + i * 0.1,
                  repeat: 1,
                  repeatDelay: 1,
                }}
              >
                <Star className="w-4 h-4 text-yellow-300 fill-yellow-300" />
              </motion.div>
            ))}

            <div className="relative z-10 flex flex-col items-center text-center gap-1">
              {/* Game Logo or Emoji with enhanced animation */}
              <motion.div
                className="relative"
                animate={isWin ? { 
                  rotate: [-5, 5, -5], 
                  scale: [1, 1.15, 1],
                  y: [0, -5, 0]
                } : { 
                  y: [0, 3, 0] 
                }}
                transition={{ duration: 0.4, repeat: 2 }}
              >
                {isWin && (
                  <motion.div
                    className="absolute -inset-4 bg-yellow-400/30 rounded-full blur-xl"
                    animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0.8, 0.5] }}
                    transition={{ duration: 0.8, repeat: 1 }}
                  />
                )}
                
                {/* Show Game Logo from Admin Panel if available, otherwise emoji */}
                {showLogo ? (
                  <div className="relative z-10 w-14 h-14 rounded-xl bg-white/90 p-1.5 shadow-lg border-2 border-yellow-300/50 flex items-center justify-center">
                    <img loading="eager" decoding="async" 
                      src={getOptimizedImageUrl(getProxiedUrl(logoUrl), { width: 80, quality: 82 })} 
                      alt="Game"
                      className="w-10 h-10 object-contain"
                      onError={() => setImageError(true)}
                    />
                  </div>
                ) : (
                  <span className="text-4xl relative z-10">{displayEmoji}</span>
                )}
              </motion.div>
              
              {/* Win/Lose Text - English only with better styling */}
              <motion.div
                initial={{ scale: 0, y: 10 }}
                animate={{ scale: 1, y: 0 }}
                transition={{ delay: 0.15, type: "spring", stiffness: 300 }}
              >
                <h3 className={cn(
                  "font-extrabold text-lg tracking-wide drop-shadow-lg",
                  isWin ? "text-white" : "text-gray-300"
                )}>
                  {message || (isWin ? "🎊 YOU WON! 🎊" : "Better Luck!")}
                </h3>
              </motion.div>
              
              {/* Amount with enhanced display */}
              <motion.div
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.25 }}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2 rounded-full shadow-inner",
                  isWin ? "bg-black/25" : "bg-black/40"
                )}
              >
                {isWin && <Trophy className="w-4 h-4 text-yellow-200" />}
                <Gem className={cn("w-4 h-4", isWin ? "text-yellow-200" : "text-gray-400")} />
                <span className={cn(
                  "font-bold text-xl",
                  isWin ? "text-white" : "text-red-400"
                )}>
                  {isWin ? "+" : "-"}{amount.toLocaleString()}
                </span>
              </motion.div>

              {/* Multiplier Badge */}
              {multiplier && isWin && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.35, type: "spring" }}
                  className="px-3 py-1 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full border border-green-300/50 shadow-lg"
                >
                  <span className="text-white text-sm font-bold">
                    {multiplier}x Multiplier!
                  </span>
                </motion.div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
  
  // Use React Portal to render popup directly in document.body
  // This ensures it's ALWAYS above all other elements regardless of parent z-index
  return createPortal(popupContent, document.body);
}

// Format bet amount for display (K = thousand, M = million)
export const formatBetDisplay = (amount: number): string => {
  if (amount >= 1000000) {
    const m = amount / 1000000;
    return `${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  if (amount >= 1000) {
    const k = amount / 1000;
    return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}K`;
  }
  return amount.toString();
};
