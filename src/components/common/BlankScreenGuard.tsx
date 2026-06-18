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
  if (pathname.startsWith("/live") || pathname.startsWith("/party") || pathname.startsWith("/call")) return "live";
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
      <div data-blank-screen-guard className="fixed inset-0 z-[2147483000] bg-background" aria-hidden="true">
        <div className="absolute inset-0 bg-muted/50 skeleton" />
        <div className="absolute left-4 right-4 top-safe pt-4 flex items-center gap-3">
          <div className="h-11 w-11 rounded-full skeleton" />
          <div className="space-y-2">
            <div className="h-3 w-28 rounded skeleton" />
            <div className="h-3 w-16 rounded skeleton" />
          </div>
        </div>
        <div className="absolute bottom-safe left-4 right-4 pb-5 space-y-3">
          <div className="h-10 rounded-full skeleton" />
          <div className="flex justify-between">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-11 w-11 rounded-full skeleton" />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div data-blank-screen-guard className="fixed inset-0 z-[2147483000] bg-background px-4 pb-24 pt-safe" aria-hidden="true">
      <div className="mx-auto max-w-md space-y-4 pt-4">
        <div className="flex items-center justify-between">
          <div className="h-8 w-32 rounded skeleton" />
          <div className="h-10 w-10 rounded-full skeleton" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="h-40 rounded-2xl skeleton" />
          <div className="h-40 rounded-2xl skeleton" />
        </div>
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-20 rounded-2xl skeleton" />)}
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

    const check = () => {
      if (hasMeaningfulRouteSurface()) {
        setGuardVisible(false);
      } else {
        setGuardVisible(true);
      }
    };

    timerRef.current = window.setTimeout(check, BLANK_GUARD_DELAY_MS);

    const observer = new MutationObserver(() => {
      if (visibleRef.current && hasMeaningfulRouteSurface()) setGuardVisible(false);
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