import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import FixedAnimationFrame from "@/components/common/FixedAnimationFrame";

interface FlyingGiftBannerProps {
  senderName: string;
  senderAvatar?: string;
  senderLevel?: number;
  receiverName: string;
  giftName: string;
  giftIcon: string;
  giftImageUrl?: string;
  giftAnimationUrl?: string;
  count: number;
  diamonds: number;
  onComplete: () => void;
}

// Level gradient helper
const getLevelGradient = (level: number) => {
  if (level >= 80) return 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)';
  if (level >= 60) return 'linear-gradient(135deg, #E040FB 0%, #7C4DFF 100%)';
  if (level >= 40) return 'linear-gradient(135deg, #00BCD4 0%, #2196F3 100%)';
  if (level >= 20) return 'linear-gradient(135deg, #4CAF50 0%, #8BC34A 100%)';
  return 'linear-gradient(135deg, #9E9E9E 0%, #757575 100%)';
};

// Banner gradient based on gift value
const getBannerGradient = (diamonds: number) => {
  if (diamonds >= 10000) return 'from-amber-500/95 via-orange-500/90 to-red-500/85';
  if (diamonds >= 1000) return 'from-purple-600/90 via-pink-500/85 to-rose-500/80';
  if (diamonds >= 100) return 'from-blue-600/85 via-indigo-500/80 to-purple-500/75';
  return 'from-slate-700/85 via-gray-600/80 to-slate-700/75';
};

// Tier-aware multi-stop glow shadow (Pkg176/Pkg178 parity)
const getTierShadow = (diamonds: number) => {
  if (diamonds >= 10000) {
    return '0 0 0 1px rgba(251,191,36,0.55), 0 10px 28px -8px rgba(251,146,60,0.55), 0 4px 14px -4px rgba(245,158,11,0.45), inset 0 1px 0 rgba(255,255,255,0.22)';
  }
  if (diamonds >= 1000) {
    return '0 0 0 1px rgba(244,114,182,0.45), 0 10px 28px -8px rgba(168,85,247,0.55), 0 4px 14px -4px rgba(236,72,153,0.4), inset 0 1px 0 rgba(255,255,255,0.18)';
  }
  if (diamonds >= 100) {
    return '0 0 0 1px rgba(129,140,248,0.4), 0 10px 24px -8px rgba(99,102,241,0.5), 0 4px 12px -4px rgba(59,130,246,0.35), inset 0 1px 0 rgba(255,255,255,0.16)';
  }
  return '0 0 0 1px rgba(255,255,255,0.18), 0 10px 22px -8px rgba(0,0,0,0.5), 0 3px 10px -4px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.14)';
};

// Sparkle accent color
const getSparkleColor = (diamonds: number) => {
  if (diamonds >= 10000) return '#FFD700';
  if (diamonds >= 1000) return '#FF69B4';
  if (diamonds >= 100) return '#A5B4FC';
  return '#E5E7EB';
};

