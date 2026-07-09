import { useEffect, useRef, useState, lazy, Suspense, memo } from "react";
import type { ReactNode } from "react";
import { useLocation, useParams } from "react-router-dom";
import { lazyRetry } from "@/utils/lazyRetry";
import Auth from "./pages/Auth";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { BrowserRouter, Route, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getAppSetting } from "@/utils/appSettingsCache";
import { Session } from "@supabase/supabase-js";
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { initSecureLinkGuard } from '@/utils/secureLinkGuard';
import { setCachedUser, invalidateCachedUser } from '@/utils/cachedAuth';
import { secureStorage } from '@/utils/encryptedStorage';
import { saveSessionToNative, clearNativeSession, getSessionFromNative } from '@/utils/nativeSessionStorage';
import { prewarmSVGA } from '@/utils/svgaPrewarm';
import { initWebViewPerformance } from '@/utils/nativePerformance';
import { clearBalanceCache, useUserBalancePrefetch } from '@/hooks/useUserBalance';
import { useAnalyticsBootstrap } from '@/hooks/useAnalyticsBootstrap';
import { useEnableBrowserPageInteraction } from '@/hooks/useEnableBrowserPageInteraction';
import { triggerLegacyProfileSync } from '@/utils/legacyProfileSync';
import { queryClient, queryPersister } from '@/lib/queryClient';
import { navigateInAppPath } from '@/utils/inAppNavigation';
// prefetchCommonAdminRoutes is dynamically imported below (admin paths only)
// so the 162-entry admin route map never loads for normal users.
import { isLandingOnlyHostname, isStandalonePublicLocation, isStandalonePublicPath } from '@/utils/publicRoutes';
import AdminAccessGuard from "./components/admin/AdminAccessGuard";
import AdminRouteGuard, { SubAdminDashboardGuard } from "./components/admin/AdminRouteGuard";
import TabKeepAliveHost, { isTabKeepAliveEnabled } from "./components/TabKeepAliveHost";
import { NativeLiveKitRouteSurvivor } from "./components/native/NativeLiveKitRouteSurvivor";
import { RouteTransitionHost } from "./components/RouteTransitionHost";
import { GlobalInstantNavigation } from "./components/common/GlobalInstantNavigation";
import { ScrollSafetyNet } from "./components/common/ScrollSafetyNet";
import { startIdleRoutePrefetch } from "./utils/idleRoutePrefetch";
import { CallProvider } from "./components/call/CallProvider";
const AdminAuth = lazy(lazyRetry(() => import("./pages/admin/AdminAuth")));


// =============================================
// MINIMAL PROVIDERS - Only what's needed for first paint
// =============================================
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MotionConfig } from "framer-motion";
import { isLowEndDevice } from "@/utils/lowEndDevice";
import GlobalGiftAnimationLayer from "@/components/gifting/GlobalGiftAnimationLayer";

// =============================================
// HEAVY PROVIDERS - Loaded normally but rendered in Suspense boundaries
// CallProvider needs special handling as it wraps children
// =============================================
import { PresenceProvider } from "./components/common/PresenceProvider";
import { RealtimeProvider } from "./components/common/RealtimeProvider";
// AppUpdateChecker + PushNotificationInitializer are pure side-effect components.
// Lazy-loaded so their chunks (and the dependencies they pull — Capacitor app-update,
// firebase messaging shims, etc.) never block first paint. They mount inside <Suspense>.
const AppUpdateChecker = lazy(lazyRetry(() => import("@/components/common/AppUpdateChecker")));
const PushNotificationInitializer = lazy(lazyRetry(() => import("@/components/common/PushNotificationInitializer")));
const DeferredAppHooks = lazy(lazyRetry(() => import("./components/common/DeferredAppHooks")));
// =============================================
// ALL PAGES - Lazy loaded for fast initial paint
// =============================================
const DeepLinkHandler = lazy(lazyRetry(() => import("./components/common/DeepLinkHandler")));
import ErrorBoundary from "./components/ErrorBoundary";
import ConnectionStatus from "./components/system/ConnectionStatus";
import ProtectedRoute from "./components/auth/ProtectedRoute";
const EventPopupBanner = lazy(lazyRetry(() => import("./components/common/EventPopupBanner")));
const DailyLoginPopup = lazy(lazyRetry(() => import("./components/rewards/DailyLoginPopup")));
const WelcomeOnboarding = lazy(lazyRetry(() => import("./components/onboarding/WelcomeOnboarding")));
const RatingRewardPopup = lazy(lazyRetry(() => import("./components/rewards/RatingRewardPopup")));
const Unsubscribe = lazy(lazyRetry(() => import("./pages/Unsubscribe")));
// =============================================
// LAZY LOADED PAGES - Load on demand
// =============================================
// Main Pages
const Index = lazy(lazyRetry(() => import("./pages/Index")));
const Discover = lazy(lazyRetry(() => import("./pages/Discover")));
const Live = lazy(lazyRetry(() => import("./pages/Live")));
const Profile = lazy(lazyRetry(() => import("./pages/Profile")));
const AgencyDashboard = lazy(lazyRetry(() => import("./pages/AgencyDashboard")));
const Level5HelperDashboard = lazy(lazyRetry(() => import("./pages/Level5HelperDashboard")));
const Chat = lazy(lazyRetry(() => import("./pages/Chat")));
const GroupInvitePage = lazy(lazyRetry(() => import("./pages/GroupInvitePage")));
const LiveStream = lazy(lazyRetry(() => import("./pages/LiveStream")));
const LiveStreamFeed = lazy(lazyRetry(() => import("./pages/LiveStreamFeed")));
// Wrapper to force full remount of LiveStream when stream ID changes (TikTok-style navigation)
const LiveStreamKeyWrapper = () => {
  const { id } = useParams();
  return <LiveStream key={id} />;
};
const Recharge = lazy(lazyRetry(() => import("./pages/Recharge")));

// Route chunks are loaded on demand. Previous global route preloading created
// visible startup/network storms on mobile WebView and slow devices.

const EditProfile = lazy(lazyRetry(() => import("./pages/EditProfile")));
const Level = lazy(lazyRetry(() => import("./pages/Level")));
const Invitation = lazy(lazyRetry(() => import("./pages/Invitation")));
const Tasks = lazy(lazyRetry(() => import("./pages/Tasks")));
const HostBonusLedger = lazy(lazyRetry(() => import("./pages/HostBonusLedger")));
const Settings = lazy(lazyRetry(() => import("./pages/Settings")));
const DeveloperOptions = lazy(lazyRetry(() => import("./pages/DeveloperOptions")));
const ShareReceive = lazy(lazyRetry(() => import("./pages/ShareReceive")));
const DebugReferrer = lazy(lazyRetry(() => import("./pages/DebugReferrer")));
const DebugReferrerTest = lazy(lazyRetry(() => import("./pages/DebugReferrerTest")));
const Rewards = lazy(lazyRetry(() => import("./pages/Rewards")));
const RatingProofHistory = lazy(lazyRetry(() => import("./pages/RatingProofHistory")));
const Agency = lazy(lazyRetry(() => import("./pages/Agency")));
const AgentRank = lazy(lazyRetry(() => import("./pages/AgentRank")));
const Leaderboard = lazy(lazyRetry(() => import("./pages/Leaderboard")));
const PKLeaderboard = lazy(lazyRetry(() => import("./pages/PKLeaderboard")));
const HostApplication = lazy(lazyRetry(() => import("./pages/HostApplication")));
const AgentWallet = lazy(lazyRetry(() => import("./pages/AgentWallet")));
const TransferHistory = lazy(lazyRetry(() => import("./pages/TransferHistory")));
const CreateAgency = lazy(lazyRetry(() => import("./pages/CreateAgency")));
const SmartLink = lazy(lazyRetry(() => import("./pages/SmartLink")));
const AgencySignup = lazy(lazyRetry(() => import("./pages/AgencySignup")));
const AgencyCoinExchange = lazy(lazyRetry(() => import("./pages/AgencyCoinExchange")));
const AgencyCoinTrader = lazy(lazyRetry(() => import("./pages/AgencyCoinTrader")));
const CallHistory = lazy(lazyRetry(() => import("./pages/CallHistory")));
const MatchCall = lazy(lazyRetry(() => import("./pages/MatchCall")));
const FollowingList = lazy(lazyRetry(() => import("./pages/FollowingList")));
const SearchUsers = lazy(lazyRetry(() => import("./pages/SearchUsers")));
const RechargeHistory = lazy(lazyRetry(() => import("./pages/RechargeHistory")));
const PaymentSuccess = lazy(lazyRetry(() => import("./pages/PaymentSuccess")));
const PartyRooms = lazy(lazyRetry(() => import("./pages/PartyRooms")));
const PartyRoom = lazy(lazyRetry(() => import("./pages/PartyRoom")));
const GoLive = lazy(lazyRetry(() => import("./pages/GoLive")));
const LiveSessionPage = lazy(lazyRetry(() => import("./pages/LiveSessionPage")));
const CreateParty = lazy(lazyRetry(() => import("./pages/CreateParty")));
const PartySessionPage = lazy(lazyRetry(() => import("./pages/PartySessionPage")));
const ProfileDetail = lazy(lazyRetry(() => import("./pages/ProfileDetail")));

const Tags = lazy(lazyRetry(() => import("./pages/Tags")));
const MyPoster = lazy(lazyRetry(() => import("./pages/MyPoster")));
const HostDashboard = lazy(lazyRetry(() => import("./pages/HostDashboard")));

