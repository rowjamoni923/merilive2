import { useState, useEffect, Suspense, lazy } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
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
import UniversalAnimationPlayer from "@/components/common/UniversalAnimationPlayer";
import { clearFrameCache } from "@/components/common/AvatarWithFrame";
import { recordClientError } from "@/utils/clientErrorLog";

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
}

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
  ['entrance', 'entrance_effect', 'entry_bar', 'vehicle'].includes(category);

// Shop Item Card Component - Luxury Style matching reference
const ShopItemCard = ({ 
  item, 
  index, 
  owned, 
  onPreview,
  isFullWidth = false
}: { 
  item: ShopItem; 
  index: number; 
  owned: boolean; 
  onPreview: () => void;
  isFullWidth?: boolean;
}) => {
  const [imageError, setImageError] = useState(false);
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.4 }}
      onClick={onPreview}
      className="relative rounded-2xl overflow-hidden cursor-pointer group"
      style={{
        background: 'linear-gradient(160deg, rgba(88,28,135,0.5) 0%, rgba(30,10,60,0.9) 50%, rgba(15,5,30,0.95) 100%)',
        border: '1px solid rgba(168,85,247,0.25)',
        boxShadow: '0 8px 32px rgba(88,28,135,0.3), inset 0 1px 0 rgba(255,255,255,0.08)',
      }}
    >
      {/* Featured indicator */}
      {item.is_featured && (
        <div className="absolute top-2 right-2 z-10">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/40">
            <Zap className="w-3.5 h-3.5 text-slate-800" />
          </div>
        </div>
      )}

      {/* Owned checkmark */}
      {owned && (
        <div className="absolute top-2 left-2 z-10">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-emerald-400 to-green-600 flex items-center justify-center shadow-lg shadow-green-500/40">
            <Check className="w-3.5 h-3.5 text-slate-800" />
          </div>
        </div>
      )}

      {/* Preview Area */}
      <div className={`${isFullWidth ? 'aspect-[16/10] min-h-[160px]' : 'aspect-square'} flex items-center justify-center p-3 relative overflow-hidden`}>
        {/* Subtle radial glow */}
        <div 
          className="absolute inset-0 opacity-40"
          style={{
            background: 'radial-gradient(circle at center, rgba(168,85,247,0.2) 0%, transparent 70%)',
          }}
        />
        
        {(item.animation_file_url || item.preview_url) && !imageError ? (
          // If preview_url exists and is a real image (not SVGA/Lottie), show static preview
          item.preview_url && !item.preview_url.endsWith('.svga') && !item.preview_url.endsWith('.json') ? (
            <img 
              src={item.preview_url} 
              alt={item.name}
              className={`max-w-[85%] max-h-[85%] object-contain drop-shadow-2xl group-hover:scale-105 transition-transform duration-300 mx-auto ${isFullWidth ? 'scale-105' : ''}`}
              onError={() => setImageError(true)}
            />
          ) : item.animation_file_url?.endsWith('.svga') || item.animation_file_url?.endsWith('.json') ? (
            <div className="w-full h-full flex items-center justify-center">
              <UniversalAnimationPlayer
                src={item.animation_file_url || ''}
                className={`max-w-[85%] max-h-[85%] ${isFullWidth ? 'scale-110' : ''}`}
                loop
                autoPlay
              />
            </div>
          ) : (
            <img 
              src={item.animation_file_url || item.preview_url || ''} 
              alt={item.name}
              className={`max-w-[85%] max-h-[85%] object-contain drop-shadow-2xl group-hover:scale-105 transition-transform duration-300 mx-auto ${isFullWidth ? 'scale-105' : ''}`}
              onError={() => setImageError(true)}
            />
          )
        ) : (
          <div className="w-16 h-16 rounded-2xl bg-purple-500/10 flex items-center justify-center">
            <Shield className="w-10 h-10 text-purple-400/60" strokeWidth={1.5} />
          </div>
        )}
      </div>

      {/* Item Info */}
      <div className="px-3 pb-3 space-y-2">
        {/* Name */}
        <p className="text-slate-800 text-sm font-semibold truncate text-center">{item.name}</p>
        
        {/* Price with diamond icon */}
        <div className="flex items-center justify-center gap-1.5">
          <Diamond3DIcon size={14} />
          <span className="text-amber-400 text-xs font-bold">
            {item.price_diamonds.toLocaleString()}
            {item.duration_days && (
              <span className="text-amber-400/70 font-normal">/{item.duration_days}day</span>
            )}
          </span>
        </div>

        {/* Purchase / Owned Button */}
        {owned ? (
          <div 
            className="w-full py-2 rounded-full text-center text-xs font-bold text-emerald-300"
            style={{
              background: 'linear-gradient(135deg, rgba(16,185,129,0.25) 0%, rgba(5,150,105,0.2) 100%)',
              border: '1px solid rgba(16,185,129,0.3)',
            }}
          >
            ✓ Owned
          </div>
        ) : (
          <button 
            onClick={(e) => { e.stopPropagation(); onPreview(); }}
            className="w-full py-2 rounded-full text-xs font-bold text-slate-800 transition-all active:scale-95"
            style={{
              background: 'linear-gradient(135deg, #d946ef 0%, #a855f7 50%, #7c3aed 100%)',
              boxShadow: '0 4px 15px rgba(168,85,247,0.4), inset 0 1px 0 rgba(255,255,255,0.15)',
            }}
          >
            Purchase
          </button>
        )}
      </div>
    </motion.div>
  );
};

