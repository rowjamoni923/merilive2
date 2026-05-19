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
  showControls = false,
  fallbackEmoji = '🎁',
}) => {
  const [lottieData, setLottieData] = useState<any>(null);
  const [lottieLoading, setLottieLoading] = useState(false);
  const [mediaLoaded, setMediaLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  const animationType = type || detectAnimationType(src);

  // Load Lottie JSON data
  useEffect(() => {
    if (animationType === 'lottie' && src) {
      setLottieLoading(true);
      setHasError(false);
      fetch(src)
        .then(res => {
          if (!res.ok) throw new Error('Failed to fetch Lottie');
          return res.json();
        })
        .then(data => {
          setLottieData(data);
          setLottieLoading(false);
          onLoad?.();
        })
        .catch(err => {
          console.error('[UniversalAnimationPlayer] Failed to load Lottie:', err);
          setLottieLoading(false);
          setHasError(true);
          onError?.(err);
        });
    }
  }, [src, animationType, onLoad, onError]);

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
    <div className={cn("flex items-center justify-center", className)}>
      <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
    </div>
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
            onComplete={onComplete}
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
          onComplete={onComplete}
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
          onComplete={() => !loop && onComplete?.()}
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
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
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
          onEnded={() => !loop && onComplete?.()}
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
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
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