const MyRecordings = lazy(lazyRetry(() => import("./pages/MyRecordings")));
// HostVerification removed — host registration now uses the unified FaceVerification flow.
const FaceVerification = lazy(lazyRetry(() => import("./pages/FaceVerification")));
const FacePoseRegression = lazy(lazyRetry(() => import("./pages/FacePoseRegression")));
const AvatarFrameRingCheck = lazy(lazyRetry(() => import("./pages/AvatarFrameRingCheck")));
const DebugVideoFrames = lazy(lazyRetry(() => import("./pages/DebugVideoFrames")));
const AgencyWithdrawal = lazy(lazyRetry(() => import("./pages/AgencyWithdrawal")));
const AgencyTransferHistory = lazy(lazyRetry(() => import("./pages/AgencyTransferHistory")));
const AgencyCommissionHistory = lazy(lazyRetry(() => import("./pages/AgencyCommissionHistory")));
const AgencyHostManagement = lazy(lazyRetry(() => import("./pages/AgencyHostManagement")));
const JoinAgency = lazy(lazyRetry(() => import("./pages/JoinAgency")));
const BecomeSubAgent = lazy(lazyRetry(() => import("./pages/BecomeSubAgent")));
const HelperDashboard = lazy(lazyRetry(() => import("./pages/HelperDashboard")));

const PayrollHelperGuide = lazy(lazyRetry(() => import("./pages/PayrollHelperGuide")));
const AgencyDetails = lazy(lazyRetry(() => import("./pages/AgencyDetails")));
const AgencyPolicy = lazy(lazyRetry(() => import("./pages/AgencyPolicy")));
const PoliciesAndBenefits = lazy(lazyRetry(() => import("./pages/PoliciesAndBenefits")));
const PublicPolicies = lazy(lazyRetry(() => import("./pages/PublicPolicies")));
const PublicPrivacyPolicy = lazy(lazyRetry(() => import("./pages/PublicPrivacyPolicy")));
const PublicTerms = lazy(lazyRetry(() => import("./pages/PublicTerms")));
const PublicAccountDeletion = lazy(lazyRetry(() => import("./pages/PublicAccountDeletion")));
const PolicyDetail = lazy(lazyRetry(() => import("./pages/PolicyDetail")));
const LevelsHub = lazy(lazyRetry(() => import("./pages/policies/LevelsHub")));
const LevelPolicyDetail = lazy(lazyRetry(() => import("./pages/policies/LevelDetail")));
const GoogleLibraryOrderRules = lazy(lazyRetry(() => import("./pages/GoogleLibraryOrderRules")));
const About = lazy(lazyRetry(() => import("./pages/About")));
const PublicContact = lazy(lazyRetry(() => import("./pages/PublicContact")));
const LandingPage = lazy(lazyRetry(() => import("./pages/LandingPage")));
const SyncTest = lazy(lazyRetry(() => import("./pages/SyncTest")));
const HostTransferHistory = lazy(lazyRetry(() => import("./pages/HostTransferHistory")));
const NotFound = lazy(lazyRetry(() => import("./pages/NotFound")));
const ResetPassword = lazy(lazyRetry(() => import("./pages/ResetPassword")));
const AuthCallback = lazy(lazyRetry(() => import("./pages/AuthCallback")));
const CsaLogin = lazy(lazyRetry(() => import("./pages/CsaLogin")));
const Shop = lazy(lazyRetry(() => import("./pages/Shop")));
const Reels = lazy(lazyRetry(() => import("./pages/Reels")));
const VIP = lazy(lazyRetry(() => import("./pages/VIP")));
const Parcels = lazy(lazyRetry(() => import("./pages/Parcels")));
const PlaceholderPage = lazy(lazyRetry(() => import("./components/common/PlaceholderPage")));

// Games
const GamesHub = lazy(lazyRetry(() => import("./pages/games/GamesHub")));
const RoulettePage = lazy(lazyRetry(() => import("./pages/games/RoulettePage")));
const FerrisWheelPage = lazy(lazyRetry(() => import("./pages/games/FerrisWheelPage")));
const TeenPattiPage = lazy(lazyRetry(() => import("./pages/games/TeenPattiPage")));
const LuckyWheelTestPage = lazy(lazyRetry(() => import("./pages/games/LuckyWheelTestPage")));

// Admin Pages - All lazy loaded (with chunk-failure retry)
const AdminBlueprint = lazy(lazyRetry(() => import("./pages/admin/AdminBlueprint")));
const AdminAllowedLinks = lazy(lazyRetry(() => import("./pages/admin/AdminAllowedLinks")));
const AdminChatInspector = lazy(lazyRetry(() => import("./pages/admin/AdminChatInspector")));
const AdminNumberSharing = lazy(lazyRetry(() => import("./pages/admin/AdminNumberSharing")));
const AdminLayout = lazy(lazyRetry(() => import("./pages/admin/AdminLayout")));
const AdminDashboard = lazy(lazyRetry(() => import("./pages/admin/AdminDashboard")));
const AdminSettings = lazy(lazyRetry(() => import("./pages/admin/AdminSettings")));
const AdminAgencies = lazy(lazyRetry(() => import("./pages/admin/AdminAgencies")));
const AdminUnifiedApprovals = lazy(lazyRetry(() => import("./pages/admin/AdminUnifiedApprovals")));
const AdminAgencyDetail = lazy(lazyRetry(() => import("./pages/admin/AdminAgencyDetail")));
const AdminProfitAnalytics = lazy(lazyRetry(() => import("./pages/admin/AdminProfitAnalytics")));
const AdminPayoutsAnalytics = lazy(lazyRetry(() => import("./pages/admin/AdminPayoutsAnalytics")));
const AdminUserManagement = lazy(lazyRetry(() => import("./pages/admin/AdminUserManagement")));
const AdminSuperAdminManagement = lazy(lazyRetry(() => import("./pages/admin/AdminSuperAdminManagement")));
const SuperAdminApply = lazy(lazyRetry(() => import("./pages/SuperAdminApply")));
const CountryAdminDashboard = lazy(lazyRetry(() => import("./pages/CountryAdminDashboard")));
const AdminCoinTraders = lazy(lazyRetry(() => import("./pages/admin/AdminCoinTraders")));
const AdminTopupTraderApprovals = lazy(lazyRetry(() => import("./pages/admin/AdminTopupTraderApprovals")));
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
const AdminTrackRecordings = lazy(lazyRetry(() => import("./pages/admin/AdminTrackRecordings")));
const AdminSipInbound = lazy(lazyRetry(() => import("./pages/admin/AdminSipInbound")));
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
const AdminRandomCallSettings = lazy(lazyRetry(() => import("./pages/admin/AdminRandomCallSettings")));
const AdminRandomCallOps = lazy(lazyRetry(() => import("./pages/admin/AdminRandomCallOps")));
const AdminWithdrawals = lazy(lazyRetry(() => import("./pages/admin/AdminWithdrawals")));
const AdminBranding = lazy(lazyRetry(() => import("./pages/admin/AdminBranding")));
const AdminNotificationTemplates = lazy(lazyRetry(() => import("./pages/admin/AdminNotificationTemplates")));
const AdminAiImageStudio = lazy(lazyRetry(() => import("./pages/admin/AdminAiImageStudio")));
const AdminReports = lazy(lazyRetry(() => import("./pages/admin/AdminReports")));
const AdminLogs = lazy(lazyRetry(() => import("./pages/admin/AdminLogs")));

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
const AdminWalletLedger = lazy(lazyRetry(() => import("./pages/admin/AdminWalletLedger")));
const AdminRewardsAudit = lazy(lazyRetry(() => import("./pages/admin/AdminRewardsAudit")));
const AdminOrphanPayments = lazy(lazyRetry(() => import("./pages/admin/AdminOrphanPayments")));
const AdminUserWallet = lazy(lazyRetry(() => import("./pages/admin/AdminUserWallet")));
const AdminSuspiciousActivity = lazy(lazyRetry(() => import("./pages/admin/AdminSuspiciousActivity")));
const AdminPayoutForensics = lazy(lazyRetry(() => import("./pages/admin/AdminPayoutForensics")));
const AdminCryptoRecovery = lazy(lazyRetry(() => import("./pages/admin/AdminCryptoRecovery")));
const AdminGooglePlayHealth = lazy(lazyRetry(() => import("./pages/admin/AdminGooglePlayHealth")));
const AdminRechargeCampaigns = lazy(lazyRetry(() => import("./pages/admin/AdminRechargeCampaigns")));
const AdminShop = lazy(lazyRetry(() => import("./pages/admin/AdminShop")));
const AdminPushBroadcast = lazy(lazyRetry(() => import("./pages/admin/AdminPushBroadcast")));
const AdminNoticeBroadcast = lazy(lazyRetry(() => import("./pages/admin/AdminNoticeBroadcast")));
const AdminEmailBroadcast = lazy(lazyRetry(() => import("./pages/admin/AdminEmailBroadcast")));
const AdminOtpProviders = lazy(lazyRetry(() => import("./pages/admin/AdminOtpProviders")));
const AdminLeaderboardManagement = lazy(lazyRetry(() => import("./pages/admin/AdminLeaderboardManagement")));
const AdminBalanceDeduction = lazy(lazyRetry(() => import("./pages/admin/AdminBalanceDeduction")));
const AdminFeatureLevels = lazy(lazyRetry(() => import("./pages/admin/AdminFeatureLevels")));
const AdminReels = lazy(lazyRetry(() => import("./pages/admin/AdminReels")));
const AdminPartyBanners = lazy(lazyRetry(() => import("./pages/admin/AdminPartyBanners")));
const AdminAppVersion = lazy(lazyRetry(() => import("./pages/admin/AdminAppVersion")));
const AdminAppUpdateLogs = lazy(lazyRetry(() => import("./pages/admin/AdminAppUpdateLogs")));
const AdminAppUpdateTest = lazy(lazyRetry(() => import("./pages/admin/AdminAppUpdateTest")));
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
const AdminFaceVerificationTimeline = lazy(lazyRetry(() => import("./pages/admin/AdminFaceVerificationTimeline")));
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
const AdminGiftAnimationConfig = lazy(lazyRetry(() => import("./pages/admin/AdminGiftAnimationConfig")));
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
const AdminLiveKitRooms = lazy(lazyRetry(() => import("./pages/admin/AdminLiveKitRooms")));
const AdminLiveKitEgress = lazy(lazyRetry(() => import("./pages/admin/AdminLiveKitEgress")));
const AdminLiveKitIngress = lazy(lazyRetry(() => import("./pages/admin/AdminLiveKitIngress")));
const AdminLiveKitSip = lazy(lazyRetry(() => import("./pages/admin/AdminLiveKitSip")));
const AdminLiveKitWebhook = lazy(lazyRetry(() => import("./pages/admin/AdminLiveKitWebhook")));
const AdminCostMonitor = lazy(lazyRetry(() => import("./pages/admin/AdminCostMonitor")));
const AdminModerationAudit = lazy(lazyRetry(() => import("./pages/admin/AdminModerationAudit")));
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
    const onAdminPath = window.location.pathname.startsWith('/admin');
    const hasAccessParam = window.location.search.includes('access=');
    // Pkg426: also prefetch when a fresh secret link is in the URL (no flag yet)
    // so AdminLayout/Dashboard/RouteGuard chunks download IN PARALLEL while the
    // user types credentials → near-instant entry after submit.
    if (onAdminPath && (hasFlag || hasAccessParam)) {
      const prefetchAdmin = () => {
        import("./components/admin/AdminAccessGuard");
        import("./pages/admin/AdminLayout");
        import("./pages/admin/AdminDashboard");
        import("./components/admin/AdminRouteGuard");
        // Dynamic — admin route map only loads when an admin URL is visited.
        import("@/utils/adminRoutePrefetch").then((m) => m.prefetchCommonAdminRoutes()).catch(() => {});
      };
      // Fresh secret-link visits prefetch IMMEDIATELY (don't wait for idle —
      // user is about to log in, network bandwidth should be used now).
      if (hasAccessParam) {
        setTimeout(prefetchAdmin, 0);
      } else if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(prefetchAdmin, { timeout: 2000 });
      } else {
        setTimeout(prefetchAdmin, 300);
      }
    }
  } catch {}
}


