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
      };
    case 4:
      return {
      };
    case 3:
      return {
      };
    case 2:
      return {
      };
    case 1:
      return {
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
