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

export function prefetchLiveStream(streamId?: string) {
  if (!livePrefetched) {
    livePrefetched = true;
    import('@/pages/LiveStream').catch(() => {});
  }
  // Warm LiveKit viewer token in parallel so the join handshake skips one RTT.
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
