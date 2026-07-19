import React, { useState, useRef, useEffect, Suspense, lazy, useCallback, useMemo, memo } from "react";
import { createPortal } from "react-dom";
import { useMobileOrientation } from "@/hooks/useMobileOrientation";
import { useNativeGiftPanel } from "@/hooks/useNativeGiftPanel";

import { X, Diamond, Sparkles, Send, Plus, Minus, Gift, Play, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { GiftSwipeableGrid } from "./GiftSwipeableGrid";
import Diamond3DIcon from "@/components/common/Diamond3DIcon";
import { getCachedGifts, getGiftsWithFetch, hasGiftCache, subscribeToGiftCache } from "@/hooks/useGiftPrefetch";
import { getCachedBalance, subscribeToBalance, getBalanceWithFetch } from "@/hooks/useUserBalance";
import { normalizeGiftMediaUrl } from "@/utils/giftMediaUrl";
import { isLikelyVapCompositeSize, markVapCompositeHint } from "@/utils/vapDetection";
import { useRealtimeLevel } from "@/hooks/useRealtimeLevel";
import { toast } from "sonner";
import { useGiftPanelPrefetch } from "@/hooks/useGiftPanelPrefetch";

// Lazy load animation players
const SVGAPlayer = lazy(() => import("@/components/common/SVGAPlayer"));

import FixedAnimationFrame from "@/components/common/FixedAnimationFrame";

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
  animation_format?: string | null;
  animation_config_url?: string | null;
  sound_url?: string | null;
  min_level?: number;
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
  userDiamonds?: number; // Optional - will fetch from DB if not provided
}

// Pkg306 audit: accept URLs with query strings (cache-busters, signed Supabase URLs).
// Previously `/\.(svga|json)$/i` mis-routed SVGA gifts with `?token=` into the <img loading="lazy" decoding="async"> branch.
const HEAVY_ANIMATION_ASSET_PATTERN = /\.(svga|json)(\?|$)/i;
const VIDEO_OR_GIF_PATTERN = /\.(mp4|webm|gif)(\?|$)/i;
const GIF_PATTERN = /\.gif(\?|$)/i;

const getAssetPathWithoutQuery = (url?: string | null) =>
  url?.split('?')[0] ?? '';

const normalizeGiftAssetUrl = normalizeGiftMediaUrl;

const warmSelectedVideoGift = (url?: string | null) => {
  if (!url || typeof document === 'undefined' || !VIDEO_OR_GIF_PATTERN.test(url) || GIF_PATTERN.test(url)) return;
  try {
    void import('@/components/common/VAPPlayer');
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    video.src = url;
    video.onloadedmetadata = () => {
      markVapCompositeHint(url, isLikelyVapCompositeSize(video.videoWidth, video.videoHeight));
      video.removeAttribute('src');
      video.load();
    };
    video.onerror = () => {
      video.removeAttribute('src');
      video.load();
    };
    video.load();
  } catch { /* best-effort only */ }
};

const getOptimizedGiftIconUrl = (iconUrl?: string | null, animationUrl?: string | null) => {
  const normalizedIconUrl = normalizeGiftAssetUrl(iconUrl);
  if (normalizedIconUrl && !HEAVY_ANIMATION_ASSET_PATTERN.test(getAssetPathWithoutQuery(normalizedIconUrl)) && !VIDEO_OR_GIF_PATTERN.test(getAssetPathWithoutQuery(normalizedIconUrl))) {
    return normalizedIconUrl;
  }

  const normalizedAnimationUrl = normalizeGiftAssetUrl(animationUrl);
  if (normalizedAnimationUrl && !HEAVY_ANIMATION_ASSET_PATTERN.test(getAssetPathWithoutQuery(normalizedAnimationUrl)) && !VIDEO_OR_GIF_PATTERN.test(getAssetPathWithoutQuery(normalizedAnimationUrl))) {
    return normalizedAnimationUrl;
  }

  return normalizedIconUrl && !VIDEO_OR_GIF_PATTERN.test(getAssetPathWithoutQuery(normalizedIconUrl)) ? normalizedIconUrl : null;
};

