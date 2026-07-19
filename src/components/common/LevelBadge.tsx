import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useGlobalSettings } from "@/hooks/useGlobalSettings";
import { getProxiedUrl } from "@/utils/r2ProxyUrl";

interface LevelBadgeProps {
  level: number;
  size?: "xs" | "sm" | "md" | "lg";
  showIcon?: boolean;
  className?: string;
  animated?: boolean;
  useDbIcons?: boolean;
}

// ============================================
// LUXURIOUS 3D LEVEL BADGE SYSTEM (0-10)
// Each level has a UNIQUE premium design
// ============================================

const getLevelConfig = (level: number) => {
  // Level 10+ (Legend tier)
  if (level >= 60) {
    return {
      gradient: "from-rose-500 via-red-500 to-rose-600",
      glow: "shadow-[0_0_14px_rgba(244,63,94,0.7),0_2px_8px_rgba(0,0,0,0.4)]",
      icon: "💎",
      textGradient: "from-rose-100 via-white to-rose-200",
      border: "border-rose-300/60",
      shimmer: true,
      innerGlow: "inset 0 1px 2px rgba(255,255,255,0.4), inset 0 -1px 2px rgba(0,0,0,0.2)",
    };
  }
  if (level >= 50) {
    return {
    };
  }
  if (level >= 40) {
    return {
    };
  }
  if (level >= 30) {
    return {
    };
  }
  if (level >= 20) {
    return {
    };
  }
  if (level >= 15) {
    return {
    };
  }
  // Audit-fix (Label #10): levels 11-14 previously fell through to Level-0
  // gray default. Give them a distinct teal/cyan-ish tier between Level-10
  // (gold trophy) and Level-15+ (cyan diamond) so the badge actually
  // reflects the user's rank everywhere it renders.
  if (level >= 11) {
    return {
    };
  }

  // ====== UNIQUE PER-LEVEL DESIGNS (0-10) ======
  if (level === 10) {
    return {
    };
  }
  if (level === 9) {
    return {
    };
  }
  if (level === 8) {
    return {
    };
  }
  if (level === 7) {
    return {
    };
  }
  if (level === 6) {
    return {
    };
  }
  if (level === 5) {
    return {
    };
  }
  if (level === 4) {
    return {
    };
  }
  if (level === 3) {
    return {
    };
  }
  if (level === 2) {
    return {
    };
  }
  if (level === 1) {
    return {
    };
  }

  // Level 0 / default
  return {
  };
};

