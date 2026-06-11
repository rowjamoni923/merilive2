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
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://ayjdlvuurscxucatbbah.supabase.co";
const STORAGE_OBJECT_RE = /\/storage\/v1\/(?:object|render\/image)\/(?:public|sign|authenticated)\/([^/?#]+)\/([^?#]+)/;
const ROOT_STORAGE_RE = /^\/storage\/v1\/(?:object|render\/image)\/(?:public|sign|authenticated)\/([^/?#]+)\/([^?#]+)/;

const PUBLIC_MEDIA_BUCKETS = new Set([
  "app-assets", "app-icons", "assets", "avatars", "banners", "banners-media",
  "branding", "content-media", "payment-logos", "posters", "reels",
  "gifts", "frames", "avatar_frames", "role-frames", "entry-banners", "entry-bars",
  "entry-name-bars", "vehicle-entrances", "animations", "svga-animations",
  "chat_bubbles", "medals", "vip-medals", "noble-cards",
]);

// Any path under one of these public-folder prefixes is a same-origin app
// asset (served from /public by Vite or bundled by Vite from /src/assets).
// They must NEVER be rewritten to a Supabase Storage URL — otherwise paths
// like `images/premium-events/eid-special.png` get prepended with the default
// bucket (`avatars/`) and the admin auto-resolver tries to sign a phantom
// storage object that doesn't exist → 400 "Object not found".
const APP_LOCAL_MEDIA_RE = /^\/?(?:src\/assets\/|assets\/|lovable-uploads\/|images\/|img\/|static\/|public\/|premium-(?:events|notifications)\/|placeholder\.svg(?:[?#].*)?$|favicon\.|icon-)/i;
const RAW_MEDIA_PATH_RE = /^(?!https?:|data:|blob:|mailto:|tel:|#|\/\/)[A-Za-z0-9@._~!$&'()+,;=:/-]+\.(?:jpg|jpeg|png|gif|webp|avif|svg|bmp|heic|heif|mp4|m4v|mov|webm|ogg|ogv|3gp|mkv|svga|json)(?:[?#].*)?$/i;

export function toSupabaseCdnUrl(
  url: string | null | undefined,
  opts: CdnImageOptions = {}
): string | undefined {
  // Pkg-NetFix: re-enabled on Supabase Pro. Returns a transformed WebP variant
  // (10-30 KB) instead of the raw 1-3 MB original — kills the "piece-by-piece"
  // image load on 3G/4G. Callers MUST keep an onError fallback to the raw URL
  // in case transform 400s on a specific object (e.g. animated GIF, SVG).
  if (!url || typeof url !== "string") return url || undefined;
  if (!url.includes(OBJECT_PUBLIC)) return url; // not a transformable Supabase object
  if (url.includes(RENDER_PUBLIC)) return url; // already a render URL
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;
  // SVG/GIF can't be transformed without breaking animation/vector — leave raw.
  if (/\.(svg|gif)(\?|#|$)/i.test(url)) return url;

  const width = opts.width && opts.width > 0 ? Math.min(2000, Math.round(opts.width)) : undefined;
  const height = opts.height && opts.height > 0 ? Math.min(2000, Math.round(opts.height)) : undefined;
  const quality = Math.max(20, Math.min(100, opts.quality ?? 70));
  const resize = opts.resize ?? "contain";

  const params = new URLSearchParams();
  if (width) params.set("width", String(width));
  if (height) params.set("height", String(height));
  params.set("quality", String(quality));
  params.set("resize", resize);

  return url.replace(OBJECT_PUBLIC, RENDER_PUBLIC) + (url.includes("?") ? "&" : "?") + params.toString();
}

export function toPublicStorageUrl(bucket: string, path: string): string {
  const safeBucket = encodeURIComponent(bucket);
  const safePath = path.split('/').map(encodeURIComponent).join('/');
  return `${SUPABASE_URL}/storage/v1/object/public/${safeBucket}/${safePath}`;
}

export function normalizePublicMediaUrl(
  value: string | null | undefined,
  defaultBucket = "banners"
): string | undefined {
  if (!value || typeof value !== "string") return value || undefined;
  const raw = value.trim()
    .replace(/^https:\/([^/])/i, "https://$1")
    .replace(/^http:\/([^/])/i, "http://$1");
  if (!raw || raw.startsWith("data:") || raw.startsWith("blob:")) return raw || undefined;
  // App-bundled assets from Vite (/src/assets/... in preview, /assets/... in build)
  // must stay same-origin. The global <img> src normalizer calls this for every
  // image, and rewriting local sticker/rocket URLs to the default `avatars`
  // bucket produced broken Supabase URLs like avatars/src/assets/....
  if (APP_LOCAL_MEDIA_RE.test(raw)) return raw;
  if (raw.startsWith("/") && !raw.startsWith("/storage/v1/")) return raw;

  const rootStorageMatch = raw.match(ROOT_STORAGE_RE);
  if (rootStorageMatch?.[1] && rootStorageMatch?.[2]) {
    const bucket = decodeURIComponent(rootStorageMatch[1]);
    const path = decodeURIComponent(rootStorageMatch[2]);
    return PUBLIC_MEDIA_BUCKETS.has(bucket) ? toPublicStorageUrl(bucket, path) : raw;
  }

  try {
    const url = new URL(raw);
    const match = url.pathname.match(STORAGE_OBJECT_RE);
    if (!match) return raw;
    const bucket = decodeURIComponent(match[1]);
    if (!PUBLIC_MEDIA_BUCKETS.has(bucket)) return raw;
    return raw;
  } catch {
    const clean = raw.replace(/^\/+/, "");
    const [first, ...rest] = clean.split('/');
    if (PUBLIC_MEDIA_BUCKETS.has(first) && rest.length > 0) {
      return toPublicStorageUrl(first, rest.join('/'));
    }
    if (defaultBucket && RAW_MEDIA_PATH_RE.test(clean)) {
      const path = clean.startsWith(`${defaultBucket}/`) ? clean.slice(defaultBucket.length + 1) : clean;
      return toPublicStorageUrl(defaultBucket, path);
    }
    return raw;
  }
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
