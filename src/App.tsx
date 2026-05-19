import { useEffect, useState, lazy, Suspense, memo } from "react";
import { useLocation, useParams } from "react-router-dom";
import { lazyRetry } from "@/utils/lazyRetry";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { initSecureLinkGuard } from '@/utils/secureLinkGuard';
import { setCachedUser, invalidateCachedUser } from '@/utils/cachedAuth';
import { secureStorage } from '@/utils/encryptedStorage';
import { saveSessionToNative, clearNativeSession, getSessionFromNative } from '@/utils/nativeSessionStorage';
import { prewarmSVGA } from '@/utils/svgaPrewarm';
import { getAdaptiveNetworkProfile } from '@/utils/connectionProfile';
import { initWebViewPerformance } from '@/utils/nativePerformance';
import { clearBalanceCache } from '@/hooks/useUserBalance';
import { triggerLegacyProfileSync } from '@/utils/legacyProfileSync';


// =============================================
// MINIMAL PROVIDERS - Only what's needed for first paint
// =============================================
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

// =============================================
// HEAVY PROVIDERS - Loaded normally but rendered in Suspense boundaries
// CallProvider needs special handling as it wraps children
// =============================================
import { CallProvider } from "./components/call/CallProvider";
import { PresenceProvider } from "./components/common/PresenceProvider";
import { RealtimeProvider } from "./components/common/RealtimeProvider";
import DeferredAppHooks from "./components/common/DeferredAppHooks";
import AppUpdateChecker from "@/components/common/AppUpdateChecker";
import PushNotificationInitializer from "@/components/common/PushNotificationInitializer";
const Level5HelperDashboard = lazy(() => import("./pages/Level5HelperDashboard"));
// =============================================
// ALL PAGES - Lazy loaded for fast initial paint
// =============================================
const Index = lazy(lazyRetry(() => import("./pages/Index")));
const Auth = lazy(lazyRetry(() => import("./pages/Auth")));
const DeepLinkHandler = lazy(lazyRetry(() => import("./components/common/DeepLinkHandler")));
import ErrorBoundary from "./components/ErrorBoundary";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import EventPopupBanner from "./components/common/EventPopupBanner";
import DailyLoginPopup from "./components/rewards/DailyLoginPopup";
import WelcomeOnboarding from "./components/onboarding/WelcomeOnboarding";
import RatingRewardPopup from "./components/rewards/RatingRewardPopup";
const LandingPage = lazy(lazyRetry(() => import("./pages/LandingPage")));
const Unsubscribe = lazy(lazyRetry(() => import("./pages/Unsubscribe")));
// =============================================
// LAZY LOADED PAGES - Load on demand
// =============================================
// Main Pages
const Profile = lazy(lazyRetry(() => import("./pages/Profile")));
const Chat = lazy(lazyRetry(() => import("./pages/Chat")));
const LiveStream = lazy(lazyRetry(() => import("./pages/LiveStream")));
// Wrapper to force full remount of LiveStream when stream ID changes (TikTok-style navigation)
const LiveStreamKeyWrapper = () => {
  const { id } = useParams();
  return <LiveStream key={id} />;
};
const Recharge = lazy(lazyRetry(() => import("./pages/Recharge")));
const Discover = lazy(lazyRetry(() => import("./pages/Discover")));
const Live = lazy(lazyRetry(() => import("./pages/Live")));

// =============================================
// ROUTE PRELOADING — Download core page chunks in background after first paint
// so navigation feels instant.  Each import() resolves to a cached module.
// =============================================
const CORE_PAGE_IMPORTERS = [
  () => import("./pages/Index"),
  () => import("./pages/Profile"),
  () => import("./pages/Discover"),
  () => import("./pages/Chat"),
  () => import("./pages/Live"),
  () => import("./pages/Reels"),
  () => import("./pages/ProfileDetail"),
  () => import("./pages/GoLive"),
  () => import("./pages/SearchUsers"),
  () => import("./pages/Settings"),
  () => import("./pages/Level"),
  () => import("./pages/Tasks"),
  () => import("./pages/Shop"),
  () => import("./pages/VIP"),
  () => import("./pages/Agency"),
  () => import("./pages/AgencyDashboard"),
  () => import("./pages/PartyRooms"),
  () => import("./pages/CreateParty"),
  () => import("./pages/FollowingList"),
  () => import("./pages/CallHistory"),
  () => import("./pages/EditProfile"),
  () => import("./pages/Invitation"),
  () => import("./pages/Recharge"),
  () => import("./pages/LiveStream"),
];

let coreChunksPreloaded = false;
function preloadCoreRoutes() {
  if (coreChunksPreloaded) return;
  coreChunksPreloaded = true;
  // Stagger imports to avoid blocking network
  CORE_PAGE_IMPORTERS.forEach((fn, i) => {
    setTimeout(() => fn().catch(() => {}), i * 50);
  });
}
const EditProfile = lazy(() => import("./pages/EditProfile"));
const Level = lazy(() => import("./pages/Level"));
const Invitation = lazy(() => import("./pages/Invitation"));
const Tasks = lazy(() => import("./pages/Tasks"));
const HostBonusLedger = lazy(() => import("./pages/HostBonusLedger"));
const Settings = lazy(() => import("./pages/Settings"));
const Rewards = lazy(() => import("./pages/Rewards"));
const Agency = lazy(() => import("./pages/Agency"));
const AgentRank = lazy(() => import("./pages/AgentRank"));
const Leaderboard = lazy(() => import("./pages/Leaderboard"));
const PKLeaderboard = lazy(() => import("./pages/PKLeaderboard"));
const HostApplication = lazy(() => import("./pages/HostApplication"));
const AgentWallet = lazy(() => import("./pages/AgentWallet"));
const TransferHistory = lazy(() => import("./pages/TransferHistory"));
const CreateAgency = lazy(() => import("./pages/CreateAgency"));
const SmartLink = lazy(() => import("./pages/SmartLink"));
const AgencySignup = lazy(() => import("./pages/AgencySignup"));
const AgencyDashboard = lazy(() => import("./pages/AgencyDashboard"));
const AgencyCoinExchange = lazy(() => import("./pages/AgencyCoinExchange"));
const AgencyCoinTrader = lazy(() => import("./pages/AgencyCoinTrader"));
const CallHistory = lazy(() => import("./pages/CallHistory"));
const FollowingList = lazy(() => import("./pages/FollowingList"));
const SearchUsers = lazy(() => import("./pages/SearchUsers"));
const RechargeHistory = lazy(() => import("./pages/RechargeHistory"));
const PaymentSuccess = lazy(() => import("./pages/PaymentSuccess"));
const PartyRooms = lazy(lazyRetry(() => import("./pages/PartyRooms")));
const PartyRoom = lazy(lazyRetry(() => import("./pages/PartyRoom")));
const GoLive = lazy(() => import("./pages/GoLive"));
const CreateParty = lazy(() => import("./pages/CreateParty"));
const ProfileDetail = lazy(() => import("./pages/ProfileDetail"));

const Tags = lazy(() => import("./pages/Tags"));
const MyPoster = lazy(() => import("./pages/MyPoster"));
const HostDashboard = lazy(() => import("./pages/HostDashboard"));
const HostVerification = lazy(() => import("./pages/HostVerification"));
const FaceVerification = lazy(() => import("./pages/FaceVerification"));
const FacePoseRegression = lazy(() => import("./pages/FacePoseRegression"));
const AvatarFrameRingCheck = lazy(() => import("./pages/AvatarFrameRingCheck"));
const AgencyWithdrawal = lazy(() => import("./pages/AgencyWithdrawal"));
const AgencyTransferHistory = lazy(() => import("./pages/AgencyTransferHistory"));
const AgencyCommissionHistory = lazy(() => import("./pages/AgencyCommissionHistory"));
const AgencyHostManagement = lazy(() => import("./pages/AgencyHostManagement"));
const JoinAgency = lazy(() => import("./pages/JoinAgency"));
const BecomeSubAgent = lazy(() => import("./pages/BecomeSubAgent"));
const HelperDashboard = lazy(() => import("./pages/HelperDashboard"));

