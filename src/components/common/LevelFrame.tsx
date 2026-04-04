import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface LevelFrameProps {
  level: number;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
  children: React.ReactNode;
  className?: string;
  showAnimation?: boolean;
  showGlow?: boolean;
}

// Ultra-luxurious frame configurations inspired by top live streaming apps like Bigo, Chamet, Tango
const frameConfigs: Record<number, {
  colors: string[];
  borderWidth: number;
  glowColor: string;
  glowIntensity: number;
  animationType: "none" | "pulse" | "rotate" | "glow" | "shimmer" | "fire" | "rainbow" | "diamond" | "royal" | "cosmic";
  particleCount: number;
  particleType: "sparkle" | "star" | "diamond" | "heart" | "flame";
  crownIcon: string | null;
  frameStyle: "basic" | "metallic" | "neon" | "crystal" | "royal" | "legendary" | "mythic";
  premium: boolean;
}> = {
  // Level 0-4: Basic frames
  0: {
    colors: ["#6b7280", "#4b5563"],
    borderWidth: 2,
    glowColor: "rgba(107, 114, 128, 0.3)",
    glowIntensity: 0.3,
    animationType: "none",
    particleCount: 0,
    particleType: "sparkle",
    crownIcon: null,
    frameStyle: "basic",
    premium: false,
  },
  1: {
    colors: ["#60a5fa", "#3b82f6", "#2563eb"],
    borderWidth: 2,
    glowColor: "rgba(59, 130, 246, 0.4)",
    glowIntensity: 0.4,
    animationType: "pulse",
    particleCount: 0,
    particleType: "sparkle",
    crownIcon: null,
    frameStyle: "basic",
    premium: false,
  },
  2: {
    colors: ["#4ade80", "#22c55e", "#16a34a"],
    borderWidth: 2,
    glowColor: "rgba(34, 197, 94, 0.5)",
    glowIntensity: 0.5,
    animationType: "glow",
    particleCount: 2,
    particleType: "sparkle",
    crownIcon: null,
    frameStyle: "basic",
    premium: false,
  },
  3: {
    colors: ["#a78bfa", "#8b5cf6", "#7c3aed"],
    borderWidth: 3,
    glowColor: "rgba(139, 92, 246, 0.5)",
    glowIntensity: 0.5,
    animationType: "shimmer",
    particleCount: 3,
    particleType: "star",
    crownIcon: null,
    frameStyle: "metallic",
    premium: false,
  },
  4: {
    colors: ["#f472b6", "#ec4899", "#db2777"],
    borderWidth: 3,
    glowColor: "rgba(236, 72, 153, 0.6)",
    glowIntensity: 0.6,
    animationType: "shimmer",
    particleCount: 4,
    particleType: "heart",
    crownIcon: null,
    frameStyle: "metallic",
    premium: false,
  },
  // Level 5-9: Premium frames
  5: {
    colors: ["#fcd34d", "#fbbf24", "#f59e0b", "#d97706"],
    borderWidth: 3,
    glowColor: "rgba(251, 191, 36, 0.7)",
    glowIntensity: 0.7,
    animationType: "glow",
    particleCount: 5,
    particleType: "star",
    crownIcon: null,
    frameStyle: "neon",
    premium: true,
  },
  6: {
    colors: ["#fb923c", "#f97316", "#ea580c", "#c2410c"],
    borderWidth: 4,
    glowColor: "rgba(249, 115, 22, 0.7)",
    glowIntensity: 0.7,
    animationType: "fire",
    particleCount: 6,
    particleType: "flame",
    crownIcon: "🔥",
    frameStyle: "neon",
    premium: true,
  },
  7: {
    colors: ["#f87171", "#ef4444", "#dc2626", "#b91c1c"],
    borderWidth: 4,
    glowColor: "rgba(239, 68, 68, 0.8)",
    glowIntensity: 0.8,
    animationType: "fire",
    particleCount: 8,
    particleType: "flame",
    crownIcon: "🔥",
    frameStyle: "crystal",
    premium: true,
  },
  8: {
    colors: ["#c084fc", "#a855f7", "#9333ea", "#7c3aed", "#ec4899"],
    borderWidth: 4,
    glowColor: "rgba(168, 85, 247, 0.8)",
    glowIntensity: 0.8,
    animationType: "rainbow",
    particleCount: 10,
    particleType: "diamond",
    crownIcon: "💎",
    frameStyle: "crystal",
    premium: true,
  },
  9: {
    colors: ["#fef3c7", "#fcd34d", "#fbbf24", "#f59e0b", "#ef4444", "#ec4899"],
    borderWidth: 5,
    glowColor: "rgba(252, 211, 77, 0.9)",
    glowIntensity: 0.9,
    animationType: "rainbow",
    particleCount: 12,
    particleType: "star",
    crownIcon: "⭐",
    frameStyle: "royal",
    premium: true,
  },
  // Level 10+: Legendary/Mythic frames
  10: {
    colors: ["#fffbeb", "#fef3c7", "#fcd34d", "#fbbf24", "#f59e0b", "#ef4444", "#ec4899", "#a855f7", "#6366f1"],
    borderWidth: 5,
    glowColor: "rgba(254, 243, 199, 1)",
    glowIntensity: 1,
    animationType: "cosmic",
    particleCount: 16,
    particleType: "star",
    crownIcon: "👑",
    frameStyle: "legendary",
    premium: true,
  },
  11: {
    colors: ["#ffffff", "#fef3c7", "#fcd34d", "#f59e0b", "#ef4444", "#f472b6", "#c084fc", "#818cf8", "#38bdf8"],
    borderWidth: 6,
    glowColor: "rgba(255, 255, 255, 1)",
    glowIntensity: 1,
    animationType: "cosmic",
    particleCount: 20,
    particleType: "diamond",
    crownIcon: "👑",
    frameStyle: "mythic",
    premium: true,
  },
};

