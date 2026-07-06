import React, { useState, Suspense } from 'react';
import { cn } from '@/lib/utils';
import Lottie from 'lottie-react';
import { normalizePublicMediaUrl } from '@/lib/cdnImage';
import { fetchLottieCached, lottieCacheGet } from '@/utils/lottieCache';
import { normalizeGiftMediaUrl } from '@/utils/giftMediaUrl';
import { getVapCompositeHint, isLikelyVapCompositeSize, markVapCompositeHint } from '@/utils/vapDetection';

// Use direct imports for instant rendering in admin and shop sections
import SVGAPlayer from './SVGAPlayer';
import SVGAPlayerWithAudio from './SVGAPlayerWithAudio';
import VAPPlayer from './VAPPlayer';

const StaticFrameFallback = ({ className }: { className?: string }) => (
  <div className={cn("bg-transparent", className)} aria-hidden="true" />
);

export type FrameType = 'svga' | 'lottie' | 'vap' | 'gif' | 'webp' | 'png' | 'mp4' | 'webm' | 'static';

interface UniversalFramePlayerProps {
  src: string;
  type?: FrameType;
  /** Pkg423 — VAP config (vapc.json) URL. Required when type='vap'. */
  configSrc?: string;
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
  
  const lowercaseUrl = url.toLowerCase();
  const urlWithoutParams = lowercaseUrl.split('?')[0].split('#')[0];
  
  if (urlWithoutParams.endsWith('.svga')) return 'svga';
  if (urlWithoutParams.endsWith('.json')) return 'lottie';
  if (urlWithoutParams.endsWith('.gif')) return 'gif';
  if (urlWithoutParams.endsWith('.webp')) return 'webp';
  if (urlWithoutParams.endsWith('.png')) return 'png';
  if (urlWithoutParams.endsWith('.mp4')) {
    if (lowercaseUrl.includes('vap') || lowercaseUrl.includes('_bmp') || lowercaseUrl.includes('file_vap_')) return 'vap';
    return 'mp4';
  }
  if (urlWithoutParams.endsWith('.webm')) return 'webm';
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
  configSrc,
  className,
  loop = true,
  autoPlay = true,
  muted = true, // Default muted for frame previews (admin panel)
  onLoad,
  onError,
}) => {
  const resolvedSrc = React.useMemo(() => normalizeGiftMediaUrl(src) || normalizePublicMediaUrl(src) || src, [src]);
  const initialFrameType = type || detectFrameType(resolvedSrc);
  const [lottieData, setLottieData] = useState<any>(initialFrameType === 'lottie' ? lottieCacheGet(resolvedSrc) : null);
  const [lottieLoading, setLottieLoading] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [autoDetectedVap, setAutoDetectedVap] = useState(() => getVapCompositeHint(resolvedSrc));
  
  const detectedFrameType = type || detectFrameType(resolvedSrc);
  const frameType = autoDetectedVap ? 'vap' : detectedFrameType;

  React.useEffect(() => {
    setAutoDetectedVap(getVapCompositeHint(resolvedSrc));
    setImageLoaded(false);
  }, [resolvedSrc, type]);

  // Load Lottie JSON data
  React.useEffect(() => {
    if (frameType === 'lottie' && resolvedSrc) {
      const cached = lottieCacheGet(resolvedSrc);
      if (cached) {
        setLottieData(cached);
        setLottieLoading(false);
        return;
      }
      setLottieLoading(true);
      fetchLottieCached(resolvedSrc)
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
  }, [resolvedSrc, frameType, onLoad, onError]);

  // SVGA Animation
  if (frameType === 'svga') {
    // Use SVGAPlayerWithAudio when sound is enabled
    if (!muted) {
      return (
        <Suspense fallback={<StaticFrameFallback className={className} />}>
          <SVGAPlayerWithAudio
            src={resolvedSrc}
            className={className}
            loop={loop}
            autoPlay={autoPlay}
            onLoad={onLoad}
            onError={onError}
          />
        </Suspense>
      );
    }
    return (
      <Suspense fallback={<StaticFrameFallback className={className} />}>
        <SVGAPlayer
          src={resolvedSrc}
          className={className}
          loop={loop}
          autoPlay={autoPlay}
          muted={muted}
          onLoad={onLoad}
          onError={onError}
        />
      </Suspense>
    );
  }

  // VAP Animation (Pkg423 — Tencent transparent video)
  if (frameType === 'vap') {
    return (
      <Suspense fallback={<StaticFrameFallback className={className} />}>
        <VAPPlayer
          src={resolvedSrc}
          configSrc={configSrc}
          className={className}
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
        <StaticFrameFallback className={className} />
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
            <div className="absolute inset-0 bg-transparent" aria-hidden="true" />
          </div>
        )}
        <video 
          ref={el => { if (el) { import('@/utils/videoNativeHardening').then(m => m.hardenVideoElementForNative(el, { muted: true })).catch(()=>{}); } }}
          src={resolvedSrc}
          autoPlay={autoPlay}
          loop={loop}
          muted
          playsInline
          className={cn(
            "w-full h-full object-contain pointer-events-none",
            !imageLoaded && "opacity-0"
          )}
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            if (type !== 'vap' && (detectedFrameType === 'mp4' || detectedFrameType === 'webm') && isLikelyVapCompositeSize(v.videoWidth, v.videoHeight)) {
              markVapCompositeHint(resolvedSrc, true);
              setAutoDetectedVap(true);
            }
          }}
          onLoadedData={() => {
            setImageLoaded(true);
            onLoad?.();
          }}
          onError={() => {
            console.error('[UniversalFramePlayer] Failed to load video:', resolvedSrc);
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
          <div className="absolute inset-0 bg-transparent" aria-hidden="true" />
        </div>
      )}
      <img loading="lazy" decoding="async" 
        src={resolvedSrc}
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
          console.error('[UniversalFramePlayer] Failed to load image:', resolvedSrc);
          onError?.(new Error('Failed to load image'));
        }}
      />
    </div>
  );
};

export default UniversalFramePlayer;
