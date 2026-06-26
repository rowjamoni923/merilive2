import { memo, useEffect, useLayoutEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

type StableSnapshot = {
  html: string;
  path: string;
  scrollY: number;
  capturedAt: number;
};

let lastStableSnapshot: StableSnapshot | null = null;
let visualHoldEl: HTMLDivElement | null = null;
let hideTimer: number | null = null;

const MEANINGFUL_SURFACE_SELECTOR = [
  "[data-page]",
  "[data-page-root]:not([data-route-placeholder='true'])",
  "main",
  "[role='main']",
  ".mobile-page",
  ".profile-home-shell",
  "#root > .fixed.inset-0",
  "#root > .min-h-screen",
].join(",");

function isMediaPath(path: string) {
  return (
    /^\/live\/[^/]+/.test(path) ||
    path.startsWith("/live-feed") ||
    path.startsWith("/party/") ||
    path === "/go-live" ||
    path === "/live-session" ||
    path === "/create-party" ||
    path === "/party-session" ||
    path.startsWith("/call/") ||
    path.startsWith("/active-call") ||
    path.startsWith("/incoming-call") ||
    path.startsWith("/outgoing-call") ||
    path.startsWith("/stream/")
  );
}

function getRoot() {
  return typeof document === "undefined" ? null : document.getElementById("root");
}

function hasMeaningfulSurface(root: HTMLElement) {
  const surfaces = Array.from(root.querySelectorAll<HTMLElement>(MEANINGFUL_SURFACE_SELECTOR));
  return surfaces.some((surface) => {
    if (surface.closest("[data-route-placeholder='true']")) return false;
    const rect = surface.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    const text = surface.textContent?.trim() ?? "";
    if (text.length > 2) return true;
    return Boolean(surface.querySelector("img,video,canvas,svg,button,a,input,textarea,[role='button']"));
  });
}

function rememberStableSnapshot(path: string) {
  if (typeof window === "undefined" || isMediaPath(path)) return;
  const root = getRoot();
  if (!root || !hasMeaningfulSurface(root)) return;
  const clone = root.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("video, audio, canvas, iframe, source, track").forEach((node) => {
    const element = node as HTMLElement;
    const rect = element.getBoundingClientRect?.();
    const placeholder = document.createElement("div");
    placeholder.setAttribute("data-held-media-placeholder", "true");
    placeholder.style.width = rect?.width ? `${Math.max(1, Math.round(rect.width))}px` : "100%";
    placeholder.style.height = rect?.height ? `${Math.max(1, Math.round(rect.height))}px` : "100%";
    placeholder.style.background = "#050505";
    placeholder.style.borderRadius = getComputedStyle(element).borderRadius || "0";
    element.replaceWith(placeholder);
  });
  const html = clone.innerHTML;
  if (!html || html.length < 80 || html.includes("data-route-placeholder=\"true\"")) return;
  lastStableSnapshot = {
    html,
    path,
    scrollY: window.scrollY || 0,
    capturedAt: Date.now(),
  };
}

function ensureVisualHold() {
  if (typeof document === "undefined") return null;
  if (visualHoldEl?.isConnected) return visualHoldEl;
  visualHoldEl = document.createElement("div");
  visualHoldEl.setAttribute("data-route-visual-hold", "true");
  visualHoldEl.setAttribute("aria-hidden", "true");
  visualHoldEl.style.position = "fixed";
  visualHoldEl.style.inset = "0";
  visualHoldEl.style.zIndex = "2147483000";
  visualHoldEl.style.overflow = "hidden";
  visualHoldEl.style.pointerEvents = "none";
  visualHoldEl.style.background = "transparent";
  visualHoldEl.style.contain = "paint";
  visualHoldEl.style.opacity = "0";
  visualHoldEl.style.transition = "opacity 80ms linear";
  document.body.appendChild(visualHoldEl);
  return visualHoldEl;
}

function hideVisualHold() {
  if (hideTimer) window.clearTimeout(hideTimer);
  const el = visualHoldEl;
  if (!el) return;
  el.style.opacity = "0";
  document.body.removeAttribute("data-route-visual-hold-active");
  hideTimer = window.setTimeout(() => {
    if (!visualHoldEl) return;
    visualHoldEl.replaceChildren();
    visualHoldEl.remove();
    visualHoldEl = null;
  }, 100);
}

function showVisualHold(previousPath: string | null, nextPath: string) {
  if (!lastStableSnapshot) return;
  if (isMediaPath(previousPath || "") || isMediaPath(nextPath)) return;
  const el = ensureVisualHold();
  if (!el) return;
  if (hideTimer) window.clearTimeout(hideTimer);
  el.innerHTML = lastStableSnapshot.html;
  el.style.opacity = "1";
  document.body.setAttribute("data-route-visual-hold-active", "true");
}

export const BlankScreenGuard = memo(() => {
  const location = useLocation();
  const previousPathRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const previousPath = previousPathRef.current;
    const nextPath = location.pathname;
    previousPathRef.current = nextPath;

    if (previousPath && previousPath !== nextPath) {
      showVisualHold(previousPath, nextPath);
    }

    let cancelled = false;
    let raf = 0;
    const startedAt = performance.now();

    const waitForRealPaint = () => {
      if (cancelled) return;
      const root = getRoot();
      const ready = root ? hasMeaningfulSurface(root) : false;
      const hasPlaceholder = Boolean(root?.querySelector("[data-route-placeholder='true']"));
      if (ready && !hasPlaceholder) {
        rememberStableSnapshot(nextPath);
        window.setTimeout(hideVisualHold, 90);
        return;
      }
      if (performance.now() - startedAt > 12_000) {
        hideVisualHold();
        return;
      }
      raf = window.requestAnimationFrame(waitForRealPaint);
    };

    raf = window.requestAnimationFrame(waitForRealPaint);
    return () => {
      cancelled = true;
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [location.pathname]);

  useEffect(() => {
    rememberStableSnapshot(location.pathname);
    const root = getRoot();
    if (!root) return;
    let raf = 0;
    let pollRaf = 0;
    let polling = false;

    const waitForRealSurface = () => {
      if (polling) return;
      polling = true;
      const startedAt = performance.now();

      const poll = () => {
        const currentRoot = getRoot();
        const ready = currentRoot ? hasMeaningfulSurface(currentRoot) : false;
        const hasPlaceholder = Boolean(currentRoot?.querySelector("[data-route-placeholder='true']"));
        if (ready && !hasPlaceholder) {
          rememberStableSnapshot(location.pathname);
          window.setTimeout(hideVisualHold, 70);
          polling = false;
          pollRaf = 0;
          return;
        }
        if (performance.now() - startedAt > 12_000) {
          hideVisualHold();
          polling = false;
          pollRaf = 0;
          return;
        }
        pollRaf = window.requestAnimationFrame(poll);
      };

      pollRaf = window.requestAnimationFrame(poll);
    };

    const scheduleRemember = () => {
      if (raf) window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => {
        const currentRoot = getRoot();
        const ready = currentRoot ? hasMeaningfulSurface(currentRoot) : false;
        const hasPlaceholder = Boolean(currentRoot?.querySelector("[data-route-placeholder='true']"));
        if ((!ready || hasPlaceholder) && lastStableSnapshot && !isMediaPath(location.pathname)) {
          showVisualHold(location.pathname, location.pathname);
          waitForRealSurface();
          return;
        }
        if (ready && !hasPlaceholder) {
          rememberStableSnapshot(location.pathname);
          if (visualHoldEl) window.setTimeout(hideVisualHold, 70);
        }
      });
    };
    const observer = new MutationObserver(scheduleRemember);
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "data-page", "data-page-root", "data-route-placeholder"] });
    window.addEventListener("scroll", scheduleRemember, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", scheduleRemember);
      if (raf) window.cancelAnimationFrame(raf);
      if (pollRaf) window.cancelAnimationFrame(pollRaf);
    };
  }, [location.pathname]);

  return null;
});

BlankScreenGuard.displayName = "BlankScreenGuard";

export default BlankScreenGuard;