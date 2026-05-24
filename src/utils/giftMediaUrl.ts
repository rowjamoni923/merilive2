const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://ayjdlvuurscxucatbbah.supabase.co";

const LEGACY_CHAT_MEDIA_GIFT_PUBLIC_PATTERN = /\/storage\/v1\/object\/public\/chat-media\/(gifts\/[^?#]+)/i;

export const normalizeGiftMediaUrl = (url?: string | null): string | null => {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  const legacyMatch = trimmed.match(LEGACY_CHAT_MEDIA_GIFT_PUBLIC_PATTERN);
  if (legacyMatch?.[1]) {
    return `${SUPABASE_URL}/functions/v1/public-gift-media/${legacyMatch[1]}`;
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