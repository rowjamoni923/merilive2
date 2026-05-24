import React, { useState, Suspense, lazy, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import Lottie from 'lottie-react';
import { logAnimationCompletion, type AnimationCompletionSource } from '@/utils/animationDebug';

// Lazy load animation players for better performance
const SVGAPlayer = lazy(() => import('./SVGAPlayer'));
const SVGAPlayerWithAudio = lazy(() => import('./SVGAPlayerWithAudio'));
const VAPPlayer = lazy(() => import('./VAPPlayer'));

export type AnimationType = 'svga' | 'lottie' | 'vap' | 'gif' | 'webp' | 'png' | 'mp4' | 'webm' | 'static';

interface UniversalAnimationPlayerProps {
  src: string;
  type?: AnimationType;
  className?: string;
  loop?: boolean;
  autoPlay?: boolean;
  muted?: boolean;
  onLoad?: () => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
  /** Provenance-aware onComplete callback ('native' for true end-of-animation, 'safety-timer' for SVGA fallback). */
  onCompleteDebug?: (source: AnimationCompletionSource) => void;
  showControls?: boolean;
  fallbackEmoji?: string;
}

/**
 * Detects animation type from URL
 * Supports: SVGA, Lottie, VAP, GIF, WebP, PNG, MP4, WebM
 */
const detectAnimationType = (url: string): AnimationType => {
  if (!url) return 'static';
  
  const lowercaseUrl = url.toLowerCase();
  
  // Remove query params for extension detection
  const urlWithoutParams = lowercaseUrl.split('?')[0];
  
  // Check file extensions
  if (urlWithoutParams.endsWith('.svga')) return 'svga';
  if (urlWithoutParams.endsWith('.json')) {
    // Check if it's a VAP config or Lottie
    if (lowercaseUrl.includes('vap') || lowercaseUrl.includes('_bmp')) return 'vap';
    return 'lottie';
  }
  if (urlWithoutParams.endsWith('.gif')) return 'gif';
  if (urlWithoutParams.endsWith('.webp')) return 'webp';
  if (urlWithoutParams.endsWith('.png')) return 'png';
  if (urlWithoutParams.endsWith('.jpg') || urlWithoutParams.endsWith('.jpeg')) return 'static';
  if (urlWithoutParams.endsWith('.mp4')) {
    // Check if it's a VAP video (has _vap or vap_ in name)
    if (lowercaseUrl.includes('vap') || lowercaseUrl.includes('_bmp')) return 'vap';
    return 'mp4';
  }
  if (urlWithoutParams.endsWith('.webm')) return 'webm';
  if (lowercaseUrl.includes('lottie') || lowercaseUrl.includes('bodymovin')) return 'lottie';
  
  // Check for common CDN patterns
  if (lowercaseUrl.includes('imgur.com') && urlWithoutParams.endsWith('.gif')) return 'gif';
  if (lowercaseUrl.includes('giphy.com')) return 'gif';
  
  return 'static';
};

/**
 * Universal Animation Player Component
 * Supports SVGA, VAP, Lottie JSON, GIF, WebP, PNG, MP4, WebM formats
 * Used for gifts, entrance animations, avatar frames, and special effects
 */
const UniversalAnimationPlayer: React.FC<UniversalAnimationPlayerProps> = ({
  src,
  type,
  className,
  loop = true,
  autoPlay = true,
  muted = true,
  onLoad,
  onError,
  onComplete,
  onCompleteDebug,
  showControls = false,
  fallbackEmoji = '🎁',
}) => {
  const [lottieData, setLottieData] = useState<any>(null);
  const [lottieLoading, setLottieLoading] = useState(false);
  const [mediaLoaded, setMediaLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  const animationType = type || detectAnimationType(src);
  const startTimeRef = useRef<number>(Date.now());
  const completedRef = useRef(false);
  useEffect(() => { startTimeRef.current = Date.now(); completedRef.current = false; }, [src, loop]);

  const fireComplete = (source: AnimationCompletionSource) => {
    if (completedRef.current) return;
    completedRef.current = true;
    logAnimationCompletion('UniversalAnimationPlayer', source, {
      elapsed: Date.now() - startTimeRef.current,
      src,
    });
    onCompleteDebug?.(source);
    onComplete?.();
  };

  // Load Lottie JSON data
  // Pkg306 audit: drop onLoad/onError from deps — unstable callbacks made
  // the fetch retrigger on every parent render, hammering Lottie URLs.
  const onLoadRef = useRef(onLoad);
  const onErrorRef = useRef(onError);
  useEffect(() => { onLoadRef.current = onLoad; onErrorRef.current = onError; }, [onLoad, onError]);
  useEffect(() => {
    if (animationType === 'lottie' && src) {
      let cancelled = false;
      setLottieLoading(true);
      setHasError(false);
      fetch(src)
        .then(res => {
          if (!res.ok) throw new Error('Failed to fetch Lottie');
          return res.json();
        })
        .then(data => {
          if (cancelled) return;
          setLottieData(data);
          setLottieLoading(false);
          onLoadRef.current?.();
        })
        .catch(err => {
          if (cancelled) return;
          console.error('[UniversalAnimationPlayer] Failed to load Lottie:', err);
          setLottieLoading(false);
          setHasError(true);
          onErrorRef.current?.(err);
        });
      return () => { cancelled = true; };
    }
  }, [src, animationType]);

  // Error fallback
  if (hasError) {
    return (
      <div className={cn("flex items-center justify-center text-4xl", className)}>
        {fallbackEmoji}
      </div>
    );
  }

  // Loading spinner component
  const LoadingSpinner = () => (
    <div className={cn("bg-transparent", className)} aria-hidden="true" />
  );

  // SVGA Animation — use SVGAPlayerWithAudio when sound is needed
  if (animationType === 'svga') {
    if (!muted) {
      return (
        <Suspense fallback={<LoadingSpinner />}>
          <SVGAPlayerWithAudio
            src={src}
            className={className}
            loop={loop}
            autoPlay={autoPlay}
            onLoad={onLoad}
            onComplete={() => fireComplete('native')}
            onCompleteDebug={onCompleteDebug}
            onError={(err) => {
              setHasError(true);
              onError?.(err);
            }}
          />
        </Suspense>
      );
    }
    return (
      <Suspense fallback={<LoadingSpinner />}>
        <SVGAPlayer
          src={src}
          className={className}
          loop={loop}
          autoPlay={autoPlay}
          muted={muted}
          onLoad={onLoad}
          onComplete={() => fireComplete('native')}
          onError={(err) => {
            setHasError(true);
            onError?.(err);
          }}
        />
      </Suspense>
    );
  }

  // VAP Animation (Transparent Video)
  if (animationType === 'vap') {
    return (
      <Suspense fallback={<LoadingSpinner />}>
        <VAPPlayer
          src={src}
          className={className}
          loop={loop}
          autoPlay={autoPlay}
          muted={muted}
          onLoad={onLoad}
          onComplete={() => fireComplete('native')}
          onError={(err) => {
            setHasError(true);
            onError?.(err);
          }}
        />
      </Suspense>
    );
  }

  // Lottie Animation
  if (animationType === 'lottie') {
    if (lottieLoading) return <LoadingSpinner />;

    if (lottieData) {
      return (
        <Lottie
          animationData={lottieData}
          loop={loop}
          autoplay={autoPlay}
          className={className}
          onComplete={() => !loop && fireComplete('native')}
          onDOMLoaded={onLoad}
        />
      );
    }

    return <LoadingSpinner />;
  }

  // Video (MP4/WebM)
  if (animationType === 'mp4' || animationType === 'webm') {
    return (
      <div className={cn("relative", className)}>
        {!mediaLoaded && (
          <div className="absolute inset-0 bg-transparent" aria-hidden="true" />
        )}
        <video
          ref={videoRef}
          src={src}
          autoPlay={autoPlay}
          loop={loop}
          muted={muted}
          playsInline
          controls={showControls}
          className={cn(
            "w-full h-full object-contain",
            !mediaLoaded && "opacity-0"
          )}
          onLoadedData={() => {
            setMediaLoaded(true);
            onLoad?.();
          }}
          onEnded={() => !loop && fireComplete('native')}
          onError={() => {
            setHasError(true);
            onError?.(new Error('Video load failed'));
          }}
        />
      </div>
    );
  }

  // GIF / WebP / PNG (Image-based animations)
  return (
    <div className={cn("relative", className)}>
      {!mediaLoaded && (
        <div className="absolute inset-0 bg-transparent" aria-hidden="true" />
      )}
      <img
        src={src}
        alt="Animation"
        className={cn(
          "w-full h-full object-contain pointer-events-none",
          !mediaLoaded && "opacity-0"
        )}
        onLoad={() => {
          setMediaLoaded(true);
          onLoad?.();
        }}
        onError={() => {
          setHasError(true);
          onError?.(new Error('Image load failed'));
        }}
      />
    </div>
  );
};

export default UniversalAnimationPlayer;
export { detectAnimationType };
