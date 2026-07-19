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
 * - Tiered + small-wave gaps so common routes warm before the user reaches them.
   * - On Capacitor native, still runs in smaller waves so every profile/menu/
   *   search/party/live/reels/game section becomes warm without creating one
   *   startup network storm.
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

  const warmSequentially = (imports: Array<() => Promise<unknown>>, gap = 90) => {
    imports.forEach((load, index) => {
      window.setTimeout(() => load().catch(() => {}), index * gap);
    });
  };

  // TIER 1 — the real next taps users complain about: bottom tabs, profile
  // actions and verification entry. Warm these right after auth so the first
  // tap never waits for a lazy chunk.
  const tier1: Array<() => Promise<unknown>> = [
    () => import('@/pages/Index'),
    () => import('@/pages/Discover'),
    () => import('@/pages/Profile'),
    () => import('@/pages/Chat'),
    () => import('@/pages/Settings'),
    () => import('@/pages/Reels'),
    () => import('@/pages/LiveSessionPage'),
    () => import('@/pages/PartySessionPage'),
    () => import('@/pages/MatchCall'),
    () => import('@/pages/FaceVerification'),
  ];

  // TIER 2 — drawer + profile/search/settings/party/reels secondary screens
  const tier2: Array<() => Promise<unknown>> = [
    () => import('@/pages/Live'),
    () => import('@/pages/GoLive'),
    () => import('@/pages/ProfileDetail'),
    () => import('@/pages/LiveStream'),
    () => import('@/pages/LiveStreamFeed'),
    () => import('@/pages/PartyRooms'),
    () => import('@/pages/PartyRoom'),
    () => import('@/pages/EditProfile'),
    () => import('@/pages/Recharge'),
    () => import('@/pages/Tasks'),
    () => import('@/pages/Level'),
    () => import('@/pages/Leaderboard'),
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
    () => import('@/pages/Parcels'),
    () => import('@/pages/RatingProofHistory'),
    () => import('@/pages/settings/Blacklist'),
    () => import('@/pages/settings/ContentPage'),
    () => import('@/pages/settings/CustomerService'),
    () => import('@/pages/settings/NotificationSettings'),
    () => import('@/pages/settings/UserManagement'),
  ];

  // TIER 3 — agency suite + games + lower-frequency support routes
  const tier3: Array<() => Promise<unknown>> = [
    () => import('@/pages/Agency'),
    () => import('@/pages/AgencySignup'),
    () => import('@/pages/AgencyDashboard'),
    () => import('@/pages/AgencyDiamondExchange'),
    () => import('@/pages/AgencyDiamondTrader'),
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
    () => import('@/pages/HelperDashboard'),
    () => import('@/pages/Level5HelperDashboard'),
    () => import('@/pages/games/GamesHub'),
    () => import('@/pages/games/RoulettePage'),
    () => import('@/pages/games/FerrisWheelPage'),
    () => import('@/pages/games/TeenPattiPage'),
    () => import('@/pages/games/LuckyWheelTestPage'),
  ];

  ric(() => {
    warmSequentially(tier1, isNative ? 160 : 90);
    window.setTimeout(() => warmSequentially(tier2, isNative ? 520 : 240), isNative ? 3500 : 1800);
    window.setTimeout(
      () => warmSequentially(tier3, isNative ? 1100 : 520),
      isNative ? 26000 : 14000,
    );
  }, isNative ? 1200 : 700);
}
