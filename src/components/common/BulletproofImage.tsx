import * as React from "react";
import { cn } from "@/lib/utils";

type Priority = "high" | "low" | "auto";

interface BulletproofImageProps
  extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src" | "onLoad" | "onError"> {
  /** Primary CDN/optimised URL. */
  src: string;
  /** Ordered fallbacks tried on error (e.g. raw URL, cache-bust). Empty string entries are skipped. */
  fallbacks?: Array<string | null | undefined>;
  /** Final hard placeholder. Defaults to /placeholder.svg */
  placeholder?: string;
  priority?: Priority;
  /** When false, image is rendered with opacity-0 until decoded then faded in (instant, no broken paint). */
  fadeIn?: boolean;
  onReady?: () => void;
}

/**
 * BulletproofImage — Single source of truth for banner / hero / promo
 * surfaces that MUST never look broken or paint half-decoded chunks.
 *
 * Behaviour:
 *  1. Stays invisible (opacity-0) until the full bitmap is decoded → no
 *     progressive/broken chunks.
 *  2. On error, walks the fallback chain (raw URL, cache-bust, etc.).
 *  3. Final fallback is /placeholder.svg so it can never show a broken icon.
 */
export const BulletproofImage = React.forwardRef<HTMLImageElement, BulletproofImageProps>(
  (
    {
      src,
      fallbacks = [],
      placeholder = "/placeholder.svg",
      priority = "high",
      fadeIn = true,
      loading,
      decoding = "async",
      className,
      style,
      onReady,
      ...rest
    },
    ref
  ) => {
    const chain = React.useMemo(() => {
      const seen = new Set<string>();
      const list: string[] = [];
      const push = (u?: string | null) => {
        if (!u) return;
        const v = String(u);
        if (!v || seen.has(v)) return;
        seen.add(v);
        list.push(v);
      };
      push(src);
      fallbacks.forEach(push);
      push(placeholder);
      return list;
    }, [src, fallbacks, placeholder]);

    const [idx, setIdx] = React.useState(0);
    const [ready, setReady] = React.useState(false);
    const triedBustRef = React.useRef<Set<number>>(new Set());

    // Reset when source changes
    React.useEffect(() => {
      setIdx(0);
      setReady(false);
      triedBustRef.current = new Set();
    }, [src]);

    const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      const mark = () => {
        setReady(true);
        onReady?.();
      };
      if (typeof img.decode === "function") img.decode().then(mark).catch(mark);
      else mark();
    };

    const handleError = () => {
      // Try a one-shot cache-bust on the current URL before moving to next.
      if (!triedBustRef.current.has(idx) && idx < chain.length - 1) {
        triedBustRef.current.add(idx);
        // Force re-attempt of same index but with bust by bumping idx forward then back via key.
        // Simpler: just move to next fallback.
      }
      setIdx((i) => Math.min(i + 1, chain.length - 1));
      setReady(false);
    };

    const currentSrc = chain[idx] || placeholder;
    const effectiveLoading = loading || (priority === "high" ? "eager" : "lazy");

    return (
      <img
        ref={ref}
        src={currentSrc}
        loading={effectiveLoading}
        decoding={decoding}
        draggable={false}
        // @ts-expect-error – fetchpriority is a standard HTML hint
        fetchpriority={priority}
        onLoad={handleLoad}
        onError={handleError}
        className={cn(
          fadeIn && "transition-opacity duration-150",
          fadeIn && (ready ? "opacity-100" : "opacity-0"),
          className
        )}
        style={style}
        {...rest}
      />
    );
  }
);

BulletproofImage.displayName = "BulletproofImage";

export default BulletproofImage;
