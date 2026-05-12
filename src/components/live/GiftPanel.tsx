import React, { useState, useRef, useEffect, Suspense, lazy, useCallback, useMemo, memo } from "react";
import { createPortal } from "react-dom";
import { X, Diamond, Sparkles, Send, Plus, Minus, Gift, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { GiftSwipeableGrid } from "./GiftSwipeableGrid";
import Diamond3DIcon from "@/components/common/Diamond3DIcon";
import { getCachedGifts, getGiftsWithFetch, hasGiftCache, subscribeToGiftCache } from "@/hooks/useGiftPrefetch";
import { getCachedBalance, subscribeToBalance, getBalanceWithFetch } from "@/hooks/useUserBalance";

// Lazy load animation players
const SVGAPlayer = lazy(() => import("@/components/common/SVGAPlayer"));
const UniversalAnimationPlayer = lazy(() => import("@/components/common/UniversalAnimationPlayer"));

// Gift data types
export interface GiftData {
  id: string;
  name: string;
  nameBn: string;
  emoji: string;
  coins: number;
  category: string;
  animationType: 'basic' | 'premium' | 'luxury' | 'legendary';
  icon_url?: string | null;
  animation_url?: string | null;
  sound_url?: string | null;
}

export interface GiftCategory {
  id: string;
  name: string;
  nameBn: string;
  icon: string;
  color: string;
}

// Default categories - Compact style without emojis (All first)
export const giftCategories: GiftCategory[] = [
  { id: "all", name: "All", nameBn: "All", icon: "", color: "from-pink-500 to-purple-500" },
  { id: "wall", name: "Wall", nameBn: "Wall", icon: "", color: "from-slate-500 to-gray-600" },
  { id: "lucky", name: "Lucky", nameBn: "Lucky", icon: "🎰", color: "from-yellow-400 to-amber-500" },
  { id: "luxurious", name: "Luxurious", nameBn: "Luxurious", icon: "", color: "from-yellow-500 to-amber-500" },
  { id: "vip", name: "VIP", nameBn: "VIP", icon: "", color: "from-purple-500 to-pink-500" },
  { id: "pro", name: "Pro", nameBn: "Pro", icon: "", color: "from-cyan-500 to-blue-500" },
];

// Format diamond value
export const formatCoinValue = (coins: number): string => {
  if (coins >= 1000000) return `${(coins / 1000000).toFixed(1)}M`;
  if (coins >= 1000) return `${(coins / 1000).toFixed(coins >= 10000 ? 0 : 1)}K`;
  return coins.toString();
};

// Re-export for backward compatibility
export type GiftItem = GiftData;
export const allGifts: GiftData[] = []; // Will be loaded from database

interface GiftPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSendGift: (gift: GiftData, count: number) => void;
  userCoins?: number; // Optional - will fetch from DB if not provided
}

const HEAVY_ANIMATION_ASSET_PATTERN = /\.(svga|json)$/i;

const getAssetPathWithoutQuery = (url?: string | null) =>
  url?.split('?')[0] ?? '';

const normalizeGiftAssetUrl = (url?: string | null) => {
  if (!url) return null;
  if (url.startsWith('http') || url.startsWith('/')) return url;
  if (url.includes('/storage/v1/object/public/')) return url.startsWith('http') ? url : `https://${window.location.host}${url.startsWith('/') ? '' : '/'}${url}`;
  return null;
};

const getOptimizedGiftIconUrl = (iconUrl?: string | null, animationUrl?: string | null) => {
  const normalizedIconUrl = normalizeGiftAssetUrl(iconUrl);
  if (normalizedIconUrl && !HEAVY_ANIMATION_ASSET_PATTERN.test(getAssetPathWithoutQuery(normalizedIconUrl))) {
    return normalizedIconUrl;
  }

  const normalizedAnimationUrl = normalizeGiftAssetUrl(animationUrl);
  if (normalizedAnimationUrl && !HEAVY_ANIMATION_ASSET_PATTERN.test(getAssetPathWithoutQuery(normalizedAnimationUrl))) {
    return normalizedAnimationUrl;
  }

  return normalizedIconUrl || normalizedAnimationUrl;
};