const PayrollHelperGuide = lazy(() => import("./pages/PayrollHelperGuide"));
const AgencyDetails = lazy(() => import("./pages/AgencyDetails"));
const AgencyPolicy = lazy(() => import("./pages/AgencyPolicy"));
const PoliciesAndBenefits = lazy(() => import("./pages/PoliciesAndBenefits"));
const PublicPolicies = lazy(() => import("./pages/PublicPolicies"));
const PublicPrivacyPolicy = lazy(() => import("./pages/PublicPrivacyPolicy"));
const PublicAccountDeletion = lazy(() => import("./pages/PublicAccountDeletion"));
const PolicyDetail = lazy(() => import("./pages/PolicyDetail"));
const GoogleLibraryOrderRules = lazy(() => import("./pages/GoogleLibraryOrderRules"));
const About = lazy(() => import("./pages/About"));
const PublicContact = lazy(() => import("./pages/PublicContact"));
const SyncTest = lazy(() => import("./pages/SyncTest"));
const HostTransferHistory = lazy(() => import("./pages/HostTransferHistory"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const Shop = lazy(() => import("./pages/Shop"));
const Reels = lazy(() => import("./pages/Reels"));
const VIP = lazy(() => import("./pages/VIP"));
const Parcels = lazy(() => import("./pages/Parcels"));
const PlaceholderPage = lazy(() => import("./components/common/PlaceholderPage"));

// Games
const GamesHub = lazy(() => import("./pages/games/GamesHub"));
const RoulettePage = lazy(() => import("./pages/games/RoulettePage"));
const FerrisWheelPage = lazy(() => import("./pages/games/FerrisWheelPage"));
const TeenPattiPage = lazy(() => import("./pages/games/TeenPattiPage"));

// Admin Pages - All lazy loaded (with chunk-failure retry)
const AdminBlueprint = lazy(lazyRetry(() => import("./pages/admin/AdminBlueprint")));
const AdminAllowedLinks = lazy(lazyRetry(() => import("./pages/admin/AdminAllowedLinks")));
const AdminChatInspector = lazy(lazyRetry(() => import("./pages/admin/AdminChatInspector")));
const AdminNumberSharing = lazy(lazyRetry(() => import("./pages/admin/AdminNumberSharing")));
const AdminAccessGuard = lazy(lazyRetry(() => import("./components/admin/AdminAccessGuard")));
const AdminRouteGuard = lazy(lazyRetry(() => import("./components/admin/AdminRouteGuard")));
const SubAdminDashboardGuard = lazy(lazyRetry(() => import("./components/admin/AdminRouteGuard").then(m => ({ default: m.SubAdminDashboardGuard }))));
const AdminLayout = lazy(lazyRetry(() => import("./pages/admin/AdminLayout")));
const AdminAuth = lazy(lazyRetry(() => import("./pages/admin/AdminAuth")));
const AdminDashboard = lazy(lazyRetry(() => import("./pages/admin/AdminDashboard")));
const AdminSettings = lazy(lazyRetry(() => import("./pages/admin/AdminSettings")));
const AdminAgencies = lazy(lazyRetry(() => import("./pages/admin/AdminAgencies")));
const AdminAgencyDetail = lazy(lazyRetry(() => import("./pages/admin/AdminAgencyDetail")));
const AdminUserManagement = lazy(lazyRetry(() => import("./pages/admin/AdminUserManagement")));
const AdminCoinTraders = lazy(lazyRetry(() => import("./pages/admin/AdminCoinTraders")));
const AdminTraderOrders = lazy(lazyRetry(() => import("./pages/admin/AdminTraderOrders")));
const AdminTraderTransactions = lazy(lazyRetry(() => import("./pages/admin/AdminTraderTransactions")));
const AdminManualTopup = lazy(lazyRetry(() => import("./pages/admin/AdminManualTopup")));
// AdminCommissionCalculator deprecated → AdminPricingHub (Pkg30)
const AdminAnimationStore = lazy(lazyRetry(() => import("./pages/admin/AdminAnimationStore")));
const AdminTopupSystem = lazy(lazyRetry(() => import("./pages/admin/AdminTopupSystem")));
const AdminIconRegistry = lazy(lazyRetry(() => import("./pages/admin/AdminIconRegistry")));
const AdminVerifiedBadges = lazy(lazyRetry(() => import("./pages/admin/AdminVerifiedBadges")));
const AdminPartyBackgrounds = lazy(lazyRetry(() => import("./pages/admin/AdminPartyBackgrounds")));
// AdminCallSettings deprecated → AdminPricingHub (Pkg30)
const AdminOnlineUsers = lazy(lazyRetry(() => import("./pages/admin/AdminOnlineUsers")));
const AdminTodayCalls = lazy(lazyRetry(() => import("./pages/admin/AdminTodayCalls")));
const AdminGameSettings = lazy(lazyRetry(() => import("./pages/admin/AdminGameSettings")));
const AdminGameProviders = lazy(lazyRetry(() => import("./pages/admin/AdminGameProviders")));
const AdminLevelTiers = lazy(lazyRetry(() => import("./pages/admin/AdminLevelTiers")));
const AdminLevelPrivileges = lazy(lazyRetry(() => import("./pages/admin/AdminLevelPrivileges")));
const AdminEntryBars = lazy(lazyRetry(() => import("./pages/admin/AdminEntryBars")));
const AdminInvitationSettings = lazy(lazyRetry(() => import("./pages/admin/AdminInvitationSettings")));
const AdminFrames = lazy(lazyRetry(() => import("./pages/admin/AdminFrames")));
const AdminHelperApplications = lazy(lazyRetry(() => import("./pages/admin/AdminHelperApplications")));
const AdminLevel5Helpers = lazy(lazyRetry(() => import("./pages/admin/AdminLevel5Helpers")));
const AdminGameServer = lazy(lazyRetry(() => import("./pages/admin/AdminGameServer")));
const AdminTopupPaymentMethods = lazy(lazyRetry(() => import("./pages/admin/AdminTopupPaymentMethods")));
const AdminHelperRequests = lazy(lazyRetry(() => import("./pages/admin/AdminHelperRequests")));
const AdminHelperManagement = lazy(lazyRetry(() => import("./pages/admin/AdminHelperManagement")));
const AdminHelperOrders = lazy(lazyRetry(() => import("./pages/admin/AdminHelperOrders")));
const AdminPayrollOrders = lazy(lazyRetry(() => import("./pages/admin/AdminPayrollOrders")));
const AdminStreams = lazy(lazyRetry(() => import("./pages/admin/AdminStreams")));
const AdminRecordings = lazy(lazyRetry(() => import("./pages/admin/AdminRecordings")));
const AdminPartyRooms = lazy(lazyRetry(() => import("./pages/admin/AdminPartyRooms")));
const AdminGifts = lazy(lazyRetry(() => import("./pages/admin/AdminGifts")));
const AdminGiftTransactions = lazy(lazyRetry(() => import("./pages/admin/AdminGiftTransactions")));
const AdminErrorLog = lazy(lazyRetry(() => import("./pages/admin/AdminErrorLog")));
const AdminBanners = lazy(lazyRetry(() => import("./pages/admin/AdminBanners")));
const AdminCampaignBannerHub = lazy(lazyRetry(() => import("./pages/admin/AdminCampaignBannerHub")));
const AdminPopupBanners = lazy(lazyRetry(() => import("./pages/admin/AdminPopupBanners")));
const AdminRatingBanners = lazy(lazyRetry(() => import("./pages/admin/AdminRatingBanners")));
const AdminOnboardingSlides = lazy(lazyRetry(() => import("./pages/admin/AdminOnboardingSlides")));
const AdminContent = lazy(lazyRetry(() => import("./pages/admin/AdminContent")));
const AdminDeviceManagement = lazy(lazyRetry(() => import("./pages/admin/AdminDeviceManagement")));
const AdminDeviceApprovals = lazy(lazyRetry(() => import("./pages/admin/AdminDeviceApprovals")));
// AdminCommissions deprecated → AdminPricingHub (Pkg30)
const AdminPricingHub = lazy(lazyRetry(() => import("./pages/admin/AdminPricingHub")));
const AdminWithdrawals = lazy(lazyRetry(() => import("./pages/admin/AdminWithdrawals")));
const AdminBranding = lazy(lazyRetry(() => import("./pages/admin/AdminBranding")));
const AdminNotificationTemplates = lazy(lazyRetry(() => import("./pages/admin/AdminNotificationTemplates")));
const AdminReports = lazy(lazyRetry(() => import("./pages/admin/AdminReports")));
const AdminLogs = lazy(lazyRetry(() => import("./pages/admin/AdminLogs")));
const AdminAgoraSettings = lazy(lazyRetry(() => import("./pages/admin/AdminAgoraSettings")));
const AdminVIPPrivileges = lazy(lazyRetry(() => import("./pages/admin/AdminVIPPrivileges")));
const AdminLiveBans = lazy(lazyRetry(() => import("./pages/admin/AdminLiveBans")));
const AdminPermanentBan = lazy(lazyRetry(() => import("./pages/admin/AdminPermanentBan")));
const AdminCountryDistribution = lazy(lazyRetry(() => import("./pages/admin/AdminCountryDistribution")));
const AdminFaceViolations = lazy(lazyRetry(() => import("./pages/admin/AdminFaceViolations")));
const AdminCoins = lazy(lazyRetry(() => import("./pages/admin/AdminCoins")));
const AdminPaymentGateways = lazy(lazyRetry(() => import("./pages/admin/AdminPaymentGateways")));
const AdminTransferScheduler = lazy(lazyRetry(() => import("./pages/admin/AdminTransferScheduler")));
const AdminAgencyCommissionLog = lazy(lazyRetry(() => import("./pages/admin/AdminAgencyCommissionLog")));
const AdminTransferHistory = lazy(lazyRetry(() => import("./pages/admin/AdminTransferHistory")));
const AdminRechargeHistory = lazy(lazyRetry(() => import("./pages/admin/AdminRechargeHistory")));
const AdminRechargeCampaigns = lazy(lazyRetry(() => import("./pages/admin/AdminRechargeCampaigns")));
const AdminShop = lazy(lazyRetry(() => import("./pages/admin/AdminShop")));
const AdminPushBroadcast = lazy(lazyRetry(() => import("./pages/admin/AdminPushBroadcast")));
const AdminNoticeBroadcast = lazy(lazyRetry(() => import("./pages/admin/AdminNoticeBroadcast")));
const AdminEmailBroadcast = lazy(lazyRetry(() => import("./pages/admin/AdminEmailBroadcast")));
const AdminLeaderboardManagement = lazy(lazyRetry(() => import("./pages/admin/AdminLeaderboardManagement")));
const AdminBalanceDeduction = lazy(lazyRetry(() => import("./pages/admin/AdminBalanceDeduction")));
const AdminFeatureLevels = lazy(lazyRetry(() => import("./pages/admin/AdminFeatureLevels")));
const AdminReels = lazy(lazyRetry(() => import("./pages/admin/AdminReels")));
const AdminPartyBanners = lazy(lazyRetry(() => import("./pages/admin/AdminPartyBanners")));
const AdminAppVersion = lazy(lazyRetry(() => import("./pages/admin/AdminAppVersion")));
const AdminThemeManager = lazy(lazyRetry(() => import("./pages/admin/AdminThemeManager")));
const AdminRoleFrames = lazy(lazyRetry(() => import("./pages/admin/AdminRoleFrames")));
const AdminChatBubbles = lazy(lazyRetry(() => import("./pages/admin/AdminChatBubbles")));
const AdminVIPMedals = lazy(lazyRetry(() => import("./pages/admin/AdminVIPMedals")));
const AdminNobleCards = lazy(lazyRetry(() => import("./pages/admin/AdminNobleCards")));
const AdminNobleSubscriptions = lazy(lazyRetry(() => import("./pages/admin/AdminNobleSubscriptions")));
const AdminVehicleEntrances = lazy(lazyRetry(() => import("./pages/admin/AdminVehicleEntrances")));
const AdminEntryBanners = lazy(lazyRetry(() => import("./pages/admin/AdminEntryBanners")));
const AdminEntryNameBars = lazy(lazyRetry(() => import("./pages/admin/AdminEntryNameBars")));
const AdminBlocked = lazy(lazyRetry(() => import("./pages/admin/AdminBlocked")));
const AdminHostApplications = lazy(lazyRetry(() => import("./pages/admin/AdminHostApplications")));
const AdminHostSearch = lazy(lazyRetry(() => import("./pages/admin/AdminHostSearch")));
const AdminHosts = lazy(lazyRetry(() => import("./pages/admin/AdminHosts")));
const AdminModeration = lazy(lazyRetry(() => import("./pages/admin/AdminModeration")));
const AdminFaceVerification = lazy(lazyRetry(() => import("./pages/admin/AdminFaceVerification")));
const AdminHostConversion = lazy(lazyRetry(() => import("./pages/admin/AdminHostConversion")));
const AdminTasksSettings = lazy(lazyRetry(() => import("./pages/admin/AdminTasksSettings")));
const AdminUsers = lazy(lazyRetry(() => import("./pages/admin/AdminUsers")));
const AdminRankingRewards = lazy(lazyRetry(() => import("./pages/admin/AdminRankingRewards")));
const AdminRatingRewards = lazy(lazyRetry(() => import("./pages/admin/AdminRatingRewards")));
const AdminRewardsManagement = lazy(lazyRetry(() => import("./pages/admin/AdminRewardsManagement")));
const AdminRewardClaimsHistory = lazy(lazyRetry(() => import("./pages/admin/AdminRewardClaimsHistory")));
const AdminAgencyPolicy = lazy(lazyRetry(() => import("./pages/admin/AdminAgencyPolicy")));
const AdminLevelManagement = lazy(lazyRetry(() => import("./pages/admin/AdminLevelManagement")));
const AdminVIPManagement = lazy(lazyRetry(() => import("./pages/admin/AdminVIPManagement")));
const AdminEntryEffects = lazy(lazyRetry(() => import("./pages/admin/AdminEntryEffects")));
const AdminFinance = lazy(lazyRetry(() => import("./pages/admin/AdminFinance")));
const AdminGameManagement = lazy(lazyRetry(() => import("./pages/admin/AdminGameManagement")));
const AdminPartyManagement = lazy(lazyRetry(() => import("./pages/admin/AdminPartyManagement")));
const AdminCoinTraderHub = lazy(lazyRetry(() => import("./pages/admin/AdminCoinTraderHub")));
const AdminContentManagement = lazy(lazyRetry(() => import("./pages/admin/AdminContentManagement")));
const AdminAgencyHub = lazy(lazyRetry(() => import("./pages/admin/AdminAgencyHub")));
const AdminAppSettingsHub = lazy(lazyRetry(() => import("./pages/admin/AdminAppSettingsHub")));
const AdminHostFeedRanking = lazy(lazyRetry(() => import("./pages/admin/AdminHostFeedRanking")));
const AdminPartyDiscoveryRanking = lazy(lazyRetry(() => import("./pages/admin/AdminPartyDiscoveryRanking")));
const AdminRankingAutomation = lazy(lazyRetry(() => import("./pages/admin/AdminRankingAutomation")));
const AdminVisualAssetsHub = lazy(lazyRetry(() => import("./pages/admin/AdminVisualAssetsHub")));
const AdminUserHub = lazy(lazyRetry(() => import("./pages/admin/AdminUserHub")));
const AdminSupportTickets = lazy(lazyRetry(() => import("./pages/admin/AdminSupportTickets")));
const AdminSupportReports = lazy(lazyRetry(() => import("./pages/admin/AdminSupportReports")));
const AdminPendingApprovals = lazy(lazyRetry(() => import("./pages/admin/AdminPendingApprovals")));
const AdminAutoActions = lazy(lazyRetry(() => import("./pages/admin/AdminAutoActions")));
const AdminGmailSupport = lazy(lazyRetry(() => import("./pages/admin/AdminGmailSupport")));
const AdminUserReports = lazy(lazyRetry(() => import("./pages/admin/AdminUserReports")));
const AdminErrorLogs = lazy(lazyRetry(() => import("./pages/admin/AdminErrorLogs")));
const AdminSubAdmins = lazy(lazyRetry(() => import("./pages/admin/AdminSubAdmins")));
const AdminRoomWelcomeMessages = lazy(lazyRetry(() => import("./pages/admin/AdminRoomWelcomeMessages")));
const AdminLandingPageManager = lazy(lazyRetry(() => import("./pages/admin/AdminLandingPageManager")));
const AdminParcelManagement = lazy(lazyRetry(() => import("./pages/admin/AdminParcelManagement")));
const AdminBeautyFilters = lazy(lazyRetry(() => import("./pages/admin/AdminBeautyFilters")));
const AdminContactViolations = lazy(lazyRetry(() => import("./pages/admin/AdminContactViolations")));
const AdminGameLeaderboard = lazy(lazyRetry(() => import("./pages/admin/AdminGameLeaderboard")));
const AdminUserBeansExchange = lazy(lazyRetry(() => import("./pages/admin/AdminUserBeansExchange")));

// =============================================
// ADMIN PREFETCH - Pre-load critical admin chunks when admin flag exists
// This eliminates the loading spinner for returning admins
// =============================================
if (typeof window !== 'undefined') {
  try {
    const hasFlag = localStorage.getItem('meri_admin_access') === 'true' || localStorage.getItem('meri_owner_access') === 'true';
    if (hasFlag) {
      // Prefetch core admin modules after a short idle delay
      const prefetchAdmin = () => {
        import("./components/admin/AdminAccessGuard");
        import("./pages/admin/AdminLayout");
        import("./pages/admin/AdminDashboard");
        import("./components/admin/AdminRouteGuard");
        import("./pages/admin/AdminFaceVerification");
        import("./pages/admin/AdminTasksSettings");
        import("./pages/admin/AdminSupportTickets");
        import("./pages/admin/AdminGmailSupport");
      };
      if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(prefetchAdmin, { timeout: 2000 });
      } else {
        setTimeout(prefetchAdmin, 300);
      }
    }
  } catch {}
}

// Settings Sub-pages
const Blacklist = lazy(() => import("./pages/settings/Blacklist"));
const ContentPageView = lazy(() => import("./pages/settings/ContentPage"));
const CustomerService = lazy(() => import("./pages/settings/CustomerService"));
const UserManagement = lazy(() => import("./pages/settings/UserManagement"));

// Lazy loaded components - defer non-critical
const GenderSelectionModal = lazy(() => import("@/components/auth/GenderSelectionModal").then(m => ({ default: m.GenderSelectionModal })));

// DEFERRED IMPORTS - Non-critical UI components (use lazyRetry for chunk resilience)
const NetworkStatusBar = lazy(lazyRetry(() => import("@/components/common/NetworkStatusBar")));

const NotificationSettings = lazy(lazyRetry(() => import("./pages/settings/NotificationSettings")));
const GlobalScreenSecurity = lazy(lazyRetry(() => import("@/components/common/GlobalScreenSecurity")));
// EAGER import: must be active from cold start so the very first hardware
// back press never falls through to the system default (which would exit the app).
import { AndroidBackButtonHandler } from "@/components/common/AndroidBackButtonHandler";
import { MandatoryPermissionsGate } from "@/components/common/MandatoryPermissionsGate";
const SplashScreen = lazy(lazyRetry(() => import("@/components/common/SplashScreen")));
import ScrollToTop from "@/components/common/ScrollToTop";



// =============================================
// OPTIMIZED QUERY CLIENT - Minimal config for speed
// =============================================
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 300, // 5 minutes - ultra-fast section switching, realtime handles live updates
      gcTime: 1000 * 60 * 120, // 2 hour cache - never re-fetch old data unnecessarily
      refetchOnWindowFocus: false, // Disabled - app resume handler handles this explicitly
      refetchOnMount: false, // Prevent mount-time refetch storm across sections
      refetchOnReconnect: false, // Avoid mass refetch when connection flaps; realtime handles updates
      retry: (failureCount: number) => {
        const { queryRetryCount } = getAdaptiveNetworkProfile();
        return failureCount < queryRetryCount;
      },
      retryDelay: (attemptIndex: number) => {
        const { queryRetryBaseDelayMs, queryRetryMaxDelayMs } = getAdaptiveNetworkProfile();
        return Math.min(queryRetryBaseDelayMs * 2 ** Math.max(0, attemptIndex - 1), queryRetryMaxDelayMs);
      },
      placeholderData: (prev: any) => prev, // 🚀 Show previous data while refetching - no loading flickers
      networkMode: 'offlineFirst', // 🚀 Show cached data immediately, fetch in background
    },
  },
});

