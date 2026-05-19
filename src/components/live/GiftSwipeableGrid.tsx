import { useState, useRef, useEffect, ReactNode, useCallback, memo, useMemo, Suspense, lazy } from "react";
import { cn } from "@/lib/utils";
import { GiftData, formatCoinValue } from "./GiftPanel";
import Diamond3DIcon from "@/components/common/Diamond3DIcon";

const SVGAPlayer = lazy(() => import("@/components/common/SVGAPlayer"));

const HEAVY_ANIMATION_ASSET_PATTERN = /\.(svga|json)(\?|$)/i;

interface GiftSwipeableGridProps {
  gifts: GiftData[];
  selectedGift: GiftData | null;
  onGiftTap: (gift: GiftData) => void;
  getAnimationTypeColor: (type: GiftData['animationType']) => string;
  getAnimationTypeBadge: (type: GiftData['animationType']) => ReactNode;
}

const ITEMS_PER_PAGE = 8; // 4 columns x 2 rows

/** Determine the best display URL and whether it's SVGA */
const getDisplayInfo = (gift: GiftData): { url: string | null; isSvga: boolean } => {
  const iconUrl = gift.icon_url || null;
  const animUrl = gift.animation_url || null;

  // Prefer icon_url if it's a static image
  if (iconUrl && !HEAVY_ANIMATION_ASSET_PATTERN.test(iconUrl)) {
    return { url: iconUrl, isSvga: false };
  }
  // If animation_url is a static image, use it
  if (animUrl && !HEAVY_ANIMATION_ASSET_PATTERN.test(animUrl)) {
    return { url: animUrl, isSvga: false };
  }
  // Use SVGA from icon_url or animation_url
  const svgaUrl = [iconUrl, animUrl].find(u => u && /\.svga(\?|$)/i.test(u));
  if (svgaUrl) {
    return { url: svgaUrl, isSvga: true };
  }
  return { url: iconUrl || animUrl, isSvga: false };
};

// Memoized gift item for performance
const GiftItem = memo(({ 
  gift, 
  isSelected, 
  onTap, 
  getAnimationTypeColor, 
  getAnimationTypeBadge
}: {
  gift: GiftData;
  isSelected: boolean;
  onTap: () => void;
  getAnimationTypeColor: (type: GiftData['animationType']) => string;
  getAnimationTypeBadge: (type: GiftData['animationType']) => ReactNode;
}) => {
  const { url, isSvga } = useMemo(() => getDisplayInfo(gift), [gift]);

  return (
    <button
      onClick={onTap}
      className={cn(
        "flex flex-col items-center p-2 rounded-2xl relative border",
        getAnimationTypeColor(gift.animationType),
        isSelected
          ? "bg-gradient-to-br from-pink-500/25 via-purple-500/20 to-indigo-500/25 ring-2 ring-pink-400/60"
          : "bg-gradient-to-br from-white/5 to-white/[0.02]"
      )}
      style={{ 
        boxShadow: isSelected ? '0 4px 20px rgba(236, 72, 153, 0.3)' : 'none',
        WebkitTapHighlightColor: 'transparent',
        transform: isSelected ? 'scale(1.03)' : 'scale(1)',
        transition: 'transform 80ms ease-out, box-shadow 80ms ease-out',
        willChange: 'transform',
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden'
      }}
    >
      {getAnimationTypeBadge(gift.animationType)}
      
      {/* Gift Icon Container */}
      <div 
        className="w-12 h-12 flex items-center justify-center rounded-xl overflow-hidden bg-gradient-to-br from-black/40 to-black/20 border border-white/5"
        style={{ contain: 'layout style' }}
      >
        {url && isSvga ? (
          <Suspense fallback={<div className="w-10 h-10 rounded-lg bg-white/5 animate-pulse" />}>
            <SVGAPlayer
              src={url}
              className="w-10 h-10"
              loop={true}
              autoPlay={true}
            />
          </Suspense>
        ) : url ? (
          <img 
            src={url} 
            alt={gift.name} 
            className="w-10 h-10 object-contain" 
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="w-10 h-10 rounded-lg bg-white/5" />
        )}
      </div>

      {/* Gift Name */}
      <span className="text-white/90 text-[10px] mt-1.5 truncate w-full text-center font-semibold leading-tight">
        {gift.name}
      </span>
      
      {/* Price Badge */}
      <div className="flex items-center gap-0.5 mt-0.5 px-1.5 py-0.5 rounded-full bg-gradient-to-r from-cyan-500/15 to-purple-500/15 border border-cyan-400/20">
        <Diamond3DIcon size={10} />
        <span className="text-[9px] font-bold bg-gradient-to-r from-cyan-300 to-purple-400 bg-clip-text text-transparent">
          {formatCoinValue(gift.coins)}
        </span>
      </div>
    </button>
  );
});

