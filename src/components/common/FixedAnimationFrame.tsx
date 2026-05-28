import React, { Suspense, lazy, useRef } from 'react';
import { cn } from '@/lib/utils';
import UniversalAnimationPlayer, { type AnimationType, detectAnimationType } from './UniversalAnimationPlayer';
import {
  isAnimationDebugEnabled,
  logAnimationCompletion,
  type AnimationCompletionSource,
} from '@/utils/animationDebug';

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
  fullscreen:   { width: '100vw', height: '100vh' },
};

export interface FixedAnimationFrameProps {
  src: string;
  /** Pick a preset (preferred) OR pass explicit width/height. */
  size?: AnimationSizePreset;
  width?: number | string;
  height?: number | string;
  /** Force a specific animation type — otherwise auto-detected from src extension. */
  type?: AnimationType;
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
}

const BG_CLASSES: Record<NonNullable<FixedAnimationFrameProps['background']>, string> = {
  none: '',
  dark: 'bg-black/60 backdrop-blur-sm',
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
  loop = true,
  autoPlay = true,
  muted = true,
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
}) => {
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
  const detected = detectAnimationType(src);
  const KNOWN_TYPES = new Set<AnimationType>([
    'svga', 'lottie', 'vap', 'gif', 'webp', 'png', 'mp4', 'webm', 'static',
  ]);
  const explicitMismatch =
    !!type && detected !== 'static' && type !== detected;
  if (explicitMismatch && typeof window !== 'undefined' && (debug ?? isAnimationDebugEnabled())) {
    // eslint-disable-next-line no-console
    console.warn(
      `[FixedAnimationFrame] type="${type}" does not match detected "${detected}" for src=${src.split('/').pop()} — using detected type.`,
    );
  }
  const safeType: AnimationType | undefined = type && KNOWN_TYPES.has(type) && !explicitMismatch
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
        className={cn('flex items-center justify-center text-4xl', BG_CLASSES[background], className)}
        style={frameStyle}
      >
        {fallbackEmoji}
      </div>
    );
  }

  const wrapperClass = cn(
    'relative shrink-0 overflow-hidden',
    center && 'mx-auto',
    BG_CLASSES[background],
    className,
  );

  return (
    <div className={wrapperClass} style={frameStyle}>
      {useAudioPlayer ? (
        <Suspense
          fallback={
            <div className="absolute inset-0 bg-transparent" aria-hidden="true" />
          }
        >
          <SVGAPlayerWithAudio
            src={src}
            className="w-full h-full"
            loop={loop}
            autoPlay={autoPlay}
            volume={volume}
            onLoad={onLoad}
            onComplete={onComplete}
            onCompleteDebug={handleDebugComplete}
            onError={onError}
            onAudioExtracted={onAudioExtracted}
            soundUrl={soundUrl}
          />
        </Suspense>
      ) : (
        <UniversalAnimationPlayer
          src={src}
          type={safeType}
          className="w-full h-full"
          loop={loop}
          autoPlay={autoPlay}
          muted={safeMuted}
          onLoad={onLoad}
          onError={onError}
          onComplete={onComplete}
          onCompleteDebug={handleDebugComplete}
          fallbackEmoji={fallbackEmoji}
        />
      )}
    </div>
  );
};

export default FixedAnimationFrame;
