import React, { useState, Suspense, lazy, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import Lottie from 'lottie-react';
import { logAnimationCompletion, type AnimationCompletionSource } from '@/utils/animationDebug';
import { fetchLottieCached, lottieCacheGet } from '@/utils/lottieCache';
import { normalizePublicMediaUrl } from '@/lib/cdnImage';
import { normalizeGiftMediaUrl } from '@/utils/giftMediaUrl';
import NativeSVGA, { isNativeSVGAAvailable } from '@/plugins/NativeSVGA';
import { getVapCompositeHint, isLikelyVapCompositeSize, markVapCompositeHint } from '@/utils/vapDetection';
import { detectProfessionalAnimationFormat } from '@/utils/animationFormat';

// Lazy load animation players for better performance
const SVGAPlayer = lazy(() => import('./SVGAPlayer'));
const SVGAPlayerWithAudio = lazy(() => import('./SVGAPlayerWithAudio'));
const VAPPlayer = lazy(() => import('./VAPPlayer'));
const PAGPlayer = lazy(() => import('./PAGPlayer'));

export type AnimationType = 'svga' | 'lottie' | 'vap' | 'pag' | 'gif' | 'webp' | 'png' | 'mp4' | 'webm' | 'static';

interface UniversalAnimationPlayerProps {
  src: string;
  type?: AnimationType;
  /** Pkg423 — VAP config (vapc.json) URL. Required when type='vap'. */
  configSrc?: string;
  className?: string;
  loop?: boolean;
  autoPlay?: boolean;
  muted?: boolean;
  volume?: number;
  onLoad?: () => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
  /** Provenance-aware onComplete callback ('native' for true end-of-animation, 'safety-timer' for SVGA fallback). */
  onCompleteDebug?: (source: AnimationCompletionSource) => void;
  showControls?: boolean;
  fallbackEmoji?: string;
  /**
   * Pkg425 — Opt-in native Android SVGA acceleration.
   * When true + SVGA + Capacitor Android + APK ≥ Pkg425 build, renders via
   * native `SVGAImageView` overlay above the WebView (~30% smoother).
   * Falls back to web `SVGAPlayer` automatically on any other platform.
   * Use only for full-screen contexts (gift / entry overlays).
   */
  preferNative?: boolean;
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
  if (urlWithoutParams.endsWith('.pag')) return 'pag';
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
    if (lowercaseUrl.includes('vap') || lowercaseUrl.includes('_bmp') || lowercaseUrl.includes('file_vap_')) return 'vap';
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
  configSrc,
  className,
  loop = true,
  autoPlay = true,
  muted = false,
  volume = 0.8, // Increased default volume for professional feel
  onLoad,
  onError,
  onComplete,
  onCompleteDebug,
  showControls = false,
  fallbackEmoji = '🎁',
  preferNative = false,
}) => {
  const resolvedSrc = React.useMemo(() => normalizeGiftMediaUrl(src) || normalizePublicMediaUrl(src) || src, [src]);
  // Synchronously seed Lottie state from cache so cached gifts paint on first
  // render (no loading spinner flash, no double-paint).
  const initialType = type || detectProfessionalAnimationFormat(resolvedSrc) || detectAnimationType(resolvedSrc);
  const initialLottie = initialType === 'lottie' ? lottieCacheGet(resolvedSrc) : null;
  const [lottieData, setLottieData] = useState<any>(initialLottie);
  const [lottieLoading, setLottieLoading] = useState(false);
  const [mediaLoaded, setMediaLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  // Pkg-fix: auto-detect side-by-side VAP from raw .mp4 metadata when the
  // admin forgot to set animation_format='vap'. Legacy gifts uploaded before
  // the AnimationUploader (e.g. the "hi" carriage) have NULL format in DB —
  // without this probe they render as a plain video showing both RGB and
  // Alpha halves.
  const [autoDetectedVap, setAutoDetectedVap] = useState(() => getVapCompositeHint(resolvedSrc));
  const videoRef = useRef<HTMLVideoElement>(null);

  const detectedType = type || detectProfessionalAnimationFormat(resolvedSrc) || detectAnimationType(resolvedSrc);
  const animationType: AnimationType = autoDetectedVap ? 'vap' : detectedType;
  const startTimeRef = useRef<number>(Date.now());
  const completedRef = useRef(false);
  useEffect(() => {
    startTimeRef.current = Date.now();
    completedRef.current = false;
    setAutoDetectedVap(getVapCompositeHint(resolvedSrc));
  }, [resolvedSrc, loop]);

  const fireComplete = (source: AnimationCompletionSource) => {
    if (completedRef.current) return;
    completedRef.current = true;
    logAnimationCompletion('UniversalAnimationPlayer', source, {
      elapsed: Date.now() - startTimeRef.current,
      src: resolvedSrc,
    });
    onCompleteDebug?.(source);
    onComplete?.();
  };

  // Load Lottie JSON data — Pkg C: in-memory cache so each gift is parsed once
  // Pkg306 audit: drop onLoad/onError from deps — unstable callbacks made
  // the fetch retrigger on every parent render, hammering Lottie URLs.
  const onLoadRef = useRef(onLoad);
  const onErrorRef = useRef(onError);
  useEffect(() => { onLoadRef.current = onLoad; onErrorRef.current = onError; }, [onLoad, onError]);
  useEffect(() => {
    if (animationType !== 'lottie' || !resolvedSrc) return;
    const cached = lottieCacheGet(resolvedSrc);
    if (cached) {
      setLottieData(cached);
      setLottieLoading(false);
      // Fire onLoad on next tick so consumers can rely on async semantics
      const t = setTimeout(() => onLoadRef.current?.(), 0);
      return () => clearTimeout(t);
    }
    const ac = new AbortController();
    setLottieLoading(true);
    setHasError(false);
    fetchLottieCached(resolvedSrc, ac.signal)
      .then(data => {
        if (ac.signal.aborted) return;
        setLottieData(data);
        setLottieLoading(false);
        onLoadRef.current?.();
      })
      .catch(err => {
        if (ac.signal.aborted) return;
        console.error('[UniversalAnimationPlayer] Failed to load Lottie:', err);
        setLottieLoading(false);
        setHasError(true);
        onErrorRef.current?.(err as Error);
      });
    return () => ac.abort();
  }, [resolvedSrc, animationType]);

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
    // Pkg425 — Native Android SVGA overlay when opted-in and available.
    // Web SVGAPlayer remains the visual fallback so layout never collapses.
    if (preferNative && muted) {
      return (
        <NativeSVGAOverlay
          src={resolvedSrc}
          loop={loop}
          onComplete={() => fireComplete('native')}
          onError={(err) => onError?.(err)}
          fallback={
            <Suspense fallback={<LoadingSpinner />}>
              <SVGAPlayer
                src={resolvedSrc}
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
          }
        />
      );
    }
    if (!muted) {
      return (
        <Suspense fallback={<LoadingSpinner />}>
          <SVGAPlayerWithAudio
            src={resolvedSrc}
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
          src={resolvedSrc}
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
          src={resolvedSrc}
          configSrc={configSrc}
          className={className}
          loop={loop}
          autoPlay={autoPlay}
          muted={muted}
          volume={volume}
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

  // Pkg425 — PAG Animation (Tencent professional format, Chamet 2025+ standard)
  if (animationType === 'pag') {
    return (
      <Suspense fallback={<LoadingSpinner />}>
        <PAGPlayer
          src={resolvedSrc}
          className={className}
          loop={loop}
          autoPlay={autoPlay}
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
          src={resolvedSrc}
          autoPlay={autoPlay}
          loop={loop}
          muted={muted}
          playsInline
          crossOrigin="anonymous"
          // HARD-DISABLED: this player drives gift / entry / lottery / live
          // overlay animations — a native play button or thumbnail poster on
          // top of a host stream or a flying gift is never acceptable. The
          // `showControls` prop is intentionally IGNORED here. controlsList
          // + disable* attrs also strip any platform-injected media UI.
          controls={false}
          controlsList="nodownload nofullscreen noremoteplayback noplaybackrate"
          disablePictureInPicture
          disableRemotePlayback
          poster=""
          data-animation="true"
          data-decorative="true"
          className={cn(
            "w-full h-full object-contain pointer-events-none",
            !mediaLoaded && "opacity-0"
          )}
          onLoadedMetadata={(e) => {
            // Auto-detect composite VAP MP4s even when legacy admin rows have
            // NULL animation_format. Supports square 2:1 exports and portrait
            // professional gift exports (~1.125:1, alpha half + RGB half).
            const v = e.currentTarget;
            const w = v.videoWidth;
            const h = v.videoHeight;
            if (
              type !== 'vap' &&
              (detectedType === 'mp4' || detectedType === 'webm') &&
              isLikelyVapCompositeSize(w, h)
            ) {
              markVapCompositeHint(resolvedSrc, true);
              setAutoDetectedVap(true);
            }
          }}
          onLoadedData={() => {
            if (videoRef.current) videoRef.current.volume = Math.max(0, Math.min(1, volume));
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
      <img loading="lazy" decoding="async" 
        src={resolvedSrc}
        alt="Animation"
        crossOrigin="anonymous"
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

/**
 * Pkg425 — Native SVGA overlay wrapper.
 * Tries native Android SVGAImageView; on any failure renders `fallback` (web SVGA).
 * Renders an invisible placeholder div sized to className so layout doesn't jump
 * while the native overlay paints above the WebView.
 */
const NativeSVGAOverlay: React.FC<{
  src: string;
  loop: boolean;
  onComplete: () => void;
  onError: (e: Error) => void;
  fallback: React.ReactNode;
}> = ({ src, loop, onComplete, onError, fallback }) => {
  const [useNative, setUseNative] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    let listener: any = null;

    (async () => {
      const avail = await isNativeSVGAAvailable();
      if (cancelled) return;
      if (!avail) { setUseNative(false); return; }
      try {
        listener = await NativeSVGA.addListener('svga:complete', (data) => {
          if (data?.url === src) onComplete();
        });
        await NativeSVGA.play({ url: src, loop, fillScreen: true });
        if (!cancelled) setUseNative(true);
      } catch (err) {
        if (!cancelled) {
          onError(err as Error);
          setUseNative(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      try { listener?.remove?.(); } catch {}
      try { NativeSVGA.stop(); } catch {}
    };
  }, [src, loop]);

  if (useNative === true) {
    // Native overlay is rendered ABOVE WebView; we render nothing here.
    return <div aria-hidden="true" style={{ width: '100%', height: '100%' }} />;
  }
  if (useNative === false) return <>{fallback}</>;
  // Still resolving availability — render the web fallback so animation starts immediately
  return <>{fallback}</>;
};
