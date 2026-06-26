import { useCallback, useRef } from "react";

/**
 * Pointer-driven swipe-to-reply gesture, WhatsApp-style.
 * - Right swipe on peer messages, left swipe on own messages.
 * - Reveals a reply icon that fills in as you pass the threshold.
 * - Releases past threshold = triggers `onReply` with haptic.
 */
export function useSwipeToReply(opts: {
  isMine: boolean;
  onReply: () => void;
  threshold?: number;
  maxPull?: number;
}) {
  const { isMine, onReply, threshold = 56, maxPull = 96 } = opts;

  const rowRef = useRef<HTMLDivElement | null>(null);
  const startX = useRef(0);
  const startY = useRef(0);
  const active = useRef(false);
  const armed = useRef(false);

  const dir = isMine ? -1 : 1; // negative pull for own messages

  const reset = useCallback((withTransition = true) => {
    const el = rowRef.current;
    if (!el) return;
    if (withTransition) el.style.transition = "transform 180ms ease";
    el.style.transform = "translate3d(0,0,0)";
    el.style.removeProperty("--reply-progress");
    window.setTimeout(() => {
      if (el) el.style.transition = "";
    }, 200);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    startX.current = e.clientX;
    startY.current = e.clientY;
    active.current = true;
    armed.current = false;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!active.current) return;
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;
    // Decide axis on first meaningful movement
    if (!armed.current) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        active.current = false; // vertical scroll wins
        return;
      }
      // Only allow swipe in the correct direction for this side
      if ((isMine && dx > 0) || (!isMine && dx < 0)) {
        active.current = false;
        return;
      }
      armed.current = true;
      const el = rowRef.current;
      if (el) {
        el.style.transition = "none";
        try { (e.target as Element).setPointerCapture?.(e.pointerId); } catch {}
      }
    }
    const raw = dx * dir > 0 ? dx : 0;
    const pull = Math.min(Math.abs(raw), maxPull) * dir;
    const el = rowRef.current;
    if (!el) return;
    el.style.transform = `translate3d(${pull}px,0,0)`;
    el.style.setProperty("--reply-progress", String(Math.min(1, Math.abs(pull) / threshold)));
  };

  const finish = useCallback(
    (e?: React.PointerEvent) => {
      if (!active.current && !armed.current) return;
      const el = rowRef.current;
      let pulled = 0;
      if (el) {
        const t = el.style.transform.match(/-?\d+(\.\d+)?/);
        pulled = t ? Math.abs(parseFloat(t[0])) : 0;
      }
      active.current = false;
      armed.current = false;
      reset(true);
      if (pulled >= threshold) {
        try {
          if ("vibrate" in navigator) navigator.vibrate?.(12);
        } catch {}
        onReply();
      }
    },
    [onReply, reset, threshold]
  );

  return {
    rowRef,
    swipeProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: finish,
    } as React.HTMLAttributes<HTMLDivElement>,
    isMine,
  };
}
