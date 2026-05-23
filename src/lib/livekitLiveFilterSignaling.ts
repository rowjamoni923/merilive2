/**
 * livekitLiveFilterSignaling — REMOVED (Pkg200 prep). Stub only.
 */
export async function publishLiveFilterUpdate(_payload: unknown): Promise<void> {
  // no-op
}

export function subscribeLiveFilterUpdates(_cb: (payload: unknown) => void): () => void {
  return () => {};
}

export const LIVE_FILTER_TOPIC = 'live.filter';
