/**
 * Supabase Storage Image Transformation helper.
 *
 * Rewrites `…/storage/v1/object/public/<bucket>/<path>` →
 *         `…/storage/v1/render/image/public/<bucket>/<path>?width=…&quality=…&resize=contain`
 *
 * Why: a 2-3 MB raw avatar becomes a 10-30 KB WebP at e.g. 96x96, so
 * admin tables with 50+ rows go from 100 MB transfer → ~1 MB.
 *
 * Requires Supabase Pro plan (image transformations). If transform is
 * disabled on the project, the endpoint 400s — callers should fall back
 * to the original URL via <img onError>.
 *
 * Returns the original URL unchanged for:
 *  - non-Supabase URLs (R2, Google, gravatar, data:, etc.)
 *  - already-signed/render URLs
 *  - empty / null / undefined inputs
 */

export interface CdnImageOptions {
  /** Target rendered width in CSS px. Multiply by DPR before calling. */
  width?: number;
  /** Target rendered height in CSS px. Omit for proportional. */
  height?: number;
  /** 20-100, default 70. */
  quality?: number;
  /** 'contain' (default) | 'cover' | 'fill'. */
  resize?: "cover" | "contain" | "fill";
}

const OBJECT_PUBLIC = "/storage/v1/object/public/";
const RENDER_PUBLIC = "/storage/v1/render/image/public/";

export function toSupabaseCdnUrl(
  url: string | null | undefined,
  _opts: CdnImageOptions = {}
): string | undefined {
  // Image-transform endpoint disabled project-wide: it was returning broken /
  // partial WebP frames (visible "piece by piece" decode) and the onError
  // fallback to the original URL caused a second request + visible flicker.
  // Serving the original public URL is faster end-to-end because the asset
  // is already cached at the Supabase edge after first hit.
  if (!url || typeof url !== "string") return url || undefined;
  return url;
}


/**
 * Convenience: pick a sensible width based on a CSS px size and devicePixelRatio.
 * Caps at 2x DPR to avoid wasting bandwidth on 3-4x retina phones.
 */
export function cdnAvatar(
  url: string | null | undefined,
  cssSize: number,
  quality = 88
): string | undefined {
  const dpr = typeof window !== "undefined" ? Math.min(2, window.devicePixelRatio || 1) : 2;
  return toSupabaseCdnUrl(url, { width: Math.round(cssSize * dpr), quality, resize: "contain" });
}
