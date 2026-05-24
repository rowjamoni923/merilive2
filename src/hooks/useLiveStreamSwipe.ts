/**
 * =====================================================
 * LIVE STREAM SWIPE NAVIGATION HOOK
 * =====================================================
 * 
 * TikTok-style vertical swipe to navigate between live streams.
 * Swipe up = next live, Swipe down = previous live
 * 
 * =====================================================
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { subscribeToTables } from "@/hooks/useUniversalRealtime";

interface LiveStreamInfo {
  id: string;
  title: string;
  host_id: string;
  viewer_count: number;
}

export function useLiveStreamSwipe(currentStreamId: string | undefined) {
  const navigate = useNavigate();
  const [streams, setStreams] = useState<LiveStreamInfo[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isNavigating, setIsNavigating] = useState(false);
  
  // Touch tracking
  const touchStartY = useRef(0);
  const touchStartTime = useRef(0);
  const mountedRef = useRef(false);
  const navigationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Fetch active live streams on mount
  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    setIsNavigating(false);

    const fetchStreams = async () => {
      const { data } = await supabase
        .from('live_streams')
        .select('id, title, host_id, viewer_count')
        .eq('is_active', true)
        .order('viewer_count', { ascending: false })
        .limit(100);
      
      if (data && mountedRef.current && !cancelled) {
        setStreams(data);
        
        // Find current stream index
        if (currentStreamId) {
          const idx = data.findIndex(s => s.id === currentStreamId);
          setCurrentIndex(idx);
        }
      }
    };
    
    fetchStreams();

    const unsubscribe = subscribeToTables(`live-swipe-${currentStreamId || 'none'}`, ['live_streams'], () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        fetchStreams();
      }, 250);
    });

    return () => {
      cancelled = true;
      mountedRef.current = false;
      if (refreshTimer) clearTimeout(refreshTimer);
      if (navigationTimerRef.current) {
        clearTimeout(navigationTimerRef.current);
        navigationTimerRef.current = null;
      }
      unsubscribe?.();
    };
  }, [currentStreamId]);

  // Navigate to next stream (swipe up)
  const goToNext = useCallback(() => {
    if (isNavigating || currentIndex >= streams.length - 1 || currentIndex === -1) {
      console.log('[LiveSwipe] Cannot go next:', { isNavigating, currentIndex, total: streams.length });
      return false;
    }
    
    setIsNavigating(true);
    const nextStream = streams[currentIndex + 1];
    
    if (nextStream) {
      console.log('[LiveSwipe] Navigating to next stream:', nextStream.id);
      navigate(`/live/${nextStream.id}`, { replace: true });
      
      if (navigationTimerRef.current) clearTimeout(navigationTimerRef.current);
      navigationTimerRef.current = setTimeout(() => {
        if (mountedRef.current) setIsNavigating(false);
        navigationTimerRef.current = null;
      }, 500);
      return true;
    }
    
    setIsNavigating(false);
    return false;
  }, [currentIndex, streams, navigate, isNavigating]);

  // Navigate to previous stream (swipe down)
  const goToPrevious = useCallback(() => {
    if (isNavigating || currentIndex <= 0) {
      console.log('[LiveSwipe] Cannot go previous:', { isNavigating, currentIndex });
      return false;
    }
    
    setIsNavigating(true);
    const prevStream = streams[currentIndex - 1];
    
    if (prevStream) {
      console.log('[LiveSwipe] Navigating to previous stream:', prevStream.id);
      navigate(`/live/${prevStream.id}`, { replace: true });
      
      if (navigationTimerRef.current) clearTimeout(navigationTimerRef.current);
      navigationTimerRef.current = setTimeout(() => {
        if (mountedRef.current) setIsNavigating(false);
        navigationTimerRef.current = null;
      }, 500);
      return true;
    }
    
    setIsNavigating(false);
    return false;
  }, [currentIndex, streams, navigate, isNavigating]);

  // Touch handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchStartTime.current = Date.now();
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const touchEndY = e.changedTouches[0].clientY;
    const touchEndTime = Date.now();
    
    const deltaY = touchStartY.current - touchEndY;
    const deltaTime = touchEndTime - touchStartTime.current;
    
    // Minimum swipe requirements
    const minSwipeDistance = 80; // pixels
    const maxSwipeTime = 300; // ms (quick swipe)
    
    // Check if it's a valid swipe (fast enough and far enough)
    if (Math.abs(deltaY) < minSwipeDistance) return;
    if (deltaTime > maxSwipeTime && Math.abs(deltaY) < 150) return; // Slow swipe needs more distance
    
    if (deltaY > 0) {
      // Swiped UP - go to NEXT stream
      goToNext();
    } else {
      // Swiped DOWN - go to PREVIOUS stream
      goToPrevious();
    }
  }, [goToNext, goToPrevious]);

  return {
    streams,
    currentIndex,
    totalStreams: streams.length,
    hasNext: currentIndex < streams.length - 1 && currentIndex !== -1,
    hasPrevious: currentIndex > 0,
    isNavigating,
    goToNext,
    goToPrevious,
    handleTouchStart,
    handleTouchEnd,
  };
}

export default useLiveStreamSwipe;
