import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface VerifiedBadgeProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  showGlow?: boolean;
  isHost?: boolean;
}

export const VerifiedBadge = ({ 
  size = "md", 
  className, 
  showGlow = true,
  isHost = false 
}: VerifiedBadgeProps) => {
  const sizeClasses = {
    sm: "w-5 h-5",
    md: "w-7 h-7",
    lg: "w-10 h-10"
  };

  const iconSizes = {
  };

  return (
    <motion.div
      initial={{ scale: 0, rotate: -180 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{
        type: "spring",
        stiffness: 260,
        damping: 20,
        delay: 0.2
      }}
      className={cn("relative", className)}
    >
      {/* Outer Glow Ring */}
      {showGlow && (
        <motion.div
          className={cn(
            "absolute inset-0 rounded-full",
            isHost 
              ? "bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500" 
              : "bg-gradient-to-r from-blue-400 to-cyan-400"
          )}
          animate={{
            scale: [1, 1.3, 1],
            opacity: [0.7, 0, 0.7]
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
      )}

      {/* Sparkle Effects */}
      {showGlow && (
        <>
          <motion.div
            className="absolute -top-1 -right-1 w-2 h-2 bg-yellow-400 rounded-full"
            animate={{
            }}
            transition={{
            }}
          />
          <motion.div
            className="absolute -bottom-0.5 -left-1 w-1.5 h-1.5 bg-cyan-400 rounded-full"
            animate={{
            }}
            transition={{
            }}
          />
          <motion.div
            className="absolute top-0 -left-0.5 w-1 h-1 bg-pink-400 rounded-full"
            animate={{
            }}
            transition={{
            }}
          />
        </>
      )}

      {/* Main Badge */}
      <motion.div
        className={cn(
          sizeClasses[size],
          "rounded-full flex items-center justify-center border-2 border-white shadow-lg relative z-10",
          isHost 
            ? "bg-gradient-to-br from-pink-500 via-purple-500 to-blue-500" 
            : "bg-gradient-to-br from-blue-500 to-cyan-500"
        )}
        whileHover={{ scale: 1.15 }}
        whileTap={{ scale: 0.95 }}
      >
        {/* Inner Shine Effect */}
        <motion.div
          className="absolute inset-0 rounded-full bg-gradient-to-tr from-white/40 to-transparent"
          animate={{
          }}
          transition={{
          }}
        />

        {/* Checkmark Icon */}
        <motion.svg 
          className={cn(iconSizes[size], "text-white relative z-10")} 
          fill="currentColor" 
          viewBox="0 0 20 20"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.5, delay: 0.5 }}
        >
          <path 
            fillRule="evenodd" 
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" 
            clipRule="evenodd" 
          />
        </motion.svg>
      </motion.div>

      {/* Rotating Ring (for hosts) */}
      {isHost && showGlow && (
        <motion.div
          className="absolute inset-[-3px] rounded-full border-2 border-dashed border-pink-400/50"
          animate={{ rotate: 360 }}
          transition={{
          }}
        />
      )}
    </motion.div>
  );
};

// Host Verified Badge with special effects
export const HostVerifiedBadge = ({ 
  size = "md", 
  className 
}: Omit<VerifiedBadgeProps, "isHost">) => {
  return (
    <VerifiedBadge 
      size={size} 
      className={className} 
      isHost={true} 
      showGlow={true} 
    />
  );
};
