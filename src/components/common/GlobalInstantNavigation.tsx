import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { warmRouteForNavigation } from "@/utils/routePrefetch";

const MOVE_TOLERANCE_PX = 12;

type ArmedTap = {
  path: string;
  pointerId: number;
  x: number;
  y: number;
};

const getInstantPath = (target: EventTarget | null): string | null => {
  const el = target instanceof Element ? target : null;
  if (!el) return null;

  const explicit = el.closest<HTMLElement>('[data-instant-path]');
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
  const locationRef = useRef(location.pathname + location.search + location.hash);

  useEffect(() => {
    locationRef.current = location.pathname + location.search + location.hash;
  }, [location.pathname, location.search, location.hash]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || event.defaultPrevented) return;
      const path = getInstantPath(event.target);
      if (!path) return;

      armedRef.current = {
        path,
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      };

      // Start the destination chunk immediately on touch-down. The real route
      // commit below happens on pointer-up so scrolling never becomes a tap.
      void warmRouteForNavigation(path)?.catch(() => undefined);
    };

    const onPointerUp = (event: PointerEvent) => {
      const armed = armedRef.current;
      armedRef.current = null;
      if (!armed || armed.pointerId !== event.pointerId || event.defaultPrevented) return;

      const dx = Math.abs(event.clientX - armed.x);
      const dy = Math.abs(event.clientY - armed.y);
      if (dx > MOVE_TOLERANCE_PX || dy > MOVE_TOLERANCE_PX) return;

      const current = locationRef.current.split('#')[0];
      const target = armed.path.split('#')[0];
      if (current === target) return;

      navigate(armed.path);
    };

    const onCancel = () => {
      armedRef.current = null;
    };

    window.addEventListener('pointerdown', onPointerDown, { passive: true, capture: true });
    window.addEventListener('pointerup', onPointerUp, { passive: true, capture: true });
    window.addEventListener('pointercancel', onCancel, { passive: true, capture: true });

    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('pointerup', onPointerUp, true);
      window.removeEventListener('pointercancel', onCancel, true);
    };
  }, [navigate]);

  return null;
}

export default GlobalInstantNavigation;