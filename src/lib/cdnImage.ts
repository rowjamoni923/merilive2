/**
 * Supabase Storage Image Transformation helper.
 *
 * Rewrites `…/storage/v1/object/public/<bucket>/<path>` →
 *         `…/storage/v1/render/image/public/<bucket>/<path>?width=…&quality=…&resize=cover`
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
  /** 'cover' (default) | 'contain' | 'fill'. */
  resize?: "cover" | "contain" | "fill";
}

const OBJECT_PUBLIC = "/storage/v1/object/public/";
const RENDER_PUBLIC = "/storage/v1/render/image/public/";

export function toSupabaseCdnUrl(
  url: string | null | undefined,
  opts: CdnImageOptions = {}
): string | undefined {
  if (!url || typeof url !== "string") return url || undefined;
  // Already a transformed / signed render URL, or a data/blob URI — leave alone
  if (
    url.startsWith("data:") ||
    url.startsWith("blob:") ||
    url.includes("/storage/v1/render/image/") ||
    url.includes("/storage/v1/object/sign/")
  ) {
    return url;
  }
  const idx = url.indexOf(OBJECT_PUBLIC);
  if (idx === -1) return url; // not a Supabase public-object URL
  const base = url.slice(0, idx) + RENDER_PUBLIC;
  const rest = url.slice(idx + OBJECT_PUBLIC.length);
  const params = new URLSearchParams();
  const w = opts.width ? Math.max(16, Math.min(2000, Math.round(opts.width))) : undefined;
  const h = opts.height ? Math.max(16, Math.min(2000, Math.round(opts.height))) : undefined;
  const q = Math.max(20, Math.min(100, Math.round(opts.quality ?? 70)));
  if (w) params.set("width", String(w));
  if (h) params.set("height", String(h));
  params.set("quality", String(q));
  params.set("resize", opts.resize ?? "cover");
  // Strip any existing query on the original (rare)
  const cleanRest = rest.split("?")[0];
  return `${base}${cleanRest}?${params.toString()}`;
}

/**
 * Convenience: pick a sensible width based on a CSS px size and devicePixelRatio.
 * Caps at 2x DPR to avoid wasting bandwidth on 3-4x retina phones.
 */
export function cdnAvatar(
  url: string | null | undefined,
  cssSize: number,
  quality = 70
): string | undefined {
  const dpr = typeof window !== "undefined" ? Math.min(2, window.devicePixelRatio || 1) : 2;
  return toSupabaseCdnUrl(url, { width: Math.round(cssSize * dpr), quality });
}
