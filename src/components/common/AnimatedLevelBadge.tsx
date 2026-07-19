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
  };
  if (level >= 6) return { 
  };
  if (level >= 5) return { 
  };
  if (level >= 4) return { 
  };
  if (level >= 3) return { 
  };
  if (level >= 2) return { 
  };
  if (level >= 1) return { 
  };
  return { 
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
  };
  if (level >= 30) return { 
  };
  if (level >= 20) return { 
  };
  if (level >= 10) return { 
  };
  if (level >= 6) return { 
  };
  if (level >= 5) return { 
  };
  if (level >= 4) return { 
  };
  if (level >= 3) return { 
  };
  if (level >= 2) return { 
  };
  if (level >= 1) return { 
  };
  return { 
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
  },
  md: {
  },
  lg: {
  },
  xl: {
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
