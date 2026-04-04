import { motion } from "framer-motion";

interface ShimmerEffectProps {
  intensity?: "low" | "medium" | "high";
}

export function ShimmerEffect({ intensity = "medium" }: ShimmerEffectProps) {
  const opacityMap = { low: 0.1, medium: 0.2, high: 0.35 };
  return (
    <motion.div
      className="absolute inset-0 pointer-events-none overflow-hidden rounded-inherit"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent"
        style={{ opacity: opacityMap[intensity] }}
        animate={{ x: ["-100%", "100%"] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
      />
    </motion.div>
  );
}

interface ParticleFieldProps {
  count?: number;
  color?: string;
}

export function ParticleField({ count = 10, color = "#fbbf24" }: ParticleFieldProps) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {Array.from({ length: count }).map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-1.5 h-1.5 rounded-full"
          style={{
            backgroundColor: color,
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
          }}
          animate={{
            y: [0, -20, 0],
            opacity: [0, 1, 0],
            scale: [0.5, 1, 0.5],
          }}
          transition={{
            duration: 1.5 + Math.random(),
            repeat: Infinity,
            delay: Math.random() * 1.5,
          }}
        />
      ))}
    </div>
  );
}
