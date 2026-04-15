import { useEffect, useState, useMemo, Suspense, lazy } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

const SVGAPlayer = lazy(() => import("@/components/common/SVGAPlayer"));

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
  coins: number;
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
const getBannerGradient = (coins: number) => {
  if (coins >= 10000) return 'from-amber-500/95 via-orange-500/90 to-red-500/85';
  if (coins >= 1000) return 'from-purple-600/90 via-pink-500/85 to-rose-500/80';
  if (coins >= 100) return 'from-blue-600/85 via-indigo-500/80 to-purple-500/75';
  return 'from-slate-700/85 via-gray-600/80 to-slate-700/75';
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
  coins,
  onComplete
}: FlyingGiftBannerProps) => {
  const [currentCount, setCurrentCount] = useState(0);
  const [isVisible, setIsVisible] = useState(true);
  
  const isPremium = coins >= 1000;
  const isLegendary = coins >= 10000;

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
    // Priority: SVGA animation > Image > Emoji
    if (giftAnimationUrl?.toLowerCase().endsWith('.svga')) {
      return (
        <Suspense fallback={<div className="w-10 h-10 animate-pulse bg-white/20 rounded-lg" />}>
          <SVGAPlayer
            src={giftAnimationUrl}
            className="w-10 h-10"
            loop={true}
            autoPlay={true}
          />
        </Suspense>
      );
    }
    
    if (giftImageUrl) {
      return (
        <img 
          src={giftImageUrl} 
          alt={giftName}
          className="w-10 h-10 object-contain drop-shadow-lg"
        />
      );
    }
    
    return <span className="text-3xl drop-shadow-lg">{giftIcon}</span>;
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
          initial={{ x: -350, opacity: 0, scale: 0.85 }}
          animate={{ x: 0, opacity: 1, scale: 1 }}
          exit={{ x: -350, opacity: 0, scale: 0.85 }}
          transition={{ type: "spring", damping: 22, stiffness: 200 }}
        >
          {/* Main banner */}
          <div className={cn(
            "flex items-center gap-2.5 pl-1.5 pr-4 py-2 rounded-r-full",
            "bg-gradient-to-r backdrop-blur-xl",
            "border border-white/25",
            getBannerGradient(coins),
            isLegendary && "shadow-[0_0_30px_rgba(251,191,36,0.5)]",
            isPremium && !isLegendary && "shadow-[0_0_25px_rgba(168,85,247,0.4)]"
          )}>
            {/* Sender Avatar with level badge */}
            <div className="relative flex-shrink-0">
              {/* Glow ring */}
              <motion.div 
                className={cn(
                  "absolute -inset-1 rounded-full blur-sm",
                  isLegendary ? "bg-amber-400/60" : "bg-pink-400/50"
                )}
                animate={{ opacity: [0.5, 0.8, 0.5] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
              
              {senderAvatar ? (
                <img
                  src={senderAvatar}
                  alt={senderName}
                  className="relative w-11 h-11 rounded-full border-2 border-white/60 object-cover"
                />
              ) : (
                <div 
                  className="relative w-11 h-11 rounded-full border-2 border-white/60 flex items-center justify-center text-white font-bold text-base"
                  style={{ background: getLevelGradient(senderLevel) }}
                >
                  {senderName.charAt(0).toUpperCase()}
                </div>
              )}
              
              {/* Level badge */}
              <div 
                className="absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded text-[8px] font-bold text-white border border-white/30"
                style={{ background: getLevelGradient(senderLevel) }}
              >
                Lv{senderLevel}
              </div>
            </div>

            {/* Gift info */}
            <div className="flex flex-col min-w-0">
              <span className={cn(
                "text-[10px] font-medium",
                isLegendary ? "text-amber-100/80" : "text-white/70"
              )}>
                Send to
              </span>
              <span className={cn(
                "font-bold text-sm truncate max-w-[75px]",
                isLegendary ? "text-amber-100" : "text-white"
              )}>
                {receiverName}
              </span>
            </div>

            {/* Gift icon with glow */}
            <div className="relative flex-shrink-0">
              <motion.div
                className={cn(
                  "absolute -inset-2 rounded-xl blur-md",
                  isLegendary ? "bg-amber-400/50" : "bg-pink-400/40"
                )}
                animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.7, 0.4] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              />
              <div className={cn(
                "relative rounded-xl p-1.5 border",
                isLegendary 
                  ? "bg-amber-400/25 border-amber-400/40" 
                  : "bg-white/15 border-white/30"
              )}>
                {renderGiftIcon()}
              </div>
            </div>

            {/* Count display */}
            <motion.span
              key={currentCount}
              initial={{ scale: 1.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className={cn(
                "text-2xl font-black ml-1",
                isLegendary
                  ? "bg-gradient-to-b from-amber-200 via-yellow-300 to-orange-400 bg-clip-text text-transparent"
                  : "bg-gradient-to-b from-white via-pink-100 to-pink-200 bg-clip-text text-transparent"
              )}
              style={{
                textShadow: isLegendary 
                  ? '0 0 20px rgba(251,191,36,0.6)' 
                  : '0 0 15px rgba(255,255,255,0.5)',
                WebkitTextStroke: '0.5px rgba(255,255,255,0.2)'
              }}
            >
              X{currentCount}
            </motion.span>
          </div>

          {/* Sparkle trail for premium gifts */}
          {isPremium && (
            <div className="absolute -right-4 top-1/2 -translate-y-1/2">
              {[...Array(5)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute w-1.5 h-1.5 rounded-full"
                  style={{
                    background: isLegendary ? '#FFD700' : '#FF69B4',
                    right: 0
                  }}
                  animate={{
                    x: [0, 30 + i * 10],
                    opacity: [1, 0],
                    scale: [1, 0.5]
                  }}
                  transition={{
                    duration: 0.8,
                    delay: i * 0.1,
                    repeat: Infinity,
                    repeatDelay: 0.5
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

// Hook to manage flying gift banner queue
export const useFlyingGiftBanners = () => {
  const [banners, setBanners] = useState<Array<{
    id: string;
    props: Omit<FlyingGiftBannerProps, 'onComplete'>;
  }>>([]);

  const addBanner = (props: Omit<FlyingGiftBannerProps, 'onComplete'>) => {
    const id = `${Date.now()}-${Math.random()}`;
    setBanners(prev => [...prev, { id, props }]);
    return id;
  };

  const removeBanner = (id: string) => {
    setBanners(prev => prev.filter(b => b.id !== id));
  };

  return { banners, addBanner, removeBanner };
};

export default PremiumFlyingGiftBanner;
