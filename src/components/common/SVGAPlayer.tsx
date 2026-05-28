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
  const completionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [ready, setReady] = useState(false);
  const [hasError, setHasError] = useState(false);

  // Stable refs for callbacks — prevents parent re-renders from re-running the
  // load effect (which would rebuild the SVGA player and replay it from frame 0).
  const onLoadRef = useRef(onLoad);
  const onErrorRef = useRef(onError);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onLoadRef.current = onLoad; }, [onLoad]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  const handleComplete = useCallback(() => {
    if (!mountedRef.current || completedRef.current) return;
    completedRef.current = true;

    if (completionTimerRef.current) {
      clearTimeout(completionTimerRef.current);
      completionTimerRef.current = null;
    }

    if (playerRef.current) {
      try {
        playerRef.current.stopAnimation();
        playerRef.current.clear();
        playerRef.current = null;
      } catch (e) {}
    }

    onCompleteRef.current?.();
  }, []);

  const resumeLoopingAnimation = useCallback(() => {
    if (!loop || !autoPlay || !mountedRef.current || !playerRef.current) return;
    try {
      playerRef.current.startAnimation();
    } catch (e) {}
  }, [loop, autoPlay]);


  useEffect(() => {
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
        player.clearsAfterStop = !loop;
        
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
        onLoadRef.current?.();

        if (!loop) {
          player.onFinished(() => {
            if (mountedRef.current && !completedRef.current) {
              handleComplete();
            }
          });
        } else {
          player.onFinished(() => {
            requestAnimationFrame(resumeLoopingAnimation);
          });
        }

        if (autoPlay) {
          player.startAnimation();
          if (!loop && exactDuration > 0) {
            completionTimerRef.current = setTimeout(() => {
              if (mountedRef.current && !completedRef.current) {
                handleComplete();
              }
            }, Math.ceil(exactDuration));
          }
        }
        
      } catch (err) {
        console.error('[SVGAPlayer] ❌ Error:', src.split('/').pop(), err);
        if (mountedRef.current) {
          setHasError(true);
          onErrorRef.current?.(err instanceof Error ? err : new Error('SVGA load failed'));
        }
      }
    };

    loadAndPlay();

    const handleResume = () => resumeLoopingAnimation();
    document.addEventListener('visibilitychange', handleResume);
    window.addEventListener('focus', handleResume);

    return () => {
      mountedRef.current = false;
      document.removeEventListener('visibilitychange', handleResume);
      window.removeEventListener('focus', handleResume);
      if (completionTimerRef.current) {
        clearTimeout(completionTimerRef.current);
        completionTimerRef.current = null;
      }
      if (playerRef.current) {
        try {
          playerRef.current.stopAnimation();
          playerRef.current.clear();
        } catch (e) {}
        playerRef.current = null;
      }
    };
    // CRITICAL: only re-run for actual media inputs. Callback identity changes
    // (parent re-renders) must NEVER tear down + rebuild the player — that was
    // causing the same SVGA to replay over and over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, loop, autoPlay, muted]);


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
