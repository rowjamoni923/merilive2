const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://ayjdlvuurscxucatbbah.supabase.co";

// Legacy Supabase storage URLs that leaked into DB rows during earlier
// upload paths. We rewrite them to the public-profile-avatar edge fn which
// serves the private face-verification bucket via service role.
const LEGACY_FACE_STORAGE_PATTERN = /\/storage\/v1\/object\/(?:public|sign)\/face-verification\/([^\s|?#\]]+)/i;

// Bare bucket-relative path stored by FaceVerification.tsx uploader:
//   face-verification/<uuid>/<folder>/<file>
// This is the canonical shape for new uploads — the private bucket is
// resolved via the public-profile-avatar edge function.
const BARE_FACE_STORAGE_PATTERN = /^face-verification\/([^\s|?#\]]+)$/i;

const extractFirstUrl = (value: string): string => {
  const match = value.match(/https?:\/{1,2}[^\s|\]]+/i);
  const raw = match ? match[0] : value;
  return raw.replace(/^https:\/([^/])/i, "https://$1").replace(/^http:\/([^/])/i, "http://$1");
};

const encodeStorageKey = (key: string): string => {
  // Preserve slashes; encode each segment defensively so filenames with
  // spaces or non-ASCII characters still round-trip through the URL parser
  // in the edge function.
  try {
    return key.split("/").map((seg) => encodeURIComponent(decodeURIComponent(seg))).join("/");
  } catch {
    return key;
  }
};

export const normalizeProfileMediaUrl = (url?: string | null): string | null => {
  if (!url) return null;
  const trimmed = extractFirstUrl(url.trim());
  if (!trimmed) return null;

  // 1) Legacy full storage URL → route through public-profile-avatar.
  const legacyFaceMatch = trimmed.match(LEGACY_FACE_STORAGE_PATTERN);
  if (legacyFaceMatch?.[1]) {
    return `${SUPABASE_URL}/functions/v1/public-profile-avatar/${encodeStorageKey(legacyFaceMatch[1])}`;
  }

  // 2) Bare bucket path (`face-verification/<uuid>/<folder>/<file>`) →
  //    public-profile-avatar edge fn. This is the canonical case for
  //    face-verification-approved profiles (Aliyah, Zuni, Manuela, …).
  const bareFaceMatch = trimmed.match(BARE_FACE_STORAGE_PATTERN);
  if (bareFaceMatch?.[1]) {
    return `${SUPABASE_URL}/functions/v1/public-profile-avatar/${encodeStorageKey(bareFaceMatch[1])}`;
  }

  if (trimmed.startsWith("http") || trimmed.startsWith("/")) return trimmed;
  if (trimmed.includes("/storage/v1/object/public/")) {
    return `${SUPABASE_URL}${trimmed.startsWith("/") ? "" : "/"}${trimmed}`;
  }

  return null;
};