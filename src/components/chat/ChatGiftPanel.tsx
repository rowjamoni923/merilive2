import { useState, useEffect, memo, useCallback, useMemo, useRef } from "react";
import { X, Gift, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import Diamond3DIcon from "@/components/common/Diamond3DIcon";
import { getCachedGifts, getGiftsWithFetch, hasGiftCache, subscribeToGiftCache } from "@/hooks/useGiftPrefetch";

const HEAVY_ANIMATION_ASSET_PATTERN = /\.(svga|json)(\?|$)/i;

const normalizeGiftAssetUrl = (url?: string | null) => {
  if (!url) return null;
  if (url.startsWith('http') || url.startsWith('/')) return url;
  if (url.includes('/storage/v1/object/public/')) return url.startsWith('http') ? url : `https://${window.location.host}${url.startsWith('/') ? '' : '/'}${url}`;
  return null;
};

const getDisplayUrl = (iconUrl?: string | null, animationUrl?: string | null) => {
  const normalizedIconUrl = normalizeGiftAssetUrl(iconUrl);
  if (normalizedIconUrl && !HEAVY_ANIMATION_ASSET_PATTERN.test(normalizedIconUrl)) return normalizedIconUrl;
  const normalizedAnimationUrl = normalizeGiftAssetUrl(animationUrl);
  if (normalizedAnimationUrl && !HEAVY_ANIMATION_ASSET_PATTERN.test(normalizedAnimationUrl)) return normalizedAnimationUrl;
  return normalizedIconUrl || normalizedAnimationUrl;
};

interface GiftData {
  id: string;
  name: string;
  emoji: string;
  coins: number;
  category: string;
  icon_url?: string | null;
  animation_url?: string | null;
}

interface GiftCategory {
  id: string;
  name: string;
  icon: string;
  gradient: string;
}

const defaultCategories: GiftCategory[] = [
  { id: "wall", name: "Wall", icon: "🏠", gradient: "from-slate-500 to-gray-600" },
  { id: "lucky", name: "Lucky", icon: "🎰", gradient: "from-yellow-400 to-amber-500" },
  { id: "luxurious", name: "Luxurious", icon: "👑", gradient: "from-yellow-500 to-amber-600" },
  { id: "vip", name: "VIP", icon: "💎", gradient: "from-purple-500 to-pink-600" },
  { id: "pro", name: "Pro", icon: "🚀", gradient: "from-cyan-500 to-blue-600" },
];

interface ChatGiftPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSendGift: (gift: { id: string; name: string; icon: string; coins: number }) => void;
  userCoins?: number;
}

// Memoized Gift Item Component
const GiftItem = memo(({ 
  gift, 
  isSelected, 
  onSelect, 
  formatCoins 
}: { 
  gift: GiftData; 
  isSelected: boolean; 
  onSelect: () => void;
  formatCoins: (n: number) => string;
}) => (
  <button
    onClick={onSelect}
    className={cn(
      "relative flex flex-col items-center gap-1 p-2 rounded-xl overflow-hidden transition-all duration-150 active:scale-95",
      isSelected
        ? "bg-gradient-to-br from-pink-500/30 via-purple-500/30 to-blue-500/30 ring-2 ring-pink-400"
        : "bg-muted/30 active:bg-muted/50 border border-border/30"
    )}
  >
    <div className="relative w-11 h-11 flex items-center justify-center">
      {gift.icon_url ? (
        gift.icon_url.split('?')[0].toLowerCase().endsWith('.svga') ? (
          <div className="w-11 h-11">
            <img src={gift.icon_url} alt={gift.name} className="w-11 h-11 object-contain" 
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          </div>
        ) : (
          <img
            src={gift.icon_url}
            alt={gift.name}
            loading="lazy"
            decoding="async"
            className="w-11 h-11 object-contain"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )
      ) : (
        <div className="w-11 h-11 rounded-lg bg-white/5" />
      )}
    </div>
    
    <span className="text-[9px] font-semibold text-foreground/90 truncate max-w-full">
      {gift.name}
    </span>
    
    <div className={cn(
      "flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[8px] font-bold border",
      gift.coins >= 10000 
        ? "bg-gradient-to-r from-amber-500/20 to-orange-500/20 border-amber-400/30" 
        : gift.coins >= 1000
          ? "bg-gradient-to-r from-purple-500/20 to-pink-500/20 border-purple-400/30"
          : "bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border-cyan-400/20"
    )}>
      <Diamond3DIcon size={9} />
      <span className="bg-gradient-to-r from-cyan-300 to-purple-400 bg-clip-text text-transparent">
        {formatCoins(gift.coins)}
      </span>
    </div>
  </button>
));
GiftItem.displayName = 'GiftItem';

