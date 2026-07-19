import { useEffect } from "react";
import { motion } from "framer-motion";
import { Heart, Star, Sparkles, Gem, Crown, Rocket, Flame, Zap, Diamond, Gift } from "lucide-react";
import { cn } from "@/lib/utils";

// Re-export from new GiftPanel
export { GiftPanel, allGifts, giftCategories, type GiftItem } from "./GiftPanel";

// Legacy gift type for animations
export interface LegacyGiftItem {
  id: string;
  name: string;
  icon: React.ElementType;
  diamonds: number;
  color: string;
  animation: "float" | "explode" | "rain" | "spiral" | "shake";
  size: "sm" | "md" | "lg" | "xl";
}

export const gifts: LegacyGiftItem[] = [
  { id: "heart", name: "Heart", icon: Heart, diamonds: 10, color: "text-pink-500", animation: "float", size: "sm" },
  { id: "star", name: "Star", icon: Star, diamonds: 50, color: "text-yellow-500", animation: "float", size: "sm" },
  { id: "sparkles", name: "Sparkles", icon: Sparkles, diamonds: 100, color: "text-purple-500", animation: "explode", size: "md" },
  { id: "gem", name: "Gem", icon: Gem, diamonds: 200, color: "text-cyan-500", animation: "spiral", size: "md" },
  { id: "crown", name: "Crown", icon: Crown, diamonds: 500, color: "text-amber-500", animation: "shake", size: "lg" },
  { id: "rocket", name: "Rocket", icon: Rocket, diamonds: 1000, color: "text-blue-500", animation: "float", size: "lg" },
  { id: "flame", name: "Fire", icon: Flame, diamonds: 2000, color: "text-orange-500", animation: "explode", size: "lg" },
  { id: "zap", name: "Lightning", icon: Zap, diamonds: 5000, color: "text-yellow-400", animation: "shake", size: "xl" },
  { id: "diamond", name: "Diamond", icon: Diamond, diamonds: 10000, color: "text-cyan-400", animation: "rain", size: "xl" },
  { id: "gift", name: "Gift Box", icon: Gift, diamonds: 20000, color: "text-pink-400", animation: "explode", size: "xl" },
];

interface GiftAnimationProps {
  gift: LegacyGiftItem;
  senderName: string;
  count?: number;
  onComplete: () => void;
}

const sizeClasses = {
  sm: "w-8 h-8",
  md: "w-12 h-12",
  lg: "w-16 h-16",
  xl: "w-24 h-24",
};

// Floating animation - multiple icons float up
const FloatAnimation = ({ gift, count = 1 }: { gift: LegacyGiftItem; count: number }) => {
  const Icon = gift.icon;
  const items = Array.from({ length: Math.min(count * 3, 15) });

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {items.map((_, i) => (
        <motion.div
          key={i}
          className={cn("absolute", gift.color)}
          initial={{
            x: Math.random() * 100 + 100,
            y: window.innerHeight,
            scale: 0.5 + Math.random() * 0.5,
            rotate: Math.random() * 60 - 30,
          }}
          animate={{
            y: -100,
            x: Math.random() * 200 + 50,
            rotate: Math.random() * 360,
            opacity: [0, 1, 1, 0],
          }}
          transition={{
            duration: 3 + Math.random() * 2,
            delay: i * 0.1,
            ease: "easeOut",
          }}
        >
          <Icon className={sizeClasses[gift.size]} />
        </motion.div>
      ))}
    </div>
  );
};

// Explode animation - burst from center
const ExplodeAnimation = ({ gift, count = 1 }: { gift: LegacyGiftItem; count: number }) => {
  const Icon = gift.icon;
  const items = Array.from({ length: Math.min(count * 5, 20) });

  return (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
      {items.map((_, i) => {
        const angle = (i / items.length) * Math.PI * 2;
        const distance = 150 + Math.random() * 100;
        return (
          <motion.div
            key={i}
            className={cn("absolute", gift.color)}
            initial={{ scale: 0, x: 0, y: 0 }}
            animate={{
              scale: [0, 1.5, 1, 0],
              x: Math.cos(angle) * distance,
              y: Math.sin(angle) * distance,
              rotate: 360,
            }}
            transition={{
              duration: 1.5,
              delay: i * 0.02,
              ease: "easeOut",
            }}
          >
            <Icon className={sizeClasses[gift.size]} />
          </motion.div>
        );
      })}
      {/* Center burst */}
      <motion.div
        className={cn("absolute", gift.color)}
        initial={{ scale: 0 }}
        animate={{ scale: [0, 3, 0] }}
        transition={{ duration: 0.8 }}
      >
        <Icon className="w-24 h-24" />
      </motion.div>
    </div>
  );
};

