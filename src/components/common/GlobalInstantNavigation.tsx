import { useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { warmRouteForNavigation } from "@/utils/routePrefetch";

const MOVE_TOLERANCE_PX = 12;

type ArmedTap = {
  path: string;
  pointerId: number;
  x: number;
  y: number;
  mode: "pointer" | "touch" | "mouse";
};

const getInstantPath = (target: EventTarget | null): string | null => {
  const el = target instanceof Element ? target : null;
  if (!el) return null;

  const explicit = el.closest<HTMLElement>('[data-instant-path],[data-prefetch-path]');
  const path = explicit?.dataset.instantPath || explicit?.dataset.prefetchPath || null;
  if (!path || !path.startsWith('/')) return null;

  const disabled = explicit?.closest('button:disabled,[aria-disabled="true"],[data-no-instant-nav="true"]');
  if (disabled) return null;

  return path;
};

export function GlobalInstantNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const armedRef = useRef<ArmedTap | null>(null);
  const lastCommitRef = useRef<{ path: string; at: number } | null>(null);
  const locationRef = useRef(location.pathname + location.search + location.hash);

  useEffect(() => {
    locationRef.current = location.pathname + location.search + location.hash;
  }, [location.pathname, location.search, location.hash]);

  useEffect(() => {
    const commitNavigation = (armed: ArmedTap, x: number, y: number) => {
      const dx = Math.abs(x - armed.x);
      const dy = Math.abs(y - armed.y);
      if (dx > MOVE_TOLERANCE_PX || dy > MOVE_TOLERANCE_PX) return;

      const current = locationRef.current.split('#')[0];
      const target = armed.path.split('#')[0];
      if (current === target) return;

      const now = performance.now();
      const last = lastCommitRef.current;
      if (last?.path === armed.path && now - last.at < 450) return;
      lastCommitRef.current = { path: armed.path, at: now };

      // Force the location update to flush during the same input frame instead
      // of waiting for React's normal event batching. This is what makes a tap
      // feel like a native screen push, especially on Android WebView.
      flushSync(() => navigate(armed.path));
    };

    const arm = (path: string, pointerId: number, x: number, y: number, mode: ArmedTap["mode"]) => {
      armedRef.current = { path, pointerId, x, y, mode };
      void warmRouteForNavigation(path)?.catch(() => undefined);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || event.defaultPrevented) return;
      const path = getInstantPath(event.target);
      if (!path) return;
      arm(path, event.pointerId, event.clientX, event.clientY, "pointer");
    };

    const onPointerUp = (event: PointerEvent) => {
      const armed = armedRef.current;
      armedRef.current = null;
      if (!armed || armed.mode !== "pointer" || armed.pointerId !== event.pointerId || event.defaultPrevented) return;
      commitNavigation(armed, event.clientX, event.clientY);
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.defaultPrevented || event.touches.length !== 1) return;
      const path = getInstantPath(event.target);
      const touch = event.touches[0];
      if (!path || !touch) return;
      arm(path, touch.identifier, touch.clientX, touch.clientY, "touch");
    };

    const onTouchEnd = (event: TouchEvent) => {
      const armed = armedRef.current;
      if (!armed || armed.mode !== "touch" || event.defaultPrevented) return;
      const touch = Array.from(event.changedTouches).find((t) => t.identifier === armed.pointerId);
      armedRef.current = null;
      if (!touch) return;
      commitNavigation(armed, touch.clientX, touch.clientY);
    };

    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0 || event.defaultPrevented) return;
      const path = getInstantPath(event.target);
      if (!path) return;
      arm(path, 1, event.clientX, event.clientY, "mouse");
    };

    const onMouseUp = (event: MouseEvent) => {
      const armed = armedRef.current;
      armedRef.current = null;
      if (!armed || armed.mode !== "mouse" || event.button !== 0 || event.defaultPrevented) return;
      commitNavigation(armed, event.clientX, event.clientY);
    };

    const onCancel = () => {
      armedRef.current = null;
    };

    window.addEventListener('pointerdown', onPointerDown, { passive: true, capture: true });
    window.addEventListener('pointerup', onPointerUp, { passive: true, capture: true });
    window.addEventListener('pointercancel', onCancel, { passive: true, capture: true });
    window.addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true, capture: true });
    window.addEventListener('touchcancel', onCancel, { passive: true, capture: true });
    window.addEventListener('mousedown', onMouseDown, { passive: true, capture: true });
    window.addEventListener('mouseup', onMouseUp, { passive: true, capture: true });

    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('pointerup', onPointerUp, true);
      window.removeEventListener('pointercancel', onCancel, true);
      window.removeEventListener('touchstart', onTouchStart, true);
      window.removeEventListener('touchend', onTouchEnd, true);
      window.removeEventListener('touchcancel', onCancel, true);
      window.removeEventListener('mousedown', onMouseDown, true);
      window.removeEventListener('mouseup', onMouseUp, true);
    };
  }, [navigate]);

  return null;
}

export default GlobalInstantNavigation;