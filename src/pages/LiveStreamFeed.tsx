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
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ChevronUp, ChevronDown, Eye, Loader2, Radio } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
    let cancelled = false;
    const fetchStreams = async () => {
      try {
        const { data: liveData, error } = await supabase
          .from('live_streams')
          .select('id, title, host_id, viewer_count, thumbnail_url')
          .eq('is_active', true)
          .order('viewer_count', { ascending: false })
          .limit(50);

        if (error) throw error;
        if (cancelled) return;

        const hostIds = Array.from(new Set((liveData || []).map((s: any) => s.host_id).filter(Boolean)));
        const hostMap = new Map<string, any>();
        if (hostIds.length > 0) {
          const { data: hosts } = await supabase
            .from('profiles_public')
            .select('id, display_name, avatar_url, user_level')
            .in('id', hostIds);
          (hosts || []).forEach((h: any) => hostMap.set(h.id, h));
        }

        if (cancelled) return;
        const formattedStreams: LiveStream[] = (liveData || []).map((s: any) => ({
          id: s.id,
          title: s.title,
          host_id: s.host_id,
          viewer_count: s.viewer_count || 0,
          thumbnail_url: s.thumbnail_url,
          host: hostMap.get(s.host_id),
        }));

        setStreams(formattedStreams);

        if (currentStreamId) {
          const idx = formattedStreams.findIndex(s => s.id === currentStreamId);
          if (idx !== -1) setCurrentIndex(idx);
        }
      } catch (e) {
        console.error('LiveStreamFeed fetch error:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchStreams();
    return () => { cancelled = true; };
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
      <div className="fixed inset-0 bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  const currentStream = streams[currentIndex] ?? streams[0];

  if (!currentStream) {
    return (
      <div className="fixed inset-0 bg-background flex flex-col items-center justify-center px-6 text-center">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4 border border-border">
          <Radio className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-lg font-bold text-display mb-2">No Live Streams</h1>
        <p className="text-sm text-muted-pro max-w-[240px]">Live hosts will appear here as soon as they start streaming.</p>
        <Button className="mt-5" onClick={() => navigate('/')}>Back Home</Button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="fixed inset-0 bg-background overflow-hidden"
    >
      <div className="relative h-full w-full">
        <img
          src={currentStream.thumbnail_url || currentStream.host?.avatar_url || "/placeholder.svg"}
          alt={currentStream.title || currentStream.host?.display_name || "Live stream"}
          className="h-full w-full object-cover"
          onClick={() => navigate(`/live/${currentStream.id}`)}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-foreground/85 via-foreground/20 to-foreground/35" />

        <div className="absolute left-4 right-20 bottom-[calc(var(--content-bottom-padding)+1rem)]">
          <div className="flex items-center gap-2 mb-3">
            <Avatar className="h-10 w-10 border border-white/40">
              <AvatarImage src={currentStream.host?.avatar_url || undefined} />
              <AvatarFallback className="bg-gradient-primary text-on-dark">
                {(currentStream.host?.display_name || "L").charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-on-dark font-bold truncate">{currentStream.host?.display_name || "Live Host"}</p>
              <div className="flex items-center gap-1.5 text-on-dark-muted text-xs">
                <Eye className="w-3.5 h-3.5" />
                <span>{currentStream.viewer_count} viewers</span>
              </div>
            </div>
          </div>
          <h2 className="text-on-dark text-base font-bold line-clamp-2">{currentStream.title || "Live stream"}</h2>
          <Button className="mt-4 bg-gradient-primary text-on-dark border-0" onClick={() => navigate(`/live/${currentStream.id}`)}>
            Enter Live
          </Button>
        </div>

        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-3">
          <button
            aria-label="Previous stream"
            disabled={currentIndex <= 0}
            onClick={goToPrevious}
            className={cn("h-11 w-11 rounded-full bg-foreground/45 border border-primary-foreground/20 flex items-center justify-center text-on-dark backdrop-blur-sm", currentIndex <= 0 && "opacity-40")}
          >
            <ChevronUp className="w-6 h-6" />
          </button>
          <button
            aria-label="Next stream"
            disabled={currentIndex >= streams.length - 1}
            onClick={goToNext}
            className={cn("h-11 w-11 rounded-full bg-foreground/45 border border-primary-foreground/20 flex items-center justify-center text-on-dark backdrop-blur-sm", currentIndex >= streams.length - 1 && "opacity-40")}
          >
            <ChevronDown className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
}
