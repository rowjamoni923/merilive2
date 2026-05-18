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

// Lazy registration so we don't pull every page on app start —
// imports are only executed when prefetchAdminRoute() is called.
const ROUTE_IMPORTERS: Record<string, Importer> = {
  '/admin': () => import('@/pages/admin/AdminDashboard'),
  '/admin/dashboard': () => import('@/pages/admin/AdminDashboard'),
  '/admin/users': () => import('@/pages/admin/AdminUserManagement'),
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
  '/admin/agora-settings': () => import('@/pages/admin/AdminAgoraSettings'),
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
  '/admin/reward-claims-history': () => import('@/pages/admin/AdminRewardClaimsHistory'),
  '/admin/host-search': () => import('@/pages/admin/AdminHostSearch'),
  '/admin/rating-rewards': () => import('@/pages/admin/AdminRatingRewards'),
  '/admin/role-frames': () => import('@/pages/admin/AdminRoleFrames'),
  '/admin/beauty-filters': () => import('@/pages/admin/AdminBeautyFilters'),
  '/admin/country-distribution': () => import('@/pages/admin/AdminCountryDistribution'),
};

const prefetched = new Set<string>();

/** Prefetch the JS chunk for an admin route; safe to call repeatedly. */
export function prefetchAdminRoute(path: string): void {
  if (!path || prefetched.has(path)) return;
  // Strip query/hash + trailing slashes for matching.
  const clean = path.split(/[?#]/)[0].replace(/\/+$/, '') || '/admin';
  if (prefetched.has(clean)) return;
  const importer = ROUTE_IMPORTERS[clean];
  if (!importer) return;
  prefetched.add(clean);
  // Run in a microtask to never block UI thread.
  setTimeout(() => importer().catch(() => prefetched.delete(clean)), 0);
}

/** Bulk prefetch — warms EVERY registered admin route so navigation is instant.
 *  Runs in idle slices to avoid blocking the main thread / network. */
export function prefetchCommonAdminRoutes(): void {
  const all = Object.keys(ROUTE_IMPORTERS);
  const ric: (cb: () => void) => void =
    (typeof window !== 'undefined' && (window as any).requestIdleCallback)
      ? (cb) => (window as any).requestIdleCallback(cb, { timeout: 2000 })
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
