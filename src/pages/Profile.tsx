// Profile Page - Main user profile view
import { useState, useEffect, useMemo, useRef } from "react";
import diamondGem3D from "@/assets/diamond-gem-3d.png";

import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { useNavigate, useParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  MessageCircle,
  ChevronRight,
  Settings,
  User,
  Gift,
  ClipboardList,
  Mail,
  Star,
  Gem,
  Coins,
  Crown,
  Building2,
  Phone,
  PhoneCall,
  UserPlus,
  UserCheck,
  ArrowLeft,
  Wallet,
  Sparkles,
  MapPin,
  Send,
  Search,
  ArrowRight,
  History,
  Lock,
  Film,
  Power,
} from "lucide-react";
import { VerifiedBadge, HostVerifiedBadge } from "@/components/common/VerifiedBadge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { subscribeToTables } from "@/hooks/useUniversalRealtime";
import { getTaskDate } from "@/utils/taskDateUtils";
import { useToast } from "@/hooks/use-toast";
import { BottomNavigation } from "@/components/layout/BottomNavigation";
import { goOfflineManually, isManuallyOffline } from "@/components/common/PresenceProvider";
// usePresence disabled here to avoid duplicate online-status DB writes (PresenceProvider already handles global presence)
import { useCall } from "@/components/call/CallProvider";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useNotifications } from "@/hooks/useNotifications";
import { useGlobalUnreadCount } from "@/hooks/useGlobalUnreadCount";
import { AnimatedLevelBadge, FloatingLevelIcon } from "@/components/common/AnimatedLevelBadge";
import Diamond3DIcon from "@/components/common/Diamond3DIcon";
import Beans3DIcon from "@/components/common/Beans3DIcon";
import BeansIcon from "@/components/common/BeansIcon";
import Premium3DFrame from "@/components/common/Premium3DFrame";
import AvatarWithFrame from "@/components/common/AvatarWithFrame";
import { VIPBadge, FloatingVIPIcon } from "@/components/common/VIPBadge";
import { Slider } from "@/components/ui/slider";
import useExpiredItemsRestorer from "@/hooks/useExpiredItemsRestorer";
 import UserBeansExchangeModal from "@/components/profile/UserBeansExchangeModal";
 import { useUserBalance, updateCachedBalance } from "@/hooks/useUserBalance";
import { useRealtimeLevelProgress } from "@/hooks/useRealtimeLevel";
import { triggerLegacyProfileSync } from "@/utils/legacyProfileSync";
import { parseCallRateSettings, resolveEffectiveCallRate, getEffectiveHostLevel } from "@/utils/callRateSettings";
import { getCachedUser } from "@/utils/cachedAuth";
import { recordClientError } from "@/utils/clientErrorLog";

interface ProfileStats {
  followersCount: number;
  followingCount: number;
  friendsCount: number;
}

interface LevelTier {
  level_number: number;
  level_name: string;
  min_topup_amount: number;
  min_earning_amount: number;
  level_icon: string;
}

const Profile = () => {
  const navigate = useNavigate();
  const { userId } = useParams<{ userId?: string }>();
  const { toast } = useToast();
  const { startCall } = useCall();
   
   // Use global cached balance for instant updates
   const { balance: cachedBalance, refetch: refetchBalance } = useUserBalance();
   
  const [currentUser, setCurrentUser] = useState<any>(null);
  const profileCreationAttemptedRef = useRef(false);
  const [profile, setProfile] = useState<any>(() => {
    // Instant restore from session cache to avoid blank flash on tab switch
    try {
      const cacheKey = `meri_profile_cache_${userId || 'self'}`;
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const { data, ts } = JSON.parse(cached);
        if (Date.now() - ts < 300_000) return data; // 5 min cache
      }
    } catch {}
    return null;
  });
  const [activeTab, setActiveTab] = useState("/profile");
  const [loading, setLoading] = useState(() => {
    // If we have cached profile, skip loading state
    try {
      const cacheKey = `meri_profile_cache_${userId || 'self'}`;
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const { ts } = JSON.parse(cached);
        if (Date.now() - ts < 300_000) return false;
      }
    } catch {}
    return true;
  });
  const [stats, setStats] = useState<ProfileStats>({
    followersCount: 0,
    followingCount: 0,
    friendsCount: 0
  });
  const [beans, setBeans] = useState(0);
  const [consumptionReturn, setConsumptionReturn] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [hasUnclaimedReward, setHasUnclaimedReward] = useState(false);
  