// 🚀 INSTANT LOAD: Persist React Query cache to localStorage so on every app
// launch / reload / route switch, all previously-fetched data appears in 0ms.
// Realtime + background refetch silently update under the hood.
const __queryPersister = (() => {
  try {
    if (typeof window === 'undefined') return undefined;
    return createSyncStoragePersister({
      storage: window.localStorage,
      key: 'merilive-rq-cache-v1',
      throttleTime: 1000,
    });
  } catch {
    return undefined;
  }
})();

// Export queryClient for use in app resume handler
export { queryClient };

// =============================================
// ROUTE LOADER - visible fallback to prevent blank/black screen during lazy chunk loads
// =============================================
const PageLoader = memo(({ message = "Loading MeriLive..." }: { message?: string }) => (
  <div className="min-h-screen w-full bg-background flex items-center justify-center px-6">
    <div className="w-full max-w-sm rounded-2xl border border-border bg-card/80 p-6 text-center shadow-sm backdrop-blur-sm">
      <div className="mb-4 flex justify-center">
        <div className="h-3 w-3 animate-pulse rounded-full bg-primary" />
      </div>
      <h1 className="text-base font-semibold text-foreground">MeriLive</h1>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
    </div>
  </div>
));

// Stable, memoized fallback used by the lazy <Routes> Suspense boundary.
// Memoized so the fallback element identity does NOT change between renders
// — that prevents React from un/remounting it on every parent update, which
// previously caused a brief flicker between routes. Light cream background
// + bg-background base layer guarantees no dark flash even if a chunk
// arrives mid-paint. Spinner is locked to viewport center via fixed
// inset-0 + flex centering and ignores parent scroll position.
const RouteSuspenseFallback = memo(() => (
  <div
    className="fixed inset-0 z-[60] flex items-center justify-center bg-background animate-fade-in"
    style={{
      background:
        'radial-gradient(ellipse at center, #FFFBF2 0%, #FAF5EA 60%, #F5EFDF 100%)',
      // Respect mobile safe-areas so the spinner is visually centered on
      // notched devices instead of being pushed under the status bar.
      paddingTop: 'env(safe-area-inset-top)',
      paddingBottom: 'env(safe-area-inset-bottom)',
    }}
    aria-busy="true"
    aria-live="polite"
    role="status"
  >
    <div className="flex flex-col items-center gap-3">
      <div className="h-12 w-12 rounded-full border-[3px] border-pink-200 border-t-pink-500 animate-spin shadow-[0_0_24px_rgba(236,72,153,0.25)]" />
      <div className="text-[11px] uppercase tracking-[0.25em] text-slate-500 font-semibold">
        Loading
      </div>
    </div>
  </div>
));
RouteSuspenseFallback.displayName = "RouteSuspenseFallback";

// =============================================
// MAIN APP COMPONENT
// =============================================
// Deferred bridge - loads hooks dynamically after first paint
const RealtimeQuerySyncBridge = lazy(lazyRetry(() => import("./hooks/useRealtimeQuerySync").then(m => {
  const Bridge = () => { m.useRealtimeQuerySync(); return null; };
  return { default: Bridge };
})));

// Android system UI integration (status bar, navigation bar)
const NativeSystemUIBridge = lazy(lazyRetry(() => import("./hooks/useNativeSystemUI").then(m => {
  const Bridge = () => { m.useNativeSystemUI(); return null; };
  return { default: Bridge };
})));