// Settings Sub-pages
const Blacklist = lazy(lazyRetry(() => import("./pages/settings/Blacklist")));
const ContentPageView = lazy(lazyRetry(() => import("./pages/settings/ContentPage")));
const CustomerService = lazy(lazyRetry(() => import("./pages/settings/CustomerService")));
const UserManagement = lazy(lazyRetry(() => import("./pages/settings/UserManagement")));

// Lazy loaded components - defer non-critical
const GenderSelectionModal = lazy(lazyRetry(() => import("@/components/auth/GenderSelectionModal").then(m => ({ default: m.GenderSelectionModal }))));

// EAGER: tiny always-mounted overlay; lazy-loading caused blank-screen on stale chunk
import { NetworkStatusBar } from "@/components/common/NetworkStatusBar";

const NotificationSettings = lazy(lazyRetry(() => import("./pages/settings/NotificationSettings")));
const GlobalScreenSecurity = lazy(lazyRetry(() => import("@/components/common/GlobalScreenSecurity")));
// EAGER import: must be active from cold start so the very first hardware
// back press never falls through to the system default (which would exit the app).
import { AndroidBackButtonHandler } from "@/components/common/AndroidBackButtonHandler";
import { MandatoryPermissionsGate } from "@/components/common/MandatoryPermissionsGate";
import { StableRoutes } from "@/components/common/StableRoutes";
import ScrollToTop from "@/components/common/ScrollToTop";
import RequireNativeAndroidGate from "@/components/native/RequireNativeAndroidGate";
import { RequireNoActiveCall } from "@/components/call/RequireNoActiveCall";
import { AudioUnlockOverlay } from "@/components/live/AudioUnlockOverlay";
import LuckyGiftHost from "@/components/lucky/LuckyGiftHost";
import { DisconnectReasonToaster } from "@/components/live/DisconnectReasonToaster";



// Route lazy-loads must not paint any alternate/fake screen.
// Navigation warms chunks before route switch instead.
const AdminChunkLoader = memo(() => null);
AdminChunkLoader.displayName = "AdminChunkLoader";

// Chamet/Bigo/TikTok-style: NO intermediate loading screen between routes.
// Route chunks are aggressively prefetched by BottomNavigation + idle warmup,
// so by the time the user taps, the chunk is already in memory. Fallback is
// `null` — React keeps the previous page painted until the next page is ready.
// Zero white flash, zero loading bar, zero "third-class" intermediate UI.
const RouteChunkFallback = memo(() => null);
RouteChunkFallback.displayName = "RouteChunkFallback";


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

// Pkg434 Pass 2 — Keyboard inset bridge → exposes --kb-h CSS var globally.
const KeyboardInsetsBridge = lazy(lazyRetry(() => import("./hooks/useKeyboardInsets").then(m => {
  const Bridge = () => { m.useKeyboardInsets(); return null; };
  return { default: Bridge };
})));

// Global focus-into-view: when any input/textarea/contenteditable receives
// focus while the on-screen keyboard is open, smoothly scroll it above the
// keyboard. Essential because Capacitor uses Keyboard.resize:'none' (camera
// stability) so the WebView viewport doesn't shrink automatically.
const GlobalKeyboardScrollBridge = lazy(lazyRetry(() => import("./hooks/useGlobalKeyboardScrollIntoView").then(m => {
  const Bridge = () => { m.useGlobalKeyboardScrollIntoView(); return null; };
  return { default: Bridge };
})));

// Chamet/WhatsApp-parity: dismiss keyboard on every route change so the old
// composer never bleeds into the new page's paint. Mounts INSIDE BrowserRouter
// because it relies on useLocation().
const HideKeyboardOnNavigateBridge = lazy(lazyRetry(() => import("./hooks/useHideKeyboardOnNavigate").then(m => {
  const Bridge = () => { m.useHideKeyboardOnNavigate(); return null; };
  return { default: Bridge };
})));

// Pkg209 — drains queued inline-reply / mark-as-read actions captured
// from the DM notification shade and runs them through Supabase under
// the user's own JWT (RLS-safe).
const NativeMessageActionsBridge = lazy(lazyRetry(() => import("./hooks/useNativeMessageActions").then(m => {
  const Bridge = () => { m.useNativeMessageActions(); return null; };
  return { default: Bridge };
})));

// Pillar 3 — global image defaults (loading=lazy + decoding=async on every
// <img> via a single MutationObserver). Opt out per-img with data-eager="true".
const GlobalImageDefaultsBridge = lazy(lazyRetry(() => import("./hooks/useGlobalImageDefaults").then(m => {
  const Bridge = () => { m.useGlobalImageDefaults(); return null; };
  return { default: Bridge };
})));

// Pillar 4 — per-route status-bar + <meta theme-color> sync. Mounts INSIDE
// BrowserRouter because it relies on useLocation().
const RouteStatusBarBridge = lazy(lazyRetry(() => import("./hooks/useRouteStatusBar").then(m => {
  const Bridge = () => { m.useRouteStatusBar(); return null; };
  return { default: Bridge };
})));

// Tags <body data-route-group> so CSS can scope native-feel polish
// (tap feedback, momentum scroll, page-enter motion) to agency/host pages.
const RouteGroupAttributeBridge = lazy(lazyRetry(() => import("./hooks/useRouteGroupAttribute").then(m => {
  const Bridge = () => { m.useRouteGroupAttribute(); return null; };
  return { default: Bridge };
})));




// Pkg210 — biometric app-lock overlay + Android-14 screenshot detector.
const AppLockGate = lazy(lazyRetry(() => import("./components/security/AppLockGate")));
const ScreenshotDetectionBridge = lazy(lazyRetry(() => import("./components/security/ScreenshotDetectionBridge")));
// Pkg223 — first-launch privacy consent dialog (eager: tiny, must not suspend on first paint).
import PrivacyConsentDialog from "./components/privacy/PrivacyConsentDialog";

const RouteScopedBackgroundHooks = memo(({ userId, hasSession }: { userId: string | null; hasSession: boolean }) => {
  const location = useLocation();
  const hasSeenFirstRouteRef = useRef(false);
  const previousMediaRouteRef = useRef(false);
  const [backgroundReady, setBackgroundReady] = useState(false);
  const isAdminRoute = location.pathname.startsWith('/admin');
  const isMediaRoute =
    /^\/live\/[^/]+/.test(location.pathname) ||
    location.pathname.startsWith('/live-feed') ||
    location.pathname.startsWith('/party/') ||
    location.pathname === '/go-live' ||
    location.pathname === '/live-session' ||
    location.pathname === '/create-party' ||
    location.pathname === '/party-session' ||
    location.pathname.startsWith('/call/') ||
    location.pathname.startsWith('/active-call') ||
    location.pathname.startsWith('/incoming-call') ||
    location.pathname.startsWith('/outgoing-call') ||
    location.pathname.startsWith('/stream/');
  const isLandingDomain = typeof window !== 'undefined' && isLandingOnlyHostname(window.location.hostname);
  const isPublicPage = isLandingDomain || isStandalonePublicPath(location.pathname) || ((!hasSession && location.pathname === '/') || location.pathname.startsWith('/auth'));
  // Optional marketing/onboarding popups are intentionally home-scoped. Mounting
  // them on every deep section (VIP, agency, face verification, chat, etc.) adds
  // queries, image decodes and sometimes full-screen overlays during navigation,
  // which feels like a blank/laggy page in Android WebView.
  const isHomeSurface = location.pathname === '/' || location.pathname === '/home';
  const showPopups = isHomeSurface && !isAdminRoute && !isPublicPage && !isMediaRoute && hasSession;

  useUserBalancePrefetch(userId);

  useEffect(() => {
    if (isPublicPage) {
      setBackgroundReady(false);
      return;
    }
    if (backgroundReady) return;
    const w = window as any;
    const id = typeof w.requestIdleCallback === 'function'
      ? w.requestIdleCallback(() => setBackgroundReady(true), { timeout: 3500 })
      : window.setTimeout(() => setBackgroundReady(true), 3500);
    return () => {
      if (typeof w.cancelIdleCallback === 'function') w.cancelIdleCallback(id);
      else clearTimeout(id);
    };
  }, [isPublicPage, backgroundReady]);

  useEffect(() => {
    if (!hasSeenFirstRouteRef.current) {
      hasSeenFirstRouteRef.current = true;
      previousMediaRouteRef.current = isMediaRoute;
      return;
    }

    const wasMediaRoute = previousMediaRouteRef.current;
    previousMediaRouteRef.current = isMediaRoute;
    if (!wasMediaRoute || isMediaRoute) return;

    const w = window as any;
    const run = () => {
      import('@/utils/globalVideoLifecycle')
        .then((m) => m.pauseAllVideosNow())
        .catch(() => {});
    };
    const id = typeof w.requestIdleCallback === 'function'
      ? w.requestIdleCallback(run, { timeout: 1200 })
      : window.setTimeout(run, 250);
    return () => {
      if (typeof w.cancelIdleCallback === 'function') w.cancelIdleCallback(id);
      else clearTimeout(id);
    };
  }, [location.pathname, isMediaRoute]);

  return (
    <>
      {!isAdminRoute && !isPublicPage && backgroundReady && <Suspense fallback={null}><RealtimeQuerySyncBridge /></Suspense>}
      {!isPublicPage && backgroundReady && <Suspense fallback={null}><DeferredAppHooks userId={userId} /></Suspense>}
      {showPopups ? (
        <ErrorBoundary componentName="OptionalAppOverlays" fallback={null}>
          {backgroundReady ? (
            <>
              <WelcomeOnboarding />
              <EventPopupBanner />
              <DailyLoginPopup />
              <RatingRewardPopup />
            </>
          ) : null}
        </ErrorBoundary>
      ) : null}
      {!isAdminRoute && !isPublicPage && backgroundReady && (
        <>
          <Suspense fallback={null}><AppUpdateChecker /></Suspense>
          <NetworkStatusBar />
          <Suspense fallback={null}><PushNotificationInitializer /></Suspense>
          <Suspense fallback={null}><NativeMessageActionsBridge /></Suspense>
          <Suspense fallback={null}><ScreenshotDetectionBridge /></Suspense>
        </>
      )}
    </>
  );
});

