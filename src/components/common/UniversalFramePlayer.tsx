import React, { useState, Suspense, lazy } from 'react';
import { cn } from '@/lib/utils';
import Lottie from 'lottie-react';

// Lazy load SVGA players for better performance
const SVGAPlayer = lazy(() => import('./SVGAPlayer'));
const SVGAPlayerWithAudio = lazy(() => import('./SVGAPlayerWithAudio'));

const getUrlPath = (url: string) => url.split('?')[0].split('#')[0].toLowerCase();

export type FrameType = 'svga' | 'lottie' | 'gif' | 'webp' | 'png' | 'mp4' | 'webm' | 'static';

interface UniversalFramePlayerProps {
  src: string;
  type?: FrameType;
  className?: string;
  loop?: boolean;
  autoPlay?: boolean;
  muted?: boolean; // Mute audio - default true for frames (admin previews)
  onLoad?: () => void;
  onError?: (error: Error) => void;
}

/**
 * Detects frame type from URL
 */
const detectFrameType = (url: string): FrameType => {
  if (!url) return 'static';
  
  const lowercaseUrl = getUrlPath(url);
  
  if (lowercaseUrl.endsWith('.svga')) return 'svga';
  if (lowercaseUrl.endsWith('.json')) return 'lottie';
  if (lowercaseUrl.endsWith('.gif')) return 'gif';
  if (lowercaseUrl.endsWith('.webp')) return 'webp';
  if (lowercaseUrl.endsWith('.png')) return 'png';
  if (lowercaseUrl.endsWith('.mp4')) return 'mp4';
  if (lowercaseUrl.endsWith('.webm')) return 'webm';
  if (lowercaseUrl.includes('lottie') || lowercaseUrl.includes('bodymovin')) return 'lottie';
  
  return 'static';
};

/**
 * Universal Frame Player Component
 * Supports SVGA, Lottie JSON, GIF, WebP, PNG formats
 * Used for premium avatar frames in voice/video chat apps
 */
const UniversalFramePlayer: React.FC<UniversalFramePlayerProps> = ({
  src,
  type,
  className,
  loop = true,
  autoPlay = true,
  muted = true, // Default muted for frame previews (admin panel)
  onLoad,
  onError,
}) => {
  const [lottieData, setLottieData] = useState<any>(null);
  const [lottieLoading, setLottieLoading] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  
  const frameType = type || detectFrameType(src);

  // Load Lottie JSON data
  React.useEffect(() => {
    if (frameType === 'lottie' && src) {
      setLottieLoading(true);
      fetch(src)
        .then(res => res.json())
        .then(data => {
          setLottieData(data);
          setLottieLoading(false);
          onLoad?.();
        })
        .catch(err => {
          console.error('[UniversalFramePlayer] Failed to load Lottie:', err);
          setLottieLoading(false);
          onError?.(err);
        });
    }
  }, [src, frameType, onLoad, onError]);

  // SVGA Animation
  if (frameType === 'svga') {
    // Use SVGAPlayerWithAudio when sound is enabled
    if (!muted) {
      return (
        <Suspense fallback={
          <div className={cn("flex items-center justify-center", className)}>
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        }>
          <SVGAPlayerWithAudio
            src={src}
            className={cn("w-full h-full [&_canvas]:!w-full [&_canvas]:!h-full", className)}
            loop={loop}
            autoPlay={autoPlay}
            onLoad={onLoad}
            onError={onError}
          />
        </Suspense>
      );
    }
    return (
      <Suspense fallback={
        <div className={cn("flex items-center justify-center", className)}>
          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      }>
        <SVGAPlayer
          src={src}
          className={cn("w-full h-full [&_canvas]:!w-full [&_canvas]:!h-full", className)}
          loop={loop}
          autoPlay={autoPlay}
          muted={muted}
          onLoad={onLoad}
          onError={onError}
        />
      </Suspense>
    );
  }

  // Lottie Animation
  if (frameType === 'lottie') {
    if (lottieLoading) {
      return (
        <div className={cn("flex items-center justify-center", className)}>
          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      );
    }

    if (lottieData) {
      return (
        <Lottie
          animationData={lottieData}
          loop={loop}
          autoplay={autoPlay}
          className={className}
          onComplete={() => !loop && onLoad?.()}
        />
      );
    }

    return null;
  }

  // Video (MP4/WebM)
  if (frameType === 'mp4' || frameType === 'webm') {
    return (
      <div className={cn("relative", className)}>
        {!imageLoaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        )}
        <video
          src={src}
          autoPlay={autoPlay}
          loop={loop}
          muted
          playsInline
          className={cn(
            "w-full h-full object-contain pointer-events-none",
            !imageLoaded && "opacity-0"
          )}
          onLoadedData={() => {
            setImageLoaded(true);
            onLoad?.();
          }}
          onError={() => {
            console.error('[UniversalFramePlayer] Failed to load video:', src);
            onError?.(new Error('Failed to load video'));
          }}
        />
      </div>
    );
  }

  // GIF / WebP / PNG (Image-based animations)
  // Note: For best results, use frames with transparent backgrounds (PNG/WebP with alpha, or SVGA)
  // GIF frames with black backgrounds will display the black - this is a limitation of the GIF format
  return (
    <div className={cn("relative", className)}>
      {!imageLoaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      )}
      <img
        src={src}
        alt="Avatar Frame"
        className={cn(
          "w-full h-full object-contain pointer-events-none",
          !imageLoaded && "opacity-0"
        )}
        onLoad={() => {
          setImageLoaded(true);
          onLoad?.();
        }}
        onError={(e) => {
          console.error('[UniversalFramePlayer] Failed to load image:', src);
          onError?.(new Error('Failed to load image'));
        }}
      />
    </div>
  );
};

export default UniversalFramePlayer;
