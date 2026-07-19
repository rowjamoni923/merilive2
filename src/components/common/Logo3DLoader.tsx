import { motion } from "framer-motion";
import meriliveLogo from "@/assets/merilive-logo.png";

interface Logo3DLoaderProps {
  size?: "sm" | "md" | "lg" | "xl";
  showText?: boolean;
  className?: string;
}

const Logo3DLoader = ({ size = "md", showText = true, className = "" }: Logo3DLoaderProps) => {
  const sizeClasses = {
    sm: "w-16 h-16",
    md: "w-24 h-24",
    lg: "w-32 h-32",
    xl: "w-40 h-40",
  };

  const textSizes = {
  };

  return (
    <div className={`flex flex-col items-center justify-center gap-4 ${className}`}>
      {/* 3D Logo Container */}
      <div className="relative" style={{ perspective: "1000px" }}>
        {/* Glow Effect Behind Logo */}
        <motion.div
          className={`absolute inset-0 ${sizeClasses[size]} rounded-full blur-2xl`}
          style={{
            background: "radial-gradient(circle, rgba(168, 85, 247, 0.6) 0%, rgba(236, 72, 153, 0.4) 50%, transparent 70%)",
          }}
          animate={{
            scale: [1, 1.3, 1],
            opacity: [0.5, 0.8, 0.5],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        {/* Outer Rotating Ring */}
        <motion.div
          className={`absolute inset-0 ${sizeClasses[size]} rounded-full`}
          style={{
            border: "2px solid transparent",
            borderTopColor: "#a855f7",
            borderRightColor: "#ec4899",
          }}
          animate={{
            rotate: 360,
          }}
          transition={{
          }}
        />

        {/* Inner Counter-Rotating Ring */}
        <motion.div
          className={`absolute inset-2 rounded-full`}
          style={{
            borderBottomColor: "#f97316",
            borderLeftColor: "#eab308",
          }}
          animate={{
          }}
          transition={{
          }}
        />

        {/* 3D Logo with Floating Animation */}
        <motion.div
          className={`relative ${sizeClasses[size]} flex items-center justify-center`}
          style={{
            transformStyle: "preserve-3d",
          }}
          animate={{
            rotateY: [0, 15, -15, 0],
            rotateX: [0, -10, 10, 0],
            y: [0, -8, 0],
          }}
          transition={{
          }}
        >
          {/* Logo Image with 3D Effect */}
          <motion.img
            src={meriliveLogo}
            alt="MeriLive"
            className="w-full h-full object-contain rounded-2xl"
            style={{
              filter: "drop-shadow(0 10px 30px rgba(168, 85, 247, 0.4))",
            }}
            animate={{
            }}
            transition={{
            }}
          />

          {/* Shine Effect */}
          <motion.div
            className="absolute inset-0 rounded-2xl overflow-hidden"
            style={{
            }}
            animate={{
              x: ["-100%", "200%"],
            }}
            transition={{
              repeatDelay: 1,
            }}
          />
        </motion.div>

        {/* Floating Particles */}
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-2 h-2 rounded-full"
            style={{
              left: `${20 + (i * 12)}%`,
              top: `${10 + (i * 15)}%`,
            }}
            animate={{
            }}
            transition={{
              delay: i * 0.3,
            }}
          />
        ))}
      </div>

      {/* Loading Text with Dots Animation */}
      {showText && (
        <motion.div
          className={`flex items-center gap-1 ${textSizes[size]} font-semibold`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <span className="text-white/80">Loading</span>
          <motion.span
            className="flex gap-0.5"
            animate={{ opacity: [1, 0.5, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-purple-400 to-pink-400"
                animate={{ y: [0, -4, 0] }}
                transition={{
                }}
              />
            ))}
          </motion.span>
        </motion.div>
      )}
    </div>
  );
};

export default Logo3DLoader;
