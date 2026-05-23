import { useState, useEffect, useRef, Suspense, lazy, ReactNode } from "react";
import { motion } from "framer-motion";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { getCachedGifts, getGiftsWithFetch, hasGiftCache, subscribeToGiftCache } from "@/hooks/useGiftPrefetch";
import { Gift, X, Coins, Diamond, Play, Sparkles } from "lucide-react";

// Lazy load animation players
const SVGAPlayer = lazy(() => import("@/components/common/SVGAPlayer"));
const UniversalAnimationPlayer = lazy(() => import("@/components/common/UniversalAnimationPlayer"));

interface GiftData {
  id: string;
  name: string;
  emoji: string;
  coins: number;
  category: string;
  animationType: 'basic' | 'premium' | 'luxury' | 'legendary';
  icon_url?: string | null;
  animation_url?: string | null;
}

interface GiftCategory {
  id: string;
  name: string;
  icon: string;
}

const defaultCategories: GiftCategory[] = [
  { id: "wall", name: "Wall", icon: "🏠" },
  { id: "lucky", name: "Lucky", icon: "🎰" },
  { id: "luxurious", name: "Luxurious", icon: "👑" },
  { id: "vip", name: "VIP", icon: "💎" },
  { id: "pro", name: "Pro", icon: "🚀" },
];

const getAnimationTypeFromCoin = (coinValue: number): 'basic' | 'premium' | 'luxury' | 'legendary' => {
  if (coinValue >= 10000) return 'legendary';
  if (coinValue >= 1000) return 'luxury';
  if (coinValue >= 100) return 'premium';
  return 'basic';
};

const transformGiftsFromCache = (raw: ReturnType<typeof getCachedGifts>): GiftData[] =>
  (raw || []).map((gift) => ({
    id: gift.id,
    name: gift.name,
    emoji: '',
    coins: gift.coin_value,
    category: gift.category || 'wall',
    animationType: getAnimationTypeFromCoin(gift.coin_value),
    icon_url: gift.icon_url?.startsWith('http') ? gift.icon_url :
              (gift.animation_url?.startsWith('http') ? gift.animation_url : null),
    animation_url: gift.animation_url,
  }));

interface PartyGiftPanelProps {
  isOpen: boolean;
  onClose: () => void;
  userCoins: number;
  onSendGift: (gift: { id: string; name: string; emoji: string; coins: number; icon_url?: string; animation_url?: string }, count: number) => void;
}

const ITEMS_PER_PAGE = 8; // 4 columns x 2 rows