RouteScopedBackgroundHooks.displayName = 'RouteScopedBackgroundHooks';

const StandalonePublicShell = ({ children }: { children: ReactNode }) => {
  useEnableBrowserPageInteraction();
  return <>{children}</>;
};

const publicPage = (children: ReactNode) => <StandalonePublicShell>{children}</StandalonePublicShell>;

const CallProviderGate = ({ enabled, children }: { enabled: boolean; children: ReactNode }) => {
  return (
    <>
      {children}
      {enabled ? <CallProvider /> : null}
    </>
  );
};

const App = () => {
  useAnalyticsBootstrap();
  const [session, setSession] = useState<Session | null>(null);
  // ⚡ Never block first paint for auth/session IO. Native session hydration and
  // Supabase recovery run in the background; route surfaces render from cached
  // UI immediately and then reconcile when the real Session arrives.
  const [showGenderModal, setShowGenderModal] = useState(false);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [maintenanceMode, setMaintenanceMode] = useState<{ enabled: boolean; message: string } | null>(null);
  

  // 🛠️ MAINTENANCE MODE CHECK - fetch only, no dedicated realtime channel
  // app_settings realtime is already handled by useGlobalSettings
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('meri_maintenance_mode_cache');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && Date.now() - Number(parsed.at || 0) < 5 * 60_000) {
            setMaintenanceMode(parsed.value ?? null);
          }
        }
      } catch {}
    }

    const checkMaintenance = async () => {
      try {
        const value = await getAppSetting<unknown>('maintenance_mode');
        if (value) {
          setMaintenanceMode(value as any);
          try {
            localStorage.setItem('meri_maintenance_mode_cache', JSON.stringify({ at: Date.now(), value }));
          } catch {}
        }
      } catch (e) {
        console.error('[App] Maintenance check failed:', e);
      }
    };
    const w = window as any;
    const id = typeof w.requestIdleCallback === 'function'
      ? w.requestIdleCallback(checkMaintenance, { timeout: 8000 })
      : window.setTimeout(checkMaintenance, 5000);
    return () => {
      if (typeof w.cancelIdleCallback === 'function') w.cancelIdleCallback(id);
      else clearTimeout(id);
    };
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

  const scheduleLegacyProfileSync = (userId: string) => {
    if (!userId || typeof window === 'undefined') return;
    const w = window as any;
    const run = () => void runLegacyProfileSync(userId);
    if (typeof w.requestIdleCallback === 'function') {
      w.requestIdleCallback(run, { timeout: 45000 });
      return;
    }
    window.setTimeout(run, 18000);
  };

  // 🚀 INSTANT PREFETCH — warm only tiny user-specific caches on auth.
  // Heavy gifts/assets/routes are deferred to idle so first screen data can win.
  const isAuthenticated = !!session?.user;
  useEffect(() => {
    if (!isAuthenticated || !session?.user?.id) return;

    const userId = session.user.id;
    queryClient.prefetchQuery({
      queryKey: ['user-balance', userId],
      queryFn: async () => {
        const { data } = await supabase.from('profiles').select('coins, beans, diamonds, pending_earnings').eq('id', userId).single();
        return data;
      },
      staleTime: 1000 * 60 * 2,
    });

    // No boot-time gift/asset warmup here. Even idle-deferred warmups can fire
    // 5-10s after login on Android WebView and steal frames from the visible UI.
    // Gift/live panels now warm their own exact assets on demand/pointer-down.
    startIdleRoutePrefetch();
  }, [isAuthenticated, session?.user?.id]);

  
  // 🔐 SINGLE DEVICE SESSION & APP RESUME - Deferred via lazy component
  const hostname = window.location.hostname;
  const currentPath = window.location.pathname;
  const isAdminRoute = currentPath.startsWith('/admin');
  // merilive.top is landing-only. Admin/main app routes belong on merilive.com.
  const isLandingDomain = isLandingOnlyHostname(hostname);
  const isStandalonePublicRoute = isLandingDomain || isStandalonePublicPath(currentPath) || (currentPath === '/' && !session);
  const isNativeApp = Capacitor.isNativePlatform();

  // Startup work must stay tiny: first paint + auth/session win; everything
  // non-visual is idle/delayed so Android WebView never enters a boot storm.
  useEffect(() => {
    if (isStandalonePublicLocation()) return;

    // 🚀 Initialize WebView performance tuning only inside native WebView
    if (Capacitor.isNativePlatform()) {
      initWebViewPerformance();
    }

    const idle = (cb: () => void, timeout = 2500) => {
      const w = window as any;
      if (typeof w.requestIdleCallback === 'function') return w.requestIdleCallback(cb, { timeout });
      return window.setTimeout(cb, timeout);
    };
    const cancelIdle = (id: number) => {
      const w = window as any;
      if (typeof w.cancelIdleCallback === 'function') w.cancelIdleCallback(id);
      else clearTimeout(id);
    };

    // 🖼️ Register cache SW only. Do NOT boot-warm hundreds of remote images:
    // it was competing with auth/realtime/call delivery on mobile data and made
    // the whole app feel slow even when internet was good.
    const imageIdleId = idle(() => import('@/utils/registerImageCacheSW').then(m => {
      m.registerImageCacheSW();
      // Pkg B pass-3: prompt user to reload when a new SW version installs.
      import('@/utils/swUpdatePrompt').then(s => s.installSWUpdatePrompt()).catch(() => {});
    }).catch(() => {}), 900);

    // Clear stale-chunk auto-reload guard on a successful boot so the next
    // post-deploy chunk failure can also self-heal exactly once.
    try { sessionStorage.removeItem('meri_chunk_auto_reload_v1'); } catch { /* ignore */ }

    // Pkg357 — Global video lifecycle. Install after startup so login/home
    // first frames don't pay MutationObserver/import cost.
    const videoLifecycleIdleId = idle(() => {
      import('@/utils/globalVideoLifecycle')
        .then(m => m.installGlobalVideoLifecycle())
        .catch(() => {});
    }, 5000);


    // Defer SVGA module prewarm to idle (JS module only — zero network bytes).
    const svgaIdleId = idle(() => prewarmSVGA(), 8000);

    // Gift metadata is fetched when a gift panel/room actually needs it.
    // Boot-time gift queries + animation warmups were still stealing bandwidth
    // from first-screen data and private-call delivery.
    const giftIdleId = 0;

    // NOTE: Boot-time bulk binary prewarm (giftAnimationPrewarm / frameBulkPrewarm)
    // has been removed — it was causing 100+ MB egress per cold session for
    // assets the user never actually saw. Frames + heavy animations now load
    // lazily on first sight and stay cached in the SW / Cache API afterwards.


    // Pkg205 — one-time battery-optimization whitelist prompt (native Android
    // only). Prevents Xiaomi/Oppo/Vivo/Samsung from killing FCM listener and
    // dropping screen-off DM/call notifications. Gated by localStorage so
    // we only ever ask once.
    const batteryIdleId = idle(() => {
      import('@/utils/nativePermissions')
        .then(m => m.ensureBatteryOptimizationWhitelistOnce())
        .catch(() => {});
    }, 20000);

    return () => {
      cancelIdle(imageIdleId);
      cancelIdle(videoLifecycleIdleId);
      cancelIdle(svgaIdleId);
      if (giftIdleId) cancelIdle(giftIdleId);
      cancelIdle(batteryIdleId);
    };

  }, []);

  // ⚡ REALTIME → REACT QUERY BRIDGE moved inside QueryClientProvider (see RealtimeQuerySyncBridge below)

  useEffect(() => {
    const idle = (cb: () => void, timeout = 12000) => {
      const w = window as any;
      if (typeof w.requestIdleCallback === 'function') return w.requestIdleCallback(cb, { timeout });
      return window.setTimeout(cb, timeout);
    };
    const cancelIdle = (id: number) => {
      const w = window as any;
      if (typeof w.cancelIdleCallback === 'function') w.cancelIdleCallback(id);
      else clearTimeout(id);
    };

    // Initialize non-visual services only after the first screens are usable.
    const errorLoggingIdleId = idle(() => {
      import('./services/ErrorLoggingService').then(m => m.default.initialize()).catch(() => {});
    }, 12000);

    // 🔐 ENCRYPTED STORAGE - Migrate plaintext sensitive data to encrypted
    let encryptedMigrationIdleId = 0;
    if (secureStorage.isAvailable()) {
      encryptedMigrationIdleId = idle(() => {
        secureStorage.migrateToEncrypted().catch(() => {});
      }, 20000);
    }

    // 🔒 SECURE LINK GUARD - Block unauthorized external links in native app
    let cleanupLinkGuard: (() => void) | undefined;
    if (Capacitor.isNativePlatform()) {
      cleanupLinkGuard = initSecureLinkGuard();
      console.log('[Security] Secure Link Guard activated for native app');
    }
    
    let mounted = true;

    const isInvalidRefreshTokenError = (error: unknown) => {
      const err = error as { code?: string; message?: string; status?: number } | null | undefined;
      const message = String(err?.message ?? '').toLowerCase();
      return err?.code === 'refresh_token_not_found'
        || message.includes('refresh token not found')
        || message.includes('invalid refresh token');
    };

    const isMissingLocalSessionError = (error: unknown) => {
      const err = error as { code?: string; message?: string } | null | undefined;
      const message = String(err?.message ?? '').toLowerCase();
      return err?.code === 'session_not_found' || message.includes('auth session missing');
    };

    const restoreNativeSessionIfAvailable = async () => {
      if (!Capacitor.isNativePlatform()) return null;
      const nativeSession = await getSessionFromNative();
      if (!nativeSession?.refresh_token) return null;
      const { data, error } = await supabase.auth.setSession({
        access_token: nativeSession.access_token,
        refresh_token: nativeSession.refresh_token,
      });
      if (error || !data?.session?.user) return null;
      return data.session;
    };

    const clearStaleAuthState = async (reason: string) => {
      console.warn(`[App] Clearing stale auth state: ${reason}`);
      if (mounted) setSession(null);
      invalidateCachedUser();
      clearBalanceCache();
      try { localStorage.removeItem('meri_manual_logout'); } catch { /* noop */ }
      try { await clearNativeSession(); } catch { /* noop */ }
    };

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
          }
          scheduleLegacyProfileSync(session.user.id);
          return;
        }

        // No local session — unblock UI NOW, attempt recovery in background
        if (mounted) {
          setSession(null);
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
              scheduleLegacyProfileSync(refreshed.session.user.id);
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
                  scheduleLegacyProfileSync(restored.session.user.id);
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
        }
      }
    };
    
    initSession();

    // `app_settings` is deliberately NOT in supabase_realtime publication.
    // Admin-triggered app sync must use the guarded admin_broadcast path.

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
                navigateInAppPath('/auth', { replace: true });
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
          scheduleLegacyProfileSync(session.user.id);
          // Prime own avatar+frame in persistent cache so they render
          // instantly on every cold launch, even offline.
          import('@/utils/frameCache').then(({ primeOwnAvatarCache }) => {
            void primeOwnAvatarCache(session.user.id);
          }).catch(() => undefined);
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
            // 🛡️ NO AUTO-LOGOUT POLICY (Pkg359):
            // Auto sign-out events (refresh token glitch, network blip, webview
            // storage flush) must NEVER kick the user out. We try a silent
            // refresh in the background; if it succeeds, session is restored
            // seamlessly. If it fails, we still do NOT navigate to /auth and
            // do NOT clear native storage — the user stays exactly where they
            // are. Only a MANUAL logout or a single-device-displacement
            // (useSingleDeviceSession.forceLogout) sets the manual flag.
            console.warn('[App] ⚠️ Auto sign-out received — attempting silent refresh (no redirect)');
            (async () => {
              try {
                const { data, error } = await supabase.auth.refreshSession();
                if (!error && data?.session) {
                  console.log('[App] ✅ Silent refresh succeeded, session restored');
                  setSession(data.session);
                  if (data.session.access_token && data.session.refresh_token) {
                    saveSessionToNative({
                      access_token: data.session.access_token,
                      refresh_token: data.session.refresh_token,
                      expires_at: data.session.expires_at,
                    });
                  }
                } else if (isInvalidRefreshTokenError(error)) {
                  await clearStaleAuthState(error?.message || 'invalid refresh token');
                } else if (isMissingLocalSessionError(error)) {
                  const restored = await restoreNativeSessionIfAvailable();
                  if (restored) {
                    setSession(restored);
                    setCachedUser({ id: restored.user.id, email: restored.user.email ?? undefined });
                  } else {
                    await clearStaleAuthState(error?.message || 'missing auth session');
                  }
                } else {
                  console.warn('[App] silent refresh failed — staying put (no auto-logout)', error?.message);
                }
              } catch (e) {
                if (isInvalidRefreshTokenError(e)) {
                  await clearStaleAuthState('invalid refresh token exception');
                } else if (isMissingLocalSessionError(e)) {
                  const restored = await restoreNativeSessionIfAvailable();
                  if (restored) {
                    setSession(restored);
                    setCachedUser({ id: restored.user.id, email: restored.user.email ?? undefined });
                  } else {
                    await clearStaleAuthState('missing auth session exception');
                  }
                } else {
                  console.warn('[App] silent refresh threw — staying put (no auto-logout)', e);
                }
              }
            })();
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
                  .from('profiles') // guard-ok: owner-only self phone lookup after auth session
                  .select('phone')
                  .eq('id', session.user.id)
                  .single();
                
                // Also check if agency still exists and has no owner
                const { data: agency } = await supabase
                  .from('agencies') // guard-ok: pending claim lookup by stored agency id, needs owner_id for claim safety
                  .select('id, owner_id')
                  .eq('id', pendingClaim.agencyId)
                  .single();
                
                if (agency && !agency.owner_id) {
                  // Claim the agency - assign owner
                  const { error: claimError } = await supabase
                    .from('agencies') // guard-ok: authenticated owner claim update, not a cross-user read
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
              let { data: profile } = await supabase
                .from('profiles') // guard-ok: owner-only self gender lookup after auth session
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
                    .from('profiles') // guard-ok: owner-only self profile refetch after repair RPC
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
      cancelIdle(errorLoggingIdleId);
      if (encryptedMigrationIdleId) cancelIdle(encryptedMigrationIdleId);
      subscription.unsubscribe();
      cleanupLinkGuard?.();
      if (Capacitor.isNativePlatform()) {
        void appUrlOpenListenerPromise?.then((listener) => listener.remove()).catch(() => {});
      }
    };
  }, []);

  // 🔒 BROWSER GUARD - Block browser access, only allow native app + Lovable preview
  const isNative = Capacitor.isNativePlatform();
  // Allow Lovable preview/development environments
  const isLovablePreview = hostname.includes('lovable.app') || 
                           hostname.includes('lovableproject.com') || 
                           hostname === 'localhost' || 
                           hostname === '127.0.0.1';

  // Landing page is ONLY served on merilive.top (the marketing/download domain).
  // Main domain (merilive.com / native app / lovable preview) always boots the main app.
  
  const isBrowserAllowedRoute = currentPath === '/'
    || currentPath.startsWith('/admin')
    || currentPath.startsWith('/auth')
    || currentPath.startsWith('/reset-password')
    || currentPath.startsWith('/~oauth')
    || currentPath.startsWith('/landing')
    || currentPath.startsWith('/download')
    || currentPath.startsWith('/agency')
    || currentPath.startsWith('/join-agency')
    || isStandalonePublicPath(currentPath);

  if (isLandingDomain && isAdminRoute) {
    window.location.replace(`https://merilive.com${currentPath}${window.location.search}${window.location.hash}`);
    return null;
  }

  // 🔒 BROWSER GUARD: Block public browser access to protected app routes
  // Only native app, Lovable preview, OR authenticated users can access the full app
  // Authenticated users are allowed from any browser (Chrome, Safari, etc.)
  if (!isNative && !isLovablePreview && !isBrowserAllowedRoute && !session) {
    // Redirect unauthenticated browser users to auth page
    if (currentPath !== '/auth' && !currentPath.startsWith('/auth')) {
      navigateInAppPath('/auth', { replace: true });
      return null;
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

  const appShell = (
    <>
          {/* Phase 6 — Throttle framer-motion on low-end Android. `reducedMotion="always"`
              tells every <motion.*> in the app to skip transform/opacity transitions
              and snap to final values. Falls back to `"user"` (honour OS setting) on
              capable devices so animations remain rich. */}
          <MotionConfig reducedMotion={isLowEndDevice() ? "always" : "user"}>
          <TooltipProvider>
            <Toaster />
            <SonnerToaster />
            <ConnectionStatus />
            <BrowserRouter>
              {!isStandalonePublicRoute && <ScrollToTop />}
              {!isStandalonePublicRoute && <ScrollSafetyNet />}
              {!isStandalonePublicRoute && <RouteTransitionHost />}
              {!isStandalonePublicRoute && <GlobalInstantNavigation />}
              {session && !isStandalonePublicRoute && <NativeLiveKitRouteSurvivor />}
              {!isStandalonePublicRoute && <Suspense fallback={null}><DeepLinkHandler /></Suspense>}
              {!isStandalonePublicRoute && <AndroidBackButtonHandler />}
              {session && !isAdminRoute && !isStandalonePublicRoute ? <MandatoryPermissionsGate /> : null}
              {session && !isAdminRoute && !isStandalonePublicRoute && <Suspense fallback={null}><GlobalScreenSecurity /></Suspense>}
              {session && !isAdminRoute && !isStandalonePublicRoute && <Suspense fallback={null}><AppLockGate /></Suspense>}
              {session && !isAdminRoute && !isStandalonePublicRoute && <PrivacyConsentDialog />}
              <Suspense fallback={null}><RouteStatusBarBridge /></Suspense>
              <Suspense fallback={null}><RouteGroupAttributeBridge /></Suspense>
              <Suspense fallback={null}><HideKeyboardOnNavigateBridge /></Suspense>

              {/* Deferred hooks - route scoped so admin pages stay static */}
              <RouteScopedBackgroundHooks userId={session?.user?.id || null} hasSession={!!session} />
              {/* Pkg201 — iOS Safari audio-playback unlock overlay (M2). No-op until a Room reports blocked. */}
              {session && !isAdminRoute && !isStandalonePublicRoute && <AudioUnlockOverlay />}
              {/* Pkg202 — LiveKit disconnect-reason → sonner toast (M5). No-op until a Room disconnects with a non-silent reason. */}
              {session && !isAdminRoute && !isStandalonePublicRoute && <DisconnectReasonToaster />}
              {/* Lucky Gift — tier-aware celebration overlay (Nice / Big Win / MEGA JACKPOT). No-op until a winning lucky gift fires. */}
              {session && !isAdminRoute && !isStandalonePublicRoute && <LuckyGiftHost />}
              {/* One panel, one animation layer — drains full-screen gifts enqueued from
                  Live / Party / Call / Chat / Profile / Reels. Skips itself on native
                  Android where the gift dispatcher owns playback. */}
              {session && !isAdminRoute && !isStandalonePublicRoute && (
                <Suspense fallback={null}><GlobalGiftAnimationLayer /></Suspense>
              )}
              <CallProviderGate enabled={!!session && !isAdminRoute && !isStandalonePublicRoute}>
                  {/* Tab keep-alive is explicit opt-in only; default route owner stays single to prevent duplicate UI. */}
                  {session && !isAdminRoute && !isStandalonePublicRoute && isTabKeepAliveEnabled() && (
                    <TabKeepAliveHost />
                  )}
                  {/* No fake fallback UI: StableRoutes keeps the previous real route mounted while the next route prepares hidden. */}
                  <Suspense fallback={<RouteChunkFallback />}>
                  <ErrorBoundary componentName="AppRoutes">
                  {isLandingDomain ? (
                    // merilive.top is landing-only for app routes, but public/legal/share
                    // URLs must render directly without the app splash or app-only popups.
                    <StableRoutes>
                      <Route path="/" element={<LandingPage />} />
                      <Route path="/landing" element={<LandingPage />} />
                      <Route path="/download" element={<LandingPage />} />
                      <Route path="/smart-link" element={publicPage(<SmartLink />)} />
                      <Route path="/super-admin/apply" element={publicPage(<SuperAdminApply />)} />
                      <Route path="/share" element={publicPage(<ShareReceive />)} />
                      <Route path="/link" element={publicPage(<SmartLink />)} />
                      <Route path="/policies" element={publicPage(<PublicPolicies />)} />
                      <Route path="/policies/levels" element={publicPage(<LevelsHub />)} />
                      <Route path="/policies/levels/:levelCode" element={publicPage(<LevelPolicyDetail />)} />
                      <Route path="/policies/:policyId" element={publicPage(<PolicyDetail />)} />
                      <Route path="/privacy" element={<Navigate to="/privacy-policy" replace />} />
                      <Route path="/privacy-policy" element={publicPage(<PublicPrivacyPolicy />)} />
                      <Route path="/terms" element={publicPage(<PublicTerms />)} />
                      <Route path="/account-deletion" element={publicPage(<PublicAccountDeletion />)} />
                      <Route path="/delete-account" element={<Navigate to="/account-deletion" replace />} />
                      <Route path="/google-library-order-rules" element={publicPage(<GoogleLibraryOrderRules />)} />
                      <Route path="/about" element={publicPage(<About />)} />
                      <Route path="/contact" element={publicPage(<PublicContact />)} />
                      <Route path="/support" element={publicPage(<PublicContact />)} />
                      <Route path="/agency-policy" element={publicPage(<AgencyPolicy />)} />
                      <Route path="/policies-benefits" element={publicPage(<PoliciesAndBenefits />)} />
                      <Route path="/helper-policy" element={publicPage(<AgencyPolicy />)} />
                      <Route path="/create-agency" element={publicPage(<AgencySignup />)} />
                      <Route path="/agency-signup" element={publicPage(<AgencySignup />)} />
                      <Route path="/become-sub-agent" element={publicPage(<BecomeSubAgent />)} />
                      <Route path="/payroll-helper-guide" element={publicPage(<PayrollHelperGuide />)} />
                      <Route path="/unsubscribe" element={publicPage(<Unsubscribe />)} />
                      <Route path="*" element={<LandingPage />} />
                    </StableRoutes>
                  ) : (
                  <StableRoutes>
                {/* ============================================= */}
                {/* PUBLIC ROUTES - No authentication required */}
                {/* ============================================= */}
                <Route path="/auth" element={session ? <Navigate to="/" /> : <Auth />} />
                <Route path="/auth/callback" element={<AuthCallback />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/csa-login" element={<CsaLogin />} />
                <Route path="/country-admin" element={<CountryAdminDashboard />} />
                <Route path="/unsubscribe" element={publicPage(<Unsubscribe />)} />
                <Route path="/" element={
                  session
                    ? (isTabKeepAliveEnabled()
                        ? <ProtectedRoute session={session}><></></ProtectedRoute>
                        : <ProtectedRoute session={session}><Index /></ProtectedRoute>)
                    : <Navigate to="/auth" replace />
                } />
                <Route path="/landing" element={<Navigate to="/" replace />} />
                <Route path="/download" element={<Navigate to="/" replace />} />

                <Route path="/smart-link" element={publicPage(<SmartLink />)} />
                <Route path="/share" element={publicPage(<ShareReceive />)} />
                <Route path="/link" element={publicPage(<SmartLink />)} />
                <Route path="/super-admin/apply" element={publicPage(<SuperAdminApply />)} />
                <Route path="/policies" element={publicPage(<PublicPolicies />)} />
                <Route path="/policies/levels" element={publicPage(<LevelsHub />)} />
                <Route path="/policies/levels/:levelCode" element={publicPage(<LevelPolicyDetail />)} />
                <Route path="/policies/:policyId" element={publicPage(<PolicyDetail />)} />
                <Route path="/privacy" element={<Navigate to="/privacy-policy" replace />} />
                <Route path="/privacy-policy" element={publicPage(<PublicPrivacyPolicy />)} />
                <Route path="/terms" element={publicPage(<PublicTerms />)} />
                <Route path="/account-deletion" element={publicPage(<PublicAccountDeletion />)} />
                <Route path="/delete-account" element={<Navigate to="/account-deletion" replace />} />
                <Route path="/google-library-order-rules" element={publicPage(<GoogleLibraryOrderRules />)} />
                <Route path="/about" element={publicPage(<About />)} />
                <Route path="/contact" element={publicPage(<PublicContact />)} />
                <Route path="/support" element={publicPage(<PublicContact />)} />
                <Route path="/agency-policy" element={publicPage(<AgencyPolicy />)} />
                <Route path="/policies-benefits" element={publicPage(<PoliciesAndBenefits />)} />
                <Route path="/helper-policy" element={publicPage(<AgencyPolicy />)} />
                <Route path="/sync-test" element={<SyncTest />} />
                
                {/* ============================================= */}
                {/* PROTECTED ROUTES - Authentication required */}
                {/* Users MUST sign up first before accessing these */}
                {/* ============================================= */}
                <Route path="/index" element={isTabKeepAliveEnabled() ? <ProtectedRoute session={session}><></></ProtectedRoute> : <ProtectedRoute session={session}><Index /></ProtectedRoute>} />
                <Route path="/discover" element={isTabKeepAliveEnabled() ? <ProtectedRoute session={session}><></></ProtectedRoute> : <ProtectedRoute session={session}><Discover /></ProtectedRoute>} />
                <Route path="/live" element={<ProtectedRoute session={session}><Live /></ProtectedRoute>} />
                <Route path="/live-feed" element={<ProtectedRoute session={session}><RequireNativeAndroidGate feature="live"><LiveStreamFeed /></RequireNativeAndroidGate></ProtectedRoute>} />
                <Route path="/live-feed/:id" element={<ProtectedRoute session={session}><RequireNativeAndroidGate feature="live"><LiveStreamFeed /></RequireNativeAndroidGate></ProtectedRoute>} />
                <Route path="/live/:id" element={<ProtectedRoute session={session}><RequireNativeAndroidGate feature="live"><RequireNoActiveCall><LiveStreamKeyWrapper /></RequireNoActiveCall></RequireNativeAndroidGate></ProtectedRoute>} />
                <Route path="/chat" element={isTabKeepAliveEnabled() ? <ProtectedRoute session={session}><></></ProtectedRoute> : <ProtectedRoute session={session}><Chat /></ProtectedRoute>} />
                <Route path="/messages" element={<Navigate to="/chat" replace />} />
                <Route path="/message" element={<Navigate to="/chat" replace />} />
                <Route path="/inbox" element={<Navigate to="/chat" replace />} />
                <Route path="/invite/:token" element={<GroupInvitePage />} />
                <Route path="/profile" element={<ProtectedRoute session={session}><ErrorBoundary componentName="Profile"><Profile /></ErrorBoundary></ProtectedRoute>} />

                <Route path="/recharge" element={<ProtectedRoute session={session}><Recharge /></ProtectedRoute>} />
                <Route path="/top-up" element={<Navigate to="/recharge" replace />} />
                <Route path="/topup" element={<Navigate to="/recharge" replace />} />
                <Route path="/diamond-top-up" element={<Navigate to="/recharge" replace />} />
                <Route path="/diamonds" element={<Navigate to="/recharge" replace />} />
                <Route path="/payment-success" element={<ProtectedRoute session={session}><PaymentSuccess /></ProtectedRoute>} />
                <Route path="/edit-profile" element={<ProtectedRoute session={session}><EditProfile /></ProtectedRoute>} />
                <Route path="/level" element={<ProtectedRoute session={session}><Level /></ProtectedRoute>} />
                <Route path="/shop" element={<ProtectedRoute session={session}><Shop /></ProtectedRoute>} />
                <Route path="/vip" element={<ProtectedRoute session={session}><VIP /></ProtectedRoute>} />
                <Route path="/invitation" element={<ProtectedRoute session={session}><Invitation /></ProtectedRoute>} />
                <Route path="/tasks" element={<ProtectedRoute session={session}><Tasks /></ProtectedRoute>} />
                <Route path="/host-bonus-ledger" element={<ProtectedRoute session={session}><HostBonusLedger /></ProtectedRoute>} />
                <Route path="/country-admin/dashboard" element={<ProtectedRoute session={session}><CountryAdminDashboard /></ProtectedRoute>} />
                <Route path="/settings" element={<ProtectedRoute session={session}><Settings /></ProtectedRoute>} />
                <Route path="/ai-chat" element={<Navigate to="/settings/customer-service" replace />} />
                <Route path="/ai-support" element={<Navigate to="/settings/customer-service" replace />} />
                <Route path="/user-id" element={<Navigate to="/edit-profile" replace />} />
                <Route path="/account-id" element={<Navigate to="/edit-profile" replace />} />
                <Route path="/debug/referrer" element={<ProtectedRoute session={session}><DebugReferrer /></ProtectedRoute>} />
                <Route path="/debug/referrer-test" element={<ProtectedRoute session={session}><DebugReferrerTest /></ProtectedRoute>} />
                <Route path="/settings/blacklist" element={<ProtectedRoute session={session}><Blacklist /></ProtectedRoute>} />
                <Route path="/settings/privacy-policy" element={<ProtectedRoute session={session}><ContentPageView /></ProtectedRoute>} />
                <Route path="/settings/user-agreement" element={<ProtectedRoute session={session}><ContentPageView /></ProtectedRoute>} />
                <Route path="/settings/about-us" element={<ProtectedRoute session={session}><ContentPageView /></ProtectedRoute>} />
                <Route path="/settings/user-management" element={<ProtectedRoute session={session}><UserManagement /></ProtectedRoute>} />
                <Route path="/settings/notifications" element={<ProtectedRoute session={session}><NotificationSettings /></ProtectedRoute>} />
                <Route path="/settings/customer-service" element={<ProtectedRoute session={session}><CustomerService /></ProtectedRoute>} />
                <Route path="/developer-options" element={<ProtectedRoute session={session}><DeveloperOptions /></ProtectedRoute>} />
                <Route path="/app-support" element={<Navigate to="/settings/customer-service" replace />} />
                <Route path="/rewards" element={<ProtectedRoute session={session}><Rewards /></ProtectedRoute>} />
                <Route path="/rewards/rating-history" element={<ProtectedRoute session={session}><RatingProofHistory /></ProtectedRoute>} />
                <Route path="/parcels" element={<ProtectedRoute session={session}><Parcels /></ProtectedRoute>} />
                <Route path="/agency" element={session ? <ProtectedRoute session={session}><Agency /></ProtectedRoute> : <Navigate to="/auth" replace />} />
                <Route path="/agent-rank" element={<ProtectedRoute session={session}><AgentRank /></ProtectedRoute>} />
                <Route path="/leaderboard" element={<ProtectedRoute session={session}><Leaderboard /></ProtectedRoute>} />
                <Route path="/pk-leaderboard/:id" element={<ProtectedRoute session={session}><PKLeaderboard /></ProtectedRoute>} />
                <Route path="/host-application" element={<ProtectedRoute session={session}><HostApplication /></ProtectedRoute>} />
                <Route path="/agent-wallet" element={<ProtectedRoute session={session}><AgentWallet /></ProtectedRoute>} />
                <Route path="/wallet" element={<Navigate to="/agent-wallet" replace />} />
                <Route path="/my-beans" element={<Navigate to="/agent-wallet" replace />} />
                <Route path="/beans" element={<Navigate to="/agent-wallet" replace />} />
                <Route path="/transfer-history" element={<ProtectedRoute session={session}><TransferHistory /></ProtectedRoute>} />
                <Route path="/create-agency" element={session ? <ProtectedRoute session={session}><CreateAgency /></ProtectedRoute> : publicPage(<AgencySignup />)} />
                <Route path="/agency-signup" element={publicPage(<AgencySignup />)} />
                <Route path="/agency-dashboard" element={<ProtectedRoute session={session}><AgencyDashboard /></ProtectedRoute>} />
                <Route path="/agency-withdrawal" element={<ProtectedRoute session={session}><AgencyWithdrawal /></ProtectedRoute>} />
                <Route path="/agency-coin-exchange" element={<ProtectedRoute session={session}><AgencyCoinExchange /></ProtectedRoute>} />
                <Route path="/agency-coin-trader" element={<ProtectedRoute session={session}><AgencyCoinTrader /></ProtectedRoute>} />
                <Route path="/agency-transfer-history" element={<ProtectedRoute session={session}><AgencyTransferHistory /></ProtectedRoute>} />
                <Route path="/agency-commission-history" element={<ProtectedRoute session={session}><AgencyCommissionHistory /></ProtectedRoute>} />
                <Route path="/agency-host-management" element={<ProtectedRoute session={session}><AgencyHostManagement /></ProtectedRoute>} />
                <Route path="/join-agency" element={<ProtectedRoute session={session}><JoinAgency /></ProtectedRoute>} />
                <Route path="/become-sub-agent" element={publicPage(<BecomeSubAgent />)} />
                <Route path="/agency-details" element={<ProtectedRoute session={session}><AgencyDetails /></ProtectedRoute>} />
                <Route path="/host-transfer-history" element={<ProtectedRoute session={session}><HostTransferHistory /></ProtectedRoute>} />
                <Route path="/call-history" element={<ProtectedRoute session={session}><CallHistory /></ProtectedRoute>} />
                <Route path="/call" element={<Navigate to="/call-history" replace />} />
                <Route path="/match-call" element={<ProtectedRoute session={session}><MatchCall /></ProtectedRoute>} />
                <Route path="/match-call/session/:sessionId" element={<ProtectedRoute session={session}><MatchCall /></ProtectedRoute>} />
                <Route path="/following" element={<ProtectedRoute session={session}><FollowingList /></ProtectedRoute>} />
                <Route path="/following-list" element={<ProtectedRoute session={session}><FollowingList /></ProtectedRoute>} />
                <Route path="/search" element={<ProtectedRoute session={session}><SearchUsers /></ProtectedRoute>} />
                <Route path="/recharge-history" element={<ProtectedRoute session={session}><RechargeHistory /></ProtectedRoute>} />
                
                <Route path="/tags" element={<ProtectedRoute session={session}><Tags /></ProtectedRoute>} />
                <Route path="/my-poster" element={<ProtectedRoute session={session}><MyPoster /></ProtectedRoute>} />
                <Route path="/host-dashboard" element={<ProtectedRoute session={session}><HostDashboard /></ProtectedRoute>} />
                
                <Route path="/my-recordings" element={<ProtectedRoute session={session}><MyRecordings /></ProtectedRoute>} />
                <Route path="/host-verification" element={<ProtectedRoute session={session}><FaceVerification /></ProtectedRoute>} />
                <Route path="/face-verification" element={<ProtectedRoute session={session}><FaceVerification /></ProtectedRoute>} />
                <Route path="/dev/face-pose-tests" element={<ProtectedRoute session={session}><FacePoseRegression /></ProtectedRoute>} />
                <Route path="/dev/avatar-ring-check" element={<ProtectedRoute session={session}><AvatarFrameRingCheck /></ProtectedRoute>} />
                <Route path="/dev/video-frames" element={publicPage(<DebugVideoFrames />)} />
                <Route path="/debug/video-frames" element={publicPage(<DebugVideoFrames />)} />
                <Route path="/helper-dashboard" element={<ProtectedRoute session={session}><HelperDashboard /></ProtectedRoute>} />
                <Route path="/level5-helper-dashboard" element={<ProtectedRoute session={session}><Level5HelperDashboard /></ProtectedRoute>} />
                <Route path="/payroll-helper-guide" element={publicPage(<PayrollHelperGuide />)} />
                <Route path="/party-rooms" element={<ProtectedRoute session={session}><PartyRooms /></ProtectedRoute>} />
                <Route path="/create" element={<Navigate to="/go-live" replace />} />
                <Route path="/party/:roomId" element={<ProtectedRoute session={session}><RequireNativeAndroidGate feature="party"><RequireNoActiveCall><PartyRoom /></RequireNoActiveCall></RequireNativeAndroidGate></ProtectedRoute>} />
                <Route path="/go-live" element={<ProtectedRoute session={session}><RequireNativeAndroidGate feature="live"><RequireNoActiveCall><LiveSessionPage /></RequireNoActiveCall></RequireNativeAndroidGate></ProtectedRoute>} />
                <Route path="/live-session" element={<ProtectedRoute session={session}><RequireNativeAndroidGate feature="live"><RequireNoActiveCall><LiveSessionPage /></RequireNoActiveCall></RequireNativeAndroidGate></ProtectedRoute>} />
                <Route path="/reels" element={isTabKeepAliveEnabled() ? <ProtectedRoute session={session}><></></ProtectedRoute> : <ProtectedRoute session={session}><Reels /></ProtectedRoute>} />
                <Route path="/create-party" element={<ProtectedRoute session={session}><RequireNativeAndroidGate feature="party"><RequireNoActiveCall><PartySessionPage /></RequireNoActiveCall></RequireNativeAndroidGate></ProtectedRoute>} />
                <Route path="/party-session" element={<ProtectedRoute session={session}><RequireNativeAndroidGate feature="party"><RequireNoActiveCall><PartySessionPage /></RequireNoActiveCall></RequireNativeAndroidGate></ProtectedRoute>} />
                <Route path="/profile/:userId" element={<ProtectedRoute session={session}><ProfileDetail /></ProtectedRoute>} />
                <Route path="/profile-detail/:userId" element={<ProtectedRoute session={session}><ProfileDetail /></ProtectedRoute>} />
                
                {/* Games */}
                <Route path="/games" element={<ProtectedRoute session={session}><GamesHub /></ProtectedRoute>} />
                <Route path="/games/roulette" element={<ProtectedRoute session={session}><RoulettePage /></ProtectedRoute>} />
                <Route path="/games/ferris-wheel" element={<ProtectedRoute session={session}><FerrisWheelPage /></ProtectedRoute>} />
                <Route path="/games/teen-patti" element={<ProtectedRoute session={session}><TeenPattiPage /></ProtectedRoute>} />
                <Route path="/games/lucky-wheel-test" element={<ProtectedRoute session={session}><LuckyWheelTestPage /></ProtectedRoute>} />
                
                {/* Admin Panel - Protected by AdminAccessGuard */}
                {/* Shows blog page to unauthorized users, admin panel to authorized */}
                <Route path="/admin/auth" element={<Suspense fallback={<AdminChunkLoader />}><AdminAccessGuard><AdminAuth /></AdminAccessGuard></Suspense>} />
                <Route path="/admin/login" element={<Suspense fallback={<AdminChunkLoader />}><AdminAccessGuard><AdminAuth /></AdminAccessGuard></Suspense>} />
                <Route path="/admin" element={<Suspense fallback={<AdminChunkLoader />}><AdminAccessGuard><AdminLayout /></AdminAccessGuard></Suspense>}>
                  <Route index element={<SubAdminDashboardGuard><AdminDashboard /></SubAdminDashboardGuard>} />
                  <Route path="profit-analytics" element={<AdminRouteGuard routeSegment="dashboard"><AdminProfitAnalytics /></AdminRouteGuard>} />
                  <Route path="payouts-analytics" element={<AdminRouteGuard routeSegment="dashboard"><AdminPayoutsAnalytics /></AdminRouteGuard>} />
                  <Route path="agencies" element={<AdminRouteGuard routeSegment="agencies"><AdminAgencies /></AdminRouteGuard>} />
                  <Route path="agencies/:agencyId" element={<AdminRouteGuard routeSegment="agencies"><AdminAgencyDetail /></AdminRouteGuard>} />
                  <Route path="approvals" element={<AdminRouteGuard routeSegment="agencies"><AdminUnifiedApprovals /></AdminRouteGuard>} />
                  <Route path="user-management" element={<AdminRouteGuard routeSegment="user-management"><AdminUserManagement /></AdminRouteGuard>} />
                  <Route path="super-admin-management" element={<AdminRouteGuard routeSegment="super-admin-management"><AdminSuperAdminManagement /></AdminRouteGuard>} />
                  <Route path="coin-traders" element={<AdminRouteGuard routeSegment="coin-traders"><AdminCoinTraders /></AdminRouteGuard>} />
                  <Route path="coin-traders/approvals" element={<AdminRouteGuard routeSegment="coin-traders"><AdminTopupTraderApprovals /></AdminRouteGuard>} />
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
                  <Route path="track-recordings" element={<AdminRouteGuard routeSegment="track-recordings"><AdminTrackRecordings /></AdminRouteGuard>} />
                  <Route path="sip-inbound" element={<AdminRouteGuard routeSegment="sip-inbound"><AdminSipInbound /></AdminRouteGuard>} />
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
                  <Route path="random-call" element={<AdminRouteGuard routeSegment="pricing-hub"><AdminRandomCallSettings /></AdminRouteGuard>} />
                  <Route path="random-call-ops" element={<AdminRouteGuard routeSegment="pricing-hub"><AdminRandomCallOps /></AdminRouteGuard>} />
                  {/* Deprecated → unified Pricing Hub */}
                  <Route path="commissions" element={<Navigate to="/admin/pricing-hub" replace />} />
                  <Route path="withdrawals" element={<AdminRouteGuard routeSegment="withdrawals"><AdminWithdrawals /></AdminRouteGuard>} />
                  <Route path="branding" element={<AdminRouteGuard routeSegment="branding"><AdminBranding /></AdminRouteGuard>} />
                  <Route path="notification-templates" element={<AdminRouteGuard routeSegment="notification-templates"><AdminNotificationTemplates /></AdminRouteGuard>} />
                  <Route path="ai-image-studio" element={<AdminRouteGuard routeSegment="ai-image-studio"><AdminAiImageStudio /></AdminRouteGuard>} />
                  <Route path="reports" element={<AdminRouteGuard routeSegment="reports"><AdminReports /></AdminRouteGuard>} />
                  <Route path="logs" element={<AdminRouteGuard routeSegment="logs"><AdminLogs /></AdminRouteGuard>} />
                  <Route path="coins" element={<AdminRouteGuard routeSegment="coins"><AdminCoins /></AdminRouteGuard>} />
                  <Route path="payment-gateways" element={<AdminRouteGuard routeSegment="payment-gateways"><AdminPaymentGateways /></AdminRouteGuard>} />
                  <Route path="transfer-scheduler" element={<AdminRouteGuard routeSegment="transfer-scheduler"><AdminTransferScheduler /></AdminRouteGuard>} />
                  <Route path="agency-commission-log" element={<AdminRouteGuard routeSegment="agency-commission-log"><AdminAgencyCommissionLog /></AdminRouteGuard>} />
                  <Route path="transfer-history" element={<AdminRouteGuard routeSegment="transfer-history"><AdminTransferHistory /></AdminRouteGuard>} />
                  <Route path="recharge-history" element={<AdminRouteGuard routeSegment="recharge-history"><AdminRechargeHistory /></AdminRouteGuard>} />
                  <Route path="wallet-ledger" element={<AdminRouteGuard routeSegment="recharge-history"><AdminWalletLedger /></AdminRouteGuard>} />
                  <Route path="rewards-audit" element={<AdminRouteGuard routeSegment="recharge-history"><AdminRewardsAudit /></AdminRouteGuard>} />
                  <Route path="orphan-payments" element={<AdminRouteGuard routeSegment="recharge-history"><AdminOrphanPayments /></AdminRouteGuard>} />
                  <Route path="users/:userId/wallet" element={<AdminRouteGuard routeSegment="recharge-history"><AdminUserWallet /></AdminRouteGuard>} />
                  <Route path="suspicious-activity" element={<AdminRouteGuard routeSegment="recharge-history"><AdminSuspiciousActivity /></AdminRouteGuard>} />
                  <Route path="payout-forensics" element={<AdminRouteGuard routeSegment="recharge-history"><AdminPayoutForensics /></AdminRouteGuard>} />
                  <Route path="crypto-recovery" element={<AdminRouteGuard routeSegment="recharge-history"><AdminCryptoRecovery /></AdminRouteGuard>} />
                  <Route path="google-play-health" element={<AdminRouteGuard routeSegment="recharge-history"><AdminGooglePlayHealth /></AdminRouteGuard>} />
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
                  <Route path="app-update-logs" element={<AdminRouteGuard routeSegment="app-update-logs"><AdminAppUpdateLogs /></AdminRouteGuard>} />
                  <Route path="app-update-test" element={<AdminRouteGuard routeSegment="app-update-test"><AdminAppUpdateTest /></AdminRouteGuard>} />
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
                  <Route path="face-verification/timeline/:userId" element={<AdminRouteGuard routeSegment="face-verification"><AdminFaceVerificationTimeline /></AdminRouteGuard>} />
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
                  <Route path="gift-animation-config" element={<AdminRouteGuard routeSegment="gift-animation-config"><AdminGiftAnimationConfig /></AdminRouteGuard>} />
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
                  <Route path="auto-actions" element={<AdminRouteGuard routeSegment="auto-actions"><AdminAutoActions /></AdminRouteGuard>} />
                  <Route path="livekit-rooms" element={<AdminRouteGuard routeSegment="livekit-rooms"><AdminLiveKitRooms /></AdminRouteGuard>} />
                  <Route path="livekit-egress" element={<AdminRouteGuard routeSegment="livekit-egress"><AdminLiveKitEgress /></AdminRouteGuard>} />
                  <Route path="livekit-ingress" element={<AdminRouteGuard routeSegment="livekit-ingress"><AdminLiveKitIngress /></AdminRouteGuard>} />
                  <Route path="livekit-sip" element={<AdminRouteGuard routeSegment="livekit-sip"><AdminLiveKitSip /></AdminRouteGuard>} />
                  <Route path="livekit-webhook" element={<AdminRouteGuard routeSegment="livekit-webhook"><AdminLiveKitWebhook /></AdminRouteGuard>} />

                  <Route path="cost-monitor" element={<AdminRouteGuard routeSegment="cost-monitor"><AdminCostMonitor /></AdminRouteGuard>} />
                  <Route path="moderation-audit" element={<AdminRouteGuard routeSegment="moderation-audit"><AdminModerationAudit /></AdminRouteGuard>} />
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
                  <Route path="otp-providers" element={<AdminRouteGuard routeSegment="otp-providers"><AdminOtpProviders /></AdminRouteGuard>} />

                  <Route path="leaderboard-management" element={<AdminRouteGuard routeSegment="leaderboard-management"><AdminLeaderboardManagement /></AdminRouteGuard>} />
                  <Route path="allowed-links" element={<AdminRouteGuard routeSegment="allowed-links"><AdminAllowedLinks /></AdminRouteGuard>} />
                  
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
              </StableRoutes>
              )}
              </ErrorBoundary>
              
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
              </CallProviderGate>
            </BrowserRouter>
          </TooltipProvider>
          </MotionConfig>
      </>
  );

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: queryPersister as any,
        maxAge: 1000 * 60 * 60 * 6,
        buster: 'merilive-v2-lean',
        dehydrateOptions: {
          shouldDehydrateQuery: (query: any) => {
            const root = String(query?.queryKey?.[0] ?? '');
            return ['app-settings', 'global-settings', 'coin-packages', 'payment-methods', 'user-balance', 'index-hosts-v4', 'host-countries'].includes(root);
          },
        },
      }}
    >
      <Suspense fallback={null}><NativeSystemUIBridge /></Suspense>
      <Suspense fallback={null}><KeyboardInsetsBridge /></Suspense>
      <Suspense fallback={null}><GlobalKeyboardScrollBridge /></Suspense>
      <Suspense fallback={null}><GlobalImageDefaultsBridge /></Suspense>


      {session && !isAdminRoute && !isStandalonePublicRoute ? (
        <RealtimeProvider notifyOnImportantUpdates={!isAdminRoute}>
          <PresenceProvider>
            {appShell}
          </PresenceProvider>
        </RealtimeProvider>
      ) : (
        appShell
      )}
    </PersistQueryClientProvider>
  );
};

export default App;
