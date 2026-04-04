/**
 * Professional Native Splash Screen
 * Shows animated brand logo on app launch
 */
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';

interface SplashScreenProps {
  onComplete: () => void;
  /** Minimum display time in ms */
  minDuration?: number;
}

export function SplashScreen({ onComplete, minDuration = 1800 }: SplashScreenProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onComplete, 400); // Wait for exit animation
    }, minDuration);
    return () => clearTimeout(timer);
  }, [onComplete, minDuration]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
          style={{ background: 'linear-gradient(180deg, hsl(240 10% 6%) 0%, hsl(240 10% 3%) 100%)' }}
        >
          {/* Glow background */}
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 0.3 }}
            transition={{ duration: 1, ease: 'easeOut' }}
            className="absolute w-80 h-80 rounded-full"
            style={{
              background: 'radial-gradient(circle, hsl(330 85% 60% / 0.4) 0%, transparent 70%)',
            }}
          />

          {/* Logo */}
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
            className="relative z-10 flex flex-col items-center gap-4"
          >
            {/* App Icon */}
            <div className="w-24 h-24 rounded-3xl flex items-center justify-center"
              style={{ background: 'var(--gradient-primary)' }}
            >
              <svg viewBox="0 0 48 48" className="w-14 h-14 text-white" fill="currentColor">
                <path d="M24 4C13 4 4 13 4 24s9 20 20 20 20-9 20-20S35 4 24 4zm-4 28l-2-2 8-8-8-8 2-2 10 10-10 10z" />
              </svg>
            </div>

            {/* Brand Name */}
            <motion.div
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.4 }}
            >
              <h1 className="text-3xl font-bold text-foreground tracking-tight">
                Meri<span className="text-primary">Live</span>
              </h1>
            </motion.div>
          </motion.div>

          {/* Loading dots */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="absolute bottom-20 flex gap-1.5"
          >
            {[0, 1, 2].map(i => (
              <motion.div
                key={i}
                className="w-2 h-2 rounded-full bg-primary"
                animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1, 0.8] }}
                transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
              />
            ))}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default SplashScreen;