export const LevelBadge = forwardRef<HTMLSpanElement | HTMLDivElement, LevelBadgeProps>(({ 
  level, 
  size = "md", 
  showIcon = false, 
  className,
  animated = false,
  useDbIcons = true
}: LevelBadgeProps, ref) => {
  const { settings } = useGlobalSettings();
  const config = getLevelConfig(level);
  
  const dbTier = useDbIcons && settings?.userLevelTiers?.find(
    tier => tier.level_number === level
  );
  const dbIconUrl = dbTier?.icon_url;
  const dbIcon = dbTier?.level_icon;

  const sizeClasses = {
    xs: "h-4 px-1.5 text-[9px] rounded-[4px] gap-0.5",
    sm: "h-5 px-2 text-[10px] rounded-[5px] gap-0.5",
    md: "h-6 px-2.5 text-xs rounded-md gap-1",
    lg: "h-8 px-3 text-sm rounded-lg gap-1.5"
  };

  const iconSizes = {
  };
  
  const imageSizes = {
  };

  const badgeContent = (
    <>
      {/* Shimmer overlay for premium levels */}
      {config.shimmer && (
        <span 
          className="absolute inset-0 rounded-[inherit] overflow-hidden pointer-events-none"
          style={{
            background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.25) 45%, rgba(255,255,255,0.4) 50%, rgba(255,255,255,0.25) 55%, transparent 60%)',
            backgroundSize: '200% 100%',
            animation: 'level-shimmer 2.5s ease-in-out infinite',
          }}
        />
      )}
      {showIcon && (
        dbIconUrl ? (
          <img loading="lazy" decoding="async" 
            src={getProxiedUrl(dbIconUrl)} 
            alt={`Level ${level}`}
            className={cn(imageSizes[size], "object-contain relative z-[1]")}
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              e.currentTarget.nextElementSibling?.classList.remove('hidden');
            }}
          />
        ) : (
          <span className={cn(iconSizes[size], "relative z-[1]")}>{dbIcon || config.icon}</span>
        )
      )}
      {showIcon && dbIconUrl && (
        <span className={cn(iconSizes[size], "hidden relative z-[1]")}>{dbIcon || config.icon}</span>
      )}
      <span className={cn(
        `bg-gradient-to-b ${config.textGradient} bg-clip-text text-transparent font-black relative z-[1]`,
        "drop-shadow-[0_1px_1px_rgba(0,0,0,0.3)]"
      )}>
        Lv{level}
      </span>
    </>
  );

  const baseStyle: React.CSSProperties = {
    boxShadow: config.innerGlow,
    transform: 'translateZ(0)', // GPU acceleration
  };

  if (animated && level >= 9) {
    return (
      <motion.div
        ref={ref as React.Ref<HTMLDivElement>}
        className={cn(
          "inline-flex items-center font-bold border relative overflow-hidden",
          `bg-gradient-to-r ${config.gradient}`,
          config.glow,
          config.border,
          sizeClasses[size],
          className
        )}
        style={baseStyle}
        animate={{
          scale: [1, 1.06, 1],
        }}
        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
      >
        {badgeContent}
      </motion.div>
    );
  }

  return (
    <span
      ref={ref as React.Ref<HTMLSpanElement>}
      className={cn(
        "inline-flex items-center font-bold border relative overflow-hidden",
        `bg-gradient-to-r ${config.gradient}`,
        config.glow,
        config.border,
        sizeClasses[size],
        className
      )}
      style={baseStyle}
    >
      {badgeContent}
    </span>
  );
});

LevelBadge.displayName = "LevelBadge";

// ============================================
// VERIFICATION BADGE
// ============================================

interface VerificationBadgeProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export const VerificationBadge = ({ size = "md", className }: VerificationBadgeProps) => {
  const sizeClasses = { sm: "w-4 h-4", md: "w-5 h-5", lg: "w-6 h-6" };
  const iconSizes = { sm: "w-2 h-2", md: "w-2.5 h-2.5", lg: "w-3 h-3" };

  return (
    <div className={cn("rounded-full bg-blue-500 flex items-center justify-center", sizeClasses[size], className)}>
      <svg className={cn("text-white", iconSizes[size])} fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
      </svg>
    </div>
  );
};

// ============================================
// LEVEL FRAME (Avatar wrapper)
// ============================================

interface LevelFrameProps {
  level: number;
  children: React.ReactNode;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  showGlow?: boolean;
}

export const LevelFrame = ({ level, children, size = "md", className, showGlow = true }: LevelFrameProps) => {
  const getFrameConfig = () => {
    if (level >= 50) return { gradient: "from-amber-300 via-yellow-400 to-amber-500", glow: "shadow-[0_0_20px_rgba(251,191,36,0.5)]", ring: "ring-amber-400/60" };
    if (level >= 40) return { gradient: "from-orange-400 via-red-400 to-orange-500", glow: "shadow-[0_0_16px_rgba(249,115,22,0.4)]", ring: "ring-orange-400/50" };
    if (level >= 30) return { gradient: "from-fuchsia-400 via-purple-500 to-pink-400", glow: "shadow-[0_0_14px_rgba(192,38,211,0.4)]", ring: "ring-purple-400/50" };
    if (level >= 20) return { gradient: "from-violet-400 via-purple-400 to-violet-500", glow: "shadow-[0_0_12px_rgba(139,92,246,0.3)]", ring: "ring-violet-400/40" };
    if (level >= 10) return { gradient: "from-amber-400 via-yellow-400 to-orange-400", glow: "shadow-[0_0_10px_rgba(245,158,11,0.4)]", ring: "ring-amber-400/40" };
    if (level >= 5) return { gradient: "from-emerald-400 via-green-400 to-emerald-500", glow: "", ring: "ring-emerald-400/30" };
    return { gradient: "from-gray-300 via-gray-400 to-gray-500", glow: "", ring: "ring-gray-300/30" };
  };

  const config = getFrameConfig();
  const sizeClasses = { xs: "p-[2px]", sm: "p-[2px]", md: "p-[3px]", lg: "p-1", xl: "p-1.5" };
  const ringClasses = { xs: "ring-1", sm: "ring-1", md: "ring-2", lg: "ring-2", xl: "ring-[3px]" };

  return (
    <div className={cn("rounded-full bg-gradient-to-br ring", config.gradient, config.ring, showGlow && config.glow, sizeClasses[size], ringClasses[size], className)}>
      {children}
    </div>
  );
};

