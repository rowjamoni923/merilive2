import React, { useRef, useEffect, useState, forwardRef, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { loadSVGA, stripAudio, preloadSVGA as preloadSVGAFn } from '@/utils/svgaLoader';
import { svgaCacheClear } from '@/utils/svgaCache';
import { getSVGAModule } from '@/utils/svgaPrewarm';

interface SVGAPlayerProps {
  src: string;
  className?: string;
  style?: React.CSSProperties;
  loop?: boolean;
  autoPlay?: boolean;
  muted?: boolean;
  onLoad?: () => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
}

const SVGAPlayerInner = forwardRef<HTMLDivElement, SVGAPlayerProps>(({
  src,
  className,
  style,
  loop = true,
  autoPlay = true,
  muted = true,
  onLoad,
  onError,
  onComplete,
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const mountedRef = useRef(true);
  const completedRef = useRef(false);
  const animationStartedRef = useRef(false);
  
  const [ready, setReady] = useState(false);
  const [hasError, setHasError] = useState(false);

  const handleComplete = useCallback(() => {
    if (!mountedRef.current || completedRef.current) return;
    completedRef.current = true;
    
    if (playerRef.current) {
      try {
        playerRef.current.stopAnimation();
        playerRef.current.clear();
        playerRef.current = null;
      } catch (e) {}
    }
    
    onComplete?.();
  }, [src, onComplete]);

  useEffect(() => {
    if (animationStartedRef.current) return;
    animationStartedRef.current = true;
    mountedRef.current = true;
    completedRef.current = false;
    
    if (!src || !containerRef.current) return;

    let player: any = null;

    const loadAndPlay = async () => {
      try {
        const SVGA = await getSVGAModule();
        if (!mountedRef.current || !containerRef.current) return;

        player = new SVGA.Player(containerRef.current);
        playerRef.current = player;
        
        player.loops = loop ? 0 : 1;
        player.clearsAfterStop = true;
        
        if (muted) {
          player.isMuted = true;
          player.onAudioStart = () => {};
          player.onAudioEnd = () => {};
        }

        // Use shared robust loader (3 retries + cache + dedup)
        const videoItem = await loadSVGA(src);
        if (!mountedRef.current) return;

        const frames = videoItem?.frames || 0;
        const fps = videoItem?.FPS || 24;
        const exactDuration = frames > 0 ? (frames / fps) * 1000 : 0;

        // Strip audio for muted mode (never mutates cache)
        const videoItemToUse = muted ? stripAudio(videoItem) : videoItem;

        player.setVideoItem(videoItemToUse);
        setReady(true);
        onLoad?.();

        if (autoPlay) {
          player.startAnimation();
        }

        if (!loop) {
          player.onFinished(() => {
            if (mountedRef.current && !completedRef.current) {
              handleComplete();
            }
          });

          // Safety timeout as fallback
          if (exactDuration > 0) {
            const safetyBuffer = Math.min(2000, exactDuration * 0.2);
            setTimeout(() => {
              if (mountedRef.current && !completedRef.current) {
                handleComplete();
              }
            }, exactDuration + safetyBuffer);
          }
        }
        
      } catch (err) {
        console.error('[SVGAPlayer] ❌ Error:', src.split('/').pop(), err);
        if (mountedRef.current) {
          setHasError(true);
          onError?.(err instanceof Error ? err : new Error('SVGA load failed'));
        }
      }
    };

    loadAndPlay();

    return () => {
      mountedRef.current = false;
      if (playerRef.current) {
        try {
          playerRef.current.stopAnimation();
          playerRef.current.clear();
        } catch (e) {}
        playerRef.current = null;
      }
    };
  }, [src]);

  if (hasError) {
    return (
      <div className={cn("rounded-full bg-gradient-to-br from-purple-600/30 to-pink-600/30", className)} />
    );
  }

  return (
    <div 
      ref={(node) => {
        (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      }}
      className={cn("relative overflow-hidden", className)}
      style={{ 
        opacity: ready ? 1 : 0,
        transition: 'opacity 0.1s ease-out',
        ...style,
      }}
    />
  );
});

SVGAPlayerInner.displayName = 'SVGAPlayerInner';

export const SVGAPlayer = SVGAPlayerInner;
SVGAPlayer.displayName = 'SVGAPlayer';

export const preloadSVGA = preloadSVGAFn;
export const clearSVGACache = svgaCacheClear;

export default SVGAPlayer;
