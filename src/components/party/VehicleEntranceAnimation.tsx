import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LevelBadge } from "@/components/common/LevelBadge";
import AvatarWithFrame from "@/components/common/AvatarWithFrame";

interface UserInfo {
  userId?: string;
  displayName: string;
  avatarUrl?: string;
  level: number;
}

interface VehicleEntranceAnimationProps {
  user: UserInfo;
  vehicleType?: 'car' | 'bike' | 'plane' | 'helicopter' | 'yacht' | 'rocket';
  onComplete: () => void;
}

// Professional vehicle configurations
const vehicles = {
  car: { 
    emoji: '🏎️', 
    gradient: 'from-red-500 via-orange-500 to-yellow-500', 
    name: 'Sports Car',
    glow: 'shadow-[0_0_40px_rgba(239,68,68,0.5)]',
    particles: ['#EF4444', '#F97316', '#EAB308']
  },
  bike: { 
  },
  plane: { 
  },
  helicopter: { 
  },
  yacht: { 
  },
  rocket: { 
  }
};

const getVehicleByLevel = (level: number): keyof typeof vehicles => {
  if (level >= 60) return 'rocket';
  if (level >= 50) return 'plane';
  if (level >= 40) return 'helicopter';
  if (level >= 30) return 'car';
  if (level >= 20) return 'yacht';
  return 'bike';
};

const VehicleEntranceAnimation = ({ 
  user, 
  vehicleType,
  onComplete 
}: VehicleEntranceAnimationProps) => {
  const [isVisible, setIsVisible] = useState(true);
  const vehicle = vehicles[vehicleType || getVehicleByLevel(user.level)];

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      onComplete();
    }, 4500);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] pointer-events-none overflow-hidden"
        >
          {/* Dark overlay */}
          <motion.div 
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Background glow effect */}
          <motion.div
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.2, 0.4, 0.2] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] rounded-full bg-gradient-to-r ${vehicle.gradient} blur-[100px] opacity-30`} />
          </motion.div>

          {/* Speed lines */}
          {[...Array(15)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute h-[2px] rounded-full"
              style={{
                background: `linear-gradient(to right, ${vehicle.particles[i % 3]}, transparent)`,
                top: `${25 + Math.random() * 50}%`,
                left: '-100px',
                width: `${60 + Math.random() * 100}px`
              }}
              initial={{ x: -200, opacity: 0 }}
              animate={{ 
                x: typeof window !== 'undefined' ? window.innerWidth + 200 : 1500, 
                opacity: [0, 1, 1, 0] 
              }}
              transition={{ 
                duration: 0.6,
                delay: 0.3 + i * 0.04,
                ease: "easeOut"
              }}
            />
          ))}

          {/* Main vehicle entrance */}
          <motion.div
            initial={{ x: -400 }}
            animate={{ 
            }}
            transition={{ 
              times: [0, 0.3, 0.7, 1],
            }}
            className="absolute top-1/2 -translate-y-1/2 left-1/2"
          >
            {/* Particle trail */}
            {[...Array(10)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-3 h-3 rounded-full"
                style={{
                  backgroundColor: vehicle.particles[i % 3],
                  transform: 'translateY(-50%)'
                }}
                animate={{
                  scale: [1, 0.3],
                  y: [0, (i % 2 === 0 ? -1 : 1) * 15]
                }}
                transition={{
                  repeat: Infinity,
                }}
              />
            ))}

            {/* Vehicle + User card */}
            <motion.div 
              className={`relative flex items-center gap-4 px-6 py-4 rounded-3xl bg-gradient-to-r ${vehicle.gradient} ${vehicle.glow} border border-white/30`}
              animate={{ 
                boxShadow: [
                  vehicle.glow.replace('shadow-[', '').replace(']', ''),
                  vehicle.glow.replace('shadow-[', '').replace(']', '').replace('0.5', '0.7'),
                  vehicle.glow.replace('shadow-[', '').replace(']', '')
                ]
              }}
              transition={{ duration: 1, repeat: Infinity }}
            >
              {/* Vehicle emoji with animation */}
              <motion.div 
                className="text-5xl md:text-6xl"
                animate={{ 
                  rotate: [-5, 5, -5],
                }}
                transition={{ duration: 0.4, repeat: Infinity }}
              >
                {vehicle.emoji}
              </motion.div>

              {/* User info */}
              <div className="flex items-center gap-3">
                <AvatarWithFrame 
                  userId={user.userId}
                  src={user.avatarUrl}
                  name={user.displayName}
                  level={user.level} 
                  size="md" 
                  showFrame={true}
                  showAnimation={true}
                />

                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <LevelBadge level={user.level} size="md" animated />
                    <motion.span 
                      className="text-white font-black text-lg md:text-xl drop-shadow-lg"
                      style={{ textShadow: "0 2px 10px rgba(0,0,0,0.3)" }}
                    >
                      {user.displayName}
                    </motion.span>
                  </div>
                  <span className="text-white/90 text-sm font-medium">
                    🔥 {vehicle.name} Entrance
                  </span>
                </div>
              </div>

              {/* Glow effect behind card */}
              <motion.div
                className="absolute -inset-2 rounded-3xl bg-white/10 -z-10 blur-xl"
                animate={{ opacity: [0.3, 0.5, 0.3] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
            </motion.div>
          </motion.div>

          {/* Sparkle effects */}
          {[...Array(8)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-2 h-2 rounded-full bg-yellow-300"
              style={{
              }}
              animate={{
              }}
              transition={{
                repeatDelay: 1
              }}
            />
          ))}

          {/* Dust cloud behind vehicle */}
          <motion.div
            initial={{ opacity: 0, scale: 0 }}
            animate={{ 
            }}
            transition={{ 
            }}
            className="absolute left-1/2 top-[48%] w-24 h-24 rounded-full bg-gradient-to-r from-white/30 to-transparent blur-2xl"
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default VehicleEntranceAnimation;