GiftItem.displayName = 'GiftItem';

export const GiftSwipeableGrid = memo(({
  gifts,
  selectedGift,
  onGiftTap,
  getAnimationTypeColor,
  getAnimationTypeBadge,
}: GiftSwipeableGridProps) => {
  const [currentPage, setCurrentPage] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const isDraggingRef = useRef(false);

  // Calculate pages
  const totalPages = Math.ceil(gifts.length / ITEMS_PER_PAGE);
  const pages = Array.from({ length: totalPages }, (_, i) =>
    gifts.slice(i * ITEMS_PER_PAGE, (i + 1) * ITEMS_PER_PAGE)
  );
  const currentPageGifts = useMemo(() => pages[currentPage] || [], [pages, currentPage]);

  // Reset page when gifts change
  useEffect(() => {
    setCurrentPage(0);
  }, [gifts.length]);

  // Touch handlers for horizontal swipe
  const startYRef = useRef(0);
  const isHorizontalSwipeRef = useRef(false);
  
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX;
    startYRef.current = e.touches[0].clientY;
    isDraggingRef.current = true;
    isHorizontalSwipeRef.current = false;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDraggingRef.current) return;
    
    const deltaX = Math.abs(e.touches[0].clientX - startXRef.current);
    const deltaY = Math.abs(e.touches[0].clientY - startYRef.current);
    
    if (!isHorizontalSwipeRef.current && deltaX > 10 && deltaX > deltaY * 1.5) {
      isHorizontalSwipeRef.current = true;
    }
    
    if (isHorizontalSwipeRef.current) {
      e.preventDefault();
    }
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    
    if (!isHorizontalSwipeRef.current) {
      isHorizontalSwipeRef.current = false;
      return;
    }
    
    const endX = e.changedTouches[0].clientX;
    const deltaX = endX - startXRef.current;
    const threshold = 50;

    if (deltaX < -threshold && currentPage < totalPages - 1) {
      setCurrentPage(prev => prev + 1);
    } else if (deltaX > threshold && currentPage > 0) {
      setCurrentPage(prev => prev - 1);
    }
    
    isHorizontalSwipeRef.current = false;
  }, [currentPage, totalPages]);

  // Mouse drag handlers for desktop
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    startXRef.current = e.clientX;
    isDraggingRef.current = true;
  }, []);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    
    const deltaX = e.clientX - startXRef.current;
    const threshold = 50;

    if (deltaX < -threshold && currentPage < totalPages - 1) {
      setCurrentPage(prev => prev + 1);
    } else if (deltaX > threshold && currentPage > 0) {
      setCurrentPage(prev => prev - 1);
    }
  }, [currentPage, totalPages]);

  const handleMouseLeave = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  const handlePageClick = useCallback((index: number) => {
    setCurrentPage(index);
  }, []);

  return (
    <div 
      className="relative select-none" 
      style={{ 
        contain: 'layout style',
        isolation: 'isolate'
      }}
    >
      <div
        ref={containerRef}
        className="overflow-hidden"
        style={{ 
          touchAction: 'pan-y',
          overscrollBehavior: 'contain'
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        <div className="px-3 py-1">
          <div className="grid grid-cols-4 gap-2">
            {currentPageGifts.map((gift) => (
              <GiftItem
                key={gift.id}
                gift={gift}
                isSelected={selectedGift?.id === gift.id}
                onTap={() => onGiftTap(gift)}
                getAnimationTypeColor={getAnimationTypeColor}
                getAnimationTypeBadge={getAnimationTypeBadge}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Page Dots */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-1 py-1.5">
          {Array.from({ length: totalPages }).map((_, index) => (
            <button
              key={index}
              onClick={() => handlePageClick(index)}
              className={cn(
                "h-1 rounded-full transition-all duration-300",
                currentPage === index ? "w-4 bg-white" : "w-1 bg-white/50"
              )}
              style={{ WebkitTapHighlightColor: 'transparent' }}
              aria-label={`Page ${index + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
});

GiftSwipeableGrid.displayName = 'GiftSwipeableGrid';

export default GiftSwipeableGrid;
