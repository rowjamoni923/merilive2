import { adminSupabase } from "@/integrations/supabase/adminClient";
import { getAdminSessionToken } from "@/utils/adminSession";

const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();
const STORAGE_OBJECT_RE = /\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/?#]+)\/([^?#]+)/;
const KNOWN_STORAGE_BUCKETS = new Set([
  'face-verification', 'host-verification', 'avatars', 'payment-proofs', 'payment-screenshots',
  'helper-screenshots', 'rating-screenshots', 'support-attachments', 'live-recordings',
  'app-assets', 'assets', 'banners', 'banners-media', 'branding', 'chat-media', 'content-media',
]);

const extractStoragePath = (value: string, defaultBucket = "payment-proofs") => {
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
    if (withoutSlash.startsWith(`${defaultBucket}/`)) {
      return { bucket: defaultBucket, path: withoutSlash.slice(defaultBucket.length + 1) };
    }
    if (!withoutSlash.includes("://")) return { bucket: defaultBucket, path: withoutSlash };
    return null;
  }
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
    const { data } = await adminSupabase.functions.invoke('admin-sign-storage-url', {
      body: { bucket: storagePath.bucket, path: storagePath.path, expiresIn: 60 * 60 },
    });

    if ((data as any)?.signedUrl) {
      signedUrlCache.set(cacheKey, { url: (data as any).signedUrl, expiresAt: Date.now() + 55 * 60 * 1000 });
      return (data as any).signedUrl;
    }
  }

  const { data, error } = await adminSupabase.storage
    .from(storagePath.bucket)
    .createSignedUrl(storagePath.path, 60 * 60);

  if (error || !data?.signedUrl) return value;
  signedUrlCache.set(cacheKey, { url: data.signedUrl, expiresAt: Date.now() + 55 * 60 * 1000 });
  return data.signedUrl;
};