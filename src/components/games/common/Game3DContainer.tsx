import { motion } from "framer-motion";
import { ReactNode } from "react";

interface Game3DContainerProps {
  children: ReactNode;
  className?: string;
  glowColor?: string;
}

export function Game3DContainer({ children, className = "", glowColor = "#8b5cf6" }: Game3DContainerProps) {
  return (
    <motion.div
      className={`relative rounded-xl overflow-hidden ${className}`}
      style={{
        background: 'linear-gradient(145deg, #1a1625 0%, #0d0a14 50%, #15101f 100%)',
        boxShadow: `0 8px 32px rgba(0,0,0,0.6), 0 0 60px ${glowColor}15, inset 0 1px 0 rgba(255,255,255,0.05)`,
      }}
    >
      {/* Animated border glow */}
      <div 
        className="absolute inset-0 rounded-xl pointer-events-none"
        style={{
          background: `linear-gradient(135deg, ${glowColor}20 0%, transparent 50%, ${glowColor}10 100%)`,
        }}
      />
      
      {/* Grid pattern overlay */}
      <div 
        className="absolute inset-0 opacity-5 pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)',
          backgroundSize: '20px 20px'
        }}
      />
      
      {/* Content */}
      <div className="relative z-10">
        {children}
      </div>
    </motion.div>
  );
}

export function FloatingParticles({ count = 8, color = "#8b5cf6" }: { count?: number; color?: string }) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {Array.from({ length: count }).map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-1 h-1 rounded-full"
          style={{ 
            background: color,
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
          }}
          animate={{
            y: [0, -30, 0],
            x: [0, (Math.random() - 0.5) * 20, 0],
            opacity: [0, 0.8, 0],
            scale: [0.5, 1.5, 0.5],
          }}
          transition={{
            duration: 3 + Math.random() * 2,
            repeat: Infinity,
            delay: Math.random() * 2,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

export function PulsingGlow({ color = "#8b5cf6", intensity = 1 }: { color?: string; intensity?: number }) {
  return (
    <motion.div
      className="absolute inset-0 pointer-events-none"
      animate={{
        opacity: [0.3 * intensity, 0.6 * intensity, 0.3 * intensity],
      }}
      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      style={{
        background: `radial-gradient(circle at center, ${color}30 0%, transparent 70%)`,
      }}
    />
  );
}
