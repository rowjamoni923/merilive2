/**
 * persistentCameraSession
 * -----------------------
 * A global, reference-counted MediaStream singleton for SHORT, explicit
 * handoffs only (GoLive→Live, CreateParty→Party, ring→call). When the last
 * consumer releases, an automatic idle timer stops the camera so it cannot
 * keep running as a ghost overlay behind unrelated pages.
 *
 * This is the foundation for Step 1+ of the "zero loading / zero camera
 * restart" rebuild. It deliberately does NOT touch LiveKit — it only owns the
 * raw browser MediaStream. LiveKit LocalTracks are built on top of these
 * tracks; when a track is shared, LiveKit should be created with
 * `videoTrack: existingTrack` instead of calling getUserMedia again.
 *
 * Lifecycle:
 *   const handle = await acquireCameraSession({ video: true, audio: true });
 *   // ... use handle.stream ...
 *   handle.release();                  // decrements refcount, auto-GC starts
 *   disposeCameraSessionIfIdle();      // optional GC after a real exit
 *   forceDisposeCameraSession();       // explicit "End Live" / "Leave Call"
 */
import { enforcePermanentCameraLock } from '@/utils/cameraLock';
import { buildPortraitVideoConstraint, isPortraitCameraTrack, stopMediaStream } from '@/utils/portraitCameraConstraints';
import { maybeUpgradeToWidestCamera } from '@/utils/widestCamera';

export type CameraSessionConstraints = {
  video?: boolean | MediaTrackConstraints;
  audio?: boolean | MediaTrackConstraints;
  facingMode?: 'user' | 'environment';
};

export type CameraSessionHandle = {
  stream: MediaStream;
  release: () => void;
};

type Session = {
  stream: MediaStream;
  refCount: number;
  constraintsKey: string;
  createdAt: number;
};

let active: Session | null = null;
let pending: Promise<Session> | null = null;
let pendingKey: string | null = null;
let idleDisposeTimer: ReturnType<typeof setTimeout> | null = null;
let lifecycleEpoch = 0;
const listeners = new Set<(stream: MediaStream | null) => void>();

const clearIdleDisposeTimer = () => {
  if (!idleDisposeTimer) return;
  clearTimeout(idleDisposeTimer);
  idleDisposeTimer = null;
};

const scheduleIdleDispose = () => {
  clearIdleDisposeTimer();
  idleDisposeTimer = setTimeout(() => {
    idleDisposeTimer = null;
    disposeCameraSessionIfIdle();
  }, 1500);
};

function emitCameraSessionChange() {
  const stream = peekCameraSession();
  listeners.forEach((listener) => {
    try {
      listener(stream);
    } catch {
      /* listener errors must never break camera lifecycle */
    }
  });
}

export function subscribeCameraSession(listener: (stream: MediaStream | null) => void): () => void {
  listeners.add(listener);
  try {
    listener(peekCameraSession());
  } catch {
    /* ignore */
  }
  return () => {
    listeners.delete(listener);
  };
}

const buildConstraints = (req: CameraSessionConstraints): MediaStreamConstraints => {
  const video =
    req.video === false
      ? false
      : typeof req.video === 'object'
        ? { ...req.video, facingMode: req.facingMode ?? (req.video as any).facingMode ?? 'user' }
        : buildPortraitVideoConstraint({ facingMode: req.facingMode ?? 'user' });
  const audio = req.audio === undefined ? true : req.audio;
  return { video, audio } as MediaStreamConstraints;
};

const keyOf = (req: CameraSessionConstraints) =>
  // Include capture-layout version so stale zoomed/crop-scaled streams are not reused.
  JSON.stringify({ layout: 'portrait-validated-v11-no-landscape-fallback', v: req.video ?? true, a: req.audio ?? true, f: req.facingMode ?? 'user' });

const isStreamUsable = (stream: MediaStream | null | undefined) =>
  !!stream && stream.getTracks().some((t) => t.readyState === 'live');

