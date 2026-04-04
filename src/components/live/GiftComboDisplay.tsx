import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LevelBadge } from "@/components/common/LevelBadge";
import Premium3DFrame from "@/components/common/Premium3DFrame";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface GiftCombo {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  senderLevel: number;
  receiverName: string;
  giftName: string;
  giftEmoji: string;
  giftIcon?: string;
  count: number;
  totalValue: number;
}

interface GiftComboDisplayProps {
  combo: GiftCombo | null;
  onComplete?: () => void;
}

export const GiftComboDisplay = ({ combo, onComplete }: GiftComboDisplayProps) => {
  const [displayCount, setDisplayCount] = useState(0);
  const [showBurst, setShowBurst] = useState(false);
  const [currentComboId, setCurrentComboId] = useState<string | null>(null);

  useEffect(() => {
    if (!combo) return;
    
    // Only process if it's a new combo or same combo with updated count
    if (currentComboId !== combo.id) {
      setCurrentComboId(combo.id);
      setDisplayCount(0);
      setShowBurst(false);
    }

    // Animate count up
    const steps = Math.min(combo.count, 30);
    const stepDuration = Math.min(1500 / steps, 100);
    let currentStep = 0;

    const countInterval = setInterval(() => {
      currentStep++;
      const progress = currentStep / steps;
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      setDisplayCount(Math.floor(combo.count * easedProgress));

      if (currentStep >= steps) {
        clearInterval(countInterval);
        setDisplayCount(combo.count);
        setShowBurst(true);
      }
    }, stepDuration);

    // Auto complete after animation
    const timer = setTimeout(() => {
      onComplete?.();
      setCurrentComboId(null);
    }, 4000);

    return () => {
      clearInterval(countInterval);
      clearTimeout(timer);
    };
  }, [combo, onComplete, currentComboId]);

  if (!combo) return null;

  const isPremium = combo.totalValue >= 1000;
  const isLegendary = combo.totalValue >= 10000;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.8, y: 50 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.8, y: -50 }}
        className="fixed bottom-32 left-4 right-4 z-50 flex justify-center"
      >
        {/* Background glow for premium gifts */}
        {isPremium && (
          <motion.div
            className="absolute inset-0 -z-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.3, 0.5, 0.3] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            <div className={`
              w-full h-full rounded-3xl blur-3xl
              ${isLegendary 
                ? "bg-gradient-to-r from-amber-500/50 to-yellow-500/50" 
                : "bg-gradient-to-r from-purple-500/40 to-pink-500/40"
              }
            `} />
          </motion.div>
        )}

        {/* Main container */}
        <motion.div
          className={`
            flex items-center gap-3 px-5 py-4 rounded-2xl
            ${isLegendary 
              ? "bg-gradient-to-r from-amber-500/90 via-yellow-400/90 to-amber-500/90 border-2 border-yellow-300/50 shadow-[0_0_40px_rgba(251,191,36,0.4)]"
              : isPremium
              ? "bg-gradient-to-r from-purple-600/90 via-fuchsia-600/90 to-pink-600/90 border border-pink-400/30 shadow-[0_0_30px_rgba(192,38,211,0.3)]"
              : "bg-gradient-to-r from-slate-800/95 to-slate-900/95 border border-white/20"
            }
            backdrop-blur-md
          `}
          animate={isPremium ? {
            boxShadow: [
              "0 0 20px rgba(251,191,36,0.2)",
              "0 0 40px rgba(251,191,36,0.4)",
              "0 0 20px rgba(251,191,36,0.2)"
            ]
          } : {}}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          {/* Sender Avatar with Premium 3D Frame */}
          <Premium3DFrame 
            src={combo.senderAvatar}
            name={combo.senderName}
            level={combo.senderLevel} 
            size="sm" 
            showAnimation={isPremium}
          />

          {/* Gift Info */}
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="flex items-center gap-1.5">
              <LevelBadge level={combo.senderLevel} size="xs" />
              <span className={`font-bold text-sm truncate ${isLegendary ? "text-amber-900" : "text-white"}`}>
                {combo.senderName}
              </span>
            </div>
            <div className="flex items-center gap-1 text-xs">
              <span className={isLegendary ? "text-amber-800" : "text-white/70"}>
                Send to
              </span>
              <span className={`font-semibold ${isLegendary ? "text-amber-900" : "text-pink-300"}`}>
                {combo.receiverName}
              </span>
            </div>
          </div>

          {/* Gift Icon */}
          <motion.div
            className="flex items-center justify-center"
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 0.5, repeat: Infinity }}
          >
            {combo.giftIcon ? (
              <img src={combo.giftIcon} alt={combo.giftName} className="w-14 h-14 object-contain" />
            ) : (
              <span className="text-4xl">{combo.giftEmoji}</span>
            )}
          </motion.div>

          {/* Count Display */}
          <div className="flex flex-col items-center">
            <motion.div
              className={`
                text-3xl font-black
                ${isLegendary 
                  ? "text-amber-900 drop-shadow-lg" 
                  : "bg-gradient-to-b from-yellow-200 via-amber-300 to-yellow-400 bg-clip-text text-transparent"
                }
              `}
              animate={showBurst ? { scale: [1, 1.3, 1] } : {}}
              transition={{ duration: 0.3 }}
              key={displayCount}
            >
              X{displayCount}
            </motion.div>
            <span className={`text-[10px] ${isLegendary ? "text-amber-800" : "text-white/60"}`}>
              {combo.giftName}
            </span>
          </div>

          {/* Sparkle effects for combo */}
          {showBurst && isPremium && (
            <>
              {[...Array(8)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute w-2 h-2 rounded-full bg-yellow-300"
                  initial={{ 
                    x: 0, 
                    y: 0, 
                    scale: 0, 
                    opacity: 1 
                  }}
                  animate={{
                    x: Math.cos(i * 45 * Math.PI / 180) * 60,
                    y: Math.sin(i * 45 * Math.PI / 180) * 60,
                    scale: [0, 1.5, 0],
                    opacity: [1, 1, 0]
                  }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                  style={{ left: '50%', top: '50%' }}
                />
              ))}
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

// Mini gift notification that appears in corner
export const MiniGiftNotification = ({ 
  senderName, 
  giftEmoji, 
  giftName, 
  count 
}: { 
  senderName: string; 
  giftEmoji: string; 
  giftName: string; 
  count: number;
}) => (
  <motion.div
    initial={{ x: 100, opacity: 0 }}
    animate={{ x: 0, opacity: 1 }}
    exit={{ x: 100, opacity: 0 }}
    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-black/60 backdrop-blur-sm border border-white/10"
  >
    <span className="text-white/80 text-xs truncate max-w-[80px]">{senderName}</span>
    <span className="text-lg">{giftEmoji}</span>
    {count > 1 && (
      <span className="text-amber-400 font-bold text-sm">x{count}</span>
    )}
  </motion.div>
);

export default GiftComboDisplay;
