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
import useExpiredItemsRestorer from "@/hooks/useExpiredItemsRestorer";
import { resolveLevelFromTiers } from "@/utils/levelResolver";
import VipNobleSection from "@/components/vip/VipNobleSection";
import { recordClientError } from "@/utils/clientErrorLog";

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
  price_coins?: number | null;
}): boolean => {
  return Boolean(
    asset.is_premium ||
    (asset.price_diamonds ?? 0) > 0 ||
    (asset.price_coins ?? 0) > 0,
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
  return level === 1 || level >= 6;
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
        .select("coins, current_vip_tier_id, vip_expires_at, user_level, host_level, is_host, gender, max_user_level, total_recharged, total_earnings, weekly_earnings, frame_id, equipped_frame_id, equipped_entrance_id, equipped_entry_banner_id, equipped_entry_name_bar_id, equipped_bubble_id, equipped_vehicle_id, equipped_medal_id, equipped_noble_card_id")
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
        setUserDiamonds(profileData.coins || 0);
        setVIPExpiresAt(profileData.vip_expires_at);
      }

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
            id: p.id,
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
        .select("id, name, frame_url, preview_url, min_level, level_required, target_type, is_premium, price_diamonds, price_coins")
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
              id: `frame_${frame.id}`,
              item_id: frame.id,
              name: frame.name,
              category: 'frame',
              preview_url: frame.preview_url,
              animation_url: frame.frame_url || frame.preview_url,
              is_equipped: isEquipped,
              expires_at: null,
              source: 'frame',
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
            id: priv.id,
            item_id: priv.id,
            name: priv.name || priv.privilege_name,
            category: priv.privilege_type,
            preview_url: priv.preview_url,
            animation_url: priv.animation_url || priv.preview_url,
            is_equipped: isEquipped,
            expires_at: null,
            source: 'level',
            unlock_level: requiredLevel,
          });
        }
      }

      // Fetch unlocked entry name bars only
      const { data: entryNameBars } = await supabase
        .from("entry_name_bars")
        .select("*")
        .eq("is_active", true)
        .order("level_required", { ascending: true });

      if (entryNameBars) {
        for (const bar of entryNameBars) {
          if (
            !isUnlockedByLevel(bar.level_required, effectiveLevel) ||
            !shouldShowLevelReward(bar.level_required) ||
            isMonetizedAsset(bar) ||
            !hasRenderableAsset(bar.animation_url, bar.image_url)
          ) continue;

          const isEquipped = bar.id === equippedEntryNameBarId;
          const alreadyExists = allPrivileges.some(p => p.item_id === bar.id);
          if (!alreadyExists) {
            allPrivileges.push({
              id: `enb_${bar.id}`,
              item_id: bar.id,
              name: bar.name,
              category: 'entry_name_bar',
              preview_url: bar.image_url,
              animation_url: bar.animation_url || bar.image_url,
              is_equipped: isEquipped,
              expires_at: null,
              source: 'level',
              unlock_level: bar.level_required || 1,
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
              id: `eb_${banner.id}`,
              item_id: banner.id,
              name: banner.name,
              category: 'entrance',
              preview_url: banner.image_url,
              animation_url: banner.animation_url || banner.image_url,
              is_equipped: isEquipped,
              expires_at: null,
              source: 'level',
              unlock_level: banner.level_required || 1,
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
              id: `vehicle_${vehicle.id}`,
              item_id: vehicle.id,
              name: vehicle.name,
              category: 'vehicle',
              preview_url: vehicle.preview_url || vehicle.image_url,
              animation_url: vehicle.animation_url || vehicle.preview_url || vehicle.image_url,
              is_equipped: isEquipped,
              expires_at: null,
              source: 'level',
              unlock_level: vehicle.level_required || 1,
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
                id: af.id,
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
                id: (assigned as any).id,
                item_id: frame.id,
                name: frame.frame_name,
                category: 'frame',
                preview_url: frame.frame_url,
                animation_url: frame.frame_url,
                is_equipped: isEquipped,
                expires_at: (assigned as any).expires_at,
                source: 'admin_assigned',
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
                id: `vip_frame_${activeTier.id}`,
                item_id: activeTier.id,
                name: `${activeTier.tier_name} Frame`,
                category: 'frame',
                preview_url: activeTier.frame_animation_url,
                animation_url: activeTier.frame_animation_url!,
                is_equipped: activeTier.id === equippedFrameId,
                expires_at: vipData?.expires_at || null,
                source: 'shop',
              });
            }
          }
          // VIP Entry Animation
          if (isValidAssetUrl(activeTier.entry_animation_url)) {
            const alreadyExists = allPrivileges.some(p => p.item_id === activeTier.id && p.category === 'entrance');
            if (!alreadyExists) {
              allPrivileges.push({
                id: `vip_entry_${activeTier.id}`,
                item_id: activeTier.id,
                name: `${activeTier.tier_name} Entry`,
                category: 'entrance',
                preview_url: activeTier.entry_animation_url,
                animation_url: activeTier.entry_animation_url!,
                is_equipped: activeTier.id === equippedEntranceId,
                expires_at: vipData?.expires_at || null,
                source: 'shop',
              });
            }
          }
          // VIP Chat Bubble
          if (isValidAssetUrl(activeTier.bubble_animation_url)) {
            const alreadyExists = allPrivileges.some(p => p.item_id === activeTier.id && p.category === 'bubble');
            if (!alreadyExists) {
              allPrivileges.push({
                id: `vip_bubble_${activeTier.id}`,
                item_id: activeTier.id,
                name: `${activeTier.tier_name} Bubble`,
                category: 'bubble',
                preview_url: activeTier.bubble_animation_url,
                animation_url: activeTier.bubble_animation_url!,
                is_equipped: activeTier.id === equippedBubbleId,
                expires_at: vipData?.expires_at || null,
                source: 'shop',
              });
            }
          }
        }
      }

      const visiblePrivileges = allPrivileges.filter((priv) => !isPrivilegeExpired(priv.expires_at));

      // Debug log to see what privileges we have
      console.log('[VIP] All privileges loaded:', {
        total: visiblePrivileges.length,
        frames: visiblePrivileges.filter(p => getPrivilegeSlot(p.category) === 'frame').length,
        adminAssigned: visiblePrivileges.filter(p => p.source === 'admin_assigned').length,
        entryEffects: visiblePrivileges.filter(p => getPrivilegeSlot(p.category) === 'entrance').length,
        vehicles: visiblePrivileges.filter(p => getPrivilegeSlot(p.category) === 'vehicle').length,
        categories: [...new Set(visiblePrivileges.map(p => p.category))],
        equipped: visiblePrivileges.filter(p => p.is_equipped).map(p => ({ name: p.name, category: p.category, source: p.source }))
      });

      setUserPrivileges(visiblePrivileges);
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
          description: "You don't have enough diamonds. Please recharge first.",
          variant: "destructive",
        });
        setSelectedTier(null);
        return;
      }

      // STEP 1: Fetch current equipped items to save as "previous" before VIP activation
      const { data: currentProfile } = await supabase
        .from("profiles")
        .select(`
          equipped_frame_id, equipped_entrance_id, equipped_bubble_id,
          equipped_vehicle_id, equipped_medal_id, equipped_entry_name_bar_id,
          equipped_entry_banner_id, equipped_noble_card_id
        `)
        .eq("id", user.id)
        .maybeSingle();

      // Build equip updates
      const equipUpdates: Record<string, any> = {};
      if (tier.frame_animation_url) {
        if (currentProfile?.equipped_frame_id) {
          equipUpdates.previous_frame_id = currentProfile.equipped_frame_id;
        }
        equipUpdates.equipped_frame_id = tier.id;
      }
      if (tier.entry_animation_url) {
        if (currentProfile?.equipped_entrance_id) {
          equipUpdates.previous_entrance_id = currentProfile.equipped_entrance_id;
        }
        equipUpdates.equipped_entrance_id = tier.id;
      }
      if (tier.bubble_animation_url) {
        if (currentProfile?.equipped_bubble_id) {
          equipUpdates.previous_bubble_id = currentProfile.equipped_bubble_id;
        }
        equipUpdates.equipped_bubble_id = tier.id;
      }

      console.log('[VIP] Purchasing via RPC with equip updates:', equipUpdates);

      // STEP 2: Use secure RPC to deduct diamonds + activate VIP
      const { data: result, error: rpcError } = await supabase.rpc("purchase_vip_tier", {
        p_user_id: user.id,
        p_tier_id: tier.id,
        p_price_diamonds: tier.price_diamonds,
        p_tier_level: tier.tier_level,
        p_duration_days: tier.duration_days,
        p_equip_updates: equipUpdates,
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
        title: "🎉 VIP Activated!",
        description: `You are now ${tier.tier_name}! All exclusive items are now equipped.`,
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
        title: "Purchase Failed",
        description: error.message || "Failed to activate VIP. Please try again.",
        variant: "destructive",
      });
    } finally {
      setPurchasing(false);
    }
  };

  const handleEquip = async (privilege: UserPrivilege) => {
    if (equipping) return;
    
    setEquipping(privilege.id);
    console.log('[VIP] Equipping privilege:', privilege);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('[VIP] No user found');
        recordClientError({ label: "VIP.handleEquip", message: '[VIP] No user found' });
        return;
      }

      // Determine the category type for proper equipping
      // UNIFIED ENTRY EFFECT CATEGORY:
      // - ALL entry animations (entrance, entrance_effect, entry_bar) share ONE slot
      // - User can only have ONE entry effect equipped at a time, regardless of source
      // SEPARATE CATEGORIES:
      // - Frames (frame, portrait_frame) - ONE slot
      // - Chat Bubbles (bubble) - ONE slot
      // - Vehicles (vehicle) - ONE slot
      // CRITICAL: Entry Effects and Entry Name Bars are SEPARATE categories
      // Entry Effects = full-screen entrance animations (entrance, entrance_effect, entry_bar from level_privileges)
      // Entry Name Bar = sliding name banner (entry_name_bar from entry_name_bars table)
      const privilegeSlot = getPrivilegeSlot(privilege.category);
      const isFrame = privilegeSlot === 'frame';

      console.log('[VIP] Category detection:', { privilegeSlot, category: privilege.category });

      if (privilegeSlot === 'other') {
        toast({
          title: 'Unsupported Item',
          description: 'This privilege cannot be equipped yet.',
          variant: 'destructive',
        });
        return;
      }

      // For shop purchases, update user_purchases table
      if (privilege.source === 'shop') {
        // Get all user purchases to filter by category
        const { data: allPurchases } = await supabase
          .from("user_purchases")
          .select("id, shop_items(category)")
          .eq("user_id", user.id)
          .eq("is_active", true);

        // Find purchases in the SAME CATEGORY to unequip
        // Entry Effects and Entry Name Bars are SEPARATE categories
        const sameCategoryIds = allPurchases
          ?.filter(p => {
            const pCategory = (p.shop_items as any)?.category;
            return getPrivilegeSlot(pCategory || 'other') === privilegeSlot;
          })
          .map(p => p.id) || [];

        console.log('[VIP] Unequipping same category items:', sameCategoryIds);

        // Unequip only same category items
        if (sameCategoryIds.length > 0) {
          const { error: unequipError } = await supabase
            .from("user_purchases")
            .update({ is_equipped: false })
            .in("id", sameCategoryIds);

          if (unequipError) {
            console.error('[VIP] Error unequipping shop items:', unequipError);
            recordClientError({ label: "VIP.pCategory", message: unequipError instanceof Error ? unequipError.message : String(unequipError) });
          }
        }

        // Equip the selected item
        const { error: equipError } = await supabase
          .from("user_purchases")
          .update({ is_equipped: true })
          .eq("id", privilege.id);

        if (equipError) {
          console.error('[VIP] Error equipping shop item:', equipError);
          recordClientError({ label: "VIP.pCategory", message: equipError instanceof Error ? equipError.message : String(equipError) });
        }
      }

      // For admin-assigned frames, update user_role_frames table
      if (privilegeSlot === 'frame') {
        const { error: unequipError } = await supabase
          .from("user_role_frames")
          .update({ is_equipped: false })
          .eq("user_id", user.id);

        if (unequipError) {
          console.error('[VIP] Error unequipping admin-assigned frames:', unequipError);
          recordClientError({ label: "VIP.pCategory", message: unequipError instanceof Error ? unequipError.message : String(unequipError) });
        }
      }

      if (privilege.source === 'admin_assigned') {
        // Unequip all other admin-assigned frames for this user
        // Equip the selected admin-assigned frame
        const { error: equipError } = await supabase
          .from("user_role_frames")
          .update({ is_equipped: true })
          .eq("id", privilege.id);

        if (equipError) {
          console.error('[VIP] Error equipping admin-assigned frame:', equipError);
          recordClientError({ label: "VIP.pCategory", message: equipError instanceof Error ? equipError.message : String(equipError) });
        }
      }

      // Update profile's equipped item based on category
      // Entry Effects and Entry Name Bars are SEPARATE slots
      const updateData: Record<string, string | null> = {};
      
      if (privilegeSlot === 'frame') {
        updateData.equipped_frame_id = privilege.item_id;
        console.log('[VIP] Setting equipped_frame_id to:', privilege.item_id);
      } else if (privilegeSlot === 'entrance') {
        updateData.equipped_entrance_id = privilege.item_id;
        updateData.equipped_entry_banner_id = privilege.item_id;
        console.log('[VIP] Setting entrance slot to:', privilege.item_id, 'type:', privilege.category);
      } else if (privilegeSlot === 'entry_name_bar') {
        updateData.equipped_entry_name_bar_id = privilege.item_id;
        console.log('[VIP] Setting equipped_entry_name_bar_id to:', privilege.item_id);
      } else if (privilegeSlot === 'bubble') {
        updateData.equipped_bubble_id = privilege.item_id;
        console.log('[VIP] Setting equipped_bubble_id to:', privilege.item_id);
      } else if (privilegeSlot === 'vehicle') {
        updateData.equipped_vehicle_id = privilege.item_id;
        console.log('[VIP] Setting equipped_vehicle_id to:', privilege.item_id);
      } else if (privilegeSlot === 'medal') {
        updateData.equipped_medal_id = privilege.item_id;
        console.log('[VIP] Setting equipped_medal_id to:', privilege.item_id);
      } else if (privilegeSlot === 'noble_card') {
        updateData.equipped_noble_card_id = privilege.item_id;
        console.log('[VIP] Setting equipped_noble_card_id to:', privilege.item_id);
      }

      console.log('[VIP] Profile update data:', updateData);

      if (Object.keys(updateData).length > 0) {
        const { error: profileError } = await supabase
          .from("profiles")
          .update(updateData)
          .eq("id", user.id);

        if (profileError) {
          console.error('[VIP] Error updating profile:', profileError);
          recordClientError({ label: "VIP.updateData", message: profileError instanceof Error ? profileError.message : String(profileError) });
          toast({
            title: "Failed to Equip",
            description: profileError.message,
            variant: "destructive",
          });
          return;
        }
        
        console.log('[VIP] Profile updated successfully');
        
        // CRITICAL: Clear frame cache so profile shows new frame immediately
        if (isFrame) {
          clearFrameCache();
          console.log('[VIP] Frame cache cleared for instant update');
        }
      }

      // Update local state - unequip items in the SAME category
      setUserPrivileges(prev => prev.map(p => {
        // If this is the selected item, equip it
        if (p.id === privilege.id) {
          return { ...p, is_equipped: true };
        }
        
        if (getPrivilegeSlot(p.category) === privilegeSlot) return { ...p, is_equipped: false };
        
        return p;
      }));

      toast({
        title: "✨ Equipped!",
        description: `${privilege.name} is now active everywhere - Profile, Live, Party Rooms, Chat!`,
      });

      void fetchData();
    } catch (error: any) {
      console.error("[VIP] Error equipping:", error);
      recordClientError({ label: "VIP.updateData", message: error instanceof Error ? error.message : String(error) });
      toast({
        title: "Failed to Equip",
        description: error.message,
        variant: "destructive",
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
      default: return category;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F7F8FA] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-[#F7F8FA] overflow-hidden">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-gradient-to-r from-amber-50/95 via-white/95 to-amber-50/95 backdrop-blur-xl safe-area-top border-b border-amber-200/50 shadow-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => navigate(-1)}
            className="text-heading hover:bg-amber-100/60 w-9 h-9 rounded-full"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>

          <h1 className="text-lg font-bold text-heading flex items-center gap-2">
            <Crown className="w-5 h-5 text-amber-500" />
            VIP Membership
          </h1>

          <div className="flex items-center gap-1.5 bg-amber-100/80 px-2.5 py-1 rounded-full border border-amber-300/60">
            <Diamond3DIcon size={14} />
            <span className="text-amber-700 text-sm font-bold">{userDiamonds.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="mx-4 mt-3 bg-slate-50 border border-amber-200/60 p-1 rounded-xl">
          <TabsTrigger 
            value="vip" 
            className="flex-1 rounded-lg data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-pink-500"
          >
            <Crown className="w-4 h-4 mr-2" />
            VIP Plans
          </TabsTrigger>
          <TabsTrigger 
            value="noble" 
            className="flex-1 rounded-lg data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-yellow-500"
          >
            <Crown className="w-4 h-4 mr-2" />
            Noble
          </TabsTrigger>
          <TabsTrigger 
            value="privileges" 
            className="flex-1 rounded-lg data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-pink-500"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            My Privileges
          </TabsTrigger>
        </TabsList>

        {/* Noble & Daily Reward Tab */}
        <TabsContent value="noble" className="flex-1 overflow-y-auto mt-0 py-4" style={{ paddingBottom: 'var(--content-bottom-padding)' }}>
          <VipNobleSection
            userId={currentUserId}
            userDiamonds={userDiamonds}
            onAfterPurchase={() => { /* refetch handled inside */ }}
          />
        </TabsContent>

        {/* VIP Plans Tab */}
        <TabsContent value="vip" className="flex-1 overflow-y-auto mt-0 px-4 py-4" style={{ paddingBottom: 'var(--content-bottom-padding)' }}>
          {/* Current VIP Status */}
          {currentVIPTier > 0 && (
            <div className="mb-4 p-4 rounded-2xl bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <VIPBadge tier={currentVIPTier} size="lg" />
                  <div>
                    <p className="text-heading font-semibold">Current Status</p>
                    <p className="text-heading text-sm">
                      Expires: {vipExpiresAt ? new Date(vipExpiresAt).toLocaleDateString() : 'N/A'}
                    </p>
                  </div>
                </div>
                <Sparkles className="w-6 h-6 text-purple-700" />
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
                  transition={{ delay: index * 0.1 }}
                  className={`relative rounded-2xl overflow-hidden border ${
                    isOwned ? 'border-green-500/50' : 'border-amber-200/60'
                  }`}
                >
                  {/* Tier Header */}
                  <div className={`p-4 bg-gradient-to-r ${getTierGradient(tier.tier_level)}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-amber-100/80 flex items-center justify-center overflow-hidden">
                          {tier.badge_animation_url ? (
                            <UniversalAnimationPlayer
                              src={tier.badge_animation_url}
                              className="w-full h-full"
                              loop
                              autoPlay
                            />
                          ) : (
                            <TierIcon className="w-6 h-6 text-heading" />
                          )}
                        </div>
                        <div>
                          <h3 className="text-heading font-bold text-lg">{tier.tier_name}</h3>
                          <p className="text-body text-sm">{tier.duration_days} Days</p>
                        </div>
                      </div>
                      {isOwned && (
                        <Badge className="bg-green-500 text-heading border-0">
                          <Check className="w-3 h-3 mr-1" /> Active
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Privileges */}
                  <div className="p-4 bg-white/95">
                    <p className="text-heading text-sm mb-3">{tier.description}</p>
                    
                    <div className="grid grid-cols-2 gap-2 mb-4">
                      {privileges.slice(0, 6).map((priv, i) => (
                        <div key={i} className="flex items-center gap-2 text-body text-sm">
                          <priv.icon className="w-4 h-4 text-purple-700" />
                          <span>{priv.label}</span>
                        </div>
                      ))}
                    </div>

                    {/* Price & Action */}
                    <div className="flex items-center justify-between pt-3 border-t border-amber-200/60">
                      <div className="flex items-center gap-2">
                        <Diamond3DIcon size={20} />
                        <span className="text-heading font-bold text-lg">
                          {tier.price_diamonds.toLocaleString()}
                        </span>
                      </div>
                      
                      <Button
                        onClick={() => setSelectedTier(tier)}
                        disabled={isOwned || purchasing}
                        className={`px-6 ${
                          isOwned 
                            ? 'bg-green-100 text-green-700' 
                            : 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-on-dark'
                        }`}
                      >
                        {isOwned ? 'Active' : 'Subscribe'}
                      </Button>
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
                    
                    <div className="flex flex-wrap gap-3">
                      {items.map((priv) => (
                        <motion.div
                          key={priv.id}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleEquip(priv)}
                          className="flex flex-col items-center"
                        >
                          <div className={`flex-shrink-0 w-20 h-20 rounded-2xl overflow-hidden shadow-lg cursor-pointer transition-all relative ${
                            priv.is_equipped 
                                ? 'ring-2 ring-green-500 shadow-green-500/30' 
                                : `ring-1 ring-white/10 ${ringColor}`
                          }`}>
                            <div className={`w-full h-full bg-gradient-to-br ${bgFrom} ${bgTo} flex items-center justify-center`}>
                              {priv.animation_url && isValidAssetUrl(priv.animation_url) ? (
                                <UniversalFramePlayer
                                  src={priv.animation_url}
                                  className="w-full h-full"
                                  loop={true}
                                  autoPlay={true}
                                  muted={true}
                                />
                              ) : priv.preview_url && isValidAssetUrl(priv.preview_url) ? (
                                <img 
                                  src={priv.preview_url} 
                                  alt={priv.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                fallbackIcon
                              )}
                            </div>
                            
                            {/* Equipped indicator */}
                            {priv.is_equipped && (
                              <div className="absolute top-1 right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                                <Check className="w-3 h-3 text-heading" />
                              </div>
                            )}
                            
                            {/* Loading state */}
                            {equipping === priv.id && (
                              <div className="absolute inset-0 bg-white/95 flex items-center justify-center">
                                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              </div>
                            )}
                          </div>
                          
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
                              ? 'mt-2 h-7 rounded-full bg-green-100 text-green-700 hover:bg-green-100'
                              : 'mt-2 h-7 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-heading'}
                          >
                            {priv.is_equipped ? 'Equipped' : 'Equip'}
                          </Button>
                        </motion.div>
                      ))}
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
        <DialogContent className="bg-white border-purple-500/30 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-heading text-center">Confirm VIP Purchase</DialogTitle>
          </DialogHeader>
          
          {selectedTier && (
            <div className="space-y-4">
              <div className="text-center">
                <VIPBadge tier={selectedTier.tier_level} size="lg" />
                <h3 className="text-heading font-bold text-xl mt-3">{selectedTier.tier_name}</h3>
                <p className="text-heading">{selectedTier.duration_days} Days Membership</p>
              </div>

              <div className="flex items-center justify-center gap-2 py-4 bg-amber-500/10 rounded-xl">
                <Diamond3DIcon size={24} />
                <span className="text-amber-700 font-bold text-2xl">
                  {selectedTier.price_diamonds.toLocaleString()}
                </span>
              </div>

              <div className="text-center text-sm text-heading">
                Your balance: {userDiamonds.toLocaleString()} diamonds
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setSelectedTier(null)}
                  className="flex-1 border-amber-200/70 text-heading"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => handlePurchase(selectedTier)}
                  disabled={purchasing || userDiamonds < selectedTier.price_diamonds}
                  className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500"
                >
                  {purchasing ? "Processing..." : "Confirm"}
                </Button>
              </div>

              {userDiamonds < selectedTier.price_diamonds && (
                <Button
                  onClick={() => {
                    setSelectedTier(null);
                    navigate("/recharge");
                  }}
                  className="w-full bg-amber-500 hover:bg-amber-600"
                >
                  Recharge Diamonds
                </Button>
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
