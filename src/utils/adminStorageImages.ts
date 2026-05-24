import { adminSupabase } from "@/integrations/supabase/adminClient";
import { getAdminSessionToken } from "@/utils/adminSession";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://ayjdlvuurscxucatbbah.supabase.co";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5amRsdnV1cnNjeHVjYXRiYmFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNjQxMjMsImV4cCI6MjA5MDg0MDEyM30.5A53IMXcvGGnmXK9Dd96V7ceceh1JFuGmPom-hojWJc";
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();
const failedSignedUrlCache = new Map<string, number>();
const inFlightSignedUrls = new Map<string, Promise<string | null>>();
const objectUrlCache = new Set<string>();
const publicStorageExistsCache = new Map<string, boolean>();
const LEGACY_ADMIN_TOKEN_KEYS = ['merilive-admin-token', 'admin_session_token'];
const ADMIN_SESSION_KEYS = ['merilive-admin-session'];
const STORAGE_OBJECT_RE = /\/storage\/v1\/(?:object|render\/image)\/(?:public|sign|authenticated)\/([^/?#]+)\/([^?#]+)/;
const SIGNED_STORAGE_OBJECT_RE = /\/storage\/v1\/(?:object|render\/image)\/sign\//;
export interface AdminStoragePath {
  bucket: string;
  path: string;
}
const PRIVATE_STORAGE_BUCKETS = new Set([
  'face-verification',
  'host-verification',
  'payment-proofs', 'payment-screenshots',
  'helper-screenshots', 'rating-screenshots', 'support-attachments', 'live-recordings',
]);
// face-verification bucket is PRIVATE in this project (storage.buckets.public=false),
// so /object/public/... URLs return 400. We must sign via the admin edge function.
// Only chat-media is genuinely public among the verification-adjacent buckets.
const PUBLIC_VERIFICATION_BUCKETS = new Set(['chat-media']);
const KNOWN_STORAGE_BUCKETS = new Set([
  'face-verification', 'host-verification', 'avatars', 'payment-proofs', 'payment-screenshots',
  'helper-screenshots', 'rating-screenshots', 'support-attachments', 'live-recordings',
  'app-assets', 'app-icons', 'assets', 'banners', 'banners-media', 'branding', 'chat-media',
  'content-media', 'payment-logos', 'posters', 'reels',
]);
const FALLBACK_SIGNING_BUCKETS = [
  'face-verification', 'host-verification', 'payment-screenshots', 'payment-proofs',
  'helper-screenshots', 'rating-screenshots', 'support-attachments', 'avatars',
  'chat-media', 'live-recordings', 'app-assets', 'app-icons', 'assets', 'banners',
  'banners-media', 'branding', 'content-media', 'payment-logos', 'posters', 'reels',
];
const RAW_FILE_PATH_RE = /^(?!https?:|data:|blob:|mailto:|tel:|#|\/\/)[A-Za-z0-9@._~!$&'()+,;=:/-]+\.(?:jpg|jpeg|png|gif|webp|avif|svg|bmp|heic|heif|mp4|m4v|mov|webm|ogg|ogv|3gp|mkv|mp3|wav|m4a|pdf)(?:[?#].*)?$/i;
const VIDEO_FILE_RE = /\.(?:mp4|m4v|mov|qt|webm|ogg|ogv|avi|mkv|3gp|3gpp|3g2|mpg|mpeg|hevc|ts|m3u8|mpd)(?:$|[?#])/i;

type AdminSignStorageResponse = { success?: boolean; signedUrl?: string; contentType?: string | null; error?: string };
type AdminBatchSignResponse = {
  success?: boolean;
  results?: Array<{ bucket?: string; path?: string; signedUrl?: string; error?: string }>;
  error?: string;
};
type AdminMediaResolverWindow = Window & { __adminMediaAutoResolverInstalled?: boolean };

let batchSignQueue: Array<{ storagePath: AdminStoragePath; adminToken: string; resolve: (url: string | null) => void }> = [];
let batchSignTimer: number | null = null;

export const extractAdminStoragePath = (value: string, defaultBucket?: string): AdminStoragePath | null => {
  const raw = value.trim();
  if (!raw || raw.startsWith("data:") || raw.startsWith("blob:")) return null;

  try {
    const url = new URL(raw);
    const match = url.pathname.match(STORAGE_OBJECT_RE);
    if (!match) return null;
    return { bucket: decodeURIComponent(match[1]), path: decodeURIComponent(match[2]) };
  } catch {
    const withoutSlash = raw.replace(/^\/+/, "");
    const [firstSegment, ...rest] = withoutSlash.split('/');
    if (KNOWN_STORAGE_BUCKETS.has(firstSegment) && rest.length > 0) {
      return { bucket: firstSegment, path: rest.join('/') };
    }
    if (defaultBucket && withoutSlash.startsWith(`${defaultBucket}/`)) {
      return { bucket: defaultBucket, path: withoutSlash.slice(defaultBucket.length + 1) };
    }
    if (defaultBucket && !withoutSlash.includes("://")) return { bucket: defaultBucket, path: withoutSlash };
    return null;
  }
};

export const isAdminStorageReference = (value?: string | null, defaultBucket?: string) => {
  if (!value) return false;
  return !!extractAdminStoragePath(value, defaultBucket) || RAW_FILE_PATH_RE.test(value.trim());
};

export const isPrivateAdminStorageReference = (value?: string | null, defaultBucket?: string) => {
  if (!value) return false;
  const storagePath = extractAdminStoragePath(value, defaultBucket);
  return !!storagePath && PRIVATE_STORAGE_BUCKETS.has(storagePath.bucket);
};

export const clearAdminStorageImageCache = () => {
  signedUrlCache.clear();
  failedSignedUrlCache.clear();
  inFlightSignedUrls.clear();
  objectUrlCache.forEach((url) => URL.revokeObjectURL(url));
  objectUrlCache.clear();
};

// Clear caches whenever the admin session is established/refreshed, so any
// prior "no admin token" failures don't poison subsequent image loads.
if (typeof window !== "undefined") {
  window.addEventListener("admin-session-change", () => {
    signedUrlCache.clear();
    failedSignedUrlCache.clear();
    inFlightSignedUrls.clear();
  });
}


const looksLikeRawFilePath = (value: string) => RAW_FILE_PATH_RE.test(value.trim());

const readStorageValue = (storage: Storage | undefined, key: string) => {
  try { return storage?.getItem(key) || ''; } catch { return ''; }
};

const extractTokenFromStoredValue = (raw: string) => {
  if (!raw) return '';
  if (raw.length >= 16 && !raw.trim().startsWith('{')) return raw;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const candidates = [parsed.session_token, parsed.sessionToken, parsed.admin_token, parsed.adminToken, parsed.token];
    const found = candidates.find((v): v is string => typeof v === 'string' && v.length >= 16);
    return found || '';
  } catch {
    const match = raw.match(/"(?:session_token|sessionToken|admin_token|adminToken|token)"\s*:\s*"([^"]{16,})"/);
    return match?.[1] || '';
  }
};

const resolveStoredAdminToken = () => {
  if (typeof window === "undefined") return '';
  const activeToken = getAdminSessionToken();
  if (activeToken) return activeToken;
  for (const store of [window.sessionStorage, window.localStorage]) {
    for (const key of ADMIN_SESSION_KEYS) {
      const tokenFromSession = extractTokenFromStoredValue(readStorageValue(store, key));
      if (tokenFromSession) return tokenFromSession;
    }
  }
  for (const store of [window.sessionStorage, window.localStorage]) {
    for (const key of LEGACY_ADMIN_TOKEN_KEYS) {
      const direct = extractTokenFromStoredValue(readStorageValue(store, key));
      if (direct) return direct;
    }
    for (let i = 0; i < (store?.length || 0); i += 1) {
      const key = store?.key(i) || '';
      if (!/admin|meri/i.test(key)) continue;
      const tokenFromAnyAdminKey = extractTokenFromStoredValue(readStorageValue(store, key));
      if (tokenFromAnyAdminKey) return tokenFromAnyAdminKey;
    }
  }
  return '';
};

const isAlreadySignedStorageUrl = (value: string) => {
  try {
    const url = new URL(value.trim());
    return SIGNED_STORAGE_OBJECT_RE.test(url.pathname) && url.searchParams.has('token');
  } catch {
    return false;
  }
};

const buildStorageCandidates = (value: string, defaultBucket?: string): AdminStoragePath[] => {
  const explicit = extractAdminStoragePath(value);
  if (explicit) return [explicit];

  const cleanPath = value.trim().replace(/^\/+/, "");
  if (!looksLikeRawFilePath(cleanPath)) return [];

  const buckets = Array.from(new Set([defaultBucket, ...FALLBACK_SIGNING_BUCKETS].filter(Boolean) as string[]));
  return buckets.map((bucket) => ({ bucket, path: cleanPath }));
};

const normalizeAdminStorageValue = (value: string, defaultBucket?: string) => {
  const raw = value.trim();
  const parsed = extractAdminStoragePath(raw, defaultBucket);
  if (!parsed) return raw;
  return `${parsed.bucket}/${parsed.path}`;
};

const getPublicStorageUrl = (storagePath: AdminStoragePath) => {
  const { data } = adminSupabase.storage.from(storagePath.bucket).getPublicUrl(storagePath.path);
  return data?.publicUrl || `${SUPABASE_URL}/storage/v1/object/public/${encodeURIComponent(storagePath.bucket)}/${storagePath.path.split('/').map(encodeURIComponent).join('/')}`;
};

const publicStorageObjectExists = async (url: string) => {
  if (publicStorageExistsCache.has(url)) return publicStorageExistsCache.get(url) === true;
  const response = await fetch(url, { method: 'HEAD', cache: 'no-store' }).catch(() => null);
  const exists = !!response && (response.ok || response.status === 206 || response.status === 304);
  publicStorageExistsCache.set(url, exists);
  return exists;
};

const resolvePublicVerificationUrl = async (storagePath: AdminStoragePath, _rawValue: string, _defaultBucket?: string) => {
  if (!PUBLIC_VERIFICATION_BUCKETS.has(storagePath.bucket)) return null;
  // Bucket is public — return direct URL. No HEAD probe (it was freezing the
  // admin page when many tiles loaded at once), no signing, no blob download.
  return getPublicStorageUrl(storagePath);
};

const usefulMimeType = (type?: string | null) => {
  const clean = (type || "").split(";")[0].trim().toLowerCase();
  return clean && clean !== "application/octet-stream" && clean !== "application/json" ? clean : "";
};

const sniffBlobMimeType = async (blob: Blob) => {
  const bytes = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  if (bytes.length < 12) return "";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return "image/gif";
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]).toLowerCase();
    if (brand.startsWith("qt")) return "video/quicktime";
    if (brand === "heic" || brand === "heix" || brand === "mif1") return "image/heic";
    return "video/mp4";
  }
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return "video/webm";
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "application/pdf";
  return "";
};

