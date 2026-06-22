import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

const BLANK_GUARD_DELAY_MS = 160;
const SNAPSHOT_ATTR = "data-real-screen-retention";

const isVisibleElement = (element: Element) => {
  const rect = element.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return false;
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > 0.02;
};

const hasMeaningfulRouteSurface = () => {
  const selectors = [
    "[data-page]:not([data-page-root='instant-ready-shell'])",
    "[data-page-root]:not([data-page-root='instant-ready-shell'])",
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
    .filter((el) => !el.closest(`[data-blank-screen-guard], [${SNAPSHOT_ATTR}], [data-page-root='instant-ready-shell']`));

  if (elements.some(isVisibleElement)) return true;

  const root = document.getElementById("root");
  if (!root) return false;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || parent.closest(`[data-blank-screen-guard], [${SNAPSHOT_ATTR}], [data-page-root='instant-ready-shell'], script, style`)) {
        return NodeFilter.FILTER_REJECT;
      }
      return (node.textContent || "").trim().length > 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  return !!walker.nextNode();
};

const captureRealScreen = () => {
  const root = document.getElementById("root");
  if (!root || !hasMeaningfulRouteSurface()) return null;
  const clone = root.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(`[data-blank-screen-guard], [${SNAPSHOT_ATTR}], script, style`).forEach((el) => el.remove());
  return clone.innerHTML.trim() || null;
};

export const BlankScreenGuard = memo(() => {
  const location = useLocation();
  const [visible, setVisible] = useState(false);
  const [snapshotHtml, setSnapshotHtml] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const visibleRef = useRef(false);
  const snapshotRef = useRef<string | null>(null);

  const setGuardVisible = (next: boolean) => {
    visibleRef.current = next;
    setVisible(next);
  };

  const refreshSnapshot = () => {
    if (visibleRef.current) return;
    const html = captureRealScreen();
    if (html) {
      snapshotRef.current = html;
      setSnapshotHtml(html);
    }
  };

  useLayoutEffect(() => {
    if (snapshotRef.current && !hasMeaningfulRouteSurface()) {
      setGuardVisible(true);
    }
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (hasMeaningfulRouteSurface()) {
      setGuardVisible(false);
      refreshSnapshot();
    }

    if (timerRef.current) window.clearTimeout(timerRef.current);

    const armBlankCheck = () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        if (!hasMeaningfulRouteSurface() && snapshotRef.current) setGuardVisible(true);
      }, BLANK_GUARD_DELAY_MS);
    };

    armBlankCheck();

    const observer = new MutationObserver(() => {
      if (hasMeaningfulRouteSurface()) {
        if (timerRef.current) window.clearTimeout(timerRef.current);
        if (visibleRef.current) setGuardVisible(false);
        refreshSnapshot();
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

  if (!visible || !snapshotHtml) return null;

  return (
    <div
      data-blank-screen-guard
      {...{ [SNAPSHOT_ATTR]: "true" }}
      className="fixed inset-0 z-[2147483000] overflow-hidden pointer-events-none"
      aria-hidden="true"
      {...({ inert: "" } as Record<string, string>)}
      dangerouslySetInnerHTML={{ __html: snapshotHtml }}
    />
  );
});

BlankScreenGuard.displayName = "BlankScreenGuard";

export default BlankScreenGuard;