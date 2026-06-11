import { ImgHTMLAttributes, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { normalizePublicMediaUrl } from "@/lib/cdnImage";

interface LazyImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "loading"> {
  src: string;
  alt: string;
  placeholder?: string;
  wrapperClassName?: string;
  /** Kept for API compatibility — viewport gating is disabled now. */
  rootMargin?: string;
  /** Force eager + high priority for above-the-fold hero images. Defaults to false. */
  priority?: boolean;
}

/**
 * Image loader. Per user mandate ("no image loads in pieces, everything
 * instant") we no longer gate behind IntersectionObserver. We DO use the
 * browser's native `loading="lazy"` (which only defers far-off-screen images,
 * cheap and standards-based) plus `decoding="async"` so paint is never blocked.
 *
 * Fix vs prior version: previously we set BOTH loading="lazy" AND
 * fetchpriority="high" on every image, which contradicts each other and
 * confuses Chrome's resource scheduler. Now:
 *  - default: native lazy + auto fetchpriority (browser decides)
 *  - priority={true}: eager + high (hero / LCP images)
 */
export const LazyImage = ({
  src,
  alt,
  placeholder,
  wrapperClassName: _wrapperClassName,
  className,
  rootMargin: _rootMargin,
  priority = false,
  onError,
  onLoad,
  ...rest
}: LazyImageProps) => {
  const [errored, setErrored] = useState(false);
  const normalizedSrc = useMemo(() => normalizePublicMediaUrl(src), [src]);
  const normalizedPlaceholder = useMemo(() => normalizePublicMediaUrl(placeholder), [placeholder]);
  const showSrc = !errored ? normalizedSrc : normalizedPlaceholder;

  const priorityAttrs = priority
    ? ({ loading: "eager", fetchpriority: "high" } as ImgHTMLAttributes<HTMLImageElement>)
    : ({ loading: "lazy", fetchpriority: "auto" } as ImgHTMLAttributes<HTMLImageElement>);

  return (
    <img
      decoding="async"
      {...priorityAttrs}
      {...rest}
      src={showSrc || placeholder || undefined}
      alt={alt}
      className={cn(className)}
      onLoad={(e) => onLoad?.(e)}
      onError={(e) => {
        setErrored(true);
        onError?.(e);
      }}
    />
  );
};

export default LazyImage;
