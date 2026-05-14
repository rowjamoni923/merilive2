import { useState, useEffect, useCallback, memo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import TraderBadge from "@/components/common/TraderBadge";
import {
  ArrowLeft,
  Edit2,
  MapPin,
  Globe,
  Heart,
  MessageCircle,
  Users,
  ChevronRight,
  BarChart3,
  Copy,
  User as UserIcon,
  Play,
  Pause,
  Flag,
  MoreVertical,
  Ban,
  Phone,
  Diamond,
  Gift,
  ShieldX,
} from "lucide-react";
import { ProfileReelsSection } from "@/components/profile/ProfileReelsSection";
import UniversalFramePlayer from "@/components/common/UniversalFramePlayer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useCall } from "@/components/call/CallProvider";
import { CallConfirmModal } from "@/components/call/CallConfirmModal";
import { useHostCallRate } from "@/hooks/useHostCallRate";
import { useRealtimeLevel } from "@/hooks/useRealtimeLevel";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import AvatarWithFrame from "@/components/common/AvatarWithFrame";
import FramedAvatarWithPrivileges from "@/components/common/FramedAvatarWithPrivileges";
// UNIFIED GIFTING - SINGLE LINK for all sections (Live, Party, Call, Chat, Profile)
// Change @/features/shared/gifting = Change everywhere automatically
import { GiftPanel, GiftData, FlyingGiftAnimation, useFlyingGifts } from "@/features/shared/gifting";
import { sendGift } from "@/features/shared/gifting/GiftingService";
import { ReportUserDialog } from "@/components/report/ReportUserDialog";

interface ProfileData {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  bio: string | null;
  age: number | null;
  gender: string | null;
  country_name?: string | null;
  country_code: string | null;
  country_flag: string | null;
  city?: string | null;
  region?: string | null;
  is_online: boolean | null;
  is_verified: boolean | null;
  is_host: boolean | null;
  user_level: number | null;
  max_user_level?: number | null;
  host_level?: number | null;
  previous_host_level?: number | null;
  weekly_earnings?: number | null;
  coins?: number | null;
  tags: string[] | null;
  frame_id?: string | null;
  total_recharged?: number | null;
  app_uid?: string | null;
  total_consumption?: number | null;
  total_earnings?: number | null;
  pending_earnings?: number | null;
  hide_location?: boolean | null;
  is_blocked?: boolean | null;
  blocked_reason?: string | null;
  is_in_call?: boolean | null;
  host_status?: string | null;
  host_availability?: string | null;
}

interface FrameData {
  id: string;
  name: string;
  frame_url: string;
  animation_type: string | null;
  min_level: number;
}

interface LevelIconData {
  level_number: number;
  icon_url: string | null;
  animation_url: string | null;
  level_name: string | null;
}

interface PosterImage {
  id: string;
  image_url: string;
  display_order: number;
  is_primary: boolean;
}

interface GiftSent {
  id: string;
  name: string;
  icon: string;
  count: number;
  color: string;
}

interface GiftWithSender {
  id: string;
  gift_id: string;
  gift_name: string;
  gift_icon: string;
  coin_amount: number;
  sender_id: string;
  sender_name: string;
  sender_avatar: string | null;
  sender_uid: string | null;
  created_at: string;
}

interface GroupData {
  id: string;
  name: string;
  avatar_url: string | null;
  member_count: number | null;
  description: string | null;
}

const ProfileDetail = () => {
  const navigate = useNavigate();
  const { userId } = useParams<{ userId: string }>();
  const { toast } = useToast();
  const { startCall, isInCall } = useCall();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isBannedProfile, setIsBannedProfile] = useState(false);
  const [giftsSent, setGiftsSent] = useState<GiftSent[]>([]);
  const [giftsReceived, setGiftsReceived] = useState<GiftSent[]>([]);
  const [giftsWithSenders, setGiftsWithSenders] = useState<GiftWithSender[]>([]);
  const [selectedGift, setSelectedGift] = useState<GiftSent | null>(null);
  const [showGiftSendersModal, setShowGiftSendersModal] = useState(false);
  const [groups, setGroups] = useState<GroupData[]>([]);
  const [posterImages, setPosterImages] = useState<PosterImage[]>([]);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [slideshowInterval, setSlideshowInterval] = useState(5);
  const [isPaused, setIsPaused] = useState(false);
  const [userFrame, setUserFrame] = useState<FrameData | null>(null);
  const [levelIcon, setLevelIcon] = useState<LevelIconData | null>(null);
  const [userPrivileges, setUserPrivileges] = useState<{
    frames: any[];
    entryBars: any[];
    badges: any[];
  }>({ frames: [], entryBars: [], badges: [] });
  const [purchasedItems, setPurchasedItems] = useState<any[]>([]);
  const [countdownTick, setCountdownTick] = useState(0);

  const [showBlockDialog, setShowBlockDialog] = useState(false);
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [isBlocked, setIsBlocked] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [friendsCount, setFriendsCount] = useState(0);
  
  // Call modal state
  const [showCallConfirmModal, setShowCallConfirmModal] = useState(false);
  const [currentUserCoins, setCurrentUserCoins] = useState(0);
  const [showGiftPanel, setShowGiftPanel] = useState(false);
  const { gifts: flyingGifts, addGift: addFlyingGift, removeGift: removeFlyingGift } = useFlyingGifts();
  
  // Host availability toggle
  const [hostAvailability, setHostAvailability] = useState<string>('online');
  
  // Live stream state
  const [activeLiveStream, setActiveLiveStream] = useState<{ id: string; title: string; viewer_count: number } | null>(null);
  // Trader status
  const [isTrader, setIsTrader] = useState(false);
  const [traderLevel, setTraderLevel] = useState(0);
  
  // Use centralized hook for consistent rate - auto-updates when host changes rate
  const { callRate } = useHostCallRate(userId);
  const levelTargetUserId = userId || currentUser?.id || null;
  const { level: resolvedLevel, loading: resolvedLevelLoading } = useRealtimeLevel(levelTargetUserId);

  const isOwnProfile = userId === currentUser?.id || !userId;
  
  // Handle host availability toggle (online/offline)
  const handleToggleAvailability = useCallback(async () => {
    if (!currentUser?.id) return;
    const newStatus = hostAvailability === 'online' ? 'offline' : 'online';
    setHostAvailability(newStatus);
    
    const { error } = await supabase
      .from('profiles')
      .update({ host_availability: newStatus })
      .eq('id', currentUser.id);
    
    if (error) {
      setHostAvailability(hostAvailability); // revert
      toast({ title: "Failed to update status", variant: "destructive" });
    } else {
      toast({ 
        title: newStatus === 'online' ? "You are now Online" : "You are now Offline",
        description: newStatus === 'online' ? "Users can see you on the home page" : "You won't appear on the home page",
      });
    }
  }, [currentUser?.id, hostAvailability, toast]);

  // Handle call button click
  const handleCallClick = () => {
    if (!currentUser) {
      toast({
        title: "Login Required",
        description: "Please login to make a call",
        variant: "destructive",
      });
      navigate("/auth");
      return;
    }
    
    if (isInCall) {
      toast({
        title: "Already in Call",
        description: "You are already in a call",
        variant: "destructive",
      });
      return;
    }
    
    setShowCallConfirmModal(true);
  };
  
  // Handle call confirm
  const handleCallConfirm = async () => {
    if (!userId) return;
    
    setShowCallConfirmModal(false);
    const callId = await startCall(userId);
    
    if (callId) {
      toast({
        title: "Calling...",
        description: `Calling ${profile?.display_name || 'Host'}`,
      });
    }
  };

  // Define tag styles for display
  const tagStyles: Record<string, { bg: string; text: string; icon: string }> = {
    "Seeking chat friends": { bg: "bg-pink-50", text: "text-pink-600", icon: "💬" },
    "Emotional": { bg: "bg-red-50", text: "text-red-600", icon: "😊" },
    "Teacher": { bg: "bg-blue-50", text: "text-blue-600", icon: "👤" },
    "Pisces": { bg: "bg-pink-50", text: "text-pink-600", icon: "♓" },
    "Aries": { bg: "bg-red-50", text: "text-red-600", icon: "♈" },
    "Gourmet": { bg: "bg-orange-50", text: "text-orange-600", icon: "🍽️" },
    "Cricket": { bg: "bg-green-50", text: "text-green-600", icon: "🏏" },
    "Horse": { bg: "bg-amber-50", text: "text-amber-600", icon: "🐴" },
    "Music": { bg: "bg-purple-50", text: "text-purple-600", icon: "🎵" },
    "Travel": { bg: "bg-cyan-50", text: "text-cyan-600", icon: "✈️" },
    "Reading": { bg: "bg-indigo-50", text: "text-indigo-600", icon: "📚" },
    "Gaming": { bg: "bg-violet-50", text: "text-violet-600", icon: "🎮" },
    "Fitness": { bg: "bg-lime-50", text: "text-lime-600", icon: "💪" },
    "Movies": { bg: "bg-rose-50", text: "text-rose-600", icon: "🎬" },
    "Photography": { bg: "bg-teal-50", text: "text-teal-600", icon: "📷" },
    "Art": { bg: "bg-fuchsia-50", text: "text-fuchsia-600", icon: "🎨" },
    "Cooking": { bg: "bg-yellow-50", text: "text-yellow-600", icon: "👨‍🍳" },
    "Merchant": { bg: "bg-emerald-50", text: "text-emerald-600", icon: "🛒" },
    "Film lover": { bg: "bg-rose-50", text: "text-rose-600", icon: "🎬" },
    "Running": { bg: "bg-green-50", text: "text-green-600", icon: "🏃" },
    "INTJ": { bg: "bg-slate-50", text: "text-slate-600", icon: "🧠" },
  };

  const fetchData = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoading(true);

    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user ?? null;
    setCurrentUser(user);

    const targetId = userId || user?.id;
    if (!targetId) {
      setLoading(false);
      return;
    }
    
    // PARALLEL FETCH - All independent queries at once for speed
    const [
      currentUserProfileResult,
      intervalSettingResult,
      profileDataResult,
      postersResult,
      giftTransactionsResult,
      receivedTransactionsResult,
      groupMembershipsResult,
      followersResult,
      followingResult,
      liveStreamResult,
      traderResult,
    ] = await Promise.all([
      // Current user's diamond balance
      user?.id ? supabase.from("profiles").select("coins").eq("id", user.id).single() : { data: null },
      // Slideshow interval setting
      supabase.from("app_settings").select("setting_value").eq("setting_key", "profile_slideshow_interval").maybeSingle(),
      // Profile data
      supabase.from("profiles_public").select("*").eq("id", targetId).maybeSingle(),
      // Poster images
      supabase.from("poster_images").select("*").eq("user_id", targetId).order("display_order", { ascending: true }),
      // Gifts sent
      supabase.from("gift_transactions").select("gift_id, gifts(name, icon_url)").eq("sender_id", targetId),
      // Gifts received
      supabase.from("gift_transactions").select("id, gift_id, coin_amount, sender_id, created_at, gifts(name, icon_url)").eq("receiver_id", targetId).order("created_at", { ascending: false }),
      // Groups
      supabase.from("group_members").select("group_id, groups(id, name, avatar_url, member_count, description)").eq("user_id", targetId),
      // Followers count
      supabase.from("followers").select("*", { count: "exact", head: true }).eq("following_id", targetId),
      // Following count
      supabase.from("followers").select("*", { count: "exact", head: true }).eq("follower_id", targetId),
      // Active live stream
      supabase.from("live_streams").select("id, title, viewer_count").eq("host_id", targetId).eq("is_active", true).maybeSingle(),
      // Trader/Helper status
      supabase.from("topup_helpers").select("id, trader_level, payroll_enabled").eq("user_id", targetId).eq("is_active", true).eq("is_verified", true).maybeSingle(),
    ]);

    // Set current user coins
    setCurrentUserCoins(currentUserProfileResult?.data?.coins || 0);

    // Set slideshow interval
    if (intervalSettingResult?.data?.setting_value) {
      setSlideshowInterval(parseInt(intervalSettingResult.data.setting_value as string) || 5);
    }

    // Set profile - fallback to private profiles when public view is stale/missing
    let profileData = profileDataResult?.data as ProfileData | null;

    if (!profileData && targetId) {
      // Fallback: fetch from profiles table for ANY user (own or other)
      const { data: fallbackProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', targetId)
        .maybeSingle();
      
      if (fallbackProfile) {
        // Check if banned
        if (fallbackProfile.is_blocked) {
          setIsBannedProfile(true);
          setLoading(false);
          return;
        }
        profileData = fallbackProfile as ProfileData | null;
      }
    }

    setProfile(profileData as ProfileData);
    
    // Set host availability
    if (profileData?.host_availability) {
      setHostAvailability(profileData.host_availability);
    }
    // Set poster images
    setPosterImages(postersResult?.data || []);

    // Set followers/following counts
    setFollowersCount(followersResult?.count || 0);
    setFollowingCount(followingResult?.count || 0);
    
    // Set active live stream
    setActiveLiveStream(liveStreamResult?.data as any || null);

    // Set trader status
    if (traderResult?.data) {
      setIsTrader(true);
      setTraderLevel(traderResult.data.trader_level || 1);
    } else {
      setIsTrader(false);
      setTraderLevel(0);
    }

    // Process gifts sent
    const giftCounts: Record<string, { name: string; icon: string; count: number }> = {};
    giftTransactionsResult?.data?.forEach((t: any) => {
      const giftId = t.gift_id;
      if (!giftCounts[giftId]) {
        giftCounts[giftId] = { name: t.gifts?.name || "Gift", icon: t.gifts?.icon_url || "🎁", count: 0 };
      }
      giftCounts[giftId].count++;
    });
    setGiftsSent(Object.entries(giftCounts).map(([id, data]) => ({
      id, ...data, color: ["bg-pink-50", "bg-purple-50", "bg-cyan-50"][Math.floor(Math.random() * 3)]
    })).slice(0, 5));

    // Process gifts received
    const receivedCounts: Record<string, { name: string; icon: string; count: number; totalCoins: number }> = {};
    const giftSendersList: GiftWithSender[] = [];

    // Fetch sender profiles via profiles_public (RLS-safe for non-owner reads)
    const senderIds = Array.from(new Set((receivedTransactionsResult?.data || []).map((t: any) => t.sender_id).filter(Boolean)));
    let senderMap: Record<string, any> = {};
    if (senderIds.length > 0) {
      const { data: senders } = await supabase
        .from('profiles_public')
        .select('id, display_name, username, avatar_url, app_uid')
        .in('id', senderIds);
      (senders || []).forEach((s: any) => { senderMap[s.id] = s; });
    }

    receivedTransactionsResult?.data?.forEach((t: any) => {
      const giftId = t.gift_id;
      if (!receivedCounts[giftId]) {
        receivedCounts[giftId] = { name: t.gifts?.name || "Gift", icon: t.gifts?.icon_url || "🎁", count: 0, totalCoins: 0 };
      }
      receivedCounts[giftId].count++;
      receivedCounts[giftId].totalCoins += t.coin_amount || 0;
      const sender = senderMap[t.sender_id];
      giftSendersList.push({
        id: t.id, gift_id: t.gift_id, gift_name: t.gifts?.name || "Gift", gift_icon: t.gifts?.icon_url || "🎁",
        coin_amount: t.coin_amount || 0, sender_id: t.sender_id,
        sender_name: sender?.display_name || sender?.username || "Anonymous",
        sender_avatar: sender?.avatar_url || null, sender_uid: sender?.app_uid || null, created_at: t.created_at
      });
    });
    setGiftsWithSenders(giftSendersList);
    setGiftsReceived(Object.entries(receivedCounts).map(([id, data]) => ({
      id, name: data.name, icon: data.icon, count: data.count, color: ["bg-amber-50", "bg-rose-50", "bg-emerald-50"][Math.floor(Math.random() * 3)]
    })).slice(0, 10));

    // Set groups
    setGroups((groupMembershipsResult?.data?.map((m: any) => m.groups).filter(Boolean) || []).slice(0, 5));

    // SECOND PARALLEL BATCH - Dependent on profile data
    if (profileData) {
      const userLevel = Math.max(profileData.user_level || 1, profileData.max_user_level || 1);
      const hostLevel = profileData.host_level || 0;
      const isHostUser = profileData.is_host && (profileData.gender === 'female' || profileData.gender === 'Female');
      const fallbackLevel = isHostUser ? hostLevel : userLevel;
      const effectiveLevel = resolvedLevelLoading ? fallbackLevel : resolvedLevel;
      const targetType = isHostUser ? 'host' : 'user';

      const [frameData, levelIconData, framesData, entryBarsData, badgesData, blockData, followData, purchasedRes] = await Promise.all([
        // User's frame based on level
        supabase.from("avatar_frames" as any).select("*").lte("min_level", effectiveLevel).eq("is_active", true).order("min_level", { ascending: false }).limit(1).maybeSingle(),
        // Level icon from user_level_tiers
        supabase.from("user_level_tiers").select("level_number, icon_url, animation_url, level_name").eq("level_number", effectiveLevel).eq("tier_type", targetType).eq("is_active", true).maybeSingle(),
        // Level frames
        supabase.from("avatar_frames").select("id, name, frame_url, frame_type, min_level, is_premium, category, target_type").eq("is_active", true).lte("min_level", effectiveLevel).in("target_type", ['both', targetType]).or('frame_url.like.%.svga,frame_url.like.%.json,frame_url.like.%supabase.co/storage%').order("min_level", { ascending: false }).limit(1),
        // Entry bars
        supabase.from("level_privileges").select("id, name, animation_url, preview_url, unlock_level").eq("privilege_type", "entry_bar").eq("is_active", true).lte("unlock_level", effectiveLevel).order("unlock_level", { ascending: false }).limit(1),
        // Badges
        supabase.from("level_privileges").select("id, name, icon_name, icon_bg_color, icon_color, unlock_level").eq("privilege_type", "badge").eq("is_active", true).lte("unlock_level", effectiveLevel).order("unlock_level", { ascending: false }).limit(5),
        // Check if blocked
        user && userId && user.id !== userId ? supabase.from("user_blocks").select("id").eq("blocker_id", user.id).eq("blocked_id", userId).maybeSingle() : { data: null },
        // Check if following
        user && userId && user.id !== userId ? supabase.from("followers").select("id").eq("follower_id", user.id).eq("following_id", userId).maybeSingle() : { data: null },
        // Purchased items (frames + entry animations) from shop — no FK so fetch separately
        supabase.from("user_purchases").select("id, item_type, expires_at, is_active, is_equipped, item_id").eq("user_id", userId).eq("is_active", true).gte("expires_at", new Date().toISOString()),
      ]);

      if (frameData?.data) setUserFrame(frameData.data as unknown as FrameData);
      if (levelIconData?.data) setLevelIcon(levelIconData.data as unknown as LevelIconData);
      setUserPrivileges({ frames: framesData?.data || [], entryBars: entryBarsData?.data || [], badges: badgesData?.data || [] });
      setIsBlocked(!!blockData?.data);
      setIsFollowing(!!followData?.data);

      // Fetch shop_items for purchased items (no FK relationship)
      const purchases = purchasedRes?.data || [];
      if (purchases.length > 0) {
        const itemIds = purchases.map((p: any) => p.item_id).filter(Boolean);
        const { data: shopItems } = await supabase.from("shop_items").select("id, name, preview_url, animation_url, svga_url, image_url, animation_file_url, file_type").in("id", itemIds);
        const shopMap = new Map((shopItems || []).map((s: any) => [s.id, s]));
        const merged = purchases.map((p: any) => ({ ...p, shop_items: shopMap.get(p.item_id) || null }));
        setPurchasedItems(merged);
      } else {
        setPurchasedItems([]);
      }
    }

    setLoading(false);
  }, [userId, resolvedLevel, resolvedLevelLoading]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Countdown timer for purchased items
  useEffect(() => {
    if (purchasedItems.length === 0) return;
    const interval = setInterval(() => setCountdownTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, [purchasedItems.length]);

  // Real-time subscription for profile level updates
  useEffect(() => {
    const targetId = userId || currentUser?.id;
    if (!targetId) return;

    const channel = supabase
      .channel(`profile-detail-realtime-${targetId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${targetId}`,
        },
        (payload) => {
          console.log("[ProfileDetail] Real-time update:", payload.new);
          // Update profile with new data including level
          setProfile((prev) => prev ? { ...prev, ...payload.new } as ProfileData : null);
          void fetchData(true);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "gift_transactions",
        },
        (payload) => {
          const tx = payload.new as any;
          // Refetch if this profile is sender or receiver
          if (tx.sender_id === targetId || tx.receiver_id === targetId) {
            fetchData();
          }
        }
      )
      // ⚡ LIVE STATUS: Instant update when stream ends or starts for this user
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "live_streams",
          filter: `host_id=eq.${targetId}`,
        },
        (payload) => {
          const stream = payload.new as any;
          if (payload.eventType === "INSERT" && stream?.is_active) {
            setActiveLiveStream({ id: stream.id, title: stream.title || "", viewer_count: stream.viewer_count || 0 });
          } else if (payload.eventType === "UPDATE") {
            if (stream?.is_active) {
              setActiveLiveStream({ id: stream.id, title: stream.title || "", viewer_count: stream.viewer_count || 0 });
            } else {
              setActiveLiveStream(null);
            }
          } else if (payload.eventType === "DELETE") {
            setActiveLiveStream(null);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, currentUser?.id, fetchData]);

  // Auto slideshow effect
  useEffect(() => {
    if (posterImages.length <= 1 || isPaused) return;
    
    const timer = setInterval(() => {
      setCurrentSlideIndex((prev) => (prev + 1) % posterImages.length);
    }, slideshowInterval * 1000);

    return () => clearInterval(timer);
  }, [posterImages.length, slideshowInterval, isPaused]);

  const copyId = () => {
    if (profile?.id) {
      navigator.clipboard.writeText(profile.id.slice(0, 8));
      toast({ title: "ID copied!" });
    }
  };

  const handleBlock = async () => {
    if (!currentUser || !userId) return;
    try {
      if (isBlocked) {
        await supabase
          .from("user_blocks")
          .delete()
          .eq("blocker_id", currentUser.id)
          .eq("blocked_id", userId);
        setIsBlocked(false);
        toast({ title: "Unblocked", description: "User has been unblocked successfully." });
      } else {
        await supabase.from("user_blocks").insert({
          blocker_id: currentUser.id,
          blocked_id: userId,
        });
        setIsBlocked(true);
        toast({ title: "Blocked", description: "User has been blocked successfully." });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
    setShowBlockDialog(false);
  };

  const handleReport = () => {
    setShowReportDialog(true);
  };

  const handleFollow = async () => {
    if (!currentUser || !userId) return;
    try {
      if (isFollowing) {
        await supabase
          .from("followers")
          .delete()
          .eq("follower_id", currentUser.id)
          .eq("following_id", userId);
        setIsFollowing(false);
        setFollowersCount((prev) => prev - 1);
      } else {
        await supabase.from("followers").insert({
          follower_id: currentUser.id,
          following_id: userId,
        });
        setIsFollowing(true);
        setFollowersCount((prev) => prev + 1);
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  // Get current cover image (from poster images or default)
  const getCurrentCoverImage = useCallback(() => {
    if (posterImages.length > 0) {
      return posterImages[currentSlideIndex]?.image_url;
    }
    return profile?.cover_url || profile?.avatar_url || "https://images.unsplash.com/photo-1614850523459-c2f4c699c52e?w=800";
  }, [posterImages, currentSlideIndex, profile]);

  if (loading && !profile) {
    return (
      <div className="mobile-page flex flex-col bg-background" />
    );
  }

  if (isBannedProfile) {
    return (
      <div className="fixed inset-0 flex items-center justify-center p-6"
        style={{ background: 'linear-gradient(180deg, #0c0618 0%, #1a0a2e 50%, #0d0719 100%)' }}>
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="max-w-sm w-full text-center space-y-5"
        >
 <button onClick={() => navigate(-1)} className="absolute top-4 left-4 p-2 rounded-full bg-white/10 text-slate-900">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring" }}
            className="mx-auto w-24 h-24 rounded-full bg-gradient-to-br from-red-500/30 to-red-900/30 border-2 border-red-500/50 flex items-center justify-center"
          >
            <ShieldX className="w-12 h-12 text-red-600" />
          </motion.div>
          <motion.h1 initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }}
 className="text-xl font-bold text-slate-900">
            Account Permanently Banned
          </motion.h1>
          <motion.p initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.4 }}
 className="text-slate-700/80 text-sm leading-relaxed">
            This account has been permanently suspended for violating our Community Guidelines. 
            All associated data, host privileges, and agency memberships have been revoked.
          </motion.p>
          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.5 }}>
            <Button variant="outline" onClick={() => navigate(-1)}
 className="bg-white/5 border-slate-200/10 text-white hover:bg-white/10">
              <ArrowLeft className="w-4 h-4 mr-2" /> Go Back
            </Button>
          </motion.div>
        </motion.div>
      </div>
    );
  }

  if (!profile) {
    const handleLogoutAndReregister = async () => {
      localStorage.setItem('meri_manual_logout', 'true');
      localStorage.removeItem('meri_device_id');
      localStorage.removeItem('meri_device_account');
      localStorage.removeItem('meri_last_user');
      localStorage.setItem('meri_manual_logout', 'true');
      await supabase.auth.signOut({ scope: 'local' });
      navigate('/auth');
    };

    return (
      <div className="mobile-page flex flex-col items-center justify-center p-6 bg-gradient-to-b from-purple-100 to-background">
        <UserIcon className="w-16 h-16 text-muted-foreground mb-4" />
        <h1 className="text-xl font-bold mb-2">Profile not found</h1>
        <p className="text-muted-foreground text-sm mb-4 text-center">
          {isOwnProfile 
            ? "Your profile data was not found. Please create a new account."
            : "This user's profile could not be found. They may have deactivated their account."}
        </p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => navigate(-1)}>Go Back</Button>
          {isOwnProfile && (
            <Button 
 className="bg-gradient-to-r from-purple-500 to-pink-500 text-white"
              onClick={handleLogoutAndReregister}
            >
              Create New Account
            </Button>
          )}
        </div>
      </div>
    );
  }

  // CRITICAL: Female hosts use host_level (resets weekly), others use user_level
  const isFemaleHost = profile.is_host && (profile.gender === 'female' || profile.gender === 'Female');
  const fallbackLevel = isFemaleHost 
    ? (profile.host_level ?? 0)
    : Math.max(profile.user_level ?? 1, profile.max_user_level ?? 1);
  const level = resolvedLevelLoading ? fallbackLevel : resolvedLevel;
  const isVideo = posterImages[currentSlideIndex]?.image_url?.match(/\.(mp4|webm|mov)$/i);

  return (
    <div 
      className="fixed inset-0 profile-home-shell"
      style={{ 
        overflowY: 'scroll',
        overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch',
        overscrollBehavior: 'contain',
      }}
    >
      {/* Scrollable Content Container */}
      <div style={{ paddingBottom: 'calc(120px + env(safe-area-inset-bottom, 20px))' }}>
      {/* Cover Image / Slideshow */}
      <div className="relative h-[45vh] min-h-[300px] max-h-[420px] overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentSlideIndex}
            initial={{ opacity: 0, scale: 1.05 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7 }}
            className="absolute inset-0"
          >
            {isVideo ? (
              <video
                src={posterImages[currentSlideIndex]?.image_url}
                className="w-full h-full object-cover"
                autoPlay
                muted
                loop
                playsInline
              />
            ) : (
              <img
                src={getCurrentCoverImage()}
                alt="Cover"
                className="w-full h-full object-cover"
              />
            )}
          </motion.div>
        </AnimatePresence>
        {/* Premium gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/10 to-[#f7f8fa]" /> {/* dark-ok: intentional photo→footer overlay, no text inside */}
        {/* Subtle vignette */}
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, transparent 50%, rgba(15,23,42,0.22) 100%)' }} />

        {/* Slideshow Indicators */}
        {posterImages.length > 1 && (
          <div className="absolute bottom-28 left-1/2 -translate-x-1/2 flex items-center gap-2">
            {posterImages.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentSlideIndex(index)}
                className={`rounded-full transition-all ${
                  index === currentSlideIndex 
                    ? "w-6 h-2 bg-gradient-to-r from-fuchsia-400 to-purple-400" 
                    : "w-2 h-2 bg-white/30 hover:bg-white"
                }`}
              />
            ))}
              <button
              onClick={() => setIsPaused(!isPaused)}
                className="ml-2 w-7 h-7 rounded-full bg-white backdrop-blur-xl border border-slate-200 flex items-center justify-center shadow-sm"
            >
              {isPaused ? (
                <Play className="w-3 h-3 text-slate-700" />
              ) : (
                <Pause className="w-3 h-3 text-slate-700" />
              )}
            </button>
          </div>
        )}

        {/* Header Buttons */}
        <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center safe-area-top">
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => navigate(-1)}
 className="w-10 h-10 rounded-full bg-slate-100/35 backdrop-blur-xl border border-slate-200/10 flex items-center justify-center"
          >
 <ArrowLeft className="w-5 h-5 text-slate-900" />
          </motion.button>

          <div className="flex items-center gap-2">
            {isOwnProfile ? (
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => navigate("/edit-profile")}
 className="w-10 h-10 rounded-full bg-slate-100/35 backdrop-blur-xl border border-slate-200/10 flex items-center justify-center"
              >
 <Edit2 className="w-5 h-5 text-slate-900" />
              </motion.button>
            ) : (
              <>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowReportDialog(true)}
 className="w-10 h-10 rounded-full bg-slate-100/35 backdrop-blur-xl border border-slate-200/10 flex items-center justify-center"
                >
 <Flag className="w-5 h-5 text-slate-900" />
                </motion.button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <motion.button
                      whileTap={{ scale: 0.95 }}
 className="w-10 h-10 rounded-full bg-slate-100/35 backdrop-blur-xl border border-slate-200/10 flex items-center justify-center"
                    >
 <MoreVertical className="w-5 h-5 text-slate-900" />
                    </motion.button>
                  </DropdownMenuTrigger>
 <DropdownMenuContent align="end" className="w-48 bg-[#1a1a2e] border-slate-200/10">
                    <DropdownMenuItem 
                      onClick={() => setShowBlockDialog(true)}
                      className="text-red-600 focus:text-red-700"
                    >
                      <Ban className="w-4 h-4 mr-2" />
                      {isBlocked ? "Unblock" : "Block"}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
          
          {/* Live Stream Card - Below header buttons */}
          {!isOwnProfile && activeLiveStream && (
            <motion.button
              initial={{ opacity: 0, y: -10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate(`/live/${activeLiveStream.id}`)}
              className="absolute top-16 right-4 safe-area-top flex items-center gap-2 px-3 py-2 rounded-xl backdrop-blur-xl"
              style={{
                background: 'linear-gradient(135deg, rgba(239,68,68,0.85), rgba(220,38,38,0.9))',
                border: '1px solid rgba(255,255,255,0.2)',
                boxShadow: '0 8px 25px rgba(239,68,68,0.4)',
              }}
            >
              <motion.div
                className="w-2 h-2 bg-white rounded-full"
                animate={{ scale: [1, 1.4, 1], opacity: [1, 0.5, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              />
 <span className="text-slate-900 text-xs font-bold">LIVE</span>
 <span className="text-slate-700/70 text-[10px]">👁 {activeLiveStream.viewer_count || 0}</span>
 <ChevronRight className="w-3.5 h-3.5 text-slate-700/70" />
            </motion.button>
          )}
        </div>
      </div>

      {/* Profile Card - Ultra Premium Glass */}
      <motion.div
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="relative -mt-24 mx-3 rounded-3xl overflow-hidden"
      >
        <div className="absolute inset-0 profile-home-card rounded-3xl" />
        {/* Subtle inner glow */}
        <div className="absolute inset-0 rounded-3xl" style={{ background: 'radial-gradient(ellipse at top center, rgba(236,72,153,0.08) 0%, transparent 60%)' }} />
        
        <div className="relative p-4 sm:p-5">
          {/* Banned Account Banner */}
          {profile.is_blocked && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center gap-3 backdrop-blur-sm">
              <div className="w-10 h-10 bg-red-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                <Ban className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-red-700 font-semibold text-sm">This account has been banned</p>
                <p className="text-red-600/70 text-xs mt-0.5">
                  {(profile as any).blocked_reason || 'This account was suspended for violating community guidelines.'}
                </p>
              </div>
            </div>
          )}
          
          {/* User Info Header */}
          <div className="flex items-start gap-4">
            {/* Avatar with Level-Based Frame */}
            <div className="relative flex-shrink-0 w-24 h-24">
              <FramedAvatarWithPrivileges
                userId={profile.id}
                src={profile.avatar_url}
                name={profile.display_name || "U"}
                level={level}
                size="lg"
                showFrame={true}
                showAnimation={true}
                showGlow={level >= 5}
              />
            </div>

            <div className="flex-1 min-w-0">
              {/* Name */}
              <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-lg font-bold text-slate-950">
                  {profile.display_name || profile.username || "User"}
                </h1>
                {(profile.is_verified || (profile as any).is_face_verified) && (
                  <div className="w-5 h-5 bg-gradient-to-r from-blue-400 to-cyan-400 rounded-full flex items-center justify-center shadow-lg shadow-blue-500/30">
 <svg className="w-3 h-3 text-slate-900" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
              </div>
              
              {/* Level Badge, Status & ID */}
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
 <Badge className="bg-gradient-to-r from-fuchsia-600 to-purple-600 text-slate-900 border-0 text-[10px] shadow-lg shadow-fuchsia-500/20 px-2.5 py-0.5 font-bold flex items-center gap-1">
                  {levelIcon?.icon_url && (levelIcon.icon_url.startsWith('http') || levelIcon.icon_url.startsWith('/')) ? (
                    <img src={levelIcon.icon_url} alt={`Lv${level}`} className="w-3.5 h-3.5 object-contain rounded-sm" />
                  ) : null}
                  Lv{level}
                </Badge>
                {/* Previous level is now merged into main level display via useRealtimeLevel */}
                
                {/* Status: Live > Busy (in call) > Online */}
                {activeLiveStream ? (
 <Badge className="bg-gradient-to-r from-red-500 to-rose-500 text-white border-0 text-[10px] shadow-lg shadow-red-500/30 px-2 py-0.5 animate-pulse">
                    <div className="w-1.5 h-1.5 bg-white rounded-full mr-1" />
                    🔴 Live
                  </Badge>
                ) : profile.is_in_call ? (
 <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-slate-900 border-0 text-[10px] shadow-lg shadow-amber-500/20 px-2 py-0.5">
                    <Phone className="w-3 h-3 mr-1" />
                    Busy
                  </Badge>
                ) : profile.is_online ? (
 <Badge className="bg-gradient-to-r from-emerald-500 to-green-500 text-white border-0 text-[10px] shadow-lg shadow-emerald-500/20 px-2 py-0.5">
                    <div className="w-1.5 h-1.5 bg-white rounded-full mr-1 animate-pulse" />
                    Online
                  </Badge>
                ) : null}

                {/* ID Badge - inline with level & status */}
                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white border border-slate-200 backdrop-blur-sm">
 <span className="w-3.5 h-3.5 rounded-full bg-gradient-to-r from-fuchsia-500 to-purple-500 flex items-center justify-center text-slate-900 text-[6px] font-bold">ID</span>
                  <span className="text-slate-700 font-mono text-[10px] tracking-wider">{profile.app_uid || "00000000"}</span>
                </div>

                {profile.age && profile.gender && (
                  <Badge className={`text-[10px] shadow-lg px-2 py-0.5 border-0 ${
                    profile.gender === 'female' 
 ?'bg-gradient-to-r from-pink-500 to-rose-500 text-slate-900 shadow-pink-500/20' 
 :'bg-gradient-to-r from-blue-500 to-cyan-500 text-slate-900 shadow-blue-500/20'
                  }`}>
                    {profile.gender === 'female' ? '♀️' : '♂️'} {profile.age}
                  </Badge>
                )}

                {/* Trader Badge - Premium */}
                {isTrader && (
                  <TraderBadge level={traderLevel} size="md" />
                )}
              </div>

              {/* Bio - moved below badges, centered */}
              {profile.bio && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="mt-3 px-3 py-2 rounded-xl relative overflow-hidden mx-auto bg-slate-50 border border-slate-100"
                >
                  <p className="text-sm text-slate-600 leading-relaxed line-clamp-2 font-medium text-center">
                    ✨ {profile.bio}
                  </p>
                </motion.div>
              )}
              
              {/* Follow Button */}
              {!isOwnProfile && (
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={handleFollow}
                  className={`mt-2.5 px-5 py-1.5 rounded-full text-xs font-bold transition-all ${
                    isFollowing 
                      ? "bg-white text-slate-700 border border-slate-200 backdrop-blur-sm" 
 :"bg-gradient-to-r from-fuchsia-500 via-purple-500 to-pink-500 text-slate-900 shadow-lg shadow-fuchsia-500/30"
                  }`}
                >
                  {isFollowing ? "✓ Following" : "💕 Follow"}
                </motion.button>
              )}
            </div>
          </div>
          {/* Privileges & Animations - Premium Glass Card */}
          {(userPrivileges.frames.length > 0 || userPrivileges.entryBars.length > 0 || purchasedItems.length > 0) && (
            <motion.div
              className="mt-4 p-4 rounded-2xl relative overflow-hidden profile-home-section"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              {/* Shimmer effect */}
              <motion.div
                className="absolute inset-0"
                style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.03) 50%, transparent 100%)' }}
                animate={{ x: ['-100%', '200%'] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
              />
              
              <div className="relative">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-base">✨</span>
                  <span className="text-slate-950 font-bold text-sm">Privileges & Animations</span>
 <Badge className="bg-gradient-to-r from-fuchsia-600 to-purple-600 text-slate-900 border-0 text-[9px] px-2 py-0.5 font-bold ml-auto">
                    Lv{level}
                  </Badge>
                </div>

                <div className="flex flex-wrap gap-2.5">
                  {/* Level-based Avatar Frames */}
                  {userPrivileges.frames
                    .filter((frame: any) => {
                      const url = frame.frame_url?.toLowerCase() || '';
                      return url.endsWith('.svga') || url.endsWith('.json') || url.includes('supabase.co/storage');
                    })
                    .map((frame: any) => (
                    <motion.div
                      key={frame.id}
                      whileHover={{ scale: 1.08 }}
                      whileTap={{ scale: 0.95 }}
                      className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-900/50 to-pink-900/50 flex items-center justify-center overflow-hidden ring-1 ring-white/15 shadow-lg"
                    >
                      {frame.frame_url ? (
                        frame.frame_url.endsWith('.svga') ? (
                          <UniversalFramePlayer src={frame.frame_url} type="svga" className="w-full h-full" loop={true} autoPlay={true} />
                        ) : frame.frame_url.endsWith('.json') ? (
                          <UniversalFramePlayer src={frame.frame_url} type="lottie" className="w-full h-full" loop={true} autoPlay={true} />
                        ) : (
                          <img src={frame.frame_url} alt="" className="w-full h-full object-contain" />
                        )
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-pink-400" />
                      )}
                    </motion.div>
                  ))}

                  {/* Level-based Entry Bars */}
                  {userPrivileges.entryBars.map((bar: any) => (
                    <motion.div
                      key={bar.id}
                      whileHover={{ scale: 1.08 }}
                      whileTap={{ scale: 0.95 }}
                      className="w-14 h-14 rounded-xl overflow-hidden ring-1 ring-white/15 shadow-lg"
                    >
                      {bar.preview_url ? (
                        <img src={bar.preview_url} alt="" className="w-full h-full object-cover" />
                      ) : bar.animation_url ? (
                        bar.animation_url.endsWith('.svga') ? (
                          <UniversalFramePlayer src={bar.animation_url} type="svga" className="w-full h-full" loop={true} autoPlay={true} />
                        ) : bar.animation_url.endsWith('.json') ? (
                          <UniversalFramePlayer src={bar.animation_url} type="lottie" className="w-full h-full" loop={true} autoPlay={true} />
                        ) : (
                          <img src={bar.animation_url} alt="" className="w-full h-full object-cover" />
                        )
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-amber-500/30 to-orange-500/30 flex items-center justify-center">
                          <Play className="w-4 h-4 text-amber-600/60" />
                        </div>
                      )}
                    </motion.div>
                  ))}

                  {/* Purchased Items (Frames & Entry Animations from Shop) with Countdown */}
                  {purchasedItems.map((item: any) => {
                    const shopItem = item.shop_items;
                    if (!shopItem) return null;
                    const assetUrl = shopItem.preview_url || shopItem.svga_url || shopItem.animation_url || shopItem.animation_file_url || shopItem.image_url;
                    const isSvga = assetUrl?.toLowerCase()?.endsWith('.svga');
                    const isLottie = assetUrl?.toLowerCase()?.endsWith('.json');

                    // Calculate remaining time
                    const expiresAt = new Date(item.expires_at).getTime();
                    const now = Date.now();
                    const remaining = Math.max(0, expiresAt - now);
                    const days = Math.floor(remaining / 86400000);
                    const hours = Math.floor((remaining % 86400000) / 3600000);
                    const mins = Math.floor((remaining % 3600000) / 60000);
                    const timeStr = days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

                    if (remaining <= 0) return null;

                    return (
                      <motion.div
                        key={item.id}
                        whileHover={{ scale: 1.08 }}
                        whileTap={{ scale: 0.95 }}
                        className="flex flex-col items-center gap-1"
                      >
                        <div className="w-14 h-14 rounded-xl overflow-hidden ring-2 ring-amber-500/40 shadow-lg relative"
                          style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(217,70,239,0.15))' }}
                        >
                          {assetUrl ? (
                            isSvga ? (
                              <UniversalFramePlayer src={assetUrl} type="svga" className="w-full h-full" loop={true} autoPlay={true} />
                            ) : isLottie ? (
                              <UniversalFramePlayer src={assetUrl} type="lottie" className="w-full h-full" loop={true} autoPlay={true} />
                            ) : (
                              <img src={assetUrl} alt="" className="w-full h-full object-contain" />
                            )
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-amber-500/30 to-purple-500/30 flex items-center justify-center">
                              <Play className="w-4 h-4 text-amber-600/60" />
                            </div>
                          )}
                          {/* Type badge */}
                          {item.item_type === 'entrance' && (
                            <div className="absolute top-0.5 right-0.5 bg-amber-500/90 rounded px-1" style={{ fontSize: '6px', lineHeight: '10px' }}>
                              <span className="text-black font-bold">FX</span>
                            </div>
                          )}
                        </div>
                        {/* Countdown timer */}
                        <span className="text-[8px] text-amber-600/80 font-medium whitespace-nowrap">
                          ⏳ {timeStr}
                        </span>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}

          {/* Location & Language Section - Country flag ALWAYS visible (unless NONE);
              only city/region is hidden when profile owner enabled hide_location */}
          {profile.country_code !== 'NONE' && (
          <div className="mt-4 p-3.5 rounded-2xl space-y-2.5 profile-home-section">
            {/* Location Row */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="w-7 h-7 rounded-full bg-purple-500/15 flex items-center justify-center flex-shrink-0">
                <MapPin className="w-3.5 h-3.5 text-purple-600" />
              </div>
              <Badge className="gap-1 bg-emerald-50 text-emerald-700 border border-emerald-100 px-2.5 py-1 text-[10px]">
                <span>{profile.country_flag || "🌍"}</span>
                {profile.country_name || ""}
              </Badge>
              {!profile.hide_location && (profile.city || profile.region) && (
                <Badge className="gap-1 bg-purple-50 text-purple-700 border border-purple-100 px-2.5 py-1 text-[10px]">
                  <MapPin className="w-3 h-3" />
                  {profile.city || profile.region}
                </Badge>
              )}
            </div>

            {/* Language Row */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="w-7 h-7 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center flex-shrink-0">
                <Globe className="w-3.5 h-3.5 text-blue-600" />
              </div>
              {profile.country_name && (
              <Badge className="gap-1 bg-amber-50 text-amber-700 border border-amber-100 px-2.5 py-1 text-[10px]">
                {profile.country_flag || "🌍"} {profile.country_name}
              </Badge>
              )}
              <Badge className="gap-1 bg-pink-50 text-pink-600 border border-pink-100 px-2.5 py-1 text-[10px]">
                <Heart className="w-3 h-3 fill-current" />
                Seeking chat friends
              </Badge>
            </div>

            {/* Interest Tags from Database */}
            {profile.tags && profile.tags.length > 0 && (
 <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-200/5">
                {profile.tags.map((tag, index) => {
                    const style = tagStyles[tag] || { bg: "bg-slate-50", text: "text-slate-700", icon: "✨" };
                  return (
                    <Badge key={index} className="gap-1 bg-slate-50 text-slate-700 border border-slate-200 px-2 py-0.5 text-xs">
                      <span className="text-xs">{style.icon}</span>
                      {tag}
                    </Badge>
                  );
                })}
              </div>
            )}
          </div>
          )}

          {/* Stats Row - Only visible to profile owner */}
          {isOwnProfile && (
            <>
              <div className="mt-4 grid grid-cols-3 gap-px p-1 rounded-2xl profile-home-section">
                <motion.button 
                  whileTap={{ scale: 0.95 }}
                  onClick={() => navigate(`/following?type=friends&user=${userId}`)}
                  className="text-center py-3 rounded-xl hover:bg-slate-50 transition-colors"
                >
                  <p className="text-2xl font-bold bg-gradient-to-r from-fuchsia-400 to-pink-400 bg-clip-text text-transparent">{friendsCount}</p>
                  <p className="text-[11px] text-slate-500 font-medium mt-0.5">Friends</p>
                </motion.button>
                <motion.button 
                  whileTap={{ scale: 0.95 }}
                  onClick={() => navigate(`/following?type=following&user=${userId}`)}
                  className="text-center py-3 rounded-xl hover:bg-slate-50 transition-colors border-x border-slate-100"
                >
                  <p className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">{followingCount}</p>
                  <p className="text-[11px] text-slate-500 font-medium mt-0.5">Following</p>
                </motion.button>
                <motion.button 
                  whileTap={{ scale: 0.95 }}
                  onClick={() => navigate(`/following?type=followers&user=${userId}`)}
                  className="text-center py-3 rounded-xl hover:bg-slate-50 transition-colors"
                >
                  <p className="text-2xl font-bold bg-gradient-to-r from-pink-400 to-rose-400 bg-clip-text text-transparent">{followersCount}</p>
                  <p className="text-[11px] text-slate-500 font-medium mt-0.5">Followers</p>
                </motion.button>
              </div>
            </>
          )}

          {/* Host Availability Toggle - Only for own profile if host */}
          {isOwnProfile && profile?.is_host && (profile as any)?.host_status === 'approved' && (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={handleToggleAvailability}
 className="w-full mt-4 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-slate-900 transition-all"
              style={{
                background: hostAvailability === 'online'
                  ? 'linear-gradient(135deg, rgba(239,68,68,0.8), rgba(220,38,38,0.8))'
                  : 'linear-gradient(135deg, rgba(34,197,94,0.8), rgba(22,163,74,0.8))',
                boxShadow: hostAvailability === 'online'
                  ? '0 8px 30px rgba(239,68,68,0.3)'
                  : '0 8px 30px rgba(34,197,94,0.3)',
              }}
            >
              <div className={cn(
                "w-2.5 h-2.5 rounded-full",
                hostAvailability === 'online' ? "bg-white animate-pulse" : "bg-white"
              )} />
              {hostAvailability === 'online' ? 'Go Offline' : 'Go Online'}
            </motion.button>
          )}

          {/* Action Buttons - Only for OTHER users' profiles */}
          {!isOwnProfile && (
            <div className={`grid ${profile.is_online && !profile.is_in_call && (profile.gender === 'female' || profile.gender === 'Female' || profile.is_host) ? 'grid-cols-3' : 'grid-cols-2'} gap-3 mt-5`}>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => navigate(`/chat?user=${userId}`)}
 className="flex items-center justify-center gap-2 py-4 rounded-2xl text-slate-900 font-semibold relative overflow-hidden"
                style={{
                  background: 'linear-gradient(135deg, rgba(168,85,247,0.8), rgba(236,72,153,0.8))',
                  boxShadow: '0 8px 30px rgba(168,85,247,0.3)',
                }}
              >
                <MessageCircle className="w-5 h-5" />
                <span>Message</span>
              </motion.button>

              {profile.is_online && !profile.is_in_call && (profile.gender === 'female' || profile.gender === 'Female' || profile.is_host) && (
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={handleCallClick}
 className="flex flex-col items-center justify-center gap-1 py-3 rounded-2xl text-slate-900 font-semibold relative overflow-hidden"
                  style={{
                    background: 'linear-gradient(135deg, rgba(52,211,153,0.8), rgba(16,185,129,0.8))',
                    boxShadow: '0 8px 30px rgba(16,185,129,0.3)',
                  }}
                >
                  <motion.div
 className="absolute inset-0 rounded-2xl border-2 border-slate-200/20"
                    animate={{ scale: [1, 1.05, 1], opacity: [0.5, 0, 0.5] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                  <div className="relative flex items-center gap-2">
                    <Phone className="w-5 h-5" />
                    <span>Call</span>
                  </div>
                  <div className="relative flex items-center gap-1 bg-white/15 px-2 py-0.5 rounded-full">
                    <Diamond className="w-3 h-3" />
                    <span className="text-xs font-bold">{callRate ? `${callRate}/min` : '...'}</span>
                  </div>
                </motion.button>
              )}

              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowGiftPanel(true)}
 className="flex items-center justify-center gap-2 py-4 rounded-2xl text-slate-900 font-semibold"
                style={{
                  background: 'linear-gradient(135deg, rgba(245,158,11,0.8), rgba(249,115,22,0.8))',
                  boxShadow: '0 8px 30px rgba(245,158,11,0.3)',
                }}
              >
                <Gift className="w-5 h-5" />
                <span>Gift</span>
              </motion.button>
            </div>
          )}
        </div>
      </motion.div>


      {/* Gifts Received Section - For Hosts */}
      {giftsReceived.length > 0 && (
        <div className="mx-3 mt-4">
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.15 }}
          >
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => navigate("/leaderboard")}
                className="flex items-center gap-1 text-lg font-bold text-slate-950"
              >
                🎁 Gifts Received
                <ChevronRight className="w-5 h-5 text-slate-500" />
              </button>
              <span className="text-sm text-slate-500 font-medium">
                Total: {profile?.total_earnings?.toLocaleString() || 0} beans
              </span>
            </div>

            <div className="rounded-2xl p-4 profile-home-section">
              {giftsReceived.length > 0 ? (
                <div className="w-full overflow-x-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent pb-2" style={{ WebkitOverflowScrolling: 'touch' }}>
                  <div className="flex gap-3 w-max">
                    {giftsReceived.map((gift) => (
                      <motion.button
                        key={gift.id}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => {
                          setSelectedGift(gift);
                          setShowGiftSendersModal(true);
                        }}
                        className="flex-shrink-0 w-24 h-28 rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-slate-50 transition-all bg-white border border-slate-100"
                      >
                        <div className="w-14 h-14 flex items-center justify-center text-3xl">
                          {gift.icon.startsWith("http") ? (
                            gift.icon.endsWith(".svga") ? (
                              <UniversalFramePlayer
                                src={gift.icon}
                                type="svga"
                                className="w-14 h-14"
                                loop={true}
                              />
                            ) : (
                              <img src={gift.icon} alt={gift.name} className="w-12 h-12 object-contain" />
                            )
                          ) : (
                            <span className="text-4xl">{gift.icon || '🎁'}</span>
                          )}
                        </div>
                        <span className="text-xs font-bold text-fuchsia-600">×{gift.count}</span>
                      </motion.button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-6 text-slate-500">
                  <span className="text-3xl">💝</span>
                  <p className="text-sm mt-2">No gifts received yet</p>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {/* User's Reels Section - Compact Horizontal Scroll */}
      {profile && (
        <ProfileReelsSection userId={profile.id} isOwnProfile={isOwnProfile} />
      )}

      <Dialog open={showGiftSendersModal} onOpenChange={setShowGiftSendersModal}>
 <DialogContent className="max-w-sm mx-auto max-h-[80vh] bg-[#141428] border-slate-200/10">
          <DialogHeader>
 <DialogTitle className="flex items-center gap-2 text-slate-900">
              {selectedGift?.icon.startsWith("http") ? (
                selectedGift.icon.endsWith(".svga") ? (
                  <UniversalFramePlayer
                    src={selectedGift.icon}
                    type="svga"
                    className="w-8 h-8"
                    loop={true}
                  />
                ) : (
                  <img src={selectedGift.icon} alt={selectedGift.name} className="w-8 h-8 object-contain" />
                )
              ) : (
                <span className="text-2xl">{selectedGift?.icon || '🎁'}</span>
              )}
              <span>{selectedGift?.name || "Gift"} Senders</span>
            </DialogTitle>
 <DialogDescription className="text-slate-700/75">
              Total: {selectedGift?.count || 0} gifts received
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="max-h-[50vh] pr-2">
            <div className="space-y-3">
              {giftsWithSenders
                .filter(g => g.gift_id === selectedGift?.id)
                .map((gift, index) => (
                  <motion.div
                    key={gift.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    onClick={() => {
                      setShowGiftSendersModal(false);
                      navigate(`/profile/${gift.sender_id}`);
                    }}
                    className="flex items-center gap-3 p-3 rounded-xl cursor-pointer hover:bg-white/5 transition-all"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    <Avatar className="w-12 h-12 border border-fuchsia-500/30">
                      <AvatarImage src={gift.sender_avatar || undefined} />
 <AvatarFallback className="bg-gradient-to-br from-fuchsia-600 to-purple-600 text-slate-900 font-bold">
                        {gift.sender_name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    
                    <div className="flex-1 min-w-0">
 <p className="font-semibold text-sm truncate text-slate-700/90">{gift.sender_name}</p>
                      {gift.sender_uid && (
 <p className="text-xs text-slate-700/70 flex items-center gap-1">
                          <span className="w-4 h-4 rounded-full bg-gradient-to-r from-fuchsia-500 to-purple-600 flex items-center justify-center">
 <span className="text-slate-900 font-bold text-[6px]">ID</span>
                          </span>
                          {gift.sender_uid}
                        </p>
                      )}
                    </div>
                    
                    <div className="text-right">
                      <div className="flex items-center gap-1 text-amber-600 font-bold">
                        <span className="text-lg">💎</span>
                        <span className="text-sm">{gift.coin_amount}</span>
                      </div>
 <p className="text-[10px] text-slate-700/70">
                        {new Date(gift.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </motion.div>
                ))}
              
              {giftsWithSenders.filter(g => g.gift_id === selectedGift?.id).length === 0 && (
 <div className="text-center py-6 text-slate-700/70">
                  <span className="text-3xl">🔍</span>
                  <p className="text-sm mt-2">No sender information available</p>
                </div>
              )}
            </div>
          </ScrollArea>
          
          <DialogFooter>
 <Button variant="outline" onClick={() => setShowGiftSendersModal(false)} className="w-full border-slate-200/10 text-slate-700/70 hover:bg-white/5">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Groups Section */}
      <div className="mx-3 mt-4 pb-8">
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <button
            onClick={() => navigate("/search")}
            className="flex items-center gap-1 text-lg font-bold mb-3 text-slate-950"
          >
            Groups
            <ChevronRight className="w-5 h-5 text-slate-500" />
          </button>

          {groups.length > 0 ? (
            <ScrollArea className="w-full">
              <div className="flex gap-3 pb-2">
                {groups.map((group) => (
                  <motion.button
                    key={group.id}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex-shrink-0 w-48 rounded-2xl p-4 text-left profile-home-section"
                  >
                    <div className="flex items-center gap-3">
 <Avatar className="w-12 h-12 border border-slate-200/10">
                        <AvatarImage src={group.avatar_url || undefined} />
 <AvatarFallback className="bg-gradient-to-br from-purple-600 to-pink-600 text-white">
                          {group.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-800 truncate flex items-center gap-1 text-sm">
                          <span>👨‍👩‍👧‍👦</span>
                          {group.name}
                        </p>
                        <p className="text-xs text-white/80 flex items-center gap-1 mt-0.5">
                          <Users className="w-3 h-3" />
                          ({group.member_count || 0})
                        </p>
                      </div>
                    </div>
                  </motion.button>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="rounded-2xl p-6 text-center profile-home-section">
              <Users className="w-10 h-10 text-slate-500 mx-auto mb-2" />
              <p className="text-sm text-slate-500">No groups joined yet</p>
            </div>
          )}
        </motion.div>
      </div>

      {/* Old Privileges section moved into profile card above */}

      {/* Block Confirmation Dialog */}
      <AlertDialog open={showBlockDialog} onOpenChange={setShowBlockDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isBlocked ? "Unblock User?" : "Block User?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isBlocked
                ? "This user will be able to access your streams and party rooms."
                : "This user will not be able to message you or access your streams and party rooms."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBlock}>
              {isBlocked ? "Unblock" : "Block"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Report Dialog - New 6-category system */}
      {currentUser && userId && (
        <ReportUserDialog
          open={showReportDialog}
          onOpenChange={setShowReportDialog}
          reportedUserId={userId}
          reporterUserId={currentUser.id}
          contextType="profile"
        />
      )}
      
      {/* Call Confirm Modal */}
      <CallConfirmModal
        isOpen={showCallConfirmModal}
        onClose={() => setShowCallConfirmModal(false)}
        onConfirm={handleCallConfirm}
        hostId={userId || ''}
        hostName={profile?.display_name || 'Host'}
        hostAvatar={profile?.avatar_url || null}
        hostLevel={level}
        userCoins={currentUserCoins}
      />
      
      {/* Gift Panel - Same as Live/Party/Chat */}
      <GiftPanel
        isOpen={showGiftPanel}
        onClose={() => setShowGiftPanel(false)}
        onSendGift={async (gift: GiftData, count: number) => {
          if (!currentUser?.id || !userId) return;
          const totalCost = gift.coins * count;
          if (currentUserCoins < totalCost) {
            toast({
              title: "Not Enough Diamonds!",
              description: "Please recharge your diamonds.",
              variant: "destructive"
            });
            return;
          }

          const previousCoins = currentUserCoins;
          setCurrentUserCoins(prev => prev - totalCost);
          const { updateCachedBalance, getCachedBalance } = await import("@/hooks/useUserBalance");
          updateCachedBalance(getCachedBalance() - totalCost);

          // Trigger LOCAL full-screen SVGA animation INSTANTLY for the sender
          addFlyingGift({
            senderName: 'You',
            receiverName: profile?.display_name || 'User',
            giftName: gift.name,
            giftIcon: '🎁',
            giftImageUrl: gift.icon_url || undefined,
            animationUrl: gift.animation_url || gift.icon_url || undefined,
            soundUrl: (gift as any).sound_url || undefined,
            giftColor: 'from-pink-500 to-purple-500',
            count,
            coins: gift.coins,
            isOwnGift: true,
          });

          const result = await sendGift({
            giftId: gift.id,
            senderId: currentUser.id,
            receiverId: userId,
            quantity: count,
            context: 'profile',
          });

          if (!result.success) {
            setCurrentUserCoins(previousCoins);
            updateCachedBalance(previousCoins);
            toast({ title: "Failed", description: result.error || "Could not send gift", variant: "destructive" });
            return;
          }

          toast({
            title: "Gift Sent!",
            description: `${gift.name} has been sent to ${profile?.display_name || 'User'}.`,
          });

          setShowGiftPanel(false);
        }}
        userCoins={currentUserCoins}
      />

      {/* Full-screen SVGA Gift Animations (own gift instant feedback) */}
      <AnimatePresence>
        {flyingGifts.map(g => (
          <FlyingGiftAnimation
            key={g.id}
            gift={g}
            onComplete={() => removeFlyingGift(g.id)}
          />
        ))}
      </AnimatePresence>
      </div>
    </div>
  );
};

export default ProfileDetail;