const PartyGiftPanel = ({ isOpen, onClose, userCoins, onSendGift }: PartyGiftPanelProps) => {
  const [selectedGift, setSelectedGift] = useState<GiftData | null>(null);
  const [sendCount, setSendCount] = useState(1);
  const [activeCategory, setActiveCategory] = useState("popular");
  const [gifts, setGifts] = useState<GiftData[]>(() => transformGiftsFromCache(getCachedGifts()));
  const [loading, setLoading] = useState(!hasGiftCache());
  const [currentPage, setCurrentPage] = useState(0);

  // Load gifts INSTANTLY from prefetch cache, refresh in background
  useEffect(() => {
    if (!isOpen) return;

    const applyFromCache = () => {
      const cached = getCachedGifts();
      if (cached.length > 0) {
        setGifts(transformGiftsFromCache(cached));
        setLoading(false);
      }
    };

    applyFromCache();

    // Subscribe so admin updates / late prefetch results show up
    const unsubscribe = subscribeToGiftCache(applyFromCache);

    // Ensure cache exists (no-op if fresh) — fully non-blocking
    getGiftsWithFetch()
      .then((data) => {
        if (data && data.length > 0) {
          setGifts(transformGiftsFromCache(data));
        }
      })
      .catch((error) => console.error("Error fetching gifts:", error))
      .finally(() => setLoading(false));

    return unsubscribe;
  }, [isOpen]);

  const getAnimationType = (coinValue: number): 'basic' | 'premium' | 'luxury' | 'legendary' => {
    if (coinValue >= 10000) return 'legendary';
    if (coinValue >= 1000) return 'luxury';
    if (coinValue >= 100) return 'premium';
    return 'basic';
  };

  const handleSend = () => {
    if (selectedGift && userCoins >= selectedGift.coins * sendCount) {
      onSendGift({
        id: selectedGift.id,
        name: selectedGift.name,
        emoji: selectedGift.icon_url || selectedGift.animation_url || '',
        coins: selectedGift.coins,
        icon_url: selectedGift.icon_url || undefined,
        animation_url: selectedGift.animation_url || undefined,
      }, sendCount);
      setSelectedGift(null);
      setSendCount(1);
      onClose();
    }
  };

  // Filter gifts by category
  const getCategoryGifts = (categoryId: string) => {
    if (categoryId === "all") return gifts;
    return gifts.filter((g) => g.category === categoryId);
  };

  const currentGifts = getCategoryGifts(activeCategory);
  const totalPages = Math.ceil(currentGifts.length / ITEMS_PER_PAGE);
  const pages = Array.from({ length: totalPages }, (_, i) =>
    currentGifts.slice(i * ITEMS_PER_PAGE, (i + 1) * ITEMS_PER_PAGE)
  );

  // Reset page when category changes
  useEffect(() => {
    setCurrentPage(0);
  }, [activeCategory]);

  // Get available categories (only those with gifts)
  const availableCategories = defaultCategories.filter(
    (cat) => getCategoryGifts(cat.id).length > 0
  );

  const formatCoins = (coins: number) => {
    if (coins >= 1000000) return `${(coins / 1000000).toFixed(1)}M`;
    if (coins >= 1000) return `${(coins / 1000).toFixed(coins >= 10000 ? 0 : 1)}K`;
    return coins.toString();
  };

  const getAnimationTypeColor = (type: GiftData['animationType']) => {
    switch (type) {
      case 'basic': return 'border-gray-500/30';
      case 'premium': return 'border-blue-500/50';
      case 'luxury': return 'border-purple-500/50';
      case 'legendary': return 'border-amber-500/50 shadow-amber-500/20 shadow-lg';
      default: return 'border-gray-500/30';
    }
  };

  const getAnimationTypeBadge = (type: GiftData['animationType']): ReactNode => {
    switch (type) {
      case 'legendary': return (
        <motion.div 
          className="absolute -top-1 -right-1 w-4 h-4 bg-gradient-to-r from-amber-500 to-orange-500 rounded-full flex items-center justify-center z-10 shadow-lg shadow-amber-500/50"
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
        >
          <Sparkles className="w-2.5 h-2.5 text-white" />
        </motion.div>
      );
      case 'luxury': return (
        <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center z-10 shadow-lg shadow-purple-500/50">
          <Diamond className="w-2 h-2 text-white" />
        </div>
      );
      case 'premium': return (
        <div className="absolute -top-1 -right-1 w-3 h-3 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full flex items-center justify-center z-10 shadow-lg shadow-blue-500/50">
          <Sparkles className="w-1.5 h-1.5 text-white" />
        </div>
      );
      default: return null;
    }
  };

  const isVideoOrGif = (url: string | null) => {
    if (!url) return false;
    return url.endsWith('.mp4') || url.endsWith('.webm') || url.endsWith('.gif');
  };

  // Swipe handlers
  const handleTouchStart = (e: React.TouchEvent, startXRef: React.MutableRefObject<number>) => {
    startXRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent, startXRef: React.MutableRefObject<number>) => {
    const endX = e.changedTouches[0].clientX;
    const deltaX = endX - startXRef.current;
    const threshold = 50;

    if (deltaX < -threshold && currentPage < totalPages - 1) {
      setCurrentPage(currentPage + 1);
    } else if (deltaX > threshold && currentPage > 0) {
      setCurrentPage(currentPage - 1);
    }
  };

  const startXRef = { current: 0 };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="bottom" className="h-[55vh] rounded-t-3xl bg-gradient-to-b from-slate-900 to-slate-950 border-t border-white/10 p-0 pb-safe [&>button]:hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Gift className="w-4 h-4 text-pink-500" />
            <span className="font-semibold text-white text-sm">Send Gift</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-gradient-to-r from-amber-500/20 to-yellow-500/20 px-2 py-0.5 rounded-full border border-amber-500/30">
              <Coins className="w-3 h-3 text-amber-400" />
              <span className="text-xs font-bold text-amber-300">{formatCoins(userCoins)}</span>
            </div>
            <button onClick={onClose} className="p-1 rounded-full hover:bg-white/10">
              <X className="w-4 h-4 text-white/60" />
            </button>
          </div>
        </div>

        {/* Category Tabs - Horizontal Scroll */}
        <div className="border-b border-white/10">
          <ScrollArea className="w-full">
            <div className="flex gap-1 px-3 py-2">
              {availableCategories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => setActiveCategory(category.id)}
                  className={cn(
                    "flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all",
                    activeCategory === category.id
                      ? "bg-gradient-to-r from-pink-500 to-purple-500 text-white shadow-md"
                      : "bg-white/5 text-white/60 hover:bg-white/10"
                  )}
                >
                  <span>{category.name}</span>
                  <span className={cn(
                    "text-[9px] px-1 py-0.5 rounded-full min-w-[16px] text-center",
                    activeCategory === category.id ? "bg-white/25 text-white" : "bg-white/10 text-white/40"
                  )}>
                    {getCategoryGifts(category.id).length}
                  </span>
                </button>
              ))}
            </div>
            <ScrollBar orientation="horizontal" className="hidden" />
          </ScrollArea>
        </div>

        {/* Gift Grid - Swipeable */}
        <div className="flex-1 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <div className="w-8 h-8 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : currentGifts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-white/40">
              <Gift className="w-10 h-10 mb-2" />
              <p className="text-sm">No gifts in this category</p>
            </div>
          ) : (
            <div className="relative">
              {/* Swipeable Container */}
              <div
                className="overflow-hidden touch-pan-y"
                onTouchStart={(e) => { startXRef.current = e.touches[0].clientX; }}
                onTouchEnd={(e) => {
                  const endX = e.changedTouches[0].clientX;
                  const deltaX = endX - startXRef.current;
                  const threshold = 50;
                  if (deltaX < -threshold && currentPage < totalPages - 1) {
                    setCurrentPage(currentPage + 1);
                  } else if (deltaX > threshold && currentPage > 0) {
                    setCurrentPage(currentPage - 1);
                  }
                }}
              >
                <motion.div
                  className="flex"
                  animate={{ x: `-${currentPage * 100}%` }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                >
                  {pages.map((pageGifts, pageIndex) => (
                    <div key={pageIndex} className="w-full flex-shrink-0 p-3">
                      <div className="grid grid-cols-4 gap-2">
                        {pageGifts.map((gift) => (
                          <motion.button
                            key={gift.id}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => setSelectedGift(gift)}
                            className={cn(
                              "flex flex-col items-center p-2 rounded-xl transition-all relative border",
                              getAnimationTypeColor(gift.animationType),
                              selectedGift?.id === gift.id
                                ? "bg-gradient-to-br from-pink-500/30 to-purple-500/30 ring-2 ring-pink-400"
                                : "bg-white/5 hover:bg-white/10"
                            )}
                          >
                            {getAnimationTypeBadge(gift.animationType)}
                            
                            {gift.icon_url ? (
                              <Suspense fallback={<div className="w-10 h-10 rounded-full bg-white/10 animate-pulse" />}>
                                {gift.icon_url.toLowerCase().endsWith('.svga') ? (
                                  <SVGAPlayer
                                    src={gift.icon_url}
                                    className="w-10 h-10"
                                    loop={true}
                                    autoPlay={true}
                                    muted={true}
                                  />
                                ) : gift.icon_url.toLowerCase().endsWith('.json') ? (
                                  <UniversalAnimationPlayer
                                    src={gift.icon_url}
                                    className="w-10 h-10"
                                    loop={true}
                                    autoPlay={true}
                                    muted={true}
                                  />
                                ) : isVideoOrGif(gift.icon_url) ? (
                                  gift.icon_url.endsWith('.gif') ? (
                                    <img src={gift.icon_url} alt={gift.name} className="w-10 h-10 object-contain" />
                                  ) : (
                                    <video src={gift.icon_url} className="w-10 h-10 object-cover pointer-events-none" autoPlay loop muted playsInline controls={false} disablePictureInPicture disableRemotePlayback controlsList="nodownload nofullscreen noremoteplayback noplaybackrate" />
                                  )
                                ) : (
                                  <img
                                    src={gift.icon_url}
                                    alt={gift.name}
                                    className="w-10 h-10 object-contain"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).style.display = 'none';
                                    }}
                                  />
                                )}
                              </Suspense>
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-white/5" />
                            )}
                            
                            {gift.animation_url && (
                              <div className="absolute top-1 left-1 w-3 h-3 bg-purple-500/90 rounded flex items-center justify-center">
                                <Play className="w-1.5 h-1.5 text-white" />
                              </div>
                            )}
                            
                            <span className="text-[10px] font-medium text-white/80 truncate max-w-full mt-1">{gift.name}</span>
                            <span className="text-[10px] text-amber-400 flex items-center gap-0.5 font-bold">
                              <Diamond className="w-2.5 h-2.5" />
                              {formatCoins(gift.coins)}
                            </span>
                          </motion.button>
                        ))}
                      </div>
                    </div>
                  ))}
                </motion.div>
              </div>

              {/* Compact professional page bars */}
              {totalPages > 1 && (
                <div className="flex justify-center items-center gap-0.5 py-1">
                  {Array.from({ length: totalPages }).map((_, index) => (
                    <button
                      key={index}
                      onClick={() => setCurrentPage(index)}
                      className="group grid h-3 w-4 place-items-center"
                      aria-label={`Page ${index + 1}`}
                    >
                      <span
                        className={cn(
                          "block h-0.5 rounded-[1px] transition-all duration-200",
                          currentPage === index ? "w-3 bg-white" : "w-1.5 bg-white/45 group-hover:bg-white/75"
                        )}
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Send Section - Fixed at bottom */}
        {selectedGift && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-slate-900 to-slate-900/90 border-t border-white/10 safe-area-bottom"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {selectedGift.icon_url ? (
                  <Suspense fallback={<div className="w-8 h-8 rounded-full bg-white/10 animate-pulse" />}>
                    {selectedGift.icon_url.toLowerCase().endsWith('.svga') ? (
                      <SVGAPlayer
                        src={selectedGift.icon_url}
                        className="w-8 h-8"
                        loop={true}
                        autoPlay={true}
                        muted={true}
                      />
                    ) : selectedGift.icon_url.toLowerCase().endsWith('.json') ? (
                      <UniversalAnimationPlayer
                        src={selectedGift.icon_url}
                        className="w-8 h-8"
                        loop={true}
                        autoPlay={true}
                        muted={true}
                      />
                    ) : (
                      <img
                        src={selectedGift.icon_url}
                        alt={selectedGift.name}
                        className="w-8 h-8 object-contain"
                      />
                    )}
                  </Suspense>
                ) : (
                  <span className="text-2xl">{selectedGift.emoji || '🎁'}</span>
                )}
                <div>
                  <p className="text-white font-medium text-sm">{selectedGift.name}</p>
                  <p className="text-amber-400 text-xs">{formatCoins(selectedGift.coins * sendCount)} Diamonds</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Count buttons */}
                <div className="flex items-center gap-0.5 bg-white/10 rounded-full p-0.5">
                  {[1, 5, 10, 99].map((count) => (
                    <button
                      key={count}
                      onClick={() => setSendCount(count)}
                      className={cn(
                        "w-7 h-7 rounded-full text-xs font-bold transition-all",
                        sendCount === count
                          ? "bg-gradient-to-r from-pink-500 to-purple-500 text-white"
                          : "text-white/60 hover:text-white"
                      )}
                    >
                      {count}
                    </button>
                  ))}
                </div>

                {/* Send button */}
                <Button
                  onClick={handleSend}
                  disabled={userCoins < selectedGift.coins * sendCount}
                  className={cn(
                    "px-5 rounded-full text-sm font-bold",
                    userCoins >= selectedGift.coins * sendCount
                      ? "bg-gradient-to-r from-pink-500 to-red-500 hover:from-pink-600 hover:to-red-600 text-white shadow-lg shadow-pink-500/30"
                      : "bg-gray-600 text-gray-400"
                  )}
                >
                  Send
                </Button>
              </div>
            </div>
            {userCoins < selectedGift.coins * sendCount && (
              <p className="text-xs text-red-400 text-center mt-1">Insufficient Diamonds</p>
            )}
          </motion.div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default PartyGiftPanel;
