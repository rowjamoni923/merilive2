/**
 * UNIFIED ENTRY ANIMATION QUEUE - Works EXACTLY like useFlyingGifts
 * 
 * Queue-based system for entry animations
 * - Shows ONE full-screen animation at a time (Vehicle or Entrance)
 * - Entry Name Bar is SEPARATE - shows as compact banner independently
 * - Prevents duplicate animations for same user
 * 
 * Usage:
 * const { entryAnimations, nameBarAnimations, addEntryAnimation, ... } = useEntryAnimations();
 */

import { useState, useCallback, useRef } from 'react';
import { EntryAnimation } from '@/components/live/UnifiedEntryAnimation';

// Validate URL is proper
const isValidUrl = (url?: string): boolean => {
  return !!(url && url.trim().length > 0 && (url.startsWith('http') || url.startsWith('/')));
};

export interface NameBarAnimation {
  id: string;
  userId: string;
  displayName: string;
  avatarUrl?: string;
  level: number;
  animationUrl?: string; // Optional - gradient fallback if no SVGA
}

export interface AddEntryParams {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  level: number;
  entranceUrl?: string;
  entryNameBarUrl?: string;
  vehicleAnimationUrl?: string;
  soundUrl?: string;
}

export function useEntryAnimations() {
  // Full-screen animations (Vehicle / Entrance)
  const [entryAnimations, setEntryAnimations] = useState<EntryAnimation[]>([]);
  // Compact banner animations (Entry Name Bar) - INDEPENDENT from full-screen
  const [nameBarAnimations, setNameBarAnimations] = useState<NameBarAnimation[]>([]);
  
  // Track recently processed payload signatures (prevents exact duplicates from broadcast + fallback)
  const shownAnimationsRef = useRef<Map<string, number>>(new Map());
  
  /**
   * Add entry animation to queue
   * Full-screen: Vehicle (highest) > Entrance
   * Name Bar: ALWAYS shown independently as compact banner if user has one
   */
  const addEntryAnimation = useCallback((params: AddEntryParams) => {
    // Deduplicate ONLY identical payloads (don't block richer follow-up payloads)
    const signature = [
      params.userId,
      params.vehicleAnimationUrl || '',
      params.entranceUrl || '',
      params.entryNameBarUrl || '',
    ].join('|');

    const now = Date.now();
    const lastSeenAt = shownAnimationsRef.current.get(signature);

    if (lastSeenAt && now - lastSeenAt < 5000) {
      console.log('[useEntryAnimations] ⏭️ Duplicate payload skipped for:', params.displayName);
      return;
    }

    shownAnimationsRef.current.set(signature, now);
    setTimeout(() => {
      shownAnimationsRef.current.delete(signature);
    }, 10000);
    
    // === FULL-SCREEN ANIMATION (Vehicle or Entrance) ===
    let fullScreenUrl: string | undefined;
    let animationType: 'entrance' | 'vehicle' = 'entrance';
    
    // Priority 1: Vehicle (highest)
    if (isValidUrl(params.vehicleAnimationUrl)) {
      fullScreenUrl = params.vehicleAnimationUrl;
      animationType = 'vehicle';
      console.log('[useEntryAnimations] 🚗 Using VEHICLE animation for:', params.displayName);
    }
    // Priority 2: Entrance
    else if (isValidUrl(params.entranceUrl)) {
      fullScreenUrl = params.entranceUrl;
      animationType = 'entrance';
      console.log('[useEntryAnimations] 🎉 Using ENTRANCE animation for:', params.displayName);
    }
    
    if (fullScreenUrl) {
      const newEntry: EntryAnimation = {
        id: `entry_${Date.now()}_${params.userId}`,
        userId: params.userId,
        displayName: params.displayName,
        avatarUrl: params.avatarUrl,
        level: params.level,
        animationUrl: fullScreenUrl,
        animationType,
      };
      
      console.log('[useEntryAnimations] ➕ Adding full-screen animation:', {
        user: params.displayName,
        type: animationType,
      });
      
      // CRITICAL: Use functional update to prevent duplicate entries for same user
      setEntryAnimations(prev => {
        if (prev.some(e => e.userId === params.userId)) {
          console.log('[useEntryAnimations] ⏭️ Full-screen already queued for user:', params.displayName);
          return prev;
        }
        return [...prev, newEntry];
      });
    }
    
    // === ENTRY NAME BAR (Compact sliding banner) - ALWAYS shown ===
    const newNameBar: NameBarAnimation = {
      id: `namebar_${Date.now()}_${params.userId}`,
      userId: params.userId,
      displayName: params.displayName,
      avatarUrl: params.avatarUrl,
      level: params.level,
      animationUrl: isValidUrl(params.entryNameBarUrl) ? params.entryNameBarUrl : undefined,
    };
    
    console.log('[useEntryAnimations] 🏷️ Adding NAMEBAR banner for:', params.displayName, 
      newNameBar.animationUrl ? '(with animation)' : '(gradient fallback)');
    
    setNameBarAnimations(prev => {
      if (prev.some(e => e.userId === params.userId)) {
        console.log('[useEntryAnimations] ⏭️ NameBar already queued for user:', params.displayName);
        return prev;
      }
      return [...prev, newNameBar];
    });
    
    // Log if no full-screen animation
    if (!fullScreenUrl) {
      console.log('[useEntryAnimations] ⛔ No full-screen animation URL for:', params.displayName);
    }
  }, []);
  
  /**
   * Remove full-screen entry animation from queue
   */
  const removeEntryAnimation = useCallback((id: string) => {
    console.log('[useEntryAnimations] ➖ Removing full-screen animation:', id);
    setEntryAnimations(prev => prev.filter(e => e.id !== id));
  }, []);
  
  /**
   * Remove name bar animation from queue
   */
  const removeNameBarAnimation = useCallback((id: string) => {
    console.log('[useEntryAnimations] ➖ Removing namebar animation:', id);
    setNameBarAnimations(prev => prev.filter(e => e.id !== id));
  }, []);
  
  /**
   * Clear all animations
   */
  const clearAllAnimations = useCallback(() => {
    setEntryAnimations([]);
    setNameBarAnimations([]);
    shownAnimationsRef.current.clear();
  }, []);
  
  return {
    entryAnimations,
    nameBarAnimations,
    addEntryAnimation,
    removeEntryAnimation,
    removeNameBarAnimation,
    clearAllAnimations,
    hasActiveAnimation: entryAnimations.length > 0 || nameBarAnimations.length > 0,
  };
}

export default useEntryAnimations;
