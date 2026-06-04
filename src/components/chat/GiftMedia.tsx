import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { normalizeGiftMediaUrl } from "@/utils/giftMediaUrl";
import UniversalAnimationPlayer from "@/components/common/UniversalAnimationPlayer";
import { detectProfessionalAnimationFormat, isAnimatedProfessionalFormat } from "@/utils/animationFormat";
import { getSharedObserver } from "@/utils/nativePerformance";


interface GiftMediaProps {
  url: string;
  sizeClass?: string;
  className?: string;
}

export const GiftMedia = ({ url, sizeClass = "w-10 h-10", className }: GiftMediaProps) => {
  const normalizedUrl = normalizeGiftMediaUrl(url) || '';
  const format = detectProfessionalAnimationFormat(normalizedUrl);
  const isAnimated = isAnimatedProfessionalFormat(format);

  if (isAnimated) {
    return (
      <UniversalAnimationPlayer
        src={normalizedUrl}
        className={cn("object-contain", sizeClass, className)}
        loop
        autoPlay
        muted
      />
    );
  }

  return (
    <img 
      src={normalizedUrl} 
      alt="Gift" 
      className={cn("object-contain", sizeClass, className)}
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = 'none';
      }}
    />
  );
};

export default GiftMedia;