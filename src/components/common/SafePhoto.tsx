import * as React from "react";
import { enhanceThumbnail } from "@/utils/enhanceThumbnail";
import { normalizeProfileMediaUrl } from "@/utils/profileMediaUrl";
import { getPlaceholderAvatar } from "@/utils/placeholderAvatar";

type SafePhotoProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src" | "width" | "height"> & {
  /** Primary source (any URL, possibly empty). */
  src?: string | null;
  /** Used to compute a deterministic placeholder when everything fails. */
  fallbackSeed?: string;
  fallbackGender?: "male" | "female" | null;
  /** Rendered width hint passed to the CDN enhancer. */
  width?: number;
  quality?: number;
  /** Cover/contain hint for the enhanced variant. */
  sharpen?: number;
  /** When true, skip the enhancer and load the raw URL directly. */
  raw?: boolean;
};

/**
 * SafePhoto — drop-in <img> for profile covers, poster slides, banners, and
 * any "must-never-be-broken" photo surface.
 *
 * Bulletproof fallback chain:
 *  1. CDN-enhanced URL (sharp, retina, small)
 *  2. Raw normalized URL (in case the CDN is rate-limited / blocked)
 *  3. Cache-busted retry once (transient flake)
 *  4. Deterministic real-photo placeholder (randomuser.me, gender-aware)
 *  5. Final hard fallback: /placeholder.svg (never shows broken icon)
 */
export const SafePhoto = React.forwardRef<HTMLImageElement, SafePhotoProps>(
  (
    {
      src,
      fallbackSeed,
      fallbackGender = "female",
      width = 600,
      quality = 85,
      sharpen,
      raw = false,
      loading = "eager",
      decoding = "async",
      onError,
      ...rest
    },
    ref
  ) => {
    const normalized = React.useMemo(() => {
      if (!src) return null;
      return normalizeProfileMediaUrl(src) || src;
    }, [src]);

    const enhanced = React.useMemo(() => {
      if (!normalized) return null;
      if (raw) return normalized;
      return enhanceThumbnail(normalized, { width, quality, sharpen });
    }, [normalized, raw, width, quality, sharpen]);

    const placeholder = React.useMemo(() => {
      const seed = fallbackSeed || normalized || "anonymous";
      return getPlaceholderAvatar(seed, fallbackGender ?? "female");
    }, [fallbackSeed, normalized, fallbackGender]);

    const initial = enhanced || normalized || placeholder;

    const handleError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
      const img = e.currentTarget as HTMLImageElement & {
        dataset: { sp1?: string; sp2?: string; sp3?: string };
      };
      // Step 1 → raw normalized URL
      if (normalized && !img.dataset.sp1 && img.src !== normalized) {
        img.dataset.sp1 = "1";
        img.src = normalized;
        return;
      }
      // Step 2 → cache-bust retry once
      if (normalized && !img.dataset.sp2) {
        img.dataset.sp2 = "1";
        const bust = normalized.includes("?") ? "&" : "?";
        img.src = `${normalized}${bust}_r=${Date.now()}`;
        return;
      }
      // Step 3 → gender-aware real-photo placeholder
      if (!img.dataset.sp3 && img.src !== placeholder) {
        img.dataset.sp3 = "1";
        img.src = placeholder;
        return;
      }
      // Step 4 → never broken icon
      if (img.src !== "/placeholder.svg") {
        img.src = "/placeholder.svg";
      }
      onError?.(e);
    };

    return (
      <img
        ref={ref}
        src={initial}
        loading={loading}
        decoding={decoding}
        onError={handleError}
        {...({ fetchpriority: rest.fetchPriority ?? "high" } as React.ImgHTMLAttributes<HTMLImageElement>)}
        {...rest}
      />
    );
  }
);
SafePhoto.displayName = "SafePhoto";

export default SafePhoto;
