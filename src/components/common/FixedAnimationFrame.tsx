import React, { Suspense, lazy, useRef } from 'react';
import type { SVGADynamicData } from './SVGAPlayer';
import { cn } from '@/lib/utils';
import UniversalAnimationPlayer, { type AnimationType, detectAnimationType } from './UniversalAnimationPlayer';
import {
  isAnimationDebugEnabled,
  logAnimationCompletion,
  type AnimationCompletionSource,
} from '@/utils/animationDebug';
import { getVapCompositeHint } from '@/utils/vapDetection';
import { detectProfessionalAnimationFormat } from '@/utils/animationFormat';

const SVGAPlayerWithAudio = lazy(() => import('./SVGAPlayerWithAudio'));

/**
 * Standard size presets used across the app.
 * Add new presets here — never hard-code sizes at call sites.
 */
export type AnimationSizePreset =
  | 'thumb'        // 64×64   — list/grid thumbnails
  | 'card'         // 160×160 — shop cards, gift drawer
  | 'preview'      // 240×240 — preview dialogs
  | 'large'        // 360×360 — admin preview, big cards
  | 'fill'         // 100% × 100% — fill an already-sized parent (admin grid cells)
  | 'full-square'  // 90vmin square — fullscreen preview modal (Shop tap-to-play)
  | 'fullscreen';  // 100vw × 100vh — in-room entry/full-screen gift overlay

const SIZE_STYLES: Record<AnimationSizePreset, React.CSSProperties> = {
  thumb:        { width: 64,  height: 64  },
  card:         { width: 160, height: 160 },
  preview:      { width: 240, height: 240 },
  large:        { width: 360, height: 360 },
  fill:         { width: '100%', height: '100%' },
  'full-square':{ width: '90vmin', height: '90vmin', maxWidth: '90vw', maxHeight: '90vh' },
  fullscreen:   { width: '100vw', height: '100vh', position: 'fixed', top: 0, left: 0, zIndex: 2147483647 },
};

export interface FixedAnimationFrameProps {
  src: string;
  /** Pick a preset (preferred) OR pass explicit width/height. */
  size?: AnimationSizePreset;
  width?: number | string;
  height?: number | string;
  /** Force a specific animation type — otherwise auto-detected from src extension. */
  type?: AnimationType;
  /** VAP-only config URL (vapc.json) for custom RGB/alpha layouts. */
  configSrc?: string | null;
  loop?: boolean;
  autoPlay?: boolean;
  /** muted = false plays embedded SVGA audio. Default true. */
  muted?: boolean;
  /** SVGA only — 0..1 audio volume (passed to SVGAPlayerWithAudio). Default 0.8. */
  volume?: number;
  onLoad?: () => void;
  onError?: (err: Error) => void;
  onComplete?: () => void;
  /** SVGA only — fires once embedded/fallback audio source is resolved. */
  onAudioExtracted?: (audioUrl: string | null) => void;
  /** Wrapper class — does NOT affect dimensions, only positioning/background. */
  className?: string;
  /** Center the frame within its parent (default true). */
  center?: boolean;
  /** Visual frame background (e.g. blurred dark for fullscreen). */
  background?: 'none' | 'dark' | 'transparent';
  fallbackEmoji?: string;
  /** Optional admin-uploaded sound URL — used for SVGA with no embedded audio. */
  soundUrl?: string | null;
  /**
   * When true, logs onComplete timing with provenance ('native' vs 'safety-timer')
   * for both SVGAPlayerWithAudio and UniversalAnimationPlayer paths.
   * Also auto-enabled by `localStorage.svgaDebug = '1'` or `window.__SVGA_DEBUG__ = true`.
   */
  debug?: boolean;
  /** Optional label appended to debug logs to identify the call site. */
  debugTag?: string;
  /** Changing this key re-triggers the audio segments without restarting the animation */
  triggerKey?: string | number;
  /** Pkg: Professional dynamic data replacement (SVGA/VAP/PAG) */
  dynamicData?: SVGADynamicData;
  /** Optional placeholder/icon URL shown immediately while animation loads */
  placeholderUrl?: string;
}

