// Pure, idempotent viewer-count reducer extracted from src/pages/Live.tsx
// so it can be unit-tested without rendering the page or mocking Supabase.
//
// Contract (must match Live.tsx realtime handler):
//  - INSERT on stream_viewers      → viewer becomes active
//  - DELETE on stream_viewers      → viewer becomes inactive
//  - UPDATE on stream_viewers      → active iff `left_at` is null/undefined
//  - Duplicate events for the same viewer in the same state are no-ops
//  - viewer_count never goes below 0
//  - A server UPDATE on live_streams is authoritative and overwrites count
//  - A reconnect resync (resetViewers + applyAuthoritativeCount) restores truth

export interface StreamRow {
  id: string;
  viewer_count: number;
}

export type ViewerEventType = 'INSERT' | 'UPDATE' | 'DELETE';

export interface ViewerEvent {
  eventType: ViewerEventType;
  streamId: string;
  viewerId: string;
  /** Only meaningful for UPDATE events. */
  leftAt?: string | null;
}

export interface ViewerState {
  /** stream_id → Set<viewer_id> of currently-active viewers. */
  activeByStream: Map<string, Set<string>>;
  streams: StreamRow[];
}

export function createViewerState(streams: StreamRow[]): ViewerState {
  return {
    activeByStream: new Map(),
    streams: streams.map((s) => ({ ...s })),
  };
}

/** Apply a realtime stream_viewers event. Returns a NEW state object. */
export function applyViewerEvent(state: ViewerState, event: ViewerEvent): ViewerState {
  const { streamId, viewerId, eventType } = event;
  if (!streamId || !viewerId) return state;

  const nextActive = new Map(state.activeByStream);
  let set = nextActive.get(streamId);
  if (!set) {
    set = new Set<string>();
    nextActive.set(streamId, set);
  } else {
    set = new Set(set);
    nextActive.set(streamId, set);
  }

  let shouldBeActive: boolean;
  if (eventType === 'INSERT') shouldBeActive = true;
  else if (eventType === 'DELETE') shouldBeActive = false;
  else shouldBeActive = !event.leftAt;

  const wasActive = set.has(viewerId);
  if (shouldBeActive === wasActive) {
    return state; // no-op (duplicate)
  }

  let delta = 0;
  if (shouldBeActive) {
    set.add(viewerId);
    delta = +1;
  } else {
    set.delete(viewerId);
    delta = -1;
  }

  const idx = state.streams.findIndex((s) => s.id === streamId);
  if (idx === -1) {
    return { activeByStream: nextActive, streams: state.streams };
  }
  const nextStreams = [...state.streams];
  nextStreams[idx] = {
    ...nextStreams[idx],
    viewer_count: Math.max(0, (nextStreams[idx].viewer_count || 0) + delta),
  };
  return { activeByStream: nextActive, streams: nextStreams };
}

/** Server-authoritative UPDATE on live_streams. */
export function applyAuthoritativeCount(
  state: ViewerState,
  streamId: string,
  viewerCount: number,
): ViewerState {
  const idx = state.streams.findIndex((s) => s.id === streamId);
  if (idx === -1) return state;
  const nextStreams = [...state.streams];
  nextStreams[idx] = { ...nextStreams[idx], viewer_count: Math.max(0, viewerCount) };
  return { activeByStream: state.activeByStream, streams: nextStreams };
}

/** Clear idempotency tracker on reconnect (matches Live.tsx behavior). */
export function resetViewers(state: ViewerState): ViewerState {
  return { activeByStream: new Map(), streams: state.streams };
}
