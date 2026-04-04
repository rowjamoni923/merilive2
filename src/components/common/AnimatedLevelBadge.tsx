import { Star, Crown, Gem, Trophy, Sparkles, Heart, Flower2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface AnimatedLevelBadgeProps {
  level: number;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  showLabel?: boolean;
  showXP?: boolean;
  xp?: number;
  className?: string;
  isHost?: boolean;
}

// Host level styles (female hosts - pink/rose theme with flower icons)
const getHostLevelStyle = (level: number) => {
  if (level >= 8) return { 
    icon: Crown, 
    emoji: "👸",
    gradient: "from-amber-400 via-yellow-500 to-amber-600",
    glow: "shadow-amber-500/50",
    iconBg: "from-amber-500 to-yellow-600",
    color: "text-amber-400",
    name: "Legend"
  };
  if (level >= 7) return { 
    icon: Crown, 
    emoji: "👸",
    gradient: "from-violet-500 via-purple-600 to-violet-700",
    glow: "shadow-violet-500/50",
    iconBg: "from-violet-500 to-purple-600",
    color: "text-violet-400",
    name: "Goddess"
  };
  if (level >= 6) return { 
    icon: Crown, 
    emoji: "👑",
    gradient: "from-purple-500 via-purple-600 to-purple-700",
    glow: "shadow-purple-500/50",
    iconBg: "from-purple-500 to-purple-600",
    color: "text-purple-400",
    name: "Queen"
  };
  if (level >= 5) return { 
    icon: Heart, 
    emoji: "💜",
    gradient: "from-rose-500 via-purple-500 to-rose-600",
    glow: "shadow-rose-500/50",
    iconBg: "from-rose-500 to-purple-500",
    color: "text-rose-400",
    name: "Super Star"
  };
  if (level >= 4) return { 
    icon: Flower2, 
    emoji: "💐",
    gradient: "from-rose-500 via-rose-600 to-rose-700",
    glow: "shadow-rose-500/50",
    iconBg: "from-rose-500 to-rose-600",
    color: "text-rose-400",
    name: "Star"
  };
  if (level >= 3) return { 
    icon: Flower2, 
    emoji: "🌹",
    gradient: "from-pink-500 via-rose-500 to-pink-600",
    glow: "shadow-pink-500/50",
    iconBg: "from-pink-500 to-rose-500",
    color: "text-pink-400",
    name: "Famous"
  };
  if (level >= 2) return { 
    icon: Flower2, 
    emoji: "🌺",
    gradient: "from-rose-400 via-pink-500 to-rose-500",
    glow: "shadow-rose-400/50",
    iconBg: "from-rose-400 to-pink-500",
    color: "text-rose-400",
    name: "Popular"
  };
  if (level >= 1) return { 
    icon: Flower2, 
    emoji: "🌷",
    gradient: "from-pink-400 via-rose-400 to-pink-500",
    glow: "shadow-pink-400/50",
    iconBg: "from-pink-400 to-rose-400",
    color: "text-pink-400",
    name: "Rising Star"
  };
  return { 
    icon: Flower2, 
    emoji: "🌸",
    gradient: "from-pink-200 via-pink-300 to-pink-400",
    glow: "shadow-pink-300/50",
    iconBg: "from-pink-200 to-pink-300",
    color: "text-pink-300",
    name: "New Host"
  };
};

// User level styles (blue/diamond theme)
const getUserLevelStyle = (level: number) => {
  if (level >= 50) return { 
    icon: Trophy, 
    emoji: "💎",
    gradient: "from-red-400 via-rose-500 to-red-600",
    glow: "shadow-red-500/50",
    iconBg: "from-red-500 to-rose-600",
    color: "text-red-400",
    name: "Divine"
  };
  if (level >= 40) return { 
    icon: Crown, 
    emoji: "💎",
    gradient: "from-orange-400 via-amber-500 to-orange-600",
    glow: "shadow-orange-500/50",
    iconBg: "from-orange-500 to-amber-600",
    color: "text-orange-400",
    name: "Immortal"
  };
  if (level >= 30) return { 
    icon: Crown, 
    emoji: "💎",
    gradient: "from-amber-400 via-yellow-500 to-amber-600",
    glow: "shadow-amber-500/50",
    iconBg: "from-amber-500 to-yellow-600",
    color: "text-amber-400",
    name: "Legend"
  };
  if (level >= 20) return { 
    icon: Crown, 
    emoji: "💎",
    gradient: "from-amber-300 via-yellow-400 to-amber-500",
    glow: "shadow-yellow-500/50",
    iconBg: "from-yellow-500 to-amber-500",
    color: "text-yellow-400",
    name: "Master"
  };
  if (level >= 10) return { 
    icon: Crown, 
    emoji: "💎",
    gradient: "from-amber-400 via-yellow-500 to-orange-500",
    glow: "shadow-amber-500/50",
    iconBg: "from-amber-400 to-orange-500",
    color: "text-amber-400",
    name: "King"
  };
  if (level >= 6) return { 
    icon: Star, 
    emoji: "💎",
    gradient: "from-purple-400 via-purple-500 to-purple-600",
    glow: "shadow-purple-500/50",
    iconBg: "from-purple-500 to-purple-600",
    color: "text-purple-400",
    name: "Elite"
  };
  if (level >= 5) return { 
    icon: Gem, 
    emoji: "💎",
    gradient: "from-indigo-500 via-purple-500 to-indigo-600",
    glow: "shadow-indigo-500/50",
    iconBg: "from-indigo-500 to-purple-500",
    color: "text-indigo-400",
    name: "Diamond"
  };
  if (level >= 4) return { 
    icon: Gem, 
    emoji: "💎",
    gradient: "from-indigo-400 via-indigo-500 to-indigo-600",
    glow: "shadow-indigo-500/50",
    iconBg: "from-indigo-400 to-indigo-500",
    color: "text-indigo-400",
    name: "Platinum"
  };
  if (level >= 3) return { 
    icon: Gem, 
    emoji: "💎",
    gradient: "from-blue-500 via-blue-600 to-indigo-600",
    glow: "shadow-blue-500/50",
    iconBg: "from-blue-500 to-indigo-600",
    color: "text-blue-400",
    name: "Gold"
  };
  if (level >= 2) return { 
    icon: Gem, 
    emoji: "💎",
    gradient: "from-blue-400 via-blue-500 to-blue-600",
    glow: "shadow-blue-500/50",
    iconBg: "from-blue-400 to-blue-500",
    color: "text-blue-400",
    name: "Silver"
  };
  if (level >= 1) return { 
    icon: Gem, 
    emoji: "💎",
    gradient: "from-blue-300 via-blue-400 to-blue-500",
    glow: "shadow-blue-400/50",
    iconBg: "from-blue-400 to-blue-500",
    color: "text-blue-400",
    name: "Bronze"
  };
  return { 
    icon: Sparkles, 
    emoji: "🤍",
    gradient: "from-gray-300 via-gray-400 to-gray-500",
    glow: "shadow-gray-400/50",
    iconBg: "from-gray-400 to-gray-500",
    color: "text-gray-400",
    name: "Beginner"
  };
};

// Combined function that selects based on isHost
const getLevelStyle = (level: number, isHost: boolean = false) => {
  return isHost ? getHostLevelStyle(level) : getUserLevelStyle(level);
};

const sizeConfig = {
  xs: {
    container: "w-6 h-6",
    icon: "w-3 h-3",
    ring: "ring-1",
  },
  sm: {
    container: "w-8 h-8",
    icon: "w-4 h-4",
    ring: "ring-2",
  },
  md: {
    container: "w-10 h-10",
    icon: "w-5 h-5",
    ring: "ring-2",
  },
  lg: {
    container: "w-12 h-12",
    icon: "w-6 h-6",
    ring: "ring-2",
  },
  xl: {
    container: "w-16 h-16",
    icon: "w-8 h-8",
    ring: "ring-4",
  },
};

export const AnimatedLevelBadge = ({ 
  level, 
  size = "md", 
  showLabel = false,
  showXP = false,
  xp = 0,
  className,
  isHost = false
}: AnimatedLevelBadgeProps) => {
  const style = getLevelStyle(level, isHost);
  const IconComponent = style.icon;
  const config = sizeConfig[size];

  return (
    <div className={cn("relative inline-flex flex-col items-center", className)}>
      {/* Badge Container - Using CSS animations for performance */}
      <div className="relative">
        {/* Outer Glow - CSS pulse */}
        <div
          className={cn(
            "absolute inset-0 rounded-full bg-gradient-to-br opacity-40 blur-md animate-pulse",
            style.gradient
          )}
          style={{ willChange: "opacity" }}
        />

        {/* Main Badge */}
        <div
          className={cn(
            "relative rounded-full bg-gradient-to-br flex items-center justify-center shadow-xl transition-transform hover:scale-110",
            config.container,
            config.ring,
            "ring-white/30",
            style.gradient,
            style.glow
          )}
        >
          {/* Inner Glow */}
          <div className="absolute inset-1 rounded-full bg-gradient-to-br from-white/30 to-transparent" />
          
          {/* Icon */}
          <IconComponent 
            className={cn(config.icon, "text-white drop-shadow-lg relative z-10")} 
            fill="currentColor"
          />
        </div>
      </div>

      {/* Label */}
      {showLabel && (
        <div className="mt-2 text-center">
          <span className={cn("font-bold text-sm", style.color)}>
            Level {level}
          </span>
          {showXP && (
            <p className="text-xs text-white/60">{xp.toLocaleString()} XP</p>
          )}
        </div>
      )}
    </div>
  );
};

// Compact floating level icon for inline use - Performance optimized
export const FloatingLevelIcon = ({ 
  level, 
  size = "sm",
  className,
  isHost = false
}: { 
  level: number; 
  size?: "xs" | "sm" | "md"; 
  className?: string;
  isHost?: boolean;
}) => {
  const style = getLevelStyle(level, isHost);
  const IconComponent = style.icon;

  const sizeStyles = {
    xs: { container: "w-5 h-5", icon: "w-2.5 h-2.5" },
    sm: { container: "w-6 h-6", icon: "w-3 h-3" },
    md: { container: "w-8 h-8", icon: "w-4 h-4" },
  };

  const config = sizeStyles[size];

  return (
    <div
      className={cn(
        "relative rounded-full bg-gradient-to-br flex items-center justify-center shadow-lg",
        config.container,
        style.gradient,
        style.glow,
        className
      )}
    >
      <IconComponent 
        className={cn(config.icon, "text-white drop-shadow-sm")} 
        fill="currentColor"
      />
    </div>
  );
};

export default AnimatedLevelBadge;
