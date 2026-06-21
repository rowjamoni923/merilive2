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

// Static painted app chrome — no spinner, no shimmer, no blank/white.
const GuardFallback = memo(({ kind }: { kind: "auth" | "live" | "app" }) => {
  if (kind === "live") {
    return (
      <div data-blank-screen-guard className="fixed inset-0 z-[2147483000]" style={{ backgroundColor: '#050208' }} aria-hidden="true">
        <div className="absolute left-4 right-4 pt-4" style={{ top: 'env(safe-area-inset-top, 0px)' }}>
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-full" style={{ backgroundColor: '#1a1422' }} />
            <div className="space-y-2">
              <div className="h-3 w-28 rounded" style={{ backgroundColor: '#1a1422' }} />
              <div className="h-3 w-16 rounded" style={{ backgroundColor: '#15101c' }} />
            </div>
          </div>
        </div>
        <div className="absolute left-4 right-4 pb-5 space-y-3" style={{ bottom: 'env(safe-area-inset-bottom, 0px)' }}>
          <div className="h-10 rounded-full" style={{ backgroundColor: '#1a1422' }} />
          <div className="flex justify-between">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-11 w-11 rounded-full" style={{ backgroundColor: '#1a1422' }} />
            ))}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div data-blank-screen-guard className="fixed inset-0 z-[2147483000] flex flex-col" style={{ backgroundColor: '#FFFBF2' }} aria-hidden="true">
      <div className="flex items-center px-4 gap-3" style={{ height: 56, backgroundColor: '#F3EBDC', borderBottom: '1px solid #E8DFCC' }}>
        <div className="h-8 w-8 rounded-full" style={{ backgroundColor: '#E2D6BE' }} />
        <div className="h-3.5 w-32 rounded" style={{ backgroundColor: '#E2D6BE' }} />
        <div className="ml-auto h-8 w-8 rounded-full" style={{ backgroundColor: '#E2D6BE' }} />
      </div>
      <div className="flex-1 overflow-hidden px-4 pt-4 space-y-3">
        <div className="h-28 rounded-2xl" style={{ backgroundColor: '#F0E7D2' }} />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-40 rounded-2xl" style={{ backgroundColor: '#F0E7D2' }} />
          <div className="h-40 rounded-2xl" style={{ backgroundColor: '#F0E7D2' }} />
        </div>
        <div className="h-16 rounded-2xl" style={{ backgroundColor: '#F0E7D2' }} />
      </div>
      <div className="flex items-center justify-around px-2" style={{ height: 64, backgroundColor: '#F3EBDC', borderTop: '1px solid #E8DFCC' }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-7 w-7 rounded-lg" style={{ backgroundColor: '#E2D6BE' }} />
        ))}
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