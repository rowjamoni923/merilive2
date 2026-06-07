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

interface LiveKitVideoPlayerProps {
  videoTrack: Track | null;
  className?: string;
  mirror?: boolean;
  fit?: 'cover' | 'contain';
  muted?: boolean;
  onVideoStalled?: () => void;
  /** Pkg146: opt-in browser Picture-in-Picture. Adds data-pip-id and drops disablePictureInPicture. */
  enablePictureInPicture?: boolean;
  /** Pkg146: stable id used by <PictureInPictureButton pipId={...} /> to locate this video. */
  pipId?: string;
}

export const LiveKitVideoPlayer = memo(function LiveKitVideoPlayer({
  videoTrack,
  className,
  mirror = false,
  fit = 'cover',
  muted = true,
  onVideoStalled,
  enablePictureInPicture = false,
  pipId,
}: LiveKitVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onVideoStalledRef = useRef(onVideoStalled);
  onVideoStalledRef.current = onVideoStalled;
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
  const trackKey =
    videoTrack?.mediaStreamTrack?.id ||
    (videoTrack as unknown as { sid?: string })?.sid ||
    null;

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

    const mediaTrack = videoTrack.mediaStreamTrack;

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
    if (!attached && mediaTrack && mediaTrack.readyState !== 'ended') {
      try {
        el.srcObject = new MediaStream([mediaTrack]);
      } catch {
        // ignore
      }
    }

    // === EVENT HANDLING ===
    const onTrackEnded = () => onVideoStalledRef.current?.();
    mediaTrack?.addEventListener('ended', onTrackEnded);

    const hasDecodedFrame = () => el.readyState >= 2 && el.videoWidth > 0 && el.videoHeight > 0;

    const markReady = () => {
      if (!hasDecodedFrame()) return;
      revealVideo();
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
      const mt = videoTrack?.mediaStreamTrack;
      if (mt && mt.readyState === 'live') {
        try {
          if (el.paused) el.play().catch(() => {});
        } catch { /* ignore */ }
        markReady();
      }
    }, 450);

    // === STALL WATCHDOG ===
    // Pkg-audit Bug F: do NOT reassign srcObject on every stall tick — that
    // blanks the element for 80-200ms on mobile WebViews. Only reassign when
    // srcObject is actually gone or wrapping a different track.
    let lastTime = -1;
    let stagnant = 0;
    let lastRecovery = 0;
    const stallProbe = setInterval(() => {
      if (!el || document.visibilityState === 'hidden') return;
      if (el.paused && el.readyState >= 2) { el.play().catch(() => {}); return; }
      if (el.paused || el.readyState < 2) return;

      const t = el.currentTime;
      if (t <= 0) return;
      if (Math.abs(t - lastTime) < 0.005) stagnant++;
      else stagnant = 0;
      lastTime = t;

      if (stagnant >= 2) {
        stagnant = 0;
        const now = Date.now();
        if (now - lastRecovery > 5000) {
          lastRecovery = now;
          const liveTrack = mediaTrack && mediaTrack.readyState !== 'ended';
          const cur = el.srcObject as MediaStream | null;
          const curTrack = cur?.getVideoTracks?.()[0];
          const needsReattach = !!(liveTrack && mediaTrack && (!cur || !curTrack || curTrack.id !== mediaTrack.id));
          if (needsReattach && mediaTrack) {
            try { el.srcObject = new MediaStream([mediaTrack]); } catch { /* noop */ }
          }
          el.play().catch(() => {});
          onVideoStalledRef.current?.();
        }
      }
    }, 1500);

    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(revealWatchdog);
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
  }, [videoTrack]);

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
    <div className={cn('w-full h-full overflow-hidden relative camera-locked', className)}>
      {/* Pkg167: loading shimmer (sits behind video; covered when video reveals opacity:1) */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(135deg, #1a1024 0%, #0c0818 100%)',
          zIndex: 0,
        }}
      >
        <div
          className="absolute inset-y-0 w-1/3 animate-[tileShimmer_1.8s_ease-in-out_infinite]"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(168,85,247,0.18), transparent)',
            filter: 'blur(8px)',
          }}
        />
      </div>
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
          mixBlendMode: 'multiply',
        }}
      />
    </div>
  );
});
