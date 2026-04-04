import React from 'react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import UniversalFramePlayer, { FrameType } from './UniversalFramePlayer';

interface PremiumAvatarFrameProps {
  avatarSrc?: string | null;
  frameSrc?: string | null;
  frameType?: FrameType;
  name?: string;
  level?: number;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  showAnimation?: boolean;
  className?: string;
  onClick?: () => void;
  isOnline?: boolean;
}

// Size configurations - Frame and avatar EXACTLY same size for proper overlay
const sizeConfigs = {
  xs: { 
    container: 'w-8 h-8', 
    avatar: 'w-8 h-8', 
    frame: 'w-8 h-8',
    text: 'text-[7px]',
    onlineDot: 'w-1.5 h-1.5 bottom-0 right-0'
  },
  sm: { 
    container: 'w-11 h-11', 
    avatar: 'w-11 h-11', 
    frame: 'w-11 h-11',
    text: 'text-[10px]',
    onlineDot: 'w-2 h-2 bottom-0 right-0'
  },
  md: { 
    container: 'w-14 h-14', 
    avatar: 'w-14 h-14', 
    frame: 'w-14 h-14',
    text: 'text-xs',
    onlineDot: 'w-2.5 h-2.5 bottom-0.5 right-0.5'
  },
  lg: { 
    container: 'w-[72px] h-[72px]', 
    avatar: 'w-[72px] h-[72px]', 
    frame: 'w-[72px] h-[72px]',
    text: 'text-sm',
    onlineDot: 'w-3 h-3 bottom-1 right-1'
  },
  xl: { 
    container: 'w-24 h-24', 
    avatar: 'w-24 h-24', 
    frame: 'w-24 h-24',
    text: 'text-base',
    onlineDot: 'w-3.5 h-3.5 bottom-1 right-1'
  },
  '2xl': { 
    container: 'w-[120px] h-[120px]', 
    avatar: 'w-[120px] h-[120px]', 
    frame: 'w-[120px] h-[120px]',
    text: 'text-lg',
    onlineDot: 'w-4 h-4 bottom-1.5 right-1.5'
  },
};

// Default CSS-based frame gradients for users without custom frames
const getLevelGradient = (level: number): string => {
  if (level >= 60) return 'from-pink-400 via-purple-400 to-cyan-400'; // Mythic
  if (level >= 50) return 'from-rose-500 via-purple-500 to-indigo-500'; // Legendary
  if (level >= 40) return 'from-cyan-400 via-blue-300 to-cyan-500'; // Diamond
  if (level >= 30) return 'from-gray-200 via-white to-gray-300'; // Platinum
  if (level >= 20) return 'from-yellow-500 via-amber-400 to-yellow-600'; // Gold
  if (level >= 10) return 'from-gray-300 via-gray-200 to-gray-400'; // Silver
  if (level >= 5) return 'from-amber-700 via-amber-500 to-amber-800'; // Bronze
  return 'from-slate-500 via-slate-400 to-slate-600'; // Basic
};

/**
 * Premium Avatar Frame Component
 * Supports SVGA, Lottie, GIF, and CSS animated frames
 * Used across the app for consistent avatar presentation
 */
const PremiumAvatarFrame: React.FC<PremiumAvatarFrameProps> = ({
  avatarSrc,
  frameSrc,
  frameType,
  name = 'U',
  level = 1,
  size = 'md',
  showAnimation = true,
  className,
  onClick,
  isOnline,
}) => {
  const config = sizeConfigs[size];
  const displayName = name?.charAt(0)?.toUpperCase() || 'U';
  const hasCustomFrame = !!frameSrc;

  return (
    <div 
      className={cn('relative cursor-pointer', config.container, className)}
      onClick={onClick}
    >
      {/* Avatar - Always centered (Behind frame) z-10 */}
      <div className="absolute inset-0 flex items-center justify-center z-10">
        <Avatar className={cn(config.avatar, 'border-2 border-white/20')}>
          <AvatarImage src={avatarSrc || undefined} className="object-cover" />
          <AvatarFallback className={cn(
            'bg-gradient-to-br from-purple-500 to-pink-500 text-white font-bold',
            config.text
          )}>
            {displayName}
          </AvatarFallback>
        </Avatar>
      </div>

      {/* Custom Frame (SVGA/Lottie/GIF/PNG) - In front of avatar z-20 */}
      {hasCustomFrame ? (
        <div className={cn('absolute inset-0 z-20 pointer-events-none', config.frame)}>
          <UniversalFramePlayer
            src={frameSrc}
            type={frameType}
            className="w-full h-full"
            loop={showAnimation}
            autoPlay={showAnimation}
          />
        </div>
      ) : (
        /* Default CSS Gradient Frame */
        <div
          className={cn(
            'absolute inset-0 rounded-full z-20 pointer-events-none overflow-hidden bg-gradient-to-br',
            getLevelGradient(level),
            showAnimation && level >= 5 && 'animate-spin'
          )}
          style={{
            padding: level >= 20 ? 4 : level >= 5 ? 3 : 2,
            boxShadow: level >= 20 ? '0 0 20px rgba(255, 215, 0, 0.5)' : undefined,
            animationDuration: '15s',
          }}
        >
          <div 
            className="w-full h-full rounded-full"
            style={{
              background: 'linear-gradient(135deg, #1a1a2e 0%, #0a0a0a 50%, #1a1a2e 100%)',
            }}
          />
        </div>
      )}

      {/* Online Status Indicator */}
      {isOnline !== undefined && (
        <div 
          className={cn(
            'absolute rounded-full border-2 border-black z-30',
            config.onlineDot,
            isOnline 
              ? 'bg-green-500 shadow-lg shadow-green-500/50' 
              : 'bg-gray-500'
          )}
        />
      )}
    </div>
  );
};

export default PremiumAvatarFrame;