export const GiftPanel = React.forwardRef<HTMLDivElement, GiftPanelProps>(function GiftPanel({ isOpen, onClose, onSendGift, userCoins: propUserCoins }, _ref) {
  const [activeCategory, setActiveCategory] = useState(0);
  const [selectedGift, setSelectedGift] = useState<GiftData | null>(null);
  const [count, setCount] = useState(1);
  const [userCoins, setUserCoins] = useState(propUserCoins || 0);
  const [displayCoins, setDisplayCoins] = useState(propUserCoins || 0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [gifts, setGifts] = useState<GiftData[]>([]);
  const [loading, setLoading] = useState(!hasGiftCache()); // Instant if cached
  const [isVisible, setIsVisible] = useState(false);
  // Combo state — Bigo / TikTok Live style rapid-tap combo
  const [comboCount, setComboCount] = useState(0);
  const [comboProgress, setComboProgress] = useState(0); // 0..1, ring sweep
  const comboTimerRef = useRef<number | null>(null);
  const comboRafRef = useRef<number | null>(null);
  const comboDeadlineRef = useRef<number>(0);
  const COMBO_WINDOW_MS = 3000;
  const containerRef = useRef<HTMLDivElement>(null);

  // Animation state for panel open/close (CSS-based for performance)
  useEffect(() => {
    if (isOpen) {
      // Small delay for CSS animation to trigger
      requestAnimationFrame(() => {
        setIsVisible(true);
      });
    } else {
      setIsVisible(false);
    }
  }, [isOpen]);

  // Fetch user's real diamond balance - use cached balance for instant display
  useEffect(() => {
    if (!isOpen) return;

    // Use cached balance immediately for instant UI
    const cachedBalance = getCachedBalance();
    if (cachedBalance > 0) {
      setUserCoins(cachedBalance);
      setDisplayCoins(cachedBalance);
    }

    // Subscribe to balance updates
    const unsubscribe = subscribeToBalance((newBalance) => {
      setUserCoins(newBalance);
    });

    // Fetch fresh balance in background (only if cache is empty)
    if (cachedBalance === 0) {
      getBalanceWithFetch().then((balance) => {
        setUserCoins(balance);
        setDisplayCoins(balance);
      });
    }

    return () => {
      unsubscribe();
    };
  }, [isOpen]);

  // Fetch gifts - use pre-cached data for instant display
  useEffect(() => {
    if (!isOpen) return;

    const applyGifts = (rawGifts: ReturnType<typeof getCachedGifts>) => {
      const transformedGifts: GiftData[] = rawGifts.map((gift) => ({
        id: gift.id,
        name: gift.name,
        nameBn: gift.name,
        emoji: '', // No defaults - only DB assets
        coins: gift.coin_value,
        category: gift.category || 'wall',
        animationType: getAnimationType(gift.coin_value),
        icon_url: getOptimizedGiftIconUrl(gift.icon_url, gift.animation_url),
        animation_url: normalizeGiftAssetUrl(gift.animation_url),
      }));
      setGifts(transformedGifts);
    };

    const unsubscribe = subscribeToGiftCache(() => {
      const latest = getCachedGifts();
      if (latest.length > 0) {
        applyGifts(latest);
        setLoading(false);
      }
    });

    // Use cached gifts immediately (instant display < 100ms)
    const cached = getCachedGifts();
    if (cached.length > 0) {
      applyGifts(cached);
      setLoading(false);
      return unsubscribe;
    }

    // Fallback: fetch if no cache (rare case)
    setLoading(true);
    getGiftsWithFetch().then((data) => {
      applyGifts(data);
      setLoading(false);
    });

    return unsubscribe;
  }, [isOpen]);

  // Determine animation type based on coin value
  const getAnimationType = (coinValue: number): 'basic' | 'premium' | 'luxury' | 'legendary' => {
    if (coinValue >= 10000) return 'legendary';
    if (coinValue >= 1000) return 'luxury';
    if (coinValue >= 100) return 'premium';
    return 'basic';
  };

  // Real-time coin update animation
  useEffect(() => {
    if (displayCoins !== userCoins) {
      setIsAnimating(true);
      const diff = userCoins - displayCoins;
      const step = diff > 0 ? Math.ceil(diff / 10) : Math.floor(diff / 10);
      const interval = setInterval(() => {
        setDisplayCoins(prev => {
          const next = prev + step;
          if ((step > 0 && next >= userCoins) || (step < 0 && next <= userCoins)) {
            clearInterval(interval);
            setIsAnimating(false);
            return userCoins;
          }
          return next;
        });
      }, 30);
      return () => clearInterval(interval);
    }
  }, [userCoins]);

  // Get gifts for current category
  const getCategoryGifts = useCallback((categoryId: string) => {
    if (categoryId === 'all') return gifts;
    return gifts.filter(g => g.category === categoryId);
  }, [gifts]);

  const categoryGiftCountMap = useMemo(() => {
    const counts: Record<string, number> = { all: gifts.length };
    for (const gift of gifts) {
      counts[gift.category] = (counts[gift.category] || 0) + 1;
    }
    return counts;
  }, [gifts]);

  const availableCategories = useMemo(() => {
    return giftCategories.filter((cat) => cat.id === 'all' || (categoryGiftCountMap[cat.id] || 0) > 0);
  }, [categoryGiftCountMap]);

  useEffect(() => {
    if (activeCategory >= availableCategories.length) {
      setActiveCategory(0);
    }
  }, [activeCategory, availableCategories.length]);

  const activeCategoryId = availableCategories[activeCategory]?.id || 'all';
  const activeCategoryGifts = useMemo(
    () => getCategoryGifts(activeCategoryId),
    [getCategoryGifts, activeCategoryId]
  );

  // Reset combo state — call when gift changes / panel closes / timer expires
  const resetCombo = useCallback(() => {
    setComboCount(0);
    setComboProgress(0);
    if (comboTimerRef.current) { window.clearTimeout(comboTimerRef.current); comboTimerRef.current = null; }
    if (comboRafRef.current) { cancelAnimationFrame(comboRafRef.current); comboRafRef.current = null; }
  }, []);

  const startComboTimer = useCallback(() => {
    if (comboTimerRef.current) window.clearTimeout(comboTimerRef.current);
    if (comboRafRef.current) cancelAnimationFrame(comboRafRef.current);
    comboDeadlineRef.current = performance.now() + COMBO_WINDOW_MS;
    const tick = () => {
      const remaining = comboDeadlineRef.current - performance.now();
      const p = Math.max(0, Math.min(1, remaining / COMBO_WINDOW_MS));
      setComboProgress(p);
      if (remaining > 0) {
        comboRafRef.current = requestAnimationFrame(tick);
      }
    };
    comboRafRef.current = requestAnimationFrame(tick);
    comboTimerRef.current = window.setTimeout(() => {
      resetCombo();
    }, COMBO_WINDOW_MS);
  }, [resetCombo]);

  const handleGiftTap = useCallback((gift: GiftData) => {
    if (selectedGift?.id === gift.id) {
      setSelectedGift(null);
      resetCombo();
    } else {
      setSelectedGift(gift);
      setCount(1);
      resetCombo();
    }
  }, [selectedGift, resetCombo]);

  // Combo-aware send: each tap fires the currently-selected `count` and bumps combo
  const handleSend = useCallback(() => {
    if (!selectedGift) return;
    if (userCoins < selectedGift.coins * count) return;
    onSendGift(selectedGift, count);
    setComboCount(prev => prev + count);
    startComboTimer();
  }, [selectedGift, userCoins, count, onSendGift, startComboTimer]);

  const handleQuickSend = useCallback((quickCount: number) => {
    if (!selectedGift) return;
    if (userCoins < selectedGift.coins * quickCount) return;
    setCount(quickCount);
    onSendGift(selectedGift, quickCount);
    setComboCount(prev => prev + quickCount);
    startComboTimer();
  }, [selectedGift, userCoins, onSendGift, startComboTimer]);

  // Reset combo on close / category switch / unmount
  useEffect(() => { if (!isOpen) resetCombo(); }, [isOpen, resetCombo]);
  useEffect(() => () => resetCombo(), [resetCombo]);

  const getAnimationTypeColor = useCallback((type: GiftData['animationType']) => {
    switch (type) {
      case 'basic': return 'border-gray-500/30';
      case 'premium': return 'border-blue-500/50';
      case 'luxury': return 'border-purple-500/50';
      case 'legendary': return 'border-amber-500/50 shadow-amber-500/20 shadow-lg';
      default: return 'border-gray-500/30';
    }
  }, []);

  // Get tier badge - simplified for mobile performance
  const getAnimationTypeBadge = useCallback((type: GiftData['animationType']) => {
    switch (type) {
      case 'legendary': return (
        <div className="absolute -top-1 -right-1 w-4 h-4 bg-gradient-to-r from-amber-500 to-orange-500 rounded-full flex items-center justify-center z-10 shadow-lg animate-pulse">
          <Sparkles className="w-2.5 h-2.5 text-white" />
        </div>
      );
      case 'luxury': return (
        <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center z-10 shadow-lg">
          <Diamond className="w-2 h-2 text-white" />
        </div>
      );
      case 'premium': return (
        <div className="absolute -top-1 -right-1 w-3 h-3 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full flex items-center justify-center z-10 shadow-lg">
          <Sparkles className="w-1.5 h-1.5 text-white" />
        </div>
      );
      default: return null;
    }
  }, []);

  const isVideoOrGif = useCallback((url: string | null) => {
    if (!url) return false;
    return url.endsWith('.mp4') || url.endsWith('.webm') || url.endsWith('.gif');
  }, []);

  const hasBalance = selectedGift ? userCoins >= selectedGift.coins * count : false;

  // Don't render if not open
  if (!isOpen) return null;

  // Use Portal to render outside Chat stacking context - this ensures GiftPanel is ALWAYS on top
  return createPortal(
    <>
      {/* Backdrop - CSS-based animation for performance - HIGHEST z-index to cover everything */}
      <div
        className={cn(
          "fixed inset-0 z-[9998] bg-black/60",
          isVisible ? "opacity-100" : "opacity-0"
        )}
        style={{ 
          WebkitBackdropFilter: 'blur(8px)', 
          backdropFilter: 'blur(8px)',
          WebkitTapHighlightColor: 'transparent',
          transition: 'opacity 200ms ease-out',
          pointerEvents: isVisible ? 'auto' : 'none'
        }}
        onClick={onClose}
      />
      
      {/* Panel - CSS transform animation for 60fps - HIGHEST z-index */}
      <div
        ref={containerRef}
        className={cn(
          "fixed bottom-0 left-0 right-0 z-[9999] bg-gradient-to-b from-[#1a1a28] via-[#0f0f18] to-[#08080c] rounded-t-3xl border-t border-purple-500/20"
        )}
        style={{ 
          boxShadow: '0 -10px 60px rgba(139, 92, 246, 0.15), 0 -2px 20px rgba(0,0,0,0.8)', 
          maxHeight: 'calc(70vh - env(safe-area-inset-bottom, 0px))', 
          paddingBottom: 'max(env(safe-area-inset-bottom, 16px), 16px)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          willChange: 'transform',
          transform: isVisible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 280ms cubic-bezier(0.32, 0.72, 0, 1)',
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
          contain: 'layout style paint'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - Fixed, no shrink */}
        <div className="relative flex-shrink-0" style={{ minHeight: '60px' }}>
          <div className="absolute inset-0 bg-gradient-to-r from-pink-500/10 via-purple-500/10 to-cyan-500/10" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-1 bg-gradient-to-r from-transparent via-white/40 to-transparent rounded-full mt-2" />
          
          <div className="relative flex items-center justify-between px-4 py-3 border-b border-white/5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-pink-500 via-purple-500 to-indigo-600 flex items-center justify-center shadow-lg">
                <Gift className="w-4 h-4 text-white" />
              </div>
              <div>
                <span className="text-white font-bold text-sm tracking-wide">Send Gift</span>
                <p className="text-[9px] text-white/40 font-medium">Choose a premium gift</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {/* Balance Display */}
              <div 
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-colors duration-200",
                  isAnimating 
                    ? "bg-gradient-to-r from-amber-500/25 to-orange-500/25 border-amber-400/50" 
                    : "bg-gradient-to-r from-cyan-500/15 to-blue-500/15 border-cyan-400/30"
                )}
              >
                <Diamond3DIcon size={16} />
                <span 
                  className={cn(
                    "font-bold text-xs tabular-nums bg-clip-text text-transparent",
                    isAnimating 
                      ? "bg-gradient-to-r from-amber-300 to-orange-400" 
                      : "bg-gradient-to-r from-cyan-300 to-blue-400"
                  )}
                >
                  {formatCoinValue(displayCoins)}
                </span>
              </div>
              
              {/* Close Button */}
              <button 
                onClick={onClose} 
                className="w-8 h-8 rounded-full bg-white/5 active:bg-white/15 border border-white/10 flex items-center justify-center transition-colors"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <X className="w-4 h-4 text-white/60" />
              </button>
            </div>
          </div>
        </div>

        {/* Category Tabs - Fixed height */}
        <div className="py-2 px-3 bg-black/20 flex-shrink-0" style={{ minHeight: '44px' }}>
          <div 
            className="flex gap-1.5 overflow-x-auto scrollbar-hide"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            {availableCategories.map((cat, index) => {
              const giftsInCategory = categoryGiftCountMap[cat.id] || 0;
              const isActive = activeCategory === index;
              return (
                <button
                  key={cat.id}
                  onClick={() => {
                    setActiveCategory(index);
                    setSelectedGift(null);
                  }}
                  className={cn(
                    "flex items-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-semibold whitespace-nowrap flex-shrink-0 border transition-all duration-150",
                    isActive
                      ? "bg-gradient-to-r from-pink-500/90 via-purple-500/90 to-indigo-500/90 text-white border-purple-400/50"
                      : "bg-white/5 text-white/60 border-white/10 active:bg-white/15"
                  )}
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  <span>{cat.name}</span>
                  <span className={cn(
                    "text-[9px] px-1.5 py-0.5 rounded-full min-w-[18px] text-center font-bold",
                    isActive ? "bg-white/30 text-white" : "bg-white/10 text-white/50"
                  )}>
                    {giftsInCategory}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Gift Grid - Scrollable - IMPORTANT: touchAction auto for native scroll */}
        <div 
          className="overflow-y-auto overflow-x-hidden flex-1"
          style={{ 
            minHeight: '120px',
            maxHeight: '35vh',
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
            touchAction: 'pan-y'
          }}
        >
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-6 h-6 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : activeCategoryGifts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-28 text-white/40">
              <Gift className="w-8 h-8 mb-1.5" />
              <p className="text-xs">No gifts in this category</p>
            </div>
          ) : (
            <GiftSwipeableGrid
              gifts={activeCategoryGifts}
              selectedGift={selectedGift}
              onGiftTap={handleGiftTap}
              getAnimationTypeColor={getAnimationTypeColor}
              getAnimationTypeBadge={getAnimationTypeBadge}
            />
          )}
        </div>

        {/* Send Section - Fixed at bottom, CSS transition */}
        <div
          className={cn(
            "px-3 pb-3 pt-2 border-t border-white/10 bg-gradient-to-t from-black/95 to-black/80 flex-shrink-0",
            selectedGift ? "opacity-100" : "opacity-0 h-0 overflow-hidden p-0 border-0"
          )}
          style={{ 
            minHeight: selectedGift ? '140px' : '0px',
            transition: 'opacity 150ms ease-out, min-height 150ms ease-out'
          }}
        >
          {selectedGift && (
            <>
            {/* Selected Gift Info */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-pink-500/20 to-purple-500/20 flex items-center justify-center overflow-hidden">
                  {selectedGift.animation_url && isVideoOrGif(selectedGift.animation_url) ? (
                    selectedGift.animation_url.endsWith('.gif') ? (
                      <img src={selectedGift.animation_url} alt={selectedGift.name} className="w-full h-full object-cover" />
                    ) : (
                      <video 
                        src={selectedGift.animation_url} 
                        className="w-full h-full object-cover"
                        autoPlay 
                        loop 
                        muted 
                        playsInline
                      />
                    )
                  ) : selectedGift.animation_url && HEAVY_ANIMATION_ASSET_PATTERN.test(selectedGift.animation_url) ? (
                    <Suspense fallback={<div className="w-6 h-6 rounded-full bg-white/10 animate-pulse" />}>
                      {selectedGift.animation_url.toLowerCase().endsWith('.svga') ? (
                        <SVGAPlayer
                          src={selectedGift.animation_url}
                          className="w-6 h-6"
                          loop={true}
                          autoPlay={true}
                          muted={true}
                        />
                      ) : (
                        <UniversalAnimationPlayer
                          src={selectedGift.animation_url}
                          className="w-6 h-6"
                          loop={true}
                          autoPlay={true}
                          muted={true}
                        />
                      )}
                    </Suspense>
                  ) : selectedGift.icon_url ? (
                    <img src={selectedGift.icon_url} alt={selectedGift.name} className="w-6 h-6 object-contain" />
                  ) : (
                    <Gift className="w-6 h-6 text-white/50" />
                  )}
                </div>
                <div>
                  <p className="text-white font-semibold text-xs">{selectedGift.name}</p>
                  <p className="text-cyan-400 text-[10px] flex items-center gap-0.5 font-medium">
                    <Diamond3DIcon size={12} />
                    {formatCoinValue(selectedGift.coins)} each
                  </p>
                </div>
              </div>
              
              {/* Total Cost */}
              <div className="text-right bg-gradient-to-r from-cyan-500/15 to-purple-500/15 px-3 py-2 rounded-xl border border-cyan-400/20">
                <p className="text-white/50 text-[9px] font-medium">Total Cost</p>
                <p className="font-bold text-sm flex items-center gap-1 justify-end bg-gradient-to-r from-cyan-300 to-purple-400 bg-clip-text text-transparent">
                  <Diamond3DIcon size={16} />
                  {formatCoinValue(selectedGift.coins * count)}
                </p>
              </div>
            </div>

            {/* Controls Row */}
            <div className="flex items-center gap-1.5 mb-2">
              {/* Quick Send: 1, 2, 3 */}
              <div className="flex gap-0.5">
                {[1, 2, 3].map((n) => (
                  <button
                    key={n}
                    onClick={() => handleQuickSend(n)}
                    disabled={userCoins < selectedGift.coins * n}
                    className={cn(
                      "w-8 h-8 rounded-lg font-bold text-sm flex items-center justify-center active:scale-95 transition-transform",
                      userCoins >= selectedGift.coins * n
                        ? "bg-gradient-to-br from-green-500 to-emerald-600 text-white"
                        : "bg-white/10 text-white/30"
                    )}
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                  >
                    {n}
                  </button>
                ))}
              </div>

              {/* Quantity Selector */}
              <div className="flex items-center gap-1 flex-1 justify-center">
                <button
                  onClick={() => setCount(Math.max(1, count - 1))}
                  className="w-6 h-6 rounded bg-white/10 text-white/60 flex items-center justify-center active:bg-white/20 transition-colors"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  <Minus className="w-3 h-3" />
                </button>
                <span className="text-white font-bold text-sm w-6 text-center">
                  {count}
                </span>
                <button
                  onClick={() => setCount(count + 1)}
                  className="w-6 h-6 rounded bg-white/10 text-white/60 flex items-center justify-center active:bg-white/20 transition-colors"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>

              {/* Preset Quantities */}
              <div className="flex gap-1">
                {[10, 99].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setCount(n);
                    }}
                    className={cn(
                      "px-2 py-1.5 rounded-lg text-[10px] font-bold border active:scale-95 transition-all",
                      count === n
                        ? "bg-gradient-to-r from-pink-500 to-purple-500 text-white border-pink-400/50"
                        : "bg-white/10 text-white/70 border-white/10"
                    )}
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                  >
                    x{n}
                  </button>
                ))}
              </div>
            </div>

            {/* Send / COMBO Button — Bigo / TikTok Live style */}
            {comboCount === 0 ? (
              <button
                onClick={handleSend}
                disabled={!hasBalance}
                className={cn(
                  "w-full py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform",
                  hasBalance
                    ? "bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 text-white shadow-[0_4px_20px_rgba(236,72,153,0.35)]"
                    : "bg-white/10 text-white/30"
                )}
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <Send className="w-4 h-4" />
                <span>Send</span>
                <Sparkles className="w-3.5 h-3.5" />
              </button>
            ) : (
              <div className="flex items-center justify-end gap-3">
                <div className="flex flex-col items-end leading-tight mr-1">
                  <span className="text-[10px] text-white/50 font-medium">Combo</span>
                  <span className="font-black text-lg bg-gradient-to-r from-amber-300 via-yellow-300 to-orange-400 bg-clip-text text-transparent tabular-nums">
                    x{comboCount}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!hasBalance}
                  className={cn(
                    "relative w-20 h-20 rounded-full flex items-center justify-center active:scale-95 transition-transform select-none",
                    hasBalance ? "" : "opacity-50"
                  )}
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                  aria-label="Combo send"
                >
                  {/* Countdown ring */}
                  <svg className="absolute inset-0 -rotate-90" width="80" height="80" viewBox="0 0 80 80">
                    <circle cx="40" cy="40" r="35" stroke="rgba(255,255,255,0.12)" strokeWidth="5" fill="none" />
                    <circle
                      cx="40" cy="40" r="35"
                      stroke="url(#comboRingGrad)" strokeWidth="5" fill="none"
                      strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 35}
                      strokeDashoffset={(1 - comboProgress) * 2 * Math.PI * 35}
                      style={{ transition: 'stroke-dashoffset 60ms linear' }}
                    />
                    <defs>
                      <linearGradient id="comboRingGrad" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#fbbf24" />
                        <stop offset="50%" stopColor="#ec4899" />
                        <stop offset="100%" stopColor="#8b5cf6" />
                      </linearGradient>
                    </defs>
                  </svg>
                  {/* Inner button */}
                  <div className="absolute inset-1.5 rounded-full bg-gradient-to-br from-pink-500 via-fuchsia-500 to-purple-600 flex flex-col items-center justify-center shadow-[0_6px_24px_rgba(236,72,153,0.45)]">
                    <span className="text-white font-black text-base leading-none">COMBO</span>
                    <span className="text-white/90 font-bold text-[10px] leading-none mt-0.5">Tap!</span>
                  </div>
                </button>
              </div>
            )}

            {/* Insufficient Balance Warning */}
            {!hasBalance && (
              <p className="text-red-400 text-[10px] text-center mt-1.5">
                Insufficient coins. Please recharge!
              </p>
            )}
            </>
          )}
        </div>
      </div>
    </>,
    document.body
  );
});

export default GiftPanel;
