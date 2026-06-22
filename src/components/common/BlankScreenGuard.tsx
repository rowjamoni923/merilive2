import { memo, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { PageSkeleton } from "@/components/common/PageSkeleton";

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
      <div
        data-blank-screen-guard
        className="fixed inset-0 z-[2147483000]"
        style={{ backgroundColor: '#050208' }}
        aria-hidden="true"
      />
    );
  }
  if (kind === "auth") {
    return (
      <div
        data-blank-screen-guard
        className="fixed inset-0 z-[2147483000]"
        style={{ background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 42%, #24243e 72%, #0f0c29 100%)' }}
        aria-hidden="true"
      />
    );
  }
  return (
    <div data-blank-screen-guard className="fixed inset-0 z-[2147483000]" aria-hidden="true">
      <PageSkeleton className="min-h-screen bg-background" rows={5} tabs hero />
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