// ⚠️ NEVER use `backdrop-blur` here — this frame sits over animated content
// (VAP/SVGA/MP4 gifts), and backdrop-blur re-samples every pixel underneath
// per frame, hanging the WebView. Use a flat dark wash instead.
const BG_CLASSES: Record<NonNullable<FixedAnimationFrameProps['background']>, string> = {
  none: '',
  dark: 'bg-black/70',
  transparent: 'bg-transparent',
};

/**
 * Reusable fixed-dimension wrapper for SVGA / Lottie / MP4 / GIF / WebP animations.
 *
 * Why this exists:
 * - SVGA canvas collapses to 0×0 unless its parent has an explicit width AND height.
 * - Without this wrapper, every call site repeats the same w-full/h-full + max-w/max-h gymnastics.
 * - One place to enforce object-contain, centering, and dimension correctness.
 *
 * Use this component wherever you'd otherwise render <SVGAPlayerWithAudio /> or
 * <UniversalAnimationPlayer /> directly. It picks the right inner player automatically:
 *  - SVGA + muted=false  →  SVGAPlayerWithAudio (embedded audio)
 *  - everything else     →  UniversalAnimationPlayer (handles SVGA-muted, Lottie, video, image)
 */
const FixedAnimationFrame: React.FC<FixedAnimationFrameProps> = ({
  src,
  size = 'card',
  width,
  height,
  type,
  configSrc,
  loop = true,
  autoPlay = true,
  muted = false,
  volume = 0.8,
  onLoad,
  onError,
  onComplete,
  onAudioExtracted,
  className,
  center = true,
  background = 'none',
  fallbackEmoji = '🎁',
  soundUrl = null,
  debug,
  debugTag,
  triggerKey,
  dynamicData,
  placeholderUrl,
}) => {
  const [animLoaded, setAnimLoaded] = React.useState(false);
  const [imageError, setImageError] = React.useState(false);
  // Resolve dimensions: explicit width/height wins over preset.
  const presetStyle = SIZE_STYLES[size] || SIZE_STYLES.card;
  const frameStyle: React.CSSProperties = {
    ...presetStyle,
    ...(width !== undefined ? { width } : null),
    ...(height !== undefined ? { height } : null),
  };

  // ─── Type validation ──────────────────────────────────────────────
  // Sniff the extension; if the caller forced `type` but the src extension
  // disagrees (e.g. type="svga" on a .png), trust the extension and fall back
  // to UniversalAnimationPlayer so we never spin up SVGA + audio decode on
  // a non-SVGA file. Unknown extensions also bypass audio handling.
  const detected = detectProfessionalAnimationFormat(src, type) || detectAnimationType(src);
  const KNOWN_TYPES = new Set<AnimationType>([
    'svga', 'lottie', 'vap', 'pag', 'gif', 'webp', 'png', 'mp4', 'webm', 'static',
  ]);
  // VAP is still an MP4/WebM container, so an explicit admin-selected
  // type="vap" on a .mp4 is valid and must not be downgraded to plain video.
  const isValidContainerOverride = type === 'vap' && (detected === 'mp4' || detected === 'webm' || detected === 'vap');
  const explicitMismatch =
    !!type && detected !== 'static' && type !== detected && !isValidContainerOverride;
  if (explicitMismatch && typeof window !== 'undefined' && (debug ?? isAnimationDebugEnabled())) {
    // eslint-disable-next-line no-console
    console.warn(
      `[FixedAnimationFrame] type="${type}" does not match detected "${detected}" for src=${src.split('/').pop()} — using detected type.`,
    );
  }
  const hintedVap = getVapCompositeHint(src) && (detected === 'mp4' || detected === 'webm' || detected === 'vap' || type === 'mp4' || type === 'webm' || type === 'vap');
  const safeType: AnimationType | undefined = hintedVap
    ? 'vap'
    : type && KNOWN_TYPES.has(type) && !explicitMismatch
    ? type
    : detected;
  const resolvedType = safeType;
  // Audio path is allowed ONLY when we are certain the file is SVGA.
  const useAudioPlayer = resolvedType === 'svga' && detected === 'svga' && !muted;
  // For unknown / static / non-animatable types, force muted so downstream
  // players never attempt SVGA audio extraction or video unmuting.
  const safeMuted = resolvedType === 'static' ? true : muted;

  const debugActive = debug ?? isAnimationDebugEnabled();
  const mountTimeRef = useRef<number>(Date.now());
  const handleDebugComplete = (source: AnimationCompletionSource) => {
    if (!debugActive) return;
    const elapsed = Date.now() - mountTimeRef.current;
    logAnimationCompletion(
      `FixedAnimationFrame${debugTag ? `:${debugTag}` : ''}`,
      source,
      { elapsed, src },
    );
  };

  if (!src) {
    return (
      <div
        className={cn('flex items-center justify-center relative overflow-hidden', BG_CLASSES[background], className)}
        style={frameStyle}
      >
        {placeholderUrl && !imageError ? (
          <img 
            src={placeholderUrl} 
            className="w-full h-full object-contain" 
            onError={() => setImageError(true)}
            loading="eager"
            {...({ fetchpriority: 'high' } as any)}
          />
        ) : (
          <span className="text-4xl">{fallbackEmoji}</span>
        )}
      </div>
    );
  }

  const wrapperClass = cn(
    size === 'fullscreen' ? 'fixed inset-0' : 'relative shrink-0',
    'overflow-hidden',
    center && size !== 'fullscreen' && 'mx-auto',
    BG_CLASSES[background],
    className,
  );

  return (
    <div className={wrapperClass} style={frameStyle}>
      {/* Placeholder / Icon shown immediately */}
      {placeholderUrl && !imageError && (
        <img 
          src={placeholderUrl} 
          className={cn(
            "absolute inset-0 w-full h-full object-contain transition-opacity duration-300",
            animLoaded ? "opacity-0 pointer-events-none" : "opacity-100"
          )}
          onError={() => setImageError(true)}
          loading="eager"
          {...({ fetchpriority: 'high' } as any)}
        />
      )}

      <div className={cn("w-full h-full transition-opacity duration-300", animLoaded ? "opacity-100" : "opacity-0")}>
        {useAudioPlayer ? (
          <Suspense
            fallback={
              <div className="absolute inset-0 bg-transparent" aria-hidden="true" />
            }
          >
            <SVGAPlayerWithAudio
              src={src}
              className={wrapperClass}
              loop={loop}
              autoPlay={autoPlay}
              volume={volume}
              onLoad={() => {
                setAnimLoaded(true);
                onLoad?.();
              }}
              onComplete={onComplete}
              onCompleteDebug={handleDebugComplete}
              onError={(err) => {
                setImageError(true);
                onError?.(err);
              }}
              onAudioExtracted={onAudioExtracted}
              soundUrl={soundUrl}
              triggerKey={triggerKey}
              dynamicData={dynamicData}
            />
          </Suspense>
        ) : (
          <UniversalAnimationPlayer
            src={src}
            type={safeType}
            configSrc={configSrc || undefined}
            className={wrapperClass}
            loop={loop}
            autoPlay={autoPlay}
            muted={safeMuted}
            volume={volume}
            soundUrl={soundUrl}
            onLoad={() => {
              setAnimLoaded(true);
              onLoad?.();
            }}
            onError={(err) => {
              setImageError(true);
              onError?.(err);
            }}
            onComplete={onComplete}
            onCompleteDebug={handleDebugComplete}
            fallbackEmoji={fallbackEmoji}
            dynamicData={dynamicData}
          />
        )}
      </div>
    </div>
  );
};

export default FixedAnimationFrame;
