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
  
  // Performance optimization: Only play animations when visible
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isAnimated || !containerRef.current) {
      setIsVisible(true);
      return;
    }

    const observer = getSharedObserver('gift-media-visibility', (entries) => {
      entries.forEach(entry => {
        if (entry.target === containerRef.current) {
          setIsVisible(entry.isIntersecting);
        }
      });
    }, { rootMargin: '100px' });

    observer.observe(containerRef.current);
    return () => {
      if (containerRef.current) observer.unobserve(containerRef.current);
    };
  }, [isAnimated]);

  const content = () => {
    if (isAnimated) {
      // If not visible, show a static placeholder (or nothing) to save CPU/GPU
      if (!isVisible) {
        return <div className={cn("bg-black/10 rounded-lg animate-pulse", sizeClass, className)} />;
      }

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
        loading="lazy"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
    );
  };

  return (
    <div ref={containerRef} className="inline-block shrink-0">
      {content()}
    </div>
  );
};

export default GiftMedia;