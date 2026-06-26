import { memo, ReactNode, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Routes, useLocation } from "react-router-dom";
import type { Location } from "react-router-dom";

type RouteStageStatus = "current" | "pending";

type RouteStage = {
  id: string;
  location: Location;
  status: RouteStageStatus;
};

type StableRoutesProps = {
  children: ReactNode;
};

const routeStageId = (location: Location) =>
  `${location.key || "default"}:${location.pathname}${location.search}${location.hash}`;

const CONTENT_SELECTOR = [
  "[data-page]:not([data-route-placeholder='true'])",
  "[data-page-root]:not([data-route-placeholder='true'])",
  "main:not([data-route-placeholder='true'])",
  "[role='main']:not([data-route-placeholder='true'])",
  ".mobile-page",
  ".profile-home-shell",
  "video",
  "canvas",
  "img",
  "button",
  "a[href]",
  "input",
  "textarea",
  "[role='button']",
].join(",");

function hasRealRouteSurface(container: HTMLElement | null) {
  if (!container) return false;
  if (container.querySelector("[data-route-placeholder='true']") && !container.querySelector(CONTENT_SELECTOR)) {
    return false;
  }

  const text = container.textContent?.replace(/\s+/g, " ").trim() ?? "";
  if (text.length > 2) return true;

  return Array.from(container.querySelectorAll<HTMLElement>(CONTENT_SELECTOR)).some((node) => {
    if (node.closest("[data-route-placeholder='true']")) return false;
    if (node.tagName === "VIDEO") return true;
    const rect = node.getBoundingClientRect();
    return rect.width > 1 && rect.height > 1;
  });
}

function PendingReadyProbe({ rootRef, onReady }: { rootRef: React.RefObject<HTMLDivElement>; onReady: () => void }) {
  useLayoutEffect(() => {
    let done = false;
    let raf = 0;
    let timeout = 0;
    let observer: MutationObserver | null = null;

    const finish = () => {
      if (done) return;
      done = true;
      if (raf) window.cancelAnimationFrame(raf);
      if (timeout) window.clearTimeout(timeout);
      observer?.disconnect();
      onReady();
    };

    const check = () => {
      if (done) return;
      raf = window.requestAnimationFrame(() => {
        if (hasRealRouteSurface(rootRef.current)) finish();
      });
    };

    check();
    if (rootRef.current) {
      observer = new MutationObserver(check);
      observer.observe(rootRef.current, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "style", "data-page", "data-page-root", "data-route-placeholder"],
      });
    }

    // If a legitimate empty page exists, do not trap navigation forever. This
    // still keeps the previous real screen during the preparation window and
    // never paints a loading/snapshot cover.
    timeout = window.setTimeout(finish, 8000);

    return () => {
      done = true;
      if (raf) window.cancelAnimationFrame(raf);
      if (timeout) window.clearTimeout(timeout);
      observer?.disconnect();
    };
  }, [onReady, rootRef]);

  return null;
}

function RouteStageSurface({
  stage,
  children,
  onPendingReady,
}: {
  stage: RouteStage;
  children: ReactNode;
  onPendingReady: (id: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const isCurrent = stage.status === "current";
  const ready = useMemo(() => () => onPendingReady(stage.id), [onPendingReady, stage.id]);

  return (
    <div
      ref={rootRef}
      data-stable-route-stage={stage.status}
      aria-hidden={!isCurrent}
      inert={!isCurrent ? "" : undefined}
      style={
        isCurrent
          ? {
              position: "relative",
              zIndex: 1,
              minHeight: "100%",
              opacity: 1,
            }
          : {
              position: "fixed",
              inset: 0,
              zIndex: 0,
              minHeight: "100%",
              overflow: "hidden",
              opacity: 0,
              pointerEvents: "none",
              contain: "paint",
            }
      }
    >
      <Suspense fallback={null}>
        <Routes location={stage.location}>{children}</Routes>
        {!isCurrent && <PendingReadyProbe rootRef={rootRef} onReady={ready} />}
      </Suspense>
    </div>
  );
}

/**
 * Keeps the real previous route mounted while the next route prepares.
 *
 * This is intentionally not a loading screen, DOM clone, screenshot, or visual
 * cover. The previous page remains the actual interactive React tree. The next
 * page mounts hidden, resolves lazy chunks/data placeholders, then that same
 * mounted tree is promoted to visible so live/party/private-call camera preview
 * surfaces do not go through an off→on route gap.
 */
export const StableRoutes = memo(({ children }: StableRoutesProps) => {
  const location = useLocation();
  const nextId = routeStageId(location);
  const [stages, setStages] = useState<RouteStage[]>(() => [
    { id: nextId, location, status: "current" },
  ]);

  useEffect(() => {
    setStages((prev) => {
      const current = prev.find((stage) => stage.status === "current") ?? prev[0];
      if (current?.id === nextId) {
        return prev.filter((stage) => stage.status === "current");
      }
      return [
        current,
        { id: nextId, location, status: "pending" },
      ].filter(Boolean) as RouteStage[];
    });
  }, [location, nextId]);

  const promotePending = useMemo(
    () => (id: string) => {
      setStages((prev) => {
        const pending = prev.find((stage) => stage.id === id && stage.status === "pending");
        if (!pending) return prev;
        return [{ ...pending, status: "current" }];
      });
    },
    [],
  );

  return (
    <>
      {stages.map((stage) => (
        <RouteStageSurface key={stage.id} stage={stage} onPendingReady={promotePending}>
          {children}
        </RouteStageSurface>
      ))}
    </>
  );
});

StableRoutes.displayName = "StableRoutes";

export default StableRoutes;