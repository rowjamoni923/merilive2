import React, { useState, Suspense, lazy, useCallback } from 'react';
import { Volume2, VolumeX, Loader2, Music } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Only load SVGA players when needed
const SVGAPlayer = lazy(() => import('@/components/common/SVGAPlayer'));
const SVGAPlayerWithAudio = lazy(() => import('@/components/common/SVGAPlayerWithAudio'));

interface SVGAPreviewWithMuteToggleProps {
  src: string;
  className?: string;
  containerClassName?: string;
  loop?: boolean;
  autoPlay?: boolean;
  showMuteButton?: boolean;
}

/**
 * Check if the URL points to an SVGA file
 */
const isSvgaUrl = (url: string): boolean => {
  if (!url) return false;
  const cleanUrl = url.split('?')[0].split('#')[0].toLowerCase();
  return cleanUrl.endsWith('.svga');
};

/**
 * Preview component for animations in admin panel.
 * Supports SVGA (with audio toggle) and standard image formats (GIF, WebP, PNG, JPG).
 */
const SVGAPreviewWithMuteToggle: React.FC<SVGAPreviewWithMuteToggleProps> = ({
  src,
  className,
  containerClassName,
  loop = true,
  autoPlay = true,
  showMuteButton = true,
}) => {
  const [isMuted, setIsMuted] = useState(true);
  const [hasAudio, setHasAudio] = useState(false);
  const [key, setKey] = useState(0);
  const [imgError, setImgError] = useState(false);

  const toggleMute = useCallback(() => {
    setIsMuted(prev => !prev);
    setKey(prev => prev + 1);
  }, []);

  const handleAudioExtracted = useCallback((audioUrl: string | null) => {
    if (audioUrl) {
      setHasAudio(true);
      console.log('[SVGAPreviewWithMuteToggle] 🔊 Audio detected in SVGA!');
    }
  }, []);

  const isSvga = isSvgaUrl(src);

  // Empty / invalid src → graceful placeholder (no broken image icon)
  if (!src || src.trim() === '') {
    return (
      <div className={cn(
        "relative flex flex-col items-center justify-center bg-muted/40 border border-dashed border-muted-foreground/30 rounded-lg text-muted-foreground gap-1",
        containerClassName
      )}>
        <Music className="w-5 h-5 opacity-50" />
        <span className="text-[10px] uppercase tracking-wide opacity-60">No animation</span>
      </div>
    );
  }

  // Non-SVGA (GIF/WebP/PNG/JPG) → render as <img> with error fallback
  if (!isSvga) {
    if (imgError) {
      return (
        <div className={cn(
          "relative flex flex-col items-center justify-center bg-muted/40 border border-dashed border-muted-foreground/30 rounded-lg text-muted-foreground gap-1",
          containerClassName
        )}>
          <Music className="w-5 h-5 opacity-50" />
          <span className="text-[10px] uppercase tracking-wide opacity-60">Preview unavailable</span>
        </div>
      );
    }
    return (
      <div className={cn("relative", containerClassName)}>
        <img
          src={src}
          alt="Animation preview"
          className={cn("object-contain w-full h-full", className)}
          loading="lazy"
          decoding="async"
          onError={() => setImgError(true)}
        />
      </div>
    );
  }

  // SVGA format — use SVGA players with audio toggle
  return (
    <div className={cn("relative", containerClassName)}>
      <Suspense fallback={
        <div className="w-full h-full flex items-center justify-center bg-slate-800/50 rounded-lg">
          <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
        </div>
      }>
        {isMuted ? (
          <SVGAPlayer
            key={`muted-${key}`}
            src={src}
            className={className}
            loop={loop}
            autoPlay={autoPlay}
            muted={true}
          />
        ) : (
          <SVGAPlayerWithAudio
            key={`unmuted-${key}`}
            src={src}
            className={className}
            loop={loop}
            autoPlay={autoPlay}
            volume={0.7}
            onAudioExtracted={handleAudioExtracted}
          />
        )}
      </Suspense>
      
      {/* Audio Control Button */}
      {showMuteButton && (
        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between z-20">
          {hasAudio && (
            <div className="flex items-center gap-1 px-2 py-1 bg-amber-500/90 text-white text-xs font-medium rounded-full">
              <Music className="w-3 h-3" />
              <span>Audio Available</span>
            </div>
          )}
          
          {!hasAudio && <div />}
          
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={toggleMute}
            className={cn(
              "h-8 px-3 rounded-full gap-1.5",
              "bg-black/70 hover:bg-black/90 backdrop-blur-sm",
              "transition-all duration-200 shadow-lg text-white",
              !isMuted && "bg-green-600/90 hover:bg-green-600 ring-2 ring-green-400/50"
            )}
          >
            {isMuted ? (
              <>
                <VolumeX className="w-4 h-4" />
                <span className="text-xs">Unmute</span>
              </>
            ) : (
              <>
                <Volume2 className="w-4 h-4" />
                <span className="text-xs">Playing</span>
              </>
            )}
          </Button>
        </div>
      )}

      {isMuted && showMuteButton && (
        <div className="absolute top-2 left-2 right-2 text-center z-20">
          <span className="text-[10px] text-white/60 bg-black/40 px-2 py-0.5 rounded-full">
            🔇 Click "Unmute" to test audio
          </span>
        </div>
      )}
    </div>
  );
};

export default SVGAPreviewWithMuteToggle;
