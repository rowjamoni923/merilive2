import { adminSupabase } from "@/integrations/supabase/adminClient";
import { getAdminSessionToken } from "@/utils/adminSession";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://ayjdlvuurscxucatbbah.supabase.co";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5amRsdnV1cnNjeHVjYXRiYmFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNjQxMjMsImV4cCI6MjA5MDg0MDEyM30.5A53IMXcvGGnmXK9Dd96V7ceceh1JFuGmPom-hojWJc";
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();
const failedSignedUrlCache = new Map<string, number>();
const inFlightSignedUrls = new Map<string, Promise<string | null>>();
const LEGACY_ADMIN_TOKEN_KEYS = ['merilive-admin-token', 'admin_session_token'];
const ADMIN_SESSION_KEYS = ['merilive-admin-session'];
const STORAGE_OBJECT_RE = /\/storage\/v1\/(?:object|render\/image)\/(?:public|sign|authenticated)\/([^/?#]+)\/([^?#]+)/;
const SIGNED_STORAGE_OBJECT_RE = /\/storage\/v1\/(?:object|render\/image)\/sign\//;
export interface AdminStoragePath {
  bucket: string;
  path: string;
}
const PRIVATE_STORAGE_BUCKETS = new Set([
  'face-verification', 'host-verification', 'payment-proofs', 'payment-screenshots',
  'helper-screenshots', 'rating-screenshots', 'support-attachments', 'live-recordings', 'chat-media',
]);
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

type AdminSignStorageResponse = { signedUrl?: string };
type AdminMediaResolverWindow = Window & { __adminMediaAutoResolverInstalled?: boolean };

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
  return !!extractAdminStoragePath(value) || RAW_FILE_PATH_RE.test(value.trim());
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
};

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
      const signed = resp?.ok ? await resp.json().catch(() => null) : null;

      const signedUrl = (signed as AdminSignStorageResponse | null)?.signedUrl;
      if (signedUrl) {
        signedUrlCache.set(cacheKey, { url: signedUrl, expiresAt: Date.now() + 55 * 60 * 1000 });
        return signedUrl;
      }
    }

    const { data, error } = await adminSupabase.storage
      .from(storagePath.bucket)
      .createSignedUrl(storagePath.path, 60 * 60);

    if (!error && data?.signedUrl) {
      signedUrlCache.set(cacheKey, { url: data.signedUrl, expiresAt: Date.now() + 55 * 60 * 1000 });
      return data.signedUrl;
    }

    failedSignedUrlCache.set(failureCacheKey, Date.now() + 15 * 1000);
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
    const signed = await signAdminStoragePath(candidate);
    if (signed) return signed;
  }

  return candidates.some((candidate) => PRIVATE_STORAGE_BUCKETS.has(candidate.bucket)) ? null : value;
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
  const resolved = await resolveAdminStorageImageUrl(originalPoster, inferDefaultBucketForElement(video)).catch(() => null);
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

  const resolved = await resolveAdminStorageImageUrl(original, bucket).catch(() => null);
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