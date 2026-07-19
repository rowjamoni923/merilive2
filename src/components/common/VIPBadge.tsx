import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Crown, Gem, Star, Sparkles, Shield, Zap } from "lucide-react";

interface VIPBadgeProps {
  tier: number;
  size?: "xs" | "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
  animated?: boolean;
}

// VIP tier configurations matching premium app aesthetics
const getVIPConfig = (tier: number) => {
  switch (tier) {
    case 6:
      return {
        gradient: "from-purple-600 via-pink-500 to-fuchsia-600",
        glow: "shadow-[0_0_20px_rgba(168,85,247,0.7)]",
        icon: Crown,
        label: "VIP 6",
        borderGradient: "from-purple-400 via-pink-400 to-fuchsia-400",
        textColor: "text-purple-100",
        pulseColor: "rgba(168,85,247,0.5)",
      };
    case 5:
      return {
        gradient: "from-rose-500 via-pink-500 to-rose-600",
        glow: "shadow-[0_0_16px_rgba(244,114,182,0.6)]",
        icon: Gem,
        label: "VIP 5",
        borderGradient: "from-rose-300 via-pink-300 to-rose-400",
        textColor: "text-rose-100",
        pulseColor: "rgba(244,114,182,0.5)",
      };
    case 4:
      return {
        gradient: "from-cyan-400 via-blue-500 to-cyan-500",
        glow: "shadow-[0_0_14px_rgba(34,211,238,0.6)]",
        icon: Gem,
        label: "VIP 4",
        borderGradient: "from-cyan-300 via-blue-300 to-cyan-400",
        textColor: "text-cyan-100",
        pulseColor: "rgba(34,211,238,0.4)",
      };
    case 3:
      return {
        gradient: "from-gray-300 via-gray-200 to-gray-400",
        glow: "shadow-[0_0_12px_rgba(229,231,235,0.5)]",
        icon: Star,
        label: "VIP 3",
        borderGradient: "from-gray-200 via-white to-gray-300",
        textColor: "text-gray-800",
        pulseColor: "rgba(229,231,235,0.4)",
      };
    case 2:
      return {
        gradient: "from-amber-400 via-yellow-400 to-amber-500",
        glow: "shadow-[0_0_10px_rgba(251,191,36,0.5)]",
        icon: Sparkles,
        label: "VIP 2",
        borderGradient: "from-amber-300 via-yellow-300 to-amber-400",
        textColor: "text-amber-900",
        pulseColor: "rgba(251,191,36,0.4)",
      };
    case 1:
      return {
        gradient: "from-slate-400 via-gray-400 to-slate-500",
        glow: "shadow-[0_0_8px_rgba(148,163,184,0.4)]",
        icon: Shield,
        label: "VIP 1",
        borderGradient: "from-slate-300 via-gray-300 to-slate-400",
        textColor: "text-slate-100",
        pulseColor: "rgba(148,163,184,0.3)",
      };
    default:
      return null;
  }
};

export const VIPBadge = ({ 
  tier, 
  size = "md", 
  showLabel = true, 
  className,
  animated = true 
}: VIPBadgeProps) => {
  const config = getVIPConfig(tier);
  
  if (!config) return null;

  const IconComponent = config.icon;

  const sizeClasses = {
    xs: { container: "h-4 px-1.5 gap-0.5 rounded", icon: "w-2.5 h-2.5", text: "text-[8px]" },
    sm: { container: "h-5 px-2 gap-1 rounded-md", icon: "w-3 h-3", text: "text-[10px]" },
    md: { container: "h-6 px-2.5 gap-1 rounded-lg", icon: "w-3.5 h-3.5", text: "text-xs" },
    lg: { container: "h-8 px-3 gap-1.5 rounded-xl", icon: "w-4 h-4", text: "text-sm" },
  };

  const sizeConfig = sizeClasses[size];

  const badge = (
    <div
      className={cn(
        "inline-flex items-center font-bold border border-white/20",
        `bg-gradient-to-r ${config.gradient}`,
        config.glow,
        sizeConfig.container,
        className
      )}
    >
      <IconComponent className={cn(sizeConfig.icon, config.textColor, "drop-shadow-sm")} />
      {showLabel && (
        <span className={cn(sizeConfig.text, config.textColor, "font-black drop-shadow-sm whitespace-nowrap")}>
          {config.label}
        </span>
      )}
    </div>
  );

  if (animated && tier >= 3) {
    return (
      <motion.div
        animate={{
          scale: [1, 1.05, 1],
          boxShadow: [
            `0 0 8px ${config.pulseColor}`,
            `0 0 16px ${config.pulseColor}`,
            `0 0 8px ${config.pulseColor}`,
          ],
        }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        className="inline-flex"
      >
        {badge}
      </motion.div>
    );
  }

  return badge;
};

// Floating VIP Icon (for compact display)
export const FloatingVIPIcon = ({ 
  tier, 
  size = "sm",
  className 
}: { 
  tier: number; 
  size?: "xs" | "sm" | "md"; 
  className?: string;
}) => {
  const config = getVIPConfig(tier);
  
  if (!config) return null;

  const IconComponent = config.icon;

  const sizeStyles = {
    xs: { container: "w-5 h-5", icon: "w-2.5 h-2.5" },
    sm: { container: "w-6 h-6", icon: "w-3 h-3" },
    md: { container: "w-8 h-8", icon: "w-4 h-4" },
  };

  const sizeConfig = sizeStyles[size];

  return (
    <motion.div
      animate={{
        scale: [1, 1.1, 1],
      }}
      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      className={cn(
        "relative rounded-full flex items-center justify-center",
        `bg-gradient-to-br ${config.gradient}`,
        config.glow,
        sizeConfig.container,
        className
      )}
    >
      <IconComponent 
        className={cn(sizeConfig.icon, "text-white drop-shadow-sm")} 
        fill="currentColor"
      />
    </motion.div>
  );
};

export default VIPBadge;
