/**
 * PersistentCameraSurface (Global, self-driven)
 * --------------------------------------------
 * A single hidden <video> element bound to the warm MediaStream held by
 * `persistentCameraSession`. Mounted ONCE at the top of the authenticated
 * provider tree (inside CallProvider) so it survives every React Router
 * navigation — GoLive → LiveStream, CreateParty → PartyRoom, idle → ActiveCall.
 *
 * Why this exists
 * ---------------
 * The underlying MediaStream is preserved in `persistentCameraSession`, but
 * the per-page <video> element unmounts and the next page's <video> hasn't
 * yet attached. Without a persistent paint surface bridging that React
 * unmount → mount window, users see a black flash and perceive the camera
 * as "re-opening" — even though the camera was never released.
 *
 * Behaviour
 * ---------
 * - Event-driven: subscribes to `persistentCameraSession` and renders ONLY when there is
 *   a live video track. On Home/Profile/Auth/etc. there is no camera open,
 *   so this component returns null and is completely inert.
 * - Render order: fixed inset-0 at z-index 0 — sits behind every page's
 *   opaque background and chrome (no visible effect on normal pages),
 *   but stays painted during the brief route swap when the foreground
 *   page is mid-mount.
 * - Native Android no-op: the Camera2 / LiveKitPlugin surface handoff
 *   handles continuity natively — a hidden WebView <video> would fight
 *   for camera ownership.
 */
import { useEffect, useRef, useState } from 'react';
import { peekCameraSession, subscribeCameraSession } from '@/lib/persistentCameraSession';
import { isNativeAndroidApp } from '@/utils/nativeUtils';

const hasLiveVideo = (s: MediaStream | null) =>
  !!s && s.getVideoTracks().some((t) => t.readyState === 'live');

export default function PersistentCameraSurface() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const underlayVideoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(() => peekCameraSession());

  const isNative = isNativeAndroidApp();

  // Event-driven bridge. The warm session may appear/disappear at any time
  // (GoLive opens it, End Live disposes it), and the paint surface updates
  // immediately without timer polling or visibility refresh hacks.
  useEffect(() => {
    if (isNative) return;
    return subscribeCameraSession((next) => {
      setStream((prev) => (prev === next ? prev : next));
    });
  }, [isNative]);

  useEffect(() => {
    if (!stream) return;
    const sync = () => setStream(peekCameraSession());
    stream.getTracks().forEach((track) => track.addEventListener('ended', sync));
    return () => {
      stream.getTracks().forEach((track) => track.removeEventListener('ended', sync));
    };
  }, [stream]);

  // Bind / unbind the stream to the <video> element.
  useEffect(() => {
    const el = videoRef.current;
    const underlay = underlayVideoRef.current;
    if (!el) return;
    if (stream && (el.srcObject !== stream || underlay?.srcObject !== stream)) {
      try {
        el.srcObject = stream;
        if (underlay) underlay.srcObject = stream;
        const p = el.play();
        const u = underlay?.play();
        if (p && typeof (p as Promise<void>).catch === 'function') {
          (p as Promise<void>).catch(() => {
            /* autoplay rejection — harmless, frames still paint */
          });
        }
        if (u && typeof (u as Promise<void>).catch === 'function') {
          (u as Promise<void>).catch(() => {
            /* autoplay rejection — harmless, frames still paint */
          });
        }
      } catch {
        /* ignore */
      }
    } else if (!stream && el.srcObject) {
      try { el.pause(); } catch { /* ignore */ }
      try { el.srcObject = null; } catch { /* ignore */ }
      try { underlay?.pause(); } catch { /* ignore */ }
      try { if (underlay) underlay.srcObject = null; } catch { /* ignore */ }
    }
  }, [stream]);

  // No camera open → render nothing. Zero overhead on normal pages.
  if (isNative || !hasLiveVideo(stream)) return null;

  return (
    <>
      <video
        ref={underlayVideoRef}
        autoPlay
        muted
        playsInline
        aria-hidden
        tabIndex={-1}
        data-persistent-camera-surface-underlay=""
        className="pointer-events-none fixed inset-0 h-full w-full object-cover bg-transparent blur-[18px] saturate-110 brightness-75 scale-110"
        style={{
          zIndex: 0,
          // Selfie-mirror to match GoLive / CreateParty / ActiveCall preview.
          transform: 'scaleX(-1) scale(1.1)',
          backgroundColor: 'transparent',
        }}
      />
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        aria-hidden
        tabIndex={-1}
        data-persistent-camera-surface=""
        className="pointer-events-none fixed inset-0 h-full w-full object-contain bg-transparent"
        style={{
          zIndex: 1,
          // Selfie-mirror to match GoLive / CreateParty / ActiveCall preview.
          transform: 'scaleX(-1)',
          backgroundColor: 'transparent',
        }}
      />
    </>
  );
}
