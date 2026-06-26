import { MutableRefObject, RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

type ScrollBehaviorMode = ScrollBehavior | "instant";

interface StableChatScrollOptions {
  /** Changes when messages are appended/replaced. */
  dependency?: unknown;
  /** Changes when opening a different thread/ticket/room; forces initial bottom pin. */
  resetKey?: string | number | null;
  /** flex-col-reverse streams use scrollTop≈0 as the visual bottom. */
  reverse?: boolean;
  /** px distance from latest considered pinned. */
  bottomThreshold?: number;
  /** Number of rAF frames to keep pinning after first mount/reset. */
  initialPinFrames?: number;
}

interface StableChatScrollApi {
  scrollRef: RefObject<HTMLDivElement>;
  isNearBottomRef: MutableRefObject<boolean>;
  showJumpToLatest: boolean;
  scrollToLatest: (behavior?: ScrollBehaviorMode) => void;
  getScrollElement: () => HTMLElement | null;
}

const resolveScrollElement = (node: HTMLElement | null): HTMLElement | null => {
  if (!node) return null;
  return (node.querySelector?.("[data-radix-scroll-area-viewport]") as HTMLElement | null) || node;
};

const getDistanceFromLatest = (el: HTMLElement, reverse: boolean) => {
  if (reverse) return Math.abs(el.scrollTop);
  return Math.max(0, el.scrollHeight - el.scrollTop - el.clientHeight);
};

export function useStableChatScroll({
  dependency,
  resetKey,
  reverse = false,
  bottomThreshold = 96,
  initialPinFrames = 3,
}: StableChatScrollOptions = {}): StableChatScrollApi {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollElementRef = useRef<HTMLElement | null>(null);
  const isNearBottomRef = useRef(true);
  const userInteractingRef = useRef(false);
  const interactionReleaseTimerRef = useRef<number | null>(null);
  const resetKeyRef = useRef<string | number | null | undefined>(undefined);
  const prevScrollSizeRef = useRef(0);
  const prevDistanceRef = useRef(0);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);

  const getScrollElement = useCallback(() => {
    const el = resolveScrollElement(scrollRef.current);
    scrollElementRef.current = el;
    return el;
  }, []);

  const syncBottomState = useCallback(() => {
    const el = getScrollElement();
    if (!el) return;
    const distance = getDistanceFromLatest(el, reverse);
    const near = distance <= bottomThreshold;
    isNearBottomRef.current = near;
    setShowJumpToLatest(!near);
    prevScrollSizeRef.current = el.scrollHeight;
    prevDistanceRef.current = distance;
  }, [bottomThreshold, getScrollElement, reverse]);

  const scrollToLatest = useCallback((behavior: ScrollBehaviorMode = "auto") => {
    const el = getScrollElement();
    if (!el) return;
    const previousBehavior = el.style.scrollBehavior;
    if (behavior === "instant") el.style.scrollBehavior = "auto";
    if (reverse) {
      el.scrollTo({ top: 0, behavior: behavior === "instant" ? "auto" : behavior });
    } else {
      el.scrollTo({ top: el.scrollHeight, behavior: behavior === "instant" ? "auto" : behavior });
    }
    if (behavior === "instant") el.style.scrollBehavior = previousBehavior;
    isNearBottomRef.current = true;
    setShowJumpToLatest(false);
    prevScrollSizeRef.current = el.scrollHeight;
    prevDistanceRef.current = 0;
  }, [getScrollElement, reverse]);

  useEffect(() => {
    let raf = 0;
    let el: HTMLElement | null = null;

    const markUserInteracting = () => {
      userInteractingRef.current = true;
      if (interactionReleaseTimerRef.current) window.clearTimeout(interactionReleaseTimerRef.current);
    };

    const releaseUserInteracting = () => {
      if (interactionReleaseTimerRef.current) window.clearTimeout(interactionReleaseTimerRef.current);
      interactionReleaseTimerRef.current = window.setTimeout(() => {
        userInteractingRef.current = false;
        syncBottomState();
      }, 140);
    };

    const attach = () => {
      el = getScrollElement();
      if (!el) {
        raf = requestAnimationFrame(attach);
        return;
      }
      syncBottomState();
      el.addEventListener("scroll", syncBottomState, { passive: true });
      el.addEventListener("touchstart", markUserInteracting, { passive: true });
      el.addEventListener("touchmove", markUserInteracting, { passive: true });
      el.addEventListener("touchend", releaseUserInteracting, { passive: true });
      el.addEventListener("touchcancel", releaseUserInteracting, { passive: true });
      el.addEventListener("wheel", releaseUserInteracting, { passive: true });
    };

    attach();
    return () => {
      cancelAnimationFrame(raf);
      if (interactionReleaseTimerRef.current) window.clearTimeout(interactionReleaseTimerRef.current);
      if (el) {
        el.removeEventListener("scroll", syncBottomState);
        el.removeEventListener("touchstart", markUserInteracting);
        el.removeEventListener("touchmove", markUserInteracting);
        el.removeEventListener("touchend", releaseUserInteracting);
        el.removeEventListener("touchcancel", releaseUserInteracting);
        el.removeEventListener("wheel", releaseUserInteracting);
      }
    };
  }, [getScrollElement, syncBottomState]);

  useLayoutEffect(() => {
    const el = getScrollElement();
    if (!el) return;

    const isReset = resetKeyRef.current !== resetKey;
    if (isReset) {
      resetKeyRef.current = resetKey;
      isNearBottomRef.current = true;
      setShowJumpToLatest(false);
      for (let i = 0; i < initialPinFrames; i += 1) {
        requestAnimationFrame(() => scrollToLatest("instant"));
      }
      return;
    }

    if (isNearBottomRef.current && !userInteractingRef.current) {
      requestAnimationFrame(() => scrollToLatest("instant"));
    }
  }, [dependency, resetKey, getScrollElement, initialPinFrames, scrollToLatest]);

  useEffect(() => {
    const el = getScrollElement();
    if (!el || typeof ResizeObserver === "undefined") return;

    prevScrollSizeRef.current = el.scrollHeight;
    prevDistanceRef.current = getDistanceFromLatest(el, reverse);

    const preserveIfPinned = () => {
      const nextSize = el.scrollHeight;
      const nextDistance = getDistanceFromLatest(el, reverse);
      const grew = nextSize > prevScrollSizeRef.current;
      const wasPinned = prevDistanceRef.current <= bottomThreshold || isNearBottomRef.current;

      if (grew && wasPinned && nextDistance > bottomThreshold && !userInteractingRef.current) {
        scrollToLatest("instant");
      } else {
        isNearBottomRef.current = nextDistance <= bottomThreshold;
        setShowJumpToLatest(nextDistance > bottomThreshold);
      }

      prevScrollSizeRef.current = el.scrollHeight;
      prevDistanceRef.current = getDistanceFromLatest(el, reverse);
    };

    const ro = new ResizeObserver(() => requestAnimationFrame(preserveIfPinned));
    ro.observe(el);
    Array.from(el.children).forEach((child) => ro.observe(child));

    const mo = new MutationObserver(() => {
      Array.from(el.children).forEach((child) => {
        try { ro.observe(child); } catch { /* ignored */ }
      });
      requestAnimationFrame(preserveIfPinned);
    });
    mo.observe(el, { childList: true, subtree: false });

    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [bottomThreshold, getScrollElement, reverse, scrollToLatest]);

  return { scrollRef, isNearBottomRef, showJumpToLatest, scrollToLatest, getScrollElement };
}

export default useStableChatScroll;