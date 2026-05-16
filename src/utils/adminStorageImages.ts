import { adminSupabase } from "@/integrations/supabase/adminClient";
import { getAdminSessionToken } from "@/utils/adminSession";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://ayjdlvuurscxucatbbah.supabase.co";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJheWpkbHZ1dXJzY3h1Y2F0YmJhaCIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzc1MjY0MTIzLCJleHAiOjIwOTA4NDAxMjN9.5A53IMXcvGGnmXK9Dd96V7ceceh1JFuGmPom-hojWJc";
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();
const inFlightSignedUrls = new Map<string, Promise<string | null>>();
const STORAGE_OBJECT_RE = /\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/?#]+)\/([^?#]+)/;
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
  'app-assets', 'assets', 'banners', 'banners-media', 'branding', 'chat-media', 'content-media',
]);

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

export const isAdminStorageReference = (value?: string | null) => {
  if (!value) return false;
  return !!extractAdminStoragePath(value);
};

export const isPrivateAdminStorageReference = (value?: string | null, defaultBucket?: string) => {
  if (!value) return false;
  const storagePath = extractAdminStoragePath(value, defaultBucket);
  return !!storagePath && PRIVATE_STORAGE_BUCKETS.has(storagePath.bucket);
};

export const clearAdminStorageImageCache = () => {
  signedUrlCache.clear();
  inFlightSignedUrls.clear();
};

export const resolveAdminStorageImageUrl = async (value?: string | null, defaultBucket = "payment-proofs") => {
  if (!value) return null;
  const storagePath = extractStoragePath(value, defaultBucket);
  if (!storagePath) return value;

  const cacheKey = `${storagePath.bucket}/${storagePath.path}`;
  const cached = signedUrlCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  const adminToken = getAdminSessionToken();
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
    const data = resp?.ok ? await resp.json().catch(() => null) : null;

    if ((data as any)?.signedUrl) {
      signedUrlCache.set(cacheKey, { url: (data as any).signedUrl, expiresAt: Date.now() + 55 * 60 * 1000 });
      return (data as any).signedUrl;
    }
  }

  const { data, error } = await adminSupabase.storage
    .from(storagePath.bucket)
    .createSignedUrl(storagePath.path, 60 * 60);

  if (error || !data?.signedUrl) return PRIVATE_STORAGE_BUCKETS.has(storagePath.bucket) ? null : value;
  signedUrlCache.set(cacheKey, { url: data.signedUrl, expiresAt: Date.now() + 55 * 60 * 1000 });
  return data.signedUrl;
};