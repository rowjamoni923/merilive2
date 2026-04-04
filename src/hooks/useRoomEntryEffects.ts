import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fetchUserEntryAnimations } from '@/utils/fetchEntryAnimation';

export interface EntryEffectUser {
  id: string;
  userName: string;
  userLevel: number;
  avatarUrl?: string;
  entranceAnimationUrl?: string;
  entryNameBarUrl?: string;
  vehicleAnimationUrl?: string;
}

export interface EntryEffectState {
  // Entrance Animation (full screen vehicle/SVGA)
  showEntranceAnimation: boolean;
  entranceUserId: string | null;
  entranceUserInfo: {
    displayName: string;
    avatarUrl?: string;
    level: number;
    customEntranceUrl?: string;
  } | null;
  
  // Entry Name Bar (flying banner with name) - Shows for ALL joining users
  // With SVGA/GIF/Image: animated background. Without: gradient fallback.
  showEntryNameBar: boolean;
  entryNameBarInfo: {
    userName: string;
    userLevel: number;
    avatarUrl?: string;
    animationUrl?: string; // Optional - gradient fallback if empty
  } | null;

  // Vehicle Animation (full screen SVGA car/bike/etc)
  showVehicleAnimation: boolean;
  vehicleUserInfo: {
    userId?: string;
    displayName: string;
    avatarUrl?: string;
    level: number;
    vehicleAnimationUrl: string;
  } | null;
  
  // Join message for chat
  latestJoinMessage: {
    id: string;
    userId: string;
    userName: string;
    userLevel: number;
    avatarUrl?: string;
    timestamp: Date;
  } | null;
}

/**
 * Unified hook for room entry effects across Party Rooms and Live Streams
 * Provides consistent entry animations, banners, and join notifications
 */
