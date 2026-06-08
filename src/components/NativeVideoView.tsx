/**
 * NativeVideoView — Phase 1C.
 *
 * A React placeholder that reserves CSS-pixel bounds on the page and
 * asks the native LiveKit plugin to mount a `TextureViewRenderer` at
 * the matching bounds **behind** the transparent WebView. The renderer
 * shows the local camera (`kind="local"`) or a remote participant's
 * video track (`kind="remote"` + `sid`) without ever touching the
 * Room — the native engine stays up across mounts/unmounts/rotations.
 *
 * Web / non-native fallback: renders an empty positioned `<div>` so
 * page layout is preserved; the native call no-ops.
 *
 * Usage:
 *   <NativeVideoView kind="local" mirror className="aspect-video rounded-2xl" />
 *   <NativeVideoView kind="remote" sid={trackSid} className="w-full h-full" />
 */
import { useEffect, useId, useLayoutEffect, useRef } from 'react';
import { NativeLiveKit, isNativeLiveKitAvailable } from '@/plugins/NativeLiveKit';

export interface NativeVideoViewProps {
  kind: 'local' | 'remote';
  /** Required when kind === 'remote'. */
  sid?: string;
  /** Mirror horizontally (front-camera convention). Default true for `kind='local'`. */
  mirror?: boolean;
  className?: string;
  style?: React.CSSProperties;
  /** Fired after the native surface successfully bound to a track. */
  onAttached?: () => void;
}

export const NativeVideoView = ({
  kind,
  sid,
  mirror,
  className,
  style,
  onAttached,
}: NativeVideoViewProps) => {
  const reactId = useId();
  const viewIdRef = useRef<string>(`nvv-${reactId.replace(/[^a-zA-Z0-9]/g, '')}`);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const lastBoundsRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const attachedRef = useRef(false);

  // Sync DOM bounds → native renderer bounds. ResizeObserver covers
  // layout shifts; rAF loop covers scroll/transform animation frames
  // cheaply (only sends when bounds actually change).
  useLayoutEffect(() => {
    if (!isNativeLiveKitAvailable()) return;
    if (kind === 'remote' && !sid) return;

    const viewId = viewIdRef.current;
    const el = hostRef.current;
    if (!el) return;

    let cancelled = false;
    let rafId = 0;

    const readBounds = () => {
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    };

    const pushBounds = async (force = false) => {
      const b = readBounds();
      if (b.w < 1 || b.h < 1) return;
      const prev = lastBoundsRef.current;
      if (!force && prev && prev.x === b.x && prev.y === b.y && prev.w === b.w && prev.h === b.h) {
        return;
      }
      lastBoundsRef.current = b;

      try {
        if (!attachedRef.current) {
          if (kind === 'local') {
            await NativeLiveKit.attachLocalSurface({
              viewId, x: b.x, y: b.y, width: b.w, height: b.h,
              mirror: mirror ?? true,
            });
          } else {
            await NativeLiveKit.attachRemoteSurface({
              viewId, sid: sid!, x: b.x, y: b.y, width: b.w, height: b.h,
            });
          }
          if (cancelled) return;
          attachedRef.current = true;
          onAttached?.();
        } else {
          await NativeLiveKit.updateSurfaceBounds({
            viewId, x: b.x, y: b.y, width: b.w, height: b.h,
          });
        }
      } catch (e) {
        // Plugin not loaded / Room not connected yet — keep trying via RO/raf.
      }
    };

    pushBounds(true);

    const ro = new ResizeObserver(() => { pushBounds(); });
    ro.observe(el);

    const tick = () => {
      if (cancelled) return;
      pushBounds();
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    const onScroll = () => pushBounds();
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      ro.disconnect();
      window.removeEventListener('scroll', onScroll, { capture: true } as any);
      if (attachedRef.current) {
        NativeLiveKit.detachSurface({ viewId }).catch(() => { /* noop */ });
        attachedRef.current = false;
      }
      lastBoundsRef.current = null;
    };
  }, [kind, sid, mirror, onAttached]);

  return (
    <div
      ref={hostRef}
      className={className}
      style={{
        // Native surface paints behind the WebView; the placeholder div
        // must NOT be opaque, or it will cover the renderer.
        background: 'transparent',
        ...style,
      }}
      data-native-video-view={viewIdRef.current}
    />
  );
};

export default NativeVideoView;
