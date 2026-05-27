import React, { Suspense } from 'react';
import { cn } from '@/lib/utils';
import { Loader2, Music, ShieldAlert } from 'lucide-react';
import { SmartImage } from "@/components/ui/smart-image";
import FixedAnimationFrame from "@/components/common/FixedAnimationFrame";
import UniversalFramePlayer from "@/components/common/UniversalFramePlayer";
import SVGAPreviewWithMuteToggle from "./SVGAPreviewWithMuteToggle";

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

  // Determine container dimensions based on type/aspectRatio
  const getAspectRatioClass = () => {
    if (type === 'chat-bubble' || aspectRatio === 'chat-bubble') return 'aspect-[3/1]';
    if (type === 'entry-banner' || type === 'entry-bar' || type === 'entry-name-bar' || aspectRatio === 'video') return 'aspect-video';
    if (aspectRatio === 'banner') return 'aspect-[4/1]';
    return 'aspect-square';
  };

  const getMinHeight = () => {
    if (type === 'chat-bubble') return 'min-h-[60px]';
    if (type === 'entry-name-bar') return 'min-h-[80px]';
    return 'min-h-[120px]';
  };

  // Checkerboard background for transparency visibility
  const checkerboardStyle = {
    backgroundImage: 'linear-gradient(45deg, #1a1a1a 25%, transparent 25%), linear-gradient(-45deg, #1a1a1a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1a1a1a 75%), linear-gradient(-45deg, transparent 75%, #1a1a1a 75%)',
    backgroundSize: '20px 20px',
    backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
    backgroundColor: '#111'
  };

  if (!src && !previewUrl) {
    return (
      <div 
        className={cn(
          "relative flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 text-white/20 gap-2",
          getAspectRatioClass(),
          getMinHeight(),
          containerClassName
        )}
        style={checkerboardStyle}
      >
        <ShieldAlert className="w-8 h-8 opacity-20" />
        <span className="text-[10px] uppercase tracking-wider font-semibold">No Asset</span>
      </div>
    );
  }

  const isSvga = src?.toLowerCase().split('?')[0].endsWith('.svga') || animationType === 'svga';

  return (
    <div 
      className={cn(
        "relative rounded-xl overflow-hidden shadow-inner border border-white/5 flex items-center justify-center group",
        getAspectRatioClass(),
        getMinHeight(),
        containerClassName
      )}
      style={checkerboardStyle}
    >
      <Suspense fallback={
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-sm z-10">
          <Loader2 className="w-6 h-6 animate-spin text-purple-500/50" />
        </div>
      }>
        {/* Priority 1: SVGA Preview with Mute Toggle (for admin convenience) */}
        {isSvga && showMuteButton ? (
          <SVGAPreviewWithMuteToggle
            src={src!}
            className={cn("w-full h-full object-contain", className)}
            containerClassName="w-full h-full"
            showMuteButton={true}
          />
        ) : (
          <>
            {/* Priority 2: Animation Player */}
            {src && (animationType !== 'static') ? (
              <div className="w-full h-full">
                {type === 'frame' ? (
                   <div className="relative w-full h-full flex items-center justify-center">
                      <img 
                        src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=300&h=300&fit=crop&crop=face" 
                        alt="Preview" 
                        className="absolute w-3/4 h-3/4 rounded-full object-cover opacity-50 grayscale"
                      />
                      <div className="absolute inset-0 z-10">
                        <UniversalFramePlayer src={src} type={animationType as any} className="w-full h-full" loop autoPlay muted />
                      </div>
                   </div>
                ) : (
                  <FixedAnimationFrame 
                    src={src} 
                    size="fill" 
                    center={true} 
                    loop={true} 
                    autoPlay={true} 
                    muted={true}
                    className={cn("w-full h-full", className)}
                  />
                )}
              </div>
            ) : (
              /* Priority 3: Static Preview / Image fallback */
              <SmartImage
                src={previewUrl || src || ''}
                alt="Asset preview"
                className={cn("w-full h-full object-contain transition-transform group-hover:scale-110", className)}
                onError={() => setHasError(true)}
                fallbackSrc="/placeholder.svg"
              />
            )}
          </>
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
        {animationType || type}
      </div>
    </div>
  );
};

export default AdminAssetPreview;
