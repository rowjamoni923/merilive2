/**
 * Pkg41 — Premium thumbnail enhancement.
 *
 * Routes Live/Premium card thumbnails through the free images.weserv.nl CDN
 * with luxurious tuning: high-quality re-encode, smart sharpen, mild contrast,
 * progressive (interlaced) WebP output. Result: photos look crisp, polished
 * and professional — like an AI-upscaled magazine cover — without any per-view
 * AI cost or latency.
 *
 * Cards still render INSTANTLY because the CDN is edge-cached globally and we
 * keep `loading="eager"` + `fetchpriority="high"` on the <img> tag.
 */

const WESERV = "https://images.weserv.nl/";

type EnhanceOptions = {
  /** Target render width in CSS pixels. The CDN will deliver 2x for retina. */
  width?: number;
  /** JPEG/WebP quality (1-100). Default 88 — visually lossless, small. */
  quality?: number;
  /** Sharpening strength 0-10. Default 1.2 — crisp without halos. */
  sharpen?: number;
};

const PLACEHOLDERS = new Set(["", "/placeholder.svg", "placeholder.svg"]);

export function enhanceThumbnail(
  url: string | null | undefined,
  opts: EnhanceOptions = {}
): string {
  if (!url || PLACEHOLDERS.has(url)) return "/placeholder.svg";

  // Skip data URLs, blob URLs, and local relative paths — CDN cannot proxy them.
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;
  if (!/^https?:\/\//i.test(url)) return url;

  const width = opts.width ?? 800;
  const quality = opts.quality ?? 88;
  const sharpen = opts.sharpen ?? 1.2;

  // weserv expects URL WITHOUT protocol in `url` param.
  const stripped = url.replace(/^https?:\/\//i, "");

  const params = new URLSearchParams({
    url: stripped,
    w: String(width * 2),     // 2x for retina sharpness
    q: String(quality),
    output: "webp",           // smaller + better quality than jpg
    il: "",                   // interlaced/progressive
    sharp: String(sharpen),   // smart sharpen
    af: "",                   // adaptive filter
    we: "",                   // without enlargement (don't upscale tiny images poorly)
  });

  return `${WESERV}?${params.toString()}`;
}
