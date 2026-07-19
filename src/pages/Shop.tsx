import { useState, useEffect, useRef, Suspense, lazy } from "react";
import { PageSkeleton } from "@/components/common/PageSkeleton";
import { usePersistedCache } from "@/hooks/usePersistedCache";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Skeleton as SkeletonPrim } from "@/components/Skeleton";
import { 
  ArrowLeft, 
  Crown, 
  Sparkles, 
  Star, 
  Car, 
  MessageCircle, 
  Award,
  Check,
  Lock,
  ShoppingBag,
  Image,
  Gift,
  Smile,
  Sofa,
  Home,
  Wand2,
  Eye,
  Plus,
  Shield,
  Search,
  Bell,
  Menu,
  ImageOff,
  Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import Diamond3DIcon from "@/components/common/Diamond3DIcon";
import Premium3DFrame from "@/components/common/Premium3DFrame";

import FixedAnimationFrame from "@/components/common/FixedAnimationFrame";
import EntryNameBarPreview from "@/components/live/EntryNameBarPreview";
import { clearFrameCache } from "@/components/common/AvatarWithFrame";
import { clearEntryAnimationCache } from "@/utils/fetchEntryAnimation";
import { recordClientError } from "@/utils/clientErrorLog";
import { enhanceThumbnail } from "@/utils/enhanceThumbnail";

// Lazy load SVGAPlayerWithAudio for full-screen entry animation previews with sound
const SVGAPlayerWithAudio = lazy(() => import("@/components/common/SVGAPlayerWithAudio"));

interface ShopItem {
  id: string;
  name: string;
  description: string | null;
  category: string;
  preview_url: string | null;
  animation_url: string | null;
  animation_file_url: string | null;
  price_diamonds: number;
  duration_days: number | null;
  min_level: number;
  rarity: string;
  is_featured: boolean;
  is_premium: boolean;
  animation_type: string | null;
  file_type: string | null;
  animation_format?: string | null;
  animation_config_url?: string | null;
}

// Pkg430 — unified animation detection across Shop/Admin/App (mirrors UniversalAnimationPlayer).
// Treats any .mp4 with "vap" / "_bmp" / "file_vap_" in the filename, or explicit
// animation_format='vap', as VAP so the alpha-channel renderer is used.
const pickAnimType = (item: Pick<ShopItem, 'animation_format' | 'animation_file_url' | 'animation_url' | 'preview_url' | 'file_type'>):
  'svga' | 'lottie' | 'vap' | 'mp4' | 'webm' | 'gif' | 'webp' | 'png' | 'static' | undefined => {
  const fmt = (item.animation_format || '').toLowerCase();
  if (fmt === 'vap') return 'vap';
  if (fmt === 'svga') return 'svga';
  if (fmt === 'lottie') return 'lottie';
  if (fmt === 'mp4') return 'mp4';
  if (fmt === 'webm') return 'webm';
  if (fmt === 'gif') return 'gif';
  if (fmt === 'webp') return 'webp';
  if (fmt === 'png') return 'png';
  const url = (item.animation_file_url || item.animation_url || item.preview_url || '').toLowerCase().split('?')[0];
  if (url.endsWith('.svga')) return 'svga';
  if (url.endsWith('.json')) return 'lottie';
  if (url.endsWith('.mp4')) {
    if (url.includes('vap') || url.includes('_bmp') || url.includes('file_vap_')) return 'vap';
    return 'mp4';
  }
  if (url.endsWith('.webm')) return 'webm';
  if (url.endsWith('.gif')) return 'gif';
  if (url.endsWith('.webp')) return 'webp';
  if (url.endsWith('.png')) return 'png';
  return undefined;
};

const isAnimatedType = (t?: string) => !!t && t !== 'static' && t !== 'png';

interface UserPurchase {
  id: string;
  item_id: string;
  is_equipped: boolean;
  expires_at: string | null;
}

// Categories
const categories = [
  { id: "all", name: "All", icon: ShoppingBag },
  { id: "frame", name: "Frames", icon: Crown },
  { id: "portrait_frame", name: "Portrait", icon: Crown },
  { id: "entrance", name: "Entrance", icon: Sparkles },
  { id: "entrance_effect", name: "Entry Effect", icon: Sparkles },
  { id: "entry_bar", name: "Entry Bar", icon: Sparkles },
  { id: "vehicle", name: "Vehicles", icon: Car },
  { id: "bubble", name: "Bubbles", icon: MessageCircle },
  { id: "badge", name: "Badges", icon: Award },
  { id: "party_background", name: "Party BG", icon: Image },
  { id: "seat_effect", name: "Seat Effects", icon: Sofa },
  { id: "gift_effect", name: "Gift Effects", icon: Gift },
  { id: "privilege_gift", name: "VIP Gift", icon: Gift },
  { id: "privilege_sticker", name: "Stickers", icon: Smile },
  { id: "profile_decoration", name: "Profile", icon: Wand2 },
  { id: "room_theme", name: "Room Theme", icon: Home },
  { id: "emoji", name: "Emojis", icon: Smile },
  { id: "lucky_gift", name: "Lucky Gift", icon: Star },
];

// Entry animation categories that need full-width display
const isEntryAnimationCategory = (category: string) => 
  ['entrance', 'entrance_effect', 'entry_bar', 'entry_banner', 'entry_name_bar', 'vehicle'].includes(category);

// Entry NAME BAR variants — these get the engraved avatar+name+level overlay
// (matches in-room EntryNameBarAnimation). Cars/vehicles do NOT.
const isEntryNameBarCategory = (category: string) =>
  ['entry_bar', 'entry_banner', 'entry_name_bar', 'entry_bar_effect'].includes(category);

const shouldClearEntryAnimationCache = (category: string) =>
  ['entrance', 'entrance_effect', 'entry_banner', 'entry_bar', 'entry_name_bar', 'vehicle', 'vehicle_entrance'].includes(category);

// Shop Item Card Component - Luxury Style matching reference
const ShopItemCard = ({ 
  item, 
  index, 
  owned, 
  onPreview,
  isFullWidth = false,
  viewerName,
  viewerAvatar,
  viewerLevel,
}: { 
  item: ShopItem; 
  index: number; 
  owned: boolean; 
  onPreview: () => void;
  isFullWidth?: boolean;
  viewerName: string;
  viewerAvatar: string | null;
  viewerLevel: number;
}) => {
  const [imageError, setImageError] = useState(false);
  // Viewport gate — only mount heavy animation players for cards that are
  // (or were) actually on screen. Without this, every shop item spins up a
  // SVGA / VAP / Lottie / MP4 decoder at mount, which is the main reason
  // animations "take forever to start" — the browser is decoding dozens of
  // assets at once instead of just the few you can see.
  const cardRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { setInView(true); return; }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            io.disconnect(); // once visible, keep it mounted (no flicker on re-scroll)
            return;
          }
        }
      },
      { rootMargin: '200px 0px', threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={cardRef}
      onClick={onPreview}
      onPointerDown={() => {
        // Pre-warm asset + animation chunk so detail modal opens with zero delay
        const src = item.animation_file_url || item.preview_url;
        if (src) {
          if (src.endsWith('.svga')) {
            import('@/components/common/SVGAPlayerWithAudio');
            try { fetch(src, { mode: 'cors' }).catch(() => {}); } catch {}
          } else if (src.endsWith('.json')) {
            import('lottie-react' as any).catch(() => {});
            try { fetch(src, { mode: 'cors' }).catch(() => {}); } catch {}
          } else {
            const img = new window.Image();
            img.src = src;
          }
        }
      }}
      className="relative rounded-2xl overflow-hidden cursor-pointer group transition-transform duration-200 hover:-translate-y-0.5 active:scale-[0.98]"
      style={{
        background: 'linear-gradient(160deg, #FFFBF2 0%, #FAF5EA 50%, #F5EFDF 100%)',
        border: '1px solid rgba(217,182,107,0.40)',
        boxShadow: '0 10px 28px -10px rgba(180,140,40,0.22), 0 2px 6px -2px rgba(180,140,40,0.10), inset 0 1px 0 rgba(255,255,255,0.85), inset 0 -2px 4px rgba(180,140,40,0.05)',
        contain: 'content',
      }}
    >
      {/* Featured indicator */}
      {item.is_featured && (
        <div className="absolute top-2 right-2 z-10">
          <div
            className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-300 via-amber-400 to-orange-500 flex items-center justify-center"
            style={{ boxShadow: '0 6px 14px -4px rgba(245,158,11,0.55), inset 0 1px 0 rgba(255,255,255,0.6)' }}
          >
            <Zap className="w-3.5 h-3.5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.25)]" />
          </div>
        </div>
      )}

      {/* Owned checkmark */}
      {owned && (
        <div className="absolute top-2 left-2 z-10">
          <div
            className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-300 via-emerald-500 to-green-600 flex items-center justify-center"
            style={{ boxShadow: '0 6px 14px -4px rgba(16,185,129,0.55), inset 0 1px 0 rgba(255,255,255,0.55)' }}
          >
            <Check className="w-3.5 h-3.5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.25)]" />
          </div>
        </div>
      )}

      {/* Preview Area */}
      <div className={`${isFullWidth ? (isEntryNameBarCategory(item.category) ? 'aspect-[1024/280]' : 'aspect-[16/10] min-h-[160px]') : 'aspect-square'} flex items-center justify-center ${isEntryNameBarCategory(item.category) ? 'p-0' : 'p-3'} relative overflow-hidden`}>
        {/* Subtle radial glow */}
        <div
          className="absolute inset-0 opacity-70 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
          style={{
            background: 'radial-gradient(circle at center, rgba(251,191,36,0.22) 0%, rgba(255,251,242,0.0) 70%)',
          }}
        />

        {(() => {
          const animType = pickAnimType(item);
          const animSrc = item.animation_file_url || item.animation_url || '';
          const previewIsStatic = item.preview_url && !item.preview_url.match(/\.(svga|json|mp4|webm)(\?|$)/i);

          // PRIORITY 0 — Entry Name Bar: composited preview with engraved
          // avatar + name + level + animation (matches in-room exactly).
          if (isEntryNameBarCategory(item.category) && inView) {
            return (
              <EntryNameBarPreview
                animationUrl={animSrc || null}
                previewUrl={item.preview_url}
                userName={viewerName}
                avatarUrl={viewerAvatar}
                level={viewerLevel}
                className="absolute inset-0"
              />
            );
          }

          // PRIORITY 1 — Admin-uploaded static logo wins (centered, uniform size).
          if (previewIsStatic && !imageError) {
            return (
              <img
                src={enhanceThumbnail(item.preview_url!, { width: 256, quality: 85 })}
                alt={item.name}
                loading="eager"
                decoding="async"
                {...({ fetchpriority: 'high' } as any)}
                className="w-[72%] h-[72%] object-contain drop-shadow-2xl group-hover:scale-105 transition-transform duration-300 mx-auto block"
                onError={() => setImageError(true)}
              />
            );
          }

          // PRIORITY 2 — No logo uploaded: play the actual animation directly
          // on the card so the user sees the asset (SVGA / VAP / MP4 / Lottie / GIF).
          // Centered + same visual footprint as the logo branch.
          if (animSrc && isAnimatedType(animType) && !imageError) {
            return (
              <div className="w-[72%] h-[72%] mx-auto flex items-center justify-center">
                {inView ? (
                  <FixedAnimationFrame
                    src={animSrc}
                    type={animType as any}
                    configSrc={item.animation_config_url || undefined}
                    size="fill"
                    loop
                    autoPlay
                    muted
                    background="none"
                    onError={() => setImageError(true)}
                  />
                ) : (
                  // Lightweight placeholder while card is off-screen so the
                  // browser doesn't decode dozens of animations at once.
                  <div className="w-full h-full rounded-xl bg-amber-100/40 border border-amber-300/30" />
                )}
              </div>
            );
          }

          return (
            <div
              className="w-16 h-16 rounded-2xl bg-amber-100/40 flex items-center justify-center border border-amber-300/40 mx-auto"
              style={{ boxShadow: 'inset 0 2px 6px rgba(180,140,40,0.10)' }}
            >
              <Shield className="w-10 h-10 text-amber-600/50" strokeWidth={1.5} />
            </div>
          );
        })()}
      </div>


      {/* Item Info */}
      <div className="px-3 pb-3 space-y-2">
        {/* Name */}
        <p className="text-heading text-sm font-semibold truncate text-center">{item.name}</p>

        {/* Price with diamond icon */}
        <div
          className="flex items-center justify-center gap-1.5 mx-auto w-fit px-2.5 py-1 rounded-full"
          style={{
            background: 'linear-gradient(135deg, rgba(251,191,36,0.18) 0%, rgba(217,182,107,0.12) 100%)',
            border: '1px solid rgba(217,182,107,0.35)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)',
          }}
        >
          <Diamond3DIcon size={14} />
          <span className="text-heading text-xs font-bold">
            {item.price_diamonds.toLocaleString()}
            {item.duration_days && (
              <span className="text-body font-normal">/{item.duration_days}d</span>
            )}
          </span>
        </div>

        {/* Purchase / Owned Button */}
        {owned ? (
          <div
            className="w-full py-2 rounded-full text-center text-xs font-bold text-emerald-700"
            style={{
              background: 'linear-gradient(135deg, rgba(16,185,129,0.18) 0%, rgba(5,150,105,0.12) 100%)',
              border: '1px solid rgba(16,185,129,0.40)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6)',
            }}
          >
            ✓ Owned
          </div>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); onPreview(); }}
            className="w-full py-2 rounded-full text-xs font-bold text-white transition-all duration-300 hover:-translate-y-0.5 active:scale-95"
            style={{
              background: 'linear-gradient(135deg, hsl(243 75% 55%) 0%, hsl(270 75% 55%) 50%, hsl(292 84% 60%) 100%)',
              boxShadow: '0 8px 20px -6px rgba(147,51,234,0.55), inset 0 1px 0 rgba(255,255,255,0.30), inset 0 -2px 4px rgba(0,0,0,0.15)',
              textShadow: '0 1px 2px rgba(0,0,0,0.20)',
            }}
          >
            Purchase
          </button>
        )}
      </div>
    </div>
  );
};