export function useRoomEntryEffects(currentUserId: string | null) {
  const [state, setState] = useState<EntryEffectState>({
    showEntranceAnimation: false,
    entranceUserId: null,
    entranceUserInfo: null,
    showEntryNameBar: false,
    entryNameBarInfo: null,
    showVehicleAnimation: false,
    vehicleUserInfo: null,
    latestJoinMessage: null,
  });
  
  const mountedRef = useRef(true);

  /**
   * Fetch user's equipped entry effects from database
   * Uses centralized fetchUserEntryAnimations which checks ALL tables
   */
  const fetchUserEntryEffects = useCallback(async (userId: string): Promise<{
    entranceAnimationUrl?: string;
    entryNameBarUrl?: string;
    vehicleAnimationUrl?: string;
  }> => {
    try {
      // Get user profile with equipped IDs
      const { data: profile } = await supabase
        .from('profiles')
        .select('equipped_entrance_id, equipped_entry_name_bar_id, equipped_vehicle_id, user_level')
        .eq('id', userId)
        .single();

      if (!profile) return {};

      console.log('[useRoomEntryEffects] Profile data:', {
        equipped_entrance_id: profile.equipped_entrance_id,
        equipped_entry_name_bar_id: profile.equipped_entry_name_bar_id,
        equipped_vehicle_id: profile.equipped_vehicle_id,
        user_level: profile.user_level
      });

      // Use centralized function that checks ALL tables (entry_banners, shop_items, level_privileges)
      // Pass user_level for auto-assigning level-based entry name bars
      const { entranceAnimationUrl, entryNameBarUrl, vehicleAnimationUrl } = await fetchUserEntryAnimations(
        profile.equipped_entrance_id,
        profile.equipped_entry_name_bar_id,
        profile.equipped_vehicle_id,
        profile.user_level
      );

      return { entranceAnimationUrl, entryNameBarUrl, vehicleAnimationUrl };
    } catch (error) {
      console.error('[useRoomEntryEffects] Error fetching entry effects:', error);
      return {};
    }
  }, []);

  /**
   * Trigger entry effects for a user joining the room
   * ALL users in the room can see these effects (Entry Animation, Entry Name Bar, Gifts, Frames)
   */
  const triggerEntryEffects = useCallback(async (
    userId: string,
    userName: string,
    userLevel: number,
    avatarUrl?: string
  ) => {
    // ALL users can see entry effects - removed self-skip to ensure visibility for everyone
    console.log('[useRoomEntryEffects] Triggering entry effects for:', userName, 'Level:', userLevel);

    // Fetch custom animations
    const { entranceAnimationUrl, entryNameBarUrl, vehicleAnimationUrl } = await fetchUserEntryEffects(userId);

    if (!mountedRef.current) return;

    // CRITICAL VALIDATION: Only show animations if we have VALID URLs
    // Empty strings, null, or undefined should NOT trigger any animation
    const isValidUrl = (url?: string): boolean => {
      return !!(url && url.trim().length > 0 && (url.startsWith('http') || url.startsWith('/')));
    };
    
    const hasValidEntranceUrl = isValidUrl(entranceAnimationUrl);
    const hasValidNameBarUrl = isValidUrl(entryNameBarUrl);
    const hasValidVehicleUrl = isValidUrl(vehicleAnimationUrl);
    
    console.log('[useRoomEntryEffects] 📍 Animation validation:', {
      userId,
      userName,
      entranceUrl: entranceAnimationUrl || 'NONE',
      isEntranceValid: hasValidEntranceUrl,
      nameBarUrl: entryNameBarUrl || 'NONE',
      isNameBarValid: hasValidNameBarUrl,
      vehicleUrl: vehicleAnimationUrl || 'NONE',
      isVehicleValid: hasValidVehicleUrl
    });

    // Create join message
    const joinMessage = {
      id: `join_${Date.now()}_${userId}`,
      userId,
      userName,
      userLevel,
      avatarUrl,
      timestamp: new Date(),
    };

    // Update state with all effects
    // Entry Name Bar ALWAYS shows for ALL users (gradient fallback if no animation URL)
    // Entrance & Vehicle only show with valid SVGA/animation URLs
    setState(prev => ({
      ...prev,
      // Entrance Animation - ONLY show if user has VALID equipped animation URL
      showEntranceAnimation: hasValidEntranceUrl,
      entranceUserId: hasValidEntranceUrl ? userId : null,
      entranceUserInfo: hasValidEntranceUrl ? {
        displayName: userName,
        avatarUrl,
        level: userLevel,
        customEntranceUrl: entranceAnimationUrl,
      } : null,
      // Entry Name Bar - ALWAYS show for ALL joining users
      // If user has equipped animation (SVGA/GIF/Image), it plays as background
      // If not, shows gradient fallback with user info
      showEntryNameBar: true,
      entryNameBarInfo: {
        userName,
        userLevel,
        avatarUrl,
        animationUrl: hasValidNameBarUrl ? entryNameBarUrl! : '',
      },
      // Vehicle Animation - ONLY show if user has VALID equipped vehicle URL
      showVehicleAnimation: hasValidVehicleUrl,
      vehicleUserInfo: hasValidVehicleUrl ? {
        userId,
        displayName: userName,
        avatarUrl,
        level: userLevel,
        vehicleAnimationUrl: vehicleAnimationUrl!,
      } : null,
      // Join message - always show in chat
      latestJoinMessage: joinMessage,
    }));
  }, [currentUserId, fetchUserEntryEffects]);

  /**
   * Close entrance animation
   */
  const closeEntranceAnimation = useCallback(() => {
    setState(prev => ({
      ...prev,
      showEntranceAnimation: false,
      entranceUserId: null,
      entranceUserInfo: null,
    }));
  }, []);

  /**
   * Close entry name bar
   */
  const closeEntryNameBar = useCallback(() => {
    setState(prev => ({
      ...prev,
      showEntryNameBar: false,
      entryNameBarInfo: null,
    }));
  }, []);

  /**
   * Close vehicle animation
   */
  const closeVehicleAnimation = useCallback(() => {
    setState(prev => ({
      ...prev,
      showVehicleAnimation: false,
      vehicleUserInfo: null,
    }));
  }, []);

  /**
   * Clear join message after it's been displayed
   */
  const clearJoinMessage = useCallback(() => {
    setState(prev => ({
      ...prev,
      latestJoinMessage: null,
    }));
  }, []);

  /**
   * Cleanup on unmount
   */
  const cleanup = useCallback(() => {
    mountedRef.current = false;
  }, []);

  return {
    ...state,
    triggerEntryEffects,
    closeEntranceAnimation,
    closeEntryNameBar,
    closeVehicleAnimation,
    clearJoinMessage,
    cleanup,
    mountedRef,
  };
}

export default useRoomEntryEffects;
