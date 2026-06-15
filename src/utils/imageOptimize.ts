/**
 * Image optimization helpers.
 *
 * Supabase Storage exposes an on-the-fly image transformation endpoint
 * at `/storage/v1/render/image/public/...` that can resize, recompress
 * and convert images to WebP without us having to re-upload anything.
 *
 * Reference: https://supabase.com/docs/guides/storage/serving/image-transformations
 *
 * We use this to keep game logos (and similar thumbnails) tiny on the
 * wire. Original PNGs in the bucket can be 1-2 MB; rendered at 256px
 * width with WebP they drop to ~20-40 KB — which is what professional
 * live-streaming apps (Bigo / Chamet / Olamet) ship.
 */

export interface OptimizeOpts {
  /** Target rendered width in CSS pixels. Height auto-scales. */
  width?: number;
  /** Target rendered height in CSS pixels (optional). */
  height?: number;
  /** JPEG/WebP quality 20-100. Default 75. */
  quality?: number;
  /** `contain` (default), `cover`, or `fill`. */
  resize?: "contain" | "cover" | "fill";
}

const SUPABASE_OBJECT_PUBLIC = "/storage/v1/object/public/";
const SUPABASE_RENDER_PUBLIC = "/storage/v1/render/image/public/";

/**
 * Optimize a Supabase Storage public URL using the render endpoint.
 * Non-Supabase URLs are returned unchanged.
 */
export const getOptimizedImageUrl = (
  url: string | null | undefined,
  opts: OptimizeOpts = {}
): string => {
  if (!url) return url ?? "";

  // Only Supabase Storage public URLs support the render endpoint.
  if (!url.includes(SUPABASE_OBJECT_PUBLIC)) return url;

  const { width = 256, height, quality = 75, resize = "contain" } = opts;

  // DPR-aware: render at ~2x so retina/HDPI Android stays crisp without
  // blowing past 50KB for typical icons.
  const dpr = typeof window !== "undefined" && window.devicePixelRatio
    ? Math.min(window.devicePixelRatio, 2)
    : 1;
  const targetW = Math.round(width * dpr);
  const targetH = height ? Math.round(height * dpr) : undefined;

  const transformed = url.replace(
    SUPABASE_OBJECT_PUBLIC,
    SUPABASE_RENDER_PUBLIC
  );

  const params = new URLSearchParams();
  params.set("width", String(targetW));
  if (targetH) params.set("height", String(targetH));
  params.set("quality", String(quality));
  params.set("resize", resize);
  // WebP is supported by every Android WebView we ship to and by all
  // modern browsers. Supabase serves it automatically when requested.
  params.set("format", "webp");

  return `${transformed}?${params.toString()}`;
};