const Shop = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [itemsCache, setItemsCache, hadItemsCache] = usePersistedCache<ShopItem[]>("shop:items", []);
  const [purchasesCache, setPurchasesCache, hadPurchasesCache] = usePersistedCache<UserPurchase[]>("shop:purchases", []);
  const items = itemsCache ?? [];
  const purchases = purchasesCache ?? [];
  const setItems = (next: ShopItem[]) => setItemsCache(next);
  const setPurchases = (next: UserPurchase[] | ((prev: UserPurchase[]) => UserPurchase[])) =>
    setPurchasesCache((prev) => (typeof next === 'function' ? (next as any)(prev ?? []) : next));
  const [userDiamonds, setUserDiamonds] = useState(0);
  const [userLevel, setUserLevel] = useState(() => {
    try {
      const cached = localStorage.getItem('meri_level_cache');
      if (cached) {
        const data = JSON.parse(cached);
        return data.level || 0;
      }
    } catch {}
    return 0;
  });
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("You");
  const [userFrameId, setUserFrameId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(!(hadItemsCache && hadPurchasesCache));
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedItem, setSelectedItem] = useState<ShopItem | null>(null);
  const [purchasing, setPurchasing] = useState(false);

  useEffect(() => {
    // Pre-warm SVGA + Lottie chunks immediately so card-tap previews are instant
    import('@/components/common/SVGAPlayerWithAudio').catch(() => {});
    import('lottie-react' as any).catch(() => {});
    fetchData();
    
    // Use universal realtime instead of manual channel
    let unsubscribe: (() => void) | undefined;
    import('@/hooks/useUniversalRealtime').then(({ subscribeToTables }) => {
      unsubscribe = subscribeToTables(
        `shop-page-${Date.now()}`,
        ['shop_items', 'user_purchases'],
        () => {
          fetchData();
        }
      );
    });

    return () => { unsubscribe?.(); };
  }, []);

  const fetchData = async () => {
    try {
      const { getCachedUser } = await import('@/utils/cachedAuth');
      const user = await getCachedUser();
      if (!user) { navigate("/auth"); return; }
      setCurrentUserId(user.id);

      const { data: profile } = await supabase
        .from("profiles")
        .select("diamonds, user_level, avatar_url, frame_id, equipped_frame_id, display_name, username")
        .eq("id", user.id)
        .single();

      if (profile) {
        setUserDiamonds(profile.diamonds || 0);
        setUserLevel(profile.user_level || 0);
        setUserAvatar(profile.avatar_url);
        setUserFrameId(profile.frame_id);
        setUserName((profile as any).display_name || (profile as any).username || "You");
      }


      const { data: shopItems } = await supabase
        .from("shop_items")
        .select("*")
        .eq("is_active", true)
        .order("display_order");

      const { data: partyBackgrounds } = await supabase
        .from("party_room_backgrounds")
        .select("*")
        .eq("is_active", true)
        .eq("is_premium", true)
        .not("image_url", "is", null)
        .order("display_order");

      const allItems: ShopItem[] = [];
      if (shopItems) {
        const realItems = shopItems.filter((item: any) => 
          (item.animation_url && item.animation_url.trim() !== '') ||
          (item.animation_file_url && item.animation_file_url.trim() !== '')
        );
        allItems.push(...(realItems as ShopItem[]));
      }

      if (partyBackgrounds) {
        const bgItems: ShopItem[] = partyBackgrounds
          .filter(bg => bg.image_url && bg.image_url.trim() !== '')
          .map((bg: any) => ({
            id: `bg_${bg.id}`,
            name: bg.name,
            description: bg.category === 'premium' ? 'Premium Party Background' : 'Party Background',
            category: 'party_background',
            preview_url: bg.image_url,
            animation_url: null,
            animation_file_url: bg.image_url,
            price_diamonds: bg.price_diamonds || 500,
            duration_days: null,
            min_level: 0,
            rarity: 'epic',
            is_featured: false,
            is_premium: true,
            animation_type: 'image',
            file_type: 'image',
          }));
        allItems.push(...bgItems);
      }
      setItems(allItems);

      const { data: userPurchases } = await supabase
        .from("user_purchases")
        .select("id, item_id, is_equipped, expires_at")
        .eq("user_id", user.id)
        .eq("is_active", true);

      const { data: purchasedBgs } = await (supabase
        .from("user_purchased_backgrounds" as any)
        .select("id, background_id, is_active")
        .eq("user_id", user.id)
        .eq("is_active", true) as any);

      const allPurchases: UserPurchase[] = [];
      if (userPurchases) allPurchases.push(...(userPurchases as UserPurchase[]));
      if (purchasedBgs) {
        for (const bg of purchasedBgs) {
          allPurchases.push({ id: bg.id, item_id: `bg_${bg.background_id}`, is_equipped: true, expires_at: null });
        }
      }
      setPurchases(allPurchases);
    } catch (error) {
      console.error("Error fetching data:", error);
      recordClientError({ label: "Shop.allPurchases", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async (item: ShopItem) => {
    if (purchasing) return;
    setPurchasing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/auth"); return; }

      if (userDiamonds < item.price_diamonds) {
        toast({ title: "Insufficient Diamonds", description: "You don't have enough diamonds for this purchase.", variant: "destructive" });
        return;
      }

      const isPartyBackground = item.id.startsWith('bg_');
      const actualItemId = isPartyBackground ? item.id.replace('bg_', '') : item.id;

      if (isPartyBackground) {
        // Pkg318: secure atomic purchase via SECURITY DEFINER RPC
        // (direct insert no longer allowed by RLS)
        const { data: bgData, error: bgError } = await (supabase as any).rpc('purchase_party_background', {
          _background_id: actualItemId,
        });
        if (bgError) throw bgError;
        const bgResult = bgData as any;
        if (!bgResult?.success) throw new Error(bgResult?.error || 'Purchase failed');

        const newBalance = Number(bgResult.new_balance ?? (userDiamonds - (bgResult.price_paid ?? item.price_diamonds)));
        setUserDiamonds(Number.isFinite(newBalance) ? newBalance : userDiamonds - item.price_diamonds);
        setPurchases(prev => [...prev, { id: crypto.randomUUID(), item_id: item.id, is_equipped: true, expires_at: null }]);
      } else {

        const { data: purchaseData, error: purchaseError } = await (supabase as any).rpc("purchase_shop_item", {
          _item_id: actualItemId,
          _equip: true,
        });
        if (purchaseError) throw purchaseError;
        const purchaseResult = purchaseData as any;
        if (!purchaseResult?.success) throw new Error(purchaseResult?.error || 'Purchase failed');
        setUserDiamonds(purchaseResult.balance_after ?? (userDiamonds - item.price_diamonds));
        setPurchases(prev => [...prev, { id: purchaseResult.purchase_id || crypto.randomUUID(), item_id: item.id, is_equipped: true, expires_at: purchaseResult.expires_at || null }]);
        if (item.category === 'frame' || item.category === 'portrait_frame') {
          clearFrameCache();
        }
        if (shouldClearEntryAnimationCache(item.category)) {
          clearEntryAnimationCache();
        }
      }

      toast({ title: "Purchase Successful!", description: `You now own ${item.name}` });
      setSelectedItem(null);
      void fetchData();
    } catch (error: any) {
      recordClientError({ label: "Shop.handlePurchase", message: error instanceof Error ? error.message : String(error) });
      toast({ title: "Purchase Failed", description: error.message, variant: "destructive" });
    } finally {
      setPurchasing(false);
    }
  };

  const isOwned = (itemId: string) => purchases.some(p => p.item_id === itemId);
  const canAfford = (price: number) => userDiamonds >= price;
  const meetsLevel = (minLevel: number) => userLevel >= minLevel;

  const filteredItems = selectedCategory === "all" 
    ? items 
    : items.filter(item => item.category === selectedCategory);

  if (loading) {
    return <PageSkeleton className="mobile-page flex flex-col" rows={6} hero />;
  }

  return (
    <div
      data-page="shop"
      className="fixed inset-0 flex flex-col overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, #FFFBF2 0%, #FAF5EA 40%, #F5EFDF 100%)',
      }}
    >
      {/* Header - Light luxury glass */}
      <div
        className="sticky top-0 z-50 safe-area-top"
        style={{
          background: 'linear-gradient(135deg, rgba(255,251,242,0.92) 0%, rgba(245,239,223,0.92) 100%)',
          borderBottom: '1px solid rgba(217,182,107,0.30)',
          boxShadow: '0 4px 18px rgba(180,140,40,0.10)',
          backdropFilter: 'blur(14px)',
        }}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => navigate(-1)}
            className="h-9 w-9 rounded-full bg-white flex items-center justify-center transition-all duration-300 hover:-translate-y-0.5 active:scale-95"
            style={{ boxShadow: '0 6px 16px -6px rgba(146,64,14,0.30), inset 0 1px 0 rgba(255,255,255,0.95), 0 0 0 1px rgba(217,182,107,0.50)' }}
          >
            <ArrowLeft className="w-5 h-5 text-heading drop-shadow-[0_1px_0_rgba(255,255,255,0.6)]" />
          </button>

          <h1
            className="text-lg font-bold text-heading tracking-wide"
            style={{ textShadow: '0 1px 0 rgba(255,255,255,0.7)' }}
          >
            My Store
          </h1>

          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/recharge')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all duration-300 hover:-translate-y-0.5 active:scale-95"
              style={{
                background: 'linear-gradient(135deg, rgba(251,191,36,0.35) 0%, rgba(217,182,107,0.25) 100%)',
                boxShadow: '0 8px 18px -6px rgba(217,119,6,0.45), inset 0 1px 0 rgba(255,255,255,0.75), 0 0 0 1px rgba(217,182,107,0.55)',
              }}
            >
              <Diamond3DIcon size={14} />
              <span className="text-heading text-sm font-bold">{userDiamonds.toLocaleString()}</span>
              <Plus className="w-3.5 h-3.5 text-amber-700" strokeWidth={3} />
            </button>
          </div>
        </div>
      </div>


      {/* Category Tabs - Pill style */}
      <div
        className="px-4 py-3"
        style={{
          background: 'linear-gradient(180deg, rgba(255,255,255,0.4) 0%, transparent 100%)',
        }}
      >
        <ScrollArea className="w-full whitespace-nowrap">
          <div className="flex gap-2 pb-1">
            {categories.map((cat) => {
              const isActive = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`rounded-full flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 px-5 py-2 text-sm font-semibold transition-all duration-300 hover:-translate-y-0.5 active:scale-95 ${
                    isActive ? 'text-white' : 'text-heading'
                  }`}
                  style={isActive ? {
                    background: 'linear-gradient(135deg, hsl(243 75% 55%) 0%, hsl(270 75% 55%) 50%, hsl(292 84% 60%) 100%)',
                    boxShadow: '0 8px 20px -6px rgba(147,51,234,0.55), inset 0 1px 0 rgba(255,255,255,0.30), inset 0 -2px 4px rgba(0,0,0,0.18)',
                    textShadow: '0 1px 2px rgba(0,0,0,0.20)',
                  } : {
                    background: 'rgba(255,255,255,0.85)',
                    border: '1px solid rgba(217,182,107,0.40)',
                    boxShadow: '0 2px 6px -2px rgba(180,140,40,0.15), inset 0 1px 0 rgba(255,255,255,0.9)',
                  }}
                >
                  <cat.icon className={`w-3.5 h-3.5 ${isActive ? 'drop-shadow-[0_1px_2px_rgba(0,0,0,0.25)]' : ''}`} />
                  {cat.name}
                </button>
              );
            })}
          </div>
          <ScrollBar orientation="horizontal" className="invisible" />
        </ScrollArea>
      </div>

      {/* Items Grid */}
      <div 
        className="flex-1 overflow-y-auto overscroll-contain px-3 py-2"
        style={{ 
          WebkitOverflowScrolling: 'touch',
          paddingBottom: 'var(--content-bottom-padding)',
        }}
      >
        {filteredItems.length === 0 ? (
          <div className="text-center py-16">
            <div className="relative w-24 h-24 mx-auto mb-5">
              <div
                className="absolute inset-0 rounded-full blur-2xl opacity-50"
                style={{ background: 'radial-gradient(circle, rgba(251,191,36,0.45), transparent 70%)' }}
              />
              <div
                className="relative w-24 h-24 rounded-full flex items-center justify-center"
                style={{
                  background: 'linear-gradient(160deg, #FFFBF2 0%, #F5EFDF 100%)',
                  border: '1px solid rgba(217,182,107,0.45)',
                  boxShadow: '0 12px 28px -10px rgba(180,140,40,0.30), inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -3px 6px rgba(180,140,40,0.10)',
                }}
              >
                <ShoppingBag className="w-11 h-11 text-amber-600/70" strokeWidth={1.5} />
              </div>
            </div>
            <p className="text-heading text-base font-semibold mb-1">Nothing here yet</p>
            <p className="text-body text-xs">Browse other categories to discover premium items</p>
          </div>
        ) : (
          <div className={`grid ${isEntryAnimationCategory(selectedCategory) ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2'} gap-3`}>
            {filteredItems.map((item, index) => (
              <ShopItemCard
                key={item.id}
                item={item}
                index={index}
                owned={isOwned(item.id)}
                onPreview={() => setSelectedItem(item)}
                isFullWidth={isEntryAnimationCategory(item.category)}
                viewerName={userName}
                viewerAvatar={userAvatar}
                viewerLevel={userLevel}
              />
            ))}
          </div>
        )}
      </div>

      {/* Item Detail Modal - Light Luxury */}
      <Dialog open={!!selectedItem} onOpenChange={() => setSelectedItem(null)}>
        <DialogContent
          className={`border-0 shadow-2xl ${
            selectedItem && isEntryAnimationCategory(selectedItem.category)
              ? 'w-[calc(100vw-24px)] max-w-lg max-h-[calc(100dvh-32px)] overflow-y-auto'
              : 'max-w-sm max-h-[calc(100dvh-32px)] overflow-y-auto'
          }`}
          data-shop-preview-dialog="true"
          style={{
            background: 'linear-gradient(160deg, #FFFBF2 0%, #FAF5EA 50%, #F5EFDF 100%)',
            border: '1px solid rgba(217,182,107,0.35)',
            boxShadow: '0 25px 60px rgba(120,90,30,0.25), 0 0 40px rgba(251,191,36,0.12)',
          }}
        >
          {selectedItem && (
            <>
              <DialogHeader>
                <DialogTitle className="text-heading text-center text-lg font-bold">
                  {selectedItem.name}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                {/* Preview */}
                <div
                  className={`${
                    isEntryNameBarCategory(selectedItem.category)
                      ? 'aspect-[1024/280]'
                      : isEntryAnimationCategory(selectedItem.category)
                        ? 'aspect-[9/16] min-h-[260px] max-h-[50dvh]'
                        : 'aspect-square'
                  } rounded-2xl flex items-center justify-center ${isEntryNameBarCategory(selectedItem.category) ? 'p-0' : 'p-6'} relative overflow-hidden`}
                  style={{
                    background: 'radial-gradient(circle at center, rgba(251,191,36,0.18) 0%, rgba(255,251,242,0.95) 70%)',
                    border: '1px solid rgba(217,182,107,0.3)',
                  }}
                >
                  {(() => {
                    const animType = pickAnimType(selectedItem);
                    const animSrc = selectedItem.animation_file_url || selectedItem.animation_url || '';

                    // Entry Name Bar: composited preview (animation + engraved
                    // avatar + name + level) — matches in-room render 1:1.
                    if (isEntryNameBarCategory(selectedItem.category)) {
                      return (
                        <EntryNameBarPreview
                          animationUrl={animSrc || null}
                          previewUrl={selectedItem.preview_url}
                          userName={userName}
                          avatarUrl={userAvatar}
                          level={userLevel}
                          className="absolute inset-0"
                        />
                      );
                    }

                    if (animSrc && isAnimatedType(animType)) {
                      return (
                        <div className="absolute inset-0 flex items-center justify-center p-6 pointer-events-none">
                          <div className="w-full h-full max-w-full max-h-full flex items-center justify-center">
                            <FixedAnimationFrame
                              src={animSrc}
                              type={animType as any}
                              configSrc={selectedItem.animation_config_url || undefined}
                              size="fill"
                              loop
                              autoPlay
                              muted={!isEntryAnimationCategory(selectedItem.category) || animType !== 'svga'}
                              background="none"
                            />
                          </div>
                        </div>
                      );
                    }
                    if (selectedItem.preview_url || animSrc) {
                      return (
                        <img loading="lazy" decoding="async"
                          src={selectedItem.preview_url ? enhanceThumbnail(selectedItem.preview_url, { width: 600, quality: 85 }) : animSrc}
                          alt={selectedItem.name}
                          className="max-w-[85%] max-h-[85%] object-contain drop-shadow-2xl mx-auto block"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      );
                    }
                    return <Shield className="w-24 h-24 text-amber-500/40" strokeWidth={1} />;
                  })()}
                </div>

                {selectedItem.description && (
                  <p className="text-body text-sm text-center">{selectedItem.description}</p>
                )}

                {/* Info Row */}
                <div className="grid grid-cols-2 gap-2">
                  <div
                    className="rounded-xl p-3 text-center"
                    style={{ background: 'rgba(255,255,255,0.85)', border: '1px solid rgba(217,182,107,0.3)' }}
                  >
                    <p className="text-body text-xs mb-1">Price</p>
                    <div className="flex items-center justify-center gap-1.5">
                      <Diamond3DIcon size={16} />
                      <span className="text-amber-700 font-bold">{selectedItem.price_diamonds.toLocaleString()}</span>
                    </div>
                  </div>
                  <div
                    className="rounded-xl p-3 text-center"
                    style={{ background: 'rgba(255,255,255,0.85)', border: '1px solid rgba(217,182,107,0.3)' }}
                  >
                    <p className="text-body text-xs mb-1">
                      {selectedItem.duration_days ? 'Duration' : 'Min Level'}
                    </p>
                    <p className="text-heading font-bold">
                      {selectedItem.duration_days ? `${selectedItem.duration_days} Days` : `Lv.${selectedItem.min_level}`}
                    </p>
                  </div>
                </div>

                {/* Purchase Button */}
                {isOwned(selectedItem.id) ? (
                  <div
                    className="w-full py-3 rounded-full text-center font-bold text-emerald-700"
                    style={{
                      background: 'linear-gradient(135deg, rgba(16,185,129,0.18) 0%, rgba(5,150,105,0.12) 100%)',
                      border: '1px solid rgba(16,185,129,0.40)',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6), inset 0 -2px 4px rgba(16,185,129,0.10)',
                    }}
                  >
                    ✓ Already Owned
                  </div>
                ) : !meetsLevel(selectedItem.min_level) ? (
                  <div
                    className="w-full py-3 rounded-full text-center font-bold text-red-600 flex items-center justify-center gap-2"
                    style={{
                      background: 'linear-gradient(135deg, rgba(239,68,68,0.14) 0%, rgba(220,38,38,0.10) 100%)',
                      border: '1px solid rgba(239,68,68,0.35)',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.55)',
                    }}
                  >
                    <Lock className="w-4 h-4" />
                    Requires Level {selectedItem.min_level}
                  </div>
                ) : !canAfford(selectedItem.price_diamonds) ? (
                  <button 
                    onClick={() => navigate("/recharge")}
                    className="w-full py-3 rounded-full font-bold text-white transition-all duration-300 hover:-translate-y-0.5 active:scale-95 flex items-center justify-center gap-2"
                    style={{
                      background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #d97706 100%)',
                      boxShadow: '0 12px 28px -8px rgba(245,158,11,0.55), inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -2px 4px rgba(0,0,0,0.12)',
                      textShadow: '0 1px 2px rgba(0,0,0,0.20)',
                    }}
                  >
                    <Diamond3DIcon size={16} />
                    Recharge Diamonds
                  </button>
                ) : (
                  <button
                    onClick={() => handlePurchase(selectedItem)}
                    disabled={purchasing}
                    className="w-full py-3 rounded-full font-bold text-white transition-all duration-300 hover:-translate-y-0.5 active:scale-95 disabled:opacity-60 disabled:hover:translate-y-0"
                    style={{
                      background: 'linear-gradient(135deg, #d946ef 0%, #a855f7 50%, #7c3aed 100%)',
                      boxShadow: '0 14px 32px -8px rgba(168,85,247,0.60), inset 0 1px 0 rgba(255,255,255,0.30), inset 0 -2px 4px rgba(0,0,0,0.18)',
                      textShadow: '0 1px 2px rgba(0,0,0,0.22)',
                    }}
                  >
                    {purchasing ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        <Diamond3DIcon size={16} />
                        Buy for {selectedItem.price_diamonds.toLocaleString()}
                      </span>
                    )}
                  </button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Shop;
