import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Star, Crown, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface JoinNotification {
  id: string;
  userId: string;
  userName: string;
  userLevel: number;
  avatarUrl?: string;
  timestamp: Date;
}

interface PremiumJoinBannerProps {
  notification: JoinNotification;
  onComplete: () => void;
}

/**
 * Premium Join Banner - Bigo/Chamet Style
 * Shows when a user joins a Party Room with beautiful animations
 * Features: Gradient backgrounds, glowing effects, level-based styling
 */
export const PremiumJoinBanner: React.FC<PremiumJoinBannerProps> = ({
  notification,
  onComplete,
}) => {
  const { userName, userLevel, avatarUrl } = notification;

  // Determine tier based on level for premium styling
  const getTierStyle = (level: number) => {
    if (level >= 50) return {
      gradient: 'from-amber-500 via-yellow-400 to-orange-500',
      glow: 'shadow-amber-500/50',
      textColor: 'text-amber-100',
      icon: Crown,
      iconColor: 'text-yellow-300',
      borderColor: 'border-amber-400/50',
      particleColor: 'bg-yellow-400',
    };
    if (level >= 30) return {
    };
    if (level >= 15) return {
    };
    return {
    };
  };

  const style = getTierStyle(userLevel);
  const IconComponent = style.icon;

  // Auto-dismiss after animation
  React.useEffect(() => {
    const timer = setTimeout(() => {
      onComplete();
    }, 3500); // Show for 3.5 seconds

    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <motion.div
      initial={{ x: '-100%', opacity: 0, scale: 0.8 }}
      animate={{ x: 0, opacity: 1, scale: 1 }}
      exit={{ x: '100%', opacity: 0, scale: 0.8 }}
      transition={{
        type: 'spring',
        damping: 20,
        stiffness: 200,
        duration: 0.6
      }}
      className="relative max-w-[85%] mx-auto"
    >
      {/* Main Banner Container */}
      <div
        className={cn(
          'relative overflow-hidden rounded-2xl px-4 py-3',
          'bg-gradient-to-r',
          style.gradient,
          'border',
          style.borderColor,
          'shadow-lg',
          style.glow
        )}
      >
        {/* Animated Shine Effect */}
        <motion.div
          animate={{
            x: ['-100%', '200%'],
          }}
          transition={{
            repeat: Infinity,
            repeatDelay: 2,
            ease: 'easeInOut',
          }}
          className="absolute inset-0 w-1/3 bg-gradient-to-r from-transparent via-white/30 to-transparent skew-x-12"
        />

        {/* Floating Particles */}
        {[...Array(5)].map((_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{
              opacity: [0, 1, 0],
              y: [-10, -40],
            }}
            transition={{
              delay: i * 0.3,
            }}
            className={cn(
              'absolute w-1.5 h-1.5 rounded-full',
              style.particleColor
            )}
            style={{
              left: `${20 + i * 15}%`,
              bottom: '20%',
            }}
          />
        ))}

        {/* Content Row */}
        <div className="relative flex items-center gap-3">
          {/* Avatar with Glow Ring */}
          <div className="relative flex-shrink-0">
            {/* Pulsing Glow */}
            <motion.div
              animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.8, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
              className={cn(
                'absolute -inset-1 rounded-full bg-white/30 blur-sm'
              )}
            />
            
            {/* Avatar Container */}
            <div className="relative w-10 h-10 rounded-full overflow-hidden border-2 border-white/50 shadow-lg">
              {avatarUrl ? (
                <img loading="lazy" decoding="async" 
                  src={avatarUrl}
                  alt={userName}
                  className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-white/20 flex items-center justify-center">
                  <span className="text-white font-bold text-lg">
                    {userName.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
            </div>

            {/* Level Badge */}
            <div className="absolute -bottom-1 -right-1 bg-black/60 backdrop-blur-sm rounded-full px-1.5 py-0.5 border border-white/30">
              <span className="text-[9px] font-bold text-white">
                Lv.{userLevel}
              </span>
            </div>
          </div>

          {/* Text Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <IconComponent className={cn('w-4 h-4', style.iconColor)} />
              <span className={cn('font-bold text-sm truncate', style.textColor)}>
                {userName}
              </span>
            </div>
            <p className="text-white/80 text-xs mt-0.5">
              ✨ stepped into the party!
            </p>
          </div>

          {/* Welcome Icon */}
          <motion.div
            animate={{ rotate: [0, 15, -15, 0] }}
            transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 1 }}
            className="flex-shrink-0"
          >
            <span className="text-2xl">👋</span>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
};

/**
 * Container for stacking multiple join banners
 * Positioned at center-left of the screen (Bigo style)
 */
interface JoinBannerContainerProps {
  notifications: JoinNotification[];
  onDismiss: (id: string) => void;
}

export const JoinBannerContainer: React.FC<JoinBannerContainerProps> = ({
  notifications,
  onDismiss,
}) => {
  // Only show last 3 notifications to prevent overflow
  const visibleNotifications = notifications.slice(-3);

  return (
    <div className="fixed left-2 top-1/3 z-[100] flex flex-col gap-2 w-[280px] pointer-events-none">
      <AnimatePresence mode="popLayout">
        {visibleNotifications.map((notification) => (
          <PremiumJoinBanner
            key={notification.id}
            notification={notification}
            onComplete={() => onDismiss(notification.id)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
};

export default PremiumJoinBanner;
