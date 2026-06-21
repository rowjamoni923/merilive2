/**
 * Idle-time route warm-up — APP-WIDE.
 *
 * After first paint, silently import every user-facing page chunk in tiers
 * so within ~15-20 seconds of app open, ANY navigation the user makes is
 * served from the in-memory module cache (0 ms chunk fetch, no skeleton).
 *
 * - Runs once per session, guarded by `started`.
 * - Uses requestIdleCallback (falls back to setTimeout) so it never competes
 *   with first-paint or user input.
 * - Each import is wrapped in .catch(()=>{}) so a single 404 / chunk error
 *   never breaks the chain.
 * - Tiered + sequential at 250 ms gaps to avoid saturating the network.
 * - On Capacitor native, runs only tier-1 (WebView already prefetches the
 *   next route on touch via routePrefetch.ts and bulk-importing dozens of
 *   chunks competes with REST/realtime/media on real devices).
 */

let started = false;

const ric = (cb: () => void, timeout = 4000) => {
  const ricFn = (window as any).requestIdleCallback as
    | ((cb: () => void, opts?: { timeout: number }) => number)
    | undefined;
  if (ricFn) ricFn(cb, { timeout });
  else setTimeout(cb, 1500);
};

export function startIdleRoutePrefetch() {
  if (started || typeof window === 'undefined') return;
  started = true;

  const isNative = !!(window as any).Capacitor?.isNativePlatform?.();

  const warmSequentially = (imports: Array<() => Promise<unknown>>, gap = 250) => {
    imports.forEach((load, index) => {
      window.setTimeout(() => load().catch(() => {}), index * gap);
    });
  };

  // TIER 1 — bottom nav + most-tapped (warm immediately, both web & native)
  const tier1: Array<() => Promise<unknown>> = [
    () => import('@/pages/Chat'),
    () => import('@/pages/ProfileDetail'),
    () => import('@/pages/LiveStream'),
    () => import('@/pages/PartyRoom'),
    () => import('@/pages/EditProfile'),
    () => import('@/pages/Recharge'),
    () => import('@/pages/Tasks'),
    () => import('@/pages/Level'),
  ];

  // TIER 2 — drawer + secondary screens (web full, native skipped)
  const tier2: Array<() => Promise<unknown>> = [
    () => import('@/pages/Leaderboard'),
    () => import('@/pages/PartyRooms'),
    () => import('@/pages/CreateParty'),
    () => import('@/pages/CallHistory'),
    () => import('@/pages/FollowingList'),
    () => import('@/pages/SearchUsers'),
    () => import('@/pages/RechargeHistory'),
    () => import('@/pages/Rewards'),
    () => import('@/pages/Invitation'),
    () => import('@/pages/HostBonusLedger'),
    () => import('@/pages/HostApplication'),
    () => import('@/pages/HostDashboard'),
    () => import('@/pages/AgentRank'),
    () => import('@/pages/PKLeaderboard'),
    () => import('@/pages/VIP'),
    () => import('@/pages/Shop'),
    () => import('@/pages/MyPoster'),
    () => import('@/pages/MyRecordings'),
    () => import('@/pages/Tags'),
    () => import('@/pages/Live'),
    () => import('@/pages/LiveStreamFeed'),
  ];

  // TIER 3 — agency suite + settings sub-pages + games hub
  const tier3: Array<() => Promise<unknown>> = [
    () => import('@/pages/Agency'),
    () => import('@/pages/AgencyCoinExchange'),
    () => import('@/pages/AgencyCoinTrader'),
    () => import('@/pages/AgencyCommissionHistory'),
    () => import('@/pages/AgencyDetails'),
    () => import('@/pages/AgencyHostManagement'),
    () => import('@/pages/AgencyTransferHistory'),
    () => import('@/pages/AgencyWithdrawal'),
    () => import('@/pages/AgentWallet'),
    () => import('@/pages/TransferHistory'),
    () => import('@/pages/HostTransferHistory'),
    () => import('@/pages/JoinAgency'),
    () => import('@/pages/BecomeSubAgent'),
    () => import('@/pages/CreateAgency'),
    () => import('@/pages/settings/Blacklist'),
    () => import('@/pages/settings/ContentPage'),
    () => import('@/pages/settings/CustomerService'),
    () => import('@/pages/settings/NotificationSettings'),
    () => import('@/pages/settings/UserManagement'),
    () => import('@/pages/games/GamesHub'),
  ];

  ric(() => {
    warmSequentially(tier1, 250);
    if (!isNative) {
      window.setTimeout(() => warmSequentially(tier2, 300), tier1.length * 250 + 500);
      window.setTimeout(
        () => warmSequentially(tier3, 350),
        tier1.length * 250 + tier2.length * 300 + 1500,
      );
    }
  }, 2000);
}
