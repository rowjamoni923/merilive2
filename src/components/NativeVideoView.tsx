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
  const retryCountRef = useRef(0);

  // Sync DOM bounds → native renderer bounds.
  //
  // Professional pattern (Agora / Bigo): never push bounds every animation
  // frame — it floods the JS↔native bridge and starves the main thread,
  // which can itself cause frame stalls. We listen to layout-affecting
  // signals (ResizeObserver, scroll, orientation, transitionend) and
  // throttle pushes to ~10/s, only sending when bounds actually changed.
  useLayoutEffect(() => {
    if (!isNativeLiveKitAvailable()) return;
    if (kind === 'remote' && !sid) return;

    const viewId = viewIdRef.current;
    const el = hostRef.current;
    if (!el) return;

    let cancelled = false;
    let pendingTimer: number | null = null;
    let inflight = false;

    const readBounds = () => {
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    };

    const doPush = async (force: boolean) => {
      if (cancelled || inflight) return;
      const b = readBounds();
      if (b.w < 1 || b.h < 1) return;
      const prev = lastBoundsRef.current;
      if (!force && prev && prev.x === b.x && prev.y === b.y && prev.w === b.w && prev.h === b.h) {
        return;
      }
      inflight = true;
      try {
        if (!attachedRef.current) {
          if (kind === 'local') {
            const res = await NativeLiveKit.attachLocalSurface({
              viewId, x: b.x, y: b.y, width: b.w, height: b.h,
              mirror: mirror ?? true,
            });
            if ((res as any)?.attached === false) {
              if (!cancelled) schedule(true);
              return;
            }
          } else {
            const res = await NativeLiveKit.attachRemoteSurface({
              viewId, sid: sid!, x: b.x, y: b.y, width: b.w, height: b.h,
            });
            if ((res as any)?.attached === false) {
              if (!cancelled) schedule(true);
              return;
            }
          }
          if (cancelled) return;
          attachedRef.current = true;
          retryCountRef.current = 0;
          lastBoundsRef.current = b;
          onAttached?.();
        } else {
          await NativeLiveKit.updateSurfaceBounds({
            viewId, x: b.x, y: b.y, width: b.w, height: b.h,
          });
          lastBoundsRef.current = b;
        }
      } catch {
        // Plugin/Room/track may not be ready yet. Keep retrying on a bounded
        // short cadence instead of waiting for resize/scroll; otherwise party
        // seats can sit blank until another layout signal happens.
        if (!cancelled && !attachedRef.current) {
          retryCountRef.current += 1;
          if (retryCountRef.current <= 18) schedule(true);
        }
      } finally {
        inflight = false;
      }
    };

    const schedule = (force = false) => {
      if (cancelled) return;
      if (pendingTimer != null) return; // throttle: at most one push per window
      pendingTimer = window.setTimeout(() => {
        pendingTimer = null;
        void doPush(force);
      }, force && !attachedRef.current ? 160 : 100); // fast initial bind, then ~10 Hz bounds sync
    };

    // Initial attach pushed immediately (not throttled) so the user
    // sees video as fast as the track is available.
    void doPush(true);

    const ro = new ResizeObserver(() => schedule());
    ro.observe(el);

    const onScroll = () => schedule();
    const onOrientation = () => schedule(true);
    const onTransitionEnd = () => schedule();
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    window.addEventListener('resize', onOrientation, { passive: true });
    window.addEventListener('orientationchange', onOrientation, { passive: true });
    el.addEventListener('transitionend', onTransitionEnd);

    return () => {
      cancelled = true;
      if (pendingTimer != null) window.clearTimeout(pendingTimer);
      ro.disconnect();
      window.removeEventListener('scroll', onScroll, { capture: true } as any);
      window.removeEventListener('resize', onOrientation);
      window.removeEventListener('orientationchange', onOrientation);
      el.removeEventListener('transitionend', onTransitionEnd);
      if (attachedRef.current) {
        // First shrink the native TextureView to a harmless 1px slot, then
        // detach it. This prevents a slow bridge cleanup from leaving an
        // orphan renderer visibly floating over the next call/live/party UI.
        NativeLiveKit.updateSurfaceBounds({ viewId, x: 0, y: 0, width: 1, height: 1 }).catch(() => { /* noop */ });
        NativeLiveKit.detachSurface({ viewId }).catch(() => { /* noop */ });
        attachedRef.current = false;
      }
      retryCountRef.current = 0;
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