const Shop = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [items, setItems] = useState<ShopItem[]>([]);
  const [purchases, setPurchases] = useState<UserPurchase[]>([]);
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
  const [userFrameId, setUserFrameId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedItem, setSelectedItem] = useState<ShopItem | null>(null);
  const [purchasing, setPurchasing] = useState(false);

  useEffect(() => {
    fetchData();
    
    // Use universal realtime instead of manual channel
    let unsubscribe: (() => void) | undefined;
    import('@/hooks/useUniversalRealtime').then(({ subscribeToTables }) => {
      unsubscribe = subscribeToTables(
        `shop-page-${Date.now()}`,
        ['shop_items', 'user_purchases', 'profiles'],
        (table, _event, payload) => {
          if (table === 'profiles' && (payload?.new as any)?.coins !== undefined) {
            setUserDiamonds((payload.new as any).coins || 0);
          } else {
            fetchData();
          }
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
        .select("coins, user_level, avatar_url, frame_id, equipped_frame_id")
        .eq("id", user.id)
        .single();

      if (profile) {
        setUserDiamonds(profile.coins || 0);
        setUserLevel(profile.user_level || 0);
        setUserAvatar(profile.avatar_url);
        setUserFrameId(profile.frame_id);
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

      const { data: deductData, error: updateError } = await supabase.rpc('deduct_coins', {
        p_user_id: user.id,
        p_amount: item.price_diamonds,
      });
      const deductResult = deductData as any;
      if (updateError || !deductResult?.success) throw new Error(deductResult?.error || 'Failed to deduct coins');

      const expiresAt = item.duration_days ? new Date(Date.now() + item.duration_days * 24 * 60 * 60 * 1000).toISOString() : null;
      const isPartyBackground = item.id.startsWith('bg_');
      const actualItemId = isPartyBackground ? item.id.replace('bg_', '') : item.id;
      const purchaseItemType = item.category || item.file_type || item.animation_type || 'shop_item';

      if (isPartyBackground) {
        const { error: bgPurchaseError } = await (supabase.from("user_purchased_backgrounds" as any).insert({ user_id: user.id, background_id: actualItemId, price_paid: item.price_diamonds }) as any);
        if (bgPurchaseError) {
          console.error('[Shop] Background purchase error:', bgPurchaseError);
          recordClientError({ label: "Shop.purchaseItemType", message: bgPurchaseError instanceof Error ? bgPurchaseError.message : String(bgPurchaseError) });
          toast({ title: "Purchase Successful!", description: `You now own ${item.name}` });
          setUserDiamonds(prev => prev - item.price_diamonds);
          setPurchases(prev => [...prev, { id: crypto.randomUUID(), item_id: item.id, is_equipped: true, expires_at: null }]);
          setSelectedItem(null);
          setPurchasing(false);
          return;
        }
      } else {
        const { error: purchaseError } = await supabase.from("user_purchases").insert({
          user_id: user.id,
          item_id: actualItemId,
          item_type: purchaseItemType,
          price_paid: item.price_diamonds,
          expires_at: expiresAt,
          is_equipped: true,
        });
        if (purchaseError) throw purchaseError;
      }

      await supabase.from("shop_items").update({ total_sold: (item as any).total_sold + 1 }).eq("id", item.id);

      const { data: currentProfile } = await supabase
        .from("profiles")
        .select("equipped_frame_id, equipped_entrance_id, equipped_entry_name_bar_id, equipped_bubble_id, equipped_vehicle_id, equipped_medal_id, equipped_noble_card_id, equipped_entry_banner_id")
        .eq("id", user.id)
        .single();

      const updateData: Record<string, string | null> = {};
      if (item.category === 'frame' || item.category === 'portrait_frame') {
        if (currentProfile?.equipped_frame_id && currentProfile.equipped_frame_id !== item.id) updateData.previous_frame_id = currentProfile.equipped_frame_id;
        updateData.equipped_frame_id = item.id;
      } else if (item.category === 'entrance' || item.category === 'entrance_effect') {
        if (currentProfile?.equipped_entrance_id && currentProfile.equipped_entrance_id !== item.id) updateData.previous_entrance_id = currentProfile.equipped_entrance_id;
        updateData.equipped_entrance_id = item.id;
      } else if (item.category === 'entry_bar') {
        if (currentProfile?.equipped_entry_name_bar_id && currentProfile.equipped_entry_name_bar_id !== item.id) updateData.previous_entry_name_bar_id = currentProfile.equipped_entry_name_bar_id;
        updateData.equipped_entry_name_bar_id = item.id;
      } else if (item.category === 'bubble') {
        if (currentProfile?.equipped_bubble_id && currentProfile.equipped_bubble_id !== item.id) updateData.previous_bubble_id = currentProfile.equipped_bubble_id;
        updateData.equipped_bubble_id = item.id;
      } else if (item.category === 'vehicle') {
        if (currentProfile?.equipped_vehicle_id && currentProfile.equipped_vehicle_id !== item.id) updateData.previous_vehicle_id = currentProfile.equipped_vehicle_id;
        updateData.equipped_vehicle_id = item.id;
      }

      if (Object.keys(updateData).length > 0) {
        await supabase.from("profiles").update(updateData).eq("id", user.id);
        console.log('[Shop] Profile updated with previous items saved:', updateData);
        if (item.category === 'frame' || item.category === 'portrait_frame') {
          clearFrameCache();
          console.log('[Shop] Frame cache cleared for instant update');
        }
      }

      setUserDiamonds(prev => prev - item.price_diamonds);
      setPurchases(prev => [...prev, { id: crypto.randomUUID(), item_id: item.id, is_equipped: true, expires_at: expiresAt }]);
      toast({ title: "Purchase Successful!", description: `You now own ${item.name}` });
      setSelectedItem(null);
    } catch (error: any) {
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

  if (loading) return <LoadingSpinner fullScreen />;

  return (
    <div 
      className="fixed inset-0 flex flex-col overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, #1a0533 0%, #0d0118 40%, #0a0014 100%)',
      }}
    >
      {/* Header - Deep purple luxury */}
      <div 
        className="sticky top-0 z-50 safe-area-top"
        style={{
          background: 'linear-gradient(135deg, rgba(88,28,135,0.9) 0%, rgba(49,10,100,0.95) 50%, rgba(30,5,70,0.9) 100%)',
          borderBottom: '1px solid rgba(168,85,247,0.2)',
          boxShadow: '0 4px 30px rgba(88,28,135,0.4)',
        }}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => navigate(-1)}
            className="text-slate-800 hover:bg-white/10 w-9 h-9 rounded-full"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          
          <h1 className="text-lg font-bold text-slate-800 tracking-wide">My Store</h1>
          
          <div className="flex items-center gap-2">
            <div 
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
              style={{
                background: 'linear-gradient(135deg, rgba(251,191,36,0.15) 0%, rgba(245,158,11,0.1) 100%)',
                border: '1px solid rgba(251,191,36,0.3)',
              }}
            >
              <Diamond3DIcon size={14} />
              <span className="text-amber-400 text-sm font-bold">{userDiamonds.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Category Tabs - Pill style like reference */}
      <div 
        className="px-4 py-3"
        style={{
          background: 'linear-gradient(180deg, rgba(30,5,70,0.8) 0%, transparent 100%)',
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
                  className={`rounded-full flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 px-5 py-2 text-sm font-semibold transition-all duration-300 ${
                    isActive ? 'text-slate-800' : 'text-purple-300/70'
                  }`}
                  style={isActive ? {
                    background: 'linear-gradient(135deg, #d946ef 0%, #a855f7 50%, #7c3aed 100%)',
                    boxShadow: '0 4px 20px rgba(168,85,247,0.5), inset 0 1px 0 rgba(255,255,255,0.2)',
                  } : {
                    background: 'rgba(168,85,247,0.1)',
                    border: '1px solid rgba(168,85,247,0.2)',
                  }}
                >
                  <cat.icon className="w-3.5 h-3.5" />
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
            <div 
              className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center"
              style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.2)' }}
            >
              <ShoppingBag className="w-10 h-10 text-purple-400/40" />
            </div>
            <p className="text-purple-300/40 text-sm">No items in this category</p>
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
              />
            ))}
          </div>
        )}
      </div>

      {/* Item Detail Modal - Luxury */}
      <Dialog open={!!selectedItem} onOpenChange={() => setSelectedItem(null)}>
        <DialogContent 
          className={`border-0 shadow-2xl ${
            selectedItem && isEntryAnimationCategory(selectedItem.category) 
              ? 'w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto' 
              : 'max-w-sm'
          }`}
          style={{
            background: 'linear-gradient(160deg, #2d1054 0%, #150830 50%, #0a0418 100%)',
            border: '1px solid rgba(168,85,247,0.3)',
            boxShadow: '0 25px 60px rgba(0,0,0,0.8), 0 0 40px rgba(168,85,247,0.2)',
          }}
        >
          {selectedItem && (
            <>
              <DialogHeader>
                <DialogTitle className="text-slate-800 text-center text-lg font-bold">
                  {selectedItem.name}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                {/* Preview */}
                <div 
                  className={`${
                    isEntryAnimationCategory(selectedItem.category) 
                      ? 'aspect-[9/16] min-h-[300px] max-h-[50vh]' 
                      : 'aspect-square'
                  } rounded-2xl flex items-center justify-center p-6 relative overflow-hidden`}
                  style={{
                    background: 'radial-gradient(circle at center, rgba(168,85,247,0.15) 0%, rgba(15,5,30,0.9) 70%)',
                    border: '1px solid rgba(168,85,247,0.2)',
                  }}
                >
                  {selectedItem.animation_file_url?.endsWith('.svga') || selectedItem.animation_file_url?.endsWith('.json') ? (
                    isEntryAnimationCategory(selectedItem.category) && selectedItem.animation_file_url?.endsWith('.svga') ? (
                      <Suspense fallback={
                        <div className="w-full h-full flex items-center justify-center">
                          <div className="w-8 h-8 border-3 border-purple-400/30 border-t-purple-400 rounded-full animate-spin" />
                        </div>
                      }>
                        <SVGAPlayerWithAudio
                          src={selectedItem.animation_file_url || ''}
                          className="max-w-[85%] max-h-[85%] object-contain"
                          loop={true}
                          autoPlay={true}
                          volume={0}
                        />
                      </Suspense>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <UniversalAnimationPlayer
                          src={selectedItem.animation_file_url || ''}
                          className={`max-w-[85%] max-h-[85%] ${isEntryAnimationCategory(selectedItem.category) ? 'scale-110' : ''}`}
                          loop
                          autoPlay
                        />
                      </div>
                    )
                  ) : selectedItem.preview_url || selectedItem.animation_file_url ? (
                    <img 
                      src={selectedItem.animation_file_url || selectedItem.preview_url || ''} 
                      alt={selectedItem.name} 
                      className={`max-w-[85%] max-h-[85%] object-contain drop-shadow-2xl mx-auto ${isEntryAnimationCategory(selectedItem.category) ? 'scale-110' : ''}`}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <Shield className="w-24 h-24 text-purple-400/40" strokeWidth={1} />
                  )}
                </div>

                {selectedItem.description && (
                  <p className="text-purple-200/50 text-sm text-center">{selectedItem.description}</p>
                )}

                {/* Info Row */}
                <div className="grid grid-cols-2 gap-2">
                  <div 
                    className="rounded-xl p-3 text-center"
                    style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.15)' }}
                  >
                    <p className="text-purple-300/50 text-xs mb-1">Price</p>
                    <div className="flex items-center justify-center gap-1.5">
                      <Diamond3DIcon size={16} />
                      <span className="text-amber-400 font-bold">{selectedItem.price_diamonds.toLocaleString()}</span>
                    </div>
                  </div>
                  <div 
                    className="rounded-xl p-3 text-center"
                    style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.15)' }}
                  >
                    <p className="text-purple-300/50 text-xs mb-1">
                      {selectedItem.duration_days ? 'Duration' : 'Min Level'}
                    </p>
                    <p className="text-slate-800 font-bold">
                      {selectedItem.duration_days ? `${selectedItem.duration_days} Days` : `Lv.${selectedItem.min_level}`}
                    </p>
                  </div>
                </div>

                {/* Purchase Button */}
                {isOwned(selectedItem.id) ? (
                  <div 
                    className="w-full py-3 rounded-full text-center font-bold text-emerald-300"
                    style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)' }}
                  >
                    ✓ Already Owned
                  </div>
                ) : !meetsLevel(selectedItem.min_level) ? (
                  <div 
                    className="w-full py-3 rounded-full text-center font-bold text-red-300"
                    style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}
                  >
                    <Lock className="w-4 h-4 inline mr-2" />
                    Requires Level {selectedItem.min_level}
                  </div>
                ) : !canAfford(selectedItem.price_diamonds) ? (
                  <button 
                    onClick={() => navigate("/recharge")}
                    className="w-full py-3 rounded-full font-bold text-slate-800 transition-all active:scale-95"
                    style={{
                      background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                      boxShadow: '0 4px 20px rgba(245,158,11,0.4)',
                    }}
                  >
                    <Diamond3DIcon size={16} /> Recharge Diamonds
                  </button>
                ) : (
                  <button
                    onClick={() => handlePurchase(selectedItem)}
                    disabled={purchasing}
                    className="w-full py-3 rounded-full font-bold text-slate-800 transition-all active:scale-95 disabled:opacity-50"
                    style={{
                      background: 'linear-gradient(135deg, #d946ef 0%, #a855f7 50%, #7c3aed 100%)',
                      boxShadow: '0 4px 25px rgba(168,85,247,0.5), inset 0 1px 0 rgba(255,255,255,0.15)',
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
