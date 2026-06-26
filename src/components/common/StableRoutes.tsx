import { memo, Suspense, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
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


function PendingReadyProbe({ rootRef, onReady }: { rootRef: RefObject<HTMLDivElement | null>; onReady: () => void }) {
  useLayoutEffect(() => {
    // Promote the pending stage on the very next animation frame so taps feel
    // instant (Chamet/TikTok-class). The previous route stays mounted for that
    // single frame so persistent surfaces (camera, video) can hand off without
    // an off→on gap, but the user perceives zero delay between tap and the
    // destination becoming interactive.
    void rootRef;
    const raf = window.requestAnimationFrame(() => onReady());
    return () => window.cancelAnimationFrame(raf);
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
      {...(!isCurrent ? ({ inert: "" } as Record<string, string>) : {})}
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

  useLayoutEffect(() => {
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