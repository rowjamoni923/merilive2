import React from 'react';
import EntranceAnimation from '@/components/level/EntranceAnimation';
import { EntryNameBarAnimation } from '@/components/live/EntryNameBarAnimation';
import { motion, AnimatePresence } from 'framer-motion';
import AvatarWithFrame from '@/components/common/AvatarWithFrame';
import { LevelBadge } from '@/components/common/LevelBadge';

import EntryAnimationFrame from '@/components/entry/EntryAnimationFrame';

interface UnifiedEntryEffectsProps {
  // Full Screen Entrance Animation props
  showEntranceAnimation: boolean;
  entranceUserId: string | null;
  entranceUserInfo: {
    displayName: string;
    avatarUrl?: string;
    level: number;
    customEntranceUrl?: string;
    entranceSoundUrl?: string;
  } | null;
  onEntranceComplete: () => void;
  
  // Entry Name Bar props - ALWAYS shows for ALL joining users
  // Uses gradient fallback if no animation URL (SVGA/GIF/Image)
  showEntryNameBar: boolean;
  entryNameBarInfo: {
    userName: string;
    userLevel: number;
    avatarUrl?: string;
    animationUrl?: string; // Optional - gradient fallback if empty/missing
  } | null;
  onNameBarComplete: () => void;

  // Vehicle Animation props (NEW)
  showVehicleAnimation?: boolean;
  vehicleUserInfo?: {
    userId?: string;
    displayName: string;
    avatarUrl?: string;
    level: number;
    vehicleAnimationUrl: string; // Required - SVGA animation
    vehicleSoundUrl?: string | null; // Optional - admin-uploaded fallback sound
  } | null;
  onVehicleComplete?: () => void;
}

/**
 * Unified Entry Effects Component
 * Used consistently across Party Audio, Video, Game, and Live Streaming
 * 
 * Displays:
 * 1. Entrance Animation - Full screen SVGA animation (uses same approach as FlyingGiftAnimation)
 * 2. Entry Name Bar - Flying SVGA banner (ONLY shows if user has equipped Name Bar)
 * 3. Vehicle Animation - Premium vehicle entrance with SVGA (NEW)
 * 
 * PERFORMANCE: All animations now use direct URL passing - NO internal fetching
 * This matches FlyingGiftAnimation's approach for smooth, lag-free rendering.
 */
export const UnifiedEntryEffects: React.FC<UnifiedEntryEffectsProps> = ({
  showEntranceAnimation,
  entranceUserId,
  entranceUserInfo,
  onEntranceComplete,
  showEntryNameBar,
  entryNameBarInfo,
  onNameBarComplete,
  showVehicleAnimation = false,
  vehicleUserInfo,
  onVehicleComplete,
}) => {
  // CRITICAL VALIDATION: Only render when we have VALID animation URLs
  // An empty string or null should NOT trigger animation
  const isValidUrl = (url?: string): boolean => {
    return !!(url && url.trim().length > 0 && (url.startsWith('http') || url.startsWith('/')));
  };
  
  // Strictly validate each animation type has a proper URL
  const hasEntranceData = showEntranceAnimation && 
                          entranceUserId && 
                          entranceUserInfo?.customEntranceUrl && 
                          isValidUrl(entranceUserInfo.customEntranceUrl);
                          
  // Name Bar: ALWAYS shows for ALL joining users (gradient fallback if no animation)
  const hasNameBarData = showEntryNameBar && entryNameBarInfo;
                         
  const hasVehicleData = showVehicleAnimation && 
                         vehicleUserInfo?.vehicleAnimationUrl && 
                         isValidUrl(vehicleUserInfo.vehicleAnimationUrl);

  // Debug logging - only show when there's relevant data to log
  if (showEntranceAnimation || showEntryNameBar || showVehicleAnimation) {
    console.log('[UnifiedEntryEffects] 🎬 Entry effect validation:', {
      showEntranceAnimation,
      entranceUserId: entranceUserId || 'null',
      entranceUrl: entranceUserInfo?.customEntranceUrl || 'NONE',
      isEntranceUrlValid: isValidUrl(entranceUserInfo?.customEntranceUrl),
      willShowEntrance: hasEntranceData,
      showEntryNameBar,
      nameBarUrl: entryNameBarInfo?.animationUrl || 'NONE',
      isNameBarUrlValid: isValidUrl(entryNameBarInfo?.animationUrl),
      willShowNameBar: hasNameBarData,
      showVehicleAnimation,
      vehicleUrl: vehicleUserInfo?.vehicleAnimationUrl || 'NONE',
      isVehicleUrlValid: isValidUrl(vehicleUserInfo?.vehicleAnimationUrl),
      willShowVehicle: hasVehicleData,
    });
  }

  return (
    <>
      {/* Full Screen Entrance Animation - Pass URL directly like FlyingGiftAnimation */}
      {hasEntranceData && entranceUserInfo && (
        <EntranceAnimation
          key={`entrance-${entranceUserId}`}
          userId={entranceUserId!}
          userInfo={{
            displayName: entranceUserInfo.displayName,
            avatarUrl: entranceUserInfo.avatarUrl,
            level: entranceUserInfo.level,
          }}
          animationUrl={entranceUserInfo.customEntranceUrl}
          soundUrl={entranceUserInfo.entranceSoundUrl}
          onComplete={onEntranceComplete}
          showDuration={4000}
        />
      )}
      
      {/* Flying Entry Name Bar - Shows for ALL joining users */}
      {/* Uses SVGA/GIF/Image as background if equipped, gradient fallback otherwise */}
      {hasNameBarData && entryNameBarInfo && (
        <EntryNameBarAnimation
          key={`namebar-${(entryNameBarInfo as any).userId || entryNameBarInfo.userName}-${Date.now()}`}
          userId={(entryNameBarInfo as any).userId}
          userName={entryNameBarInfo.userName}
          userLevel={entryNameBarInfo.userLevel}
          avatarUrl={entryNameBarInfo.avatarUrl}
          animationUrl={entryNameBarInfo.animationUrl || undefined}
          onComplete={onNameBarComplete}
        />
      )}

      {/* Vehicle Entrance Animation - NEW: Premium SVGA Vehicle with user info */}
      <AnimatePresence>
        {hasVehicleData && vehicleUserInfo && (
          <VehicleEntranceOverlay
            userId={vehicleUserInfo.userId}
            displayName={vehicleUserInfo.displayName}
            avatarUrl={vehicleUserInfo.avatarUrl}
            level={vehicleUserInfo.level}
            vehicleAnimationUrl={vehicleUserInfo.vehicleAnimationUrl}
            vehicleSoundUrl={vehicleUserInfo.vehicleSoundUrl ?? null}
            onComplete={onVehicleComplete || (() => {})}
          />
        )}
      </AnimatePresence>
    </>
  );
};