const RouteScopedBackgroundHooks = memo(({ userId, hasSession }: { userId: string | null; hasSession: boolean }) => {
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith('/admin');
  const isPublicPage = ['/agency-policy', '/policies-benefits', '/helper-policy', '/policies', '/about', '/contact', '/agency-signup', '/create-agency', '/become-sub-agent', '/payroll-helper-guide', '/link', '/smart-link', '/privacy-policy', '/terms', '/google-library-order-rules', '/join-agency', '/account-deletion', '/delete-account'].some(r => location.pathname.startsWith(r));
  const showPopups = !isAdminRoute && !isPublicPage && hasSession;

  return (
    <>
      {!isAdminRoute && <Suspense fallback={null}><RealtimeQuerySyncBridge /></Suspense>}
      <Suspense fallback={null}><DeferredAppHooks userId={userId} /></Suspense>
      {showPopups ? (
        <ErrorBoundary componentName="OptionalAppOverlays" fallback={null}>
          <WelcomeOnboarding />
          <EventPopupBanner />
          <DailyLoginPopup />
          <RatingRewardPopup />
        </ErrorBoundary>
      ) : null}
      {!isAdminRoute && (
        <>
          <AppUpdateChecker />
          <NetworkStatusBar />
          <PushNotificationInitializer />
        </>
      )}
    </>
  );
});

RouteScopedBackgroundHooks.displayName = 'RouteScopedBackgroundHooks';

// ⚡ INSTANT-BOOT helper: synchronously detect a stored Supabase session in
// localStorage so we can skip the full-screen "Checking your session..." loader
// on the very first paint. The actual session object is still loaded
// asynchronously by initSession(), but we can render the UI immediately.
const hasStoredSupabaseSession = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      // supabase-js v2 stores under keys like "sb-<ref>-auth-token"
      if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
        const raw = localStorage.getItem(key);
        if (raw && raw.length > 20) return true;
      }
    }
  } catch {}
  return false;
};

