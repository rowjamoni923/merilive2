const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://ayjdlvuurscxucatbbah.supabase.co";

// Stop at first whitespace, pipe, closing bracket, query, or hash so callers
// that accidentally pass a full chat-message string (e.g. "[Gift: <url>|...]")
// don't end up with the descriptive text glued onto the storage key.
const LEGACY_CHAT_MEDIA_GIFT_PUBLIC_PATTERN = /\/storage\/v1\/object\/public\/chat-media\/(gifts\/[^\s|?#\]]+)/i;
const GIFTS_BUCKET_PUBLIC_PATTERN = /\/storage\/v1\/object\/public\/gifts\/([^\s|?#\]]+)/i;

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

  // 1. If it's a full URL pointing to the gifts bucket, redirect through the public proxy
  // to ensure it works even if the bucket permissions are restrictive (or for CDN caching).
  const giftsPublicMatch = trimmed.match(GIFTS_BUCKET_PUBLIC_PATTERN);
  if (giftsPublicMatch?.[1]) {
    // We pass the "gifts/" prefix to the proxy so it knows which bucket to target,
    // but the edge function is now smart enough to try both with and without it.
    return `${SUPABASE_URL}/functions/v1/public-gift-media/gifts/${giftsPublicMatch[1]}`;
  }

  // 2. Legacy chat-media/gifts paths
  const legacyMatch = trimmed.match(LEGACY_CHAT_MEDIA_GIFT_PUBLIC_PATTERN);
  if (legacyMatch?.[1]) {
    return `${SUPABASE_URL}/functions/v1/public-gift-media/${legacyMatch[1]}`;
  }

  // 3. Short paths like "gifts/pro/foo.mp4"
  if (/^gifts\/[A-Za-z0-9._~!$&'()+,;=:@/-]+$/i.test(trimmed)) {
    return `${SUPABASE_URL}/functions/v1/public-gift-media/${trimmed}`;
  }

  // 4. Any other full URL or absolute path
  if (trimmed.startsWith("http") || trimmed.startsWith("/")) return trimmed;
  
  // 5. Relative storage paths
  if (trimmed.includes("/storage/v1/object/public/")) {
    return `${SUPABASE_URL}${trimmed.startsWith("/") ? "" : "/"}${trimmed}`;
  }

  return null;
};

export const isHeavyGiftMedia = (url?: string | null): boolean => {
  const clean = (url || "").split("?")[0].toLowerCase();
  return /\.(svga|json|mp4|webm)$/.test(clean);
};

export const isGiftUrl = (text?: string | null): boolean => {
  if (!text) return false;
  
  // 1. Check for explicit [GIFT:url] wrapper
  if (text.includes('[GIFT:')) return true;

  // 2. Check for storage paths (more specific to avoid greedy matches)
  const hasStoragePath = 
    text.includes('/storage/v1/object/public/gifts/') ||
    text.includes('/storage/v1/object/public/chat-media/gifts/') ||
    text.includes('/functions/v1/public-gift-media/');
    
  if (hasStoragePath) return true;

  // 3. Check for raw gifts/ prefix (used in some internal messages)
  if (/^gifts\/[^\s]+/.test(text.trim())) return true;

  return false;
};
