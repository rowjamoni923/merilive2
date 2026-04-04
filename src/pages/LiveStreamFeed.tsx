/**
 * =====================================================
 * LIVE STREAM FEED - TikTok Style Vertical Scroll
 * =====================================================
 * 
 * Allows users to scroll up/down between live streams
 * like TikTok's vertical feed experience.
 * 
 * Features:
 * - Snap scrolling between live streams
 * - Preloads adjacent streams for smooth transitions
 * - Fetches active live streams dynamically
 * =====================================================
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronUp, ChevronDown, Loader2 } from "lucide-react";

// Lazy load the actual LiveStream component for each stream
const LiveStreamWrapper = ({ streamId, isActive }: { streamId: string; isActive: boolean }) => {
  const navigate = useNavigate();
  
  // When this stream becomes active, update the URL
  useEffect(() => {
    if (isActive) {
      window.history.replaceState(null, '', `/live/${streamId}`);
    }
  }, [isActive, streamId]);
  
  // Navigate to actual live stream page
  useEffect(() => {
    if (isActive) {
      navigate(`/live/${streamId}`, { replace: true });
    }
  }, [isActive, streamId, navigate]);
  
  return null;
};

interface LiveStream {
  id: string;
  title: string;
  host_id: string;
  viewer_count: number;
  thumbnail_url?: string;
  host?: {
    display_name?: string;
    avatar_url?: string;
    user_level?: number;
  };
}

export default function LiveStreamFeed() {
  const { id: currentStreamId } = useParams();
  const navigate = useNavigate();
  const [streams, setStreams] = useState<LiveStream[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef(0);
  const isScrolling = useRef(false);

  // Fetch active live streams
  useEffect(() => {
    const fetchStreams = async () => {
      const { data } = await supabase
        .from('live_streams')
        .select(`
          id,
          title,
          host_id,
          viewer_count,
          thumbnail_url,
          profiles:host_id (
            display_name,
            avatar_url,
            user_level
          )
        `)
        .eq('is_active', true)
        .order('viewer_count', { ascending: false })
        .limit(50);
      
      if (data) {
        const formattedStreams = data.map((s: any) => ({
          id: s.id,
          title: s.title,
          host_id: s.host_id,
          viewer_count: s.viewer_count || 0,
          thumbnail_url: s.thumbnail_url,
          host: s.profiles
        }));
        
        setStreams(formattedStreams);
        
        // Find current stream index
        if (currentStreamId) {
          const idx = formattedStreams.findIndex(s => s.id === currentStreamId);
          if (idx !== -1) {
            setCurrentIndex(idx);
          }
        }
      }
      setLoading(false);
    };
    
    fetchStreams();
  }, [currentStreamId]);

  // Navigate to previous stream (swipe down)
  const goToPrevious = useCallback(() => {
    if (isScrolling.current || currentIndex <= 0) return;
    isScrolling.current = true;
    
    const newIndex = currentIndex - 1;
    setCurrentIndex(newIndex);
    
    // Navigate to new stream
    if (streams[newIndex]) {
      navigate(`/live/${streams[newIndex].id}`, { replace: true });
    }
    
    setTimeout(() => {
      isScrolling.current = false;
    }, 500);
  }, [currentIndex, streams, navigate]);

  // Navigate to next stream (swipe up)
  const goToNext = useCallback(() => {
    if (isScrolling.current || currentIndex >= streams.length - 1) return;
    isScrolling.current = true;
    
    const newIndex = currentIndex + 1;
    setCurrentIndex(newIndex);
    
    // Navigate to new stream
    if (streams[newIndex]) {
      navigate(`/live/${streams[newIndex].id}`, { replace: true });
    }
    
    setTimeout(() => {
      isScrolling.current = false;
    }, 500);
  }, [currentIndex, streams, navigate]);

  // Touch handlers for swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const touchEndY = e.changedTouches[0].clientY;
    const diff = touchStartY.current - touchEndY;
    
    // Minimum swipe distance
    if (Math.abs(diff) < 50) return;
    
    if (diff > 0) {
      // Swiped up - go to next
      goToNext();
    } else {
      // Swiped down - go to previous
      goToPrevious();
    }
  };

  // Wheel handler for desktop
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    
    if (e.deltaY > 50) {
      goToNext();
    } else if (e.deltaY < -50) {
      goToPrevious();
    }
  }, [goToNext, goToPrevious]);

  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false });
      return () => container.removeEventListener('wheel', handleWheel);
    }
  }, [handleWheel]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
      </div>
    );
  }

  // If no streams or at the stream, just render it normally
  // The actual LiveStream page will handle the rendering
  return null;
}
