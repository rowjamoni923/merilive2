import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { SmartImage } from "@/components/ui/smart-image";

// Import rocket images - 3 different designs for 3 lanes
import rocketBlueImg from "@/assets/rockets/rocket-blue.png";      // Traditional rocket for RED lane
import rocketGreenImg from "@/assets/rockets/rocket-green.png";    // UFO for BLUE lane
import rocketOrangeImg from "@/assets/rockets/rocket-orange.png";  // Orange UFO for GREEN lane

interface PremiumRocket3DProps {
  color: "red" | "blue" | "green";
  position: number; // 0-100 percentage
  isLaunching: boolean;
  isWinner: boolean;
  hasBet?: boolean;
  betAmount?: number;
  onClick?: () => void;
}

// Map rocket types to their images
const ROCKET_IMAGES: Record<string, string> = {
  red: rocketBlueImg,     // Traditional rocket
  blue: rocketGreenImg,   // UFO spaceship
  green: rocketOrangeImg, // Orange UFO
};

// Color configurations for glow effects
const colorConfig = {
  red: {
    glow: "rgba(239, 68, 68, 0.6)",
    tableColor: "#ef4444",
  },
  blue: {
    glow: "rgba(59, 130, 246, 0.6)",
    tableColor: "#3b82f6",
  },
  green: {
    glow: "rgba(34, 197, 94, 0.6)",
    tableColor: "#22c55e",
  }
};

export function PremiumRocket3D({
  color,
  position,
  isLaunching,
  isWinner,
}: PremiumRocket3DProps) {
  const cfg = colorConfig[color];

  return (
    <div
      className="relative flex flex-col items-center pointer-events-none select-none"
      style={{
        transform: `translateY(${-position * 2}px)`,
        transition: isLaunching ? 'transform 0.1s linear' : 'transform 0.3s ease-out'
      }}
    >
      {/* Winner Crown */}
      {isWinner && (
        <motion.div
          initial={{ scale: 0, y: 10 }}
          animate={{ scale: 1, y: 0 }}
          className="absolute -top-8 text-2xl z-10"
        >
          👑
        </motion.div>
      )}

      {/* Rocket Image Container */}
      <motion.div
        className="relative"
        animate={isLaunching ? {
          x: [0, -1, 1, -0.5, 0.5, 0],
          rotate: [0, -1, 1, -0.5, 0.5, 0]
        } : isWinner ? {
          scale: [1, 1.1, 1],
          y: [0, -5, 0]
        } : {}}
        transition={{
          duration: isLaunching ? 0.08 : 0.5,
          repeat: Infinity
        }}
      >
        {/* Glow Effect */}
        <div
          className={cn(
            "absolute -inset-4 rounded-full blur-xl opacity-50",
            isWinner && "opacity-80 animate-pulse"
          )}
          style={{ background: cfg.glow }}
        />

        {/* Rocket Image */}
        <SmartImage
          src={ROCKET_IMAGES[color]}
          alt={`${color} rocket`}
          fallbackSrc={ROCKET_IMAGES[color]}
          className="relative z-10 w-10 h-auto drop-shadow-2xl"
          style={{
            filter: `drop-shadow(0 0 10px ${cfg.glow}) drop-shadow(0 4px 8px rgba(0,0,0,0.4))`
          }}/>
      </motion.div>
    </div>
  );
}
