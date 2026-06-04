/**
 * Idle-time route warm-up.
 * After the app's first paint we silently import the chunks for the most-visited
 * pages so the user's first navigation to any of them is instant (0 ms chunk fetch).
 *
 * - Runs once per session
 * - Uses requestIdleCallback (falls back to setTimeout) so it never competes with
 *   first-paint or user input
 * - Each import is wrapped in .catch(()=>{}) so a single 404 never breaks the chain
 */

let started = false;

const ric = (cb: () => void, timeout = 4000) => {
  const ric = (window as any).requestIdleCallback as
    | ((cb: () => void, opts?: { timeout: number }) => number)
    | undefined;
  if (ric) ric(cb, { timeout });
  else setTimeout(cb, 1500);
};

export function startIdleRoutePrefetch() {
  if (started || typeof window === 'undefined') return;
  started = true;

  const warmSequentially = (imports: Array<() => Promise<unknown>>, gap = 900) => {
    imports.forEach((load, index) => {
      window.setTimeout(() => load().catch(() => {}), index * gap);
    });
  };

  ric(() => {
    // Tier 1 — most opened from home / bottom nav
    warmSequentially([
      () => import('@/pages/Chat'),
      () => import('@/pages/ProfileDetail'),
      () => import('@/pages/Recharge'),
      () => import('@/pages/LiveStream'),
      () => import('@/pages/PartyRoom'),
    ]);

    // Tier 2 — profile menu surfaces
    ric(() => {
      warmSequentially([
        () => import('@/pages/Settings'),
        () => import('@/pages/EditProfile'),
        () => import('@/pages/Tasks'),
        () => import('@/pages/Invitation'),
        () => import('@/pages/Level'),
        () => import('@/pages/VIP'),
        () => import('@/pages/Shop'),
        () => import('@/pages/RechargeHistory'),
        () => import('@/pages/CallHistory'),
        () => import('@/pages/FollowingList'),
        () => import('@/pages/SearchUsers'),
      ], 1200);
    }, 6000);

    // Tier 3 — agency / helper / withdrawal / leaderboard
    ric(() => {
      import('@/pages/AgencyDashboard').catch(() => {});
      import('@/pages/AgencyHostManagement').catch(() => {});
      import('@/pages/AgencyWithdrawal').catch(() => {});
      import('@/pages/AgencyCoinExchange').catch(() => {});
      import('@/pages/AgencyCoinTrader').catch(() => {});
      import('@/pages/AgencyTransferHistory').catch(() => {});
      import('@/pages/HelperDashboard').catch(() => {});
      import('@/pages/Level5HelperDashboard').catch(() => {});
      import('@/pages/HostDashboard').catch(() => {});
      import('@/pages/HostTransferHistory').catch(() => {});
      import('@/pages/Leaderboard').catch(() => {});
      import('@/pages/PKLeaderboard').catch(() => {});
      import('@/pages/Rewards').catch(() => {});
      import('@/pages/PartyRooms').catch(() => {});
      import('@/pages/Live').catch(() => {});
    }, 10000);
  }, 2000);
}
