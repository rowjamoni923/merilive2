/**
 * Pkg434 — Pass 5: Native-feel image with lazy decode + fade-in.
 *
 * Drop-in <img> replacement that:
 *   - decoding="async" + loading="lazy" by default
 *   - awaits img.decode() then flips opacity 0 → 1 via .fade-in-on-load CSS
 *   - never throws (decode errors silently mark as loaded)
 *
 * Use anywhere you currently render <img src=...>. Forwards all native props.
 */
import { forwardRef, useEffect, useRef, useState, type ImgHTMLAttributes } from "react";

type Props = ImgHTMLAttributes<HTMLImageElement> & {
  src: string;
  alt: string;
};

export const NativeImg = forwardRef<HTMLImageElement, Props>(function NativeImg(
  { src, alt, className = "", onLoad, onError, ...rest },
  forwardedRef
) {
  const innerRef = useRef<HTMLImageElement | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
    const el = innerRef.current;
    if (!el) return;
    // If cached / already complete, skip the fade.
    if (el.complete && el.naturalWidth > 0) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    el.decode?.()
      .then(() => {
        if (!cancelled) setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [src]);

  const setRefs = (el: HTMLImageElement | null) => {
    innerRef.current = el;
    if (typeof forwardedRef === "function") forwardedRef(el);
    else if (forwardedRef) (forwardedRef as React.MutableRefObject<HTMLImageElement | null>).current = el;
  };

  return (
    <img
      ref={setRefs}
      src={src}
      alt={alt}
      loading={rest.loading ?? "lazy"}
      decoding={rest.decoding ?? "async"}
      data-loaded={loaded ? "true" : "false"}
      className={`fade-in-on-load ${loaded ? "is-loaded" : ""} ${className}`.trim()}
      onLoad={(e) => {
        setLoaded(true);
        onLoad?.(e);
      }}
      onError={(e) => {
        setLoaded(true);
        onError?.(e);
      }}
      {...rest}
    />
  );
});
