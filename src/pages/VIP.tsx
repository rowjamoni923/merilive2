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
  Clock
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
const formatExpiration = (expiresAt: string | null): string | null => {
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

  // Check and restore expired VIP items automatically  
  useExpiredItemsRestorer(currentUserId);

  useEffect(() => {
    fetchData();
    
    // Use universal realtime instead of 8-table manual channel
    let unsubscribe: (() => void) | undefined;
    import('@/hooks/useUniversalRealtime').then(({ subscribeToTables }) => {
      unsubscribe = subscribeToTables(
        `vip-page-${Date.now()}`,
        ['vip_tiers', 'user_vip_subscriptions', 'level_privileges', 'avatar_frames', 'user_purchases', 'shop_items', 'entry_banners', 'entry_name_bars'],
        () => {
          fetchData();
        }
      );
    });

    return () => {
      unsubscribe?.();
    };
  }, []);

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
        .select("coins, current_vip_tier_id, vip_expires_at, user_level, frame_id, equipped_frame_id, equipped_entrance_id, equipped_entry_name_bar_id, equipped_bubble_id, equipped_vehicle_id")
        .eq("id", user.id)
        .single();

      const userLevel = profileData?.user_level || 1;
      // Use equipped_frame_id first, fallback to frame_id for backwards compatibility
      const equippedFrameId = profileData?.equipped_frame_id || profileData?.frame_id;
      const equippedEntranceId = profileData?.equipped_entrance_id;
      const equippedEntryNameBarId = profileData?.equipped_entry_name_bar_id;
      const equippedBubbleId = profileData?.equipped_bubble_id;
      const equippedVehicleId = profileData?.equipped_vehicle_id;
      
      console.log('[VIP] Profile equipped IDs:', {
        frame: equippedFrameId || 'none',
        entrance: equippedEntranceId || 'none',
        entryBar: equippedEntryNameBarId || 'none',
        bubble: equippedBubbleId || 'none',
        vehicle: equippedVehicleId || 'none',
        userLevel
      });

      if (profileData) {
        setUserDiamonds(profileData.coins || 0);
        setVIPExpiresAt(profileData.vip_expires_at);
      }

      // Fetch current VIP subscription
      const { data: vipData } = await supabase
        .from("user_vip_subscriptions")
        .select("tier_id, vip_tiers(tier_level), expires_at")
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

      // Fetch ONLY user's purchased items (from shop) that have REAL animation files
      const { data: purchases } = await supabase
        .from("user_purchases")
        .select(`
          id,
          item_id,
          is_equipped,
          expires_at,
          shop_items (
            id,
            name,
            category,
            preview_url,
            animation_url,
            animation_file_url
          )
        `)
        .eq("user_id", user.id)
        .eq("is_active", true);

      if (purchases) {
        for (const p of purchases) {
          if (p.shop_items) {
            // Skip expired items
            if (p.expires_at && new Date(p.expires_at) < new Date()) {
              continue;
            }
            
            const animUrl = (p.shop_items as any).animation_url || (p.shop_items as any).animation_file_url;
            const previewUrl = (p.shop_items as any).preview_url;
            const shopCategory = (p.shop_items as any).category;
            const isFrameCategory = shopCategory === 'frame' || shopCategory === 'portrait_frame';
            
            // Include items with valid animation OR preview URLs
            const displayUrl = animUrl || previewUrl;
            if (isValidAssetUrl(displayUrl)) {
              let isEquipped = false;
              if (isFrameCategory) {
                isEquipped = p.item_id === equippedFrameId;
              } else if (shopCategory === 'entrance' || shopCategory === 'entrance_effect') {
                isEquipped = p.item_id === equippedEntranceId;
              } else if (shopCategory === 'entry_bar') {
                isEquipped = p.item_id === equippedEntryNameBarId;
              } else if (shopCategory === 'bubble') {
                isEquipped = p.item_id === equippedBubbleId;
              } else if (shopCategory === 'vehicle' || shopCategory === 'vehicle_entrance') {
                isEquipped = p.item_id === equippedVehicleId;
              }
              
              allPrivileges.push({
                id: p.id,
                item_id: p.item_id,
                name: (p.shop_items as any).name,
                category: shopCategory,
                preview_url: previewUrl,
                animation_url: animUrl || previewUrl,
                is_equipped: isEquipped,
                expires_at: p.expires_at,
                source: 'shop',
              });
            }
          }
        }
      }

      // Fetch ALL avatar frames (show locked ones too)
      const { data: availableFrames } = await supabase
        .from("avatar_frames")
        .select("id, name, frame_url, preview_url, min_level")
        .eq("is_active", true)
        .order("min_level", { ascending: true });

      if (availableFrames) {
        const hasEquippedFrameInDB = !!equippedFrameId;
        
        for (const frame of availableFrames) {
          const frameAssetUrl = frame.frame_url || frame.preview_url;
          const isEquipped = hasEquippedFrameInDB && frame.id === equippedFrameId;
          const alreadyExists = allPrivileges.some(p => p.item_id === frame.id);
          const isLocked = (frame.min_level || 1) > userLevel;
          if (!alreadyExists) {
            allPrivileges.push({
              id: `frame_${frame.id}`,
              item_id: frame.id,
              name: frame.name,
              category: 'frame',
              preview_url: frame.preview_url,
              animation_url: frame.frame_url || frame.preview_url,
              is_equipped: isEquipped,
              is_locked: isLocked,
              expires_at: null,
              source: 'frame',
              unlock_level: frame.min_level,
            });
          }
        }
      }

      // Fetch ALL level privileges (show locked ones too)
      const { data: levelPrivileges } = await supabase
        .from("level_privileges")
        .select("*")
        .eq("is_active", true)
        .order("unlock_level", { ascending: true });

      if (levelPrivileges) {
        for (const priv of levelPrivileges) {
          const privAssetUrl = priv.animation_url || priv.preview_url;
          const isLocked = (priv.unlock_level || 1) > userLevel;
          let isEquipped = false;
          const privType = priv.privilege_type;
          if (!isLocked) {
            if (privType === 'entrance' || privType === 'entrance_effect') {
              isEquipped = priv.id === equippedEntranceId;
            } else if (privType === 'entry_bar') {
              isEquipped = priv.id === equippedEntryNameBarId;
            } else if (privType === 'bubble') {
              isEquipped = priv.id === equippedBubbleId;
            } else if (privType === 'vehicle' || privType === 'vehicle_entrance') {
              isEquipped = priv.id === equippedVehicleId;
            }
          }
          
          allPrivileges.push({
            id: priv.id,
            item_id: priv.id,
            name: priv.name,
            category: priv.privilege_type,
            preview_url: priv.preview_url,
            animation_url: priv.animation_url || priv.preview_url,
            is_equipped: isEquipped,
            is_locked: isLocked,
            expires_at: null,
            source: 'level',
            unlock_level: priv.unlock_level,
          });
        }
      }

      // Fetch ALL entry name bars (show locked ones too)
      const { data: entryNameBars } = await supabase
        .from("entry_name_bars")
        .select("*")
        .eq("is_active", true)
        .order("min_level", { ascending: true });

      if (entryNameBars) {
        for (const bar of entryNameBars) {
          const barAssetUrl = bar.animation_url || bar.preview_url;
          const isEquipped = bar.id === equippedEntryNameBarId;
          const alreadyExists = allPrivileges.some(p => p.item_id === bar.id);
          const isLocked = (bar.min_level || 1) > userLevel;
          if (!alreadyExists) {
            allPrivileges.push({
              id: `enb_${bar.id}`,
              item_id: bar.id,
              name: bar.name,
              category: 'entry_name_bar',
              preview_url: bar.preview_url,
              animation_url: bar.animation_url || bar.preview_url,
              is_equipped: isEquipped,
              is_locked: isLocked,
              expires_at: null,
              source: 'level',
              unlock_level: bar.min_level || 1,
            });
          }
        }
      }

      // Fetch ALL entry banners (entrance animations) - show locked ones too
      const { data: entryBanners } = await supabase
        .from("entry_banners")
        .select("*")
        .eq("is_active", true)
        .order("min_level", { ascending: true });

      if (entryBanners) {
        for (const banner of entryBanners) {
          const isEquipped = banner.id === equippedEntranceId;
          const alreadyExists = allPrivileges.some(p => p.item_id === banner.id);
          const isLocked = (banner.min_level || 1) > userLevel;
          if (!alreadyExists) {
            allPrivileges.push({
              id: `eb_${banner.id}`,
              item_id: banner.id,
              name: banner.name,
              category: 'entrance',
              preview_url: banner.preview_url,
              animation_url: banner.animation_url || banner.preview_url,
              is_equipped: isEquipped,
              is_locked: isLocked,
              expires_at: null,
              source: 'level',
              unlock_level: banner.min_level || 1,
            });
          }
        }
      }

      // Fetch ADMIN-ASSIGNED frames (from user_role_frames table)
      // These are frames assigned by admin/agency owner to specific users
      const { data: assignedFrames } = await supabase
        .from("user_role_frames")
        .select(`
          id,
          frame_id,
          role_type,
          is_equipped,
          role_frames (
            id,
            frame_name,
            frame_url,
            description,
            is_active
          )
        `)
        .eq("user_id", user.id);

      if (assignedFrames) {
        for (const assigned of assignedFrames) {
          const frame = assigned.role_frames as any;
          if (frame && frame.is_active && isValidAssetUrl(frame.frame_url)) {
            const isEquipped = assigned.is_equipped || frame.id === equippedFrameId;
            const alreadyExists = allPrivileges.some(p => p.item_id === frame.id);
            if (!alreadyExists) {
              allPrivileges.push({
                id: assigned.id,
                item_id: frame.id,
                name: frame.frame_name,
                category: 'frame',
                preview_url: frame.frame_url,
                animation_url: frame.frame_url,
                is_equipped: isEquipped,
                expires_at: null,
                source: 'admin_assigned',
                role_type: assigned.role_type,
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
                          (vipData?.tier_id ? tiersData.find(t => t.id === vipData.tier_id) : null);
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

      // Debug log to see what privileges we have
      console.log('[VIP] All privileges loaded:', {
        total: allPrivileges.length,
        frames: allPrivileges.filter(p => p.category === 'frame' || p.category === 'portrait_frame').length,
        adminAssigned: allPrivileges.filter(p => p.source === 'admin_assigned').length,
        entryEffects: allPrivileges.filter(p => ['entrance', 'entrance_effect', 'entry_bar'].includes(p.category)).length,
        other: allPrivileges.filter(p => ['vehicle', 'vehicle_entrance', 'bubble'].includes(p.category)).length,
        categories: [...new Set(allPrivileges.map(p => p.category))],
        equipped: allPrivileges.filter(p => p.is_equipped).map(p => ({ name: p.name, category: p.category, source: p.source }))
      });

      setUserPrivileges(allPrivileges);
    } catch (error) {
      console.error("Error fetching VIP data:", error);
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
        .single();

      // STEP 2: Build profile update with VIP tier info + auto-equip VIP assets
      const expiresAt = new Date(Date.now() + tier.duration_days * 24 * 60 * 60 * 1000).toISOString();
      
      const profileUpdate: Record<string, any> = {
        coins: userDiamonds - tier.price_diamonds,
        current_vip_tier_id: tier.id,
        vip_expires_at: expiresAt,
        vip_tier: tier.tier_level, // Also update vip_tier column
      };

      // Auto-equip VIP tier's exclusive assets and save previous
      // VIP Frame
      if (tier.frame_animation_url) {
        if (currentProfile?.equipped_frame_id) {
          profileUpdate.previous_frame_id = currentProfile.equipped_frame_id;
        }
        profileUpdate.equipped_frame_id = tier.id; // Use tier.id as reference
      }

      // VIP Entry Animation
      if (tier.entry_animation_url) {
        if (currentProfile?.equipped_entrance_id) {
          profileUpdate.previous_entrance_id = currentProfile.equipped_entrance_id;
        }
        profileUpdate.equipped_entrance_id = tier.id;
      }

      // VIP Chat Bubble
      if (tier.bubble_animation_url) {
        if (currentProfile?.equipped_bubble_id) {
          profileUpdate.previous_bubble_id = currentProfile.equipped_bubble_id;
        }
        profileUpdate.equipped_bubble_id = tier.id;
      }

      console.log('[VIP] Auto-equipping VIP assets:', profileUpdate);

      const { error: updateError } = await supabase
        .from("profiles")
        .update(profileUpdate)
        .eq("id", user.id);

      if (updateError) throw updateError;

      // Create VIP subscription record
      const { error: subError } = await supabase
        .from("user_vip_subscriptions")
        .upsert({
          user_id: user.id,
          tier_id: tier.id,
          expires_at: expiresAt,
          is_active: true,
        }, {
          onConflict: 'user_id,tier_id'
        });

      if (subError) throw subError;

      // Clear frame cache for instant profile update
      if (tier.frame_animation_url) {
        clearFrameCache();
      }

      toast({
        title: "🎉 VIP Activated!",
        description: `You are now ${tier.tier_name}! All exclusive items are now equipped.`,
      });

      setUserDiamonds(prev => prev - tier.price_diamonds);
      setCurrentVIPTier(tier.tier_level);
      setVIPExpiresAt(expiresAt);
      setSelectedTier(null);
      
      // Refresh data to show new privileges
      fetchData();
    } catch (error: any) {
      console.error("Error purchasing VIP:", error);
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
      const isFrame = privilege.category === 'frame' || privilege.category === 'portrait_frame';
      
      // Entry Effects - includes entrance, entrance_effect, entry_bar, vehicle, vehicle_entrance
      // ALL full-screen entry animations share the Entry Effects category
      const isEntryEffect = privilege.category === 'entrance' || 
                           privilege.category === 'entrance_effect' || 
                           privilege.category === 'entry_bar' ||
                           privilege.category === 'vehicle' ||
                           privilege.category === 'vehicle_entrance';
      
      // Entry Name Bar - SEPARATE from entry effects, only from entry_name_bars table
      const isEntryNameBar = privilege.category === 'entry_name_bar';
      
      const isBubble = privilege.category === 'bubble';
      const isVehicle = false; // Vehicle is now part of Entry Effects

      console.log('[VIP] Category detection:', { isFrame, isEntryEffect, isEntryNameBar, isBubble, isVehicle, category: privilege.category });

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
            if (isFrame && (pCategory === 'frame' || pCategory === 'portrait_frame')) return true;
            if (isEntryEffect && (pCategory === 'entrance' || pCategory === 'entrance_effect' || pCategory === 'entry_bar' || pCategory === 'vehicle' || pCategory === 'vehicle_entrance')) return true;
            if (isEntryNameBar && pCategory === 'entry_name_bar') return true;
            if (isBubble && pCategory === 'bubble') return true;
            return false;
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
          }
        }

        // Equip the selected item
        const { error: equipError } = await supabase
          .from("user_purchases")
          .update({ is_equipped: true })
          .eq("id", privilege.id);

        if (equipError) {
          console.error('[VIP] Error equipping shop item:', equipError);
        }
      }

      // For admin-assigned frames, update user_role_frames table
      if (privilege.source === 'admin_assigned') {
        // Unequip all other admin-assigned frames for this user
        const { error: unequipError } = await supabase
          .from("user_role_frames")
          .update({ is_equipped: false })
          .eq("user_id", user.id);

        if (unequipError) {
          console.error('[VIP] Error unequipping admin-assigned frames:', unequipError);
        }

        // Equip the selected admin-assigned frame
        const { error: equipError } = await supabase
          .from("user_role_frames")
          .update({ is_equipped: true })
          .eq("id", privilege.id);

        if (equipError) {
          console.error('[VIP] Error equipping admin-assigned frame:', equipError);
        }
      }

      // Update profile's equipped item based on category
      // Entry Effects and Entry Name Bars are SEPARATE slots
      const updateData: Record<string, string | null> = {};
      
      if (isFrame) {
        updateData.equipped_frame_id = privilege.item_id;
        console.log('[VIP] Setting equipped_frame_id to:', privilege.item_id);
      } else if (isEntryEffect) {
        // Entry Effects (full-screen animations) use equipped_entrance_id
        updateData.equipped_entrance_id = privilege.item_id;
        console.log('[VIP] Setting equipped_entrance_id to:', privilege.item_id, 'type:', privilege.category);
      } else if (isEntryNameBar) {
        // Entry Name Bar (sliding name banner) uses equipped_entry_name_bar_id - SEPARATE from entry effects
        updateData.equipped_entry_name_bar_id = privilege.item_id;
        console.log('[VIP] Setting equipped_entry_name_bar_id to:', privilege.item_id);
      } else if (isBubble) {
        updateData.equipped_bubble_id = privilege.item_id;
        console.log('[VIP] Setting equipped_bubble_id to:', privilege.item_id);
      }

      console.log('[VIP] Profile update data:', updateData);

      if (Object.keys(updateData).length > 0) {
        const { error: profileError } = await supabase
          .from("profiles")
          .update(updateData)
          .eq("id", user.id);

        if (profileError) {
          console.error('[VIP] Error updating profile:', profileError);
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
      // Entry Effects and Entry Name Bars are SEPARATE categories
      setUserPrivileges(prev => prev.map(p => {
        const pIsFrame = p.category === 'frame' || p.category === 'portrait_frame';
        // Entry Effects = entrance, entrance_effect, entry_bar, vehicle, vehicle_entrance (ALL full-screen)
        const pIsEntryEffect = p.category === 'entrance' || p.category === 'entrance_effect' || p.category === 'entry_bar' || p.category === 'vehicle' || p.category === 'vehicle_entrance';
        // Entry Name Bar = entry_name_bar (from entry_name_bars table) - SEPARATE slot
        const pIsEntryNameBar = p.category === 'entry_name_bar';
        const pIsBubble = p.category === 'bubble';
        
        // If this is the selected item, equip it
        if (p.id === privilege.id) {
          return { ...p, is_equipped: true };
        }
        
        // If same category, unequip ALL items in that category
        if (isFrame && pIsFrame) return { ...p, is_equipped: false };
        if (isEntryEffect && pIsEntryEffect) return { ...p, is_equipped: false };
        if (isEntryNameBar && pIsEntryNameBar) return { ...p, is_equipped: false };
        if (isBubble && pIsBubble) return { ...p, is_equipped: false };
        
        return p;
      }));

      toast({
        title: "✨ Equipped!",
        description: `${privilege.name} is now active everywhere - Profile, Live, Party Rooms, Chat!`,
      });
    } catch (error: any) {
      console.error("[VIP] Error equipping:", error);
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
    p.category === 'frame' || p.category === 'portrait_frame'
  );
  // Entry Effects = full-screen entrance animations
  const entryEffectPrivileges = userPrivileges.filter(p => 
    p.category === 'entrance' || p.category === 'entrance_effect'
  );
  // Entry Name Bars = sliding name banner
  const entryNameBarPrivileges = userPrivileges.filter(p => 
    p.category === 'entry_name_bar' || p.category === 'entry_bar'
  );
  // Chat Bubbles
  const bubblePrivileges = userPrivileges.filter(p => 
    p.category === 'bubble'
  );
  // Vehicles
  const vehiclePrivileges = userPrivileges.filter(p => 
    p.category === 'vehicle' || p.category === 'vehicle_entrance'
  );
  // Other
  const otherPrivileges = userPrivileges.filter(p => 
    !['frame', 'portrait_frame', 'entrance', 'entrance_effect', 'entry_name_bar', 'entry_bar', 'bubble', 'vehicle', 'vehicle_entrance'].includes(p.category)
  );

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'frame': case 'portrait_frame': return 'Avatar Frame';
      case 'entrance': case 'entry_bar': case 'entrance_effect': case 'vehicle': case 'vehicle_entrance': return 'Entry Effect';
      case 'entry_name_bar': return 'Entry Name Bar';
      case 'bubble': return 'Chat Bubble';
      default: return category;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-purple-950/30 to-slate-900 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-gradient-to-b from-slate-900 via-purple-950/30 to-slate-900 overflow-hidden">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-gradient-to-r from-purple-900/95 via-pink-900/95 to-purple-900/95 backdrop-blur-xl safe-area-top border-b border-white/10">
        <div className="flex items-center justify-between px-4 py-3">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => navigate(-1)}
            className="text-white hover:bg-white/10 w-9 h-9 rounded-full"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          
          <h1 className="text-lg font-bold text-white flex items-center gap-2">
            <Crown className="w-5 h-5 text-amber-400" />
            VIP Membership
          </h1>
          
          <div className="flex items-center gap-1.5 bg-amber-500/20 px-2.5 py-1 rounded-full border border-amber-500/30">
            <Diamond3DIcon size={14} />
            <span className="text-amber-400 text-sm font-bold">{userDiamonds.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="mx-4 mt-3 bg-slate-800/50 border border-white/10 p-1 rounded-xl">
          <TabsTrigger 
            value="vip" 
            className="flex-1 rounded-lg data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-pink-500"
          >
            <Crown className="w-4 h-4 mr-2" />
            VIP Plans
          </TabsTrigger>
          <TabsTrigger 
            value="privileges" 
            className="flex-1 rounded-lg data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-pink-500"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            My Privileges
          </TabsTrigger>
        </TabsList>

        {/* VIP Plans Tab */}
        <TabsContent value="vip" className="flex-1 overflow-y-auto mt-0 px-4 py-4" style={{ paddingBottom: 'var(--content-bottom-padding)' }}>
          {/* Current VIP Status */}
          {currentVIPTier > 0 && (
            <div className="mb-4 p-4 rounded-2xl bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <VIPBadge tier={currentVIPTier} size="lg" />
                  <div>
                    <p className="text-white font-semibold">Current Status</p>
                    <p className="text-white/60 text-sm">
                      Expires: {vipExpiresAt ? new Date(vipExpiresAt).toLocaleDateString() : 'N/A'}
                    </p>
                  </div>
                </div>
                <Sparkles className="w-6 h-6 text-purple-400" />
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
                    isOwned ? 'border-green-500/50' : 'border-white/10'
                  }`}
                >
                  {/* Tier Header */}
                  <div className={`p-4 bg-gradient-to-r ${getTierGradient(tier.tier_level)}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center overflow-hidden">
                          {tier.badge_animation_url ? (
                            <UniversalAnimationPlayer
                              src={tier.badge_animation_url}
                              className="w-full h-full"
                              loop
                              autoPlay
                            />
                          ) : (
                            <TierIcon className="w-6 h-6 text-white" />
                          )}
                        </div>
                        <div>
                          <h3 className="text-white font-bold text-lg">{tier.tier_name}</h3>
                          <p className="text-white/80 text-sm">{tier.duration_days} Days</p>
                        </div>
                      </div>
                      {isOwned && (
                        <Badge className="bg-green-500 text-white border-0">
                          <Check className="w-3 h-3 mr-1" /> Active
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Privileges */}
                  <div className="p-4 bg-slate-900/90">
                    <p className="text-white/60 text-sm mb-3">{tier.description}</p>
                    
                    <div className="grid grid-cols-2 gap-2 mb-4">
                      {privileges.slice(0, 6).map((priv, i) => (
                        <div key={i} className="flex items-center gap-2 text-white/80 text-sm">
                          <priv.icon className="w-4 h-4 text-purple-400" />
                          <span>{priv.label}</span>
                        </div>
                      ))}
                    </div>

                    {/* Price & Action */}
                    <div className="flex items-center justify-between pt-3 border-t border-white/10">
                      <div className="flex items-center gap-2">
                        <Diamond3DIcon size={20} />
                        <span className="text-white font-bold text-lg">
                          {tier.price_diamonds.toLocaleString()}
                        </span>
                      </div>
                      
                      <Button
                        onClick={() => setSelectedTier(tier)}
                        disabled={isOwned || purchasing}
                        className={`px-6 ${
                          isOwned 
                            ? 'bg-green-500/20 text-green-400' 
                            : 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white'
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
              <div className="w-20 h-20 rounded-full bg-purple-500/20 flex items-center justify-center mb-4">
                <Sparkles className="w-10 h-10 text-purple-400" />
              </div>
              <h3 className="text-white font-semibold text-lg mb-2">No Privileges Yet</h3>
              <p className="text-white/60 text-sm mb-4">
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
              {/* Avatar Frames Section - ProfileDetail Style */}
              {framePrivileges.length > 0 && (
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.1 }}
                >
                  <div className="flex items-center gap-2 text-lg font-bold mb-3">
                    <span>👑</span>
                    <span className="text-white">Avatar Frames</span>
                    <span className="text-white/50 text-sm font-normal ml-auto">Tap to equip</span>
                  </div>
                  
                  {/* Clean App Icon Style Grid - like ProfileDetail */}
                  <div className="flex flex-wrap gap-3">
                    {framePrivileges.map((priv) => (
                      <motion.div
                        key={priv.id}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleEquip(priv)}
                        className="flex flex-col items-center"
                      >
                        <div className={`flex-shrink-0 w-20 h-20 rounded-2xl overflow-hidden shadow-lg cursor-pointer transition-all relative ${
                          priv.is_equipped 
                            ? 'ring-2 ring-green-500 shadow-green-500/30' 
                            : 'ring-1 ring-white/10 hover:ring-purple-500/50'
                        }`}>
                          <div className="w-full h-full bg-gradient-to-br from-purple-900/40 to-pink-900/40 flex items-center justify-center">
                            {priv.animation_url ? (
                              <UniversalFramePlayer
                                src={priv.animation_url}
                                className="w-full h-full"
                                loop={true}
                                autoPlay={true}
                              />
                            ) : (
                              <Crown className="w-8 h-8 text-amber-400" />
                            )}
                          </div>
                          
                          {/* Equipped indicator */}
                          {priv.is_equipped && (
                            <div className="absolute top-1 right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                              <Check className="w-3 h-3 text-white" />
                            </div>
                          )}
                          
                          {/* Loading state */}
                          {equipping === priv.id && (
                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            </div>
                          )}
                        </div>
                        
                        {/* Status/Timer below frame */}
                        <div className="flex items-center gap-1 mt-1 text-xs">
                          {priv.source === 'admin_assigned' ? (
                            <>
                              <Shield className="w-3 h-3 text-amber-400" />
                              <span className="text-amber-400">{priv.role_type?.replace('_', ' ') || 'Assigned'}</span>
                            </>
                          ) : priv.expires_at ? (
                            <>
                              <Clock className="w-3 h-3 text-amber-400" />
                              <span className="text-amber-400">{formatExpiration(priv.expires_at)}</span>
                            </>
                          ) : priv.source === 'level' || priv.source === 'frame' ? (
                            <span className="text-emerald-400">Lv.{priv.unlock_level || 1}+</span>
                          ) : (
                            <span className="text-purple-400">∞ Permanent</span>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Entry Effects Section - Full-screen entrance animations */}
              {entryEffectPrivileges.length > 0 && (
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                >
                  <div className="flex items-center gap-2 text-lg font-bold mb-3">
                    <span>✨</span>
                    <span className="text-white">Entry Effects</span>
                    <span className="text-white/50 text-sm font-normal ml-auto">Tap to equip</span>
                  </div>
                  
                  <div className="flex flex-wrap gap-3">
                    {entryEffectPrivileges.map((priv) => (
                      <motion.div
                        key={priv.id}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleEquip(priv)}
                        className="flex flex-col items-center"
                      >
                        <div className={`flex-shrink-0 w-20 h-20 rounded-2xl overflow-hidden shadow-lg cursor-pointer transition-all relative ${
                          priv.is_equipped 
                            ? 'ring-2 ring-green-500 shadow-green-500/30' 
                            : 'ring-1 ring-white/10 hover:ring-pink-500/50'
                        }`}>
                          <div className="w-full h-full bg-gradient-to-br from-pink-900/40 to-purple-900/40 flex items-center justify-center">
                            {priv.preview_url ? (
                              <img 
                                src={priv.preview_url} 
                                alt={priv.name}
                                className="w-full h-full object-cover"
                              />
                            ) : priv.animation_url ? (
                              <UniversalFramePlayer
                                src={priv.animation_url}
                                className="w-full h-full"
                                loop={true}
                                autoPlay={true}
                                muted={true}
                              />
                            ) : (
                              <Sparkles className="w-8 h-8 text-pink-400" />
                            )}
                          </div>
                          
                          {priv.is_equipped && (
                            <div className="absolute top-1 right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                              <Check className="w-3 h-3 text-white" />
                            </div>
                          )}
                          
                          {equipping === priv.id && (
                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            </div>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-1 mt-1 text-xs">
                          {priv.expires_at ? (
                            <>
                              <Clock className="w-3 h-3 text-amber-400" />
                              <span className="text-amber-400">{formatExpiration(priv.expires_at)}</span>
                            </>
                          ) : priv.source === 'level' ? (
                            <span className="text-emerald-400">Lv.{priv.unlock_level || 1}+</span>
                          ) : (
                            <span className="text-purple-400">∞ Permanent</span>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Entry Name Bar Section - Sliding name banner with user name + level */}
              {entryNameBarPrivileges.length > 0 && (
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.25 }}
                >
                  <div className="flex items-center gap-2 text-lg font-bold mb-3">
                    <span>🏷️</span>
                    <span className="text-white">Entry Name Bar</span>
                    <span className="text-white/50 text-sm font-normal ml-auto">Tap to equip</span>
                  </div>
                  
                  <div className="flex flex-wrap gap-3">
                    {entryNameBarPrivileges.map((priv) => (
                      <motion.div
                        key={priv.id}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleEquip(priv)}
                        className="flex flex-col items-center"
                      >
                        <div className={`flex-shrink-0 w-20 h-20 rounded-2xl overflow-hidden shadow-lg cursor-pointer transition-all relative ${
                          priv.is_equipped 
                            ? 'ring-2 ring-green-500 shadow-green-500/30' 
                            : 'ring-1 ring-white/10 hover:ring-amber-500/50'
                        }`}>
                          <div className="w-full h-full bg-gradient-to-br from-amber-900/40 to-orange-900/40 flex items-center justify-center">
                            {priv.preview_url ? (
                              <img 
                                src={priv.preview_url} 
                                alt={priv.name}
                                className="w-full h-full object-cover"
                              />
                            ) : priv.animation_url ? (
                              <UniversalFramePlayer
                                src={priv.animation_url}
                                className="w-full h-full"
                                loop={true}
                                autoPlay={true}
                                muted={true}
                              />
                            ) : (
                              <Sparkles className="w-8 h-8 text-amber-400" />
                            )}
                          </div>
                          
                          {priv.is_equipped && (
                            <div className="absolute top-1 right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                              <Check className="w-3 h-3 text-white" />
                            </div>
                          )}
                          
                          {equipping === priv.id && (
                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            </div>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-1 mt-1 text-xs">
                          {priv.expires_at ? (
                            <>
                              <Clock className="w-3 h-3 text-amber-400" />
                              <span className="text-amber-400">{formatExpiration(priv.expires_at)}</span>
                            </>
                          ) : priv.source === 'level' ? (
                            <span className="text-emerald-400">Lv.{priv.unlock_level || 1}+</span>
                          ) : (
                            <span className="text-purple-400">∞ Permanent</span>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Other Privileges Section */}
              {otherPrivileges.length > 0 && (
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  <div className="flex items-center gap-2 text-lg font-bold mb-3">
                    <span>🎁</span>
                    <span className="text-white">Other Privileges</span>
                  </div>
                  
                  <div className="flex flex-wrap gap-3">
                    {otherPrivileges.map((priv) => (
                      <motion.div
                        key={priv.id}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleEquip(priv)}
                        className="flex flex-col items-center"
                      >
                        <div className={`flex-shrink-0 w-20 h-20 rounded-2xl overflow-hidden shadow-lg cursor-pointer transition-all relative ${
                          priv.is_equipped 
                            ? 'ring-2 ring-green-500 shadow-green-500/30' 
                            : 'ring-1 ring-white/10 hover:ring-cyan-500/50'
                        }`}>
                          <div className="w-full h-full bg-gradient-to-br from-cyan-900/40 to-slate-900 flex items-center justify-center">
                            {priv.animation_url ? (
                              <UniversalFramePlayer
                                src={priv.animation_url}
                                className="w-full h-full"
                                loop={true}
                                autoPlay={true}
                                muted={true}
                              />
                            ) : priv.preview_url ? (
                              <img 
                                src={priv.preview_url} 
                                alt={priv.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Gift className="w-8 h-8 text-cyan-400" />
                            )}
                          </div>
                          
                          {priv.is_equipped && (
                            <div className="absolute top-1 right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                              <Check className="w-3 h-3 text-white" />
                            </div>
                          )}
                          
                          {equipping === priv.id && (
                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            </div>
                          )}
                        </div>
                        
                        {/* Status/Timer below item */}
                        <div className="flex items-center gap-1 mt-1 text-xs">
                          {priv.expires_at ? (
                            <>
                              <Clock className="w-3 h-3 text-amber-400" />
                              <span className="text-amber-400">{formatExpiration(priv.expires_at)}</span>
                            </>
                          ) : (
                            <span className="text-purple-400">∞ Permanent</span>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}
              
              {/* Info Note */}
              <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4 mt-4">
                <p className="text-white/70 text-sm text-center">
                  💡 Equipped items will be displayed across all sections: Profile, Live Stream, Party Rooms, and Chat
                </p>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Purchase Confirmation Modal */}
      <Dialog open={!!selectedTier} onOpenChange={() => setSelectedTier(null)}>
        <DialogContent className="bg-slate-900 border-purple-500/30 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-white text-center">Confirm VIP Purchase</DialogTitle>
          </DialogHeader>
          
          {selectedTier && (
            <div className="space-y-4">
              <div className="text-center">
                <VIPBadge tier={selectedTier.tier_level} size="lg" />
                <h3 className="text-white font-bold text-xl mt-3">{selectedTier.tier_name}</h3>
                <p className="text-white/60">{selectedTier.duration_days} Days Membership</p>
              </div>

              <div className="flex items-center justify-center gap-2 py-4 bg-amber-500/10 rounded-xl">
                <Diamond3DIcon size={24} />
                <span className="text-amber-400 font-bold text-2xl">
                  {selectedTier.price_diamonds.toLocaleString()}
                </span>
              </div>

              <div className="text-center text-sm text-white/60">
                Your balance: {userDiamonds.toLocaleString()} diamonds
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setSelectedTier(null)}
                  className="flex-1 border-white/20 text-white"
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
