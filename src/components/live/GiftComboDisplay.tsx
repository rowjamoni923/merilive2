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

  // Pkg178: tier-aware palette
  const tier = isLegendary
    ? {
        bg: "linear-gradient(135deg, rgba(251,191,36,0.95) 0%, rgba(252,211,77,0.95) 50%, rgba(217,119,6,0.95) 100%)",
        border: "2px solid rgba(254,243,199,0.7)",
        glow: "0 0 0 1px rgba(254,243,199,0.4), 0 18px 50px -10px rgba(251,191,36,0.7), 0 8px 24px -8px rgba(217,119,6,0.55), inset 0 1px 0 rgba(255,255,255,0.35)",
        pulseGlow: [
          "0 0 30px rgba(251,191,36,0.45), 0 0 60px rgba(217,119,6,0.25)",
          "0 0 50px rgba(251,191,36,0.75), 0 0 100px rgba(217,119,6,0.45)",
          "0 0 30px rgba(251,191,36,0.45), 0 0 60px rgba(217,119,6,0.25)",
        ],
        nameText: "text-amber-950",
        subText: "text-amber-900",
        receiverText: "text-amber-950",
        countGradient:
          "linear-gradient(180deg, #fffbeb 0%, #fef3c7 40%, #fbbf24 100%)",
        glowColor: "rgba(251,191,36,0.95)",
        sparkleColor: "#fde68a",
      }
    : isPremium
    ? {
        bg: "linear-gradient(135deg, rgba(126,34,206,0.92) 0%, rgba(192,38,211,0.92) 50%, rgba(219,39,119,0.92) 100%)",
        border: "1.5px solid rgba(244,114,182,0.45)",
        glow: "0 0 0 1px rgba(244,114,182,0.25), 0 16px 44px -10px rgba(168,85,247,0.65), 0 6px 22px -8px rgba(236,72,153,0.55), inset 0 1px 0 rgba(255,255,255,0.18)",
        pulseGlow: [
          "0 0 24px rgba(168,85,247,0.35), 0 0 50px rgba(236,72,153,0.2)",
          "0 0 44px rgba(168,85,247,0.6), 0 0 80px rgba(236,72,153,0.4)",
          "0 0 24px rgba(168,85,247,0.35), 0 0 50px rgba(236,72,153,0.2)",
        ],
        nameText: "text-white",
        subText: "text-white/75",
        receiverText: "text-pink-200",
        countGradient:
          "linear-gradient(180deg, #fef3c7 0%, #fde68a 40%, #fbbf24 100%)",
        glowColor: "rgba(236,72,153,0.85)",
        sparkleColor: "#f0abfc",
      }
    : {
        bg: "linear-gradient(135deg, rgba(30,27,75,0.92) 0%, rgba(15,23,42,0.96) 100%)",
        border: "1px solid rgba(255,255,255,0.14)",
        glow: "0 12px 32px -10px rgba(0,0,0,0.6), 0 4px 14px -6px rgba(168,85,247,0.3), inset 0 1px 0 rgba(255,255,255,0.1)",
        pulseGlow: [],
        nameText: "text-white",
        subText: "text-white/70",
        receiverText: "text-pink-300",
        countGradient:
          "linear-gradient(180deg, #fef9c3 0%, #fde68a 50%, #f59e0b 100%)",
        glowColor: "rgba(168,85,247,0.5)",
        sparkleColor: "#fde047",
      };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.82, y: 60 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.85, y: -40 }}
        transition={{ type: "spring", damping: 22, stiffness: 320 }}
        className="fixed bottom-32 left-4 right-4 z-50 flex justify-center"
      >
        {/* Background glow for premium gifts */}
        {isPremium && (
          <motion.div
            className="absolute inset-0 -z-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.35, 0.6, 0.35], scale: [0.95, 1.05, 0.95] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          >
            <div
              className="w-full h-full rounded-3xl blur-3xl"
              style={{
                background: isLegendary
                  ? "radial-gradient(60% 60% at 50% 50%, rgba(251,191,36,0.6) 0%, rgba(217,119,6,0.35) 50%, transparent 80%)"
                  : "radial-gradient(60% 60% at 50% 50%, rgba(168,85,247,0.5) 0%, rgba(236,72,153,0.35) 50%, transparent 80%)",
              }}
            />
          </motion.div>
        )}

        {/* Main container */}
        <motion.div
          className="relative flex items-center gap-3 px-5 py-4 rounded-2xl overflow-hidden"
          style={{
            background: tier.bg,
            border: tier.border,
            backdropFilter: "blur(16px) saturate(150%)",
            WebkitBackdropFilter: "blur(16px) saturate(150%)",
            boxShadow: tier.glow,
          }}
          animate={isPremium && tier.pulseGlow.length ? { boxShadow: tier.pulseGlow } : {}}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        >
          {/* Aurora overlay */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(80% 60% at 0% 0%, rgba(255,255,255,0.22) 0%, transparent 60%), radial-gradient(80% 60% at 100% 100%, rgba(0,0,0,0.22) 0%, transparent 60%)",
            }}
          />
          {/* Shine sweep */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(115deg, transparent 35%, rgba(255,255,255,0.28) 50%, transparent 65%)",
              mixBlendMode: "overlay",
              animation: `giftSendShine ${isLegendary ? "2.4" : isPremium ? "2.8" : "3.4"}s ease-in-out infinite`,
            }}
          />

          {/* Sender Avatar with Premium 3D Frame */}
          <div className="relative shrink-0">
            <Premium3DFrame
              src={combo.senderAvatar}
              name={combo.senderName}
              level={combo.senderLevel}
              size="sm"
              showAnimation={isPremium}
            />
          </div>

          {/* Gift Info */}
          <div className="relative flex flex-col gap-0.5 min-w-0">
            <div className="flex items-center gap-1.5">
              <LevelBadge level={combo.senderLevel} size="xs" />
              <span
                className={`font-extrabold text-sm truncate ${tier.nameText}`}
                style={{ textShadow: isLegendary ? "0 1px 2px rgba(120,53,15,0.3)" : "0 1px 2px rgba(0,0,0,0.4)" }}
              >
                {combo.senderName}
              </span>
            </div>
            <div className="flex items-center gap-1 text-xs">
              <span className={tier.subText}>Send to</span>
              <span
                className={`font-bold ${tier.receiverText}`}
                style={{ textShadow: isLegendary ? "0 1px 2px rgba(120,53,15,0.25)" : "0 1px 2px rgba(0,0,0,0.4)" }}
              >
                {combo.receiverName}
              </span>
            </div>
          </div>

          {/* Gift Icon */}
          <motion.div
            className="relative flex items-center justify-center shrink-0"
            animate={{ scale: [1, 1.14, 1], rotate: [0, -4, 0, 4, 0] }}
            transition={{ duration: 0.7, repeat: Infinity, ease: "easeInOut" }}
            style={{ filter: `drop-shadow(0 4px 14px ${tier.glowColor})` }}
          >
            {combo.giftIcon ? (
              <img loading="lazy" decoding="async" src={combo.giftIcon} alt={combo.giftName} className="w-14 h-14 object-contain" />
            ) : (
              <span className="text-4xl">{combo.giftEmoji}</span>
            )}
          </motion.div>

          {/* Count Display */}
          <div className="relative flex flex-col items-center shrink-0">
            <motion.div
              className="text-3xl font-black leading-none tabular-nums"
              style={{
                background: tier.countGradient,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                filter: `drop-shadow(0 2px 6px ${tier.glowColor}) drop-shadow(0 0 12px ${tier.glowColor})`,
              }}
              animate={showBurst ? { scale: [1, 1.4, 1], rotate: [0, -3, 3, 0] } : {}}
              transition={{ duration: 0.4, ease: "easeOut" }}
              key={displayCount}
            >
              X{displayCount}
            </motion.div>
            <span
              className={`text-[10px] mt-0.5 font-semibold ${isLegendary ? "text-amber-900" : "text-white/70"}`}
              style={{ textShadow: "0 1px 2px rgba(0,0,0,0.3)" }}
            >
              {combo.giftName}
            </span>
          </div>

          {/* Sparkle burst */}
          {showBurst && isPremium && (
            <>
              {[...Array(10)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute rounded-full"
                  initial={{
                    x: 0,
                    y: 0,
                    scale: 0,
                    opacity: 1,
                  }}
                  animate={{
                    x: Math.cos((i * 36 * Math.PI) / 180) * (isLegendary ? 90 : 70),
                    y: Math.sin((i * 36 * Math.PI) / 180) * (isLegendary ? 90 : 70),
                    scale: [0, 1.8, 0],
                    opacity: [1, 1, 0],
                  }}
                  transition={{ duration: 0.75, ease: "easeOut", delay: i * 0.02 }}
                  style={{
                    left: "50%",
                    top: "50%",
                    width: i % 2 === 0 ? 8 : 5,
                    height: i % 2 === 0 ? 8 : 5,
                    background: tier.sparkleColor,
                    boxShadow: `0 0 12px ${tier.sparkleColor}, 0 0 24px ${tier.glowColor}`,
                  }}
                />
              ))}
              {/* Center flash ring */}
              <motion.div
                className="absolute rounded-full pointer-events-none"
                initial={{ scale: 0, opacity: 0.9 }}
                animate={{ scale: isLegendary ? 4.5 : 3.5, opacity: 0 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                style={{
                  left: "50%",
                  top: "50%",
                  width: 60,
                  height: 60,
                  marginLeft: -30,
                  marginTop: -30,
                  border: `2px solid ${tier.sparkleColor}`,
                  boxShadow: `0 0 24px ${tier.glowColor}`,
                }}
              />
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
    initial={{ x: 100, opacity: 0, scale: 0.94 }}
    animate={{ x: 0, opacity: 1, scale: 1 }}
    exit={{ x: 100, opacity: 0, scale: 0.94 }}
    transition={{ type: "spring", damping: 22, stiffness: 360 }}
    className="relative flex items-center gap-2 px-3 py-2 rounded-xl overflow-hidden"
    style={{
      background: "linear-gradient(135deg, rgba(15,23,42,0.7) 0%, rgba(30,27,75,0.7) 100%)",
      backdropFilter: "blur(12px) saturate(140%)",
      WebkitBackdropFilter: "blur(12px) saturate(140%)",
      border: "1px solid rgba(255,255,255,0.12)",
      boxShadow: "0 6px 18px -6px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)",
    }}
  >
    <span
      className="text-white/85 text-xs font-medium truncate max-w-[80px]"
      style={{ textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}
    >
      {senderName}
    </span>
    <span className="text-lg" style={{ filter: "drop-shadow(0 2px 4px rgba(251,191,36,0.5))" }}>
      {giftEmoji}
    </span>
    {count > 1 && (
      <span
        className="text-amber-300 font-extrabold text-sm tabular-nums"
        style={{ textShadow: "0 0 8px rgba(251,191,36,0.5)" }}
      >
        x{count}
      </span>
    )}
  </motion.div>
);

export default GiftComboDisplay;
