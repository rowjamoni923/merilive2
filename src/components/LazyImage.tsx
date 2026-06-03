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
}

/**
 * Eager image loader. Formerly viewport-gated via IntersectionObserver, but
 * per user mandate ("no image loads in pieces, everything instant") we now
 * load the real src immediately. API preserved so callers compile unchanged.
 */
export const LazyImage = ({
  src,
  alt,
  placeholder,
  wrapperClassName: _wrapperClassName,
  className,
  rootMargin: _rootMargin,
  onError,
  onLoad,
  ...rest
}: LazyImageProps) => {
  const [errored, setErrored] = useState(false);
  const normalizedSrc = useMemo(() => normalizePublicMediaUrl(src), [src]);
  const normalizedPlaceholder = useMemo(() => normalizePublicMediaUrl(placeholder), [placeholder]);
  const showSrc = !errored ? normalizedSrc : normalizedPlaceholder;

  return (
    <img loading="lazy" decoding="async"
      {...rest}
      src={showSrc || placeholder || undefined}
      alt={alt}
      {...({ fetchpriority: "high" } as ImgHTMLAttributes<HTMLImageElement>)}
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
