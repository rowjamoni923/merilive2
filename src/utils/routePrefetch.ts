/**
 * Route prefetch helpers — called on `onPointerDown` / `onTouchStart` of
 * tappable cards so the destination chunk + critical realtime token start
 * loading 50-150ms BEFORE the click event fires. By the time React Router
 * mounts the page, the chunk is already warm in cache.
 *
 * This is the same technique Instagram / TikTok use for their feed cards:
 * "instant" navigation = prefetch on touch, not on click.
 *
 * All prefetchers are idempotent (browser caches the import) and silent
 * on failure — never block UI, never throw.
 */

let livePrefetched = false;
let partyPrefetched = false;
let profilePrefetched = false;
let chatPrefetched = false;
let installed = false;
const warmedRoutePromises = new Map<string, Promise<unknown>>();

const getInternalRouteFromHref = (href: string) => {
  if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return null;

  try {
    const url = href.startsWith('/')
      ? new URL(href, window.location.origin)
      : new URL(href);

    if (url.origin !== window.location.origin) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return href.startsWith('/') ? href : null;
  }
};

const loadKnownRouteChunk = (route: string): Promise<unknown> | null => {
  const path = route.split(/[?#]/)[0];

  if (path.startsWith('/live/') && path !== '/live/') return import('@/pages/LiveStream');
  if (path === '/live-feed' || path.startsWith('/live-feed/')) return import('@/pages/LiveStreamFeed');
  if (path.startsWith('/party/') && path !== '/party/') return import('@/pages/PartyRoom');
  if (path.startsWith('/profile-detail/') || (path.startsWith('/profile/') && path !== '/profile/')) return import('@/pages/ProfileDetail');
  if (path.startsWith('/chat/')) return import('@/pages/Chat');
  if (path.startsWith('/pk-leaderboard/')) return import('@/pages/PKLeaderboard');

  const loader = GENERIC_ROUTES[path];
  return loader ? loader() : null;
};

export function warmRouteForNavigation(route: string): Promise<unknown> | null {
  if (!route || typeof window === 'undefined') return null;
  const target = getInternalRouteFromHref(route);
  if (!target) return null;
  const cacheKey = target.split('#')[0];

  if (warmedRoutePromises.has(cacheKey)) return warmedRoutePromises.get(cacheKey)!;

  const promise = loadKnownRouteChunk(target);
  if (!promise) return null;

  const safePromise = promise.catch((error) => {
    warmedRoutePromises.delete(cacheKey);
    throw error;
  });
  warmedRoutePromises.set(cacheKey, safePromise);
  return safePromise;
}

export function prefetchLiveStream(streamId?: string) {
  if (!livePrefetched) {
    livePrefetched = true;
    import('@/pages/LiveStream').catch(() => {});
  }
  if (streamId) {
    import('@/services/livekitService')
      .then(({ warmLiveKitToken }) => warmLiveKitToken(`live_${streamId}`, 'viewer_stream').catch(() => {}))
      .catch(() => {});
  }
}

export function prefetchPartyRoom(roomId?: string) {
  if (!partyPrefetched) {
    partyPrefetched = true;
    import('@/pages/PartyRoom').catch(() => {});
  }
  if (roomId) {
    import('@/services/livekitService')
      .then(({ warmLiveKitToken }) => warmLiveKitToken(`party_${roomId}`, 'party').catch(() => {}))
      .catch(() => {});
  }
}

export function prefetchProfileDetail() {
  if (profilePrefetched) return;
  profilePrefetched = true;
  import('@/pages/ProfileDetail').catch(() => {});
}

export function prefetchChat() {
  if (chatPrefetched) return;
  chatPrefetched = true;
  import('@/pages/Chat').catch(() => {});
}

/**
 * Generic per-route chunk prefetcher — fires on pointerdown for ANY anchor
 * whose href matches a known user-facing route. Keeps a Set so each chunk
 * is requested at most once. Silent on failure.
 */
const genericPrefetched = new Set<string>();
const GENERIC_ROUTES: Record<string, () => Promise<unknown>> = {
  '/': () => import('@/pages/Index'),
  '/index': () => import('@/pages/Index'),
  '/discover': () => import('@/pages/Discover'),
  '/live': () => import('@/pages/Live'),
  '/live-feed': () => import('@/pages/LiveStreamFeed'),
  '/go-live': () => import('@/pages/LiveSessionPage'),
  '/live-session': () => import('@/pages/LiveSessionPage'),
  '/profile': () => import('@/pages/Profile'),
  '/settings': () => import('@/pages/Settings'),
  '/settings/blacklist': () => import('@/pages/settings/Blacklist'),
  '/settings/privacy-policy': () => import('@/pages/settings/ContentPage'),
  '/settings/user-agreement': () => import('@/pages/settings/ContentPage'),
  '/settings/about-us': () => import('@/pages/settings/ContentPage'),
  '/settings/user-management': () => import('@/pages/settings/UserManagement'),
  '/settings/notifications': () => import('@/pages/settings/NotificationSettings'),
  '/settings/customer-service': () => import('@/pages/settings/CustomerService'),
  '/developer-options': () => import('@/pages/DeveloperOptions'),
  '/edit-profile': () => import('@/pages/EditProfile'),
  '/recharge': () => import('@/pages/Recharge'),
  '/recharge-history': () => import('@/pages/RechargeHistory'),
  '/payment-success': () => import('@/pages/PaymentSuccess'),
  '/tasks': () => import('@/pages/Tasks'),
  '/level': () => import('@/pages/Level'),
  '/leaderboard': () => import('@/pages/Leaderboard'),
  '/pk-leaderboard': () => import('@/pages/PKLeaderboard'),
  '/agency-dashboard': () => import('@/pages/AgencyDashboard'),
  '/agency': () => import('@/pages/Agency'),
  '/agency-signup': () => import('@/pages/AgencySignup'),
  '/agency-details': () => import('@/pages/AgencyDetails'),
  '/agency-diamond-exchange': () => import('@/pages/AgencyDiamondExchange'),
  '/agency-diamond-trader': () => import('@/pages/AgencyDiamondTrader'),
  '/agency-commission-history': () => import('@/pages/AgencyCommissionHistory'),
  '/agency-host-management': () => import('@/pages/AgencyHostManagement'),
  '/agency-transfer-history': () => import('@/pages/AgencyTransferHistory'),
  '/agency-withdrawal': () => import('@/pages/AgencyWithdrawal'),
  '/agent-wallet': () => import('@/pages/AgentWallet'),
  '/agent-rank': () => import('@/pages/AgentRank'),
  '/transfer-history': () => import('@/pages/TransferHistory'),
  '/host-application': () => import('@/pages/HostApplication'),
  '/host-dashboard': () => import('@/pages/HostDashboard'),
  '/host-bonus-ledger': () => import('@/pages/HostBonusLedger'),
  '/host-transfer-history': () => import('@/pages/HostTransferHistory'),
  '/join-agency': () => import('@/pages/JoinAgency'),
  '/become-sub-agent': () => import('@/pages/BecomeSubAgent'),
  '/create-agency': () => import('@/pages/CreateAgency'),
  '/call-history': () => import('@/pages/CallHistory'),
  '/following': () => import('@/pages/FollowingList'),
  '/following-list': () => import('@/pages/FollowingList'),
  '/search': () => import('@/pages/SearchUsers'),
  '/search-users': () => import('@/pages/SearchUsers'),
  '/rewards': () => import('@/pages/Rewards'),
  '/rewards/rating-history': () => import('@/pages/RatingProofHistory'),
  '/parcels': () => import('@/pages/Parcels'),
  '/invitation': () => import('@/pages/Invitation'),
  '/vip': () => import('@/pages/VIP'),
  '/shop': () => import('@/pages/Shop'),
  '/my-poster': () => import('@/pages/MyPoster'),
  '/my-recordings': () => import('@/pages/MyRecordings'),
  '/tags': () => import('@/pages/Tags'),
  '/party-rooms': () => import('@/pages/PartyRooms'),
  '/create-party': () => import('@/pages/PartySessionPage'),
  '/party-session': () => import('@/pages/PartySessionPage'),
  '/match-call': () => import('@/pages/MatchCall'),
  '/reels': () => import('@/pages/Reels'),
  '/host-verification': () => import('@/pages/FaceVerification'),
  '/face-verification': () => import('@/pages/FaceVerification'),
  '/helper-dashboard': () => import('@/pages/HelperDashboard'),
  '/level5-helper-dashboard': () => import('@/pages/Level5HelperDashboard'),
  '/games': () => import('@/pages/games/GamesHub'),
  '/games/roulette': () => import('@/pages/games/RoulettePage'),
  '/games/ferris-wheel': () => import('@/pages/games/FerrisWheelPage'),
  '/games/teen-patti': () => import('@/pages/games/TeenPattiPage'),
  '/games/lucky-wheel-test': () => import('@/pages/games/LuckyWheelTestPage'),
};

export function prefetchByHref(href: string) {
  if (!href || genericPrefetched.has(href)) return;
  // strip query / hash for lookup
  const path = href.split(/[?#]/)[0];
  if (genericPrefetched.has(path)) return;
  const loader = GENERIC_ROUTES[path];
  if (loader) {
    genericPrefetched.add(href);
    genericPrefetched.add(path);
    loader().catch(() => {});
  }
}

/**
 * Global delegated pointer-down listener — fires the right prefetcher
 * the instant the user starts a tap on any element with the matching
 * `data-prefetch` attribute or a known route href. No per-card wiring
 * needed; works app-wide.
 *
 * Supported attributes (on any clickable ancestor of the touch target):
 *   data-prefetch="live"   + data-stream-id="..."
 *   data-prefetch="party"  + data-room-id="..."
 *   data-prefetch="profile"
 *   data-prefetch="chat"
 *
 * Also auto-detects <a href="/live/:id"> / "/party/:id" / "/profile/..."
 * patterns so legacy <Link>s benefit without code changes.
 */
export function installRoutePrefetch() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const runAfterInput = (cb: () => void) => {
    // Start the network request before pointerup/click. Deferring to rAF made
    // the click win the race, so lazy routes still showed a 3-4s wait on
    // Android WebView. A microtask keeps the pointerdown handler tiny while
    // giving the destination chunk a real head-start.
    if (typeof window.queueMicrotask === 'function') window.queueMicrotask(cb);
    else Promise.resolve().then(cb);
  };

  const handler = (ev: Event) => {
    const target = ev.target as Element | null;
    if (!target || !('closest' in target)) return;

    runAfterInput(() => {
      if (!target.isConnected) return;

      // 1) explicit data-prefetch hint
      const hinted = target.closest<HTMLElement>('[data-prefetch]');
      if (hinted) {
        const kind = hinted.dataset.prefetch;
        if (kind === 'live') prefetchLiveStream(hinted.dataset.streamId || undefined);
        else if (kind === 'party') prefetchPartyRoom(hinted.dataset.roomId || undefined);
        else if (kind === 'profile') prefetchProfileDetail();
        else if (kind === 'chat') prefetchChat();
        else if (kind === 'route' && hinted.dataset.prefetchPath) warmRouteForNavigation(hinted.dataset.prefetchPath);
        return;
      }

      // Explicit generic path for <button onClick={() => navigate('/x')}>.
      // Buttons have no href, so without this hint they cannot warm chunks
      // before React Router starts navigation.
      const pathHinted = target.closest<HTMLElement>('[data-prefetch-path]');
      if (pathHinted?.dataset.prefetchPath) {
        warmRouteForNavigation(pathHinted.dataset.prefetchPath);
        return;
      }

      // 2) any anchor whose href matches a known instant-tap route
      const anchor = target.closest<HTMLAnchorElement>('a[href]');
      if (anchor) {
        const href = anchor.getAttribute('href') || '';
        if (href.startsWith('/live/')) {
          prefetchLiveStream(href.slice(6).split(/[/?#]/)[0]);
        } else if (href === '/live-feed' || href.startsWith('/live-feed/')) {
          prefetchByHref('/live-feed');
        } else if (href.startsWith('/party/')) {
          prefetchPartyRoom(href.slice(7).split(/[/?#]/)[0]);
        } else if (href.startsWith('/profile-detail/') || href.startsWith('/profile/')) {
          prefetchProfileDetail();
        } else if (href.startsWith('/pk-leaderboard/')) {
          prefetchByHref('/pk-leaderboard');
        } else if (href === '/chat' || href.startsWith('/chat/')) {
          prefetchChat();
        } else {
          // Generic table lookup for every other known user-facing route
          prefetchByHref(href);
        }
      }
    });
  };

  // `pointerdown` fires ~50-150ms before `click` on touch devices — that's
  // the head start we exploit. `passive: true` keeps scrolling smooth.
  window.addEventListener('pointerdown', handler, { passive: true, capture: true });

  // Do NOT intercept click navigation. Blocking the click until a chunk warms
  // leaves the old screen visible after the tap, which looks like stale/duplicate
  // UI. Pointer-down warming above is enough; React Router transition mode owns
  // the actual route commit.
}
