/**
 * Admin Route Prefetcher
 *
 * Maps admin route paths to their dynamic import functions so the sidebar can
 * prefetch a route's chunk on hover/focus/touch — making navigation feel
 * instant once you click.
 *
 * Each prefetched chunk is cached by the browser, so the second call is a no-op.
 */

type Importer = () => Promise<unknown>;
type IdleCapableWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
};

// Lazy registration so we don't pull every page on app start —
// imports are only executed when prefetchAdminRoute() is called.
const ROUTE_IMPORTERS: Record<string, Importer> = {
  '/admin': () => import('@/pages/admin/AdminDashboard'),
  '/admin/dashboard': () => import('@/pages/admin/AdminDashboard'),
  '/admin/users': () => import('@/pages/admin/AdminUsers'),
  '/admin/user-management': () => import('@/pages/admin/AdminUserManagement'),
  '/admin/agencies': () => import('@/pages/admin/AdminAgencies'),
  '/admin/agency-policy': () => import('@/pages/admin/AdminAgencyPolicy'),
  '/admin/agency-hub': () => import('@/pages/admin/AdminAgencyHub'),
  '/admin/withdrawals': () => import('@/pages/admin/AdminWithdrawals'),
  '/admin/recharge-history': () => import('@/pages/admin/AdminRechargeHistory'),
  '/admin/streams': () => import('@/pages/admin/AdminStreams'),
  '/admin/reports': () => import('@/pages/admin/AdminReports'),
  '/admin/user-reports': () => import('@/pages/admin/AdminUserReports'),
  '/admin/gift-transactions': () => import('@/pages/admin/AdminGiftTransactions'),
  '/admin/gifts': () => import('@/pages/admin/AdminGifts'),
  '/admin/face-verification': () => import('@/pages/admin/AdminFaceVerification'),
  '/admin/face-violations': () => import('@/pages/admin/AdminFaceViolations'),
  '/admin/online-users': () => import('@/pages/admin/AdminOnlineUsers'),
  '/admin/today-calls': () => import('@/pages/admin/AdminTodayCalls'),
  '/admin/blocked': () => import('@/pages/admin/AdminBlocked'),
  '/admin/live-bans': () => import('@/pages/admin/AdminLiveBans'),
  '/admin/permanent-ban': () => import('@/pages/admin/AdminPermanentBan'),
  '/admin/contact-violations': () => import('@/pages/admin/AdminContactViolations'),
  '/admin/coins': () => import('@/pages/admin/AdminCoins'),
  '/admin/pricing-hub': () => import('@/pages/admin/AdminPricingHub'),
  '/admin/finance': () => import('@/pages/admin/AdminFinance'),
  '/admin/coin-traders': () => import('@/pages/admin/AdminCoinTraders'),
  '/admin/banners': () => import('@/pages/admin/AdminBanners'),
  '/admin/frames': () => import('@/pages/admin/AdminFrames'),
  '/admin/entry-banners': () => import('@/pages/admin/AdminEntryBanners'),
  '/admin/entry-effects': () => import('@/pages/admin/AdminEntryEffects'),
  '/admin/chat-bubbles': () => import('@/pages/admin/AdminChatBubbles'),
  '/admin/animation-store': () => import('@/pages/admin/AdminAnimationStore'),
  '/admin/branding': () => import('@/pages/admin/AdminBranding'),
  '/admin/icon-registry': () => import('@/pages/admin/AdminIconRegistry'),
  '/admin/verified-badges': () => import('@/pages/admin/AdminVerifiedBadges'),
  '/admin/party-backgrounds': () => import('@/pages/admin/AdminPartyBackgrounds'),
  // Deprecated pricing routes redirect to '/admin/pricing-hub' (Pkg30+)
  
  '/admin/game-settings': () => import('@/pages/admin/AdminGameSettings'),
  '/admin/game-providers': () => import('@/pages/admin/AdminGameProviders'),
  '/admin/level-tiers': () => import('@/pages/admin/AdminLevelTiers'),
  '/admin/leaderboard-management': () => import('@/pages/admin/AdminLeaderboardManagement'),
  '/admin/feature-levels': () => import('@/pages/admin/AdminFeatureLevels'),
  '/admin/content': () => import('@/pages/admin/AdminContent'),
  '/admin/content-management': () => import('@/pages/admin/AdminContentManagement'),
  '/admin/email-broadcast': () => import('@/pages/admin/AdminEmailBroadcast'),
  '/admin/gmail-support': () => import('@/pages/admin/AdminGmailSupport'),
  '/admin/error-logs': () => import('@/pages/admin/AdminErrorLogs'),
  '/admin/device-approvals': () => import('@/pages/admin/AdminDeviceApprovals'),
  '/admin/device-management': () => import('@/pages/admin/AdminDeviceManagement'),
  '/admin/balance-deduction': () => import('@/pages/admin/AdminBalanceDeduction'),
  '/admin/manual-topup': () => import('@/pages/admin/AdminManualTopup'),
  '/admin/topup-system': () => import('@/pages/admin/AdminTopupSystem'),
  '/admin/helper-management': () => import('@/pages/admin/AdminHelperManagement'),
  '/admin/helper-orders': () => import('@/pages/admin/AdminHelperOrders'),
  '/admin/blueprint': () => import('@/pages/admin/AdminBlueprint'),
  '/admin/allowed-links': () => import('@/pages/admin/AdminAllowedLinks'),
  '/admin/chat-inspector': () => import('@/pages/admin/AdminChatInspector'),
  '/admin/number-sharing': () => import('@/pages/admin/AdminNumberSharing'),
  '/admin/settings': () => import('@/pages/admin/AdminSettings'),
  '/admin/reels': () => import('@/pages/admin/AdminReels'),
  '/admin/recordings': () => import('@/pages/admin/AdminRecordings'),
  '/admin/track-recordings': () => import('@/pages/admin/AdminTrackRecordings'),
  '/admin/sip-inbound': () => import('@/pages/admin/AdminSipInbound'),
  '/admin/reward-claims-history': () => import('@/pages/admin/AdminRewardClaimsHistory'),
  '/admin/host-search': () => import('@/pages/admin/AdminHostSearch'),
  '/admin/rating-rewards': () => import('@/pages/admin/AdminRatingRewards'),
  '/admin/role-frames': () => import('@/pages/admin/AdminRoleFrames'),
  '/admin/beauty-filters': () => import('@/pages/admin/AdminBeautyFilters'),
  '/admin/country-distribution': () => import('@/pages/admin/AdminCountryDistribution'),
  '/admin/agencies/:agencyId': () => import('@/pages/admin/AdminAgencyDetail'),
  '/admin/coin-traders/approvals': () => import('@/pages/admin/AdminTopupTraderApprovals'),
  '/admin/coin-traders/orders': () => import('@/pages/admin/AdminTraderOrders'),
  '/admin/coin-traders/transactions': () => import('@/pages/admin/AdminTraderTransactions'),
  '/admin/level-privileges': () => import('@/pages/admin/AdminLevelPrivileges'),
  '/admin/vip-privileges': () => import('@/pages/admin/AdminVIPPrivileges'),
  '/admin/entry-bars': () => import('@/pages/admin/AdminEntryBars'),
  '/admin/invitation-settings': () => import('@/pages/admin/AdminInvitationSettings'),
  '/admin/helper-applications': () => import('@/pages/admin/AdminHelperApplications'),
  '/admin/level5-helpers': () => import('@/pages/admin/AdminLevel5Helpers'),
  '/admin/payroll-orders': () => import('@/pages/admin/AdminPayrollOrders'),
  '/admin/game-server': () => import('@/pages/admin/AdminGameServer'),
  '/admin/topup-payment-methods': () => import('@/pages/admin/AdminTopupPaymentMethods'),
  '/admin/helper-requests': () => import('@/pages/admin/AdminHelperRequests'),
  '/admin/party-rooms': () => import('@/pages/admin/AdminPartyRooms'),
  '/admin/error-log': () => import('@/pages/admin/AdminErrorLog'),
  '/admin/campaign-banner-hub': () => import('@/pages/admin/AdminCampaignBannerHub'),
  '/admin/popup-banners': () => import('@/pages/admin/AdminPopupBanners'),
  '/admin/rating-banners': () => import('@/pages/admin/AdminRatingBanners'),
  '/admin/onboarding-slides': () => import('@/pages/admin/AdminOnboardingSlides'),
  '/admin/notification-templates': () => import('@/pages/admin/AdminNotificationTemplates'),
  '/admin/logs': () => import('@/pages/admin/AdminLogs'),
  '/admin/payment-gateways': () => import('@/pages/admin/AdminPaymentGateways'),
  '/admin/transfer-scheduler': () => import('@/pages/admin/AdminTransferScheduler'),
  '/admin/agency-commission-log': () => import('@/pages/admin/AdminAgencyCommissionLog'),
  '/admin/transfer-history': () => import('@/pages/admin/AdminTransferHistory'),
  '/admin/recharge-campaigns': () => import('@/pages/admin/AdminRechargeCampaigns'),
  '/admin/shop': () => import('@/pages/admin/AdminShop'),
  '/admin/party-banners': () => import('@/pages/admin/AdminPartyBanners'),
  '/admin/app-version': () => import('@/pages/admin/AdminAppVersion'),
  '/admin/vip-medals': () => import('@/pages/admin/AdminVIPMedals'),
  '/admin/noble-cards': () => import('@/pages/admin/AdminNobleCards'),
  '/admin/noble-subscriptions': () => import('@/pages/admin/AdminNobleSubscriptions'),
  '/admin/vehicle-entrances': () => import('@/pages/admin/AdminVehicleEntrances'),
  '/admin/entry-name-bars': () => import('@/pages/admin/AdminEntryNameBars'),
  '/admin/host-applications': () => import('@/pages/admin/AdminHostApplications'),
  '/admin/hosts': () => import('@/pages/admin/AdminHosts'),
  '/admin/moderation': () => import('@/pages/admin/AdminModeration'),
  '/admin/host-conversion': () => import('@/pages/admin/AdminHostConversion'),
  '/admin/tasks-settings': () => import('@/pages/admin/AdminTasksSettings'),
  '/admin/ranking-rewards': () => import('@/pages/admin/AdminRankingRewards'),
  '/admin/rewards-management': () => import('@/pages/admin/AdminRewardsManagement'),
  '/admin/level-management': () => import('@/pages/admin/AdminLevelManagement'),
  '/admin/vip-management': () => import('@/pages/admin/AdminVIPManagement'),
  '/admin/game-management': () => import('@/pages/admin/AdminGameManagement'),
  '/admin/party-management': () => import('@/pages/admin/AdminPartyManagement'),
  '/admin/coin-trader-hub': () => import('@/pages/admin/AdminCoinTraderHub'),
  '/admin/app-settings-hub': () => import('@/pages/admin/AdminAppSettingsHub'),
  '/admin/host-feed-ranking': () => import('@/pages/admin/AdminHostFeedRanking'),
  '/admin/party-discovery-ranking': () => import('@/pages/admin/AdminPartyDiscoveryRanking'),
  '/admin/ranking-automation': () => import('@/pages/admin/AdminRankingAutomation'),
  '/admin/visual-assets': () => import('@/pages/admin/AdminVisualAssetsHub'),
  '/admin/user-hub': () => import('@/pages/admin/AdminUserHub'),
  '/admin/support-tickets': () => import('@/pages/admin/AdminSupportTickets'),
  '/admin/support-reports': () => import('@/pages/admin/AdminSupportReports'),
  '/admin/pending-approvals': () => import('@/pages/admin/AdminPendingApprovals'),
  '/admin/auto-actions': () => import('@/pages/admin/AdminAutoActions'),
  '/admin/livekit-rooms': () => import('@/pages/admin/AdminLiveKitRooms'),
  '/admin/cost-monitor': () => import('@/pages/admin/AdminCostMonitor'),
  '/admin/moderation-audit': () => import('@/pages/admin/AdminModerationAudit'),
  '/admin/sub-admins': () => import('@/pages/admin/AdminSubAdmins'),
  '/admin/room-welcome-messages': () => import('@/pages/admin/AdminRoomWelcomeMessages'),
  '/admin/landing-page': () => import('@/pages/admin/AdminLandingPageManager'),
  '/admin/push-broadcast': () => import('@/pages/admin/AdminPushBroadcast'),
  '/admin/notice-broadcast': () => import('@/pages/admin/AdminNoticeBroadcast'),
  '/admin/theme-manager': () => import('@/pages/admin/AdminThemeManager'),
  '/admin/parcel-management': () => import('@/pages/admin/AdminParcelManagement'),
  '/admin/game-leaderboard': () => import('@/pages/admin/AdminGameLeaderboard'),
  '/admin/user-beans-exchange': () => import('@/pages/admin/AdminUserBeansExchange'),
};

