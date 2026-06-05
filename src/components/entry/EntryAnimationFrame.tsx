/**
 * EntryAnimationFrame — DEDICATED entry-animation wrapper.
 *
 * 🔒 Mirror of `src/components/common/FixedAnimationFrame.tsx` reserved for
 * ENTRY animations (room entry, name bar, entry banner, entrance overlay,
 * vehicle entrance). Routes VAP / MP4 / WebM through the dedicated
 * `EntryVAPPlayer` so the slow gift VAP path can be tuned independently.
 *
 * Why a separate frame?
 *   - The shared `FixedAnimationFrame` routes through `UniversalAnimationPlayer`
 *     which calls the gift-side `VAPPlayer`. Any tweak to that player risks
 *     breaking gift playback.
 *   - Entry overlays are decorative and need to be CHEAP. Putting them on a
 *     dedicated, mobile-tuned VAP/MP4 path keeps the rest of the app snappy.
 *
 * SVGA / Lottie / static branches still delegate to `UniversalAnimationPlayer`
 * — those branches do not share runtime code with `VAPPlayer` so there's no
 * cross-contamination risk.
 */
import React, { Suspense, lazy, useRef } from 'react';
import { cn } from '@/lib/utils';
import UniversalAnimationPlayer, {
  type AnimationType,
  detectAnimationType,
} from '@/components/common/UniversalAnimationPlayer';
import { getVapCompositeHint } from '@/utils/vapDetection';
import { detectProfessionalAnimationFormat } from '@/utils/animationFormat';
import EntryVAPPlayer from './EntryVAPPlayer';
import {
  isAnimationDebugEnabled,
  logAnimationCompletion,
  type AnimationCompletionSource,
} from '@/utils/animationDebug';

const SVGAPlayerWithAudio = lazy(() => import('@/components/common/SVGAPlayerWithAudio'));

export type EntryAnimationSizePreset =
  | 'thumb' | 'card' | 'preview' | 'large'
  | 'fill' | 'full-square' | 'fullscreen';

const SIZE_STYLES: Record<EntryAnimationSizePreset, React.CSSProperties> = {
  thumb:        { width: 64,  height: 64  },
  card:         { width: 160, height: 160 },
  preview:      { width: 240, height: 240 },
  large:        { width: 360, height: 360 },
  fill:         { width: '100%', height: '100%' },
  'full-square':{ width: '90vmin', height: '90vmin', maxWidth: '90vw', maxHeight: '90vh' },
  fullscreen:   { width: '100vw', height: '100vh' },
};

export interface EntryAnimationFrameProps {
  src: string;
  size?: EntryAnimationSizePreset;
  width?: number | string;
  height?: number | string;
  type?: AnimationType;
  configSrc?: string | null;
  loop?: boolean;
  autoPlay?: boolean;
  muted?: boolean;
  volume?: number;
  onLoad?: () => void;
  onError?: (err: Error) => void;
  onComplete?: () => void;
  onAudioExtracted?: (audioUrl: string | null) => void;
  className?: string;
  center?: boolean;
  background?: 'none' | 'dark' | 'transparent';
  fallbackEmoji?: string;
  soundUrl?: string | null;
  debug?: boolean;
  debugTag?: string;
  triggerKey?: string | number;
}

const BG_CLASSES: Record<NonNullable<EntryAnimationFrameProps['background']>, string> = {
  none: '',
  dark: 'bg-black/70',
  transparent: 'bg-transparent',
};

const EntryAnimationFrame: React.FC<EntryAnimationFrameProps> = ({
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
  fallbackEmoji = '✨',
  soundUrl = null,
  debug,
  debugTag,
  triggerKey,
}) => {
  const presetStyle = SIZE_STYLES[size] || SIZE_STYLES.card;
  const frameStyle: React.CSSProperties = {
    ...presetStyle,
    ...(width !== undefined ? { width } : null),
    ...(height !== undefined ? { height } : null),
  };

  const detected =
    detectProfessionalAnimationFormat(src, type) || detectAnimationType(src);
  const KNOWN_TYPES = new Set<AnimationType>([
    'svga', 'lottie', 'vap', 'pag', 'gif', 'webp', 'png', 'mp4', 'webm', 'static',
  ]);
  const isValidContainerOverride =
    type === 'vap' && (detected === 'mp4' || detected === 'webm' || detected === 'vap');
  const explicitMismatch =
    !!type && detected !== 'static' && type !== detected && !isValidContainerOverride;
  const hintedVap =
    getVapCompositeHint(src) &&
    (detected === 'mp4' || detected === 'webm' || detected === 'vap' ||
     type === 'mp4' || type === 'webm' || type === 'vap');
  const safeType: AnimationType | undefined = hintedVap
    ? 'vap'
    : type && KNOWN_TYPES.has(type) && !explicitMismatch
    ? type
    : detected;
  const useAudioPlayer = safeType === 'svga' && detected === 'svga' && !muted;
  const safeMuted = safeType === 'static' ? true : muted;

  const debugActive = debug ?? isAnimationDebugEnabled();
  const mountTimeRef = useRef<number>(Date.now());
  const handleDebugComplete = (source: AnimationCompletionSource) => {
    if (!debugActive) return;
    const elapsed = Date.now() - mountTimeRef.current;
    logAnimationCompletion(
      `EntryAnimationFrame${debugTag ? `:${debugTag}` : ''}`,
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

  // VAP / plain video — dedicated entry player (independent of gift VAPPlayer).
  if (safeType === 'vap' || safeType === 'mp4' || safeType === 'webm') {
    return (
      <div className={wrapperClass} style={frameStyle}>
        <EntryVAPPlayer
          src={src}
          configSrc={configSrc || undefined}
          className="w-full h-full"
          loop={loop}
          autoPlay={autoPlay}
          muted={safeMuted}
          volume={volume}
          soundUrl={soundUrl}
          onLoad={onLoad}
          onError={onError}
          onComplete={() => {
            handleDebugComplete('native');
            onComplete?.();
          }}
        />
      </div>
    );
  }

  // SVGA with embedded audio — keep the shared audio-aware player.
  if (useAudioPlayer) {
    return (
      <div className={wrapperClass} style={frameStyle}>
        <Suspense
          fallback={<div className="absolute inset-0 bg-transparent" aria-hidden="true" />}
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
            triggerKey={triggerKey}
          />
        </Suspense>
      </div>
    );
  }

  // SVGA (muted) / Lottie / GIF / WebP / static / PAG — shared player.
  // These branches do NOT share code with VAPPlayer so it's safe.
  return (
    <div className={wrapperClass} style={frameStyle}>
      <UniversalAnimationPlayer
        src={src}
        type={safeType}
        configSrc={configSrc || undefined}
        className="w-full h-full"
        loop={loop}
        autoPlay={autoPlay}
        muted={safeMuted}
        volume={volume}
        soundUrl={soundUrl}
        onLoad={onLoad}
        onError={onError}
        onComplete={onComplete}
        onCompleteDebug={handleDebugComplete}
        fallbackEmoji={fallbackEmoji}
      />
    </div>
  );
};

export default EntryAnimationFrame;