/**
 * Vehicle Entrance Overlay - Full screen vehicle animation with user info
 */
interface VehicleEntranceOverlayProps {
  userId?: string;
  displayName: string;
  avatarUrl?: string;
  level: number;
  vehicleAnimationUrl: string;
  vehicleSoundUrl?: string | null;
  onComplete: () => void;
}

const VehicleEntranceOverlay: React.FC<VehicleEntranceOverlayProps> = ({
  userId,
  displayName,
  avatarUrl,
  level,
  vehicleAnimationUrl,
  vehicleSoundUrl,
  onComplete,
}) => {
  const [animationComplete, setAnimationComplete] = React.useState(false);
  
  // CRITICAL: Prevent re-initialization on re-renders
  const mountedRef = React.useRef(true);
  const completedRef = React.useRef(false);
  const animationStartedRef = React.useRef(false);

  // Stable complete handler - only fires once when SVGA finishes
  const handleAnimationComplete = React.useCallback(() => {
    if (completedRef.current || !mountedRef.current) {
      console.log('[VehicleEntrance] ⚠️ Complete blocked - already completed');
      return;
    }
    completedRef.current = true;
    
    console.log('[VehicleEntrance] ✅ SVGA animation completed naturally');
    setAnimationComplete(true);
    setTimeout(() => onComplete(), 200); // Small delay for exit animation
  }, [onComplete]);

  // CRITICAL: NO fixed timer — SVGA plays for its NATIVE duration only.
  // SVGAPlayerWithAudio's onComplete fires when the SVGA itself finishes.
  React.useEffect(() => {
    mountedRef.current = true;

    if (animationStartedRef.current) {
      console.log('[VehicleEntrance] ⚠️ Already started, skipping re-init');
      return;
    }
    animationStartedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  if (animationComplete) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] pointer-events-none overflow-hidden"
    >
      {/* Dark overlay */}
      <motion.div 
        className="absolute inset-0 bg-black/60"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />

      {/* Vehicle SVGA Animation - TRUE FULL SCREEN */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: '100%',
          height: '100%',
          // Scale up to fill screen like other entry animations
          transform: 'translate(-50%, -50%) scale(1.5)',
          transformOrigin: 'center center',
        }}
      >
        {/* SVGA Vehicle Animation with Audio - plays ONCE based on SVGA's own duration */}
        <EntryAnimationFrame
          src={vehicleAnimationUrl}
          size="fill"
          type="svga"
          loop={false}
          muted={false}
          volume={0.8}
          soundUrl={vehicleSoundUrl ?? null}
          onComplete={handleAnimationComplete}
          onError={(err) => {
            console.error('[VehicleEntrance] ❌ SVGA error:', err);
            handleAnimationComplete();
          }}
          center={false}
        />

        {/* User Info Overlay at bottom center */}
        <div className="absolute inset-0 flex items-end justify-center pb-[15%]">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
          >
            <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 shadow-2xl shadow-orange-500/50 border border-white/30">
              <AvatarWithFrame 
                userId={userId}
                src={avatarUrl}
                name={displayName}
                level={level} 
                size="sm" 
                showFrame={true}
                showAnimation={true}
              />

              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <LevelBadge level={level} size="sm" animated />
                  <span className="text-white font-bold text-sm drop-shadow-lg">
                    {displayName}
                  </span>
                </div>
                <span className="text-white/90 text-xs">
                  🚗 Luxury Vehicle Entrance
                </span>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Speed lines effect */}
      {[...Array(12)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute h-[2px] rounded-full bg-gradient-to-r from-orange-500 to-transparent"
          style={{
            top: `${20 + Math.random() * 60}%`,
            left: '-100px',
            width: `${80 + Math.random() * 120}px`
          }}
          initial={{ x: -200, opacity: 0 }}
          animate={{ 
            x: typeof window !== 'undefined' ? window.innerWidth + 200 : 1500, 
            opacity: [0, 1, 1, 0] 
          }}
          transition={{ 
            duration: 0.7,
            delay: 0.2 + i * 0.05,
            ease: "easeOut"
          }}
        />
      ))}
    </motion.div>
  );
};

export default UnifiedEntryEffects;
