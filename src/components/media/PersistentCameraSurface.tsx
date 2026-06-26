/**
 * PersistentCameraSurface
 * -----------------------
 * Renders a single hidden-behind-UI <video> element bound to the warm
 * MediaStream held by persistentCameraSession. It exists only to keep a
 * live camera frame painted to the screen during the brief moments
 * between phase swaps (preview → broadcast, create → inRoom, etc.),
 * where the page's own <video> ref unmounts and the next page hasn't
 * yet attached its own.
 *
 * Without this surface, even though the underlying MediaStream is
 * preserved in persistentCameraSession, the user sees a black flash
 * during the React unmount→mount window and perceives the camera as
 * "re-opening". With it, the camera frame is continuously visible.
 *
 * Sits at z-0 (below all phase content). Object-cover, muted, autoplay,
 * playsInline. No native Android coupling — that path uses its own
 * Camera2 surface handoff via LiveKitPlugin.
 */
import { useEffect, useRef, useState } from 'react';
import { peekCameraSession } from '@/lib/persistentCameraSession';
import { isNativeAndroidApp } from '@/utils/nativeUtils';

type Props = {
  /** When false, the surface is unmounted entirely (saves a video element). */
  active?: boolean;
};

export default function PersistentCameraSurface({ active = true }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(() => peekCameraSession());

  // Native Android owns the camera surface via the plugin renderer, so this
  // web surface would be redundant and could fight with Camera2 ownership.
  const isNative = isNativeAndroidApp();

  // Re-poll the global session every 500ms — the warm session may appear
  // after this component mounts (e.g. GoLive opens the camera on user
  // gesture). Cheap and avoids tight coupling to the session module's
  // internals (it doesn't expose a subscribe API).
  useEffect(() => {
    if (!active || isNative) return;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const next = peekCameraSession();
      setStream((prev) => (prev === next ? prev : next));
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [active, isNative]);

  // Bind / unbind the stream to the <video> element.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (stream && el.srcObject !== stream) {
      try {
        el.srcObject = stream;
        const p = el.play();
        if (p && typeof (p as Promise<void>).catch === 'function') {
          (p as Promise<void>).catch(() => {
            /* autoplay rejection — harmless, frames still paint */
          });
        }
      } catch {
        /* ignore */
      }
    } else if (!stream && el.srcObject) {
      try {
        el.pause();
      } catch {
        /* ignore */
      }
      try {
        el.srcObject = null;
      } catch {
        /* ignore */
      }
    }
  }, [stream]);

  if (!active || isNative) return null;

  return (
    <video
      ref={videoRef}
      autoPlay
      muted
      playsInline
      aria-hidden
      tabIndex={-1}
      className="pointer-events-none fixed inset-0 h-full w-full object-cover"
      style={{
        zIndex: 0,
        // Mirror to match selfie-preview convention used by GoLive / CreateParty.
        transform: 'scaleX(-1)',
        backgroundColor: '#000',
      }}
    />
  );
}
