/**
 * Phase 1 (Camera Rebuild Plan, 2026-06-14) — JS bridge for the native
 * `SeatRendererBinder` (Kotlin `LiveKitPlugin`).
 *
 * On Android native build, mounts a per-seat `TextureViewRenderer` above
 * the WebView at the exact CSS-pixel rect of the React seat tile and
 * binds it to a LiveKit participant identity. The React tile stays
 * visible underneath (empty-seat UI, gradients, badges) — only the
 * inner video region is overlaid by the native renderer.
 *
 * Web / older APKs → all functions are safe no-ops.
 */

import { Capacitor } from '@capacitor/core';
import { useEffect, useRef } from 'react';

function plugin(): any | null {
  if (Capacitor.getPlatform() !== 'android') return null;
  const p = (Capacitor as any).Plugins?.NativeLiveKit;
  if (p && typeof p.bindSeatRenderer === 'function') return p;
  return null;
}

export interface SeatRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BindSeatArgs {
  seatIndex: number;
  identity: string;
  mirror?: boolean;
  rect: SeatRect;
}

export function getElementCssRect(el: HTMLElement): SeatRect {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

export async function bindSeatRenderer(args: BindSeatArgs): Promise<void> {
  const p = plugin();
  if (!p) return;
  try {
    await p.bindSeatRenderer(args);
  } catch (e) {
    console.warn('[seatRenderer] bind failed', e);
  }
}

export async function updateSeatRendererRect(seatIndex: number, rect: SeatRect): Promise<void> {
  const p = plugin();
  if (!p) return;
  try {
    await p.updateSeatRendererRect({ seatIndex, rect });
  } catch {
    /* noop */
  }
}

export async function unbindSeatRenderer(seatIndex: number): Promise<void> {
  const p = plugin();
  if (!p) return;
  try {
    await p.unbindSeatRenderer({ seatIndex });
  } catch {
    /* noop */
  }
}

export async function clearAllSeatRenderers(): Promise<void> {
  const p = plugin();
  if (!p) return;
  try {
    await p.clearAllSeatRenderers();
  } catch {
    /* noop */
  }
}

/** Available on the current build? Use to gate React rendering. */
export function isNativeSeatRendererAvailable(): boolean {
  return plugin() != null;
}

/**
 * React hook — bind a DOM seat tile element to a LiveKit identity's
 * camera track via the native TextureView overlay. Re-positions the
 * overlay on resize/scroll and tears down on unmount.
 */
export function useSeatRendererBinding(opts: {
  enabled: boolean;
  seatIndex: number;
  identity: string | null | undefined;
  anchorRef: React.RefObject<HTMLElement>;
  mirror?: boolean;
}) {
  const { enabled, seatIndex, identity, anchorRef, mirror } = opts;
  const lastIdentityRef = useRef<string | null>(null);
  const bindingVersionRef = useRef(0);

  useEffect(() => {
    if (!enabled || !identity || !anchorRef.current) return;
    if (!isNativeSeatRendererAvailable()) return;
    const el = anchorRef.current;
    lastIdentityRef.current = identity;
    const bindingVersion = ++bindingVersionRef.current;

    let raf = 0;
    const apply = () => {
      const rect = getElementCssRect(el);
      if (rect.w < 2 || rect.h < 2) return;
      void bindSeatRenderer({ seatIndex, identity, mirror, rect });
    };
    apply();

    const reapply = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rect = getElementCssRect(el);
        if (rect.w < 2 || rect.h < 2) return;
        void updateSeatRendererRect(seatIndex, rect);
      });
    };

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(reapply) : null;
    ro?.observe(el);
    window.addEventListener('resize', reapply);
    window.addEventListener('scroll', reapply, true);
    window.addEventListener('orientationchange', reapply);

    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener('resize', reapply);
      window.removeEventListener('scroll', reapply, true);
      window.removeEventListener('orientationchange', reapply);
      window.setTimeout(() => {
        // If the same seat immediately rebound to a new identity, the new
        // effect increments the version before this timeout fires, so the old
        // cleanup cannot unbind the fresh native renderer. On true unmount it
        // still releases the renderer.
        if (bindingVersionRef.current === bindingVersion) void unbindSeatRenderer(seatIndex);
      }, 0);
    };
  }, [enabled, seatIndex, identity, mirror, anchorRef]);
}