// ============================================
// HOST BADGE
// ============================================

interface HostBadgeProps {
  hostLevel?: number;
  isVerified?: boolean;
  className?: string;
}

export const HostBadge = ({ hostLevel = 1, isVerified = false, className }: HostBadgeProps) => {
  const getHostBadgeStyle = () => {
    if (hostLevel >= 10) return { color: "bg-gradient-to-r from-amber-400 to-yellow-500", label: "Diamond Host" };
    if (hostLevel >= 7) return { color: "bg-gradient-to-r from-purple-400 to-pink-500", label: "Platinum Host" };
    if (hostLevel >= 4) return { color: "bg-gradient-to-r from-blue-400 to-cyan-500", label: "Gold Host" };
    return { color: "bg-gradient-to-r from-green-400 to-emerald-500", label: "Host" };
  };

  const style = getHostBadgeStyle();

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <span className={cn("px-2 py-0.5 rounded-full text-white text-xs font-medium shadow-md", style.color)}>
        {style.label}
      </span>
      {isVerified && <VerificationBadge size="sm" />}
    </div>
  );
};

// ============================================
// INLINE LEVEL BADGE (for chat/messages)
// ============================================

interface InlineLevelBadgeProps {
  level: number;
  className?: string;
}

export const InlineLevelBadge = ({ level, className }: InlineLevelBadgeProps) => {
  const { settings } = useGlobalSettings();
  const config = getLevelConfig(level);
  
  const dbTier = settings?.userLevelTiers?.find(tier => tier.level_number === level);
  const dbIconUrl = dbTier?.icon_url;
  const dbIcon = dbTier?.level_icon;
  
  return (
    <span 
      className={cn(
        "inline-flex items-center h-4 px-1.5 rounded text-[9px] font-bold border relative overflow-hidden",
        `bg-gradient-to-r ${config.gradient}`,
        config.border,
        className
      )}
      style={{ boxShadow: config.innerGlow }}
    >
      {config.shimmer && (
        <span 
          className="absolute inset-0 rounded-[inherit] overflow-hidden pointer-events-none"
          style={{
            background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.2) 45%, rgba(255,255,255,0.35) 50%, rgba(255,255,255,0.2) 55%, transparent 60%)',
            backgroundSize: '200% 100%',
            animation: 'level-shimmer 2.5s ease-in-out infinite',
          }}
        />
      )}
      {dbIconUrl ? (
        <img loading="lazy" decoding="async" 
          src={getProxiedUrl(dbIconUrl)} 
          alt={`Lv${level}`}
          className="w-3 h-3 object-contain mr-0.5 relative z-[1]"
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
      ) : dbIcon ? (
        <span className="mr-0.5 text-[8px] relative z-[1]">{dbIcon}</span>
      ) : null}
      <span className={cn(
        `bg-gradient-to-b ${config.textGradient} bg-clip-text text-transparent relative z-[1]`,
        "drop-shadow-[0_1px_1px_rgba(0,0,0,0.2)]"
      )}>
        Lv{level}
      </span>
    </span>
  );
};

export default LevelBadge;
