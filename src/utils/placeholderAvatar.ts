// Unlimited unique placeholder avatars for profiles without an uploaded photo.
// - 100% REAL professional photos (NO cartoons, NO illustrations).
// - Female pool → real women portraits.
// - Male pool   → real men portraits.
// - Source: randomuser.me CDN (free, unlimited, royalty-free portrait set
//   of 100 women + 100 men). Deterministic per profile id via a stable hash,
//   so each profile always gets the same photo and different profiles get
//   different photos.
// Owner-side surfaces (own profile/edit, admin moderation) MUST pass isOwner=true
// so the real (empty) state shows — owner should never see a generated placeholder of themselves.

export type PlaceholderGender = "female" | "male" | null | undefined;

const FEMALE_POOL_SIZE = 100;
const MALE_POOL_SIZE = 100;

// Stable, fast string hash (FNV-1a 32-bit). Deterministic across runs.
function hashToIndex(seed: string, mod: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h % mod;
}

const cache = new Map<string, string>();

export function getPlaceholderAvatar(profileId: string, gender?: PlaceholderGender): string {
  const seed = profileId || "anonymous";
  const isMale = gender === "male";
  const key = `${isMale ? "m" : "f"}:${seed}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const idx = hashToIndex(seed, isMale ? MALE_POOL_SIZE : FEMALE_POOL_SIZE);
  const bucket = isMale ? "men" : "women";
  const url = `https://randomuser.me/api/portraits/${bucket}/${idx}.jpg`;

  cache.set(key, url);
  return url;
}

export interface DisplayAvatarOpts {
  /** 'female' | 'male'. Female = default (hosts). */
  gender?: PlaceholderGender;
  /**
   * True when the currently-signed-in viewer IS the profile owner.
   * Owners always see the real (possibly empty) avatar so they're nudged
   * to upload — never the generated placeholder of themselves.
   */
  isOwner?: boolean;
}

/**
 * Resolve the avatar to display on viewer-facing surfaces.
 * - Real avatar URL → returned as-is.
 * - Owner with no avatar → empty string (real blank state).
 * - Otherwise → deterministic real-photo placeholder (gender-matched).
 */
import { normalizeProfileMediaUrl } from "./profileMediaUrl";

export function getDisplayAvatar(
  profileId: string,
  avatarUrl?: string | null,
  _opts: DisplayAvatarOpts = {},
): string {
  // Normalize first — fixes legacy private-bucket face-verification URLs so
  // admin panel and viewer surfaces render real uploaded photos correctly.
  const normalized = normalizeProfileMediaUrl(avatarUrl);
  if (normalized && normalized.trim().length > 0) return normalized;
  // No generated / third-party placeholder photos. Every user has their own
  // uploaded avatar + face-verification photos; when a URL is genuinely missing
  // we return empty so the AvatarFallback (initials) renders instead of a
  // fake stock portrait from randomuser.me.
  return "";
}

// Kept as a no-op so any lingering imports don't crash. Never returns a
// third-party portrait anymore.
export function getPlaceholderAvatarSafe(_profileId: string, _gender?: PlaceholderGender): string {
  return "";
}

