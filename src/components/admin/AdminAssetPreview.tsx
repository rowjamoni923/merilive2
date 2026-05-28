import React, { Suspense } from 'react';
import { cn } from '@/lib/utils';
import { Loader2, ShieldAlert } from 'lucide-react';
import { SmartImage } from "@/components/ui/smart-image";
import FixedAnimationFrame from "@/components/common/FixedAnimationFrame";
import SVGAPreviewWithMuteToggle from "./SVGAPreviewWithMuteToggle";
import { normalizePublicMediaUrl } from "@/lib/cdnImage";
import { normalizeGiftMediaUrl } from "@/utils/giftMediaUrl";

export type AdminAssetType = 'frame' | 'role-frame' | 'chat-bubble' | 'entry-banner' | 'entry-bar' | 'entry-name-bar' | 'gift' | 'vehicle' | 'game-logo';

interface AdminAssetPreviewProps {
  type: AdminAssetType;
  src: string | null;
  previewUrl?: string | null;
  animationType?: string | null;
  className?: string;
  containerClassName?: string;
  showMuteButton?: boolean;
  aspectRatio?: 'square' | 'video' | 'chat-bubble' | 'banner';
}

/**
 * Admin-only unified asset preview component.
 * Provides stable dimensions, checkerboard background, and consistent loading/error states.
 */