const sizeClasses = {
  xs: "w-6 h-6",
  sm: "w-10 h-10",
  md: "w-14 h-14",
  lg: "w-20 h-20",
  xl: "w-28 h-28",
  "2xl": "w-36 h-36",
};

const frameSizes = {
  xs: "-inset-0.5",
  sm: "-inset-1",
  md: "-inset-1.5",
  lg: "-inset-2",
  xl: "-inset-2.5",
  "2xl": "-inset-3",
};

const particleSizes = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 22,
  xl: 28,
  "2xl": 34,
};

const getFrameConfig = (level: number) => {
  if (level >= 60) return { ...frameConfigs[11], level: 11 };
  if (level >= 50) return { ...frameConfigs[10], level: 10 };
  if (level >= 40) return { ...frameConfigs[9], level: 9 };
  if (level >= 30) return { ...frameConfigs[8], level: 8 };
  if (level >= 25) return { ...frameConfigs[7], level: 7 };
  if (level >= 20) return { ...frameConfigs[6], level: 6 };
  if (level >= 15) return { ...frameConfigs[5], level: 5 };
  if (level >= 10) return { ...frameConfigs[4], level: 4 };
  if (level >= 7) return { ...frameConfigs[3], level: 3 };
  if (level >= 4) return { ...frameConfigs[2], level: 2 };
  if (level >= 1) return { ...frameConfigs[1], level: 1 };
  return { ...frameConfigs[0], level: 0 };
};