const [levelTiers, setLevelTiers] = useState<LevelTier[]>([]);
  // Initialize userLevel from localStorage cache to prevent "level 0 flash"
  const [userLevel, setUserLevel] = useState(() => {
    try {
      const cached = localStorage.getItem('meri_level_cache');
      if (cached) {
        const data = JSON.parse(cached);
        if (data.level != null && data.level > 0 && Date.now() - data.timestamp < 86400000) {
          return data.level;
        }
      }
    } catch {}
    return 1; // Default to 1 instead of 0 - levels should never show 0 for regular users
  });
  const [nextLevel, setNextLevel] = useState(1);
  const [levelProgress, setLevelProgress] = useState(0);
  const [isCoinTrader, setIsCoinTrader] = useState(false);
  const [traderWallet, setTraderWallet] = useState(0);
  const [traderId, setTraderId] = useState<string | null>(null);
  const [isInActiveAgency, setIsInActiveAgency] = useState(false);
  const [userVIPTier, setUserVIPTier] = useState<number>(0);

  const isWeakIdentityName = (value?: string | null) => {
    const normalized = value?.trim().toLowerCase() || "";
    if (!normalized) return true;
    // Reject auto-generated guest/device-based names
    if (normalized.startsWith("guest_") || normalized.startsWith("device_") || normalized.startsWith("user_")) return true;
    if (["user", "owner", "unknown", "guest"].includes(normalized)) return true;
    return false;
  };

  const resolvedProfileName = useMemo(() => {
    // ALWAYS trust profile.display_name if user has explicitly set one (non-empty, not auto-generated)
    const userSet = profile?.display_name?.trim();
    if (userSet && !isWeakIdentityName(userSet)) return userSet;

    const candidates = [
      profile?.display_name,
      profile?.username,
      currentUser?.user_metadata?.username,
      currentUser?.user_metadata?.full_name,
      currentUser?.user_metadata?.name,
    ].filter((value): value is string => Boolean(value?.trim()));

    const strongCandidate = candidates.find((value) => !isWeakIdentityName(value));
    return strongCandidate || candidates[0] || "User";
  }, [profile?.display_name, profile?.username, currentUser?.user_metadata?.username, currentUser?.user_metadata?.full_name, currentUser?.user_metadata?.name]);

  const resolvedDiamondBalance = useMemo(() => {
    const profileBalance = Math.max(Number(profile?.coins ?? 0), Number((profile as any)?.diamonds ?? 0));
    return cachedBalance > 0 ? cachedBalance : profileBalance;
  }, [cachedBalance, profile?.coins, (profile as any)?.diamonds]);

  const getPersonalBeans = (profileData: any) => Math.max(0, Number(profileData?.beans || 0));

  const syncBeansFromProfile = (profileData: any) => {
    if (!profileData || profileData.beans === undefined) return;

    // My Beans must always reflect only the user's personal earning bucket.
    // Agency wallet_balance belongs to Agency Dashboard Total Beans and must stay separate.
    setBeans(getPersonalBeans(profileData));
  };

  // Transfer modal state
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferTab, setTransferTab] = useState<"user" | "agency" | "self" | "history">("user");
  const [transferHistory, setTransferHistory] = useState<Array<{
    id: string;
    sender_id: string;
    receiver_id: string;
    amount: number;
    transfer_type: string;
    status: string;
    notes: string | null;
    created_at: string;
    direction: 'sent' | 'received';
    counterparty_name?: string;
    kind?: 'transfer' | 'gift';
    currency?: 'diamond' | 'bean';
  }>>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selfRechargeAmount, setSelfRechargeAmount] = useState("");
  const [selfRechargeProcessing, setSelfRechargeProcessing] = useState(false);
  const [transferSearchQuery, setTransferSearchQuery] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferSearching, setTransferSearching] = useState(false);
  const [transferProcessing, setTransferProcessing] = useState(false);
  const [searchedUser, setSearchedUser] = useState<{
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    app_uid: string | null;
  } | null>(null);
  const [searchedAgency, setSearchedAgency] = useState<{
    id: string;
    name: string | null;
    agency_code: string | null;
    diamond_balance: number | null;
    owner_name?: string | null;
    owner_uid?: string | null;
  } | null>(null);
  
  // Confirmation dialog state
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingTransferType, setPendingTransferType] = useState<"user" | "agency" | "self" | null>(null);

  // Agency Beans Exchange modal state
  const [showAgencyExchangeModal, setShowAgencyExchangeModal] = useState(false);
  const [agencyData, setAgencyData] = useState<{ id: string; name: string; diamond_balance: number; beans_balance: number } | null>(null);
  const availableTransferBalance = useMemo(() => {
    const personalCoins = Number(resolvedDiamondBalance || 0);
    const agency = Number(agencyData?.diamond_balance || 0);
    const trader = Number(traderWallet || 0);
    return agency + trader + personalCoins;
  }, [agencyData, traderWallet, resolvedDiamondBalance]);

  const selfRechargeSourceBalance = useMemo(() => {
    const agency = Number(agencyData?.diamond_balance || 0);
    const trader = Number(traderWallet || 0);
    return agency + trader;
  }, [agencyData, traderWallet]);

  const refreshTransferBalances = async () => {
    if (!currentUser?.id) {
      return {
        traderWallet: Number(traderWallet || 0),
        agencyBalance: Number(agencyData?.diamond_balance || 0),
        personalCoins: Number(resolvedDiamondBalance || 0),
        total: availableTransferBalance,
        selfRechargeTotal: selfRechargeSourceBalance,
      };
    }

    const shouldLoadAgency = Boolean(agencyData || profile?.is_agency_owner || isCoinTrader);
    const agencyPromise = shouldLoadAgency
      ? supabase
          .from("agencies")
          .select("id, name, diamond_balance, wallet_balance")
          .eq("owner_id", currentUser.id)
          .eq("is_active", true)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null } as const);

    const [helperResult, latestAgencyResult, profileResult] = await Promise.all([
      supabase
        .from("topup_helpers")
        .select("id, wallet_balance, is_verified")
        .eq("user_id", currentUser.id)
        .eq("is_verified", true)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      agencyPromise,
      supabase
        .from("profiles")
        .select("coins")
        .eq("id", currentUser.id)
        .single(),
    ]);

    if (helperResult.error) throw helperResult.error;
    if (latestAgencyResult.error) throw latestAgencyResult.error;
      if (profileResult.error && profileResult.error.code !== 'PGRST116') throw profileResult.error;

    const nextTraderWallet = Number(helperResult.data?.wallet_balance || 0);
    const nextAgencyBalance = Number(latestAgencyResult.data?.diamond_balance || 0);
      const personalCoins = Number(profileResult.data?.coins || 0);

    setIsCoinTrader(Boolean(helperResult.data));
    setTraderWallet(nextTraderWallet);
    setTraderId(helperResult.data?.id ?? null);

    if (latestAgencyResult.data) {
      setAgencyData({
        id: latestAgencyResult.data.id,
        name: latestAgencyResult.data.name,
        diamond_balance: nextAgencyBalance,
        beans_balance: Number(latestAgencyResult.data.wallet_balance || 0),
      });
    } else if (shouldLoadAgency) {
      setAgencyData(null);
    }

    return {
      traderWallet: nextTraderWallet,
      agencyBalance: nextAgencyBalance,
      personalCoins,
      total: nextTraderWallet + nextAgencyBalance + personalCoins,
      selfRechargeTotal: nextTraderWallet + nextAgencyBalance,
    };
  };

  const [agencyExchangeSettings, setAgencyExchangeSettings] = useState({
    beans_to_diamonds_rate: 1,
    exchange_fee_percent: 25,
    min_exchange_amount: 100000
  });
  const [exchangeBeansAmount, setExchangeBeansAmount] = useState("");
  const [exchangeDiamondsToGet, setExchangeDiamondsToGet] = useState(0);
  const [exchangeFeeAmount, setExchangeFeeAmount] = useState(0);
  const [exchangeProcessing, setExchangeProcessing] = useState(false);
 
   // User Beans Exchange modal (for regular users)
   const [showUserBeansExchangeModal, setShowUserBeansExchangeModal] = useState(false);

  // Call Price Update modal state (for hosts)
  const [showCallPriceModal, setShowCallPriceModal] = useState(false);
  const [callRate, setCallRate] = useState<number>(0);
  const [callRateSettings, setCallRateSettings] = useState<any>(null);
  const [savingCallRate, setSavingCallRate] = useState(false);

  // Get real notification count - use global shared count for instant updates
  const globalUnread = useGlobalUnreadCount();
  const notificationCount = globalUnread.notifications;

  // Determine if viewing own profile or another user's profile
  const isOwnProfile = !userId || userId === currentUser?.id;
  const profileId = userId || currentUser?.id;
  const { level: resolvedUserLevel, progress: resolvedLevelProgress, nextLevelNumber: resolvedNextLevel } = useRealtimeLevelProgress(profileId ?? null);

  // Presence is managed globally by PresenceProvider (avoid duplicate write storm here)
  // usePresence(isOwnProfile ? currentUser?.id : null);

  // Auto-detect location for own profile
  const geoLocation = useGeolocation(isOwnProfile ? currentUser?.id : null, isOwnProfile);

  // Check and restore expired VIP items automatically
  useExpiredItemsRestorer(isOwnProfile ? currentUser?.id : null);

  // Track if initial load is complete
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);

  useEffect(() => {
    let isMounted = true;
    let refetchTimer: ReturnType<typeof setTimeout> | null = null;
    let unsubscribeRealtime: (() => void) | null = null;
    let activeProfileId: string | null = null;
    let initialLoadSafetyTimer: ReturnType<typeof setTimeout> | null = null;

    const fetchData = async (isInitialLoad = false) => {
      // Only show loading on first load, not on background refresh
      if (isInitialLoad && !initialLoadComplete && isMounted) {
        setLoading(true);
      }

      try {
        // Use getSession (local) instead of getUser (network call) for faster load
        const cachedUser = await getCachedUser();
        const { data: { session } } = await supabase.auth.getSession();
        const authUser = session?.user ?? null;
        const user = authUser ?? (cachedUser ? { id: cachedUser.id, email: cachedUser.email } : null);

        if (!isMounted) return;
        setCurrentUser(user);

        const targetUserId = userId || user?.id;
        activeProfileId = targetUserId ?? null;

        if (!targetUserId) {
          return;
        }

        // Fetch profile data first (needed for conditional logic)
        let { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", targetUserId)
          .maybeSingle();

        if (profileError) {
          console.warn("[Profile] Initial profile fetch issue:", profileError);
        }

        if (user && targetUserId === user.id) {
          try {
            const shouldForceSync = !profileData;
            const legacySyncResult = await triggerLegacyProfileSync(user.id, { force: shouldForceSync });

            if (legacySyncResult?.synced || shouldForceSync) {
              const { data: refreshedProfile, error: refreshError } = await supabase
                .from("profiles")
                .select("*")
                .eq("id", user.id)
                .maybeSingle();

              if (refreshError) {
                console.warn("[Profile] Profile refetch after sync failed:", refreshError);
              }

              if (refreshedProfile) {
                profileData = refreshedProfile;
              }
            }
          } catch (syncError) {
            console.warn("[Profile] Legacy sync retry failed:", syncError);
          }
        }

        // Last-resort self-heal: if the row is still missing, try one direct client upsert
        if (!profileData && authUser && targetUserId === authUser.id) {
          const displayName = authUser.user_metadata?.full_name ||
            authUser.user_metadata?.name ||
            (authUser.email?.includes('@meri.local') ? null : authUser.email?.split('@')[0]) ||
            `User${Math.random().toString(36).substring(2, 8)}`;

          const avatarUrl = authUser.user_metadata?.avatar_url ||
            authUser.user_metadata?.picture || null;

          const appUid = String(Math.floor(1000000000 + Math.random() * 9000000000));

          const { error: createProfileError } = await supabase
            .from("profiles")
            .insert({
              id: authUser.id,
              display_name: displayName,
              username: authUser.email?.includes('@meri.local') ? null : authUser.email?.split('@')[0] || null,
              avatar_url: avatarUrl,
              gender: authUser.user_metadata?.gender || 'male',
              app_uid: appUid,
              last_seen: new Date().toISOString(),
            });

          if (createProfileError) {
            console.error("[Profile] Failed to create fallback profile:", createProfileError);
            recordClientError({ label: "Profile.appUid", message: createProfileError instanceof Error ? createProfileError.message : String(createProfileError) });
          } else {
            const { data: healedProfile } = await supabase
              .from("profiles")
              .select("*")
              .eq("id", authUser.id)
              .maybeSingle();

            if (healedProfile) {
              profileData = healedProfile;
            }
          }
        }

        if (!isMounted) return;
        setProfile(profileData);

        // Cache profile for instant tab-switch restore
        if (profileData) {
          try {
            const cacheKey = `meri_profile_cache_${userId || 'self'}`;
            sessionStorage.setItem(cacheKey, JSON.stringify({ data: profileData, ts: Date.now() }));
          } catch {}
        }

        // PARALLEL FETCH - All independent queries at once for speed
        const isOwnProfileCheck = !userId || userId === user?.id;
        const today = getTaskDate();

        const [
          followersResult,
          followingResult,
          myFollowingResult,
          myFollowersResult,
          earningsResult,
          spentResult,
          callSettingsResult,
          followDataResult,
          unclaimedResult,
          helperResult,
          agencyHostResult,
          vipResult,
          conversationsResult,
          agencyBeansResult,
          faceVerifPendingResult,
        ] = await Promise.all([
          // Followers count
          supabase.from("followers").select("*", { count: 'exact', head: true }).eq("following_id", targetUserId),
          // Following count
          supabase.from("followers").select("*", { count: 'exact', head: true }).eq("follower_id", targetUserId),
          // My following (for friends calculation)
          supabase.from("followers").select("following_id").eq("follower_id", targetUserId),
          // My followers (for friends calculation)
          supabase.from("followers").select("follower_id").eq("following_id", targetUserId),
          // Earnings (no longer needed - using profile.coins directly)
          { data: null },
          // Spent (for consumption return)
          supabase.from("gift_transactions").select("coin_amount").eq("sender_id", targetUserId),
          // Call rate settings (for hosts)
          profileData?.is_host && profileData?.gender === 'female' ? supabase.from('app_settings').select('setting_value').eq('setting_key', 'call_rates').maybeSingle() : { data: null },
          // Follow status (for other profiles)
          user && userId && userId !== user.id ? supabase.from("followers").select("id").eq("follower_id", user.id).eq("following_id", userId).maybeSingle() : { data: null },
          // Unclaimed tasks (own profile)
          isOwnProfileCheck && user ? supabase.from("user_task_progress").select("*", { count: 'exact', head: true }).eq("user_id", user.id).eq("is_completed", true).eq("is_claimed", false).eq("reset_date", today) : { count: 0 },
          // Helper/trader status (own profile)
          isOwnProfileCheck && user ? supabase.from("topup_helpers").select("id, is_verified, wallet_balance").eq("user_id", user.id).eq("is_verified", true).maybeSingle() : { data: null },
          // Agency host status (own profile)
          isOwnProfileCheck && user ? supabase.from("agency_hosts").select("id, status").eq("host_id", user.id).eq("status", "active").maybeSingle() : { data: null },
          // VIP subscription (own profile)
          isOwnProfileCheck && user ? supabase.from("user_vip_subscriptions").select("vip_tier_id, vip_tiers(tier_level)").eq("user_id", user.id).eq("is_active", true).gte("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle() : { data: null },
          // Conversations (for unread count)
          isOwnProfileCheck && user ? supabase.from("conversations").select("id").or(`participant1_id.eq.${user.id},participant2_id.eq.${user.id}`) : { data: null },
          // Agency wallet_balance (for agency owners) - wallet_balance is the source of truth
          isOwnProfileCheck && user && profileData?.is_agency_owner ? supabase.from("agencies").select("id, wallet_balance, diamond_balance").eq("owner_id", user.id).eq("is_active", true).maybeSingle() : { data: null },
          // Face verification pending check
          isOwnProfileCheck && user && !profileData?.is_face_verified ? supabase.from("face_verification_submissions").select("id", { count: 'exact', head: true }).eq("user_id", user.id).eq("status", "pending") : { count: 0 },
        ]);

        if (!isMounted) return;

        // Process friends count
        const followingIds = new Set(myFollowingResult?.data?.map(f => f.following_id) || []);
        const followerIds = myFollowersResult?.data?.map(f => f.follower_id) || [];
        const friendsCount = followerIds.filter(id => followingIds.has(id)).length;

        setStats({
          followersCount: followersResult?.count || 0,
          followingCount: followingResult?.count || 0,
          friendsCount
        });

        // Set balances - keep personal My Beans separate from agency withdrawable Total Beans
        if (profileData?.is_agency_owner && agencyBeansResult?.data) {
          const rawAgencyBeans = Number(agencyBeansResult.data.wallet_balance || 0);
          const personalBeans = getPersonalBeans(profileData);
          const agencyDiamonds = agencyBeansResult.data.diamond_balance || 0;
          const helperWalletBalance = helperResult?.data?.wallet_balance ?? 0;

          setBeans(personalBeans);
          setAgencyData({
            id: agencyBeansResult.data.id,
            name: (profileData.display_name || profileData.username || 'My') + "'s Agency",
            beans_balance: rawAgencyBeans,
            diamond_balance: agencyDiamonds,
          });
          console.log('[Profile] Agency owner personal beans:', personalBeans, 'Agency total beans:', rawAgencyBeans, 'Agency diamonds:', agencyDiamonds, 'Helper wallet:', helperWalletBalance, 'Total Trader Wallet:', agencyDiamonds + helperWalletBalance);
        } else {
          syncBeansFromProfile(profileData);
        }

        // Set call rate settings (parse to ensure level_rates is always an array)
        if (callSettingsResult?.data?.setting_value) {
          setCallRateSettings(parseCallRateSettings(callSettingsResult.data.setting_value));
        }

        // Set consumption return
        const totalSpent = spentResult?.data?.reduce((sum, e) => sum + e.coin_amount, 0) || 0;
        setConsumptionReturn(Math.floor(totalSpent * 0.1));

        // Set following status
        setIsFollowing(!!followDataResult?.data);

        // Set face verification pending status
        setFaceVerificationPending((faceVerifPendingResult?.count || 0) > 0);

        // Own profile specific data
        if (isOwnProfileCheck && user) {
          setHasUnclaimedReward((unclaimedResult?.count || 0) > 0);

          if (helperResult?.data) {
            setIsCoinTrader(true);
            setTraderWallet(helperResult.data.wallet_balance || 0);
            setTraderId(helperResult.data.id);
            
            // Load agency diamond balance for combined trader wallet (if not already loaded as agency owner)
            if (!profileData?.is_agency_owner) {
              const { data: helperAgency } = await supabase
                .from('agencies')
                .select('id, diamond_balance, wallet_balance, name')
                .eq('owner_id', user.id)
                .eq('is_active', true)
                .maybeSingle();
              if (helperAgency) {
                setAgencyData({
                  id: helperAgency.id,
                  name: helperAgency.name || 'Agency',
                  diamond_balance: helperAgency.diamond_balance || 0,
                  beans_balance: helperAgency.wallet_balance || 0,
                });
              }
            }
          } else {
            setIsCoinTrader(false);
            setTraderWallet(0);
            setTraderId(null);
          }

          setIsInActiveAgency(!!agencyHostResult?.data);

          if (vipResult?.data?.vip_tiers) {
            setUserVIPTier((vipResult.data.vip_tiers as any).tier_level || 0);
          } else {
            setUserVIPTier(0);
          }

          // Unread messages count now handled by useGlobalUnreadCount hook
        }

        if (!initialLoadComplete) {
          setInitialLoadComplete(true);
        }
      } catch (error) {
        console.error("[Profile] Failed to load profile data:", error);
        recordClientError({ label: "Profile.totalSpent", message: error instanceof Error ? error.message : String(error) });
      } finally {
        if (isInitialLoad && isMounted) {
          if (initialLoadSafetyTimer) {
            clearTimeout(initialLoadSafetyTimer);
            initialLoadSafetyTimer = null;
          }
          setLoading(false);
        }
      }
    };

    // Debounced real-time refetch — 3s delay to prevent excessive API calls on high-frequency events
    const debouncedRefetch = () => {
      if (refetchTimer) clearTimeout(refetchTimer);
      refetchTimer = setTimeout(() => {
        void fetchData();
      }, 3000);
    };

    const init = async () => {
      // Safety net: never allow endless loading spinner
      initialLoadSafetyTimer = setTimeout(() => {
        if (!isMounted) return;
        console.warn('[Profile] Initial load safety timeout reached, unlocking UI');
        setLoading(false);
        if (!initialLoadComplete) {
          setInitialLoadComplete(true);
        }
      }, 3_000); // Reduced from 6s to 3s for faster unlock

      await fetchData(true);

      if (!isMounted || !activeProfileId) {
        return;
      }

      // Use universal realtime system instead of manual channel
      unsubscribeRealtime = subscribeToTables(
        `profile-${activeProfileId}`,
        ['profiles', 'gift_transactions', 'private_calls', 'agencies', 'topup_helpers', 'face_verification_submissions'],
        (table, event, payload) => {
          // Profile updates — including admin approval of verification/host
          if (table === 'profiles' && payload?.id === activeProfileId) {
            let mergedProfile: any = null;
            setProfile((prev: any) => {
              mergedProfile = { ...prev, ...payload };
              return mergedProfile;
            });

            if (payload?.coins !== undefined) {
              updateCachedBalance(payload.coins);
            }

            syncBeansFromProfile(mergedProfile);

            // When admin approves face verification, instantly hide the menu item
            if (payload?.is_face_verified === true) {
              setFaceVerificationPending(false);
            }
          }

          // Face verification submission status changes (pending/approved/rejected)
          if (table === 'face_verification_submissions' && payload?.user_id === activeProfileId) {
            if (payload?.status === 'approved') {
              setFaceVerificationPending(false);
              // Also refresh profile to get is_face_verified update
              void fetchData();
            } else if (payload?.status === 'pending') {
              setFaceVerificationPending(true);
            } else if (payload?.status === 'rejected') {
              setFaceVerificationPending(false);
            }
          }
          
          // Gift transactions
          if (table === 'gift_transactions' && payload?.receiver_id === activeProfileId) {
            debouncedRefetch();
          }
          
          // Call ended
          if (table === 'private_calls' && payload?.host_id === activeProfileId && payload?.status === 'ended') {
            void fetchData();
          }
          
          // Agency updates
          if (table === 'agencies' && payload?.owner_id === activeProfileId) {
            setAgencyData(prev => prev ? {
              ...prev,
              diamond_balance: payload.diamond_balance ?? prev.diamond_balance,
              beans_balance: payload.wallet_balance ?? prev.beans_balance,
            } : prev);
          }

          if (table === 'topup_helpers' && payload?.user_id === activeProfileId) {
            if (event === 'DELETE' || payload?.is_verified === false) {
              setIsCoinTrader(false);
              setTraderWallet(0);
              setTraderId(null);
            } else {
              setIsCoinTrader(true);
              setTraderWallet(Number(payload.wallet_balance || 0));
              setTraderId(payload.id || null);
            }
          }
        }
      );
    };

    void init();

    return () => {
      isMounted = false;
      if (initialLoadSafetyTimer) clearTimeout(initialLoadSafetyTimer);
      if (refetchTimer) clearTimeout(refetchTimer);
      if (unsubscribeRealtime) {
        unsubscribeRealtime();
      }
    };
  }, [userId]);

  const handleFollow = async () => {
    if (!currentUser || !profileId) {
      toast({ title: "Please login first", variant: "destructive" });
      return;
    }

    setFollowLoading(true);

    try {
      if (isFollowing) {
        // Unfollow
        await supabase
          .from("followers")
          .delete()
          .eq("follower_id", currentUser.id)
          .eq("following_id", profileId);
        
        setIsFollowing(false);
        setStats(prev => ({ ...prev, followersCount: prev.followersCount - 1 }));
        toast({ title: "Unfollowed successfully" });
      } else {
        // Follow
        await supabase
          .from("followers")
          .insert({
            follower_id: currentUser.id,
            following_id: profileId
          });
        
        setIsFollowing(true);
        setStats(prev => ({ ...prev, followersCount: prev.followersCount + 1 }));
        toast({ title: "Followed successfully" });
      }
    } catch (error) {
      console.error('Follow error:', error);
      recordClientError({ label: "Profile.handleFollow", message: error instanceof Error ? error.message : String(error) });
      toast({ title: "Action failed", variant: "destructive" });
    } finally {
      setFollowLoading(false);
    }
  };

  const handleCall = async () => {
    if (!profileId || isOwnProfile) return;
    
    try {
      await startCall(profileId);
    } catch (error) {
      console.error('Call error:', error);
      recordClientError({ label: "Profile.handleCall", message: error instanceof Error ? error.message : String(error) });
      toast({ title: "Failed to start call", variant: "destructive" });
    }
  };

  // Search user by App UID for transfer
  const handleSearchUser = async () => {
    if (!transferSearchQuery.trim() || !currentUser) return;
    
    setTransferSearching(true);
    setSearchedUser(null);
    
    try {
        const { data, error } = await supabase.rpc('search_user_by_app_uid', {
          _app_uid: transferSearchQuery.trim().toUpperCase()
        });

      if (error) throw error;
      
      const foundUser = Array.isArray(data) ? data[0] : null;

      if (!foundUser) {
        toast({ title: "Not Found", description: "No user found with this App UID", variant: "destructive" });
        return;
      }

      if (foundUser.id === currentUser.id) {
        toast({ title: "Invalid Receiver", description: "You cannot transfer diamonds to yourself from the User tab", variant: "destructive" });
        return;
      }

      setSearchedUser(foundUser);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setTransferSearching(false);
    }
  };

  // Search agency by owner's App UID for transfer
  const handleSearchAgency = async () => {
    if (!transferSearchQuery.trim()) return;
    
    setTransferSearching(true);
    setSearchedAgency(null);
    
    try {
      const { data: userDataRows, error: userError } = await supabase.rpc('search_user_by_app_uid', {
        _app_uid: transferSearchQuery.trim().toUpperCase()
      });

      if (userError) throw userError;
      
      const userData = Array.isArray(userDataRows) ? userDataRows[0] : null;

      if (!userData) {
        toast({ title: "Not Found", description: "No user found with this App UID", variant: "destructive" });
        setTransferSearching(false);
        return;
      }

      const { data: agencyData, error: agencyError } = await supabase
        .from('agencies_public')
        .select('id, name, agency_code, diamond_balance')
        .eq('owner_id', userData.id)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (agencyError) throw agencyError;
      
      if (agencyData) {
        setSearchedAgency({
          ...agencyData,
          owner_name: userData.display_name,
          owner_uid: userData.app_uid
        });
      } else {
        toast({ title: "No Agency", description: "This user doesn't own any agency", variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setTransferSearching(false);
    }
  };

  // Request confirmation before transfer to user - FIXED: Support both agency owners AND traders
  const requestTransferToUser = async () => {
    if (!searchedUser || !currentUser) return;

    const amount = parseInt(transferAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: "Invalid Amount", description: "Please enter a valid diamond amount", variant: "destructive" });
      return;
    }

    try {
      const latestBalances = await refreshTransferBalances();
      const isAgencyOwner = latestBalances.agencyBalance > 0 || Boolean(agencyData);

      if (!isAgencyOwner && latestBalances.traderWallet <= 0) {
        toast({ title: "Error", description: "No wallet found for transfer", variant: "destructive" });
        return;
      }

      if (amount > latestBalances.total) {
        toast({ title: "Insufficient Balance", description: `You need ${amount.toLocaleString()} but have ${latestBalances.total.toLocaleString()}`, variant: "destructive" });
        return;
      }

      setPendingTransferType("user");
      setShowConfirmDialog(true);
    } catch (error: any) {
      toast({ title: "Balance Sync Failed", description: error.message || "Could not load latest wallet balance", variant: "destructive" });
    }
  };

  // Request confirmation before transfer to agency - FIXED: Support both agency owners AND traders
  const requestTransferToAgency = async () => {
    if (!searchedAgency || !currentUser) return;

    const amount = parseInt(transferAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: "Invalid Amount", description: "Please enter a valid diamond amount", variant: "destructive" });
      return;
    }

    try {
      const latestBalances = await refreshTransferBalances();
      const isAgencyOwner = latestBalances.agencyBalance > 0 || Boolean(agencyData);

      if (!isAgencyOwner && latestBalances.traderWallet <= 0) {
        toast({ title: "Error", description: "No wallet found for transfer", variant: "destructive" });
        return;
      }

      if (amount > latestBalances.total) {
        toast({ title: "Insufficient Balance", description: `You need ${amount.toLocaleString()} but have ${latestBalances.total.toLocaleString()}`, variant: "destructive" });
        return;
      }

      setPendingTransferType("agency");
      setShowConfirmDialog(true);
    } catch (error: any) {
      toast({ title: "Balance Sync Failed", description: error.message || "Could not load latest wallet balance", variant: "destructive" });
    }
  };

  // Handle confirmed transfer
  const handleConfirmedTransfer = async () => {
    setShowConfirmDialog(false);
    if (pendingTransferType === "user") {
      await executeTransferToUser();
    } else if (pendingTransferType === "agency") {
      await executeTransferToAgency();
    } else if (pendingTransferType === "self") {
      await executeSelfRecharge();
    }
    setPendingTransferType(null);
  };

  // Self Recharge - Transfer from trader/agency wallet to own My Diamond Balance
  const requestSelfRecharge = async () => {
    if (!currentUser) return;
    const amount = parseInt(selfRechargeAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: "Invalid Amount", description: "Please enter a valid diamond amount", variant: "destructive" });
      return;
    }

    try {
      const latestBalances = await refreshTransferBalances();
      if (amount > latestBalances.selfRechargeTotal) {
        toast({ title: "Insufficient Balance", description: `You need ${amount.toLocaleString()} but have ${latestBalances.selfRechargeTotal.toLocaleString()} available for self recharge`, variant: "destructive" });
        return;
      }
    } catch (error: any) {
      toast({ title: "Balance Sync Failed", description: error.message || "Could not load latest wallet balance", variant: "destructive" });
      return;
    }

    setTransferAmount(String(amount));
    setPendingTransferType("self");
    setShowConfirmDialog(true);
  };

  // Auto low-balance warning for helpers/payroll helpers after transactions
  const checkAndNotifyLowBalance = async (newBalance: number, userId: string) => {
    const HIDE_THRESHOLD = 300000;
    const WARN_THRESHOLD = 150000;

    if (newBalance > HIDE_THRESHOLD || newBalance <= 0) return;

    const isHidden = newBalance < HIDE_THRESHOLD;
    const warningTitle = isHidden
      ? "⚠️ Payment Methods Hidden"
      : "⚠️ Low Balance Warning";
    const warningBody = newBalance <= WARN_THRESHOLD
      ? `Your Trader Wallet balance is now ${newBalance.toLocaleString()} 💎. It has dropped near or below 150,000. Recharge quickly, otherwise your payment numbers may be hidden from the Recharge page.`
      : `Your Trader Wallet balance is ${newBalance.toLocaleString()} 💎. If it drops below 300,000, your payment numbers will be automatically hidden from the Recharge page until your balance is restored above 300,000.`;

    toast({
      title: warningTitle,
      description: warningBody,
      variant: "destructive",
      duration: 10000,
    });

    try {
      await supabase.from("notifications").insert({
        user_id: userId,
        type: "low_balance_warning",
        title: warningTitle,
        message: warningBody,
        data: { wallet_balance: newBalance, threshold: HIDE_THRESHOLD, warning_threshold: WARN_THRESHOLD },
      });
    } catch (err) {
      console.error('[LowBalance] Failed to store notification:', err);
      recordClientError({ label: "Profile.warningBody", message: err instanceof Error ? err.message : String(err) });
    }
  };

  const executeSelfRecharge = async () => {
    if (!currentUser) return;
    const amount = Math.floor(parseInt(selfRechargeAmount) || 0);
    if (amount <= 0) return;

    setSelfRechargeProcessing(true);
    try {
      console.log('[SelfRecharge] DEBUG: currentUser.id =', currentUser.id, 'amount =', amount);
      const { data, error } = await supabase.rpc('helper_transfer_diamonds_to_self', {
        _user_id: currentUser.id,
        _amount: amount,
      });
      console.log('[SelfRecharge] DEBUG: RPC response data =', JSON.stringify(data), 'error =', error);
      if (error) throw error;
      const result = data as any;
      if (!result?.success) throw new Error(result?.error || 'Self recharge failed');

      // Update local state
      const helperDeducted = Math.max(0, Number(traderWallet || 0) - Number(result.new_wallet_balance || 0));
      const agencyDeducted = Math.max(0, amount - helperDeducted);
      setTraderWallet(result.new_wallet_balance);
      if (agencyData && agencyDeducted > 0) {
        setAgencyData(prev => prev ? { ...prev, diamond_balance: Math.max(0, (prev.diamond_balance || 0) - agencyDeducted) } : null);
      }
      // Update cached user balance
      const { updateCachedBalance } = await import('@/hooks/useUserBalance');
      updateCachedBalance(result.new_coins);

      toast({
        title: "Self Recharge Successful! ✅",
        description: `${amount.toLocaleString()} 💎 added to your My Diamond Balance`,
      });

      // Check low balance warning on combined trader wallet balance
      await checkAndNotifyLowBalance(Math.max(0, (result.new_wallet_balance || 0) + Number(agencyData?.diamond_balance || 0) - agencyDeducted), currentUser.id);

      setSelfRechargeAmount("");
      setShowTransferModal(false);
    } catch (error: any) {
      console.error('[SelfRecharge] Error:', error);
      recordClientError({ label: "Profile.agencyDeducted", message: error instanceof Error ? error.message : String(error) });
      toast({ title: "Self Recharge Failed", description: error.message, variant: "destructive" });
    } finally {
      setSelfRechargeProcessing(false);
    }
  };

  // Transfer diamonds to user - ATOMIC via RPC
  const executeTransferToUser = async () => {
    if (!searchedUser || !currentUser) return;
    
    const amount = Math.floor(parseInt(transferAmount) || 0);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: "Invalid Amount", description: "Please enter a valid diamond amount", variant: "destructive" });
      return;
    }
    
    setTransferProcessing(true);
    try {
      const latestBalances = await refreshTransferBalances();
      console.log('[UserTransfer] DEBUG: latestBalances =', JSON.stringify(latestBalances), 'currentUser.id =', currentUser.id);
      if (amount > latestBalances.total) {
        throw new Error(`Insufficient balance. Available: ${latestBalances.total.toLocaleString()}`);
      }

      // Pick sender type: agency first if it has balance, then trader, then personal
      const senderType = latestBalances.agencyBalance >= amount ? 'agency_to_user' 
        : latestBalances.traderWallet >= amount ? 'trader_to_user' 
        : 'agency_to_user'; // fallback to agency_to_user which tries all tiers in RPC

      console.log('[UserTransfer] DEBUG: senderType =', senderType, 'receiverId =', searchedUser.id, 'amount =', amount);
      const { data, error } = await supabase.rpc('helper_transfer_coins_to_user', {
        _sender_id: currentUser.id,
        _receiver_id: searchedUser.id,
        _amount: amount,
        _sender_type: senderType
      });
      console.log('[UserTransfer] DEBUG: RPC response =', JSON.stringify(data), 'error =', error);

      if (error) throw error;
      
      const result = data as any;
      if (!result?.success) {
        throw new Error(result?.error || 'Transfer failed');
      }

      // Update local state
      if (result.user_deducted > 0) {
        const newPersonalBalance = Math.max(0, resolvedDiamondBalance - result.user_deducted);
        updateCachedBalance(newPersonalBalance);
        setProfile((prev: any) => prev ? { ...prev, coins: newPersonalBalance } : prev);
      }
      if (result.agency_deducted > 0 && agencyData) {
        setAgencyData(prev => prev ? { ...prev, diamond_balance: (prev.diamond_balance || 0) - result.agency_deducted } : null);
      }
      if (result.helper_deducted > 0) {
        setTraderWallet(prev => prev - result.helper_deducted);
      }

      // Check low balance warning on combined trader wallet balance
      if (result.helper_deducted > 0 || result.agency_deducted > 0) {
        const currentWallet = Math.max(0, (traderWallet - (result.helper_deducted || 0)) + ((agencyData?.diamond_balance || 0) - (result.agency_deducted || 0)));
        await checkAndNotifyLowBalance(currentWallet, currentUser.id);
      }
      
      setShowTransferModal(false);
      setTransferSearchQuery("");
      setTransferAmount("");
      setSearchedUser(null);
    } catch (error: any) {
      console.error('[Transfer] Error:', error);
      recordClientError({ label: "Profile.currentWallet", message: error instanceof Error ? error.message : String(error) });
      toast({ title: "Transfer Failed", description: error.message, variant: "destructive" });
    } finally {
      setTransferProcessing(false);
    }
  };

  // Transfer diamonds to agency - ATOMIC via RPC
  const executeTransferToAgency = async () => {
    if (!searchedAgency || !currentUser) return;
    
    const isAgencyOwner = !!agencyData;
    const amount = Math.floor(parseInt(transferAmount) || 0);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: "Invalid Amount", description: "Please enter a valid diamond amount", variant: "destructive" });
      return;
    }
    
    setTransferProcessing(true);
    try {
      const latestBalances = await refreshTransferBalances();
      console.log('[AgencyTransfer] DEBUG: latestBalances =', JSON.stringify(latestBalances), 'currentUser.id =', currentUser.id);
      if (amount > latestBalances.total) {
        throw new Error(`Insufficient balance. Available: ${latestBalances.total.toLocaleString()}`);
      }

      const senderType = latestBalances.agencyBalance >= amount ? 'agency_to_agency' 
        : latestBalances.traderWallet >= amount ? 'trader_to_agency' 
        : 'agency_to_agency';

      console.log('[AgencyTransfer] DEBUG: senderType =', senderType, 'targetAgencyId =', searchedAgency.id, 'amount =', amount);
      const { data, error } = await supabase.rpc('helper_transfer_diamonds_to_agency', {
        _sender_id: currentUser.id,
        _target_agency_id: searchedAgency.id,
        _amount: amount,
        _sender_type: senderType
      });
      console.log('[AgencyTransfer] DEBUG: RPC response =', JSON.stringify(data), 'error =', error);

      if (error) throw error;
      
      const result = data as any;
      if (!result?.success) {
        throw new Error(result?.error || 'Transfer failed');
      }

      // Update local state
      if (result.agency_deducted > 0 && agencyData) {
        setAgencyData(prev => prev ? { ...prev, diamond_balance: (prev.diamond_balance || 0) - result.agency_deducted } : null);
      }
      if (result.helper_deducted > 0) {
        setTraderWallet(prev => prev - result.helper_deducted);
      }

      toast({ 
        title: "Transfer Successful! ✅", 
        description: `${amount.toLocaleString()} 💎 sent to ${searchedAgency.name}` 
      });

      // Check low balance warning on combined trader wallet balance
      const currentWallet = Math.max(0, (traderWallet - (result.helper_deducted || 0)) + ((agencyData?.diamond_balance || 0) - (result.agency_deducted || 0)));
      await checkAndNotifyLowBalance(currentWallet, currentUser.id);
      
      setShowTransferModal(false);
      setTransferSearchQuery("");
      setTransferAmount("");
      setSearchedAgency(null);
    } catch (error: any) {
      console.error('[Transfer Agency] Error:', error);
      recordClientError({ label: "Profile.currentWallet", message: error instanceof Error ? error.message : String(error) });
      toast({ title: "Transfer Failed", description: error.message, variant: "destructive" });
    } finally {
      setTransferProcessing(false);
    }
  };

  // Determine if this is a host - hosts use host_level, users use user_level
  const isProfileHost = profile?.is_host === true;
  const isProfileFemale = profile?.gender === 'female' || profile?.gender === 'Female';
  // Visual host persona: every female account is rendered as a host from sign-up.
  // Actual host privileges (receiving calls, withdrawing earnings) still require is_host=true,
  // which only flips after face verification approval.
  const isFemaleHost = isProfileFemale; // host UI shown for ALL female accounts
  
  // Use the correct level from database based on user type
  // Female (host persona) show host_level, all others show user_level
  // CRITICAL: Fall back to cached userLevel to prevent "level 0 flash" during navigation
  const displayLevel = useMemo(() => {
    if (isFemaleHost) {
      return Math.max(resolvedUserLevel ?? profile?.host_level ?? userLevel ?? 0, 0);
    }

    return Math.max(resolvedUserLevel ?? profile?.user_level ?? userLevel ?? 1, 1);
  }, [isFemaleHost, resolvedUserLevel, profile?.host_level, profile?.user_level, userLevel]);
  
  useEffect(() => {
    setUserLevel(isFemaleHost ? Math.max(resolvedUserLevel ?? 0, 0) : Math.max(resolvedUserLevel ?? 1, 1));
    setNextLevel(Math.max(resolvedNextLevel ?? ((resolvedUserLevel ?? 1) + 1), (resolvedUserLevel ?? 1) + 1));
    setLevelProgress(Math.min(Math.max(resolvedLevelProgress ?? 0, 0), 100));
  }, [resolvedUserLevel, resolvedNextLevel, resolvedLevelProgress, isFemaleHost]);

  // Check if user should see Agency Center
  const isAgencyOwner = profile?.is_agency_owner || false;
  const isHost = profile?.is_host || false;             // actual approved host (face verified)
  const isHostPersona = isHost || isProfileFemale;       // visual host UI for all female accounts
  const hasAgency = profile?.agency_id || false;
  const showAgencyCenter = isAgencyOwner || isHostPersona || hasAgency;

  // Check if user is female and not already an approved host
  const isFemale = isProfileFemale;
  const canApplyForHost = isFemale && !isHost && isOwnProfile;

  // Check face verification status
  const isFaceVerified = (profile as any)?.is_face_verified;
  const [faceVerificationPending, setFaceVerificationPending] = useState(false);

  // Open Call Price Modal - fetch settings and current rate
  const handleOpenCallPriceModal = async () => {
    try {
      // Fetch admin call rate settings
      const { data: settings } = await supabase
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', 'call_rates')
        .maybeSingle();
      
      if (settings?.setting_value) {
        const settingsValue = parseCallRateSettings(settings.setting_value);
        setCallRateSettings(settingsValue);
        setCallRate(resolveEffectiveCallRate({
          settings: settingsValue,
          hostLevel: (profile as any)?.host_level,
          customRate: (profile as any)?.call_rate_per_minute,
        }));
      } else {
        // Fallback if no settings found
        const currentRate = (profile as any)?.call_rate_per_minute || 1000;
        setCallRate(currentRate);
      }
      
      setShowCallPriceModal(true);
    } catch (error) {
      console.error('Error fetching call rate settings:', error);
      recordClientError({ label: "Profile.currentRate", message: error instanceof Error ? error.message : String(error) });
      toast({ title: "Failed to load settings", variant: "destructive" });
    }
  };

  // Save Call Rate
  const handleSaveCallRate = async () => {
    if (!profile?.id) return;
    
    setSavingCallRate(true);
    try {
      // Get admin limits - but level rates should always be valid
      const minRate = callRateSettings?.min_rate || 30;
      const maxRate = callRateSettings?.max_rate || 10000;
      
      // Use the selected callRate directly - level rates are pre-validated by admin
      // Only apply min/max limits if it's a custom rate, not a level-based rate
      let finalRate = callRate;
      
      // Check if this is a level-based rate (should not be clamped)
      const levelRates = callRateSettings?.level_rates || [];
      const isLevelRate = levelRates.some((lr: any) => lr.rate === callRate);
      
      // Only apply min/max clamping for non-level custom rates
      if (!isLevelRate) {
        if (finalRate < minRate) finalRate = minRate;
        if (finalRate > maxRate) finalRate = maxRate;
      }
      
      const { error } = await supabase
        .from('profiles')
        .update({ call_rate_per_minute: finalRate })
        .eq('id', profile.id);
      
      if (error) throw error;
      
      // Update local profile state
      setProfile({ ...profile, call_rate_per_minute: finalRate });
      
      // Calculate beans for toast message
      const commissionPercent = callRateSettings?.host_commission_percent || 55;
      const beansAmount = Math.floor(finalRate * commissionPercent / 100);
      
      setShowCallPriceModal(false);
      
      toast({ title: "Call price updated!", description: `New rate: ${beansAmount} Beans/min` });
    } catch (error: any) {
      console.error('Error saving call rate:', error);
      recordClientError({ label: "Profile.beansAmount", message: error instanceof Error ? error.message : String(error) });
      toast({ title: "Failed to save", description: error.message, variant: "destructive" });
    } finally {
      setSavingCallRate(false);
    }
  };

  // Get level-based suggested rate
  // CRITICAL: When host_level is 0 (after beans transfer), use Level 1 rate
  const getLevelSuggestedRate = () => {
    if (!callRateSettings?.level_rates) return callRateSettings?.default_rate || 2000;
    const effectiveLevel = getEffectiveHostLevel((profile as any)?.host_level);
    const levelRate = callRateSettings.level_rates.find((lr: any) => lr.level === effectiveLevel);
    return levelRate?.rate || callRateSettings?.default_rate || 2000;
  };

  const menuItems = [
    // Go Offline button - ONLY for hosts
    { 
      icon: Power, 
      label: "Go Offline", 
      path: "", 
      iconBg: "bg-red-100",
      iconColor: "text-red-500",
      show: isOwnProfile && profile?.is_host === true,
      onClick: async () => {
        if (!currentUser?.id) return;
        const confirmed = window.confirm("Are you sure you want to go offline? You will be logged out and won't receive calls or messages.");
        if (confirmed) {
          await goOfflineManually(currentUser.id);
          await supabase.auth.signOut({ scope: 'local' });
          navigate('/auth');
        }
      }
    },
    // Messages always at top for all users
    { 
      icon: MessageCircle, 
      label: "Messages", 
      path: "/chat", 
      badge: (globalUnread.messages + notificationCount) > 0 ? String(globalUnread.messages + notificationCount) : undefined,
      iconBg: "bg-pink-100",
      iconColor: "text-pink-500",
      show: isOwnProfile
    },
    { 
      icon: UserCheck, 
      label: "Face Verification", 
      path: faceVerificationPending ? "" : "/face-verification", 
      rightText: faceVerificationPending ? "Under Review" : "Required",
      highlight: !faceVerificationPending,
      iconBg: faceVerificationPending ? "bg-blue-100" : "bg-amber-100",
      iconColor: faceVerificationPending ? "text-blue-500" : "text-amber-500",
      show: isOwnProfile && !isFaceVerified, // Hide completely after approved
      onClick: faceVerificationPending ? () => {
        toast({ title: "Under Review", description: "Your face verification is being reviewed by our team. Please wait." });
      } : undefined,
    },
    { 
      icon: PhoneCall, 
      label: "Call Price Update", 
      action: "call_price",
      rightText: (() => {
        // If settings not loaded yet, show loading indicator
        if (!callRateSettings) return "Loading...";
        
        const hostLevel = getEffectiveHostLevel((profile as any)?.host_level);
        const levelRates = callRateSettings?.level_rates || [];
        const levelRate = levelRates.find((lr: any) => lr.level === hostLevel);
        const diamondRate = resolveEffectiveCallRate({
          settings: callRateSettings,
          hostLevel: (profile as any)?.host_level,
          customRate: (profile as any)?.call_rate_per_minute,
        }) || (levelRate?.rate || callRateSettings?.default_rate || 2000);
        const commissionPercent = callRateSettings?.host_commission_percent || 55;
        const beansPerMin = Math.floor(diamondRate * commissionPercent / 100);
        return `${beansPerMin} Beans/min`;
      })(),
      highlight: true,
      iconBg: "bg-gradient-to-r from-green-500 to-emerald-500",
      iconColor: "text-white",
      show: isOwnProfile && isFemale // Female host persona — visible from sign-up
    },
    { 
      icon: Star, 
      label: "Host Registration", 
      path: "/host-verification", 
      rightText: "Become a Host",
      highlight: true,
      iconBg: "bg-gradient-to-r from-pink-500 to-rose-500",
      iconColor: "text-white",
      show: canApplyForHost
    },
    { 
      icon: Crown, 
      label: "My Level", 
      path: "/level",
      extra: (
        <div className="flex items-center gap-2">
          <FloatingLevelIcon level={userLevel} size="sm" />
          <span className="text-sm text-muted-foreground">Lv{userLevel}</span>
          {userVIPTier > 0 && <VIPBadge tier={userVIPTier} size="xs" showLabel={false} />}
          <Progress value={levelProgress} className="w-12 h-2" />
          <span className="text-sm text-muted-foreground">Lv{nextLevel}</span>
        </div>
      ),
      iconBg: "bg-amber-100",
      iconColor: "text-amber-500",
      show: isOwnProfile
    },
    { 
      icon: Gem, 
      label: "VIP Membership", 
      path: "/vip",
      extra: userVIPTier > 0 ? (
        <VIPBadge tier={userVIPTier} size="sm" />
      ) : (
        <span className="text-xs text-purple-400">Upgrade Now</span>
      ),
      iconBg: "bg-gradient-to-r from-purple-500 to-pink-500",
      iconColor: "text-white",
      show: isOwnProfile
    },
    { 
      icon: Phone, 
      label: "Call History", 
      path: "/call-history",
      iconBg: "bg-green-100",
      iconColor: "text-green-500",
      show: isOwnProfile && isFemale
    },
    { 
      icon: Sparkles, 
      label: "Shop", 
      path: "/shop",
      rightText: "Frames & Effects",
      highlight: true,
      iconBg: "bg-gradient-to-r from-purple-500 to-pink-500",
      iconColor: "text-white",
      show: isOwnProfile
    },
    { 
      icon: Wallet, 
      label: "Host Dashboard",
      path: "/host-dashboard",
      rightText: "Earnings",
      highlight: true,
      iconBg: "bg-emerald-100",
      iconColor: "text-emerald-600",
      show: isOwnProfile && isHost && !isFemale
    },
    { 
      icon: Building2, 
      label: isInActiveAgency ? "Agency Details" : "Join Agency", 
      path: isInActiveAgency ? "/agency-details" : "/join-agency",
      rightText: isInActiveAgency ? "My Agency" : "Apply",
      highlight: true,
      iconBg: isInActiveAgency ? "bg-gradient-to-r from-green-500 to-emerald-500" : "bg-gradient-to-r from-pink-500 to-rose-500",
      iconColor: "text-white",
      show: isOwnProfile && isFemale // Female host persona — visible from sign-up
    },
    { 
      icon: Building2, 
      label: isAgencyOwner ? "Agency Dashboard" : "Agency Center", 
      path: isAgencyOwner ? "/agency-dashboard" : "/agency",
      rightText: isAgencyOwner ? "My Agency" : "Agent Rank",
      highlight: true,
      iconBg: isAgencyOwner ? "bg-gradient-to-r from-purple-500 to-indigo-500" : "bg-purple-100",
      iconColor: isAgencyOwner ? "text-white" : "text-purple-600",
      show: isOwnProfile && showAgencyCenter && !isFemale
    },
    { 
      icon: Mail, 
      label: "My Invitation", 
      path: "/invitation",
      rightText: "Get Rewards",
      iconBg: "bg-purple-100",
      iconColor: "text-purple-500",
      show: isOwnProfile
    },
    { 
      icon: ClipboardList, 
      label: "My Tasks", 
      path: "/tasks",
      rightText: hasUnclaimedReward ? "New Reward" : "",
      hasNotification: hasUnclaimedReward,
      iconBg: "bg-blue-100",
      iconColor: "text-blue-500",
      show: isOwnProfile
    },
    { 
      icon: User, 
      label: "My Profile", 
      path: "/edit-profile",
      iconBg: "bg-indigo-100",
      iconColor: "text-indigo-500",
      show: isOwnProfile
    },
    { 
      icon: Settings, 
      label: "Settings", 
      path: "/settings",
      iconBg: "bg-gray-100",
      iconColor: "text-gray-500",
      show: isOwnProfile
    },
    { 
      icon: MessageCircle, 
      label: "Priority Support", 
      path: "/settings/customer-service",
      rightText: "Level 6+",
      highlight: true,
      iconBg: "bg-gradient-to-r from-amber-500 to-orange-500",
      iconColor: "text-white",
      show: isOwnProfile && userLevel >= 6
    },
  ].filter(item => item.show);

  // Redirect to auth if not logged in and viewing own profile
  useEffect(() => {
    if (!loading || currentUser || !isOwnProfile) return;

    let cancelled = false;

    void getCachedUser().then((cachedUser) => {
      if (cancelled || cachedUser) return;
      navigate("/auth");
    });

    return () => {
      cancelled = true;
    };
  }, [loading, currentUser, isOwnProfile, navigate]);

  useEffect(() => {
    if (loading || profile || !isOwnProfile || !currentUser || profileCreationAttemptedRef.current) return;

    profileCreationAttemptedRef.current = true;
    let cancelled = false;

    const handleRetryProfileCreation = async () => {
      setLoading(true);
      try {
        const displayName = currentUser.user_metadata?.full_name ||
          currentUser.user_metadata?.name ||
          (currentUser.email?.includes('@meri.local') ? null : currentUser.email?.split('@')[0]) ||
          `User${Math.random().toString(36).substring(2, 8)}`;

        const avatarUrl = currentUser.user_metadata?.avatar_url ||
          currentUser.user_metadata?.picture || null;

        const appUid = String(Math.floor(1000000000 + Math.random() * 9000000000));

        const { error } = await supabase
          .from("profiles")
          .insert({
            id: currentUser.id,
            display_name: displayName,
            username: currentUser.email?.includes('@meri.local') ? null : currentUser.email?.split('@')[0] || null,
            avatar_url: avatarUrl,
            app_uid: appUid,
            gender: currentUser.user_metadata?.gender || 'male',
            last_seen: new Date().toISOString(),
          });

        if (!error) {
          const { data: newProfile } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", currentUser.id)
            .maybeSingle();

          if (!cancelled && newProfile) {
            setProfile(newProfile);
            toast({ title: "Profile created successfully!" });
          }
        } else if (!cancelled) {
          console.error("[Profile] Retry profile creation failed:", error);
          recordClientError({ label: "Profile.appUid", message: error instanceof Error ? error.message : String(error) });
          toast({ title: "Failed to create profile", description: error.message, variant: "destructive" });
        }
      } catch (e) {
        if (!cancelled) {
          console.error("[Profile] Retry error:", e);
          recordClientError({ label: "Profile.appUid", message: e instanceof Error ? e.message : String(e) });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void handleRetryProfileCreation();

    return () => {
      cancelled = true;
    };
  }, [loading, profile, isOwnProfile, currentUser, toast]);

  if (loading && !profile) {
    return (
      <div
        className="mobile-page flex flex-col"
        style={{
          background:
            'radial-gradient(ellipse at top, hsl(280 40% 14%) 0%, hsl(260 30% 8%) 55%, hsl(240 20% 4%) 100%)',
        }}
      >
        <div className="h-48 bg-white/5 animate-pulse" />
        <div className="px-4 -mt-12 space-y-3">
          <div className="w-24 h-24 rounded-full bg-white/10 border-4 border-white/5 animate-pulse" />
          <div className="h-5 w-32 bg-white/10 rounded animate-pulse" />
          <div className="h-4 w-48 bg-white/10 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (!currentUser && isOwnProfile) {
    return null;
  }

  if (!profile && isOwnProfile && currentUser) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-purple-100 to-background p-6">
        <LoadingSpinner />
        <p className="text-muted-foreground text-sm mt-4">Creating your profile...</p>
      </div>
    );
  }

  if (!profile) {
    const handleLogoutAndReregister = async () => {
      localStorage.removeItem('meri_device_id');
      localStorage.removeItem('meri_device_account');
      localStorage.removeItem('meri_last_user');
      localStorage.removeItem('meri_pending_referral');
      
      const { clearNativeSession } = await import('@/utils/nativeSessionStorage');
      await clearNativeSession();
      
      localStorage.setItem('meri_manual_logout', 'true');
      await supabase.auth.signOut({ scope: 'local' });
      navigate('/auth');
    };

    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-purple-100 to-background p-6">
        <User className="w-16 h-16 text-muted-foreground mb-4" />
        <h1 className="text-xl font-bold mb-2">Profile not found</h1>
        <p className="text-muted-foreground text-sm mb-4 text-center">
          Your profile data was not found. Please create a new account.
        </p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => navigate(-1)}>
            Go Back
          </Button>
          <Button 
            className="bg-gradient-to-r from-purple-500 to-pink-500 text-white"
            onClick={handleLogoutAndReregister}
          >
            Create New Account
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-[#0c0515] overflow-hidden">
      {/* Premium Background — rich layered nebula effect */}
      <div className="fixed inset-0 pointer-events-none z-0">
        {/* Deep base gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#1a0533] via-[#0f0720] to-[#080312]" />
        {/* Top-left warm accent */}
        <div className="absolute -top-10 -left-10 w-72 h-72 bg-purple-700/20 rounded-full blur-[100px]" />
        {/* Top-right cool accent */}
        <div className="absolute top-10 -right-16 w-64 h-64 bg-indigo-600/15 rounded-full blur-[90px]" />
        {/* Center subtle pink */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-80 h-48 bg-fuchsia-700/8 rounded-full blur-[80px]" />
        {/* Bottom subtle glow */}
        <div className="absolute bottom-20 left-1/4 w-56 h-56 bg-purple-900/20 rounded-full blur-[100px]" />
        {/* Fine grain texture overlay */}
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")' }} />
      </div>

      {/* Back Button - Fixed at top, never scrolls away */}
      <div className="fixed top-3 left-3 z-10 safe-area-top">
        <Button
          size="icon"
          variant="ghost"
          className="w-10 h-10 rounded-2xl bg-white/5 backdrop-blur-xl hover:bg-white/10 border border-white/10 shadow-lg shadow-black/20"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="w-5 h-5 text-white/80" />
        </Button>
      </div>

      {/* Scrollable Content */}
      <main 
        className="flex-1 overflow-y-auto overscroll-contain relative z-[1]"
        style={{ 
          WebkitOverflowScrolling: 'touch',
          paddingBottom: 'calc(var(--content-bottom-padding) + 40px)'
        }}
      >

      {/* Top-Up Campaign Banner */}
      

      {/* Header Section - Premium Design */}
      <div className="relative pt-14 pb-5 px-4 flex flex-col items-center">
        {/* Avatar with Level-Based Frame */}
        <div 
          className="relative mb-3 cursor-pointer group"
          onClick={() => navigate(isOwnProfile ? `/profile-detail/${profileId}` : `/profile-detail/${profileId}`)}
        >
          {/* Avatar with Level-Based SVGA Frame */}

          {/* Avatar with Level-Based SVGA Frame */}
          <AvatarWithFrame 
            userId={profileId}
            src={profile?.avatar_url}
            name={resolvedProfileName || "U"}
            level={displayLevel} 
            size="xl"
            isHost={isHostPersona}
            showAnimation={true}
            showGlow={displayLevel >= 10}
          />
          
          {/* Verified Badge - Premium - Bottom Right Position */}
          {(profile?.is_verified || isFaceVerified) && (
            <div className="absolute -bottom-1 -right-1 z-40">
              <div className="w-7 h-7 rounded-full bg-gradient-to-r from-blue-400 to-cyan-400 border-2 border-[#1a0a2e] flex items-center justify-center shadow-lg shadow-cyan-500/40">
                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
          )}
        </div>

        {/* Name - Elegant Typography */}
        <h1 className="text-xl font-bold text-white tracking-wide drop-shadow-lg">
          {resolvedProfileName}
        </h1>
        
        {/* UID Badge - Glass Morphism */}
        {profile?.app_uid && (
          <button 
            className="mt-2 flex items-center gap-2 bg-white/5 hover:bg-white/10 backdrop-blur-xl px-4 py-2 rounded-full transition-all border border-white/10 shadow-lg shadow-black/10"
            onClick={() => {
              navigator.clipboard.writeText(profile.app_uid);
              toast({ title: "UID Copied!", description: profile.app_uid });
            }}
          >
            <span className="w-5 h-5 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 flex items-center justify-center shadow-md">
              <span className="text-white font-bold text-[8px]">ID</span>
            </span>
            <span className="font-semibold text-sm text-white/90">{profile.app_uid}</span>
          </button>
        )}
        
        {/* Location Badges - Premium Pills */}
        {/* Country ALWAYS visible, City hidden if profile owner has hide_location enabled */}
        <div className="flex items-center justify-center gap-2 flex-wrap mt-4 px-3">
          {/* Country - ALWAYS visible */}
          <div className="flex items-center gap-1.5 bg-emerald-500/15 border border-emerald-500/30 px-3 py-1.5 rounded-full backdrop-blur-sm shadow-md shadow-emerald-500/10">
            <span className="text-base">{geoLocation.countryFlag || profile?.country_flag || "🌍"}</span>
            <span className="font-semibold text-emerald-400 text-xs">
              {geoLocation.country || profile?.country_name || ""}
            </span>
          </div>

          {/* City - Only show if own profile OR profile owner hasn't hidden location */}
          {(isOwnProfile || !profile?.hide_location) && (
            <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full backdrop-blur-sm shadow-md">
              <MapPin className="w-3.5 h-3.5 text-white/60" />
              <span className="font-medium text-white/70 text-xs">
                {geoLocation.city || "Location"}
              </span>
            </div>
          )}

          <div className="flex items-center gap-1.5 bg-orange-500/15 border border-orange-500/30 px-3 py-1.5 rounded-full backdrop-blur-sm shadow-md shadow-orange-500/10">
            <span className="font-semibold text-orange-400 text-xs">Bengali</span>
          </div>
        </div>

        {/* Stats - Premium Cards */}
        <div 
          className="flex gap-8 mt-5 cursor-pointer hover:opacity-90 transition-opacity"
          onClick={() => isOwnProfile && navigate('/following')}
        >
          <div className="text-center">
            <p className="text-2xl font-bold text-white drop-shadow-lg">{stats.friendsCount}</p>
            <p className="text-xs text-white/50 font-medium">Friends</p>
          </div>
          <div className="w-px h-10 bg-gradient-to-b from-transparent via-white/20 to-transparent" />
          <div className="text-center">
            <p className="text-2xl font-bold text-white drop-shadow-lg">{stats.followingCount}</p>
            <p className="text-xs text-white/50 font-medium">Following</p>
          </div>
          <div className="w-px h-10 bg-gradient-to-b from-transparent via-white/20 to-transparent" />
          <div className="text-center">
            <p className="text-2xl font-bold text-white drop-shadow-lg">{stats.followersCount}</p>
            <p className="text-xs text-white/50 font-medium">Followers</p>
          </div>
        </div>

        {/* Action Buttons for other profiles - Premium Style */}
        {!isOwnProfile && currentUser && (
          <div className="flex gap-2 mt-4">
            <Button
              size="sm"
              variant={isFollowing ? "outline" : "default"}
              className={cn(
                "h-9 text-xs px-4 rounded-full font-semibold transition-all shadow-lg",
                isFollowing 
                  ? "border-purple-500/50 text-purple-400 hover:bg-purple-500/10" 
                  : "bg-gradient-to-r from-purple-500 to-pink-500 shadow-purple-500/30 hover:shadow-purple-500/50"
              )}
              onClick={handleFollow}
              disabled={followLoading}
            >
              {isFollowing ? <UserCheck className="w-3.5 h-3.5 mr-1" /> : <UserPlus className="w-3.5 h-3.5 mr-1" />}
              {isFollowing ? "Following" : "Follow"}
            </Button>
            {profile?.is_host && profile?.gender === 'female' && (
              <Button 
                size="sm" 
                className="h-9 text-xs px-4 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 font-semibold shadow-lg shadow-green-500/30" 
                onClick={handleCall}
              >
                <Phone className="w-3.5 h-3.5 mr-1" />
                Call
              </Button>
            )}
            <Button 
              size="sm" 
              variant="outline" 
              className="h-9 text-xs px-4 rounded-full border-pink-500/50 text-pink-400 hover:bg-pink-500/10 font-semibold" 
              onClick={() => navigate(`/chat?user=${profileId}`)}
            >
              <MessageCircle className="w-3.5 h-3.5 mr-1" />
              Message
            </Button>
          </div>
        )}
      </div>

      {/* Cards Section - Ultra Compact */}
      {isOwnProfile && (
        <div className="px-2 space-y-2">
          {/* Diamonds & Beans Cards - Compact */}
          <div className="grid grid-cols-2 gap-2">
            {/* Diamonds Card */}
            <button 
              onClick={() => navigate("/recharge")}
              className="group relative"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-purple-600/30 to-indigo-600/30 rounded-xl translate-y-0.5 blur-sm" />
              <div className="relative bg-gradient-to-br from-purple-500 via-purple-600 to-indigo-700 rounded-xl p-2 overflow-hidden shadow-lg group-active:scale-95 transition-all">
                <div className="absolute inset-0 opacity-30">
                  <div className="absolute top-0 right-0 w-12 h-12 bg-gradient-to-br from-white/20 to-transparent rounded-full -translate-y-4 translate-x-4" />
                </div>
                
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-0.5">
                    <p className="text-purple-100 font-medium text-[8px]">My Diamonds</p>
                    <span className="text-[6px] bg-white/20 backdrop-blur-sm text-white px-1 py-0.5 rounded-full font-medium">
                      Top Up
                    </span>
                  </div>
                  <p className="text-xl font-bold text-white drop-shadow-lg">
                     {resolvedDiamondBalance.toLocaleString()}
                  </p>
                </div>
                
                <div className="absolute right-1 bottom-1">
                  <Diamond3DIcon size={28} />
                </div>
              </div>
            </button>
            
            {/* Beans Card - Clickable for hosts and agency owners */}
            <button 
              onClick={async () => {
                // Agency owners get exchange modal
                if (isAgencyOwner) {
                  try {
                    // Fetch agency data
                    const { data: agency } = await supabase
                      .from('agencies')
                      .select('id, name, diamond_balance, wallet_balance')
                      .eq('owner_id', currentUser?.id)
                      .eq('is_active', true)
                      .maybeSingle();
                    
                    if (agency) {
                      setAgencyData({
                        id: agency.id,
                        name: agency.name,
                        diamond_balance: agency.diamond_balance || 0,
                        beans_balance: agency.wallet_balance || 0
                      });
                      
                      // Fetch exchange settings from correct key 'coin_exchange'
                      const { data: settings } = await supabase
                        .from('app_settings')
                        .select('setting_value')
                        .eq('setting_key', 'coin_exchange')
                        .maybeSingle();
                      
                      if (settings?.setting_value) {
                        const settingVal = settings.setting_value as any;
                        setAgencyExchangeSettings({
                          beans_to_diamonds_rate: settingVal.beans_to_diamonds_rate ?? 1,
                          exchange_fee_percent: settingVal.exchange_fee_percent ?? 25,
                          min_exchange_amount: settingVal.min_exchange_amount ?? 100000
                        });
                      }
                      
                      setShowAgencyExchangeModal(true);
                    } else {
                      toast({ title: "Agency not found", variant: "destructive" });
                    }
                  } catch (error) {
                    console.error('Error fetching agency:', error);
                    recordClientError({ label: "Profile.settingVal", message: error instanceof Error ? error.message : String(error) });
                    toast({ title: "Failed to load exchange", variant: "destructive" });
                  }
                } 
                // Hosts: check if they are in an agency first
                else if (profile?.is_host) {
                  try {
                    const { data: { user: currentUser } } = await supabase.auth.getUser();
                    if (currentUser) {
                      const { data: agencyMembership } = await supabase
                        .from('agency_hosts')
                        .select('id, status')
                        .eq('host_id', currentUser.id)
                        .eq('status', 'active')
                        .maybeSingle();

                      if (agencyMembership) {
                        // Host is in an agency - show transfer history
                        navigate("/host-transfer-history");
                      } else {
                        // Host is NOT in an agency - show join agency message
                        toast({
                          title: "Join an Agency",
                          description: "You need to join an agency before you can withdraw your salary. Please join an agency first.",
                          variant: "destructive",
                        });
                        navigate("/join-agency");
                      }
                    }
                  } catch (error) {
                    console.error('Error checking agency membership:', error);
                    recordClientError({ label: "Profile.settingVal", message: error instanceof Error ? error.message : String(error) });
                  }
                }
                 // Regular users (not host, not agency) get user beans exchange modal
                 else if (!profile?.is_host && !profile?.is_agency_owner) {
                   setShowUserBeansExchangeModal(true);
                 }
              }}
              className="group relative w-full text-left"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-amber-500/30 to-orange-500/30 rounded-xl translate-y-0.5 blur-sm" />
              <div className="relative bg-gradient-to-br from-amber-400 via-yellow-400 to-orange-400 rounded-xl p-2 overflow-hidden shadow-lg group-active:scale-95 transition-transform">
                <div className="absolute inset-0 opacity-40">
                  <div className="absolute top-0 right-0 w-12 h-12 bg-gradient-to-br from-white/30 to-transparent rounded-full -translate-y-4 translate-x-4" />
                </div>
                
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-0.5">
                    <p className="text-amber-800 font-medium text-[8px]">My Beans</p>
                     {/* Show exchange badge for regular users, arrow for hosts/agency */}
                     {!profile?.is_host && !profile?.is_agency_owner ? (
                       <span className="text-[6px] bg-amber-700/80 text-amber-100 px-1 py-0.5 rounded-full font-medium">
                         Exchange
                       </span>
                     ) : ((isHostPersona && isFemale) || isAgencyOwner) && (
                      <ChevronRight className="w-3 h-3 text-amber-800/60" />
                    )}
                  </div>
                  <p className={`text-xl font-bold drop-shadow-sm ${beans < 0 ? 'text-red-700' : 'text-amber-900'}`}>{beans.toLocaleString()}</p>
                </div>
                
                <div className="absolute right-1 bottom-1">
                  <Beans3DIcon size={28} />
                </div>
              </div>
            </button>
          </div>

          {/* Trader Wallet Card for Diamond Traders - Opens Transfer Modal directly */}
          {isCoinTrader && !isAgencyOwner && (
            <button 
              onClick={() => setShowTransferModal(true)}
              className="w-full group relative"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/30 to-teal-500/30 rounded-xl translate-y-0.5 blur-sm" />
              <div className="relative bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600 rounded-xl p-2.5 overflow-hidden shadow-lg group-hover:shadow-xl transition-all duration-300 group-active:scale-95">
                <div className="absolute inset-0 opacity-30">
                  <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-white/20 to-transparent rounded-full -translate-y-4 translate-x-4" />
                </div>
                
                <div className="relative z-10 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <p className="text-white font-semibold text-sm">Trader Wallet</p>
                      <span className="text-[7px] bg-white/20 backdrop-blur-sm text-white px-1 py-0.5 rounded-full font-medium">
                        Diamond Trader
                      </span>
                    </div>
                    <p className="text-xl font-bold text-white drop-shadow-lg">
                      {(traderWallet + (agencyData?.diamond_balance || 0)).toLocaleString()} 💎
                    </p>
                    <p className="text-[8px] text-emerald-100 mt-0.5 flex items-center gap-1">
                      <Send className="w-2.5 h-2.5" />
                      Tap to transfer to User or Agency
                    </p>
                  </div>
                  
                  <div className="bg-white/20 backdrop-blur-sm rounded-xl p-2">
                    <Wallet className="w-5 h-5 text-white" />
                  </div>
                </div>
              </div>
            </button>
          )}

          {/* Agency Trader Wallet - For Agency Owners */}
          {isAgencyOwner && agencyData && (
            <button 
              onClick={() => setShowTransferModal(true)}
              className="w-full group relative"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/30 to-pink-500/30 rounded-xl translate-y-0.5 blur-sm" />
              <div className="relative bg-gradient-to-br from-purple-500 via-pink-500 to-rose-500 rounded-xl p-2.5 overflow-hidden shadow-lg group-hover:shadow-xl transition-all duration-300 group-active:scale-95">
                <div className="absolute inset-0 opacity-30">
                  <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-white/20 to-transparent rounded-full -translate-y-4 translate-x-4" />
                </div>
                
                <div className="relative z-10 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <p className="text-white font-semibold text-sm">Trader Wallet</p>
                      <span className="text-[7px] bg-white/20 backdrop-blur-sm text-white px-1 py-0.5 rounded-full font-medium">
                        Agency
                      </span>
                    </div>
                    <p className="text-xl font-bold text-white drop-shadow-lg">
                      {selfRechargeSourceBalance.toLocaleString()} 💎
                    </p>
                    <p className="text-[8px] text-pink-100 mt-0.5 flex items-center gap-1">
                      <Send className="w-2.5 h-2.5" />
                      Tap to transfer to User or Agency
                    </p>
                  </div>
                  
                  <div className="bg-white/20 backdrop-blur-sm rounded-xl p-2">
                    <Wallet className="w-5 h-5 text-white" />
                  </div>
                </div>
              </div>
            </button>
          )}

          {/* Menu Items - Compact */}
          {menuItems.length > 0 && (
            <div className="bg-card/80 backdrop-blur-xl rounded-xl overflow-hidden shadow-elevated border border-white/10 mt-2">
              {menuItems.map((item, index) => (
                <button
                  key={index}
                  onClick={() => {
                    if ((item as any).onClick) {
                      (item as any).onClick();
                    } else if ((item as any).action === 'call_price') {
                      handleOpenCallPriceModal();
                    } else if (item.path) {
                      navigate(item.path);
                    }
                  }}
                  className="w-full flex items-center justify-between p-2.5 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-lg ${item.iconBg} flex items-center justify-center`}>
                      <item.icon className={`w-4 h-4 ${item.iconColor}`} />
                    </div>
                    <span className={`font-medium text-sm text-white ${item.highlight ? '!text-purple-400' : ''}`}>{item.label}</span>
                    {item.highlight && (
                      <span className="px-1 py-0.5 text-[8px] bg-gradient-to-r from-orange-500 to-pink-500 text-white rounded-full font-bold">NEW</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {item.extra}
                    {item.badge && (
                      <Badge className="bg-gradient-to-r from-pink-500 to-rose-500 text-white border-0 rounded-full w-4 h-4 p-0 flex items-center justify-center text-[10px] shadow-lg shadow-pink-500/30">
                        {item.badge}
                      </Badge>
                    )}
                    {item.rightText && (
                      <span className="text-xs text-purple-400 font-medium">{item.rightText}</span>
                    )}
                    {item.hasNotification && (
                      <span className="w-1.5 h-1.5 bg-pink-500 rounded-full animate-pulse shadow-lg shadow-pink-500/50" />
                    )}
                    <ChevronRight className="w-4 h-4 text-white/40" />
                  </div>
                </button>
              ))}
            </div>
          )}

        </div>
      )}
      </main>

      {/* Bottom Navigation - Outside scroll area */}
      <BottomNavigation activeTab={activeTab} onTabChange={(path) => {
        setActiveTab(path);
        navigate(path);
      }} />

      {/* Transfer to User/Agency Modal */}
      <Dialog open={showTransferModal} onOpenChange={setShowTransferModal}>
        <DialogContent className="bg-gradient-to-b from-slate-900 to-slate-800 border-slate-700 max-w-md mx-4 rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center justify-center gap-2 text-lg">
              <Send className="w-5 h-5 text-emerald-400" />
              Transfer Diamonds
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Current Balance */}
            <div className="bg-gradient-to-r from-emerald-500/20 to-teal-500/20 rounded-2xl p-4 border border-emerald-500/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
                    <Wallet className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <span className="text-white/70 text-xs">Your Balance</span>
                    <p className="text-emerald-400 font-bold text-xl">
                      {availableTransferBalance.toLocaleString()} 💎
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <Tabs value={transferTab} onValueChange={(v) => {
              setTransferTab(v as "user" | "agency" | "self" | "history");
              setTransferSearchQuery("");
              setSearchedUser(null);
              setSearchedAgency(null);
              setTransferAmount("");
              setSelfRechargeAmount("");
              if (v === "history") {
                (async () => {
                  try {
                    setHistoryLoading(true);
                    const { data: { user: authUser } } = await supabase.auth.getUser();
                    if (!authUser) return;

                    // Load BOTH coin_transfers (Trader Wallet) AND gift_transactions (Gifts) in parallel
                    const [transfersRes, giftsSentRes, giftsRecvRes] = await Promise.all([
                      supabase
                        .from('coin_transfers')
                        .select('id, sender_id, receiver_id, amount, transfer_type, status, notes, created_at')
                        .or(`sender_id.eq.${authUser.id},receiver_id.eq.${authUser.id}`)
                        .order('created_at', { ascending: false })
                        .limit(50),
                      supabase
                        .from('gift_transactions')
                        .select('id, sender_id, receiver_id, coin_amount, created_at, gifts(name)')
                        .eq('sender_id', authUser.id)
                        .order('created_at', { ascending: false })
                        .limit(50),
                      supabase
                        .from('gift_transactions')
                        .select('id, sender_id, receiver_id, receiver_beans, coin_amount, created_at, gifts(name)')
                        .eq('receiver_id', authUser.id)
                        .order('created_at', { ascending: false })
                        .limit(50),
                    ]);

                    const transferList = (transfersRes.data || []).map((r: any) => ({
                      id: r.id,
                      sender_id: r.sender_id,
                      receiver_id: r.receiver_id,
                      amount: Number(r.amount || 0),
                      transfer_type: r.transfer_type,
                      status: r.status,
                      notes: r.notes,
                      created_at: r.created_at,
                      direction: (r.sender_id === authUser.id ? 'sent' : 'received') as 'sent' | 'received',
                      kind: 'transfer' as const,
                      currency: 'diamond' as const,
                    }));

                    const giftSentList = (giftsSentRes.data || []).map((g: any) => ({
                      id: `gs-${g.id}`,
                      sender_id: g.sender_id,
                      receiver_id: g.receiver_id,
                      amount: Number(g.coin_amount || 0),
                      transfer_type: g.gifts?.name ? `Gift: ${g.gifts.name}` : 'Gift',
                      status: 'completed',
                      notes: null,
                      created_at: g.created_at,
                      direction: 'sent' as const,
                      kind: 'gift' as const,
                      currency: 'diamond' as const,
                    }));

                    const giftRecvList = (giftsRecvRes.data || []).map((g: any) => {
                      const beans = Number(g.receiver_beans || 0);
                      return {
                        id: `gr-${g.id}`,
                        sender_id: g.sender_id,
                        receiver_id: g.receiver_id,
                        amount: beans > 0 ? beans : Number(g.coin_amount || 0),
                        transfer_type: g.gifts?.name ? `Gift: ${g.gifts.name}` : 'Gift',
                        status: 'completed',
                        notes: null,
                        created_at: g.created_at,
                        direction: 'received' as const,
                        kind: 'gift' as const,
                        currency: (beans > 0 ? 'bean' : 'diamond') as 'bean' | 'diamond',
                      };
                    });

                    const list = [...transferList, ...giftSentList, ...giftRecvList].sort(
                      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                    );

                    // Resolve counterparty names
                    const otherIds = Array.from(new Set(list.map(r => r.direction === 'sent' ? r.receiver_id : r.sender_id).filter(Boolean)));
                    if (otherIds.length > 0) {
                      const { data: profiles } = await supabase
                        .from('profiles_public')
                        .select('id, display_name, app_uid')
                        .in('id', otherIds);
                      const nameMap = new Map((profiles || []).map((p: any) => [p.id, p.display_name || p.app_uid || 'User']));
                      list.forEach((r: any) => {
                        const otherId = r.direction === 'sent' ? r.receiver_id : r.sender_id;
                        r.counterparty_name = nameMap.get(otherId) || 'User';
                      });
                    }
                    setTransferHistory(list);
                  } catch (err) {
                    console.error('[Profile] Failed to load transfer history:', err);
                    recordClientError({ label: "Profile.otherId", message: err instanceof Error ? err.message : String(err) });
                  } finally {
                    setHistoryLoading(false);
                  }
                })();
              }
            }}>
              <TabsList className="w-full bg-slate-800/80 p-1 rounded-2xl grid grid-cols-4">
                <TabsTrigger value="user" className="gap-1 rounded-xl text-[11px] data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-500 data-[state=active]:to-blue-500 data-[state=active]:text-white">
                  <User className="w-3.5 h-3.5" />
                  User
                </TabsTrigger>
                <TabsTrigger value="agency" className="gap-1 rounded-xl text-[11px] data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-pink-500 data-[state=active]:text-white">
                  <Building2 className="w-3.5 h-3.5" />
                  Agency
                </TabsTrigger>
                <TabsTrigger value="self" className="gap-1 rounded-xl text-[11px] data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-orange-500 data-[state=active]:text-white">
                  <Gem className="w-3.5 h-3.5" />
                  Self
                </TabsTrigger>
                <TabsTrigger value="history" className="gap-1 rounded-xl text-[11px] data-[state=active]:bg-gradient-to-r data-[state=active]:from-indigo-500 data-[state=active]:to-violet-500 data-[state=active]:text-white">
                  <History className="w-3.5 h-3.5" />
                  History
                </TabsTrigger>
              </TabsList>

              <TabsContent value="user" className="mt-4 space-y-4">
                {/* Search by App UID */}
                <div>
                  <Label className="text-white text-sm font-medium">Search User by App UID</Label>
                  <div className="flex gap-2 mt-2">
                    <div className="relative flex-1">
                      <Input
                        placeholder="Enter User App UID"
                        value={transferSearchQuery}
                        onChange={(e) => setTransferSearchQuery(e.target.value.toUpperCase())}
                        className="bg-slate-800/80 border-slate-600 text-white uppercase pl-10 h-12 rounded-xl"
                      />
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    </div>
                    <Button 
                      onClick={handleSearchUser}
                      disabled={transferSearching || !transferSearchQuery.trim()}
                      className="bg-gradient-to-r from-cyan-500 to-blue-500 h-12 px-5 rounded-xl"
                    >
                      {transferSearching ? (
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Search className="w-5 h-5" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* User Found */}
                {searchedUser && (
                  <div className="bg-slate-800/60 rounded-2xl p-4 border border-cyan-500/30 space-y-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="w-14 h-14 border-2 border-cyan-500">
                        <AvatarImage src={searchedUser.avatar_url} />
                        <AvatarFallback className="bg-gradient-to-br from-cyan-500 to-blue-500">
                          <User className="w-6 h-6 text-white" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <p className="text-white font-bold text-lg">{searchedUser.display_name}</p>
                        <p className="text-slate-400 text-sm">ID: {searchedUser.app_uid}</p>
                      </div>
                    </div>

                    {/* Amount Input */}
                    <div className="space-y-2">
                      <Label className="text-white text-sm font-medium">Diamond Amount</Label>
                      <Input
                        type="number"
                        placeholder="Enter amount to transfer"
                        value={transferAmount}
                        onChange={(e) => setTransferAmount(e.target.value)}
                        className="bg-slate-700/80 border-slate-600 text-white text-xl font-bold h-14 rounded-xl text-center"
                      />
                    </div>

                    <Button 
                      onClick={requestTransferToUser}
                      disabled={transferProcessing || !transferAmount || parseInt(transferAmount) <= 0}
                      className="w-full bg-gradient-to-r from-cyan-500 to-blue-500 h-12 rounded-xl text-base font-semibold"
                    >
                      {transferProcessing ? (
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Processing...
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Send className="w-5 h-5" />
                          Send {transferAmount ? parseInt(transferAmount).toLocaleString() : 0} 💎
                          <ArrowRight className="w-5 h-5" />
                        </div>
                      )}
                    </Button>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="agency" className="mt-4 space-y-4">
                {/* Search by Agency Owner UID */}
                <div>
                  <Label className="text-white text-sm font-medium">Search Agency by Owner's App UID</Label>
                  <p className="text-slate-400 text-xs mt-1 mb-2">Enter the agency owner's user ID to find their agency</p>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        placeholder="Enter Owner's App UID"
                        value={transferSearchQuery}
                        onChange={(e) => setTransferSearchQuery(e.target.value.toUpperCase())}
                        className="bg-slate-800/80 border-slate-600 text-white uppercase pl-10 h-12 rounded-xl"
                      />
                      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    </div>
                    <Button 
                      onClick={handleSearchAgency}
                      disabled={transferSearching || !transferSearchQuery.trim()}
                      className="bg-gradient-to-r from-purple-500 to-pink-500 h-12 px-5 rounded-xl"
                    >
                      {transferSearching ? (
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Search className="w-5 h-5" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Agency Found */}
                {searchedAgency && (
                  <div className="bg-slate-800/60 rounded-2xl p-4 border border-purple-500/30 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                        <Building2 className="w-7 h-7 text-white" />
                      </div>
                      <div className="flex-1">
                        <p className="text-white font-bold text-lg">{searchedAgency.name}</p>
                        <p className="text-slate-400 text-sm">Code: {searchedAgency.agency_code}</p>
                        <p className="text-purple-400 text-xs mt-0.5">
                          Owner: {searchedAgency.owner_name} ({searchedAgency.owner_uid})
                        </p>
                        <p className="text-pink-400 text-xs">Balance: {searchedAgency.diamond_balance?.toLocaleString() || 0} 💎</p>
                      </div>
                    </div>

                    {/* Amount Input */}
                    <div className="space-y-2">
                      <Label className="text-white text-sm font-medium">Diamond Amount</Label>
                      <Input
                        type="number"
                        placeholder="Enter amount to transfer"
                        value={transferAmount}
                        onChange={(e) => setTransferAmount(e.target.value)}
                        className="bg-slate-700/80 border-slate-600 text-white text-xl font-bold h-14 rounded-xl text-center"
                      />
                    </div>

                    <Button 
                      onClick={requestTransferToAgency}
                      disabled={transferProcessing || !transferAmount || parseInt(transferAmount) <= 0}
                      className="w-full bg-gradient-to-r from-purple-500 to-pink-500 h-12 rounded-xl text-base font-semibold"
                    >
                      {transferProcessing ? (
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Processing...
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Send className="w-5 h-5" />
                          Send {transferAmount ? parseInt(transferAmount).toLocaleString() : 0} 💎
                          <ArrowRight className="w-5 h-5" />
                        </div>
                      )}
                    </Button>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="self" className="mt-4 space-y-4">
                {/* Self Recharge - Trader Wallet to My Diamond Balance */}
                <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 rounded-2xl p-4 border border-amber-500/30 space-y-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
                      <Gem className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <p className="text-white font-bold">Self Recharge</p>
                      <p className="text-slate-400 text-xs">Transfer from Trader Wallet → My Diamond Balance</p>
                    </div>
                  </div>

                  <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-white/60 text-sm">Recharge Source Balance</span>
                      <span className="text-emerald-400 font-bold text-lg">
                        {selfRechargeSourceBalance.toLocaleString()} 💎
                      </span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-slate-700">
                      <span className="text-white/60 text-sm">Agency Balance</span>
                      <span className="text-purple-400 font-semibold">
                        {(agencyData?.diamond_balance || 0).toLocaleString()} 💎
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-white/60 text-sm">Trader Wallet</span>
                      <span className="text-amber-400 font-semibold">
                        {(traderWallet || 0).toLocaleString()} 💎
                      </span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-slate-700">
                      <span className="text-white/60 text-sm">My Diamond Balance</span>
                      <span className="text-cyan-400 font-bold text-lg">
                        {(profile?.coins || 0).toLocaleString()} 💎
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-white text-sm font-medium">Amount to Recharge</Label>
                    <Input
                      type="number"
                      placeholder="Enter diamond amount"
                      value={selfRechargeAmount}
                      onChange={(e) => setSelfRechargeAmount(e.target.value)}
                      className="bg-slate-700/80 border-slate-600 text-white text-xl font-bold h-14 rounded-xl text-center"
                      min="1"
                    />
                    {selfRechargeAmount && parseInt(selfRechargeAmount) > 0 && (
                      <div className="text-xs space-y-1 mt-2">
                        <p className="text-amber-400">
                          Recharge source after: {(selfRechargeSourceBalance - parseInt(selfRechargeAmount)).toLocaleString()} 💎
                        </p>
                        <p className="text-emerald-400">
                          My Balance after: {((profile?.coins || 0) + parseInt(selfRechargeAmount)).toLocaleString()} 💎
                        </p>
                      </div>
                    )}
                  </div>

                  <Button 
                    onClick={requestSelfRecharge}
                    disabled={selfRechargeProcessing || !selfRechargeAmount || parseInt(selfRechargeAmount) <= 0}
                    className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 h-12 rounded-xl text-base font-semibold"
                  >
                    {selfRechargeProcessing ? (
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Processing...
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Gem className="w-5 h-5" />
                        Recharge {selfRechargeAmount ? parseInt(selfRechargeAmount).toLocaleString() : 0} 💎 to My Balance
                      </div>
                    )}
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="history" className="mt-4 space-y-3 max-h-[420px] overflow-y-auto">
                {historyLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : transferHistory.length === 0 ? (
                  <div className="text-center py-10">
                    <History className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                    <p className="text-slate-400 text-sm">No transfer history yet</p>
                    <p className="text-slate-500 text-xs mt-1">Your coin trade transfers will appear here</p>
                  </div>
                ) : (
                  transferHistory.map((tx) => {
                    const isSent = tx.direction === 'sent';
                    const statusColor =
                      tx.status === 'completed' ? 'text-emerald-400' :
                      tx.status === 'pending' ? 'text-amber-400' :
                      tx.status === 'failed' || tx.status === 'cancelled' ? 'text-rose-400' :
                      'text-slate-400';
                    return (
                      <div key={tx.id} className="bg-slate-800/60 rounded-2xl p-3 border border-slate-700">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                              isSent ? 'bg-gradient-to-br from-rose-500/30 to-pink-500/30' : 'bg-gradient-to-br from-emerald-500/30 to-teal-500/30'
                            }`}>
                              {isSent ? (
                                <Send className="w-5 h-5 text-rose-400" />
                              ) : (
                                <ArrowRight className="w-5 h-5 text-emerald-400 -rotate-45" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-white text-sm font-semibold truncate">
                                {isSent ? 'Sent to' : 'Received from'} {tx.counterparty_name || 'User'}
                              </p>
                              <p className="text-slate-400 text-[10px]">
                                {new Date(tx.created_at).toLocaleString('en-US', {
                                  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                })}
                                {tx.transfer_type ? ` • ${tx.transfer_type}` : ''}
                              </p>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className={`text-base font-bold inline-flex items-center gap-1 justify-end ${isSent ? 'text-rose-400' : 'text-emerald-400'}`}>
                              <span>{isSent ? '−' : '+'}{tx.amount.toLocaleString()}</span>
                              {tx.currency === 'bean' ? (
                                <span className="text-base leading-none">🫘</span>
                              ) : (
                                <img
                                  src={diamondGem3D}
                                  alt="diamond"
                                  className="w-4 h-4 object-contain"
                                  style={{ background: 'transparent' }}
                                />
                              )}
                            </p>
                            <p className={`text-[10px] capitalize ${statusColor}`}>{tx.status}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </TabsContent>
            </Tabs>
          </div>
        </DialogContent>
      </Dialog>

      {/* Transfer Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-purple-500/30 max-w-sm rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white text-xl font-bold text-center flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                <Gem className="w-8 h-8 text-white" />
              </div>
              Confirm Transfer
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center space-y-3 pt-4">
              <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700">
                <p className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400">
                  {transferAmount ? parseInt(transferAmount).toLocaleString() : 0} 💎
                </p>
              </div>
              <p className="text-slate-300 text-sm">
                {pendingTransferType === "user" ? (
                  <>
                    Send to <span className="text-cyan-400 font-semibold">{searchedUser?.display_name}</span>
                    <br />
                    <span className="text-slate-500 text-xs">UID: {searchedUser?.app_uid}</span>
                  </>
                ) : pendingTransferType === "self" ? (
                  <>
                    Recharge to <span className="text-amber-400 font-semibold">My Diamond Balance</span>
                    <br />
                    <span className="text-slate-500 text-xs">From Trader Wallet → My Balance</span>
                  </>
                ) : (
                  <>
                    Send to <span className="text-purple-400 font-semibold">{searchedAgency?.name}</span>
                    <br />
                    <span className="text-slate-500 text-xs">Agency Code: {searchedAgency?.agency_code}</span>
                  </>
                )}
              </p>
              <p className="text-amber-400 text-xs font-medium">
                ⚠️ This action cannot be undone
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-3 pt-4">
            <AlertDialogCancel className="flex-1 bg-slate-700 hover:bg-slate-600 border-slate-600 text-white h-12 rounded-xl">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmedTransfer}
              className="flex-1 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 h-12 rounded-xl text-white font-semibold"
            >
              Confirm Send
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Call Price Update Modal */}
      <Dialog open={showCallPriceModal} onOpenChange={setShowCallPriceModal}>
        <DialogContent className="bg-gradient-to-b from-slate-900 to-slate-800 border-slate-700 max-w-md mx-4 rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center justify-center gap-2 text-lg">
              <PhoneCall className="w-5 h-5 text-emerald-400" />
              Call Price Update
            </DialogTitle>
          </DialogHeader>
          
          {(() => {
            // CRITICAL: When host_level is 0 (after beans transfer), display as Level 1
            const rawHostLevel = (profile as any)?.host_level || 0;
            const displayLevel = rawHostLevel === 0 ? 1 : rawHostLevel;
            const minCustomLevel = callRateSettings?.min_level_for_custom_rate ?? 6;
            const canCustomize = displayLevel >= minCustomLevel;
            const commissionPercent = callRateSettings?.host_commission_percent || 55;
            const beansPerMin = Math.floor(callRate * commissionPercent / 100);
            const suggestedBeans = Math.floor(getLevelSuggestedRate() * commissionPercent / 100);
            
            return (
              <div className="space-y-5 py-4">
                {/* Current Level Info */}
                <div className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-2xl p-4 border border-purple-500/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white/70 text-xs mb-1">Your Level</p>
                      <p className="text-purple-400 font-bold text-2xl">Lv {displayLevel}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-white/70 text-xs mb-1">{canCustomize ? 'Suggested Rate' : 'Fixed Rate'}</p>
                      <p className="text-amber-400 font-bold text-xl flex items-center gap-1">
                        {suggestedBeans} <BeansIcon size={18} />/min
                      </p>
                    </div>
                  </div>
                </div>

                {!canCustomize && (
                  <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700">
                    <p className="text-slate-400 text-xs text-center">🔒 Reach Level {minCustomLevel} or higher to customize your rate</p>
                  </div>
                )}

                {canCustomize && (
                  <>
                    {/* Quick select - Group Lv1-5 as one, then Lv6-10 separately */}
                    <div className="space-y-2">
                      <p className="text-white/70 text-xs">Select Rate by Level</p>
                      <div className="grid grid-cols-6 gap-2">
                        {(() => {
                          const levelRates = callRateSettings?.level_rates || [];
                          const sortedRates = [...levelRates].sort((a: any, b: any) => a.level - b.level);
                          
                          // Get level 1-5 rate (they should all be the same)
                          const level1to5Rate = sortedRates.find((lr: any) => lr.level >= 1 && lr.level <= 5);
                          const level1to5Beans = level1to5Rate ? Math.floor(level1to5Rate.rate * commissionPercent / 100) : 1100;
                          const isLevel1to5Selected = level1to5Rate && callRate === level1to5Rate.rate;
                          const isCurrentInLevel1to5 = displayLevel >= 1 && displayLevel <= 5;
                          
                          // Get levels 6-10
                          const level6to10 = sortedRates.filter((lr: any) => lr.level >= 6);
                          
                          // Lv1-5 is ALWAYS unlocked (these are lower levels for Level 6+ hosts)
                          // Only levels ABOVE hostLevel are locked
                          const isLevel1to5Locked = false; // Never locked - these are lower levels
                          
                          return (
                            <>
                              {/* Level 1-5 combined button - Always unlocked */}
                              <button 
                                onClick={() => level1to5Rate && setCallRate(level1to5Rate.rate)} 
                                className={`py-2 px-1 rounded-xl text-center transition-all flex flex-col items-center gap-0.5 relative ${
                                  isLevel1to5Selected 
                                    ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/30' 
                                    : isCurrentInLevel1to5 
                                      ? 'bg-purple-600/50 text-purple-200 border border-purple-500/50' 
                                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                }`}
                              >
                                <span className="text-[10px] font-medium opacity-70">Lv1-5</span>
                                <span className="text-sm font-bold">{level1to5Beans}</span>
                              </button>
                              
                              {/* Level 6-10 individual buttons */}
                              {level6to10.map((lr: any) => {
                                const rateBeans = Math.floor(lr.rate * commissionPercent / 100);
                                const isCurrentLevel = lr.level === displayLevel;
                                const isSelected = callRate === lr.rate;
                                // Lock levels ABOVE the host's current level
                                const isLocked = lr.level > displayLevel;
                                
                                return (
                                  <button 
                                    key={lr.level} 
                                    onClick={() => !isLocked && setCallRate(lr.rate)}
                                    disabled={isLocked}
                                    className={`py-2 px-1 rounded-xl text-center transition-all flex flex-col items-center gap-0.5 relative ${
                                      isLocked
                                        ? 'bg-slate-800/50 text-slate-500 cursor-not-allowed opacity-60'
                                        : isSelected 
                                          ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/30' 
                                          : isCurrentLevel 
                                            ? 'bg-purple-600/50 text-purple-200 border border-purple-500/50' 
                                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                    }`}
                                  >
                                    {isLocked && (
                                      <div className="absolute -top-1 -right-1 bg-slate-600 rounded-full p-0.5">
                                        <Lock className="w-2.5 h-2.5 text-slate-400" />
                                      </div>
                                    )}
                                    <span className="text-[10px] font-medium opacity-70">Lv{lr.level}</span>
                                    <span className="text-sm font-bold">{rateBeans}</span>
                                  </button>
                                );
                              })}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </>
                )}

                {/* Earning Summary - Show beans and diamond rate */}
                <div className="bg-gradient-to-r from-emerald-500/20 to-teal-500/20 rounded-2xl p-4 border border-emerald-500/30">
                  {(() => {
                    // Calculate current diamond rate and beans
                    let currentDiamondRate = callRate;
                    if (currentDiamondRate <= 0) {
                      const levelRates = callRateSettings?.level_rates || [];
                      const levelRate = levelRates.find((lr: any) => lr.level === displayLevel);
                      currentDiamondRate = levelRate?.rate || callRateSettings?.default_rate || 2000;
                    }
                    const currentBeans = Math.floor(currentDiamondRate * commissionPercent / 100);
                    
                    return (
                      <>
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <p className="text-emerald-200 text-xs mb-1">You will earn</p>
                            <div className="flex items-center gap-1">
                              <BeansIcon size={24} />
                              <span className="text-xl font-bold text-emerald-400">{currentBeans} Beans/min</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-cyan-200 text-xs mb-1">User pays</p>
                            <div className="flex items-center gap-1 justify-end">
                              <span className="text-2xl">💎</span>
                              <span className="text-xl font-bold text-cyan-400">{currentDiamondRate}/min</span>
                            </div>
                          </div>
                        </div>
                        
                      </>
                    );
                  })()}
                </div>

                <Button onClick={handleSaveCallRate} disabled={savingCallRate} className="w-full h-12 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 rounded-xl text-white font-semibold text-base">
                  {savingCallRate ? (
                    <div className="flex items-center gap-2"><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />Saving...</div>
                  ) : (
                    <div className="flex items-center gap-2"><PhoneCall className="w-5 h-5" />Save Price</div>
                  )}
                </Button>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Agency Beans Exchange Modal */}
      <Dialog open={showAgencyExchangeModal} onOpenChange={setShowAgencyExchangeModal}>
        <DialogContent className="max-w-md bg-gradient-to-b from-slate-900 to-slate-950 border-amber-500/30 text-white p-0 max-h-[90vh] overflow-y-auto">
          <div className="bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-yellow-500/20 p-6 border-b border-amber-500/20">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-amber-400 flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
                  <Beans3DIcon size={24} />
                </div>
                Exchange Beans to Diamonds
              </DialogTitle>
            </DialogHeader>
            
            {/* Agency Info */}
            <div className="mt-4 bg-slate-800/50 rounded-xl p-3 border border-amber-500/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-amber-400/70">Agency</p>
                  <p className="font-semibold text-amber-200">{agencyData?.name || 'Loading...'}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-amber-400/70">Your Beans</p>
                  <p className="font-bold text-lg text-amber-400 flex items-center gap-1"><BeansIcon size={16} /> {beans.toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-4">
            {/* Exchange Rate Info */}
            <div className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-xl p-4 border border-purple-500/30">
              <div className="flex items-center justify-between text-sm">
                <span className="text-purple-300">Exchange Rate</span>
                <span className="text-white font-semibold">{agencyExchangeSettings.beans_to_diamonds_rate} Beans = 1 💎</span>
              </div>
              <div className="flex items-center justify-between text-sm mt-2">
                <span className="text-purple-300">Fee</span>
                <span className="text-orange-400 font-semibold">{agencyExchangeSettings.exchange_fee_percent}%</span>
              </div>
            </div>

            {/* Amount Input */}
            <div className="space-y-2">
              <Label className="text-amber-300 text-sm">Beans Amount</Label>
              <Input
                type="number"
                placeholder={`Min ${agencyExchangeSettings.min_exchange_amount}`}
                value={exchangeBeansAmount}
                onChange={(e) => {
                  const value = e.target.value;
                  setExchangeBeansAmount(value);
                  
                  // Calculate fee first (deducted from beans input)
                  // Then convert remaining beans to diamonds
                  const beansNum = parseInt(value) || 0;
                  const fee = Math.floor(beansNum * agencyExchangeSettings.exchange_fee_percent / 100);
                  const beansAfterFee = beansNum - fee;
                  const diamonds = Math.floor(beansAfterFee / agencyExchangeSettings.beans_to_diamonds_rate);
                  setExchangeDiamondsToGet(diamonds);
                  setExchangeFeeAmount(fee);
                }}
                className="bg-slate-800 border-amber-500/30 text-white placeholder:text-slate-500 text-lg h-12"
              />
              
              {/* Quick Amount Buttons */}
              <div className="grid grid-cols-4 gap-2 mt-2">
                {[1000, 5000, 10000, beans].map((amount, idx) => (
                  <Button
                    key={idx}
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const val = idx === 3 ? beans : amount;
                      setExchangeBeansAmount(val.toString());
                      // Fee deducted first, remaining beans convert to diamonds
                      const fee = Math.floor(val * agencyExchangeSettings.exchange_fee_percent / 100);
                      const beansAfterFee = val - fee;
                      const diamonds = Math.floor(beansAfterFee / agencyExchangeSettings.beans_to_diamonds_rate);
                      setExchangeDiamondsToGet(diamonds);
                      setExchangeFeeAmount(fee);
                    }}
                    className="bg-slate-700/50 border-amber-500/30 text-amber-300 hover:bg-amber-500/20 text-xs"
                  >
                    {idx === 3 ? 'All' : amount.toLocaleString()}
                  </Button>
                ))}
              </div>
            </div>

            {/* Preview */}
            {parseInt(exchangeBeansAmount) > 0 && (
              <div className="bg-gradient-to-r from-emerald-500/20 to-teal-500/20 rounded-xl p-4 border border-emerald-500/30">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-emerald-300 text-sm">You'll Get</span>
                  <span className="text-2xl font-bold text-emerald-400 flex items-center gap-1">
                    💎 {exchangeDiamondsToGet.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-orange-300">Fee ({agencyExchangeSettings.exchange_fee_percent}%)</span>
                  <span className="text-orange-400 flex items-center gap-1">-{exchangeFeeAmount.toLocaleString()} <BeansIcon size={12} /></span>
                </div>
                <div className="flex items-center justify-between text-sm mt-1">
                  <span className="text-slate-400">Beans After Fee</span>
                  <span className="text-slate-300 flex items-center gap-1">{(parseInt(exchangeBeansAmount) - exchangeFeeAmount).toLocaleString()} <BeansIcon size={12} /></span>
                </div>
                <div className="flex items-center justify-between text-sm mt-1 pt-2 border-t border-emerald-500/30">
                  <span className="text-slate-400">Total Beans Deducted</span>
                  <span className="text-white font-semibold flex items-center gap-1">{parseInt(exchangeBeansAmount).toLocaleString()} <BeansIcon size={12} /></span>
                </div>
              </div>
            )}

            {/* Exchange Button */}
            <Button
              onClick={async () => {
                if (!agencyData || !currentUser) return;
                
                const beansNum = parseInt(exchangeBeansAmount) || 0;
                
                if (beansNum < agencyExchangeSettings.min_exchange_amount) {
                  toast({ title: `Minimum ${agencyExchangeSettings.min_exchange_amount.toLocaleString()} beans required`, variant: "destructive" });
                  return;
                }
                
                // Check personal My Beans (profiles.beans), NOT agency wallet_balance
                if (beansNum > beans) {
                  toast({ title: "Insufficient beans", description: `Need ${beansNum.toLocaleString()} but have ${beans.toLocaleString()} My Beans`, variant: "destructive" });
                  return;
                }
                
                setExchangeProcessing(true);
                
                try {
                  // Use unified RPC - deducts from profiles.beans and credits agency diamond_balance
                  const { data: result, error: rpcError } = await supabase.rpc('exchange_user_beans_to_diamonds', {
                    _user_id: currentUser.id,
                    _beans_amount: beansNum,
                    _diamonds_reward: exchangeDiamondsToGet,
                    _tier_id: null
                  });
                  
                  if (rpcError) throw rpcError;
                  
                  const exchangeResult = result as any;
                  if (!exchangeResult?.success) {
                    throw new Error(exchangeResult?.error || 'Exchange failed');
                  }
                  
                  // Update local state - deduct from personal My Beans (NOT agency wallet)
                  const newPersonalBeans = exchangeResult.new_beans ?? (beans - beansNum);
                  setBeans(newPersonalBeans);
                  
                  // Update agency diamond_balance in local state
                  if (exchangeResult.destination === 'trader_wallet_agency') {
                    setAgencyData({ 
                      ...agencyData, 
                      diamond_balance: (agencyData.diamond_balance || 0) + exchangeDiamondsToGet
                    });
                  }
                  
                  console.log('[Profile] Agency Exchange successful via RPC:', {
                    beansDeducted: beansNum,
                    diamondsAdded: exchangeDiamondsToGet,
                    destination: exchangeResult.destination,
                    newPersonalBeans
                  });
                  
                  toast({ 
                    title: "Exchange Successful! ✨", 
                    description: `Converted ${beansNum.toLocaleString()} beans to ${exchangeDiamondsToGet.toLocaleString()} diamonds (Trader Wallet)` 
                  });
                  
                  setExchangeBeansAmount("");
                  setExchangeDiamondsToGet(0);
                  setExchangeFeeAmount(0);
                  setShowAgencyExchangeModal(false);
                  refetchBalance();
                } catch (error: any) {
                  console.error('Exchange error:', error);
                  recordClientError({ label: "Profile.newPersonalBeans", message: error instanceof Error ? error.message : String(error) });
                  toast({ title: "Exchange failed", description: error.message, variant: "destructive" });
                } finally {
                  setExchangeProcessing(false);
                }
              }}
              disabled={exchangeProcessing || !exchangeBeansAmount || parseInt(exchangeBeansAmount) < agencyExchangeSettings.min_exchange_amount}
              className="w-full h-12 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold rounded-xl"
            >
              {exchangeProcessing ? (
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Processing...
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <ArrowRight className="w-5 h-5" />
                  Exchange Now
                </div>
              )}
            </Button>

            {/* Current Diamond Balance */}
            <div className="text-center text-sm text-slate-400">
              Agency Diamonds: <span className="text-cyan-400 font-semibold">{(agencyData?.diamond_balance || 0).toLocaleString()} 💎</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>

       {/* User Beans Exchange Modal - For regular users only */}
       <UserBeansExchangeModal
         open={showUserBeansExchangeModal}
         onOpenChange={setShowUserBeansExchangeModal}
         currentBeans={beans}
         userId={currentUser?.id || ""}
          onExchangeComplete={() => {
            // Refresh balance without page reload
            refetchBalance();
            // Re-fetch profile data inline
            const targetId = currentUser?.id;
            if (targetId) {
              supabase.from("profiles").select("beans, coins").eq("id", targetId).maybeSingle().then(({ data }) => {
                if (data) {
                  setBeans(data.beans || 0);
                  if (data.coins !== undefined) {
                    updateCachedBalance(data.coins);
                  }
                }
              });
            }
          }}
       />
    </div>
  );
};

export default Profile;
