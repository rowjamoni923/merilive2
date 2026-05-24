const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://ayjdlvuurscxucatbbah.supabase.co";

const LEGACY_FACE_PUBLIC_PATTERN = /\/storage\/v1\/object\/public\/face-verification\/([^\s|?#\]]+)/i;

const extractFirstUrl = (value: string): string => {
  const match = value.match(/https?:\/{1,2}[^\s|\]]+/i);
  const raw = match ? match[0] : value;
  return raw.replace(/^https:\/([^/])/i, "https://$1").replace(/^http:\/([^/])/i, "http://$1");
};

export const normalizeProfileMediaUrl = (url?: string | null): string | null => {
  if (!url) return null;
  const trimmed = extractFirstUrl(url.trim());
  if (!trimmed) return null;

  const legacyFaceMatch = trimmed.match(LEGACY_FACE_PUBLIC_PATTERN);
  if (legacyFaceMatch?.[1]) {
    return `${SUPABASE_URL}/functions/v1/public-profile-avatar/${legacyFaceMatch[1]}`;
  }

  if (trimmed.startsWith("http") || trimmed.startsWith("/")) return trimmed;
  if (trimmed.includes("/storage/v1/object/public/")) {
    return `${SUPABASE_URL}${trimmed.startsWith("/") ? "" : "/"}${trimmed}`;
  }

  return null;
};