function ChatGiftPanelComponent({ isOpen, onClose, onSendGift, userCoins: propUserCoins }: ChatGiftPanelProps) {
  const [activeCategory, setActiveCategory] = useState<string>("wall"); // Pkg4-pass4: was "popular" which had no matching category → empty grid on open
  const [selectedGift, setSelectedGift] = useState<GiftData | null>(null);
  const [gifts, setGifts] = useState<GiftData[]>([]);
  const [loading, setLoading] = useState(!hasGiftCache());
  const [userCoins, setUserCoins] = useState(propUserCoins || 0);
  const sendingRef = useRef(false);

  // Pkg4-pass4: sync prop changes (parent balance updates were ignored after mount)
  useEffect(() => {
    if (typeof propUserCoins === 'number') setUserCoins(propUserCoins);
  }, [propUserCoins]);

  // Pkg4-pass4: clear selection + release send guard when sheet closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedGift(null);
      sendingRef.current = false;
    }
  }, [isOpen]);

  // Transform cached gifts to component format
  const transformGifts = useCallback((rawGifts: any[]): GiftData[] => {
    return rawGifts.map((gift) => ({
      id: gift.id,
      name: gift.name,
      emoji: '', // No defaults - only DB assets
      coins: gift.coin_value,
      category: gift.category || 'wall',
      icon_url: getDisplayUrl(gift.icon_url, gift.animation_url),
      animation_url: normalizeGiftAssetUrl(gift.animation_url),
    }));
  }, []);

  // Load gifts - use cache first, then fetch if needed
  useEffect(() => {
    if (!isOpen) return;

    const unsubscribe = subscribeToGiftCache(() => {
      const latest = getCachedGifts();
      if (latest.length > 0) {
        setGifts(transformGifts(latest));
        setLoading(false);
      }
    });

    // Use cached gifts immediately (instant display)
    const cached = getCachedGifts();
    if (cached.length > 0) {
      setGifts(transformGifts(cached));
      setLoading(false);
      return unsubscribe;
    }

    // Fallback: fetch if no cache
    setLoading(true);
    getGiftsWithFetch().then((data) => {
      setGifts(transformGifts(data));
      setLoading(false);
    });

    return unsubscribe;
  }, [isOpen, transformGifts]);

  // Fetch user balance (parallel with gifts)
  useEffect(() => {
    if (!isOpen) return;

    const fetchBalance = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profile } = await supabase
          .from("profiles")
          .select("coins")
          .eq("id", user.id)
          .single();

        if (profile) {
          setUserCoins(profile.coins || 0);
        }
      } catch (error) {
        console.error("Error fetching balance:", error);
      }
    };

    fetchBalance();
  }, [isOpen]);

  // Memoized category gifts
  const getCategoryGifts = useCallback((categoryId: string) => {
    if (categoryId === "all") return gifts;
    return gifts.filter((g) => g.category === categoryId);
  }, [gifts]);

  const currentGifts = useMemo(() => 
    getCategoryGifts(activeCategory), 
    [getCategoryGifts, activeCategory]
  );

  // Available categories
  const availableCategories = useMemo(() => 
    defaultCategories.filter((cat) => getCategoryGifts(cat.id).length > 0), 
    [getCategoryGifts]
  );

  // Pkg4-pass4: auto-switch active category to first available if current one has zero gifts
  useEffect(() => {
    if (availableCategories.length === 0) return;
    if (!availableCategories.some((c) => c.id === activeCategory)) {
      setActiveCategory(availableCategories[0].id);
    }
  }, [availableCategories, activeCategory]);

  const handleGiftSelect = useCallback((gift: GiftData) => {
    setSelectedGift(prev => prev?.id === gift.id ? null : gift);
  }, []);

  const handleSend = useCallback(() => {
    if (sendingRef.current) return; // Pkg4-pass4: double-tap guard
    if (!selectedGift || userCoins < selectedGift.coins) return;
    sendingRef.current = true;
    try {
      onSendGift({
        id: selectedGift.id,
        name: selectedGift.name,
        icon: selectedGift.emoji || '🎁',
        coins: selectedGift.coins,
      });
      setSelectedGift(null);
      onClose();
    } finally {
      setTimeout(() => { sendingRef.current = false; }, 350);
    }
  }, [selectedGift, userCoins, onSendGift, onClose]);

  const formatCoins = useCallback((coins: number) => {
    if (coins >= 1000000) return `${(coins / 1000000).toFixed(1)}M`;
    if (coins >= 1000) return `${(coins / 1000).toFixed(coins >= 10000 ? 0 : 1)}K`;
    return coins.toString();
  }, []);

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent 
        side="bottom" 
        className="h-[60vh] rounded-t-[28px] p-0 border-0 bg-gradient-to-b from-amber-50 via-rose-50 to-orange-50 [&>button]:hidden"
        style={{ 
          paddingBottom: 'env(safe-area-inset-bottom, 0px)', 
          zIndex: 9999,
          contain: 'layout'
        }}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        {/* Header */}
        <div className="relative overflow-hidden flex-shrink-0" style={{ minHeight: '60px' }}>
          <div className="absolute inset-0 bg-gradient-to-r from-pink-500/10 via-purple-500/10 to-cyan-500/10" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-1 bg-gradient-to-r from-transparent via-white/40 to-transparent rounded-full mt-2" />
          
          <div className="relative flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-pink-500 via-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/40">
                <Gift className="w-4 h-4 text-white drop-shadow-lg" />
              </div>
              <div>
                <h3 className="font-bold text-white text-sm tracking-wide">Send Gift</h3>
                <p className="text-[9px] text-muted-foreground font-medium">Choose a premium gift</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 bg-gradient-to-r from-cyan-500/15 to-blue-500/15 backdrop-blur-xl px-3 py-1.5 rounded-full border border-cyan-400/30 shadow-lg shadow-cyan-500/10">
                <Diamond3DIcon size={16} className="drop-shadow-lg" />
                <span className="text-xs font-bold bg-gradient-to-r from-cyan-300 to-blue-400 bg-clip-text text-transparent">
                  {formatCoins(userCoins)}
                </span>
              </div>
              
              <button 
                onClick={onClose} 
                className="w-8 h-8 rounded-full bg-muted/50 active:bg-muted backdrop-blur-xl flex items-center justify-center border border-border/50 transition-colors duration-150"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </div>
        </div>

        {/* Category Tabs */}
        <div className="border-b border-border/30 bg-background/20 flex-shrink-0">
          <ScrollArea className="w-full">
            <div className="flex gap-1.5 px-4 py-2">
              {availableCategories.map((category) => {
                const count = getCategoryGifts(category.id).length;
                const isActive = activeCategory === category.id;
                return (
                  <button
                    key={category.id}
                    onClick={() => setActiveCategory(category.id)}
                    className={cn(
                      "relative flex items-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-semibold whitespace-nowrap border transition-all duration-200 active:scale-95",
                      isActive
                        ? "bg-gradient-to-r from-pink-500/90 via-purple-500/90 to-indigo-500/90 text-white border-purple-400/50 shadow-md shadow-purple-500/30"
                        : "bg-muted/50 text-muted-foreground active:bg-muted border-border/50"
                    )}
                  >
                    <span className="text-sm">{category.icon}</span>
                    <span>{category.name}</span>
                    {count > 0 && (
                      <span className={cn(
                        "ml-0.5 text-[9px] px-1.5 py-0.5 rounded-full font-bold",
                        isActive ? "bg-white/30 text-white" : "bg-muted text-muted-foreground"
                      )}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <ScrollBar orientation="horizontal" className="hidden" />
          </ScrollArea>
        </div>

        {/* Gift Grid */}
        <ScrollArea className="flex-1" style={{ height: 'calc(60vh - 180px)' }}>
          <div className="grid grid-cols-4 gap-2 p-3" style={{ contain: 'layout' }}>
            {loading ? (
              // Minimal skeleton - just 4 items for speed
              Array.from({ length: 4 }).map((_, i) => (
                <div 
                  key={i}
                  className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-muted/30 animate-pulse"
                >
                  <div className="w-12 h-12 rounded-full bg-muted/50" />
                  <div className="w-14 h-2 bg-muted/50 rounded" />
                </div>
              ))
            ) : currentGifts.length === 0 ? (
              <div className="col-span-4 py-12 text-center">
                <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-muted/30 flex items-center justify-center">
                  <Gift className="w-10 h-10 text-muted-foreground/50" />
                </div>
                <p className="text-muted-foreground text-sm font-medium">No gifts in this category</p>
              </div>
            ) : (
              currentGifts.map((gift) => (
                <GiftItem
                  key={gift.id}
                  gift={gift}
                  isSelected={selectedGift?.id === gift.id}
                  onSelect={() => handleGiftSelect(gift)}
                  formatCoins={formatCoins}
                />
              ))
            )}
          </div>
        </ScrollArea>

        {/* Send Button Section */}
        <div
          className={cn(
            "absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-background via-background/95 to-transparent border-t border-border/30 flex-shrink-0",
            selectedGift ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
          style={{ 
            paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
            minHeight: '100px',
            transition: 'opacity 150ms ease-out'
          }}
        >
          {selectedGift && (
            <>
              <div className="flex items-center gap-3">
                {/* Selected Gift Preview */}
                <div className="flex items-center gap-2 flex-1 bg-muted/30 rounded-xl p-2 border border-border/30">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-pink-500/20 to-purple-500/20 flex items-center justify-center flex-shrink-0">
                    {selectedGift.icon_url ? (
                      <img
                        src={selectedGift.icon_url}
                        alt={selectedGift.name}
                        className="w-8 h-8 object-contain"
                      />
                    ) : (
                      <span className="text-2xl">{selectedGift.emoji || '🎁'}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-foreground text-xs truncate">{selectedGift.name}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Diamond3DIcon size={11} />
                      <span className="text-[10px] font-semibold bg-gradient-to-r from-cyan-300 to-purple-400 bg-clip-text text-transparent">
                        {formatCoins(selectedGift.coins)}
                      </span>
                    </div>
                  </div>
                </div>
                
                {/* Send Button */}
                <button
                  onClick={handleSend}
                  disabled={userCoins < selectedGift.coins}
                  className={cn(
                    "flex items-center gap-1.5 px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg transition-all duration-150 active:scale-95 flex-shrink-0",
                    userCoins >= selectedGift.coins
                      ? "bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 text-white shadow-purple-500/30"
                      : "bg-muted text-muted-foreground cursor-not-allowed"
                  )}
                >
                  <Send className="w-4 h-4" />
                  <span>Send</span>
                </button>
              </div>
              
              {/* Insufficient Balance Warning */}
              {userCoins < selectedGift.coins && (
                <p className="text-[10px] text-destructive text-center mt-2 font-medium">
                  Insufficient diamonds • Need {formatCoins(selectedGift.coins - userCoins)} more
                </p>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Export with memo for performance
export const ChatGiftPanel = memo(ChatGiftPanelComponent);