export async function acquireCameraSession(
  req: CameraSessionConstraints = { video: true, audio: true },
): Promise<CameraSessionHandle> {
  clearIdleDisposeTimer();
  const wantKey = keyOf(req);

  // Reuse the live session when constraints match.
  if (active && active.constraintsKey === wantKey && isStreamUsable(active.stream)) {
    active.refCount += 1;
    return toHandle(active);
  }

  // If a different constraint set is active, dispose it first.
  if (active && active.constraintsKey !== wantKey) {
    hardStop(active);
    active = null;
    emitCameraSessionChange();
  }

  if (pending && pendingKey === wantKey) {
    const s = await pending;
    s.refCount += 1;
    return toHandle(s);
  }

  if (pending && pendingKey !== wantKey) {
    try {
      const stale = await pending;
      if (active === stale && stale.refCount <= 0) {
        hardStop(stale);
        active = null;
        emitCameraSessionChange();
      }
    } finally {
      pending = null;
      pendingKey = null;
    }
  }

  const startEpoch = lifecycleEpoch;
  pending = (async (): Promise<Session> => {
    const facingMode = req.facingMode ?? 'user';
    const initialStream = await navigator.mediaDevices.getUserMedia(buildConstraints(req));
    const stream = req.video === false
      ? initialStream
      : await maybeUpgradeToWidestCamera(initialStream, facingMode, 'persistent-camera-session');
    if (startEpoch !== lifecycleEpoch) {
      stopMediaStream(stream);
      throw new Error('Camera start was cancelled by navigation.');
    }
    if (req.video !== false && !stream.getVideoTracks().some(isPortraitCameraTrack)) {
      console.warn('[CameraSession] Rejected non-portrait persistent stream:', JSON.stringify(stream.getVideoTracks()[0]?.getSettings?.() || {}));
      stopMediaStream(stream);
      throw new Error('Camera opened in landscape mode. Please reopen the preview.');
    }
    await enforcePermanentCameraLock(stream, 'persistent-camera-session');
    const session: Session = {
      stream,
      refCount: 0,
      constraintsKey: wantKey,
      createdAt: Date.now(),
    };
    active = session;
    emitCameraSessionChange();
    return session;
  })();
  pendingKey = wantKey;

  try {
    const session = await pending;
    session.refCount += 1;
    return toHandle(session);
  } finally {
    pending = null;
    pendingKey = null;
  }
}

/**
 * Register an externally-obtained MediaStream (e.g. from a custom getUserMedia
 * pipeline with Android WebView hacks) into the persistent session so future
 * acquireCameraSession() calls can reuse it. Returns a handle whose refCount
 * is 1 (you are the first consumer).
 */
export function adoptCameraSession(
  stream: MediaStream,
  req: CameraSessionConstraints = { video: true, audio: true },
): CameraSessionHandle {
  clearIdleDisposeTimer();
  if (!isStreamUsable(stream)) {
    throw new Error('Cannot adopt a stopped camera session.');
  }
  const wantKey = keyOf(req);
  if (active && active.stream !== stream) {
    hardStop(active);
    active = null;
    emitCameraSessionChange();
  }
  if (!active) {
    active = { stream, refCount: 1, constraintsKey: wantKey, createdAt: Date.now() };
  } else {
    active.refCount += 1;
    active.constraintsKey = wantKey;
  }
  emitCameraSessionChange();
  return toHandle(active);
}

function toHandle(session: Session): CameraSessionHandle {
  let released = false;
  return {
    stream: session.stream,
    release() {
      if (released) return;
      released = true;
      session.refCount = Math.max(0, session.refCount - 1);
      // Short handoff grace only: the next Live/Party/Call screen can adopt
      // immediately, but a forgotten release path cannot leave a ghost camera
      // running behind unrelated pages.
      if (session.refCount <= 0 && active === session) scheduleIdleDispose();
    },
  };
}

function hardStop(session: Session) {
  try {
    session.stream.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {
        /* ignore */
      }
    });
  } catch {
    /* ignore */
  }
}

/** Returns the live stream if a session exists (does not refcount). */
export function peekCameraSession(): MediaStream | null {
  return active && isStreamUsable(active.stream) ? active.stream : null;
}

/** Stops tracks only if no consumer is currently holding the session. */
export function disposeCameraSessionIfIdle(): boolean {
  if (!active) return true;
  if (active.refCount > 0) return false;
  lifecycleEpoch += 1;
  clearIdleDisposeTimer();
  hardStop(active);
  active = null;
  emitCameraSessionChange();
  return true;
}

/** Force-stops the camera regardless of refcount. Use on "End Live" / sign-out. */
export function forceDisposeCameraSession(): void {
  lifecycleEpoch += 1;
  clearIdleDisposeTimer();
  if (!active) return;
  hardStop(active);
  active = null;
  emitCameraSessionChange();
}

/** Debug helper. */
export function inspectCameraSession() {
  return active
    ? {
        refCount: active.refCount,
        constraintsKey: active.constraintsKey,
        ageMs: Date.now() - active.createdAt,
        tracks: active.stream.getTracks().map((t) => ({ kind: t.kind, state: t.readyState })),
      }
    : null;
}