const LevelFrame = ({ 
  level, 
  size = "md", 
  children, 
  className,
  showAnimation = true,
  showGlow = true,
}: LevelFrameProps) => {
  const config = getFrameConfig(level);
  const gradientColors = config.colors.join(", ");
  const particleRadius = particleSizes[size];
  
  // Generate particles for premium frames
  const particles = Array.from({ length: config.particleCount }, (_, i) => ({
    id: i,
    delay: (i / config.particleCount) * 3,
    angle: (i / config.particleCount) * 360,
  }));

  const getParticleEmoji = () => {
    switch (config.particleType) {
      case "star": return "✨";
      case "diamond": return "💎";
      case "heart": return "💖";
      case "flame": return "🔥";
      default: return "✦";
    }
  };

  return (
    <div className={cn("relative", sizeClasses[size], className)}>
      {/* Outer Glow Effect - Multiple Layers for Depth */}
      {showGlow && config.premium && (
        <>
          {/* Deep outer glow */}
          <motion.div
            className={cn(
              "absolute rounded-full pointer-events-none blur-xl opacity-40",
              frameSizes[size]
            )}
            style={{
              background: `radial-gradient(circle, ${config.colors[0]}80, ${config.colors[config.colors.length - 1]}40, transparent)`,
              transform: "scale(1.4)",
            }}
            animate={showAnimation ? {
              scale: [1.4, 1.6, 1.4],
              opacity: [0.3, 0.5, 0.3],
            } : {}}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
          
          {/* Medium glow */}
          <motion.div
            className={cn(
              "absolute rounded-full pointer-events-none blur-md",
              frameSizes[size]
            )}
            style={{
              background: `linear-gradient(135deg, ${gradientColors})`,
              opacity: config.glowIntensity * 0.6,
              transform: "scale(1.2)",
            }}
            animate={showAnimation ? {
              scale: [1.2, 1.3, 1.2],
              opacity: [config.glowIntensity * 0.4, config.glowIntensity * 0.7, config.glowIntensity * 0.4],
            } : {}}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        </>
      )}

      {/* Metallic/Crystal Inner Ring - Gives Depth */}
      {(config.frameStyle === "metallic" || config.frameStyle === "crystal" || config.frameStyle === "royal" || config.frameStyle === "legendary" || config.frameStyle === "mythic") && (
        <div
          className={cn(
            "absolute rounded-full pointer-events-none",
            frameSizes[size]
          )}
          style={{
            background: `linear-gradient(180deg, 
              rgba(255,255,255,0.4) 0%, 
              rgba(255,255,255,0.1) 20%,
              rgba(0,0,0,0.1) 50%,
              rgba(255,255,255,0.2) 80%,
              rgba(255,255,255,0.4) 100%
            )`,
            padding: config.borderWidth + 1,
            zIndex: 5,
          }}
        >
          <div className="w-full h-full rounded-full bg-black/80" />
        </div>
      )}

      {/* Main Frame Border - Gradient with Shimmer */}
      <motion.div
        className={cn(
          "absolute rounded-full z-10 pointer-events-none overflow-hidden",
          frameSizes[size]
        )}
        style={{
          background: `linear-gradient(135deg, ${gradientColors})`,
          padding: config.borderWidth,
        }}
        animate={showAnimation && config.animationType === "rotate" ? {
          rotate: 360,
        } : {}}
        transition={{
          rotate: { duration: 10, repeat: Infinity, ease: "linear" },
        }}
      >
        {/* Inner black circle */}
        <div className="w-full h-full rounded-full bg-black/90" />
        
        {/* Shimmer overlay */}
        {showAnimation && (config.animationType === "shimmer" || config.animationType === "rainbow" || config.animationType === "cosmic") && (
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{
              background: `linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)`,
            }}
            animate={{
              x: ["-100%", "200%"],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "linear",
              repeatDelay: 1,
            }}
          />
        )}
      </motion.div>

      {/* Rotating Rainbow Ring for Level 8+ */}
      {showAnimation && (config.animationType === "rainbow" || config.animationType === "cosmic") && (
        <motion.div
          className={cn(
            "absolute rounded-full z-8 pointer-events-none",
            frameSizes[size]
          )}
          style={{
            background: `conic-gradient(
              ${config.colors.map((c, i) => `${c} ${(i / config.colors.length) * 100}%`).join(", ")},
              ${config.colors[0]} 100%
            )`,
            padding: config.borderWidth - 1,
            filter: config.animationType === "cosmic" ? "blur(3px)" : "blur(2px)",
          }}
          animate={{
            rotate: -360,
          }}
          transition={{
            duration: config.animationType === "cosmic" ? 4 : 6,
            repeat: Infinity,
            ease: "linear",
          }}
        >
          <div className="w-full h-full rounded-full bg-black/90" />
        </motion.div>
      )}

      {/* Fire Effect for Level 6-7 */}
      {showAnimation && config.animationType === "fire" && (
        <>
          {[...Array(5)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-2 h-3 rounded-full z-25 pointer-events-none"
              style={{
                background: `linear-gradient(to top, ${config.colors[0]}, ${config.colors[1]}, transparent)`,
                top: "-4px",
                left: `${20 + i * 15}%`,
                filter: "blur(1px)",
              }}
              animate={{
                y: [-2, -10, -2],
                opacity: [0.9, 0.3, 0.9],
                scaleY: [1, 1.5, 1],
                scaleX: [1, 0.8, 1],
              }}
              transition={{
                duration: 0.4 + i * 0.08,
                repeat: Infinity,
                ease: "easeInOut",
                delay: i * 0.08,
              }}
            />
          ))}
        </>
      )}

      {/* Cosmic Effect - Orbiting Particles for Level 10+ */}
      {showAnimation && config.animationType === "cosmic" && (
        <>
          {[0, 1, 2].map((ring) => (
            <motion.div
              key={ring}
              className="absolute inset-0 z-15 pointer-events-none"
              animate={{ rotate: ring % 2 === 0 ? 360 : -360 }}
              transition={{
                duration: 8 + ring * 2,
                repeat: Infinity,
                ease: "linear",
              }}
            >
              {[...Array(3)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute w-1.5 h-1.5 rounded-full"
                  style={{
                    background: config.colors[(ring + i) % config.colors.length],
                    boxShadow: `0 0 8px ${config.colors[(ring + i) % config.colors.length]}`,
                    top: "50%",
                    left: "50%",
                    transform: `rotate(${i * 120}deg) translateX(${particleRadius + ring * 4}px)`,
                  }}
                  animate={{
                    scale: [1, 1.5, 1],
                    opacity: [0.6, 1, 0.6],
                  }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    delay: i * 0.5,
                  }}
                />
              ))}
            </motion.div>
          ))}
        </>
      )}

      {/* Floating Particles for Premium Levels */}
      {showAnimation && particles.length > 0 && config.animationType !== "cosmic" && (
        <>
          {particles.slice(0, Math.min(particles.length, 8)).map((particle) => (
            <motion.div
              key={particle.id}
              className="absolute z-25 pointer-events-none text-[8px]"
              style={{
                top: "50%",
                left: "50%",
              }}
              animate={{
                x: [
                  Math.cos((particle.angle * Math.PI) / 180) * particleRadius,
                  Math.cos(((particle.angle + 60) * Math.PI) / 180) * (particleRadius + 4),
                  Math.cos((particle.angle * Math.PI) / 180) * particleRadius,
                ],
                y: [
                  Math.sin((particle.angle * Math.PI) / 180) * particleRadius,
                  Math.sin(((particle.angle + 60) * Math.PI) / 180) * (particleRadius + 4),
                  Math.sin((particle.angle * Math.PI) / 180) * particleRadius,
                ],
                opacity: [0.5, 1, 0.5],
                scale: [0.8, 1.2, 0.8],
              }}
              transition={{
                duration: 2.5,
                repeat: Infinity,
                ease: "easeInOut",
                delay: particle.delay,
              }}
            >
              {getParticleEmoji()}
            </motion.div>
          ))}
        </>
      )}

      {/* Crown/Icon for Top Levels */}
      {config.crownIcon && (
        <motion.div
          className="absolute -top-2 left-1/2 transform -translate-x-1/2 z-30"
          style={{ 
            fontSize: size === "xs" ? "10px" : size === "sm" ? "12px" : size === "md" ? "14px" : "18px",
            filter: `drop-shadow(0 0 4px ${config.glowColor})`,
          }}
          animate={showAnimation ? {
            y: [-1, -4, -1],
            scale: [1, 1.15, 1],
            rotate: [-5, 5, -5],
          } : {}}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          {config.crownIcon}
        </motion.div>
      )}

      {/* Content (Avatar) */}
      <div className="relative z-20 w-full h-full rounded-full overflow-hidden">
        {children}
      </div>

      {/* Level Badge - More Luxurious */}
      <motion.div
        className="absolute -bottom-0.5 -right-0.5 z-30 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full"
        style={{
          background: `linear-gradient(135deg, ${config.colors[0]}, ${config.colors[Math.min(1, config.colors.length - 1)]}, ${config.colors[config.colors.length - 1]})`,
          color: config.premium ? "#000" : "#fff",
          boxShadow: `0 0 8px ${config.glowColor}, inset 0 1px 0 rgba(255,255,255,0.3)`,
          fontSize: size === "xs" ? "6px" : size === "sm" ? "7px" : size === "md" ? "8px" : "10px",
          fontWeight: 700,
          textShadow: config.premium ? "none" : "0 1px 2px rgba(0,0,0,0.5)",
        }}
        animate={showAnimation && config.premium ? {
          scale: [1, 1.08, 1],
          boxShadow: [
            `0 0 6px ${config.glowColor}`,
            `0 0 12px ${config.glowColor}`,
            `0 0 6px ${config.glowColor}`,
          ],
        } : {}}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        Lv{level}
      </motion.div>
    </div>
  );
};

export default LevelFrame;