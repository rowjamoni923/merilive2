/**
 * Pillar 3 — Global image performance defaults.
 *
 * Walks every `<img>` in the DOM (existing + future) and applies the
 * Android-app-grade defaults that almost every call-site forgot:
 *
 *   - `loading="lazy"`   → off-screen images skip network + decode
 *   - `decoding="async"` → decode happens off the main thread, so big
 *                          PNG/JPEG/WebP never blocks scrolling
 *
 * Opt out by setting `data-eager="true"` (LCP images, splash, hero)
 * or by giving the img its own `loading`/`decoding`/`fetchpriority`
 * attribute before mount.
 *
 * One delegated MutationObserver — zero per-call-site change.
 */
import { useEffect } from "react";

const EAGER_ATTR = "data-eager";

function apply(img: HTMLImageElement) {
  if (img.dataset.nativeImgApplied === "1") return;
  if (img.getAttribute(EAGER_ATTR) === "true") {
    img.dataset.nativeImgApplied = "1";
    return;
  }
  // Respect explicit author choices.
  if (!img.hasAttribute("loading")) img.setAttribute("loading", "lazy");
  if (!img.hasAttribute("decoding")) img.setAttribute("decoding", "async");
  img.dataset.nativeImgApplied = "1";
}

function walk(root: ParentNode) {
  if (root instanceof HTMLImageElement) {
    apply(root);
    return;
  }
  const imgs = (root as Element).querySelectorAll?.("img");
  imgs?.forEach((el) => apply(el as HTMLImageElement));
}

export function useGlobalImageDefaults() {
  useEffect(() => {
    if (typeof document === "undefined") return;

    walk(document.body);

    const obs = new MutationObserver((records) => {
      for (const rec of records) {
        rec.addedNodes.forEach((node) => {
          if (node.nodeType === 1) walk(node as Element);
        });
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });

    return () => obs.disconnect();
  }, []);
}