export const GiftPanel = React.forwardRef<HTMLDivElement, GiftPanelProps>(function GiftPanel({ isOpen, onClose, onSendGift, userDiamonds: propUserCoins }, _ref) {
  const [activeCategory, setActiveCategory] = useState(0);
  const [selectedGift, setSelectedGift] = useState<GiftData | null>(null);
  const [count, setCount] = useState(1);
  const [userDiamonds, setUserCoins] = useState(propUserCoins || 0);
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
  // Pkg306 audit: synchronous balance mirror so rapid combo taps cannot overdraw
  // between renders. Closure `userDiamonds` lags by one render in combo bursts.
  const userCoinsRef = useRef<number>(propUserCoins || 0);
  const { isLandscape, isVerySmallHeight } = useMobileOrientation();

  // Current user level (for level-gated gifts)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (mounted) setCurrentUserId(data.user?.id ?? null);
    });
    return () => { mounted = false; };
  }, []);
  const { level: userLevel } = useRealtimeLevel(currentUserId);
  const effectiveUserLevel = Math.max(0, Number(userLevel ?? 0));



  const { isNative } = useNativeGiftPanel(
    isOpen,
    onClose,
    (id, count) => {
      const g = gifts.find(x => x.id === id);
      if (g) onSendGift(g, count);
    },
    () => { /* Navigate to recharge */ },
    gifts,
    userDiamonds
  );

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

  // Sync prop-supplied coin balance whenever the parent updates it.
  // Without this, GiftPanel's local `userDiamonds` stays frozen at the
  // value captured on mount until the balance subscription fires.
  useEffect(() => {
    if (typeof propUserCoins === 'number' && propUserCoins >= 0) {
      userCoinsRef.current = propUserCoins;
      setUserCoins(propUserCoins);
      setDisplayCoins(propUserCoins);
    }
  }, [propUserCoins]);

  // Fetch user's real diamond balance - use cached balance for instant display
  useEffect(() => {
    if (!isOpen) return;

    // Use cached balance immediately for instant UI
    const cachedBalance = getCachedBalance();
    if (cachedBalance > 0) {
      userCoinsRef.current = cachedBalance;
      setUserCoins(cachedBalance);
      setDisplayCoins(cachedBalance);
    }

    // Subscribe to balance updates
    const unsubscribe = subscribeToBalance((newBalance) => {
      userCoinsRef.current = newBalance;
      setUserCoins(newBalance);
    });

    // Fetch fresh balance in background (only if cache is empty)
    if (cachedBalance === 0) {
      getBalanceWithFetch().then((balance) => {
        userCoinsRef.current = balance;
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
        coins: gift.diamond_value,
        category: gift.category || 'wall',
        animationType: getAnimationType(gift.diamond_value),
        icon_url: getOptimizedGiftIconUrl(gift.icon_url, gift.animation_url),
        animation_url: normalizeGiftAssetUrl(gift.animation_url),
        animation_format: (gift as any).animation_format || null,
        animation_config_url: normalizeGiftAssetUrl((gift as any).animation_config_url),
        sound_url: normalizeGiftAssetUrl(gift.sound_url),
        min_level: Number((gift as any).min_level ?? 0) || 0,
      }));
      setGifts(transformedGifts);
      // Pkg C pass-2 — prewarm visible gift assets so first tap plays instantly.
      // sessionPrewarmed dedupes inside the util, so repeat opens are cheap.
      const assets: Array<string | null | undefined> = [];
      transformedGifts.slice(0, 12).forEach(g => {
        assets.push(g.animation_url);
        assets.push(g.icon_url);
      });
      const runPrewarm = () => import('@/utils/giftAnimationPrewarm')
        .then(m => m.prewarmGiftAssets(assets))
        .catch(() => {});
      const w = window as Window & {
        requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      };
      if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(runPrewarm, { timeout: 2500 });
      else window.setTimeout(runPrewarm, 900);
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
  const getAnimationType = (diamondValue: number): 'basic' | 'premium' | 'luxury' | 'legendary' => {
    if (diamondValue >= 10000) return 'legendary';
    if (diamondValue >= 1000) return 'luxury';
    if (diamondValue >= 100) return 'premium';
    return 'basic';
  };

  // Real-time coin update animation
  useEffect(() => {
    if (displayCoins !== userDiamonds) {
      setIsAnimating(true);
      const diff = userDiamonds - displayCoins;
      const step = diff > 0 ? Math.ceil(diff / 10) : Math.floor(diff / 10);
      const interval = setInterval(() => {
        setDisplayCoins(prev => {
          const next = prev + step;
          if ((step > 0 && next >= userDiamonds) || (step < 0 && next <= userDiamonds)) {
            clearInterval(interval);
            setIsAnimating(false);
            return userDiamonds;
          }
          return next;
        });
      }, 30);
      return () => clearInterval(interval);
    }
  }, [userDiamonds]);

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

  // Phase 4B — panel-open prefetch (icons + top animations).
  useGiftPanelPrefetch(isOpen, gifts);


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

  // Premium gifts (≥ 50,000 diamonds) are single-send only — no combo presets,
  // no quantity stepper. Keeps lottery-tier gifts feeling intentional & exclusive.
  const SINGLE_ONLY_THRESHOLD = 50000;
  const COMBO_PRESETS = [1, 11, 37, 77] as const;
  const isSingleOnly = !!selectedGift && selectedGift.coins >= SINGLE_ONLY_THRESHOLD;

  const handleGiftTap = useCallback((gift: GiftData) => {
    const required = Number(gift.min_level ?? 0) || 0;
    if (required > 0 && effectiveUserLevel < required) {
      toast.error(`Reach Lv ${required} to unlock "${gift.name}"`, {
        description: `Your current level: Lv ${effectiveUserLevel}`,
      });
      return;
    }
    if (selectedGift?.id === gift.id) {
      setSelectedGift(null);
      resetCombo();
    } else {
      setSelectedGift(gift);
      setCount(1);
      resetCombo();
      warmSelectedVideoGift(gift.animation_url || gift.icon_url);
    }
  }, [selectedGift, resetCombo, effectiveUserLevel]);


  // Keep ref in sync with userDiamonds (mirror, not state-source).
  useEffect(() => { userCoinsRef.current = userDiamonds; }, [userDiamonds]);

  // Combo-aware send: each tap fires the currently-selected `count` and bumps combo.
  // Optimistically deduct the cost from local balance so that rapid combo taps
  // can't overdraw — the real balance reconciles via subscribeToBalance.
  // Guard via ref so back-to-back taps within one render still see deducted balance.
  const handleSend = useCallback(() => {
    if (!selectedGift) return;
    warmSelectedVideoGift(selectedGift.animation_url || selectedGift.icon_url);
    // Premium gifts (≥ 50k) are single-send only — ignore stale combo count
    // and skip combo accumulation so the lottery-tier UI stays clean.
    const singleOnly = selectedGift.coins >= SINGLE_ONLY_THRESHOLD;
    const effectiveCount = singleOnly ? 1 : count;
    const cost = selectedGift.coins * effectiveCount;
    if (userCoinsRef.current < cost) return;
    userCoinsRef.current = Math.max(0, userCoinsRef.current - cost);
    onSendGift(selectedGift, effectiveCount);
    setUserCoins(userCoinsRef.current);
    if (!singleOnly) {
      setComboCount(prev => prev + effectiveCount);
      startComboTimer();
    }
  }, [selectedGift, count, onSendGift, startComboTimer]);



  const handleQuickSend = useCallback((quickCount: number) => {
    if (!selectedGift) return;
    warmSelectedVideoGift(selectedGift.animation_url || selectedGift.icon_url);
    // Premium gifts (≥ 50k) clamp to single send and skip combo accumulation.
    const singleOnly = selectedGift.coins >= SINGLE_ONLY_THRESHOLD;
    const effectiveCount = singleOnly ? 1 : quickCount;
    const cost = selectedGift.coins * effectiveCount;
    if (userCoinsRef.current < cost) return;
    userCoinsRef.current = Math.max(0, userCoinsRef.current - cost);
    setCount(effectiveCount);
    onSendGift(selectedGift, effectiveCount);
    setUserCoins(userCoinsRef.current);
    if (!singleOnly) {
      setComboCount(prev => prev + effectiveCount);
      startComboTimer();
    }
  }, [selectedGift, onSendGift, startComboTimer]);




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
    return VIDEO_OR_GIF_PATTERN.test(url);
  }, []);

  const hasBalance = selectedGift ? userDiamonds >= selectedGift.coins * count : false;

  // Don't render if not open OR if native is active
  if (!isOpen || isNative) return null;


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
          "fixed bottom-0 left-0 right-0 z-[9999] rounded-t-3xl border-t border-white/10",
          "md:left-1/2 md:right-auto md:-translate-x-1/2 md:w-[700px] md:rounded-3xl md:bottom-10 md:border md:shadow-2xl"
        )}
        style={{
          background:
            'radial-gradient(120% 80% at 50% 0%, rgba(236,72,153,0.18), transparent 55%), radial-gradient(120% 80% at 50% 100%, rgba(139,92,246,0.18), transparent 60%), linear-gradient(180deg, #1a1226 0%, #100a1a 55%, #06040c 100%)',
          boxShadow:
            '0 -18px 60px -10px rgba(139,92,246,0.35), 0 -4px 24px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.08)',
          maxHeight: isLandscape ? '95dvh' : 'calc(70vh - env(safe-area-inset-bottom, 0px))',
          paddingBottom: 'max(env(safe-area-inset-bottom, 16px), 16px)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          willChange: 'transform',
          transform: isVisible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 280ms cubic-bezier(0.32, 0.72, 0, 1)',
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
          contain: 'layout style paint',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — Premium 3D */}
        <div className="relative flex-shrink-0 md:pt-2" style={{ minHeight: '64px' }}>
          <div className="absolute inset-0 bg-gradient-to-r from-pink-500/15 via-fuchsia-500/10 to-indigo-500/15" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-gradient-to-r from-transparent via-white/50 to-transparent rounded-full mt-2 md:hidden" />

          <div className="relative flex items-center justify-between px-4 py-3 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-2xl bg-gradient-to-br from-pink-500 via-fuchsia-500 to-indigo-600 flex items-center justify-center"
                style={{
                  boxShadow:
                    '0 8px 18px -6px rgba(236,72,153,0.55), inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -2px 6px rgba(0,0,0,0.25)',
                }}
              >
                <Gift className="w-4 h-4 text-white" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.4))' }} />
              </div>
              <div>
                <span
                  className="text-white font-extrabold text-sm tracking-wide"
                  style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}
                >
                  Send Gift
                </span>
                <p className="text-[10px] text-white/70 font-medium">Choose a premium gift</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-colors duration-200',
                  isAnimating
                    ? 'bg-gradient-to-r from-amber-500/30 to-orange-500/30 border-amber-300/60'
                    : 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border-cyan-300/40'
                )}
                style={{
                  boxShadow:
                    'inset 0 1px 0 rgba(255,255,255,0.25), 0 4px 12px -4px rgba(34,211,238,0.35)',
                }}
              >
                <Diamond3DIcon size={16} />
                <span
                  className={cn(
                    'font-extrabold text-xs tabular-nums bg-clip-text text-transparent',
                    isAnimating
                      ? 'bg-gradient-to-r from-amber-200 to-orange-300'
                      : 'bg-gradient-to-r from-cyan-200 to-blue-300'
                  )}
                >
                  {formatCoinValue(displayCoins)}
                </span>
              </div>

              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-white/10 active:bg-white/20 border border-white/15 flex items-center justify-center transition-all hover:-translate-y-0.5"
                style={{
                  WebkitTapHighlightColor: 'transparent',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), 0 4px 10px -4px rgba(0,0,0,0.5)',
                }}
              >
                <X className="w-4 h-4 text-white/75" />
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
              const isActive = activeCategory === index;
              return (
                <button
                  key={cat.id}
                  onClick={() => {
                    setActiveCategory(index);
                    setSelectedGift(null);
                    resetCombo();
                  }}
                  className={cn(
                    "flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap flex-shrink-0 border transition-all duration-200",
                    isActive
                      ? "bg-gradient-to-r from-pink-500 via-fuchsia-500 to-indigo-500 text-white border-white/30 -translate-y-0.5"
                      : "bg-white/[0.06] text-white/65 border-white/10 active:bg-white/15 hover:-translate-y-0.5"
                  )}
                  style={{
                    WebkitTapHighlightColor: 'transparent',
                    boxShadow: isActive
                      ? '0 6px 16px -4px rgba(236,72,153,0.55), inset 0 1px 0 rgba(255,255,255,0.4)'
                      : 'inset 0 1px 0 rgba(255,255,255,0.06)',
                  }}
                >
                  <span style={isActive ? { textShadow: '0 1px 2px rgba(0,0,0,0.35)' } : undefined}>
                    {cat.name}
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
            <div className="flex flex-col items-center justify-center h-28 text-white/65">
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
              userLevel={effectiveUserLevel}
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
                    GIF_PATTERN.test(selectedGift.animation_url) ? (
                      <img loading="lazy" decoding="async" src={selectedGift.animation_url} alt={selectedGift.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full grid place-items-center bg-white/10">
                        <Play className="w-4 h-4 text-white/80" fill="currentColor" />
                      </div>

                    )
                  ) : selectedGift.animation_url && HEAVY_ANIMATION_ASSET_PATTERN.test(selectedGift.animation_url) ? (
                    <Suspense fallback={<div className="w-6 h-6 rounded-full bg-white/10 animate-pulse" />}>
                      {/\.svga(\?|$)/i.test(selectedGift.animation_url) ? (
                        <SVGAPlayer
                          src={selectedGift.animation_url}
                          className="w-6 h-6"
                          loop={true}
                          autoPlay={true}
                          muted={true}
                        />
                      ) : (
                        <FixedAnimationFrame
                          src={selectedGift.animation_url}
                          width={24}
                          height={24}
                          loop
                          muted
                          center={false}
                        />
                      )}
                    </Suspense>
                  ) : selectedGift.icon_url ? (
                    <img loading="lazy" decoding="async" src={selectedGift.icon_url} alt={selectedGift.name} className="w-6 h-6 object-contain" />
                  ) : (
                    <Gift className="w-6 h-6 text-white/70" />
                  )}
                </div>
                <div>
                  <p className="text-white font-semibold text-xs">{selectedGift.name}</p>
                  <div className="text-cyan-400 text-[10px] flex items-center gap-0.5 font-medium">
                    <Diamond3DIcon size={12} />
                    {formatCoinValue(selectedGift.coins)} each
                  </div>
                </div>
              </div>
              
              {/* Total Cost */}
              <div className="text-right bg-gradient-to-r from-cyan-500/15 to-purple-500/15 px-3 py-2 rounded-xl border border-cyan-400/20">
                <p className="text-white/70 text-[9px] font-medium">Total Cost</p>
                <div className="font-bold text-sm flex items-center gap-1 justify-end bg-gradient-to-r from-cyan-300 to-purple-400 bg-clip-text text-transparent">
                  <Diamond3DIcon size={16} />
                  {formatCoinValue(selectedGift.coins * count)}
                </div>
              </div>
            </div>

            {/* Controls Row */}
            {isSingleOnly ? (
              <div className="flex items-center justify-center mb-2">
                <div className="px-3 py-1.5 rounded-full bg-gradient-to-r from-amber-500/15 to-orange-500/15 border border-amber-400/30">
                  <span className="text-[10px] font-bold tracking-wide text-amber-200">
                    Premium gift · Single send only
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 mb-2">
                {/* Combo Presets: 1, 11, 37, 77 — Chamet style */}
                <div className="flex gap-1 flex-1 justify-between">
                  {COMBO_PRESETS.map((n) => {
                    const canAfford = userDiamonds >= selectedGift.coins * n;
                    const isActive = count === n;
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setCount(n);
                          if (n === 1) {
                            handleSend();
                          } else {
                            handleQuickSend(n);
                          }
                        }}
                        disabled={!canAfford}
                        className={cn(
                          "flex-1 h-9 rounded-xl text-xs font-extrabold border active:scale-95 transition-all tabular-nums",
                          !canAfford
                            ? "bg-white/5 text-white/25 border-white/5"
                            : isActive
                              ? "bg-gradient-to-br from-amber-400 via-pink-500 to-purple-500 text-white border-pink-300/50 shadow-[0_4px_14px_-4px_rgba(236,72,153,0.5)]"
                              : "bg-white/10 text-white/85 border-white/10 hover:bg-white/15"
                        )}
                        style={{ WebkitTapHighlightColor: 'transparent' }}
                      >
                        x{n}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}


            {/* Send / COMBO Button — Bigo / TikTok Live style */}
            {comboCount === 0 ? (
              <button
                onClick={handleSend}
                disabled={!hasBalance}
                className={cn(
                  "relative w-full py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform overflow-hidden",
                  hasBalance
                    ? "bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 text-white animate-[giftSendBreathe_2.4s_ease-in-out_infinite]"
                    : "bg-white/10 text-white/30"
                )}
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                {hasBalance && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 left-0 w-1/3 animate-[giftSendShine_2.6s_ease-in-out_infinite]"
                    style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)' }}
                  />
                )}
                <Send className="w-4 h-4 relative" />
                <span className="relative">Send</span>
                <Sparkles className="w-3.5 h-3.5 relative" />
              </button>
            ) : (
              <div className="flex items-center justify-end gap-3">
                <div className="flex flex-col items-end leading-tight mr-1">
                  <span className="text-[10px] text-white/70 font-medium">Combo</span>
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
                    hasBalance ? "animate-[giftComboPulse_1.4s_ease-in-out_infinite]" : "opacity-50"
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
                  <div className="absolute inset-1.5 rounded-full bg-gradient-to-br from-pink-500 via-fuchsia-500 to-purple-600 flex flex-col items-center justify-center overflow-hidden">
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-y-0 left-0 w-1/2 animate-[giftSendShine_1.8s_ease-in-out_infinite]"
                      style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)' }}
                    />
                    <span className="text-white font-black text-base leading-none relative">COMBO</span>
                    <span className="text-white/90 font-bold text-[10px] leading-none mt-0.5 relative">Tap!</span>
                  </div>
                </button>
              </div>
            )}

            {/* Insufficient Balance Warning */}
            {!hasBalance && (
              <p className="text-red-400 text-[10px] text-center mt-1.5">
                Insufficient Diamonds. Please recharge!
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

export default memo(GiftPanel);