const App = () => {
  const [session, setSession] = useState<Session | null>(null);
  // ⚡ Skip the splash loader entirely if we already have a stored session.
  // initSession() runs in the background and hydrates the real Session object.
  const [loading, setLoading] = useState(() => !hasStoredSupabaseSession());
  const [showGenderModal, setShowGenderModal] = useState(false);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [maintenanceMode, setMaintenanceMode] = useState<{ enabled: boolean; message: string } | null>(null);
  // Show splash once per tab session, and never on /admin or auth callback routes.
  const [showSplash, setShowSplash] = useState(() => {
    try {
      if (typeof window === 'undefined') return false;
      if (sessionStorage.getItem('splash_shown') === '1') return false;
      const p = window.location.pathname;
      if (p.startsWith('/admin') || p.startsWith('/auth/callback') || p.startsWith('/~oauth')) return false;
      return true;
    } catch { return false; }
  });
  

  // 🛠️ MAINTENANCE MODE CHECK - fetch only, no dedicated realtime channel
  // app_settings realtime is already handled by useGlobalSettings
  useEffect(() => {
    const checkMaintenance = async () => {
      try {
        const { data, error } = await supabase
          .from('app_settings')
          .select('setting_value')
          .eq('setting_key', 'maintenance_mode')
          .maybeSingle();

        if (error) throw error;
        if (data?.setting_value) {
          setMaintenanceMode(data.setting_value as any);
        }
      } catch (e) {
        console.error('[App] Maintenance check failed:', e);
      }
    };
    checkMaintenance();
  }, []);

  const runLegacyProfileSync = async (userId: string) => {
    if (!userId) return;

    try {
      const result = await triggerLegacyProfileSync(userId);

      if (result?.synced) {
        localStorage.removeItem('meri_level_cache');
        clearBalanceCache();
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['profile', userId] }),
          queryClient.invalidateQueries({ queryKey: ['user-balance', userId] }),
        ]);
      }
    } catch (error) {
      console.warn('[App] legacy profile sync failed:', error);
    }
  };

  // 🚀 INSTANT PREFETCH — Load gifts, balance, and profile data immediately on auth
  const isAuthenticated = !!session?.user;
  useEffect(() => {
    if (!isAuthenticated || !session?.user?.id) return;
    
    // Prefetch gifts immediately (no delay)
    import('@/hooks/useGiftPrefetch').then(m => m.prefetchGifts()).catch(() => {});
    
    void runLegacyProfileSync(session.user.id);
    
    // Prefetch user profile & balance into QueryClient cache
    const userId = session.user.id;
    queryClient.prefetchQuery({
      queryKey: ['profile', userId],
      queryFn: async () => {
        const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
        return data;
      },
      staleTime: 1000 * 300,
    });
    queryClient.prefetchQuery({
      queryKey: ['user-balance', userId],
      queryFn: async () => {
        const { data } = await supabase.from('profiles').select('coins, beans, diamonds, pending_earnings').eq('id', userId).single();
        return data;
      },
      staleTime: 1000 * 60,
    });
  }, [isAuthenticated, session?.user?.id]);
  
  // 🔐 SINGLE DEVICE SESSION & APP RESUME - Deferred via lazy component
  const isAdminRoute = window.location.pathname.startsWith('/admin');
  const isNativeApp = Capacitor.isNativePlatform();

  // Preload core routes IMMEDIATELY on mount — don't wait for idle
  useEffect(() => {
    // 🚀 Initialize WebView performance tuning only inside native WebView
    if (Capacitor.isNativePlatform()) {
      initWebViewPerformance();
    }

    preloadCoreRoutes();

    // 🖼️ INSTANT-IMAGE: cache-first SW + warm banner cache so all app images load in ~0ms
    import('@/utils/registerImageCacheSW').then(m => {
      m.registerImageCacheSW().then(() => m.warmAppImageCache());
    }).catch(() => {});

    // Defer SVGA prewarm to idle
    if (typeof (window as any).requestIdleCallback === 'function') {
      const idleId = (window as any).requestIdleCallback(() => prewarmSVGA(), { timeout: 3000 });
      return () => { if (typeof (window as any).cancelIdleCallback === 'function') (window as any).cancelIdleCallback(idleId); };
    }
    const t = setTimeout(() => prewarmSVGA(), 800);
    return () => clearTimeout(t);
  }, []);

  // ⚡ REALTIME → REACT QUERY BRIDGE moved inside QueryClientProvider (see RealtimeQuerySyncBridge below)

  useEffect(() => {
    // Initialize error logging service (deferred)
    import('./services/ErrorLoggingService').then(m => m.default.initialize());

    // 🚀 INSTANT-LOAD: warm up most-visited route chunks during browser idle time
    // so the user's first navigation to any of them is 0ms.
    import('./utils/idleRoutePrefetch').then(m => m.startIdleRoutePrefetch()).catch(() => {});

    // 🔐 ENCRYPTED STORAGE - Migrate plaintext sensitive data to encrypted
    if (secureStorage.isAvailable()) {
      secureStorage.migrateToEncrypted();
    }

    // 🔒 SECURE LINK GUARD - Block unauthorized external links in native app
    let cleanupLinkGuard: (() => void) | undefined;
    if (Capacitor.isNativePlatform()) {
      cleanupLinkGuard = initSecureLinkGuard();
      console.log('[Security] Secure Link Guard activated for native app');
    }
    
    let mounted = true;

    // Handle deep links for OAuth callback in native apps
    let appUrlOpenListenerPromise: ReturnType<typeof CapApp.addListener> | null = null;
    if (Capacitor.isNativePlatform()) {
      appUrlOpenListenerPromise = CapApp.addListener('appUrlOpen', async ({ url }) => {
        console.log('Deep link received:', url);
        
        if (url.includes('auth/callback') || url.includes('access_token') || url.includes('code=')) {
          try {
            await Browser.close();
            
            // PRODUCTION: Use merilive.com domain for URL parsing
            const urlObj = new URL(url.replace('com.merilive.app://', 'https://merilive.com/'));
            const accessToken = urlObj.searchParams.get('access_token') || urlObj.hash?.split('access_token=')[1]?.split('&')[0];
            const refreshToken = urlObj.searchParams.get('refresh_token') || urlObj.hash?.split('refresh_token=')[1]?.split('&')[0];
            
            if (accessToken && refreshToken) {
              await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken
              });
            } else {
              const { data } = await supabase.auth.getSession();
              if (data?.session) {
                setSession(data.session);
              }
            }
          } catch (error) {
            console.error('OAuth callback error:', error);
          }
        }
      });
    }

    // Get initial session - INSTANT from localStorage, recovery in background
    const initSession = async () => {
      try {
        // 🔒 NATIVE: wait for Capacitor Preferences → localStorage hydration
        // before reading the session, so a freshly-killed app launch sees the
        // persisted Supabase keys and stays logged in.
        try {
          const { waitForNativeAuthHydration } = await import('@/integrations/supabase/nativeStorage');
          await waitForNativeAuthHydration();
        } catch { /* ignore — web has nothing to hydrate */ }

        // ⚡ STEP 1: getSession() reads from localStorage — near-instant
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
          if (mounted) {
            setSession(session);
            setCachedUser({ id: session.user.id, email: session.user.email ?? undefined });
            setLoading(false); // ⚡ Unblock UI immediately
          }
          void runLegacyProfileSync(session.user.id);
          return;
        }

        // No local session — unblock UI NOW, attempt recovery in background
        if (mounted) {
          setSession(null);
          setLoading(false); // ⚡ Never block UI waiting for network
        }

        // 🔒 BACKGROUND RECOVERY — UI is already interactive
        const recoverSession = async () => {
          // RECOVERY 1: Try refreshing (refresh token may still be valid in localStorage)
          try {
            const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
            if (refreshed?.session?.user && !refreshErr) {
              console.log('[App] ✅ Session recovered via background refresh!');
              if (mounted) {
                setSession(refreshed.session);
                setCachedUser({ id: refreshed.session.user.id, email: refreshed.session.user.email ?? undefined });
                saveSessionToNative({
                  access_token: refreshed.session.access_token,
                  refresh_token: refreshed.session.refresh_token,
                  expires_at: refreshed.session.expires_at,
                });
              }
              void runLegacyProfileSync(refreshed.session.user.id);
              return;
            }
          } catch (e) {
            console.log('[App] Background refresh failed, continuing...');
          }

          // RECOVERY 2: Native-only — Capacitor Preferences storage
          if (Capacitor.isNativePlatform()) {
            try {
              const nativeSession = await getSessionFromNative();
              if (nativeSession?.refresh_token) {
                console.log('[App] 🔄 Restoring session from native storage...');
                const { data: restored, error } = await supabase.auth.setSession({
                  access_token: nativeSession.access_token,
                  refresh_token: nativeSession.refresh_token,
                });
                if (restored?.session?.user && !error) {
                  console.log('[App] ✅ Session restored from native storage!');
                  if (mounted) {
                    setSession(restored.session);
                    setCachedUser({ id: restored.session.user.id, email: restored.session.user.email ?? undefined });
                  }
                  void runLegacyProfileSync(restored.session.user.id);
                  return;
                }
              }
            } catch (e) {
              console.error('[App] Native restore error:', e);
            }
          }
        };

        // Fire and forget — don't block UI
        recoverSession().catch(e => console.error('[App] Background recovery failed:', e));
      } catch (error) {
        console.error('[App] initSession failed:', error);
        if (mounted) {
          setSession(null);
          setLoading(false);
        }
      }
    };
    
    initSession();

    // Global forced app re-entry (admin emergency reset)
    const appReentryChannel = supabase
      .channel('global-app-reentry')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'app_settings',
          filter: 'setting_key=eq.global_app_reentry',
        },
        (payload) => {
          const nextValue = (payload.new as any)?.setting_value;
          const nonce = nextValue && typeof nextValue === 'object' ? nextValue.nonce : null;
          if (!nonce) return;

          const nonceStr = String(nonce);
          const lastNonce = localStorage.getItem('meri_last_global_reentry_nonce');
          if (lastNonce === nonceStr) return;

          localStorage.setItem('meri_last_global_reentry_nonce', nonceStr);

          if (window.location.pathname.startsWith('/admin')) {
            console.warn('[App] 🚨 Global app re-entry signal ignored on admin route.');
            return;
          }

          console.warn('[App] 🚨 Global app re-entry signal received. Reloading app...');

          setTimeout(() => {
            window.location.replace('/');
            window.location.reload();
          }, 350);
        }
      )
      .subscribe();

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!mounted) return;
        
        if (session?.user) {
          // Hard block banned users immediately after any sign-in/session restore
          (async () => {
            try {
              const { data: banStatus } = await (supabase.rpc as any)('check_ban_on_login', {
                p_user_id: session.user.id,
              });

              if ((banStatus as any)?.banned) {
                localStorage.setItem('meri_manual_logout', 'true');
                await supabase.auth.signOut({ scope: 'local' });
                setSession(null);
                invalidateCachedUser();
                await clearNativeSession();
                window.location.replace('/auth');
                return;
              }
            } catch (err) {
              console.error('[App] ban check failed:', err);
            }
          })();

          setSession(session);
          // Clear manual logout flag on successful sign-in
          localStorage.removeItem('meri_manual_logout');
          // Keep auth cache in sync
          setCachedUser({ id: session.user.id, email: session.user.email ?? undefined });
          // 🔒 Save session to native storage so it survives app kills
          if (session.access_token && session.refresh_token) {
            saveSessionToNative({
              access_token: session.access_token,
              refresh_token: session.refresh_token,
              expires_at: session.expires_at,
            });
          }
          void runLegacyProfileSync(session.user.id);
        } else if (event === 'SIGNED_OUT') {
          // 🛡️ CRITICAL: Only clear session if user MANUALLY logged out
          const isManualLogout = localStorage.getItem('meri_manual_logout') === 'true';
          
          if (isManualLogout) {
            console.log('[App] 🔓 Manual logout detected — clearing session');
            localStorage.removeItem('meri_manual_logout');
            setSession(null);
            invalidateCachedUser();
            clearBalanceCache();
            // Fire-and-forget — do not block any subsequent navigation/state updates
            void Promise.resolve(clearNativeSession()).catch(() => {});
          } else {
            // 🛡️ AUTO sign-out COMPLETELY BLOCKED — do absolutely nothing
            // Do NOT call refreshSession() here as it can trigger another SIGNED_OUT loop
            // The session state stays as-is, user stays logged in
            console.warn('[App] 🛡️ BLOCKED auto sign-out event — ignoring completely, user stays logged in');
          }
        }
        
        if (event === 'SIGNED_IN' && session?.user) {
          if (Capacitor.isNativePlatform()) {
            Browser.close().catch(() => {});
          }
          
          // Check for pending agency claim from browser-based sub-agency form
          setTimeout(async () => {
            if (!mounted) return;
            
            try {
              const pendingClaimStr = localStorage.getItem('meri_pending_agency_claim');
              if (pendingClaimStr) {
                const pendingClaim = JSON.parse(pendingClaimStr);
                console.log('[App] Found pending agency claim:', pendingClaim);
                
                // Check if this user's phone matches the pending claim
                const { data: profile } = await supabase
                  .from('profiles')
                  .select('phone')
                  .eq('id', session.user.id)
                  .single();
                
                // Also check if agency still exists and has no owner
                const { data: agency } = await supabase
                  .from('agencies')
                  .select('id, owner_id')
                  .eq('id', pendingClaim.agencyId)
                  .single();
                
                if (agency && !agency.owner_id) {
                  // Claim the agency - assign owner
                  const { error: claimError } = await supabase
                    .from('agencies')
                    .update({ owner_id: session.user.id })
                    .eq('id', pendingClaim.agencyId);
                  
                  if (!claimError) {
                    console.log('[App] Agency claimed successfully via owner sync trigger!');
                    localStorage.removeItem('meri_pending_agency_claim');
                  }
                } else {
                  // Agency already claimed or doesn't exist - clear the pending claim
                  localStorage.removeItem('meri_pending_agency_claim');
                }
              }
            } catch (error) {
              console.error('[App] Error processing pending agency claim:', error);
              localStorage.removeItem('meri_pending_agency_claim');
            }
          }, 1000);
          
          // Check gender - defer to avoid blocking
          setTimeout(async () => {
            if (!mounted || window.location.pathname.startsWith('/admin')) return;
            
            try {
              await runLegacyProfileSync(session.user.id);

              let { data: profile } = await supabase
                .from('profiles')
                .select('id, gender')
                .eq('id', session.user.id)
                .maybeSingle();

              // If profile row is still missing for any old account, repair it immediately
              if (!profile) {
                const { data: authUserData } = await supabase.auth.getUser();
                const authUser = authUserData.user;
                if (authUser?.id === session.user.id) {
                  await supabase.rpc('ensure_profile_row_from_auth' as any, {
                    _user_id: authUser.id,
                    _email: authUser.email ?? null,
                    _raw_user_meta_data: authUser.user_metadata ?? {},
                  });

                  const repaired = await supabase
                    .from('profiles')
                    .select('id, gender')
                    .eq('id', session.user.id)
                    .maybeSingle();
                  profile = repaired.data ?? null;
                }
              }

              // Trust database state over localStorage
              if (profile?.gender && profile.gender !== 'other') {
                localStorage.setItem(`gender_selected_${session.user.id}`, 'true');
                return;
              }

              localStorage.removeItem(`gender_selected_${session.user.id}`);
              setPendingUserId(session.user.id);
              setShowGenderModal(true);
            } catch (error) {
              console.error('Gender check error:', error);
            }
          }, 500); // Delay gender check
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
      supabase.removeChannel(appReentryChannel);
      cleanupLinkGuard?.();
      if (Capacitor.isNativePlatform()) {
        void appUrlOpenListenerPromise?.then((listener) => listener.remove()).catch(() => {});
      }
    };
  }, []);

  // 🔒 BROWSER GUARD - Block browser access, only allow native app + Lovable preview
  const isNative = Capacitor.isNativePlatform();
  const hostname = window.location.hostname;
  const currentPath = window.location.pathname;
  
  // Allow Lovable preview/development environments
  const isLovablePreview = hostname.includes('lovable.app') || 
                           hostname.includes('lovableproject.com') || 
                           hostname === 'localhost' || 
                           hostname === '127.0.0.1';
  
  // Routes allowed in public browser
  const BROWSER_ALLOWED_ROUTES = [
    '/admin', '/agency-signup', '/smart-link', '/link', 
    '/policies', '/policies-benefits', '/about', '/google-library-order-rules', '/policies/',
    '/agency-policy', '/helper-policy', '/agency',
    '/privacy-policy', '/terms', '/contact', '/account-deletion', '/delete-account', '/become-sub-agent', '/payroll-helper-guide',
    '/create-agency', '/join-agency',
    '/auth/callback', '/reset-password', '/~oauth'
  ];
  
  const isBrowserAllowedRoute = BROWSER_ALLOWED_ROUTES.some(route => currentPath.startsWith(route));

  if (loading) {
    // No full-screen "Checking your session…" loader — render nothing so the
    // app feels instant. Auth-gated routes already handle their own redirect.
    return null;
  }

  // 🔒 BROWSER GUARD: Block public browser access to protected app routes
  // Only native app, Lovable preview, OR authenticated users can access the full app
  // Authenticated users are allowed from any browser (Chrome, Safari, etc.)
  if (!isNative && !isLovablePreview && !isBrowserAllowedRoute && !session) {
    // Redirect unauthenticated browser users to auth page
    if (currentPath !== '/auth' && !currentPath.startsWith('/auth')) {
      window.location.replace('/auth');
      return null; // ⚡ no full-screen spinner — instant redirect
    }
  }

  // 🛠️ MAINTENANCE MODE SCREEN - Block all user access (allow admin)
  const isAdmin = window.location.pathname.startsWith('/admin');
  if (maintenanceMode?.enabled && !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6">
        <div className="flex flex-col items-center gap-6 text-center max-w-md">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-4xl">🔧</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Under Maintenance</h1>
          <p className="text-muted-foreground text-base leading-relaxed">
            {maintenanceMode.message || "We're upgrading our servers. We'll be back shortly!"}
          </p>
          <div className="w-12 h-1 rounded-full bg-primary/30" />
          <p className="text-xs text-muted-foreground/60">MeriLive</p>
        </div>
      </div>
    );
  }

  // Domain-based routing: ONLY .top domain shows the public landing page.
  // merilive.com is the MAIN APP domain — must load the full app, NOT landing.
  const publicLandingHosts = ['merilive.top', 'www.merilive.top'];
  const isPublicLandingHost = publicLandingHosts.includes(window.location.hostname);
  const publicLandingAllowedPaths = ['/agency-policy', '/helper-policy', '/policies', '/about', '/policies-benefits', '/agency-signup', '/become-sub-agent', '/payroll-helper-guide', '/create-agency', '/join-agency', '/auth', '/google-library-order-rules', '/privacy-policy', '/terms', '/contact', '/account-deletion', '/delete-account'];
  const isPublicLandingSubRoute = isPublicLandingHost && publicLandingAllowedPaths.some(p => currentPath.startsWith(p));
  
  if (isPublicLandingHost && !isPublicLandingSubRoute) {
    return (
      <Suspense fallback={null}>
        <LandingPage />
      </Suspense>
    );
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: __queryPersister as any,
        maxAge: 1000 * 60 * 60 * 24 * 7, // keep cache 7 days
        buster: 'merilive-v1',
      }}
    >
      {showSplash && (
        <Suspense fallback={null}>
          <SplashScreen onComplete={() => { try { sessionStorage.setItem('splash_shown', '1'); } catch {} setShowSplash(false); }} />
        </Suspense>
      )}
      <Suspense fallback={null}><NativeSystemUIBridge /></Suspense>
      <RealtimeProvider notifyOnImportantUpdates={!isAdminRoute}>
        <PresenceProvider>
          <TooltipProvider>
            <Toaster />
            <SonnerToaster />
            <BrowserRouter>
              <ScrollToTop />
              <Suspense fallback={null}><DeepLinkHandler /></Suspense>
              <AndroidBackButtonHandler />
              {session ? <MandatoryPermissionsGate /> : null}
              <Suspense fallback={null}><GlobalScreenSecurity /></Suspense>
              {/* Deferred hooks - route scoped so admin pages stay static */}
              <RouteScopedBackgroundHooks userId={session?.user?.id || null} hasSession={!!session} />
              <CallProvider>
                  {/* Stable, light-themed Suspense fallback. Memoized identity
                       prevents flicker on parent re-renders during route swaps. */}
                  <Suspense fallback={<RouteSuspenseFallback />}>
                  <Routes>
                {/* ============================================= */}
                {/* PUBLIC ROUTES - No authentication required */}
                {/* ============================================= */}
                <Route path="/auth" element={session ? <Navigate to="/" /> : <Auth />} />
                <Route path="/auth/callback" element={<AuthCallback />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/unsubscribe" element={<Unsubscribe />} />
                <Route path="/smart-link" element={<SmartLink />} />
                <Route path="/link" element={<SmartLink />} />
                <Route path="/policies" element={<PublicPolicies />} />
                <Route path="/policies/:policyId" element={<PolicyDetail />} />
                <Route path="/privacy" element={<Navigate to="/privacy-policy" replace />} />
                <Route path="/privacy-policy" element={<PublicPrivacyPolicy />} />
                <Route path="/terms" element={<PublicPrivacyPolicy />} />
                <Route path="/account-deletion" element={<PublicAccountDeletion />} />
                <Route path="/delete-account" element={<Navigate to="/account-deletion" replace />} />
                <Route path="/google-library-order-rules" element={<GoogleLibraryOrderRules />} />
                <Route path="/about" element={<About />} />
                <Route path="/contact" element={<PublicContact />} />
                <Route path="/agency-policy" element={<AgencyPolicy />} />
                <Route path="/policies-benefits" element={<PoliciesAndBenefits />} />
                <Route path="/helper-policy" element={<AgencyPolicy />} />
                <Route path="/sync-test" element={<SyncTest />} />
                
                {/* ============================================= */}
                {/* PROTECTED ROUTES - Authentication required */}
                {/* Users MUST sign up first before accessing these */}
                {/* ============================================= */}
                <Route path="/" element={<ProtectedRoute session={session}><Index /></ProtectedRoute>} />
                <Route path="/discover" element={<ProtectedRoute session={session}><Discover /></ProtectedRoute>} />
                <Route path="/live" element={<ProtectedRoute session={session}><Live /></ProtectedRoute>} />
                <Route path="/live/:id" element={<ProtectedRoute session={session}><LiveStreamKeyWrapper /></ProtectedRoute>} />
                <Route path="/chat" element={<ProtectedRoute session={session}><Chat /></ProtectedRoute>} />
                <Route path="/profile" element={<ProtectedRoute session={session}><ErrorBoundary componentName="Profile"><Profile /></ErrorBoundary></ProtectedRoute>} />
                <Route path="/recharge" element={<ProtectedRoute session={session}><Recharge /></ProtectedRoute>} />
                <Route path="/payment-success" element={<ProtectedRoute session={session}><PaymentSuccess /></ProtectedRoute>} />
                <Route path="/edit-profile" element={<ProtectedRoute session={session}><EditProfile /></ProtectedRoute>} />
                <Route path="/level" element={<ProtectedRoute session={session}><Level /></ProtectedRoute>} />
                <Route path="/shop" element={<ProtectedRoute session={session}><Shop /></ProtectedRoute>} />
                <Route path="/vip" element={<ProtectedRoute session={session}><VIP /></ProtectedRoute>} />
                <Route path="/invitation" element={<ProtectedRoute session={session}><Invitation /></ProtectedRoute>} />
                <Route path="/tasks" element={<ProtectedRoute session={session}><Tasks /></ProtectedRoute>} />
                <Route path="/host-bonus-ledger" element={<ProtectedRoute session={session}><HostBonusLedger /></ProtectedRoute>} />
                <Route path="/settings" element={<ProtectedRoute session={session}><Settings /></ProtectedRoute>} />
                <Route path="/settings/blacklist" element={<ProtectedRoute session={session}><Blacklist /></ProtectedRoute>} />
                <Route path="/settings/privacy-policy" element={<ProtectedRoute session={session}><ContentPageView /></ProtectedRoute>} />
                <Route path="/settings/user-agreement" element={<ProtectedRoute session={session}><ContentPageView /></ProtectedRoute>} />
                <Route path="/settings/about-us" element={<ProtectedRoute session={session}><ContentPageView /></ProtectedRoute>} />
                <Route path="/settings/user-management" element={<ProtectedRoute session={session}><UserManagement /></ProtectedRoute>} />
                <Route path="/settings/notifications" element={<ProtectedRoute session={session}><NotificationSettings /></ProtectedRoute>} />
                <Route path="/settings/customer-service" element={<ProtectedRoute session={session}><CustomerService /></ProtectedRoute>} />
                <Route path="/support" element={<Navigate to="/settings/customer-service" replace />} />
                <Route path="/rewards" element={<ProtectedRoute session={session}><Rewards /></ProtectedRoute>} />
                <Route path="/parcels" element={<ProtectedRoute session={session}><Parcels /></ProtectedRoute>} />
                <Route path="/agency" element={<ProtectedRoute session={session}><Agency /></ProtectedRoute>} />
                <Route path="/agent-rank" element={<ProtectedRoute session={session}><AgentRank /></ProtectedRoute>} />
                <Route path="/leaderboard" element={<ProtectedRoute session={session}><Leaderboard /></ProtectedRoute>} />
                <Route path="/pk-leaderboard/:id" element={<ProtectedRoute session={session}><PKLeaderboard /></ProtectedRoute>} />
                <Route path="/host-application" element={<ProtectedRoute session={session}><HostApplication /></ProtectedRoute>} />
                <Route path="/agent-wallet" element={<ProtectedRoute session={session}><AgentWallet /></ProtectedRoute>} />
                <Route path="/transfer-history" element={<ProtectedRoute session={session}><TransferHistory /></ProtectedRoute>} />
                <Route path="/create-agency" element={<ProtectedRoute session={session}><CreateAgency /></ProtectedRoute>} />
                <Route path="/agency-signup" element={<AgencySignup />} />
                <Route path="/agency-dashboard" element={<ProtectedRoute session={session}><AgencyDashboard /></ProtectedRoute>} />
                <Route path="/agency-withdrawal" element={<ProtectedRoute session={session}><AgencyWithdrawal /></ProtectedRoute>} />
                <Route path="/agency-coin-exchange" element={<ProtectedRoute session={session}><AgencyCoinExchange /></ProtectedRoute>} />
                <Route path="/agency-coin-trader" element={<ProtectedRoute session={session}><AgencyCoinTrader /></ProtectedRoute>} />
                <Route path="/agency-transfer-history" element={<ProtectedRoute session={session}><AgencyTransferHistory /></ProtectedRoute>} />
                <Route path="/agency-commission-history" element={<ProtectedRoute session={session}><AgencyCommissionHistory /></ProtectedRoute>} />
                <Route path="/agency-host-management" element={<ProtectedRoute session={session}><AgencyHostManagement /></ProtectedRoute>} />
                <Route path="/join-agency" element={<ProtectedRoute session={session}><JoinAgency /></ProtectedRoute>} />
                <Route path="/become-sub-agent" element={<BecomeSubAgent />} />
                <Route path="/agency-details" element={<ProtectedRoute session={session}><AgencyDetails /></ProtectedRoute>} />
                <Route path="/host-transfer-history" element={<ProtectedRoute session={session}><HostTransferHistory /></ProtectedRoute>} />
                <Route path="/call-history" element={<ProtectedRoute session={session}><CallHistory /></ProtectedRoute>} />
                <Route path="/following" element={<ProtectedRoute session={session}><FollowingList /></ProtectedRoute>} />
                <Route path="/following-list" element={<ProtectedRoute session={session}><FollowingList /></ProtectedRoute>} />
                <Route path="/search" element={<ProtectedRoute session={session}><SearchUsers /></ProtectedRoute>} />
                <Route path="/recharge-history" element={<ProtectedRoute session={session}><RechargeHistory /></ProtectedRoute>} />
                
                <Route path="/tags" element={<ProtectedRoute session={session}><Tags /></ProtectedRoute>} />
                <Route path="/my-poster" element={<ProtectedRoute session={session}><MyPoster /></ProtectedRoute>} />
                <Route path="/host-dashboard" element={<ProtectedRoute session={session}><HostDashboard /></ProtectedRoute>} />
                <Route path="/host-verification" element={<ProtectedRoute session={session}><HostVerification /></ProtectedRoute>} />
                <Route path="/face-verification" element={<ProtectedRoute session={session}><FaceVerification /></ProtectedRoute>} />
                <Route path="/dev/face-pose-tests" element={<ProtectedRoute session={session}><FacePoseRegression /></ProtectedRoute>} />
                <Route path="/dev/avatar-ring-check" element={<ProtectedRoute session={session}><AvatarFrameRingCheck /></ProtectedRoute>} />
                <Route path="/helper-dashboard" element={<ProtectedRoute session={session}><HelperDashboard /></ProtectedRoute>} />
                <Route path="/level5-helper-dashboard" element={<ProtectedRoute session={session}><Level5HelperDashboard /></ProtectedRoute>} />
                <Route path="/payroll-helper-guide" element={<PayrollHelperGuide />} />
                <Route path="/party-rooms" element={<ProtectedRoute session={session}><PartyRooms /></ProtectedRoute>} />
                <Route path="/party/:roomId" element={<ProtectedRoute session={session}><PartyRoom /></ProtectedRoute>} />
                <Route path="/go-live" element={<ProtectedRoute session={session}><GoLive /></ProtectedRoute>} />
                <Route path="/reels" element={<ProtectedRoute session={session}><Reels /></ProtectedRoute>} />
                <Route path="/create-party" element={<ProtectedRoute session={session}><CreateParty /></ProtectedRoute>} />
                <Route path="/profile/:userId" element={<ProtectedRoute session={session}><ProfileDetail /></ProtectedRoute>} />
                <Route path="/profile-detail/:userId" element={<ProtectedRoute session={session}><ProfileDetail /></ProtectedRoute>} />
                
                {/* Games */}
                <Route path="/games" element={<ProtectedRoute session={session}><GamesHub /></ProtectedRoute>} />
                <Route path="/games/roulette" element={<ProtectedRoute session={session}><RoulettePage /></ProtectedRoute>} />
                <Route path="/games/ferris-wheel" element={<ProtectedRoute session={session}><FerrisWheelPage /></ProtectedRoute>} />
                <Route path="/games/teen-patti" element={<ProtectedRoute session={session}><TeenPattiPage /></ProtectedRoute>} />
                
                {/* Admin Panel - Protected by AdminAccessGuard */}
                {/* Shows blog page to unauthorized users, admin panel to authorized */}
                <Route path="/admin/auth" element={<AdminAccessGuard><AdminAuth /></AdminAccessGuard>} />
                <Route path="/admin/login" element={<AdminAccessGuard><AdminAuth /></AdminAccessGuard>} />
                <Route path="/admin" element={<AdminAccessGuard><AdminLayout /></AdminAccessGuard>}>
                  <Route index element={<SubAdminDashboardGuard><AdminDashboard /></SubAdminDashboardGuard>} />
                  <Route path="agencies" element={<AdminRouteGuard routeSegment="agencies"><AdminAgencies /></AdminRouteGuard>} />
                  <Route path="agencies/:agencyId" element={<AdminRouteGuard routeSegment="agencies"><AdminAgencyDetail /></AdminRouteGuard>} />
                  <Route path="user-management" element={<AdminRouteGuard routeSegment="user-management"><AdminUserManagement /></AdminRouteGuard>} />
                  <Route path="coin-traders" element={<AdminRouteGuard routeSegment="coin-traders"><AdminCoinTraders /></AdminRouteGuard>} />
                  <Route path="coin-traders/orders" element={<AdminRouteGuard routeSegment="coin-traders"><AdminTraderOrders /></AdminRouteGuard>} />
                  <Route path="coin-traders/transactions" element={<AdminRouteGuard routeSegment="coin-traders"><AdminTraderTransactions /></AdminRouteGuard>} />
                  <Route path="animation-store" element={<AdminRouteGuard routeSegment="animation-store"><AdminAnimationStore /></AdminRouteGuard>} />
                  <Route path="manual-topup" element={<AdminRouteGuard routeSegment="manual-topup"><AdminManualTopup /></AdminRouteGuard>} />
                  <Route path="topup-system" element={<AdminRouteGuard routeSegment="topup-system"><AdminTopupSystem /></AdminRouteGuard>} />
                  {/* Deprecated → unified Pricing Hub (Pkg30) */}
                  <Route path="commission-calculator" element={<Navigate to="/admin/pricing-hub" replace />} />
                  <Route path="party-backgrounds" element={<AdminRouteGuard routeSegment="party-backgrounds"><AdminPartyBackgrounds /></AdminRouteGuard>} />
                  {/* Deprecated → unified Pricing Hub (Pkg30) */}
                  <Route path="call-settings" element={<Navigate to="/admin/pricing-hub" replace />} />
                  <Route path="online-users" element={<AdminRouteGuard routeSegment="online-users"><AdminOnlineUsers /></AdminRouteGuard>} />
                  <Route path="today-calls" element={<AdminRouteGuard routeSegment="today-calls"><AdminTodayCalls /></AdminRouteGuard>} />
                  <Route path="game-settings" element={<AdminRouteGuard routeSegment="game-settings"><AdminGameSettings /></AdminRouteGuard>} />
                  <Route path="settings" element={<AdminRouteGuard routeSegment="settings"><AdminSettings /></AdminRouteGuard>} />
                  <Route path="device-management" element={<AdminRouteGuard routeSegment="device-management"><AdminDeviceManagement /></AdminRouteGuard>} />
                  <Route path="device-approvals" element={<AdminRouteGuard routeSegment="device-approvals"><AdminDeviceApprovals /></AdminRouteGuard>} />
                  <Route path="level-tiers" element={<AdminRouteGuard routeSegment="level-tiers"><AdminLevelTiers /></AdminRouteGuard>} />
                  <Route path="level-privileges" element={<AdminRouteGuard routeSegment="level-privileges"><AdminLevelPrivileges /></AdminRouteGuard>} />
                  <Route path="vip-privileges" element={<AdminRouteGuard routeSegment="vip-privileges"><AdminVIPPrivileges /></AdminRouteGuard>} />
                  <Route path="entry-bars" element={<AdminRouteGuard routeSegment="entry-bars"><AdminEntryBars /></AdminRouteGuard>} />
                  <Route path="invitation-settings" element={<AdminRouteGuard routeSegment="invitation-settings"><AdminInvitationSettings /></AdminRouteGuard>} />
                  <Route path="helper-applications" element={<AdminRouteGuard routeSegment="helper-applications"><AdminHelperApplications /></AdminRouteGuard>} />
                  <Route path="level5-helpers" element={<AdminRouteGuard routeSegment="level5-helpers"><AdminLevel5Helpers /></AdminRouteGuard>} />
                  <Route path="payroll-orders" element={<AdminRouteGuard routeSegment="payroll-orders"><AdminPayrollOrders /></AdminRouteGuard>} />
                  <Route path="game-server" element={<AdminRouteGuard routeSegment="game-server"><AdminGameServer /></AdminRouteGuard>} />
                  <Route path="game-providers" element={<AdminRouteGuard routeSegment="game-providers"><AdminGameProviders /></AdminRouteGuard>} />
                  <Route path="topup-payment-methods" element={<AdminRouteGuard routeSegment="topup-payment-methods"><AdminTopupPaymentMethods /></AdminRouteGuard>} />
                  <Route path="helper-requests" element={<AdminRouteGuard routeSegment="helper-requests"><AdminHelperRequests /></AdminRouteGuard>} />
                  <Route path="helper-diamond-pricing" element={<Navigate to="/admin/pricing-hub" replace />} />
                  <Route path="helper-management" element={<AdminRouteGuard routeSegment="helper-management"><AdminHelperManagement /></AdminRouteGuard>} />
                  <Route path="streams" element={<AdminRouteGuard routeSegment="streams"><AdminStreams /></AdminRouteGuard>} />
                  <Route path="recordings" element={<AdminRouteGuard routeSegment="recordings"><AdminRecordings /></AdminRouteGuard>} />
                  <Route path="party-rooms" element={<AdminRouteGuard routeSegment="party-rooms"><AdminPartyRooms /></AdminRouteGuard>} />
                  <Route path="gifts" element={<AdminRouteGuard routeSegment="gifts"><AdminGifts /></AdminRouteGuard>} />
                  <Route path="gift-transactions" element={<AdminRouteGuard routeSegment="gift-transactions"><AdminGiftTransactions /></AdminRouteGuard>} />
                  <Route path="error-log" element={<AdminRouteGuard routeSegment="error-log"><AdminErrorLog /></AdminRouteGuard>} />
                  <Route path="banners" element={<AdminRouteGuard routeSegment="banners"><AdminBanners /></AdminRouteGuard>} />
                  <Route path="campaign-banner-hub" element={<AdminRouteGuard routeSegment="campaign-banner-hub"><AdminCampaignBannerHub /></AdminRouteGuard>} />
                  <Route path="popup-banners" element={<AdminRouteGuard routeSegment="popup-banners"><AdminPopupBanners /></AdminRouteGuard>} />
                  <Route path="rating-banners" element={<AdminRouteGuard routeSegment="rating-banners"><AdminRatingBanners /></AdminRouteGuard>} />
                  <Route path="onboarding-slides" element={<AdminRouteGuard routeSegment="onboarding-slides"><AdminOnboardingSlides /></AdminRouteGuard>} />
                  <Route path="content" element={<AdminRouteGuard routeSegment="content"><AdminContent /></AdminRouteGuard>} />
                  {/* Pkg30 — UNIFIED Commission & Pricing Hub */}
                  <Route path="pricing-hub" element={<AdminRouteGuard routeSegment="pricing-hub"><AdminPricingHub /></AdminRouteGuard>} />
                  {/* Deprecated → unified Pricing Hub */}
                  <Route path="commissions" element={<Navigate to="/admin/pricing-hub" replace />} />
                  <Route path="withdrawals" element={<AdminRouteGuard routeSegment="withdrawals"><AdminWithdrawals /></AdminRouteGuard>} />
                  <Route path="branding" element={<AdminRouteGuard routeSegment="branding"><AdminBranding /></AdminRouteGuard>} />
                  <Route path="notification-templates" element={<AdminRouteGuard routeSegment="notification-templates"><AdminNotificationTemplates /></AdminRouteGuard>} />
                  <Route path="reports" element={<AdminRouteGuard routeSegment="reports"><AdminReports /></AdminRouteGuard>} />
                  <Route path="logs" element={<AdminRouteGuard routeSegment="logs"><AdminLogs /></AdminRouteGuard>} />
                  <Route path="coins" element={<AdminRouteGuard routeSegment="coins"><AdminCoins /></AdminRouteGuard>} />
                  <Route path="payment-gateways" element={<AdminRouteGuard routeSegment="payment-gateways"><AdminPaymentGateways /></AdminRouteGuard>} />
                  <Route path="transfer-scheduler" element={<AdminRouteGuard routeSegment="transfer-scheduler"><AdminTransferScheduler /></AdminRouteGuard>} />
                  <Route path="agency-commission-log" element={<AdminRouteGuard routeSegment="agency-commission-log"><AdminAgencyCommissionLog /></AdminRouteGuard>} />
                  <Route path="transfer-history" element={<AdminRouteGuard routeSegment="transfer-history"><AdminTransferHistory /></AdminRouteGuard>} />
                  <Route path="recharge-history" element={<AdminRouteGuard routeSegment="recharge-history"><AdminRechargeHistory /></AdminRouteGuard>} />
                  <Route path="recharge-campaigns" element={<AdminRouteGuard routeSegment="recharge-campaigns"><AdminRechargeCampaigns /></AdminRouteGuard>} />
                  <Route path="shop" element={<AdminRouteGuard routeSegment="shop"><AdminShop /></AdminRouteGuard>} />
                  <Route path="balance-deduction" element={<AdminRouteGuard routeSegment="balance-deduction"><AdminBalanceDeduction /></AdminRouteGuard>} />
                  <Route path="feature-levels" element={<AdminRouteGuard routeSegment="feature-levels"><AdminFeatureLevels /></AdminRouteGuard>} />
                  <Route path="live-bans" element={<AdminRouteGuard routeSegment="live-bans"><AdminLiveBans /></AdminRouteGuard>} />
                  <Route path="permanent-ban" element={<AdminRouteGuard routeSegment="permanent-ban"><AdminPermanentBan /></AdminRouteGuard>} />
                  <Route path="country-distribution" element={<AdminRouteGuard routeSegment="country-distribution"><AdminCountryDistribution /></AdminRouteGuard>} />
                  <Route path="face-violations" element={<AdminRouteGuard routeSegment="face-violations"><AdminFaceViolations /></AdminRouteGuard>} />
                  <Route path="reels" element={<AdminRouteGuard routeSegment="reels"><AdminReels /></AdminRouteGuard>} />
                  <Route path="party-banners" element={<AdminRouteGuard routeSegment="party-banners"><AdminPartyBanners /></AdminRouteGuard>} />
                  <Route path="app-version" element={<AdminRouteGuard routeSegment="app-version"><AdminAppVersion /></AdminRouteGuard>} />
                  <Route path="frames" element={<AdminRouteGuard routeSegment="frames"><AdminFrames /></AdminRouteGuard>} />
                  <Route path="role-frames" element={<AdminRouteGuard routeSegment="role-frames"><AdminRoleFrames /></AdminRouteGuard>} />
                  <Route path="chat-bubbles" element={<AdminRouteGuard routeSegment="chat-bubbles"><AdminChatBubbles /></AdminRouteGuard>} />
                  <Route path="vip-medals" element={<AdminRouteGuard routeSegment="vip-medals"><AdminVIPMedals /></AdminRouteGuard>} />
                  <Route path="noble-cards" element={<AdminRouteGuard routeSegment="noble-cards"><AdminNobleCards /></AdminRouteGuard>} />
                  <Route path="noble-subscriptions" element={<AdminRouteGuard routeSegment="noble-subscriptions"><AdminNobleSubscriptions /></AdminRouteGuard>} />
                  <Route path="vehicle-entrances" element={<AdminRouteGuard routeSegment="vehicle-entrances"><AdminVehicleEntrances /></AdminRouteGuard>} />
                  <Route path="entry-banners" element={<AdminRouteGuard routeSegment="entry-banners"><AdminEntryBanners /></AdminRouteGuard>} />
                  <Route path="entry-name-bars" element={<AdminRouteGuard routeSegment="entry-name-bars"><AdminEntryNameBars /></AdminRouteGuard>} />
                  <Route path="blocked" element={<AdminRouteGuard routeSegment="blocked"><AdminBlocked /></AdminRouteGuard>} />
                  <Route path="host-applications" element={<AdminRouteGuard routeSegment="host-applications"><AdminHostApplications /></AdminRouteGuard>} />
                  <Route path="host-search" element={<AdminRouteGuard routeSegment="host-search"><AdminHostSearch /></AdminRouteGuard>} />
                  <Route path="hosts" element={<AdminRouteGuard routeSegment="hosts"><AdminHosts /></AdminRouteGuard>} />
                  <Route path="moderation" element={<AdminRouteGuard routeSegment="moderation"><AdminModeration /></AdminRouteGuard>} />
                  <Route path="face-verification" element={<AdminRouteGuard routeSegment="face-verification"><AdminFaceVerification /></AdminRouteGuard>} />
                  <Route path="host-conversion" element={<AdminRouteGuard routeSegment="host-conversion"><AdminHostConversion /></AdminRouteGuard>} />
                  <Route path="tasks-settings" element={<AdminRouteGuard routeSegment="tasks-settings"><AdminTasksSettings /></AdminRouteGuard>} />
                  <Route path="users" element={<AdminRouteGuard routeSegment="users"><AdminUsers /></AdminRouteGuard>} />
                  <Route path="ranking-rewards" element={<AdminRouteGuard routeSegment="ranking-rewards"><AdminRankingRewards /></AdminRouteGuard>} />
                  <Route path="rewards-management" element={<AdminRouteGuard routeSegment="rewards-management"><AdminRewardsManagement /></AdminRouteGuard>} />
                  <Route path="reward-claims-history" element={<AdminRouteGuard routeSegment="reward-claims"><AdminRewardClaimsHistory /></AdminRouteGuard>} />
                  <Route path="agency-policy" element={<AdminRouteGuard routeSegment="agency-policy"><AdminAgencyPolicy /></AdminRouteGuard>} />
                  <Route path="level-management" element={<AdminRouteGuard routeSegment="level-management"><AdminLevelManagement /></AdminRouteGuard>} />
                  <Route path="vip-management" element={<AdminRouteGuard routeSegment="vip-management"><AdminVIPManagement /></AdminRouteGuard>} />
                  <Route path="entry-effects" element={<AdminRouteGuard routeSegment="entry-effects"><AdminEntryEffects /></AdminRouteGuard>} />
                  <Route path="finance" element={<AdminRouteGuard routeSegment="finance"><AdminFinance /></AdminRouteGuard>} />
                  <Route path="game-management" element={<AdminRouteGuard routeSegment="game-management"><AdminGameManagement /></AdminRouteGuard>} />
                  <Route path="party-management" element={<AdminRouteGuard routeSegment="party-management"><AdminPartyManagement /></AdminRouteGuard>} />
                  <Route path="coin-trader-hub" element={<AdminRouteGuard routeSegment="coin-trader-hub"><AdminCoinTraderHub /></AdminRouteGuard>} />
                  <Route path="content-management" element={<AdminRouteGuard routeSegment="content-management"><AdminContentManagement /></AdminRouteGuard>} />
                  <Route path="agency-hub" element={<AdminRouteGuard routeSegment="agency-hub"><AdminAgencyHub /></AdminRouteGuard>} />
                  <Route path="app-settings-hub" element={<AdminRouteGuard routeSegment="app-settings-hub"><AdminAppSettingsHub /></AdminRouteGuard>} />
                  <Route path="host-feed-ranking" element={<AdminRouteGuard routeSegment="host-feed-ranking"><AdminHostFeedRanking /></AdminRouteGuard>} />
                  <Route path="party-discovery-ranking" element={<AdminRouteGuard routeSegment="party-discovery-ranking"><AdminPartyDiscoveryRanking /></AdminRouteGuard>} />
                  
                  <Route path="ranking-automation" element={<AdminRouteGuard routeSegment="ranking-automation"><AdminRankingAutomation /></AdminRouteGuard>} />
                  <Route path="visual-assets" element={<AdminRouteGuard routeSegment="visual-assets"><AdminVisualAssetsHub /></AdminRouteGuard>} />
                  <Route path="user-hub" element={<AdminRouteGuard routeSegment="user-hub"><AdminUserHub /></AdminRouteGuard>} />
                  <Route path="helper-orders" element={<AdminRouteGuard routeSegment="helper-orders"><AdminHelperOrders /></AdminRouteGuard>} />
                  <Route path="support-tickets" element={<AdminRouteGuard routeSegment="support-tickets"><AdminSupportTickets /></AdminRouteGuard>} />
                  <Route path="support-reports" element={<AdminRouteGuard routeSegment="support-reports"><AdminSupportReports /></AdminRouteGuard>} />
                  <Route path="pending-approvals" element={<AdminRouteGuard routeSegment="pending-approvals"><AdminPendingApprovals /></AdminRouteGuard>} />
                  <Route path="gmail-support" element={<AdminRouteGuard routeSegment="gmail-support"><AdminGmailSupport /></AdminRouteGuard>} />
                  <Route path="user-reports" element={<AdminRouteGuard routeSegment="user-reports"><AdminUserReports /></AdminRouteGuard>} />
                  <Route path="chat-inspector" element={<AdminRouteGuard routeSegment="chat-inspector"><AdminChatInspector /></AdminRouteGuard>} />
                  <Route path="number-sharing" element={<AdminRouteGuard routeSegment="number-sharing"><AdminNumberSharing /></AdminRouteGuard>} />
                  <Route path="error-logs" element={<AdminRouteGuard routeSegment="error-logs"><AdminErrorLogs /></AdminRouteGuard>} />
                  <Route path="sub-admins" element={<AdminRouteGuard routeSegment="sub-admins"><AdminSubAdmins /></AdminRouteGuard>} />
                  <Route path="room-welcome-messages" element={<AdminRouteGuard routeSegment="room-welcome-messages"><AdminRoomWelcomeMessages /></AdminRouteGuard>} />
                  <Route path="landing-page" element={<AdminRouteGuard routeSegment="landing-page"><AdminLandingPageManager /></AdminRouteGuard>} />
                  <Route path="push-broadcast" element={<AdminRouteGuard routeSegment="push-broadcast"><AdminPushBroadcast /></AdminRouteGuard>} />
                  <Route path="notice-broadcast" element={<AdminRouteGuard routeSegment="notice-broadcast"><AdminNoticeBroadcast /></AdminRouteGuard>} />
                  <Route path="email-broadcast" element={<AdminRouteGuard routeSegment="email-broadcast"><AdminEmailBroadcast /></AdminRouteGuard>} />
                  <Route path="leaderboard-management" element={<AdminRouteGuard routeSegment="leaderboard-management"><AdminLeaderboardManagement /></AdminRouteGuard>} />
                  <Route path="allowed-links" element={<AdminRouteGuard routeSegment="allowed-links"><AdminAllowedLinks /></AdminRouteGuard>} />
                  <Route path="agora-settings" element={<AdminRouteGuard routeSegment="agora-settings"><AdminAgoraSettings /></AdminRouteGuard>} />
                  <Route path="theme-manager" element={<AdminRouteGuard routeSegment="theme-manager"><AdminThemeManager /></AdminRouteGuard>} />
                  <Route path="rating-rewards" element={<AdminRouteGuard routeSegment="rating-rewards"><AdminRatingRewards /></AdminRouteGuard>} />
                  <Route path="icon-registry" element={<AdminRouteGuard routeSegment="icon-registry"><AdminIconRegistry /></AdminRouteGuard>} />
                  <Route path="parcel-management" element={<AdminRouteGuard routeSegment="parcel-management"><AdminParcelManagement /></AdminRouteGuard>} />
                  <Route path="beauty-filters" element={<AdminRouteGuard routeSegment="beauty-filters"><AdminBeautyFilters /></AdminRouteGuard>} />
                  <Route path="contact-violations" element={<AdminRouteGuard routeSegment="contact-violations"><AdminContactViolations /></AdminRouteGuard>} />
                  <Route path="game-leaderboard" element={<AdminRouteGuard routeSegment="game-leaderboard"><AdminGameLeaderboard /></AdminRouteGuard>} />
                  <Route path="user-beans-exchange" element={<AdminRouteGuard routeSegment="user-beans-exchange"><AdminUserBeansExchange /></AdminRouteGuard>} />
                  <Route path="blueprint" element={<AdminBlueprint />} />
                  <Route path="verified-badges" element={<AdminRouteGuard routeSegment="verified-badges"><AdminVerifiedBadges /></AdminRouteGuard>} />
                </Route>
                
                <Route path="*" element={<NotFound />} />
              </Routes>
              
              {/* Lazy loaded modals and overlays */}
              {showGenderModal && pendingUserId && !window.location.pathname.startsWith('/admin') && (
                <GenderSelectionModal
                  isOpen={showGenderModal}
                  userId={pendingUserId}
                  onComplete={() => {
                    setShowGenderModal(false);
                    setPendingUserId(null);
                  }}
                />
              )}
            </Suspense>
              </CallProvider>
            </BrowserRouter>
          </TooltipProvider>
        </PresenceProvider>
      </RealtimeProvider>
    </PersistQueryClientProvider>
  );
};

export default App;
