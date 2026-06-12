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

  const handler = (ev: Event) => {
    const target = ev.target as Element | null;
    if (!target || !('closest' in target)) return;

    // 1) explicit data-prefetch hint
    const hinted = target.closest<HTMLElement>('[data-prefetch]');
    if (hinted) {
      const kind = hinted.dataset.prefetch;
      if (kind === 'live') prefetchLiveStream(hinted.dataset.streamId || undefined);
      else if (kind === 'party') prefetchPartyRoom(hinted.dataset.roomId || undefined);
      else if (kind === 'profile') prefetchProfileDetail();
      else if (kind === 'chat') prefetchChat();
      return;
    }

    // 2) any anchor whose href matches a known instant-tap route
    const anchor = target.closest<HTMLAnchorElement>('a[href]');
    if (anchor) {
      const href = anchor.getAttribute('href') || '';
      if (href.startsWith('/live/')) {
        prefetchLiveStream(href.slice(6).split(/[/?#]/)[0]);
      } else if (href.startsWith('/party/')) {
        prefetchPartyRoom(href.slice(7).split(/[/?#]/)[0]);
      } else if (href.startsWith('/profile-detail/') || href.startsWith('/profile/')) {
        prefetchProfileDetail();
      } else if (href === '/chat' || href.startsWith('/chat/')) {
        prefetchChat();
      }
    }
  };

  // `pointerdown` fires ~50-150ms before `click` on touch devices — that's
  // the head start we exploit. `passive: true` keeps scrolling smooth.
  window.addEventListener('pointerdown', handler, { passive: true, capture: true });
}
