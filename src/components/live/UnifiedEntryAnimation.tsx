/**
 * UNIFIED ENTRY ANIMATION - Works EXACTLY like Gift Animation System
 * 
 * Single full-screen SVGA animation that plays ONCE when user enters
 * Priority: Vehicle > Entrance > NameBar (shows highest priority only)
 * 
 * CRITICAL FIX: All callbacks use refs to prevent stale closures
 * and timer resets on parent re-renders.
 */

import React, { useEffect, useState, useMemo, useCallback, memo, forwardRef, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

import SVGAPlayerWithAudio from "@/components/common/SVGAPlayerWithAudio";
import UniversalAnimationPlayer from "@/components/common/UniversalAnimationPlayer";
export interface EntryAnimation {
  id: string;
  userId: string;
  displayName: string;
  avatarUrl?: string;
  level: number;
  animationUrl: string;
  animationType: 'entrance' | 'vehicle';
  soundUrl?: string;
}

interface UnifiedEntryAnimationProps {
  entry: EntryAnimation;
  onComplete: () => void;
}

const getAnimationType = (url?: string): 'svga' | 'lottie' | 'video' | 'image' | null => {
  if (!url) return null;
  const cleanUrl = url.split('?')[0].toLowerCase();
  if (cleanUrl.endsWith('.svga')) return 'svga';
  if (cleanUrl.endsWith('.json')) return 'lottie';
  if (cleanUrl.endsWith('.mp4') || cleanUrl.endsWith('.webm')) return 'video';
  if (cleanUrl.endsWith('.gif') || cleanUrl.endsWith('.png') || cleanUrl.endsWith('.webp') || cleanUrl.endsWith('.jpg')) return 'image';
  return null;
};

const UnifiedEntryAnimationInner = memo(({ entry, onComplete }: UnifiedEntryAnimationProps) => {
  const [showAnimation, setShowAnimation] = useState(true);
  const [animationEnded, setAnimationEnded] = useState(false);
  const [svgaError, setSvgaError] = useState(false);
  
  const mountedRef = useRef(true);
  const completedRef = useRef(false);
  const animationStartedRef = useRef(false);
  const soundPlayedRef = useRef(false);
  
  // CRITICAL FIX: Store onComplete in ref to prevent stale closures
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);
  
  const displayAnimationUrl = useMemo(() => entry.animationUrl, [entry.animationUrl]);
  const animationType = useMemo(() => getAnimationType(displayAnimationUrl), [displayAnimationUrl]);
  const isSVGA = animationType === 'svga' && !svgaError;

  // Play sound_url from DB when entry animation renders
  useEffect(() => {
    if (!soundPlayedRef.current && entry.soundUrl) {
      soundPlayedRef.current = true;
      const audio = new Audio(entry.soundUrl);
      audio.volume = 0.6;
      audio.play().catch(() => {});
      console.log('[UnifiedEntryAnimation] 🔊 Playing entry sound:', entry.soundUrl);
    }
    
    console.log('[UnifiedEntryAnimation] 🚗 RENDERING ENTRY ANIMATION:', {
      userId: entry.userId,
      userName: entry.displayName,
      animationUrl: displayAnimationUrl,
      soundUrl: entry.soundUrl,
      type: animationType,
      entryType: entry.animationType,
      isSVGA,
    });
  }, []);

  // Stable callback - uses ref for onComplete, empty deps
  const handleAnimationComplete = useCallback(() => {
    if (completedRef.current || !mountedRef.current) return;
    completedRef.current = true;
    
    console.log('[UnifiedEntryAnimation] ✅ Animation completed for:', entry.displayName);
    setShowAnimation(false);
    setAnimationEnded(true);
    onCompleteRef.current();
  }, []); // CRITICAL: Empty deps - uses ref

  const handleSvgaError = useCallback((error: Error) => {
    console.warn('[UnifiedEntryAnimation] SVGA failed, using fallback for:', entry.displayName, error);
    setSvgaError(true);
    setTimeout(() => {
      if (mountedRef.current && !completedRef.current) {
        handleAnimationComplete();
      }
    }, 2500);
  }, [handleAnimationComplete]);

  // Auto-complete timer - runs ONCE on mount
  useEffect(() => {
    mountedRef.current = true;
    
    if (animationStartedRef.current) return;
    animationStartedRef.current = true;
    
    if (isSVGA && !svgaError) {
      // SVGA plays for its NATIVE duration ONLY - onFinished handles completion
      // No extra timers added
      return () => { mountedRef.current = false; };
    }
    
    const timer = setTimeout(() => {
      if (mountedRef.current && !completedRef.current) {
        handleAnimationComplete();
      }
    }, 2500); // 2.5s for non-SVGA (GIF, static, fallback emoji)
    
    return () => {
      mountedRef.current = false;
      clearTimeout(timer);
    };
  }, []); // Empty deps - run only ONCE

  const getEntryLabel = () => {
    switch (entry.animationType) {
      case 'vehicle': return '🚗 Luxury Vehicle Entrance';
      case 'entrance': return '🎉 VIP Entrance';
      default: return '🎉 Entered the room';
    }
  };

  const renderFullScreenAnimation = () => {
    if (!showAnimation || animationEnded) return null;

    if (svgaError || !displayAnimationUrl) {
      return (
        <motion.div
          key="fallback-animation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="pointer-events-none"
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            width: '100vw', height: '100vh',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <motion.div
            initial={{ scale: 0, rotate: -30 }}
            animate={{ scale: [0, 1.5, 1.2], rotate: [0, 15, 0] }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="text-[100px] drop-shadow-2xl"
          >
            {entry.animationType === 'vehicle' ? '🚗' : '🎉'}
          </motion.div>
          
          {Array.from({ length: 12 }).map((_, i) => {
            const angle = (i / 12) * Math.PI * 2;
            const distance = 120 + Math.random() * 80;
            return (
              <motion.div
                key={`particle-${i}`}
                style={{ position: 'absolute', top: '50%', left: '50%' }}
                initial={{ scale: 0, x: '-50%', y: '-50%' }}
                animate={{
                  scale: [0, 1.5, 0.8, 0],
                  x: `calc(-50% + ${Math.cos(angle) * distance}px)`,
                  y: `calc(-50% + ${Math.sin(angle) * distance}px)`,
                  rotate: [0, 180, 360],
                }}
                transition={{ duration: 1.5, delay: 0.2 + i * 0.03, ease: "easeOut" }}
              >
                <span className="text-4xl">✨</span>
              </motion.div>
            );
          })}
        </motion.div>
      );
    }

    if (isSVGA) {
      return (
        <motion.div
          key="svga-fullscreen"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.08 }}
          className="pointer-events-none"
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            width: '100vw', height: '100vh',
            zIndex: 99999,
            overflow: 'visible',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: '50%', left: '50%',
              width: '100%', height: '100%',
              transform: 'translate(-50%, -50%) scale(1.6)',
              transformOrigin: 'center center',
            }}
          >
            <SVGAPlayerWithAudio
              src={displayAnimationUrl}
              loop={false}
              autoPlay={true}
              volume={soundPlayedRef.current ? 0 : 0.8}
              soundUrl={soundPlayedRef.current ? null : (entry.soundUrl ?? null)}
              onComplete={handleAnimationComplete}
              onError={handleSvgaError}
              className="w-full h-full"
            />
          </div>
        </motion.div>
      );
    }

    return (
      <motion.div
        key="generic-entry-animation"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.1 }}
        className="pointer-events-none"
        style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          width: '100vw', height: '100vh',
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '50%', left: '50%',
            width: '100%', height: '100%',
            transform: 'translate(-50%, -50%) scale(1.2)',
            transformOrigin: 'center center',
          }}
        >
          <UniversalAnimationPlayer
            src={displayAnimationUrl}
            className="w-full h-full"
            loop={animationType === 'image'}
            autoPlay={true}
            muted={false}
            onComplete={handleAnimationComplete}
            onError={() => handleAnimationComplete()}
          />
        </div>
      </motion.div>
    );
  };

  return (
    <div 
      className="pointer-events-none overflow-hidden"
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        width: '100vw', height: '100vh',
        zIndex: 100000,
        margin: 0, padding: 0,
      }}
    >
      <motion.div
        className="bg-black/30"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.1 }}
        style={{ 
          position: 'fixed',
          top: 0, left: 0,
          width: '100vw', height: '100vh',
        }}
      />

      <AnimatePresence mode="wait">
        {renderFullScreenAnimation()}
      </AnimatePresence>
    </div>
  );
});

UnifiedEntryAnimationInner.displayName = 'UnifiedEntryAnimationInner';

const UnifiedEntryAnimation = forwardRef<HTMLDivElement, UnifiedEntryAnimationProps>(
  (props, ref) => <UnifiedEntryAnimationInner {...props} />
);

UnifiedEntryAnimation.displayName = 'UnifiedEntryAnimation';

export default UnifiedEntryAnimation;
