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
  },
  1: {
  },
  2: {
  },
  3: {
  },
  4: {
  },
  // Level 5-9: Premium frames
  5: {
  },
  6: {
  },
  7: {
  },
  8: {
  },
  9: {
  },
  // Level 10+: Legendary/Mythic frames
  10: {
  },
  11: {
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
            }}
            animate={showAnimation ? {
            } : {}}
            transition={{
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
        }}
        animate={showAnimation && config.animationType === "rotate" ? {
          rotate: 360,
        } : {}}
        transition={{
        }}
      >
        {/* Inner black circle */}
        <div className="w-full h-full rounded-full bg-black/90" />
        
        {/* Shimmer overlay */}
        {showAnimation && (config.animationType === "shimmer" || config.animationType === "rainbow" || config.animationType === "cosmic") && (
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{
            }}
            animate={{
              x: ["-100%", "200%"],
            }}
            transition={{
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
              ${config.colors.map((c, i) => `${c} ${(i / config.colors.length) * 100}%`).join(", ")},
              ${config.colors[0]} 100%
            )`,
            filter: config.animationType === "cosmic" ? "blur(3px)" : "blur(2px)",
          }}
          animate={{
          }}
          transition={{
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
                top: "-4px",
                left: `${20 + i * 15}%`,
              }}
              animate={{
                y: [-2, -10, -2],
                scaleY: [1, 1.5, 1],
                scaleX: [1, 0.8, 1],
              }}
              transition={{
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
              }}
            >
              {[...Array(3)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute w-1.5 h-1.5 rounded-full"
                  style={{
                    boxShadow: `0 0 8px ${config.colors[(ring + i) % config.colors.length]}`,
                  }}
                  animate={{
                  }}
                  transition={{
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
              }}
              animate={{
                  Math.cos((particle.angle * Math.PI) / 180) * particleRadius,
                  Math.cos(((particle.angle + 60) * Math.PI) / 180) * (particleRadius + 4),
                  Math.cos((particle.angle * Math.PI) / 180) * particleRadius,
                ],
                  Math.sin((particle.angle * Math.PI) / 180) * particleRadius,
                  Math.sin(((particle.angle + 60) * Math.PI) / 180) * (particleRadius + 4),
                  Math.sin((particle.angle * Math.PI) / 180) * particleRadius,
                ],
              }}
              transition={{
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
          }}
          animate={showAnimation ? {
          } : {}}
          transition={{
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
          color: config.premium ? "#000" : "#fff",
          fontWeight: 700,
          textShadow: config.premium ? "none" : "0 1px 2px rgba(0,0,0,0.5)",
        }}
        animate={showAnimation && config.premium ? {
            `0 0 6px ${config.glowColor}`,
            `0 0 12px ${config.glowColor}`,
            `0 0 6px ${config.glowColor}`,
          ],
        } : {}}
        transition={{
        }}
      >
        Lv{level}
      </motion.div>
    </div>
  );
};

export default LevelFrame;