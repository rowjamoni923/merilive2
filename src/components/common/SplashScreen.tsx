/**
 * Professional Native Splash Screen
 * Animated brand logo + name + version on app launch.
 */
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';
import appLogo from '@/assets/app-logo.png';
import { APP_VERSION } from '@/lib/version';

interface SplashScreenProps {
  onComplete: () => void;
  /** Minimum display time in ms */
  minDuration?: number;
}

export function SplashScreen({ onComplete, minDuration = 2000 }: SplashScreenProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onComplete, 450);
    }, minDuration);
    return () => clearTimeout(timer);
  }, [onComplete, minDuration]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
          className="fixed inset-0 z-[99999] flex flex-col items-center justify-center overflow-hidden"
          style={{
            background:
              'radial-gradient(ellipse at top, #FFFBF2 0%, #FAF5EA 55%, #F5EFDF 100%)',
          }}
        >
          {/* Animated soft particles */}
          {[...Array(18)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute rounded-full"
              style={{
                width: Math.random() * 4 + 2,
                height: Math.random() * 4 + 2,
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                background: i % 2 === 0 ? 'rgba(236,72,153,0.35)' : 'rgba(168,85,247,0.3)',
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.7, 0.1] }}
              transition={{
                duration: 2 + Math.random() * 2,
                repeat: Infinity,
                delay: Math.random() * 1.5,
              }}
            />
          ))}

          {/* Glow halo */}
          <motion.div
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1.1, opacity: 0.55 }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
            className="absolute w-[420px] h-[420px] rounded-full pointer-events-none"
            style={{
              background:
                'radial-gradient(circle, rgba(236,72,153,0.35) 0%, rgba(168,85,247,0.18) 45%, transparent 75%)',
              filter: 'blur(20px)',
            }}
          />

          {/* Logo */}
          <motion.div
            initial={{ scale: 0.4, opacity: 0, rotate: -8 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ delay: 0.05, duration: 0.7, ease: [0.34, 1.56, 0.64, 1] }}
            className="relative z-10"
          >
            <div
              className="w-32 h-32 rounded-[28px] overflow-hidden ring-2 ring-white/15"
              style={{
                boxShadow:
                  '0 20px 60px rgba(236,72,153,0.45), 0 0 0 1px rgba(255,255,255,0.08), inset 0 0 0 1px rgba(255,255,255,0.1)',
              }}
            >
              <img src={appLogo} alt="MeriLive" className="w-full h-full object-cover" />
            </div>
          </motion.div>

          {/* Brand name with shimmer */}
          <motion.div
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.45, duration: 0.5 }}
            className="relative z-10 mt-6"
          >
            <h1
              className="text-[40px] font-extrabold tracking-tight text-transparent bg-clip-text"
              style={{
                backgroundImage:
                  'linear-gradient(110deg, #ffffff 0%, #ffd6f5 25%, #ff7eb6 50%, #ffd6f5 75%, #ffffff 100%)',
                backgroundSize: '200% auto',
                animation: 'splash-shimmer 2.4s linear infinite',
                letterSpacing: '-0.02em',
              }}
            >
              MeriLive
            </h1>
          </motion.div>

          {/* Tagline */}
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 0.7, y: 0 }}
            transition={{ delay: 0.75, duration: 0.4 }}
            className="relative z-10 mt-1 text-[12px] text-white/70 tracking-[0.25em] uppercase"
          >
            Live · Connect · Earn
          </motion.p>

          {/* Loading dots */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9 }}
            className="absolute bottom-24 flex gap-1.5"
          >
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-2 h-2 rounded-full"
                style={{ background: 'hsl(330 90% 65%)' }}
                animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }}
                transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
              />
            ))}
          </motion.div>

          {/* Version */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.6 }}
            transition={{ delay: 1.1, duration: 0.5 }}
            className="absolute bottom-8 text-[11px] text-white/55 tracking-wider"
          >
            Version {APP_VERSION}
          </motion.div>

          <style>{`
            @keyframes splash-shimmer {
              0% { background-position: 0% center; }
              100% { background-position: 200% center; }
            }
          `}</style>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default SplashScreen;
