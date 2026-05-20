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
import { cn } from '@/lib/utils';
import type { Track } from 'livekit-client';
import { hardenVideoElementForNative, cleanupVideoHardening } from '@/utils/videoNativeHardening';
import { isNativeLiveKitAvailable, setNativeVideoVisible } from '@/plugins/LiveKitNativeBridge';

type VendorVideoProps = React.VideoHTMLAttributes<HTMLVideoElement> & {
  'x5-video-player-type'?: string;
  'x5-video-player-fullscreen'?: string;
  'x5-video-orientation'?: string;
  'x5-playsinline'?: string;
  'webkit-playsinline'?: string;
  'x-webkit-airplay'?: string;
};

interface LiveKitVideoPlayerProps {
  videoTrack: Track | null;
  className?: string;
  mirror?: boolean;
  fit?: 'cover' | 'contain';
  muted?: boolean;
  onVideoStalled?: () => void;
}

export const LiveKitVideoPlayer = memo(function LiveKitVideoPlayer({
  videoTrack,
  className,
  mirror = false,
  fit = 'cover',
  muted = true,
  onVideoStalled,
}: LiveKitVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onVideoStalledRef = useRef(onVideoStalled);
  onVideoStalledRef.current = onVideoStalled;


  // === NATIVE BRIDGE: only enable native surface for REMOTE playback ===
  // Host/local preview (mirror=true) must stay on web layer to avoid DeepAR surface conflicts.
  useEffect(() => {
    const nativeAvailable = isNativeLiveKitAvailable();
    if (!nativeAvailable) return;

    const shouldUseNativeSurface = !mirror;
    const hasActiveTrack = Boolean(
      shouldUseNativeSurface &&
      videoTrack &&
      videoTrack.mediaStreamTrack &&
      videoTrack.mediaStreamTrack.readyState !== 'ended'
    );

    setNativeVideoVisible(hasActiveTrack);
    return () => {
      setNativeVideoVisible(false);
    };
  }, [videoTrack, mirror]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !videoTrack) return;

    // Android WebView autoplay compatibility: force-muted at bootstrap,
    // then optionally unmute only after real playback starts.
    const enforceInlineSurface = () => {
      el.controls = false;
      el.removeAttribute('controls');
      el.removeAttribute('poster');
      el.setAttribute('autoplay', '');
      el.setAttribute('playsinline', '');
      el.setAttribute('webkit-playsinline', 'true');
      el.setAttribute('x5-playsinline', 'true');
      el.setAttribute('muted', '');
      el.muted = true;
      el.defaultMuted = true;
    };

    enforceInlineSurface();
    hardenVideoElementForNative(el, { muted: true });

    const mediaTrack = videoTrack.mediaStreamTrack;

    // === ATTACH TRACK ===
    if (mediaTrack && mediaTrack.readyState !== 'ended') {
      try {
        el.srcObject = new MediaStream([mediaTrack]);
      } catch {
        // ignore unsupported MediaStream assignment
      }
    }

    if (typeof videoTrack.attach === 'function') {
      try {
        videoTrack.attach(el);
      } catch {
        // ignore attach race during track replacement
      }
      // LiveKit attach can re-introduce default attributes on some WebViews
      enforceInlineSurface();
      hardenVideoElementForNative(el, { muted: true });
    }

    // === EVENT HANDLING ===
    const onTrackEnded = () => onVideoStalledRef.current?.();
    mediaTrack?.addEventListener('ended', onTrackEnded);

    const markReady = () => {
      if (!muted) {
        // Optional unmute after successful playback start
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
      enforceInlineSurface();
      if (!el || !el.paused) { markReady(); return; }
      el.play().then(markReady).catch(() => {
        if (el.readyState >= 2) {
          // Keep retrying silently; do not surface native play UI.
          setTimeout(() => {
            enforceInlineSurface();
            el.play().catch(() => {});
          }, 80);
        }
      });
    };

    // First-frame detection
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

    // Lightweight retries for autoplay race conditions on some WebViews
    const timers = [0, 60, 180].map((d) => setTimeout(playNow, d));

    // === STALL WATCHDOG (optimized: 1.5s interval instead of 1s) ===
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
          if (mediaTrack && mediaTrack.readyState !== 'ended') {
            el.srcObject = new MediaStream([mediaTrack]);
          }
          enforceInlineSurface();
          el.play().catch(() => {});
          onVideoStalledRef.current?.();
        }
      }
    }, 1500);

    return () => {
      timers.forEach(clearTimeout);
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
  }, [videoTrack, muted]);

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
    return () => {
      if (videoRef.current) {
        cleanupVideoHardening(videoRef.current);
        videoRef.current.srcObject = null;
      }
    };
  }, []);

  return (
    <div className={cn('w-full h-full overflow-hidden relative camera-locked', className)}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        controls={false}
        disablePictureInPicture
        disableRemotePlayback
        controlsList="nodownload nofullscreen noremoteplayback noplaybackrate"
        poster=""
        x5-video-player-type="h5"
        x5-video-player-fullscreen="false"
        x5-video-orientation="portrait"
        x5-playsinline="true"
        webkit-playsinline="true"
        x-webkit-airplay="deny"
        className="w-full h-full pointer-events-none select-none"
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
        } as React.CSSProperties}
        {...({} as VendorVideoProps)}
      />
    </div>
  );
});


// Re-export as AgoraVideoPlayer for backward compatibility
export { LiveKitVideoPlayer as AgoraVideoPlayer };