const AdminAssetPreview: React.FC<AdminAssetPreviewProps> = ({
  type,
  src,
  previewUrl,
  animationType,
  className,
  containerClassName,
  showMuteButton = false,
  aspectRatio = 'square',
}) => {
  const [hasError, setHasError] = React.useState(false);
  const [usePreviewFallback, setUsePreviewFallback] = React.useState(false);

  const isFrameAsset = type === 'frame' || type === 'role-frame';
  const normalizeAssetUrl = React.useCallback((value?: string | null) => {
    const trimmed = value?.trim();
    if (!trimmed) return null;
    return normalizeGiftMediaUrl(trimmed) || normalizePublicMediaUrl(trimmed) || trimmed;
  }, []);
  const normalizedSrc = normalizeAssetUrl(src);
  const normalizedPreview = normalizeAssetUrl(previewUrl);
  const displaySrc = (usePreviewFallback ? normalizedPreview : normalizedSrc) || normalizedPreview;
  const cleanUrl = (displaySrc || '').toLowerCase().split('?')[0].split('#')[0];
  const extensionType = cleanUrl.endsWith('.svga') ? 'svga' : cleanUrl.endsWith('.json') ? 'lottie' : cleanUrl.endsWith('.mp4') ? 'mp4' : cleanUrl.endsWith('.webm') ? 'webm' : cleanUrl.endsWith('.gif') ? 'gif' : cleanUrl.endsWith('.webp') ? 'webp' : cleanUrl.endsWith('.png') ? 'png' : cleanUrl.endsWith('.jpg') || cleanUrl.endsWith('.jpeg') ? 'static' : undefined;
  const normalizedAnimationType = animationType?.toLowerCase().trim();
  const knownAnimationTypes = new Set(['svga', 'lottie', 'vap', 'gif', 'webp', 'png', 'mp4', 'webm', 'static']);
  const mappedAnimationType = normalizedAnimationType === 'image'
    ? (extensionType && !['svga', 'lottie', 'vap', 'mp4', 'webm'].includes(extensionType) ? extensionType : 'static')
    : normalizedAnimationType === 'video'
      ? (extensionType === 'webm' || extensionType === 'mp4' || extensionType === 'vap' ? extensionType : 'mp4')
      : normalizedAnimationType === 'animated' || normalizedAnimationType === 'custom' || normalizedAnimationType === 'glow' || normalizedAnimationType === 'none'
        ? (normalizedAnimationType === 'none' ? 'static' : extensionType)
        : normalizedAnimationType;
  const detectedType = mappedAnimationType && knownAnimationTypes.has(mappedAnimationType)
    ? mappedAnimationType
    : extensionType;
  const isSvga = detectedType === 'svga' || cleanUrl.endsWith('.svga');
  const shouldPlayAnimation = Boolean(normalizedSrc) && Boolean(detectedType) && detectedType !== 'static';
  const compactPreview = Boolean(containerClassName?.includes('min-h-0') || containerClassName?.includes('h-full'));

  React.useEffect(() => {
    setHasError(false);
    setUsePreviewFallback(false);
  }, [normalizedSrc, normalizedPreview, type, animationType]);

  const handleAssetError = React.useCallback(() => {
    if (!usePreviewFallback && normalizedPreview && normalizedPreview !== normalizedSrc) {
      setUsePreviewFallback(true);
      setHasError(false);
      return;
    }
    setHasError(true);
  }, [normalizedPreview, normalizedSrc, usePreviewFallback]);

  // Determine container dimensions based on type/aspectRatio
  const getAspectRatioClass = () => {
    if (type === 'chat-bubble' || aspectRatio === 'chat-bubble') return 'aspect-[3/1]';
    if (type === 'entry-name-bar' || aspectRatio === 'banner') return 'aspect-[4/1]';
    if (type === 'entry-banner' || type === 'entry-bar' || type === 'vehicle' || aspectRatio === 'video') return 'aspect-video';
    
    return 'aspect-square';
  };

  const getMinHeight = () => {
    if (type === 'chat-bubble') return 'min-h-[60px]';
    if (type === 'entry-name-bar') return 'min-h-[80px]';
    if (type === 'entry-bar' || type === 'entry-banner' || type === 'vehicle') return 'min-h-[140px]';
    return 'min-h-[120px]';
  };

  // Checkerboard background for transparency visibility
  const checkerboardStyle = {
    backgroundImage: 'linear-gradient(45deg, hsl(var(--muted) / 0.35) 25%, transparent 25%), linear-gradient(-45deg, hsl(var(--muted) / 0.35) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, hsl(var(--muted) / 0.35) 75%), linear-gradient(-45deg, transparent 75%, hsl(var(--muted) / 0.35) 75%)',
    backgroundSize: '20px 20px',
    backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
    backgroundColor: 'hsl(var(--background))'
  };

  if (!displaySrc) {
    return (
      <div 
        className={cn(
          "relative flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 text-white/20 gap-2",
          !compactPreview && getAspectRatioClass(),
          !compactPreview && getMinHeight(),
          containerClassName
        )}
        style={checkerboardStyle}
      >
        <ShieldAlert className="w-8 h-8 opacity-20" />
        <span className="text-[10px] uppercase tracking-wider font-semibold">No Asset</span>
      </div>
    );
  }

  return (
    <div 
      className={cn(
        "relative rounded-xl shadow-inner border border-border/60 flex items-center justify-center group isolate",
        isFrameAsset ? "overflow-visible" : "overflow-hidden",
        !compactPreview && getAspectRatioClass(),
        !compactPreview && getMinHeight(),
        containerClassName
      )}
      data-admin-asset-preview="true"
      data-admin-asset-type={type}
      style={checkerboardStyle}
    >
      <Suspense fallback={
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-sm z-10">
          <Loader2 className="w-6 h-6 animate-spin text-purple-500/50" />
        </div>
      }>
        {isSvga && showMuteButton && displaySrc ? (
          <SVGAPreviewWithMuteToggle
            src={displaySrc}
            className={cn("w-full h-full object-contain", className)}
            containerClassName="w-full h-full"
            showMuteButton={true}
          />
        ) : shouldPlayAnimation && displaySrc ? (
          <div className="absolute inset-0 h-full w-full">
            {isFrameAsset && (
              <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
                <img
                  src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=300&h=300&fit=crop&crop=face"
                  alt=""
                  className="h-[56%] w-[56%] rounded-full object-cover opacity-75 grayscale ring-2 ring-border/70"
                  loading="eager"
                  decoding="async"
                />
              </div>
            )}
            <div className={cn("absolute z-10 h-full w-full pointer-events-none", isFrameAsset ? "inset-0" : "inset-0")}>
              <FixedAnimationFrame
                key={displaySrc}
                src={displaySrc}
                type={detectedType as any}
                size="fill"
                center={false}
                loop={true}
                autoPlay={true}
                muted={true}
                className={cn("h-full w-full", className)}
                onError={handleAssetError}
              />
            </div>
          </div>
        ) : isFrameAsset ? (
          <div className="absolute inset-0 h-full w-full">
            <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
              <img
                src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=300&h=300&fit=crop&crop=face"
                alt=""
                className="h-[56%] w-[56%] rounded-full object-cover opacity-75 grayscale ring-2 ring-border/70"
                loading="eager"
                decoding="async"
              />
            </div>
            <SmartImage
              src={displaySrc}
              alt="Asset preview"
              className={cn("absolute inset-0 z-10 h-full w-full object-contain transition-transform group-hover:scale-105", className)}
              onError={handleAssetError}
              fallbackSrc="/placeholder.svg"
            />
          </div>
        ) : (
          <SmartImage
            src={displaySrc}
            alt="Asset preview"
            className={cn("h-full w-full object-contain transition-transform group-hover:scale-105", className)}
            onError={handleAssetError}
            fallbackSrc="/placeholder.svg"
          />
        )}
      </Suspense>

      {/* Error State */}
      {hasError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-950/20 backdrop-blur-sm text-red-400 gap-1">
          <ShieldAlert className="w-6 h-6" />
          <span className="text-[10px] font-bold">LOAD ERROR</span>
        </div>
      )}

      {/* Type Indicator Badge (Small) */}
      <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-black/60 backdrop-blur-md rounded text-[9px] font-bold text-white/60 uppercase tracking-tighter opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        {detectedType || type}
      </div>
    </div>
  );
};

export default AdminAssetPreview;
