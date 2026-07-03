/**
 * LiveKitVideoPlayer v2.0 — Optimized for native-like performance
 * 
 * Renders a LiveKit video track with:
 * - GPU-accelerated rendering via will-change and translateZ
 * - Native bridge fallback (SurfaceViewRenderer on Android)
 * - Minimal timer footprint for battery efficiency
 * - Zero play icons via hardened video element
 */
import { useEffect, useRef, memo } from 'react';
import type { CSSProperties, VideoHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import type { Track } from 'livekit-client';
import { hardenVideoElementForNative, cleanupVideoHardening } from '@/utils/videoNativeHardening';


type VendorVideoProps = VideoHTMLAttributes<HTMLVideoElement> & {
  'x5-video-player-type'?: string;
  'x5-video-player-fullscreen'?: string;
  'x5-video-orientation'?: string;
  'x5-playsinline'?: string;
  'webkit-playsinline'?: string;
  'x-webkit-airplay'?: string;
};

const nativeInlineVideoProps: VendorVideoProps = {
  'x5-video-player-type': 'h5',
  'x5-video-player-fullscreen': 'false',
  'x5-video-orientation': 'portrait',
  'x5-playsinline': 'true',
  'webkit-playsinline': 'true',
  'x-webkit-airplay': 'deny',
};

const trackObjectIds = new WeakMap<object, number>();
let nextTrackObjectId = 1;

const getTrackObjectKey = (track: Track | null) => {
  if (!track || (typeof track !== 'object' && typeof track !== 'function')) return null;
  const obj = track as object;
  let id = trackObjectIds.get(obj);
  if (!id) {
    id = nextTrackObjectId++;
    trackObjectIds.set(obj, id);
  }
  return `livekit-track-object-${id}`;
};

interface LiveKitVideoPlayerProps {
  videoTrack: Track | null;
  className?: string;
  mirror?: boolean;
  fit?: 'cover' | 'contain';
  muted?: boolean;
  onVideoStalled?: () => void;
  onVideoReady?: () => void;
  /** Pkg146: opt-in browser Picture-in-Picture. Adds data-pip-id and drops disablePictureInPicture. */
  enablePictureInPicture?: boolean;
  /** Pkg146: stable id used by <PictureInPictureButton pipId={...} /> to locate this video. */
  pipId?: string;
}

export const LiveKitVideoPlayer = memo(function LiveKitVideoPlayer({
  videoTrack,
  className,
  mirror = false,
  // Camera zoom-out policy: default to CONTAIN so the full captured camera
  // frame is visible instead of center-cropping/zooming the face in portrait UI.
  fit = 'contain',
  muted = true,
  onVideoStalled,
  onVideoReady,
  enablePictureInPicture = false,
  pipId,
}: LiveKitVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const backdropRef = useRef<HTMLVideoElement>(null);
  const readyNotifiedRef = useRef(false);
  const onVideoStalledRef = useRef(onVideoStalled);
  onVideoStalledRef.current = onVideoStalled;
  const onVideoReadyRef = useRef(onVideoReady);
  onVideoReadyRef.current = onVideoReady;
  // Pkg-audit#2: keep `muted` in a ref so toggling mute does NOT re-run the
  // attach effect (which would detach/reattach the track and cause a ~160ms
  // black flash + stall-watchdog reset on every viewer mute click).
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  // Stable-identity ref: parent re-renders can pass a NEW Track wrapper for
  // the SAME underlying mediaStreamTrack (e.g. when LiveKit publication
  // metadata updates). Gating the attach effect on the underlying media id
  // prevents needless detach/re-attach (which is the 5-10s "camera blank"
  // bug reported on Live/Party/Private — surface goes blank because cleanup
  // ran `detach(el)` even though the very next attach is the same track).
  const videoTrackRef = useRef(videoTrack);
  videoTrackRef.current = videoTrack;
  const getRawMediaTrack = (track: Track | null | undefined): MediaStreamTrack | null => {
    if (!track) return null;
    return (
      (track as any).mediaStreamTrack ||
      (typeof (track as any).getMediaStreamTrack === 'function' ? (track as any).getMediaStreamTrack() : null) ||
      null
    );
  };
  const rawMediaTrack = getRawMediaTrack(videoTrack);
  const trackKey =
    rawMediaTrack?.id ||
    (videoTrack as unknown as { sid?: string; trackSid?: string })?.sid ||
    (videoTrack as unknown as { sid?: string; trackSid?: string })?.trackSid ||
    getTrackObjectKey(videoTrack);

  // Hide video element until first real frame arrives — prevents native play-icon flash
  // without painting any visible color (no black overlay, container stays transparent).
  const revealVideo = () => {
    const el = videoRef.current;
    if (el && el.style.opacity !== '1') el.style.opacity = '1';
  };




  // Pkg381: dead native-bridge effect removed.
  // The previous code called `setNativeVideoVisible(true)` on every viewer mount,
  // intended to show an Android SurfaceViewRenderer. But `connectNativeLiveKit` /
  // `initNativeVideoSurface` were NEVER called anywhere in the app, so the native
  // plugin stayed uninitialized — the call was a silent no-op at best, and on
  // builds where the plugin partially initialized it painted an empty black
  // SurfaceView over the working web <video>. All video flows now go through the
  // web livekit-client SDK path below (videoTrack.attach + srcObject).


  useEffect(() => {
    const el = videoRef.current;
    const videoTrack = videoTrackRef.current;
    if (!el || !videoTrack) return;

    readyNotifiedRef.current = false;

    const mediaTrack = getRawMediaTrack(videoTrack);
    const isLocalTrack = Boolean((videoTrack as any)?.isLocal);

    // Pkg-audit Bug E: detect re-attach of the SAME track (parent re-render)
    // and keep the element visible instead of blanking it.
    const currentStream = el.srcObject as MediaStream | null;
    const currentTrack = currentStream?.getVideoTracks?.()[0];
    const isSameTrack = !!(currentTrack && mediaTrack && currentTrack.id === mediaTrack.id);
    if (!isSameTrack) {
      el.style.opacity = '0';
    }

    const enforceInlineSurface = () => {
      el.controls = false;
      el.removeAttribute('controls');
      el.removeAttribute('poster');
      el.setAttribute('autoplay', '');
      el.setAttribute('playsinline', '');
      el.setAttribute('webkit-playsinline', 'true');
      el.setAttribute('x5-playsinline', 'true');
      // Pkg-audit Bug E: only force-mute on FIRST attach. Re-running this
      // after attach() would flip an unmuted video back to muted and cause
      // Android WebView to pause/blank the surface.
      if (!isSameTrack && mutedRef.current) {
        el.setAttribute('muted', '');
        el.muted = true;
        el.defaultMuted = true;
      }
    };

    enforceInlineSurface();
    hardenVideoElementForNative(el, { muted: mutedRef.current });

    // === ATTACH TRACK ===
    // Pkg-audit Bug E: Use videoTrack.attach() EXCLUSIVELY when available.
    // Previously we set srcObject AND called attach(), causing the SDK to
    // re-assign srcObject internally → double loadedmetadata → double play()
    // → mute/unmute flip → blank surface.
    let attached = false;
    if (typeof videoTrack.attach === 'function') {
      try {
        videoTrack.attach(el);
        attached = true;
      } catch {
        // fall through
      }
    }
    const attachedStream = el.srcObject as MediaStream | null;
    const attachedTrack = attachedStream?.getVideoTracks?.()[0];
    const attachMissingTrack = !!(mediaTrack && mediaTrack.readyState !== 'ended' && attachedTrack?.id !== mediaTrack.id);
    if ((!attached || attachMissingTrack) && mediaTrack && mediaTrack.readyState !== 'ended') {
      try {
        el.srcObject = new MediaStream([mediaTrack]);
      } catch {
        // ignore
      }
    }

    // Mirror the SAME MediaStream into the blurred backdrop element so we
    // fill the container without cropping the main video. Sharing srcObject
    // between two <video> elements is well supported and does NOT open the
    // camera twice.
    const backdropEl = backdropRef.current;
    if (backdropEl && mediaTrack && mediaTrack.readyState !== 'ended') {
      try {
        const cur = backdropEl.srcObject as MediaStream | null;
        const curTrack = cur?.getVideoTracks?.()[0];
        if (!curTrack || curTrack.id !== mediaTrack.id) {
          backdropEl.srcObject = new MediaStream([mediaTrack]);
        }
        backdropEl.muted = true;
        backdropEl.defaultMuted = true;
        backdropEl.play?.().catch(() => {});
      } catch { /* ignore */ }
    }

    // === EVENT HANDLING ===
    const onTrackEnded = () => onVideoStalledRef.current?.();
    mediaTrack?.addEventListener('ended', onTrackEnded);

    const hasDecodedFrame = () => el.readyState >= 2 && el.videoWidth > 0 && el.videoHeight > 0;

    const markReady = () => {
      if (!hasDecodedFrame()) return;
      revealVideo();
      if (!readyNotifiedRef.current) {
        readyNotifiedRef.current = true;
        onVideoReadyRef.current?.();
      }
      if (!mutedRef.current) {
        try {
          el.muted = false;
          el.defaultMuted = false;
          el.removeAttribute('muted');
        } catch {
          // noop
        }
      }
    };

    const playNow = () => {
      if (!el || !el.paused) { markReady(); return; }
      el.play().then(markReady).catch(() => {
        if (hasDecodedFrame()) {
          setTimeout(() => {
            el.play().catch(() => {});
          }, 80);
        }
      });
    };

    const safeVideo = el as HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => number;
      cancelVideoFrameCallback?: (h: number) => void;
    };
    let frameHandle: number | null = null;
    if (typeof safeVideo.requestVideoFrameCallback === 'function') {
      frameHandle = safeVideo.requestVideoFrameCallback(markReady);
    }

    playNow();
    el.onloadedmetadata = playNow;
    el.onloadeddata = playNow;
    el.oncanplay = playNow;
    el.onplaying = markReady;
    el.onwaiting = () => { if (el.readyState >= 2) el.play().catch(() => {}); };
    el.onstalled = () => { if (el.readyState >= 2) el.play().catch(() => {}); };

    const timers = [0, 60, 180, 400, 800].map((d) => setTimeout(playNow, d));

    const revealWatchdog = setTimeout(() => {
      const mt = getRawMediaTrack(videoTrack);
      // Pkg-audit V3: don't reveal until video element has actually decoded a
      // frame (readyState >= HAVE_CURRENT_DATA AND non-zero videoWidth).
      if (mt && mt.readyState === 'live' && el.readyState >= 2 && el.videoWidth > 0) {
        try {
          if (el.paused) el.play().catch(() => {});
        } catch { /* ignore */ }
        markReady();
      }
    }, 450);

    // 2026-06-19 — Web preview fallback: Live/Party/Call all share this
    // renderer. Chromium/WebView can miss loadeddata/requestVideoFrameCallback
    // after attach(), leaving opacity:0 forever. Reveal the attached element so
    // it can paint when frames arrive, but DO NOT call onVideoReady here — the
    // host preview bridge must stay above it until a real decoded frame exists.
    const liveTrackReveal = setTimeout(() => {
      const mt = getRawMediaTrack(videoTrack);
      const cur = el.srcObject as MediaStream | null;
      const curTrack = cur?.getVideoTracks?.()[0];
      if (mt && mt.readyState === 'live' && curTrack?.id === mt.id) {
        try { if (el.paused) el.play().catch(() => {}); } catch { /* ignore */ }
        revealVideo();
        if (!readyNotifiedRef.current && (el.readyState >= 2 || el.videoWidth > 0 || !onVideoReadyRef.current)) {
          readyNotifiedRef.current = true;
          onVideoReadyRef.current?.();
        }
      }
    }, 900);

    // Phase 2B Step 6 (M4 fix): second-tier reveal watchdog. If decoder hasn't
    // produced a single frame after 2.5s while the track is "live", escalate
    // by asking the parent to retry subscription (which detaches + resubs).
    const revealEscalation = setTimeout(() => {
      const mt = getRawMediaTrack(videoTrack);
      if (mt && mt.readyState === 'live' && (el.videoWidth === 0 || el.readyState < 2)) {
        console.warn('[LiveKitVideoPlayer] revealEscalation: no frame after 2.5s → onVideoStalled');
        onVideoStalledRef.current?.();
      }
    }, 2500);

    // === STALL WATCHDOG ===
    // Phase 2B Step 6 (M3 fix): tightened threshold — live video at 30fps
    // should never stagnate 3s. Was: stagnant >= 2 (≈3s). Now: stagnant >= 1
    // (≈1.5s), and we call onVideoStalled on EVERY recovery so the parent
    // can escalate to setSubscribed(false)+true if re-attach doesn't help.
    let lastTime = -1;
    let stagnant = 0;
    let lastRecovery = 0;
    const stallProbe = setInterval(() => {
      if (!el || document.visibilityState === 'hidden') return;
      if (el.paused && el.readyState >= 2) { el.play().catch(() => {}); return; }
      if (el.paused || el.readyState < 2) return;

      const t = el.currentTime;
      if (t <= 0 || !el.videoWidth || !el.videoHeight) return;
      if (Math.abs(t - lastTime) < 0.005) stagnant++;
      else stagnant = 0;
      lastTime = t;

      if (stagnant >= 1) {
        stagnant = 0;
        const now = Date.now();
        if (now - lastRecovery > 3500) {
          lastRecovery = now;
          const liveTrack = mediaTrack && mediaTrack.readyState !== 'ended';
          const cur = el.srcObject as MediaStream | null;
          const curTrack = cur?.getVideoTracks?.()[0];
          const needsReattach = !!(liveTrack && mediaTrack && (!cur || !curTrack || curTrack.id !== mediaTrack.id));
          if (needsReattach && mediaTrack) {
            try { el.srcObject = new MediaStream([mediaTrack]); } catch { /* noop */ }
          }
          el.play().catch(() => {});
          if (isLocalTrack) return;
          // Always notify parent so it can escalate to re-subscribe / reconnect.
          onVideoStalledRef.current?.();
        }
      }
    }, 1500);

    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(revealWatchdog);
      clearTimeout(liveTrackReveal);
      clearTimeout(revealEscalation);
      clearInterval(stallProbe);
      mediaTrack?.removeEventListener('ended', onTrackEnded);
      if (frameHandle !== null && typeof safeVideo.cancelVideoFrameCallback === 'function') {
        safeVideo.cancelVideoFrameCallback(frameHandle);
      }
      if (typeof videoTrack.detach === 'function') {
        try {
          videoTrack.detach(el);
        } catch {
          // ignore detach race during unmount
        }
      }
      el.onloadedmetadata = null;
      el.onloadeddata = null;
      el.oncanplay = null;
      el.onplaying = null;
      el.onwaiting = null;
      el.onstalled = null;
    };
  }, [trackKey]);

  // Pkg-audit#2: separate effect to apply mute changes WITHOUT re-attaching the track.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (muted) {
      el.muted = true;
      el.defaultMuted = true;
      el.setAttribute('muted', '');
    } else if (el.readyState >= 2) {
      // Only unmute once playback is actually ready to avoid autoplay rejection.
      try {
        el.muted = false;
        el.defaultMuted = false;
        el.removeAttribute('muted');
        if (el.paused) el.play().catch(() => {});
      } catch { /* noop */ }
    }
  }, [muted]);


  // Prevent zoom gestures
  useEffect(() => {
    const el = videoRef.current?.parentElement;
    if (!el) return;
    const prevent = (e: Event) => e.preventDefault();
    el.addEventListener('gesturestart', prevent, { passive: false });
    el.addEventListener('gesturechange', prevent, { passive: false });
    return () => {
      el.removeEventListener('gesturestart', prevent);
      el.removeEventListener('gesturechange', prevent);
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    const currentVideo = videoRef.current;
    return () => {
      if (currentVideo) {
        cleanupVideoHardening(currentVideo);
        currentVideo.srcObject = null;
      }
    };
  }, []);

  return (
    <div
      className={cn('h-full overflow-hidden relative camera-locked flex items-center justify-center', className)}
      style={{ position: 'relative', zIndex: 0, aspectRatio: '9 / 16', maxWidth: '100%', maxHeight: '100%', margin: '0 auto' }}
    >
      {/* Reference-parity: single <video> only. No blurred backdrop layer.
          If a caller passes fit="contain" they accept letterboxing. */}

      <video 
        ref={videoRef}
        data-livekit-media="true"
        data-no-auto-pause="true"
        autoPlay
        playsInline
        muted
        controls={false}
        {...(enablePictureInPicture ? {} : { disablePictureInPicture: true })}
        disableRemotePlayback
        controlsList={enablePictureInPicture ? "nodownload nofullscreen noremoteplayback noplaybackrate" : "nodownload nofullscreen noremoteplayback noplaybackrate"}
        poster=""
        {...(pipId ? { 'data-pip-id': pipId } : {})}
        {...nativeInlineVideoProps}
        className="w-full h-full pointer-events-none select-none relative"
        style={{
          objectFit: fit,
          objectPosition: 'center center',
          transform: mirror ? 'scaleX(-1) translateZ(0)' : 'translateZ(0)',
          width: '100%',
          height: '100%',
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
          WebkitAppearance: 'none',
          willChange: 'transform',
          backfaceVisibility: 'hidden',
          backgroundColor: 'transparent',
          opacity: 0,
          transition: 'opacity 160ms linear',
          zIndex: 1,
        } as CSSProperties}/>
      {/* Pkg167: subtle edge vignette overlay (cinematic depth) */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(120% 90% at 50% 50%, transparent 60%, rgba(0,0,0,0.35) 100%)',
          zIndex: 2,
        }}
      />
    </div>
  );
});