export const PremiumFlyingGiftBanner = ({
  senderName,
  senderAvatar,
  senderLevel = 1,
  receiverName,
  giftName,
  giftIcon,
  giftImageUrl,
  giftAnimationUrl,
  count,
  diamonds,
  onComplete
}: FlyingGiftBannerProps) => {
  const [currentCount, setCurrentCount] = useState(0);
  const [isVisible, setIsVisible] = useState(true);
  
  const isPremium = diamonds >= 1000;
  const isLegendary = diamonds >= 10000;

  // Animate count and auto-hide after 3.5 seconds (Bigo/Chamet standard)
  useEffect(() => {
    setCurrentCount(count);

    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onComplete, 200);
    }, 3500);

    return () => {
      clearTimeout(timer);
    };
  }, [count, onComplete]);

  // Render gift visual
  const renderGiftIcon = () => {
    if (giftAnimationUrl?.toLowerCase().endsWith('.svga')) {
      return (
        <div className="w-10 h-10">
          <FixedAnimationFrame
            src={giftAnimationUrl}
            type="svga"
            size="fill"
            loop={true}
            autoPlay={true}
            muted
          />
        </div>
      );
    }

    if (giftImageUrl) {
      return (
        <img loading="lazy" decoding="async" 
          src={giftImageUrl}
          alt={giftName}
          className="w-10 h-10 object-contain"
          style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.45))' }} />
      );
    }

    return (
      <span
        className="text-3xl leading-none"
        style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.45))' }}
      >
        {giftIcon}
      </span>
    );
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="fixed z-[60] pointer-events-none"
          style={{
            left: 8,
            top: '65%',
            transform: 'translateY(-50%)'
          }}
          initial={{ x: -360, opacity: 0, scale: 0.9 }}
          animate={{ x: 0, opacity: 1, scale: 1 }}
          exit={{ x: -360, opacity: 0, scale: 0.9 }}
          transition={{ type: "spring", damping: 24, stiffness: 280 }}
        >
          {/* Main banner */}
          <div
            className={cn(
              "relative flex items-center gap-2.5 pl-1.5 pr-4 py-2 rounded-r-full overflow-hidden",
              "bg-gradient-to-r",
              getBannerGradient(diamonds)
            )}
            style={{
              backdropFilter: 'blur(16px) saturate(150%)',
              WebkitBackdropFilter: 'blur(16px) saturate(150%)',
              boxShadow: getTierShadow(diamonds),
            }}
          >
            {/* Aurora overlay */}
            <div
              className="absolute inset-0 pointer-events-none rounded-r-full"
              style={{
                background: isLegendary
                  ? 'radial-gradient(120% 80% at 0% 0%, rgba(255,255,255,0.22) 0%, transparent 55%), radial-gradient(120% 80% at 100% 100%, rgba(0,0,0,0.20) 0%, transparent 55%)'
                  : 'radial-gradient(120% 80% at 0% 0%, rgba(255,255,255,0.18) 0%, transparent 55%), radial-gradient(120% 80% at 100% 100%, rgba(0,0,0,0.18) 0%, transparent 55%)',
              }}
            />

            {/* giftSendShine sweep overlay */}
            <div
              className="absolute inset-0 pointer-events-none rounded-r-full overflow-hidden"
              aria-hidden="true"
            >
              <div
                className="absolute inset-0"
                style={{
                  background:
                    'linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.22) 50%, transparent 70%)',
                  mixBlendMode: 'overlay',
                  animation: isLegendary
                    ? 'giftSendShine 2.6s ease-in-out infinite'
                    : 'giftSendShine 3.2s ease-in-out infinite',
                }}
              />
            </div>

            {/* Sender Avatar with level badge */}
            <div className="relative flex-shrink-0">
              {/* Soft glow ring */}
              <motion.div
                className="absolute -inset-1 rounded-full blur-md"
                style={{
                  background: isLegendary
                    ? 'radial-gradient(circle, rgba(251,191,36,0.65) 0%, transparent 70%)'
                    : isPremium
                      ? 'radial-gradient(circle, rgba(244,114,182,0.55) 0%, transparent 70%)'
                      : 'radial-gradient(circle, rgba(255,255,255,0.35) 0%, transparent 70%)',
                }}
                animate={{ opacity: [0.55, 0.9, 0.55], scale: [1, 1.06, 1] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
              />

              {senderAvatar ? (
                <img loading="lazy" decoding="async" 
                  src={senderAvatar}
                  alt={senderName}
                  className="relative w-11 h-11 rounded-full object-cover"
                  style={{
                    border: '2px solid rgba(255,255,255,0.65)',
                    boxShadow:
                      '0 0 0 1px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.25)',
                  }} />
              ) : (
                <div
                  className="relative w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-base"
                  style={{
                    background: getLevelGradient(senderLevel),
                    border: '2px solid rgba(255,255,255,0.65)',
                    boxShadow:
                      '0 0 0 1px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.3)',
                  }}
                >
                  {senderName.charAt(0).toUpperCase()}
                </div>
              )}

              {/* Level badge */}
              <div
                className="absolute -bottom-1 -right-1 px-1.5 py-[1px] rounded-md text-[8px] font-bold text-white leading-none tabular-nums"
                style={{
                  background: getLevelGradient(senderLevel),
                  border: '1px solid rgba(255,255,255,0.45)',
                  boxShadow:
                    '0 2px 6px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.35)',
                }}
              >
                Lv{senderLevel}
              </div>
            </div>

            {/* Gift info */}
            <div className="relative flex flex-col min-w-0 z-10">
              <span
                className={cn(
                  "text-[10px] font-medium leading-tight tracking-wide",
                  isLegendary ? "text-amber-50/85" : "text-white/80"
                )}
                style={{ textShadow: '0 1px 2px rgba(0,0,0,0.35)' }}
              >
                Sent to
              </span>
              <span
                className={cn(
                  "font-bold text-sm truncate max-w-[78px] leading-tight",
                  isLegendary ? "text-amber-50" : "text-white"
                )}
                style={{ textShadow: '0 1px 3px rgba(0,0,0,0.45)' }}
              >
                {receiverName}
              </span>
            </div>

            {/* Gift icon with glow */}
            <div className="relative flex-shrink-0 z-10">
              <motion.div
                className="absolute -inset-2 rounded-xl blur-md"
                style={{
                  background: isLegendary
                    ? 'radial-gradient(circle, rgba(251,191,36,0.6) 0%, transparent 70%)'
                    : isPremium
                      ? 'radial-gradient(circle, rgba(244,114,182,0.55) 0%, transparent 70%)'
                      : 'radial-gradient(circle, rgba(255,255,255,0.35) 0%, transparent 70%)',
                }}
                animate={{ scale: [1, 1.18, 1], opacity: [0.45, 0.75, 0.45] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
              />
              <div
                className="relative rounded-xl p-1.5 flex items-center justify-center"
                style={{
                  background: isLegendary
                    ? 'linear-gradient(135deg, rgba(251,191,36,0.28) 0%, rgba(245,158,11,0.18) 100%)'
                    : 'linear-gradient(135deg, rgba(255,255,255,0.20) 0%, rgba(255,255,255,0.08) 100%)',
                  border: isLegendary
                    ? '1px solid rgba(251,191,36,0.5)'
                    : '1px solid rgba(255,255,255,0.32)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25)',
                }}
              >
                {renderGiftIcon()}
              </div>
            </div>

            {/* Count display */}
            <motion.span
              key={currentCount}
              initial={{ scale: 1.55, opacity: 0, rotate: -4 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={{ type: 'spring', damping: 14, stiffness: 320 }}
              className={cn(
                "relative z-10 text-2xl font-black ml-1 tabular-nums leading-none",
                isLegendary
                  ? "bg-gradient-to-b from-amber-100 via-yellow-300 to-orange-400 bg-clip-text text-transparent"
                  : isPremium
                    ? "bg-gradient-to-b from-white via-pink-100 to-pink-300 bg-clip-text text-transparent"
                    : "bg-gradient-to-b from-white via-white to-slate-200 bg-clip-text text-transparent"
              )}
              style={{
                filter: isLegendary
                  ? 'drop-shadow(0 0 8px rgba(251,191,36,0.65)) drop-shadow(0 2px 4px rgba(0,0,0,0.4))'
                  : 'drop-shadow(0 0 6px rgba(255,255,255,0.5)) drop-shadow(0 2px 4px rgba(0,0,0,0.4))',
                WebkitTextStroke: '0.4px rgba(0,0,0,0.18)',
              }}
            >
              ×{currentCount}
            </motion.span>
          </div>

          {/* Sparkle trail for premium gifts */}
          {isPremium && (
            <div className="absolute -right-4 top-1/2 -translate-y-1/2 pointer-events-none">
              {[...Array(6)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute w-1.5 h-1.5 rounded-full"
                  style={{
                    background: getSparkleColor(diamonds),
                    right: 0,
                    boxShadow: isLegendary
                      ? '0 0 8px rgba(251,191,36,0.8), 0 0 14px rgba(245,158,11,0.45)'
                      : '0 0 6px rgba(244,114,182,0.7), 0 0 12px rgba(168,85,247,0.4)',
                  }}
                  animate={{
                    x: [0, 32 + i * 9],
                    y: [0, (i % 2 === 0 ? -1 : 1) * (4 + i)],
                    opacity: [1, 0],
                    scale: [1, 0.4],
                  }}
                  transition={{
                    duration: 0.9,
                    delay: i * 0.09,
                    repeat: Infinity,
                    repeatDelay: 0.5,
                    ease: 'easeOut',
                  }}
                />
              ))}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default PremiumFlyingGiftBanner;
