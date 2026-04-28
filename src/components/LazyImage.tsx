import { useEffect, useRef, useState, ImgHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface LazyImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "loading"> {
  src: string;
  alt: string;
  /** Optional placeholder shown until the image enters viewport / finishes loading */
  placeholder?: string;
  /** Wrapper className (the <img> itself uses className passthrough) */
  wrapperClassName?: string;
  /** Distance in px before the viewport at which to start loading. Default 200px. */
  rootMargin?: string;
}

/**
 * Viewport-aware lazy image.
 * - Uses native loading="lazy" + IntersectionObserver as a fallback.
 * - Only sets the real `src` when the placeholder is near the viewport,
 *   so admin grids with hundreds of avatars/SVGs don't pay the network cost
 *   until the user actually scrolls them in.
 */
export const LazyImage = ({
  src,
  alt,
  placeholder,
  wrapperClassName,
  className,
  rootMargin = "200px",
  onError,
  onLoad,
  ...rest
}: LazyImageProps) => {
  const ref = useRef<HTMLImageElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    if (visible) return;
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true);
            io.disconnect();
          }
        });
      },
      { rootMargin, threshold: 0.01 }
    );
    io.observe(node);
    return () => io.disconnect();
  }, [visible, rootMargin]);

  const showSrc = visible && !errored ? src : placeholder;

  return (
    <img
      {...rest}
      ref={ref}
      src={showSrc || placeholder || undefined}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={cn(
        "transition-opacity duration-300",
        loaded ? "opacity-100" : "opacity-60",
        className
      )}
      onLoad={(e) => {
        setLoaded(true);
        onLoad?.(e);
      }}
      onError={(e) => {
        setErrored(true);
        onError?.(e);
      }}
    />
  );
};

export default LazyImage;
