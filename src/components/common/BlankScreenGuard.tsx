import { memo, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

const BLANK_GUARD_DELAY_MS = 160;

const isVisibleElement = (element: Element) => {
  const rect = element.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return false;
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > 0.02;
};

const hasMeaningfulRouteSurface = () => {
  const selectors = [
    "[data-page]",
    "[data-page-root]",
    "main",
    "header",
    "nav",
    "button",
    "input",
    "textarea",
    "video",
    "img",
    "[role='dialog']",
    "[aria-busy='true']",
  ].join(",");

  const elements = Array.from(document.querySelectorAll(selectors))
    .filter((el) => !el.closest("[data-blank-screen-guard]"));

  if (elements.some(isVisibleElement)) return true;

  const root = document.getElementById("root");
  const visibleText = (root?.innerText || "").trim();
  return visibleText.length > 0;
};

const getSurfaceKind = (pathname: string) => {
  if (pathname.startsWith("/auth") || pathname.startsWith("/reset-password")) return "auth";
  if (
    pathname.startsWith("/live") ||
    pathname.startsWith("/party") ||
    pathname === "/go-live" ||
    pathname === "/live-session" ||
    pathname.startsWith("/call") ||
    pathname.startsWith("/active-call") ||
    pathname.startsWith("/incoming-call") ||
    pathname.startsWith("/outgoing-call") ||
    pathname.startsWith("/stream")
  ) return "live";
  return "app";
};

const GuardFallback = memo(({ kind }: { kind: "auth" | "live" | "app" }) => {
  if (kind === "auth") {
    return (
      <div data-blank-screen-guard className="fixed inset-0 z-[2147483000] overflow-hidden bg-background" aria-hidden="true">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/25 via-background to-accent/20" />
        <div className="relative z-10 flex min-h-screen flex-col justify-end px-5 pb-8 pt-4">
          <div className="mb-4 h-14 w-14 rounded-full bg-primary/20 skeleton" />
          <div className="mb-3 h-7 w-40 rounded skeleton" />
          <div className="mb-8 h-4 w-56 rounded skeleton" />
          <div className="space-y-3">
            <div className="h-14 rounded-2xl skeleton" />
            <div className="h-12 rounded-2xl skeleton" />
          </div>
        </div>
      </div>
    );
  }

  if (kind === "live") {
    return (
      <div data-blank-screen-guard className="fixed inset-0 z-[2147483000] blank-guard-live" aria-hidden="true">
        <div className="absolute inset-0 blank-guard-live-pulse" />
        <div className="absolute left-4 right-4 top-safe pt-4 flex items-center gap-3">
          <div className="h-11 w-11 rounded-full blank-guard-live-block" />
          <div className="space-y-2">
            <div className="h-3 w-28 rounded blank-guard-live-block" />
            <div className="h-3 w-16 rounded blank-guard-live-block" />
          </div>
        </div>
        <div className="absolute bottom-safe left-4 right-4 pb-5 space-y-3">
          <div className="h-10 rounded-full blank-guard-live-block" />
          <div className="flex justify-between">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-11 w-11 rounded-full blank-guard-live-block" />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div data-blank-screen-guard className="fixed inset-0 z-[2147483000] blank-guard-app px-4 pb-24 pt-safe" aria-hidden="true">
      <div className="mx-auto max-w-md space-y-4 pt-4">
        <div className="flex items-center justify-between">
          <div className="h-8 w-32 rounded skl-block" />
          <div className="h-10 w-10 rounded-full skl-block" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="h-40 rounded-2xl skl-block" />
          <div className="h-40 rounded-2xl skl-block" />
        </div>
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-20 rounded-2xl skl-block-soft" />)}
        </div>
      </div>
    </div>
  );
});

GuardFallback.displayName = "GuardFallback";

export const BlankScreenGuard = memo(() => {
  const location = useLocation();
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<number | null>(null);
  const visibleRef = useRef(false);

  const setGuardVisible = (next: boolean) => {
    visibleRef.current = next;
    setVisible(next);
  };

  useEffect(() => {
    setGuardVisible(false);

    if (timerRef.current) window.clearTimeout(timerRef.current);

    const armBlankCheck = () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        if (!hasMeaningfulRouteSurface()) setGuardVisible(true);
      }, BLANK_GUARD_DELAY_MS);
    };

    armBlankCheck();

    const observer = new MutationObserver(() => {
      if (hasMeaningfulRouteSurface()) {
        if (timerRef.current) window.clearTimeout(timerRef.current);
        if (visibleRef.current) setGuardVisible(false);
        return;
      }
      if (!visibleRef.current) armBlankCheck();
    });

    const root = document.getElementById("root");
    if (root) observer.observe(root, { childList: true, subtree: true, attributes: true, characterData: true });

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      observer.disconnect();
    };
  }, [location.pathname, location.search]);

  return visible ? <GuardFallback kind={getSurfaceKind(location.pathname)} /> : null;
});

BlankScreenGuard.displayName = "BlankScreenGuard";

export default BlankScreenGuard;