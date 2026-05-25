import * as React from "react";
import { toSupabaseCdnUrl, type CdnImageOptions } from "@/lib/cdnImage";
import { cn } from "@/lib/utils";

export interface SmartImageProps
  extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "loading"> {
  src: string | null | undefined;
  alt: string;
  /** Pass intended rendered width in CSS px so we ask CDN for an appropriately small variant. */
  cdnWidth?: number;
  /** Optional rendered height in CSS px. Omit for proportional resize. */
  cdnHeight?: number;
  /** 20-100 (default 70). */
  quality?: number;
  /** "cover" | "contain" | "fill" (default cover). */
  resize?: CdnImageOptions["resize"];
  /** Eager-load (above the fold). Default lazy. */
  eager?: boolean;
  /** Fallback src on error. */
  fallbackSrc?: string;
}

/**
 * SmartImage — drop-in <img> replacement for dynamic Supabase Storage URLs.
 *
 * - Auto-rewrites `…/object/public/<bucket>/<path>` → Supabase Image Transform
 *   (`/render/image/public/<bucket>/<path>?width=&quality=&resize=cover`)
 *   so a 2MB raw upload becomes a 20-40KB WebP at the requested size.
 * - Falls back to the original URL automatically if transform endpoint errors
 *   (e.g. Supabase Pro plan / image transformations off → 400).
 * - `loading="lazy" decoding="async"` by default; pass `eager` for above-fold.
 * - Non-Supabase URLs (R2, gravatar, data:) pass through unchanged.
 */
export const SmartImage = React.forwardRef<HTMLImageElement, SmartImageProps>(
  (
    {
      src,
      alt,
      cdnWidth,
      cdnHeight,
      quality = 70,
      resize = "cover",
      eager,
      fallbackSrc,
      onError,
      className,
      ...rest
    },
    ref
  ) => {
    const [failed, setFailed] = React.useState(false);

    const dpr =
      typeof window !== "undefined" ? Math.min(2, window.devicePixelRatio || 1) : 2;

    const cdnSrc = React.useMemo(() => {
      if (!src) return undefined;
      if (failed) return src;
      if (!cdnWidth && !cdnHeight) return src; // no size hint = leave alone
      return (
        toSupabaseCdnUrl(src, {
          width: cdnWidth ? Math.round(cdnWidth * dpr) : undefined,
          height: cdnHeight ? Math.round(cdnHeight * dpr) : undefined,
          quality,
          resize,
        }) || src
      );
    }, [src, cdnWidth, cdnHeight, quality, resize, failed, dpr]);

    const handleError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
      // Transform failed → retry with original URL, then with fallback.
      if (!failed && cdnSrc !== src) {
        setFailed(true);
        return;
      }
      if (fallbackSrc && (e.currentTarget as HTMLImageElement).src !== fallbackSrc) {
        (e.currentTarget as HTMLImageElement).src = fallbackSrc;
        return;
      }
      onError?.(e);
    };

    if (!cdnSrc) {
      return fallbackSrc ? (
        <img
          ref={ref}
          src={fallbackSrc}
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          className={className}
          {...rest}
        />
      ) : null;
    }

    return (
      <img
        ref={ref}
        src={cdnSrc}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={eager ? "high" : "auto"}
        onError={handleError}
        className={cn(className)}
        {...rest}
      />
    );
  }
);
SmartImage.displayName = "SmartImage";

export default SmartImage;
