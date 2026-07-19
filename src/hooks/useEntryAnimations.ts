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
import { warmupEntryAnimationPayload } from '@/utils/vapWarmup';

// Validate URL is proper
const isValidUrl = (url?: string): boolean => {
  return !!(url && url.trim().length > 0 && (url.startsWith('http') || url.startsWith('/')));
};

/**
 * Industry rule (Chamet / BIGO / MICO parity):
 * Flying name bar is gated by ASSET OWNERSHIP, not by raw level.
 * If the user has a valid `entryNameBarUrl` (configured via level privilege
 * OR purchased from shop), the flying SVGA/GIF bar plays for its full
 * intrinsic SVGA duration. Otherwise the user only gets the chat-row
 * welcome message in the public chat overlay.
 */
export const MIN_FLYING_NAMEBAR_LEVEL = 1;


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
  rankCode?: string; // NEW: To trigger cinematic overlays (e.g., 'duke', 'king')
}

/**
 * Phase 3 industry caps (Bigo / Chamet / Poppo parity):
 *   - At most 3 flying name bars visible simultaneously (vertically stacked).
 *   - Anything past 3 sits in a pending queue and pops in as a slot frees.
 *   - The pending queue is hard-capped at 20 — beyond that we drop the
 *     oldest (the burst is so large the user only cares about freshness).
 *   - `nameBarOverflowCount` exposes the pending depth so the renderer can
 *     show a "+N more" chip alongside the visible stack.
 */
export const MAX_VISIBLE_NAMEBARS = 3;
export const MAX_PENDING_NAMEBARS = 20;

export function useEntryAnimations() {
  // Full-screen animations (Vehicle / Entrance)
  const [entryAnimations, setEntryAnimations] = useState<EntryAnimation[]>([]);
  // Compact banner animations (Entry Name Bar) - INDEPENDENT from full-screen.
  // `nameBarAnimations` is the VISIBLE slice (≤ MAX_VISIBLE_NAMEBARS); waiting
  // entries sit in `pendingNameBarsRef` and feed in as visible slots free up.
  const [nameBarAnimations, setNameBarAnimations] = useState<NameBarAnimation[]>([]);
  const [nameBarOverflowCount, setNameBarOverflowCount] = useState(0);
  const pendingNameBarsRef = useRef<NameBarAnimation[]>([]);

  // Track recently processed payload signatures (prevents exact duplicates from broadcast + fallback)
  const shownAnimationsRef = useRef<Map<string, number>>(new Map());
  
  
  /**
   * Add entry animation to queue
   * Full-screen: Vehicle (highest) > Entrance
   * Name Bar: ALWAYS shown independently as compact banner if user has one
   */
  const addEntryAnimation = useCallback((params: AddEntryParams) => {
    // Pkg424: Fire-and-forget warmup — populate HTTP cache the instant the
    // animation enters the queue, so by the time React mounts the VAP player
    // (a few ms later) the MP4/JSON bytes are already in cache → instant play.
    warmupEntryAnimationPayload({
      entranceUrl: params.entranceUrl,
      entryNameBarUrl: params.entryNameBarUrl,
      vehicleAnimationUrl: params.vehicleAnimationUrl,
      soundUrl: params.soundUrl,
    });

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
    
    // === ENTRY NAME BAR (Compact sliding banner) ===
    // Industry rule (Chamet/BIGO): show the flying bar ONLY when the user
    // actually owns a flying name-bar asset (level privilege OR shop purchase).
    // Level alone is irrelevant — a Lv2 user who bought one MUST see it,
    // and a Lv8 user without any equipped/owned asset MUST NOT see a fake bar.
    const userLevel = Number(params.level) || 1;
    const hasOwnedNameBar = isValidUrl(params.entryNameBarUrl);
    if (!hasOwnedNameBar) {
      console.log(
        '[useEntryAnimations] 🚫 NameBar skipped — no owned/configured asset for:',
        params.displayName,
      );
    } else {
      const newNameBar: NameBarAnimation = {
      };

      console.log('[useEntryAnimations] 🏷️ Adding NAMEBAR (owned asset) for:', params.displayName);

      setNameBarAnimations(prev => {
        // Drop duplicates for the same user (a multi-source race could
        // get past the dispatcher's userId dedup window after a slot
        // already opened — final safety net).
        if (prev.some(e => e.userId === params.userId)) {
          console.log('[useEntryAnimations] ⏭️ NameBar already visible for user:', params.displayName);
          return prev;
        }
        if (pendingNameBarsRef.current.some(e => e.userId === params.userId)) {
          console.log('[useEntryAnimations] ⏭️ NameBar already pending for user:', params.displayName);
          return prev;
        }

        if (prev.length < MAX_VISIBLE_NAMEBARS) {
          // Slot available — show immediately.
          return [...prev, newNameBar];
        }

        // All 3 visible slots busy — queue it.
        const pending = pendingNameBarsRef.current;
        pending.push(newNameBar);
        // Hard cap: drop oldest if the burst overflows the buffer.
        while (pending.length > MAX_PENDING_NAMEBARS) {
          pending.shift();
        }
        setNameBarOverflowCount(pending.length);
        return prev;
      });
    }

    
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
   * Remove name bar animation from queue. When a visible slot frees up,
   * promote the next pending entry (FIFO) so the stack stays at most
   * MAX_VISIBLE_NAMEBARS deep and the overflow counter stays accurate.
   */
  const removeNameBarAnimation = useCallback((id: string) => {
    console.log('[useEntryAnimations] ➖ Removing namebar animation:', id);
    setNameBarAnimations(prev => {
      const next = prev.filter(e => e.id !== id);
      const pending = pendingNameBarsRef.current;
      while (next.length < MAX_VISIBLE_NAMEBARS && pending.length > 0) {
        const promoted = pending.shift()!;
        next.push(promoted);
      }
      setNameBarOverflowCount(pending.length);
      return next;
    });
  }, []);
  
  /**
   * Clear all animations
   */
  const clearAllAnimations = useCallback(() => {
    setEntryAnimations([]);
    setNameBarAnimations([]);
    pendingNameBarsRef.current = [];
    setNameBarOverflowCount(0);
    shownAnimationsRef.current.clear();
  }, []);
  
  return {
    entryAnimations,
    nameBarAnimations,
    nameBarOverflowCount,
    addEntryAnimation,
    removeEntryAnimation,
    removeNameBarAnimation,
    clearAllAnimations,
    hasActiveAnimation: entryAnimations.length > 0 || nameBarAnimations.length > 0,
  };
}

export default useEntryAnimations;
