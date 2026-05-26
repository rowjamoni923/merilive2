import * as React from "react";
import { normalizePublicMediaUrl, toSupabaseCdnUrl, type CdnImageOptions } from "@/lib/cdnImage";
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
  /** "contain" | "cover" | "fill" (default contain). */
  resize?: CdnImageOptions["resize"];
  /** Eager-load (above the fold). Default lazy. */
  eager?: boolean;
  /** Fallback src on error. */
  fallbackSrc?: string;
  /** Admin-only fallback bucket for raw private storage paths. */
  adminBucket?: string;
}

/**
 * SmartImage — drop-in <img> replacement for dynamic Supabase Storage URLs.
 *
 * - Auto-rewrites `…/object/public/<bucket>/<path>` → Supabase Image Transform
 *   (`/render/image/public/<bucket>/<path>?width=&quality=&resize=contain`)
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
      quality = 88,
      resize = "contain",
      eager = true,
      fallbackSrc,
      adminBucket = "payment-screenshots",
      fetchPriority: _fetchPriority,
      onError,
      className,
      ...rest
    },
    ref
  ) => {
    const baseSrc = React.useMemo(() => {
      if (!src) return undefined;
      // Pass-through: transform endpoint disabled to prevent double-request
      // flicker on Pro plan / transforms-off. Original URL loads in one shot.
      return toSupabaseCdnUrl(normalizePublicMediaUrl(src), { width: cdnWidth, height: cdnHeight, quality, resize });
    }, [src, cdnWidth, cdnHeight, quality, resize]);
    const [displaySrc, setDisplaySrc] = React.useState<string | undefined>(baseSrc);

    React.useEffect(() => {
      let cancelled = false;
      setDisplaySrc(baseSrc);
      if (!src || typeof window === "undefined" || !window.location.pathname.startsWith("/admin")) return;
      import("@/utils/adminStorageImages").then((m) => {
        if (cancelled) return;
        const sync = m.tryResolvePublicAdminStorageUrlSync(src, adminBucket);
        if (sync) setDisplaySrc(sync);
        if (m.isPrivateAdminStorageReference(src, adminBucket) && !sync) setDisplaySrc(fallbackSrc || undefined);
        return m.resolveAdminStorageImageUrl(src, adminBucket).then((resolved) => {
          if (!cancelled && resolved) setDisplaySrc(resolved);
        });
      }).catch(() => {});
      return () => { cancelled = true; };
    }, [src, baseSrc, fallbackSrc, adminBucket]);

    const handleError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
      if (fallbackSrc && (e.currentTarget as HTMLImageElement).src !== fallbackSrc) {
        (e.currentTarget as HTMLImageElement).src = fallbackSrc;
        return;
      }
      onError?.(e);
    };


    if (!displaySrc) {
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
        src={displaySrc}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
          {...({ fetchpriority: eager ? "high" : "auto" } as React.ImgHTMLAttributes<HTMLImageElement>)}
        onError={handleError}
        className={cn(className)}
        {...rest}
      />
    );
  }
);
SmartImage.displayName = "SmartImage";

export default SmartImage;
