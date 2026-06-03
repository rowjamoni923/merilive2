import React, { useEffect, useState, memo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getDisplayAvatar } from "@/utils/placeholderAvatar";

interface CinematicEntranceOverlayProps {
  displayName: string;
  avatarUrl?: string;
  rankCode?: string; // 'duke', 'king', etc.
  onComplete: () => void;
}

const CinematicEntranceOverlay = memo(({ 
  displayName, 
  avatarUrl, 
  rankCode = 'duke', 
  onComplete 
}: CinematicEntranceOverlayProps) => {
  const [phase, setPhase] = useState<'entering' | 'displaying' | 'exiting'>('entering');
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    
    // Bigo Duke Entrance Cadence: 
    // 0.0s - 0.8s: Cinematic sweep / darken
    // 0.8s - 4.5s: Text display + effects
    // 4.5s - 5.5s: Fade out
    const displayTimer = setTimeout(() => {
      if (mountedRef.current) setPhase('displaying');
    }, 800);

    const exitTimer = setTimeout(() => {
      if (mountedRef.current) setPhase('exiting');
    }, 4500);

    const completeTimer = setTimeout(() => {
      if (mountedRef.current) onComplete();
    }, 5500);

    return () => {
      mountedRef.current = false;
      clearTimeout(displayTimer);
      clearTimeout(exitTimer);
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  const isKing = rankCode?.toLowerCase() === 'king';
  const rankLabel = isKing ? "KING" : "DUKE";
  const primaryColor = isKing ? "text-amber-400" : "text-yellow-300";
  const glowColor = isKing ? "shadow-[0_0_50px_rgba(251,191,36,0.8)]" : "shadow-[0_0_40px_rgba(253,224,71,0.6)]";
  const bgGradient = isKing 
    ? "from-amber-900/60 via-amber-800/40 to-transparent" 
    : "from-yellow-900/40 via-yellow-800/30 to-transparent";

  return (
    <div className="fixed inset-0 z-[100001] flex items-center justify-center pointer-events-none overflow-hidden">
      {/* Background Cinematic Sweep */}
      <motion.div
        initial={{ opacity: 0, scaleY: 0 }}
        animate={{ opacity: 1, scaleY: 1 }}
        exit={{ opacity: 0, scaleY: 0 }}
        transition={{ duration: 0.8, ease: "circOut" }}
        className={cn(
          "absolute inset-0 bg-gradient-to-b",
          bgGradient
        )}
      />

      {/* Particle Effects (mimicking cinematic sparkles) */}
      <AnimatePresence>
        {phase !== 'exiting' && (
          <div className="absolute inset-0">
            {Array.from({ length: 20 }).map((_, i) => (
              <motion.div
                key={i}
                initial={{ 
                  opacity: 0, 
                  x: Math.random() * 100 + "%", 
                  y: "110%" 
                }}
                animate={{ 
                  opacity: [0, 1, 0],
                  y: "-10%",
                  x: (Math.random() * 100) + (Math.random() * 20 - 10) + "%"
                }}
                transition={{ 
                  duration: 2 + Math.random() * 3, 
                  delay: Math.random() * 2,
                  repeat: Infinity 
                }}
                className="absolute w-1 h-1 bg-yellow-400 rounded-full blur-[1px]"
              />
            ))}
          </div>
        )}
      </AnimatePresence>

      <div className="relative flex flex-col items-center">
        {/* Central Rank Emblem / Avatar Frame */}
        <motion.div
          initial={{ scale: 0, rotate: -180, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ 
            type: "spring", 
            stiffness: 100, 
            damping: 15, 
            delay: 0.4 
          }}
          className="relative mb-8"
        >
          {/* Pulsing Outer Glows */}
          <motion.div
            animate={{ 
              scale: [1, 1.4, 1],
              opacity: [0.3, 0.6, 0.3]
            }}
            transition={{ duration: 3, repeat: Infinity }}
            className={cn(
              "absolute -inset-8 rounded-full blur-2xl",
              isKing ? "bg-amber-500/30" : "bg-yellow-400/20"
            )}
          />
          
          <motion.div
            animate={{ 
              scale: [1, 1.2, 1],
              opacity: [0.5, 0.8, 0.5]
            }}
            transition={{ duration: 2, repeat: Infinity }}
            className={cn(
              "absolute -inset-4 rounded-full border-2 border-yellow-500/50",
              glowColor
            )}
          />

          <div className="relative">
            <Avatar className={cn(
              "w-32 h-32 border-4 border-yellow-400 p-1 bg-black",
              glowColor
            )}>
              <AvatarImage 
                src={avatarUrl || getDisplayAvatar(displayName)} 
                className="rounded-full object-cover"
              />
              <AvatarFallback className="bg-yellow-600 text-white font-bold text-3xl">
                {displayName.charAt(0)}
              </AvatarFallback>
            </Avatar>
            
            {/* Rotating Shine Ring */}
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
              className="absolute -inset-2 border-2 border-dashed border-yellow-400/30 rounded-full"
            />
          </div>

          {/* Rank Badge on Avatar */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 1, duration: 0.5 }}
            className="absolute -bottom-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-yellow-600 to-amber-500 px-4 py-1 rounded-full border border-yellow-200 shadow-xl"
          >
            <span className="text-[10px] font-black text-white tracking-widest flex items-center gap-1">
              <span className="text-xs">👑</span> {rankLabel}
            </span>
          </motion.div>
        </motion.div>

        {/* Text Reveal */}
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.6 }}
          className="text-center"
        >
          <div className={cn(
            "text-5xl font-black uppercase tracking-tighter drop-shadow-[0_5px_15px_rgba(0,0,0,0.5)]",
            primaryColor
          )}>
            {displayName}
          </div>
          <motion.div 
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 1.2, duration: 1 }}
            className="h-px w-64 bg-gradient-to-r from-transparent via-yellow-400 to-transparent mx-auto my-2"
          />
          <div className="text-white/90 text-xl font-bold italic tracking-wide">
            has arrived in glory
          </div>
        </motion.div>
      </div>

      {/* Cinematic Flash Effect */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.4, 0] }}
        transition={{ delay: 0.4, duration: 0.3 }}
        className="absolute inset-0 bg-white mix-blend-overlay pointer-events-none"
      />
    </div>
  );
});

CinematicEntranceOverlay.displayName = 'CinematicEntranceOverlay';

export default CinematicEntranceOverlay;