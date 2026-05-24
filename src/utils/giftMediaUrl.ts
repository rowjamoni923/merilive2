const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://ayjdlvuurscxucatbbah.supabase.co";

// Stop at first whitespace, pipe, closing bracket, query, or hash so callers
// that accidentally pass a full chat-message string (e.g. "[Gift: <url>|...]")
// don't end up with the descriptive text glued onto the storage key.
const LEGACY_CHAT_MEDIA_GIFT_PUBLIC_PATTERN = /\/storage\/v1\/object\/public\/chat-media\/(gifts\/[^\s|?#\]]+)/i;

const extractFirstUrl = (value: string): string => {
  // If the input looks like a wrapped chat payload (e.g. "[Gift: https://...|emoji name]"),
  // pull out the first http(s) URL fragment that stops at whitespace / pipe / bracket.
  const match = value.match(/https?:\/{1,2}[^\s|\]]+/i);
  const raw = match ? match[0] : value;
  return raw.replace(/^https:\/([^/])/i, "https://$1").replace(/^http:\/([^/])/i, "http://$1");
};

export const normalizeGiftMediaUrl = (url?: string | null): string | null => {
  if (!url) return null;
  const trimmed = extractFirstUrl(url.trim());
  if (!trimmed) return null;

  const legacyMatch = trimmed.match(LEGACY_CHAT_MEDIA_GIFT_PUBLIC_PATTERN);
  if (legacyMatch?.[1]) {
    return `${SUPABASE_URL}/functions/v1/public-gift-media/${legacyMatch[1]}`;
  }

  if (/^gifts\/[A-Za-z0-9._~!$&'()+,;=:@/-]+$/i.test(trimmed)) {
    return `${SUPABASE_URL}/functions/v1/public-gift-media/${trimmed}`;
  }

  if (trimmed.startsWith("http") || trimmed.startsWith("/")) return trimmed;
  if (trimmed.includes("/storage/v1/object/public/")) {
    return `${SUPABASE_URL}${trimmed.startsWith("/") ? "" : "/"}${trimmed}`;
  }

  return null;
};

export const isHeavyGiftMedia = (url?: string | null): boolean => {
  const clean = (url || "").split("?")[0].toLowerCase();
  return /\.(svga|json)$/.test(clean);
};