import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { 
  ArrowLeft, 
  Crown, 
  Gem, 
  Sparkles, 
  Star, 
  Shield,
  Check,
  Zap,
  Gift,
  MessageCircle,
  Users,
  Image,
  Ban,
  Headphones,
  CheckCircle2,
  Clock,
  Lock,
  Car
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import Diamond3DIcon from "@/components/common/Diamond3DIcon";
import { VIPBadge } from "@/components/common/VIPBadge";
import { BottomNavigation } from "@/components/layout/BottomNavigation";
import UniversalAnimationPlayer from "@/components/common/UniversalAnimationPlayer";
import UniversalFramePlayer from "@/components/common/UniversalFramePlayer";
import { clearFrameCache } from "@/components/common/AvatarWithFrame";
import { clearEntryAnimationCache } from "@/utils/fetchEntryAnimation";
import useExpiredItemsRestorer from "@/hooks/useExpiredItemsRestorer";
import { resolveLevelFromTiers } from "@/utils/levelResolver";
import VipNobleSection from "@/components/vip/VipNobleSection";
import { PageSkeleton } from "@/components/common/PageSkeleton";
import { enhanceThumbnail } from "@/utils/enhanceThumbnail";
import { recordClientError } from "@/utils/clientErrorLog";
import FramedAvatarWithPrivileges from "@/components/common/FramedAvatarWithPrivileges";
import EntryNameBarPreview from "@/components/live/EntryNameBarPreview";
import { getLevelBadgeBg, getLevelTextColor, formatLevel, ensureValidLevel } from "@/features/shared/level";

interface VIPTier {
  id: string;
  tier_code: string;
  tier_name: string;
  tier_level: number;
  price_diamonds: number;
  duration_days: number;
  badge_color: string;
  description: string;
  exclusive_frames: boolean;
  exclusive_entry_bars: boolean;
  exclusive_gifts: boolean;
  exclusive_bubbles: boolean;
  exclusive_stickers: boolean;
  priority_matching: boolean;
  ad_free: boolean;
  faster_support: boolean;
  vip_only_rooms: boolean;
  profile_highlight: boolean;
  // Animation URLs for VIP tier assets
  badge_animation_url?: string | null;
  frame_animation_url?: string | null;
  entry_animation_url?: string | null;
  bubble_animation_url?: string | null;
}

interface UserPrivilege {
  id: string;
  item_id: string;
  name: string;
  category: string;
  preview_url: string | null;
  animation_url: string | null;
  is_equipped: boolean;
  is_locked?: boolean;
  expires_at: string | null;
  source: 'shop' | 'level' | 'frame' | 'admin_assigned';
  unlock_level?: number;
  role_type?: string; // For admin-assigned frames
}

type PrivilegeSlot =
  | 'frame'
  | 'entrance'
  | 'entry_name_bar'
  | 'bubble'
  | 'vehicle'
  | 'medal'
  | 'noble_card'
  | 'other';

// Helper: check if a URL is a valid asset (not just placeholder text)
const isValidAssetUrl = (url: string | null | undefined): boolean => {
  if (!url || url.length < 10) return false;
  // Accept any HTTP(S) URL or relative path with known extensions
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/')) return true;
  if (url.endsWith('.svga') || url.endsWith('.json') || url.endsWith('.png') || 
      url.endsWith('.jpg') || url.endsWith('.webp') || url.endsWith('.gif') ||
      url.endsWith('.mp4') || url.endsWith('.webm') || url.endsWith('.svg')) return true;
  return false;
};

// Helper function to format expiration time
const formatExpiration = (expiresAt: string | null, _tick: number = 0): string | null => {
  if (!expiresAt) return null;
  
  const expiry = new Date(expiresAt);
  const now = new Date();
  const diff = expiry.getTime() - now.getTime();
  
  if (diff <= 0) return 'Expired';
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  
  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  return `${hours}h`;
};

const isPrivilegeExpired = (expiresAt: string | null): boolean => {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() <= Date.now();
};

const isUnlockedByLevel = (requiredLevel: number | null | undefined, effectiveLevel: number): boolean => {
  return (requiredLevel ?? 1) <= effectiveLevel;
};

const isMonetizedAsset = (asset: {
  is_premium?: boolean | null;
  price_diamonds?: number | null;
}): boolean => {
  return Boolean(
    asset.is_premium ||
    (asset.price_diamonds ?? 0) > 0 ||
    (asset.price_diamonds ?? 0) > 0,
  );
};

const hasRenderableAsset = (...urls: Array<string | null | undefined>): boolean => {
  return urls.some((url) => isValidAssetUrl(url));
};

const shouldShowLevelAvatarFrame = (requiredLevel: number | null | undefined): boolean => {
  const level = requiredLevel ?? 1;
  return level === 1 || level >= 6;
};

const shouldShowLevelReward = (requiredLevel: number | null | undefined): boolean => {
  const level = requiredLevel ?? 1;
  return level >= 1;
};

const getPrivilegeSlot = (category: string): PrivilegeSlot => {
  if (category === 'frame' || category === 'portrait_frame') return 'frame';
  if (category === 'entrance' || category === 'entrance_effect' || category === 'entry_banner') return 'entrance';
  if (category === 'entry_name_bar' || category === 'entry_bar' || category === 'entry_bar_effect') return 'entry_name_bar';
  if (category === 'bubble' || category === 'chat_bubble') return 'bubble';
  if (category === 'vehicle' || category === 'vehicle_entrance') return 'vehicle';
  if (category === 'badge' || category === 'medal' || category === 'vip_medal') return 'medal';
  if (category === 'noble_card') return 'noble_card';
  return 'other';
};

// VIP Page Component - Updated 2026-01-27
const VIP = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [tiers, setTiers] = useState<VIPTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [userDiamonds, setUserDiamonds] = useState(0);
  const [currentVIPTier, setCurrentVIPTier] = useState<number>(0);
  const [vipExpiresAt, setVIPExpiresAt] = useState<string | null>(null);
  const [selectedTier, setSelectedTier] = useState<VIPTier | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [activeTab, setActiveTab] = useState("vip");
  
  // User privileges
  const [userPrivileges, setUserPrivileges] = useState<UserPrivilege[]>([]);
  const [equipping, setEquipping] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [countdownTick, setCountdownTick] = useState(0);
  const [currentUserName, setCurrentUserName] = useState<string>("");
  const [currentUserLevel, setCurrentUserLevel] = useState<number>(1);
  const [currentUserAvatar, setCurrentUserAvatar] = useState<string | undefined>(undefined);


  // Check and restore expired VIP items automatically  
  useExpiredItemsRestorer(currentUserId);

  useEffect(() => {
    fetchData();
    
    // Use universal realtime instead of 8-table manual channel
    let unsubscribe: (() => void) | undefined;
    import('@/hooks/useUniversalRealtime').then(({ subscribeToTables }) => {
      unsubscribe = subscribeToTables(
        `vip-page-${Date.now()}`,
        ['profiles', 'vip_tiers', 'user_vip_subscriptions', 'level_privileges', 'avatar_frames', 'user_purchases', 'shop_items', 'entry_banners', 'entry_name_bars', 'user_role_frames'],
        () => {
          fetchData();
        }
      );
    });

    return () => {
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    const hasTimedItems = userPrivileges.some((item) => item.expires_at && !isPrivilegeExpired(item.expires_at));
    if (!hasTimedItems) return;

    const interval = setInterval(() => setCountdownTick((tick) => tick + 1), 1000);
    return () => clearInterval(interval);
  }, [userPrivileges]);

  const fetchData = async () => {
    try {
      const { getCachedUser } = await import('@/utils/cachedAuth');
      const user = await getCachedUser();
      if (!user) {
        navigate("/auth");
        return;
      }
      
      // Set user id for expired items restorer
      setCurrentUserId(user.id);

      // Fetch user profile - include ALL equipped fields for unified selection logic
      const { data: profileData } = await supabase
        .from("profiles")
        .select("diamonds, display_name, username, avatar_url, current_vip_tier_id, vip_expires_at, user_level, host_level, is_host, gender, max_user_level, total_recharged, total_earnings, weekly_earnings, frame_id, equipped_frame_id, equipped_entrance_id, equipped_entry_banner_id, equipped_entry_name_bar_id, equipped_bubble_id, equipped_vehicle_id, equipped_medal_id, equipped_noble_card_id")
        .eq("id", user.id)
        .maybeSingle();

      const resolvedLevel = profileData
        ? await resolveLevelFromTiers({
            id: user.id,
            gender: profileData.gender,
            is_host: profileData.is_host,
            user_level: profileData.user_level,
            host_level: profileData.host_level,
            max_user_level: profileData.max_user_level,
            total_recharged: profileData.total_recharged,
            total_earnings: profileData.total_earnings,
            weekly_earnings: profileData.weekly_earnings,
          })
        : null;

      const effectiveLevel = resolvedLevel?.level ?? 1;
      const targetType = resolvedLevel?.levelType ?? 'user';
      // Use equipped_frame_id first, fallback to frame_id for backwards compatibility
      const equippedFrameId = profileData?.equipped_frame_id || profileData?.frame_id;
      const equippedEntranceId = profileData?.equipped_entrance_id || profileData?.equipped_entry_banner_id;
      const equippedEntryNameBarId = profileData?.equipped_entry_name_bar_id;
      const equippedBubbleId = profileData?.equipped_bubble_id;
      const equippedVehicleId = profileData?.equipped_vehicle_id;
      const equippedMedalId = profileData?.equipped_medal_id;
      const equippedNobleCardId = profileData?.equipped_noble_card_id;
      
      console.log('[VIP] Profile equipped IDs:', {
        frame: equippedFrameId || 'none',
        entrance: equippedEntranceId || 'none',
        entryBar: equippedEntryNameBarId || 'none',
        bubble: equippedBubbleId || 'none',
        vehicle: equippedVehicleId || 'none',
        medal: equippedMedalId || 'none',
        nobleCard: equippedNobleCardId || 'none',
        effectiveLevel,
        targetType
      });

      if (profileData) {
        setUserDiamonds(profileData.diamonds || 0);
        setVIPExpiresAt(profileData.vip_expires_at);
        setCurrentUserName((profileData as any)?.display_name || (profileData as any)?.username || "You");
        setCurrentUserAvatar((profileData as any)?.avatar_url || undefined);
      }
      setCurrentUserLevel(effectiveLevel);


      // Fetch current VIP subscription
      const { data: vipData } = await supabase
        .from("user_vip_subscriptions")
        .select("vip_tier_id, vip_tiers(tier_level), expires_at")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .gte("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (vipData?.vip_tiers) {
        setCurrentVIPTier((vipData.vip_tiers as any).tier_level || 0);
        setVIPExpiresAt(vipData.expires_at);
      }

      // Fetch VIP tiers
      const { data: tiersData } = await supabase
        .from("vip_tiers")
        .select("*")
        .eq("is_active", true)
        .order("display_order");

      if (tiersData) {
        setTiers(tiersData);
      }

      const allPrivileges: UserPrivilege[] = [];

      // Fetch ONLY user's purchased items (from shop)
      const { data: purchases } = await supabase
        .from("user_purchases")
        .select("id, item_id, is_equipped, expires_at, item_type")
        .eq("user_id", user.id)
        .eq("is_active", true);

      const purchaseItemIds = (purchases || []).map((purchase) => purchase.item_id).filter(Boolean);
      const { data: purchasedShopItems } = purchaseItemIds.length > 0
        ? await supabase
            .from("shop_items")
            .select("id, name, category, preview_url, animation_url, animation_file_url")
            .in("id", purchaseItemIds)
        : { data: [] as any[] };

      const shopItemsMap = new Map((purchasedShopItems || []).map((item: any) => [item.id, item]));

      if (purchases) {
        for (const p of purchases) {
          const shopItem = shopItemsMap.get(p.item_id);
          if (!shopItem || isPrivilegeExpired(p.expires_at)) continue;

          const animUrl = shopItem.animation_url || shopItem.animation_file_url;
          const previewUrl = shopItem.preview_url;
          const shopCategory = shopItem.category || p.item_type;
          const displayUrl = animUrl || previewUrl;

          if (!isValidAssetUrl(displayUrl)) continue;

          const slot = getPrivilegeSlot(shopCategory);
          const isEquipped =
            (slot === 'frame' && p.item_id === equippedFrameId) ||
            (slot === 'entrance' && p.item_id === equippedEntranceId) ||
            (slot === 'entry_name_bar' && p.item_id === equippedEntryNameBarId) ||
            (slot === 'bubble' && p.item_id === equippedBubbleId) ||
            (slot === 'vehicle' && p.item_id === equippedVehicleId) ||
            (slot === 'medal' && p.item_id === equippedMedalId) ||
            (slot === 'noble_card' && p.item_id === equippedNobleCardId);

          allPrivileges.push({
            item_id: p.item_id,
            name: shopItem.name,
            category: shopCategory,
            preview_url: previewUrl,
            animation_url: animUrl || previewUrl,
            is_equipped: isEquipped,
            expires_at: p.expires_at,
            source: 'shop',
          });
        }
      }

      // Fetch unlocked avatar frames only for the current role/level
      const { data: availableFrames } = await supabase
        .from("avatar_frames")
        .select("id, name, frame_url, preview_url, min_level, level_required, target_type, is_premium, price_diamonds, price_diamonds")
        .eq("is_active", true)
        .or(`target_type.is.null,target_type.eq.both,target_type.eq.${targetType}`)
        .order("min_level", { ascending: true });

      if (availableFrames) {
        const hasEquippedFrameInDB = !!equippedFrameId;
        
        for (const frame of availableFrames) {
          const requiredLevel = frame.min_level ?? frame.level_required;
          if (
            !isUnlockedByLevel(requiredLevel, effectiveLevel) ||
            isMonetizedAsset(frame) ||
            !shouldShowLevelAvatarFrame(requiredLevel) ||
            !hasRenderableAsset(frame.frame_url, frame.preview_url)
          ) continue;

          const isEquipped = hasEquippedFrameInDB && frame.id === equippedFrameId;
          const alreadyExists = allPrivileges.some(p => p.item_id === frame.id);
          if (!alreadyExists) {
            allPrivileges.push({
              unlock_level: requiredLevel,
            });
          }
        }
      }

      // Fetch unlocked level privileges only
      const { data: levelPrivileges } = await supabase
        .from("level_privileges")
        .select("*")
        .eq("is_active", true)
        .order("unlock_level", { ascending: true });

      if (levelPrivileges) {
        for (const priv of levelPrivileges) {
          const requiredLevel = priv.unlock_level ?? priv.level;
          const assetUrl = priv.animation_url || priv.preview_url;
          if (
            !isUnlockedByLevel(requiredLevel, effectiveLevel) ||
            !shouldShowLevelReward(requiredLevel) ||
            !hasRenderableAsset(assetUrl)
          ) continue;

          const slot = getPrivilegeSlot(priv.privilege_type || 'other');
          let isEquipped = false;
          if (slot === 'entrance') isEquipped = priv.id === equippedEntranceId;
          else if (slot === 'entry_name_bar') isEquipped = priv.id === equippedEntryNameBarId;
          else if (slot === 'bubble') isEquipped = priv.id === equippedBubbleId;
          else if (slot === 'vehicle') isEquipped = priv.id === equippedVehicleId;
          else if (slot === 'medal') isEquipped = priv.id === equippedMedalId;
          
          allPrivileges.push({
          });
        }
      }

      // Fetch unlocked entry name bars only
      // NOTE: admin panel writes the unlock level into `min_level` for most rows
      // (legacy `level_required` is often 0). Use whichever is set so the
      // level-ladder Marquis/Emperor/Duke/Baron tiers actually surface here.
      const { data: entryNameBars } = await supabase
        .from("entry_name_bars")
        .select("*")
        .eq("is_active", true);

      if (entryNameBars) {
        for (const bar of entryNameBars as any[]) {
          const unlockLevel =
            (bar.level_required && bar.level_required > 0
              ? bar.level_required
              : bar.min_level && bar.min_level > 0
                ? bar.min_level
                : 1);
          const previewUrl = bar.preview_url || bar.image_url;
          const animationUrl = bar.animation_url || bar.preview_url || bar.image_url;

          if (
            !isUnlockedByLevel(unlockLevel, effectiveLevel) ||
            !shouldShowLevelReward(unlockLevel) ||
            isMonetizedAsset(bar) ||
            !hasRenderableAsset(animationUrl, previewUrl)
          ) continue;

          const isEquipped = bar.id === equippedEntryNameBarId;
          const alreadyExists = allPrivileges.some(p => p.item_id === bar.id);
          if (!alreadyExists) {
            allPrivileges.push({
            });
          }
        }
      }


      // Fetch unlocked entry banners only
      const { data: entryBanners } = await supabase
        .from("entry_banners")
        .select("*")
        .eq("is_active", true)
        .order("level_required", { ascending: true });

      if (entryBanners) {
        for (const banner of entryBanners) {
          if (
            !isUnlockedByLevel(banner.level_required, effectiveLevel) ||
            !shouldShowLevelReward(banner.level_required) ||
            isMonetizedAsset(banner) ||
            !hasRenderableAsset(banner.animation_url, banner.image_url)
          ) continue;

          const isEquipped = banner.id === equippedEntranceId;
          const alreadyExists = allPrivileges.some(p => p.item_id === banner.id);
          if (!alreadyExists) {
            allPrivileges.push({
            });
          }
        }
      }

      const { data: vehicleEntrances } = await supabase
        .from('vehicle_entrances' as any)
        .select('*')
        .eq('is_active', true)
        .order('level_required', { ascending: true });

      if (vehicleEntrances) {
        for (const vehicle of vehicleEntrances as any[]) {
          if (
            !isUnlockedByLevel(vehicle.level_required, effectiveLevel) ||
            !shouldShowLevelReward(vehicle.level_required) ||
            isMonetizedAsset(vehicle) ||
            !hasRenderableAsset(vehicle.animation_url, vehicle.preview_url, vehicle.image_url)
          ) continue;

          const isEquipped = vehicle.id === equippedVehicleId;
          const alreadyExists = allPrivileges.some((p) => p.item_id === vehicle.id);
          if (!alreadyExists) {
            allPrivileges.push({
            });
          }
        }
      }

      // Fetch ADMIN-ASSIGNED frames (from user_role_frames table)
      // These are frames assigned by admin/agency owner to specific users.
      // user_role_frames can reference EITHER role_frames OR avatar_frames
      // (disambiguated by source_table column).
      const { data: assignedFrames } = await supabase
        .from("user_role_frames")
        .select(`
          id,
          frame_id,
          expires_at,
          role_type,
          is_equipped,
          source_table,
          role_frames (
            id,
            frame_name:name,
            frame_url,
            description,
            is_active
          )
        `)
        .eq("user_id", user.id);

      // Collect avatar_frames ids that need a separate lookup
      const avatarFrameIds = (assignedFrames || [])
        .filter((a: any) => (a.source_table || 'role_frames') === 'avatar_frames')
        .map((a: any) => a.frame_id);

      let avatarFrameMap: Record<string, any> = {};
      if (avatarFrameIds.length > 0) {
        const { data: avFrames } = await supabase
          .from("avatar_frames")
          .select("id, name, frame_url, image_url, preview_url, description, is_active")
          .in("id", avatarFrameIds);
        for (const f of avFrames || []) {
          avatarFrameMap[(f as any).id] = f;
        }
      }

      if (assignedFrames) {
        for (const assigned of assignedFrames) {
          const src = (assigned as any).source_table || 'role_frames';
          let frame: any = null;

          if (src === 'avatar_frames') {
            const af = avatarFrameMap[(assigned as any).frame_id];
            if (af) {
              frame = {
                frame_name: af.name,
                frame_url: af.frame_url || af.image_url,
                description: af.description,
                is_active: af.is_active,
              };
            }
          } else {
            frame = (assigned as any).role_frames;
          }

          if (frame && frame.is_active && isValidAssetUrl(frame.frame_url)) {
            const isEquipped = (assigned as any).is_equipped || frame.id === equippedFrameId;
            const alreadyExists = allPrivileges.some(p => p.item_id === frame.id);
            if (!alreadyExists) {
              allPrivileges.push({
                role_type: (assigned as any).role_type,
              });
            }
          }
        }
      }

      // === ADD VIP TIER ITEMS ===
      // If user has an active VIP subscription, show VIP-exclusive items
      const localVIPLevel = vipData?.vip_tiers ? (vipData.vip_tiers as any).tier_level || 0 : 0;
      if (localVIPLevel > 0 && tiersData && tiersData.length > 0) {
        const activeTier = tiersData.find(t => t.tier_level === localVIPLevel) || 
                          (vipData?.vip_tier_id ? tiersData.find(t => t.id === vipData.vip_tier_id) : null);
        if (activeTier) {
          // VIP Frame
          if (isValidAssetUrl(activeTier.frame_animation_url)) {
            const alreadyExists = allPrivileges.some(p => p.item_id === activeTier.id && p.category === 'frame');
            if (!alreadyExists) {
              allPrivileges.push({
              });
            }
          }
          // VIP Entry Animation
          if (isValidAssetUrl(activeTier.entry_animation_url)) {
            const alreadyExists = allPrivileges.some(p => p.item_id === activeTier.id && p.category === 'entrance');
            if (!alreadyExists) {
              allPrivileges.push({
              });
            }
          }
          // VIP Chat Bubble
          if (isValidAssetUrl(activeTier.bubble_animation_url)) {
            const alreadyExists = allPrivileges.some(p => p.item_id === activeTier.id && p.category === 'bubble');
            if (!alreadyExists) {
              allPrivileges.push({
              });
            }
          }
        }
      }

      const notExpired = allPrivileges.filter((priv) => !isPrivilegeExpired(priv.expires_at));

      // STRICT LEVEL-TIER RULE (Bigo/Chamet style):
      // For level-based items (source 'level' or 'frame'), per slot keep ONLY the
      // highest unlocked tier. Lower-tier items auto-hide as the user levels up.
      // Shop purchases and admin-assigned items always remain visible.
      const highestLevelBySlot = new Map<PrivilegeSlot, UserPrivilege>();
      const finalPrivileges: UserPrivilege[] = [];
      for (const p of notExpired) {
        const slot = getPrivilegeSlot(p.category);
        const isLevelSource = p.source === 'level' || p.source === 'frame';
        if (!isLevelSource || slot === 'other' || slot === 'noble_card') {
          finalPrivileges.push(p);
          continue;
        }
        const existing = highestLevelBySlot.get(slot);
        const lvl = p.unlock_level ?? 0;
        const existingLvl = existing?.unlock_level ?? -1;
        if (!existing || lvl > existingLvl) {
          highestLevelBySlot.set(slot, p);
        }
      }
      for (const p of highestLevelBySlot.values()) finalPrivileges.push(p);

      console.log('[VIP] Privileges after strict-tier filter:', {
        total: finalPrivileges.length,
        kept: [...highestLevelBySlot.entries()].map(([slot, p]) => ({ slot, name: p.name, level: p.unlock_level })),
        equipped: finalPrivileges.filter(p => p.is_equipped).map(p => ({ name: p.name, category: p.category, source: p.source }))
      });

      setUserPrivileges(finalPrivileges);
    } catch (error) {
      console.error("Error fetching VIP data:", error);
      recordClientError({ label: "VIP.visiblePrivileges", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async (tier: VIPTier) => {
    if (purchasing) return;
    
    setPurchasing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      if (userDiamonds < tier.price_diamonds) {
        toast({
          title: "Insufficient Diamonds",
          variant: "destructive",
        });
        setSelectedTier(null);
        return;
      }

      const { data: result, error: rpcError } = await supabase.rpc("process_vip_subscription", {
        p_plan_id: tier.id,
        p_billing: "monthly",
        p_equip_updates: {},
      });

      if (rpcError) throw rpcError;
      const rpcResult = result as any;
      if (!rpcResult?.success) {
        throw new Error(rpcResult?.error || "VIP purchase failed");
      }

      // Clear frame cache for instant profile update
      if (tier.frame_animation_url) {
        clearFrameCache();
      }

      toast({
      });

      setUserDiamonds(rpcResult.balance_after);
      setCurrentVIPTier(tier.tier_level);
      setVIPExpiresAt(rpcResult.expires_at);
      setSelectedTier(null);
      
      // Refresh data to show new privileges
      fetchData();
    } catch (error: any) {
      console.error("Error purchasing VIP:", error);
      recordClientError({ label: "VIP.rpcResult", message: error instanceof Error ? error.message : String(error) });
      toast({
      });
    } finally {
      setPurchasing(false);
    }
  };

  const handleEquip = async (privilege: UserPrivilege) => {
    if (equipping) return;

    const privilegeSlot = getPrivilegeSlot(privilege.category);
    const isFrame = privilegeSlot === 'frame';

    if (privilegeSlot === 'other') {
      toast({
      });
      return;
    }

    // ⚡ INSTANT OPTIMISTIC UPDATE — flip UI BEFORE any network call
    // so the "Equipped" badge + green ring appear immediately on tap.
    const previousPrivileges = userPrivileges;
    setUserPrivileges(prev => prev.map(p => {
      if (p.id === privilege.id) return { ...p, is_equipped: true };
      if (getPrivilegeSlot(p.category) === privilegeSlot) return { ...p, is_equipped: false };
      return p;
    }));

    // Invalidate caches immediately so the next room entry uses the new equip.
    if (isFrame) {
      clearFrameCache();
    }
    if (privilegeSlot === 'entrance' || privilegeSlot === 'entry_name_bar' || privilegeSlot === 'vehicle') {
      clearEntryAnimationCache();
    }

    // Instant feedback toast.
    toast({
    });

    setEquipping(privilege.id);
    console.log('[VIP] Equipping privilege:', privilege, 'slot:', privilegeSlot);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('No user found');
      }

      // For shop purchases, update user_purchases table
      if (privilege.source === 'shop') {
        const { data: allPurchases } = await supabase
          .from("user_purchases")
          .select("id, shop_items(category)")
          .eq("user_id", user.id)
          .eq("is_active", true);

        const sameCategoryIds = allPurchases
          ?.filter(p => {
            const pCategory = (p.shop_items as any)?.category;
            return getPrivilegeSlot(pCategory || 'other') === privilegeSlot;
          })
          .map(p => p.id) || [];

        if (sameCategoryIds.length > 0) {
          await supabase
            .from("user_purchases")
            .update({ is_equipped: false })
            .in("id", sameCategoryIds);
        }

        const { error: equipError } = await supabase
          .from("user_purchases")
          .update({ is_equipped: true })
          .eq("id", privilege.id);
        if (equipError) throw equipError;
      }

      // For admin-assigned frames, update user_role_frames table
      if (privilegeSlot === 'frame') {
        await supabase
          .from("user_role_frames")
          .update({ is_equipped: false })
          .eq("user_id", user.id);
      }

      if (privilege.source === 'admin_assigned') {
        const { error: equipError } = await supabase
          .from("user_role_frames")
          .update({ is_equipped: true })
          .eq("id", privilege.id);
        if (equipError) throw equipError;
      }

      // Update profile's equipped item based on category
      const updateData: Record<string, string | null> = {};

      if (privilegeSlot === 'frame') {
        updateData.equipped_frame_id = privilege.item_id;
      } else if (privilegeSlot === 'entrance') {
        updateData.equipped_entrance_id = privilege.item_id;
        updateData.equipped_entry_banner_id = privilege.item_id;
      } else if (privilegeSlot === 'entry_name_bar') {
        updateData.equipped_entry_name_bar_id = privilege.item_id;
      } else if (privilegeSlot === 'bubble') {
        updateData.equipped_bubble_id = privilege.item_id;
      } else if (privilegeSlot === 'vehicle') {
        updateData.equipped_vehicle_id = privilege.item_id;
      } else if (privilegeSlot === 'medal') {
        updateData.equipped_medal_id = privilege.item_id;
      } else if (privilegeSlot === 'noble_card') {
        updateData.equipped_noble_card_id = privilege.item_id;
      }

      if (Object.keys(updateData).length > 0) {
        const { data: currentProfile } = await supabase
          .from("profiles")
          .select(Object.keys(updateData).join(","))
          .eq("id", user.id)
          .maybeSingle();

        const changedUpdateData = Object.fromEntries(
          Object.entries(updateData).filter(([key, value]) => (currentProfile as any)?.[key] !== value)
        );

        if (Object.keys(changedUpdateData).length === 0) {
          console.log('[VIP] Profile equip already up to date; skipping no-op write');
          fetchData();
          return;
        }

        const { error: profileError } = await supabase
          .from("profiles")
          .update(changedUpdateData)
          .eq("id", user.id);
        if (profileError) throw profileError;
      }

      console.log('[VIP] Equip persisted successfully');
      // Refresh to ensure all states are synced
      fetchData();
    } catch (error: any) {
      // REVERT optimistic state on failure
      console.error("[VIP] Error equipping:", error);
      recordClientError({ label: "VIP.handleEquip", message: error instanceof Error ? error.message : String(error) });
      setUserPrivileges(previousPrivileges);
      toast({
      });
    } finally {
      setEquipping(null);
    }
  };


  const getPrivilegesList = (tier: VIPTier) => {
    const privileges = [];
    if (tier.exclusive_frames) privileges.push({ icon: Image, label: "Exclusive Frames" });
    if (tier.exclusive_entry_bars) privileges.push({ icon: Sparkles, label: "Entry Effects" });
    if (tier.exclusive_gifts) privileges.push({ icon: Gift, label: "VIP Gifts" });
    if (tier.exclusive_bubbles) privileges.push({ icon: MessageCircle, label: "Chat Bubbles" });
    if (tier.exclusive_stickers) privileges.push({ icon: Star, label: "Stickers" });
    if (tier.priority_matching) privileges.push({ icon: Users, label: "Priority Match" });
    if (tier.ad_free) privileges.push({ icon: Ban, label: "Ad-Free" });
    if (tier.faster_support) privileges.push({ icon: Headphones, label: "Fast Support" });
    if (tier.vip_only_rooms) privileges.push({ icon: Crown, label: "VIP Rooms" });
    if (tier.profile_highlight) privileges.push({ icon: Zap, label: "Profile Glow" });
    return privileges;
  };

  const getTierIcon = (level: number) => {
    if (level >= 5) return Crown;
    if (level >= 3) return Gem;
    return Shield;
  };

  const getTierGradient = (level: number) => {
    switch (level) {
      case 6: return "from-purple-600 via-pink-500 to-fuchsia-600";
      case 5: return "from-rose-500 via-pink-500 to-rose-600";
      case 4: return "from-cyan-400 via-blue-500 to-cyan-500";
      case 3: return "from-gray-300 via-gray-200 to-gray-400";
      case 2: return "from-amber-400 via-yellow-400 to-amber-500";
      default: return "from-slate-400 via-gray-400 to-slate-500";
    }
  };

  // Group privileges by category - SEPARATE sections
  const framePrivileges = userPrivileges.filter(p => 
    getPrivilegeSlot(p.category) === 'frame'
  );
  // Entry Effects = full-screen entrance animations
  const entryEffectPrivileges = userPrivileges.filter(p => 
    getPrivilegeSlot(p.category) === 'entrance'
  );
  // Entry Name Bars = sliding name banner
  const entryNameBarPrivileges = userPrivileges.filter(p => 
    getPrivilegeSlot(p.category) === 'entry_name_bar'
  );
  // Chat Bubbles
  const bubblePrivileges = userPrivileges.filter(p => 
    getPrivilegeSlot(p.category) === 'bubble'
  );
  // Vehicles
  const vehiclePrivileges = userPrivileges.filter(p => 
    getPrivilegeSlot(p.category) === 'vehicle'
  );
  // Other
  const otherPrivileges = userPrivileges.filter(p => 
    getPrivilegeSlot(p.category) === 'medal' ||
    getPrivilegeSlot(p.category) === 'noble_card' ||
    getPrivilegeSlot(p.category) === 'other'
  );

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'frame': case 'portrait_frame': return 'Avatar Frame';
      case 'entrance': case 'entrance_effect': case 'entry_banner': return 'Entry Effect';
      case 'entry_name_bar': case 'entry_bar': return 'Entry Name Bar';
      case 'vehicle': case 'vehicle_entrance': return 'Vehicle';
      case 'bubble': case 'chat_bubble': return 'Chat Bubble';
    }
  };

  if (loading) {
    return (
      <PageSkeleton
        className="fixed inset-0 flex flex-col overflow-hidden"
        style={{ background: 'linear-gradient(180deg, #FFFBF2 0%, #FAF5EA 40%, #F5EFDF 100%)' }}
        rows={6}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 flex flex-col overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #FFFBF2 0%, #FAF5EA 40%, #F5EFDF 100%)' }}
    >
      {/* Header */}
      <div
        className="sticky top-0 z-50 bg-gradient-to-r from-amber-50/95 via-white/95 to-amber-50/95 backdrop-blur-xl safe-area-top"
        style={{ boxShadow: '0 6px 18px -10px rgba(217,119,6,0.35), inset 0 -1px 0 rgba(217,182,107,0.45)' }}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => navigate(-1)}
            className="h-9 w-9 rounded-full bg-white flex items-center justify-center transition-all hover:-translate-y-0.5 active:translate-y-0"
            style={{ boxShadow: '0 4px 12px -4px rgba(146,64,14,0.25), inset 0 1px 0 rgba(255,255,255,0.95), 0 0 0 1px rgba(217,182,107,0.45)' }}
          >
            <ArrowLeft className="w-5 h-5 text-heading" />
          </button>

          <h1
            className="text-lg font-bold text-heading flex items-center gap-2"
            style={{ textShadow: '0 1px 0 rgba(255,255,255,0.7)' }}
          >
            <Crown className="w-5 h-5 text-amber-500" style={{ filter: 'drop-shadow(0 2px 4px rgba(245,158,11,0.5))' }} />
            VIP Membership
          </h1>

          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
            style={{
              background: 'linear-gradient(135deg, rgba(254,243,199,0.95), rgba(253,230,138,0.9))',
              boxShadow: '0 6px 14px -6px rgba(217,119,6,0.4), inset 0 1px 0 rgba(255,255,255,0.7), 0 0 0 1px rgba(217,182,107,0.55)',
            }}
          >
            <Diamond3DIcon size={14} />
            <span className="text-amber-700 text-sm font-bold">{userDiamonds.toLocaleString()}</span>
          </div>
        </div>
      </div>


      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <TabsList
          className="mx-4 mt-3 p-1 rounded-2xl bg-transparent gap-1"
          style={{
            border: '1px solid rgba(217,182,107,0.45)',
          }}
        >
          <TabsTrigger
            value="vip"
            className="flex-1 rounded-xl font-semibold transition-all data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=inactive]:text-heading"
            style={activeTab === 'vip' ? {
              textShadow: '0 1px 2px rgba(0,0,0,0.20)',
            } : undefined}
          >
            <Crown className="w-4 h-4 mr-1.5" />
            VIP
          </TabsTrigger>
          <TabsTrigger
            value="noble"
            className="flex-1 rounded-xl font-semibold transition-all data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=inactive]:text-heading"
            style={activeTab === 'noble' ? {
            } : undefined}
          >
            <Crown className="w-4 h-4 mr-1.5" />
            Noble
          </TabsTrigger>
          <TabsTrigger
            value="privileges"
            className="flex-1 rounded-xl font-semibold transition-all data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=inactive]:text-heading"
            style={activeTab === 'privileges' ? {
            } : undefined}
          >
            <Sparkles className="w-4 h-4 mr-1.5" />
            Mine
          </TabsTrigger>
        </TabsList>

        {/* Noble & Daily Reward Tab */}
        <TabsContent value="noble" className="flex-1 overflow-y-auto mt-0 py-4" style={{ paddingBottom: 'var(--content-bottom-padding)' }}>
          <VipNobleSection
            userId={currentUserId}
            userDiamonds={userDiamonds}
            onAfterPurchase={fetchData}
          />
        </TabsContent>

        {/* VIP Plans Tab */}
        <TabsContent value="vip" className="flex-1 overflow-y-auto mt-0 px-4 py-4" style={{ paddingBottom: 'var(--content-bottom-padding)' }}>
          {/* Current VIP Status */}
          {currentVIPTier > 0 && (
            <div
              className="mb-4 p-4 rounded-2xl relative overflow-hidden"
              style={{
              }}
            >
              <div
                className="absolute -top-12 -right-12 w-40 h-40 rounded-full blur-3xl opacity-40"
                style={{ background: 'radial-gradient(circle, #fff, transparent 70%)' }}
              />
              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <VIPBadge tier={currentVIPTier} size="lg" />
                  <div>
                    <p className="text-white font-bold text-base" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.25)' }}>Active Membership</p>
                    <p className="text-white/85 text-xs" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.20)' }}>
                      Expires {vipExpiresAt ? new Date(vipExpiresAt).toLocaleDateString() : 'N/A'}
                    </p>
                  </div>
                </div>
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{
                    backdropFilter: 'blur(8px)',
                  }}
                >
                  <Sparkles className="w-5 h-5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]" />
                </div>
              </div>
            </div>
          )}

          {/* VIP Tiers Grid */}
          <div className="grid gap-4">
            {tiers.map((tier, index) => {
              const TierIcon = getTierIcon(tier.tier_level);
              const privileges = getPrivilegesList(tier);
              const isOwned = currentVIPTier >= tier.tier_level;
              
              return (
                <motion.div
                  key={tier.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.08 }}
                  className="relative rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-1"
                  style={{
                      ? '0 14px 32px -10px rgba(16,185,129,0.35), 0 2px 6px -2px rgba(15,23,42,0.10), inset 0 1px 0 rgba(255,255,255,0.7)'
                      : '0 14px 32px -12px rgba(180,140,40,0.30), 0 2px 6px -2px rgba(15,23,42,0.08), inset 0 1px 0 rgba(255,255,255,0.7)',
                  }}
                >
                  {/* Featured ribbon */}
                  {!isOwned && tier.tier_level >= 3 && (
                    <div
                      className="absolute top-3 right-3 z-10 px-2.5 py-1 rounded-full text-[10px] font-bold text-white tracking-wider"
                      style={{
                      }}
                    >
                      ★ BEST
                    </div>
                  )}

                  {/* Tier Header */}
                  <div className={`p-4 bg-gradient-to-r ${getTierGradient(tier.tier_level)} relative`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-14 h-14 rounded-2xl flex items-center justify-center overflow-hidden"
                          style={{
                          }}
                        >
                          {tier.badge_animation_url ? (
                            <UniversalAnimationPlayer
                              src={tier.badge_animation_url}
                              className="w-full h-full"
                              loop
                              autoPlay
                            />
                          ) : (
                            <TierIcon className="w-7 h-7 text-heading drop-shadow-[0_1px_2px_rgba(146,64,14,0.30)]" />
                          )}
                        </div>
                        <div>
                          <h3 className="text-heading font-bold text-lg" style={{ textShadow: '0 1px 0 rgba(255,255,255,0.7)' }}>{tier.tier_name}</h3>
                          <p className="text-body text-xs font-medium">{tier.duration_days} Days Membership</p>
                        </div>
                      </div>
                      {isOwned && (
                        <span
                          className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold text-white"
                          style={{
                          }}
                        >
                          <Check className="w-3 h-3" /> Active
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Privileges */}
                  <div className="p-4 bg-white/95">
                    {tier.description && <p className="text-heading text-sm mb-3 leading-snug">{tier.description}</p>}

                    <div className="grid grid-cols-2 gap-2 mb-4">
                      {privileges.slice(0, 6).map((priv, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 text-body text-xs font-medium px-2 py-1.5 rounded-lg"
                          style={{
                          }}
                        >
                          <priv.icon className="w-3.5 h-3.5 text-purple-700 flex-shrink-0" />
                          <span className="truncate">{priv.label}</span>
                        </div>
                      ))}
                    </div>

                    {/* Price & Action */}
                    <div className="flex items-center justify-between pt-3 border-t border-amber-200/60">
                      <div
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                        style={{
                        }}
                      >
                        <Diamond3DIcon size={18} />
                        <span className="text-heading font-bold text-base">
                          {tier.price_diamonds.toLocaleString()}
                        </span>
                      </div>

                      <button
                        onClick={() => setSelectedTier(tier)}
                        disabled={isOwned || purchasing}
                        className="px-5 py-2 rounded-full font-bold text-sm transition-all duration-300 hover:-translate-y-0.5 active:scale-95 disabled:opacity-100 disabled:hover:translate-y-0 disabled:cursor-default"
                        style={isOwned ? {
                          color: '#065f46',
                        } : {
                        }}
                      >
                        {isOwned ? '✓ Active' : 'Subscribe'}
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </TabsContent>

        {/* My Privileges Tab - ProfileDetail Style */}
        <TabsContent value="privileges" className="flex-1 overflow-y-auto mt-0 px-4 py-4" style={{ paddingBottom: 'var(--content-bottom-padding)' }}>
          {userPrivileges.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-20 h-20 rounded-full bg-purple-100 flex items-center justify-center mb-4">
                <Sparkles className="w-10 h-10 text-purple-700" />
              </div>
              <h3 className="text-heading font-semibold text-lg mb-2">No Privileges Yet</h3>
              <p className="text-heading text-sm mb-4">
                Level up or purchase items from the shop to unlock privileges
              </p>
              <Button 
                onClick={() => navigate("/shop")}
                className="bg-gradient-to-r from-purple-500 to-pink-500"
              >
                Browse Shop
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Reusable privilege item renderer */}
              {[
                { items: framePrivileges, icon: '👑', title: 'Avatar Frames', fallbackIcon: <Crown className="w-8 h-8 text-amber-500" />, bgFrom: 'from-purple-50', bgTo: 'to-pink-50', ringColor: 'hover:ring-purple-300/60', delay: 0.1 },
                { items: entryEffectPrivileges, icon: '✨', title: 'Entry Effects', fallbackIcon: <Sparkles className="w-8 h-8 text-pink-500" />, bgFrom: 'from-pink-50', bgTo: 'to-purple-50', ringColor: 'hover:ring-pink-300/60', delay: 0.15 },
                { items: entryNameBarPrivileges, icon: '🏷️', title: 'Entry Name Bar', fallbackIcon: <Sparkles className="w-8 h-8 text-amber-500" />, bgFrom: 'from-amber-50', bgTo: 'to-orange-50', ringColor: 'hover:ring-amber-300/60', delay: 0.2 },
                { items: bubblePrivileges, icon: '💬', title: 'Chat Bubbles', fallbackIcon: <MessageCircle className="w-8 h-8 text-cyan-600" />, bgFrom: 'from-cyan-50', bgTo: 'to-blue-50', ringColor: 'hover:ring-cyan-300/60', delay: 0.25 },
                { items: vehiclePrivileges, icon: '🚗', title: 'Vehicles', fallbackIcon: <Car className="w-8 h-8 text-emerald-600" />, bgFrom: 'from-emerald-50', bgTo: 'to-teal-50', ringColor: 'hover:ring-emerald-300/60', delay: 0.3 },
                { items: otherPrivileges, icon: '🎁', title: 'Other Privileges', fallbackIcon: <Gift className="w-8 h-8 text-cyan-600" />, bgFrom: 'from-cyan-50', bgTo: 'to-slate-50', ringColor: 'hover:ring-cyan-300/60', delay: 0.35 },
              ].map(({ items, icon, title, fallbackIcon, bgFrom, bgTo, ringColor, delay }) => (
                items.length > 0 && (
                  <motion.div
                    key={title}
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay }}
                  >
                    <div className="flex items-center gap-2 text-lg font-bold mb-3">
                      <span>{icon}</span>
                      <span className="text-heading">{title}</span>
                        <span className="text-body text-sm font-normal ml-auto">Choose 1</span>
                    </div>
                    
                    <div className={title === 'Entry Name Bar' ? 'flex flex-col gap-3' : 'flex flex-wrap gap-3'}>
                      {items.map((priv) => {
                        const isEntryNameBar = title === 'Entry Name Bar';
                        const lvl = ensureValidLevel(currentUserLevel);
                        return (
                        <motion.div
                          key={priv.id}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleEquip(priv)}
                          className={isEntryNameBar ? 'flex flex-col items-stretch w-full' : 'flex flex-col items-center'}
                        >
                          {isEntryNameBar ? (
                            // Wide composited preview — uses shared component
                            // so VIP tile, Shop card, and in-room render are
                            // visually identical (animation + engraved
                            // avatar/name/level always animate together).
                            <div className={`relative w-full rounded-xl overflow-hidden cursor-pointer transition-all ${
                              priv.is_equipped ? 'ring-2 ring-green-500 shadow-green-500/30 shadow-lg' : `ring-1 ring-white/10 ${ringColor} shadow-md`
                            }`}>
                              <div className="absolute inset-0 bg-gradient-to-br from-slate-100 to-slate-200" />
                              <EntryNameBarPreview
                                animationUrl={priv.animation_url}
                                previewUrl={priv.preview_url}
                                userName={currentUserName}
                                avatarUrl={currentUserAvatar}
                                level={lvl}
                              />

                              {priv.is_equipped && (
                                <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center shadow z-10">
                                  <Check className="w-3 h-3 text-white" strokeWidth={3} />
                                </div>
                              )}
                              {equipping === priv.id && (
                                <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-10">
                                  <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                                </div>
                              )}
                            </div>
                          ) : (
                          <div className={`flex-shrink-0 w-20 h-20 rounded-2xl overflow-hidden shadow-lg cursor-pointer transition-all relative ${
                            priv.is_equipped 
                                ? 'ring-2 ring-green-500 shadow-green-500/30' 
                                : `ring-1 ring-white/10 ${ringColor}`
                          }`}>
                            <div className={`w-full h-full bg-gradient-to-br ${bgFrom} ${bgTo} flex items-center justify-center relative`}>
                              {priv.animation_url && isValidAssetUrl(priv.animation_url) ? (
                                <UniversalFramePlayer
                                  src={priv.animation_url}
                                  className="w-full h-full"
                                  loop={true}
                                  autoPlay={true}
                                  muted={true}
                                />
                              ) : priv.preview_url && isValidAssetUrl(priv.preview_url) ? (
                                <img loading="lazy" decoding="async" 
                                  src={enhanceThumbnail(priv.preview_url, { width: 160, quality: 82 })} 
                                  alt={priv.name}
                                  className="w-full h-full object-cover" />
                              ) : (
                                fallbackIcon
                              )}
                            </div>
                            
                            {/* Equipped indicator */}
                            {priv.is_equipped && (
                              <div className="absolute top-1 right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                                <Check className="w-3 h-3 text-white" strokeWidth={3} />
                              </div>
                            )}
                            
                            {/* Loading state */}
                            {equipping === priv.id && (
                              <div className="absolute inset-0 bg-white/95 flex items-center justify-center">
                                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              </div>
                            )}
                          </div>
                          )}

                          
                          <div className="mt-1 max-w-20 truncate text-center text-[11px] font-medium text-heading">
                            {priv.name}
                          </div>

                          {/* Status/Timer below item */}
                          {(priv.source === 'admin_assigned' || priv.expires_at) && (
                            <div className="flex items-center gap-1 mt-1 text-xs">
                              {priv.source === 'admin_assigned' ? (
                                <>
                                  <Shield className="w-3 h-3 text-amber-700" />
                                  <span className="text-amber-700">{priv.role_type?.replace('_', ' ') || 'Assigned'}</span>
                                </>
                              ) : (
                                <>
                                  <Clock className="w-3 h-3 text-amber-700" />
                                  <span className="text-amber-700">{formatExpiration(priv.expires_at, countdownTick)}</span>
                                </>
                              )}
                            </div>
                          )}

                          <Button
                            size="sm"
                            type="button"
                            disabled={equipping === priv.id || priv.is_equipped}
                            onClick={(event) => {
                              event.stopPropagation();
                              handleEquip(priv);
                            }}
                            className={priv.is_equipped
                              ? 'mt-2 h-7 rounded-full bg-green-100 text-green-700 hover:bg-green-100 font-semibold'
                              : 'mt-2 h-7 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold shadow-md shadow-purple-500/30'}
                          >
                            {priv.is_equipped ? 'Equipped' : 'Equip'}
                          </Button>
                        </motion.div>
                        );
                      })}

                    </div>
                  </motion.div>
                )
              ))}
              
              {/* Info Note */}
              <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4 mt-4">
                <p className="text-body text-sm text-center">
                  💡 Equipped items will be displayed across all sections: Profile, Live Stream, Party Rooms, and Chat
                </p>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Purchase Confirmation Modal */}
      <Dialog open={!!selectedTier} onOpenChange={() => setSelectedTier(null)}>
        <DialogContent
          className="border-0 max-w-sm"
          style={{
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-heading text-center text-lg font-bold">Confirm VIP Purchase</DialogTitle>
          </DialogHeader>

          {selectedTier && (
            <div className="space-y-4">
              <div className="text-center">
                <VIPBadge tier={selectedTier.tier_level} size="lg" />
                <h3 className="text-heading font-bold text-xl mt-3" style={{ textShadow: '0 1px 0 rgba(255,255,255,0.6)' }}>{selectedTier.tier_name}</h3>
                <p className="text-body text-sm">{selectedTier.duration_days} Days Membership</p>
              </div>

              <div
                className="flex items-center justify-center gap-2 py-4 rounded-2xl"
                style={{
                }}
              >
                <Diamond3DIcon size={26} />
                <span className="text-amber-700 font-bold text-2xl">
                  {selectedTier.price_diamonds.toLocaleString()}
                </span>
              </div>

              <div className="text-center text-xs text-body">
                Your balance: <span className="text-heading font-semibold">{userDiamonds.toLocaleString()}</span> diamonds
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setSelectedTier(null)}
                  className="flex-1 py-3 rounded-full font-semibold text-heading transition-all duration-300 hover:-translate-y-0.5 active:scale-95"
                  style={{
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => handlePurchase(selectedTier)}
                  disabled={purchasing || userDiamonds < selectedTier.price_diamonds}
                  className="flex-1 py-3 rounded-full font-bold text-white transition-all duration-300 hover:-translate-y-0.5 active:scale-95 disabled:opacity-60 disabled:hover:translate-y-0"
                  style={{
                  }}
                >
                  {purchasing ? "Processing..." : "Confirm"}
                </button>
              </div>

              {userDiamonds < selectedTier.price_diamonds && (
                <button
                  onClick={() => {
                    setSelectedTier(null);
                    navigate("/recharge");
                  }}
                  className="w-full py-3 rounded-full font-bold text-white transition-all duration-300 hover:-translate-y-0.5 active:scale-95 flex items-center justify-center gap-2"
                  style={{
                  }}
                >
                  <Diamond3DIcon size={16} />
                  Recharge Diamonds
                </button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <BottomNavigation activeTab="/profile" />
    </div>
  );
};

export default VIP;