// Rain animation - icons fall from top
const RainAnimation = ({ gift, count = 1 }: { gift: LegacyGiftItem; count: number }) => {
  const Icon = gift.icon;
  const items = Array.from({ length: Math.min(count * 4, 25) });

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {items.map((_, i) => (
        <motion.div
          key={i}
          className={cn("absolute", gift.color)}
          style={{ left: `${Math.random() * 100}%` }}
          initial={{ y: -50, rotate: 0 }}
          animate={{
            y: window.innerHeight + 50,
            rotate: 360,
            opacity: [0, 1, 1, 0.5],
          }}
          transition={{
            duration: 2.5 + Math.random(),
            delay: i * 0.08,
            ease: "linear",
          }}
        >
          <Icon className={sizeClasses[gift.size]} />
        </motion.div>
      ))}
    </div>
  );
};

// Spiral animation - icons spiral around center
const SpiralAnimation = ({ gift, count = 1 }: { gift: LegacyGiftItem; count: number }) => {
  const Icon = gift.icon;
  const items = Array.from({ length: Math.min(count * 3, 12) });

  return (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
      {items.map((_, i) => (
        <motion.div
          key={i}
          className={cn("absolute", gift.color)}
          initial={{ scale: 0 }}
          animate={{
            scale: [0, 1, 1, 0],
            x: [0, Math.cos(i) * 100, Math.cos(i + 2) * 150, Math.cos(i + 4) * 50],
            y: [0, Math.sin(i) * 100, Math.sin(i + 2) * 150, Math.sin(i + 4) * 50],
            rotate: [0, 180, 360, 540],
          }}
          transition={{
            duration: 2,
            delay: i * 0.1,
            ease: "easeInOut",
          }}
        >
          <Icon className={sizeClasses[gift.size]} />
        </motion.div>
      ))}
    </div>
  );
};

// Shake animation - screen shake with big icon
const ShakeAnimation = ({ gift }: { gift: LegacyGiftItem }) => {
  const Icon = gift.icon;

  return (
    <motion.div
      className="absolute inset-0 pointer-events-none flex items-center justify-center"
      animate={{
        x: [0, -10, 10, -10, 10, 0],
        y: [0, -5, 5, -5, 5, 0],
      }}
      transition={{ duration: 0.5, repeat: 2 }}
    >
      <motion.div
        className={gift.color}
        initial={{ scale: 0, rotate: -30 }}
        animate={{
          scale: [0, 2, 1.5],
          rotate: [0, 15, 0],
        }}
        transition={{ duration: 0.8 }}
      >
        <Icon className="w-32 h-32 drop-shadow-2xl" />
      </motion.div>
      {/* Particles */}
      {Array.from({ length: 8 }).map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-4 h-4 rounded-full bg-gradient-to-r from-yellow-400 to-orange-500"
          initial={{ scale: 0, x: 0, y: 0 }}
          animate={{
            scale: [0, 1, 0],
            x: Math.cos((i / 8) * Math.PI * 2) * 120,
            y: Math.sin((i / 8) * Math.PI * 2) * 120,
          }}
          transition={{ duration: 0.8, delay: 0.2 }}
        />
      ))}
    </motion.div>
  );
};

export const GiftAnimation = ({ gift, senderName, count = 1, onComplete }: GiftAnimationProps) => {
  // =====================================================
  // GIFT DISPLAY POLICY: Static gifts < 1 second (800ms)
  // =====================================================
  useEffect(() => {
    const timer = setTimeout(onComplete, 800); // 800ms for static gifts
    return () => clearTimeout(timer);
  }, [onComplete]);

  const renderAnimation = () => {
    switch (gift.animation) {
      case "float":
        return <FloatAnimation gift={gift} count={count} />;
      case "explode":
        return <ExplodeAnimation gift={gift} count={count} />;
      case "rain":
        return <RainAnimation gift={gift} count={count} />;
      case "spiral":
        return <SpiralAnimation gift={gift} count={count} />;
      case "shake":
        return <ShakeAnimation gift={gift} />;
      default:
        return <FloatAnimation gift={gift} count={count} />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      {renderAnimation()}
      
      {/* Gift notification banner */}
      <motion.div
        className="absolute top-1/4 left-1/2 -translate-x-1/2"
        initial={{ opacity: 0, y: -50, scale: 0.8 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -50, scale: 0.8 }}
        transition={{ type: "spring", damping: 15 }}
      >
        <div className="bg-gradient-to-r from-pink-500/90 via-purple-500/90 to-indigo-500/90 backdrop-blur-lg rounded-2xl px-6 py-4 flex items-center gap-4 shadow-2xl border border-white/20">
          <div className={cn("p-3 rounded-xl bg-white/20", gift.color)}>
            <gift.icon className="w-8 h-8" />
          </div>
          <div className="text-white">
            <p className="font-bold text-lg">{senderName}</p>
            <p className="text-white/80 text-sm">
              {count > 1 ? `${count}x ` : ""}{gift.name} sent!
            </p>
          </div>
          <div className="text-amber-300 font-bold text-lg">
            💎 {gift.diamonds * count}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default GiftAnimation;