const prefetched = new Set<string>();

/** Prefetch the JS chunk for an admin route; safe to call repeatedly. */
export function prefetchAdminRoute(path: string): void {
  if (!path || prefetched.has(path)) return;
  // Strip query/hash + trailing slashes for matching.
  const clean = path.split(/[?#]/)[0].replace(/\/+$/, '') || '/admin';
  if (prefetched.has(clean)) return;
  const importer = ROUTE_IMPORTERS[clean] || Object.entries(ROUTE_IMPORTERS).find(([route]) => {
    if (!route.includes('/:')) return false;
    const base = route.split('/:')[0];
    return clean.startsWith(`${base}/`);
  })?.[1];
  if (!importer) return;
  prefetched.add(clean);
  // Run in a microtask to never block UI thread.
  setTimeout(() => importer().catch(() => prefetched.delete(clean)), 0);
}

/** Bulk prefetch — warms EVERY registered admin route so navigation is instant.
 *  Runs in idle slices to avoid blocking the main thread / network. */
export function prefetchCommonAdminRoutes(): void {
  const all = Object.keys(ROUTE_IMPORTERS);
  const idleWindow: IdleCapableWindow | undefined = typeof window !== 'undefined' ? window : undefined;
  const ric: (cb: () => void) => void =
    idleWindow?.requestIdleCallback
      ? (cb) => { idleWindow.requestIdleCallback?.(cb, { timeout: 2000 }); }
      : (cb) => setTimeout(cb, 50);

  let i = 0;
  const step = () => {
    // Prefetch a small batch per idle tick so we don't saturate the network.
    const end = Math.min(i + 4, all.length);
    for (; i < end; i++) prefetchAdminRoute(all[i]);
    if (i < all.length) ric(step);
  };
  ric(step);
}