const faceBucketPathFallback = (path?: string | null) => {
  const lower = (path || "").toLowerCase();
  if (!lower) return "";
  if (lower.includes("/face-videos/") || lower.includes("/liveness/") || lower.includes("/video/") || lower.includes("/videos/")) return "video/mp4";
  if (lower.includes("/face-angles/") || lower.includes("/host-photos/") || lower.includes("/profile/") || lower.includes("/selfie")) return "image/jpeg";
  return "";
};

const shouldDownloadPrivateImageFirst = (storagePath: AdminStoragePath) => {
  if (storagePath.bucket !== 'face-verification' && storagePath.bucket !== 'host-verification') return false;
  const lower = storagePath.path.toLowerCase();
  if (lower.includes('/face-videos/') || lower.includes('/videos/') || lower.includes('/video/') || lower.includes('/liveness/')) return false;
  return lower.includes('/face-angles/')
    || lower.includes('/host-photos/')
    || lower.includes('/photos/')
    || lower.includes('/profile/')
    || lower.includes('/selfie')
    || /\.(jpg|jpeg|png|webp|gif|avif|heic|heif)(?:$|[?#])/i.test(lower);
};

const shouldStreamSignedStoragePath = (_storagePath: AdminStoragePath) => {
  // ★ NEVER download videos as blob: URLs. blob: URLs do not support HTTP
  //   range requests, which breaks <video> seek + playback (the element shows
  //   only the poster). For verification videos we always serve the signed /
  //   public URL directly so the browser can stream it natively.
  return false;
};

const createTypedObjectUrl = async (blob: Blob, hintedType?: string | null, hintedPath?: string | null) => {
  const resolvedType = await sniffBlobMimeType(blob).catch(() => "")
    || usefulMimeType(blob.type)
    || usefulMimeType(hintedType)
    || faceBucketPathFallback(hintedPath);
  const typedBlob = resolvedType && blob.type !== resolvedType ? new Blob([blob], { type: resolvedType }) : blob;
  const objectUrl = URL.createObjectURL(typedBlob);
  objectUrlCache.add(objectUrl);
  return objectUrl;
};

const downloadAdminStoragePathAsObjectUrl = async (storagePath: AdminStoragePath, adminToken = resolveStoredAdminToken()) => {
  if (!adminToken) {
    console.warn('[AdminMedia] Missing admin session token while downloading storage media', { bucket: storagePath.bucket, path: storagePath.path });
    return null;
  }
  const downloadResp = await fetch(`${SUPABASE_URL}/functions/v1/admin-sign-storage-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'x-admin-token': adminToken,
    },
    body: JSON.stringify({ bucket: storagePath.bucket, path: storagePath.path, mode: 'download' }),
  }).catch(() => null);
  if (!downloadResp?.ok) {
    console.warn('[AdminMedia] Download signing failed', { bucket: storagePath.bucket, path: storagePath.path, status: downloadResp?.status || 0 });
    return null;
  }
  const blob = await downloadResp.blob().catch(() => null);
  if (!blob) return null;
  return createTypedObjectUrl(blob, downloadResp.headers.get('content-type'), storagePath.path).catch(() => null);
};


const signAdminStoragePath = async (storagePath: AdminStoragePath) => {
  const adminToken = resolveStoredAdminToken();
  const cacheKey = `${adminToken || 'anon'}::${storagePath.bucket}/${storagePath.path}`;
  const cached = signedUrlCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  const failureCacheKey = `${cacheKey}::${adminToken ? 'admin' : 'no-admin'}`;
  const failedUntil = failedSignedUrlCache.get(failureCacheKey);
  if (failedUntil && failedUntil > Date.now()) return null;

  const inFlight = inFlightSignedUrls.get(cacheKey);
  if (inFlight) return inFlight;

  const signPromise = (async () => {
    // 1) Preferred path: ask the admin edge function for a signed URL. It uses
    //    the service role, backfills correct Content-Type, and works even when
    //    the user app has no Supabase auth session.
    if (adminToken) {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/admin-sign-storage-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'x-admin-token': adminToken,
        },
        body: JSON.stringify({ bucket: storagePath.bucket, path: storagePath.path, expiresIn: 60 * 60 }),
      }).catch(() => null);
      if (!resp?.ok) console.warn('[AdminMedia] Signed URL request failed', { bucket: storagePath.bucket, path: storagePath.path, status: resp?.status || 0 });
      const signed = resp?.ok ? await resp.json().catch(() => null) : null;
      const signedUrl = (signed as AdminSignStorageResponse | null)?.signedUrl;
      if (signedUrl) {
        signedUrlCache.set(cacheKey, { url: signedUrl, expiresAt: Date.now() + 55 * 60 * 1000 });
        return signedUrl;
      }
    }

    // 2) Fallback: admin Supabase client (adminFetch attaches x-admin-token,
    //    and `is_active_admin_session()` storage RLS allows read).
    const { data, error } = await adminSupabase.storage
      .from(storagePath.bucket)
      .createSignedUrl(storagePath.path, 60 * 60);

    if (!error && data?.signedUrl) {
      signedUrlCache.set(cacheKey, { url: data.signedUrl, expiresAt: Date.now() + 55 * 60 * 1000 });
      return data.signedUrl;
    }

    // Without an admin token the failure is "session not loaded yet" — cache
    // briefly so the next attempt after login retries immediately.
    failedSignedUrlCache.set(failureCacheKey, Date.now() + (adminToken ? 15 * 1000 : 2 * 1000));
    return null;
  })().finally(() => {
    inFlightSignedUrls.delete(cacheKey);
  });

  inFlightSignedUrls.set(cacheKey, signPromise);
  return signPromise;
};

export const resolveAdminStorageImageUrl = async (value?: string | null, defaultBucket = "payment-proofs") => {
  if (!value) return null;
  const raw = value.trim();
  if (!raw || raw.startsWith("data:") || raw.startsWith("blob:")) return value;
  if (isAlreadySignedStorageUrl(raw)) {
    const signedPath = extractAdminStoragePath(raw, defaultBucket);
    if (!signedPath || !PRIVATE_STORAGE_BUCKETS.has(signedPath.bucket)) return raw;
  }

  const candidates = buildStorageCandidates(raw, defaultBucket);
  if (!candidates.length) return value;

  for (const candidate of candidates) {
    const publicUrl = await resolvePublicVerificationUrl(candidate, raw, defaultBucket);
    if (publicUrl) return publicUrl;

    const signed = await signAdminStoragePath(candidate);
    if (signed) return signed;
  }

  return candidates.some((candidate) => PRIVATE_STORAGE_BUCKETS.has(candidate.bucket)) ? null : normalizeAdminStorageValue(raw, defaultBucket);
};

export const resolveAdminStorageSignedUrl = resolveAdminStorageImageUrl;

/**
 * Face/host verification media is private and some historical face-angle stills
 * were saved with a video extension while the actual bytes are JPEG. For this
 * admin review flow, fetch through the admin edge function first and return a
 * correctly typed object URL; fall back to normal signed URLs only if download
 * mode is unavailable. This makes photos + videos render even when extension,
 * bucket visibility, or stored Content-Type are inconsistent.
 */
export const resolveAdminStorageObjectUrl = async (value?: string | null, defaultBucket = "face-verification") => {
  if (!value) return null;
  const raw = value.trim();
  if (!raw || raw.startsWith("data:") || raw.startsWith("blob:")) return value;

  const candidates = buildStorageCandidates(raw, defaultBucket);
  if (!candidates.length) return value;

  for (const candidate of candidates) {
    // Public verification buckets → direct public URL, no signing, no probe.
    const publicUrl = await resolvePublicVerificationUrl(candidate, raw, defaultBucket);
    if (publicUrl) return publicUrl;

    // Private buckets still go through the admin signer.
    const signed = await signAdminStoragePath(candidate);
    if (signed) return signed;
  }

  return candidates.some((candidate) => PRIVATE_STORAGE_BUCKETS.has(candidate.bucket)) ? null : normalizeAdminStorageValue(raw, defaultBucket);
};

/**
 * Synchronous fast-path: if `value` points at a PUBLIC verification bucket
 * (currently chat-media), return the direct public URL immediately
 * with zero network round-trips. Used to prime <img> src so admin thumbnails
 * render INSTANTLY instead of showing a "Resolving signed media URL…" spinner.
 * Returns null for private buckets, raw http(s) urls, or anything that needs
 * the async resolver.
 */
export const tryResolvePublicAdminStorageUrlSync = (
  value?: string | null,
  defaultBucket = "face-verification",
): string | null => {
  if (!value) return null;
  const raw = value.trim();
  if (!raw || raw.startsWith("data:") || raw.startsWith("blob:")) return null;
  // Already-public storage URL? Use as-is.
  if (/^https?:\/\//i.test(raw)) {
    const parsed = extractAdminStoragePath(raw, defaultBucket);
    if (parsed && PUBLIC_VERIFICATION_BUCKETS.has(parsed.bucket) && !isAlreadySignedStorageUrl(raw)) {
      return raw;
    }
    return null;
  }
  const candidates = buildStorageCandidates(raw, defaultBucket);
  for (const candidate of candidates) {
    if (PUBLIC_VERIFICATION_BUCKETS.has(candidate.bucket)) {
      return getPublicStorageUrl(candidate);
    }
  }
  return null;
};

const TRANSPARENT_PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

type AdminMediaElement = HTMLImageElement | HTMLVideoElement | HTMLAudioElement | HTMLSourceElement;

const getElementSrc = (el: AdminMediaElement) => {
  if (el instanceof HTMLImageElement) return el.getAttribute("src") || el.currentSrc || el.src;
  return el.getAttribute("src") || ("src" in el ? String((el as HTMLVideoElement | HTMLAudioElement).src || "") : "");
};

const inferDefaultBucketForElement = (el: AdminMediaElement) => {
  const haystack = [
    el.getAttribute("alt"),
    el.getAttribute("title"),
    el.getAttribute("aria-label"),
    el.getAttribute("class"),
    el.closest('[data-admin-media-bucket]')?.getAttribute('data-admin-media-bucket'),
    typeof window !== "undefined" ? window.location.pathname : "",
  ].filter(Boolean).join(" ").toLowerCase();

  const explicitBucket = el.closest('[data-admin-media-bucket]')?.getAttribute('data-admin-media-bucket');
  if (explicitBucket && KNOWN_STORAGE_BUCKETS.has(explicitBucket)) return explicitBucket;
  if (/face|verification|id card|host application/.test(haystack)) return "face-verification";
  if (/helper|withdrawal/.test(haystack)) return "helper-screenshots";
  if (/rating/.test(haystack)) return "rating-screenshots";
  if (/support|attachment|ticket/.test(haystack)) return "support-attachments";
  if (/recording|stream/.test(haystack)) return "live-recordings";
  if (/avatar|profile/.test(haystack)) return "avatars";
  if (/payment|proof|screenshot|recharge|topup|order/.test(haystack)) return "payment-screenshots";
  if (/logo|icon|asset|badge|theme|branding/.test(haystack)) return "app-assets";
  if (/banner|campaign|popup/.test(haystack)) return "banners";
  if (/reel/.test(haystack)) return "reels";
  return "face-verification";
};

const applyResolvedSrc = (el: AdminMediaElement, resolved: string) => {
  if (el instanceof HTMLImageElement) {
    el.src = resolved;
    return;
  }
  el.setAttribute("src", resolved);
  const parent = el instanceof HTMLSourceElement ? el.parentElement : el;
  if (parent instanceof HTMLVideoElement || parent instanceof HTMLAudioElement) parent.load();
};

const resolveVideoPoster = async (video: HTMLVideoElement) => {
  const originalPoster = video.dataset.adminOriginalPoster || video.getAttribute("poster") || "";
  if (!originalPoster || originalPoster.startsWith("data:") || originalPoster.startsWith("blob:") || !isAdminStorageReference(originalPoster)) return;
  if (video.dataset.adminPosterResolving === "true") return;
  video.dataset.adminOriginalPoster = originalPoster;
  video.dataset.adminPosterResolving = "true";
  const bucket = inferDefaultBucketForElement(video);
  const resolver = bucket === "face-verification" || bucket === "host-verification"
    ? resolveAdminStorageObjectUrl
    : resolveAdminStorageImageUrl;
  const resolved = await resolver(originalPoster, bucket).catch(() => null);
  delete video.dataset.adminPosterResolving;
  if (resolved) video.setAttribute("poster", resolved);
};

const resolveElementSrc = async (el: AdminMediaElement, defaultBucket?: string) => {
  const current = getElementSrc(el) || "";
  if (el.dataset.adminResolvedSrc && current === el.dataset.adminResolvedSrc) return;
  const original = el.dataset.adminOriginalSrc || getElementSrc(el) || "";
  const bucket = defaultBucket || inferDefaultBucketForElement(el);
  if (!original || original.startsWith("data:") || original.startsWith("blob:") || !isAdminStorageReference(original)) return;
  if (el.dataset.adminResolving === "true") return;

  el.dataset.adminOriginalSrc = original;
  el.dataset.adminResolving = "true";
  if (el instanceof HTMLImageElement && (isPrivateAdminStorageReference(original, bucket) || looksLikeRawFilePath(original))) {
    el.src = TRANSPARENT_PIXEL;
  }

  const resolver = bucket === "face-verification" || bucket === "host-verification"
    ? resolveAdminStorageObjectUrl
    : resolveAdminStorageImageUrl;
  const resolved = await resolver(original, bucket).catch(() => null);
  delete el.dataset.adminResolving;

  if (resolved) {
    el.dataset.adminResolvedSrc = resolved;
    applyResolvedSrc(el, resolved);
  }
};

export const installAdminMediaAutoResolver = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};
  const resolverWindow = window as AdminMediaResolverWindow;
  if (resolverWindow.__adminMediaAutoResolverInstalled) return () => {};
  resolverWindow.__adminMediaAutoResolverInstalled = true;

  const scan = (root: ParentNode = document) => {
    root.querySelectorAll?.("img[src], video[src], audio[src], source[src]").forEach((node) => {
      if (node instanceof HTMLImageElement || node instanceof HTMLVideoElement || node instanceof HTMLAudioElement || node instanceof HTMLSourceElement) {
        void resolveElementSrc(node);
      }
    });
    root.querySelectorAll?.("video[poster]").forEach((node) => {
      if (node instanceof HTMLVideoElement) void resolveVideoPoster(node);
    });
  };

  const onError = (event: Event) => {
    const target = event.target;
    if (target instanceof HTMLImageElement || target instanceof HTMLVideoElement || target instanceof HTMLAudioElement || target instanceof HTMLSourceElement) {
      void resolveElementSrc(target);
    }
  };

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        if (node.matches("img[src], video[src], audio[src], source[src]")) void resolveElementSrc(node as AdminMediaElement);
        if (node instanceof HTMLVideoElement && node.matches("video[poster]")) void resolveVideoPoster(node);
        scan(node);
      });
      if (mutation.type === "attributes" && mutation.target instanceof Element) {
        const node = mutation.target;
        if (node.matches("img[src], video[src], audio[src], source[src]")) void resolveElementSrc(node as AdminMediaElement);
        if (node instanceof HTMLVideoElement && node.matches("video[poster]")) void resolveVideoPoster(node);
      }
    }
  });

  scan();
  document.addEventListener("error", onError, true);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["src", "poster"] });

  return () => {
    document.removeEventListener("error", onError, true);
    observer.disconnect();
    resolverWindow.__adminMediaAutoResolverInstalled = false;
  };
};