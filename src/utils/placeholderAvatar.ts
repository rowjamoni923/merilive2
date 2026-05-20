// Unlimited unique placeholder avatars for profiles without an uploaded photo.
// - Deterministically generated per profile UUID via DiceBear (runs 100% in-app, no network).
// - Female pool → `lorelei` style (illustrated female portraits) for hosts / unspecified gender.
// - Male pool → `notionists` style (illustrated male portraits) for male users.
// - Output is a data: URI SVG, so every profile gets a truly unique avatar that
//   never collides with another — no fixed 6/12 photo pool.
// Owner-side surfaces (own profile/edit, admin moderation) MUST pass isOwner=true
// so the real (empty) state shows — owner should never see a generated placeholder of themselves.
import { createAvatar } from "@dicebear/core";
import { lorelei, notionists } from "@dicebear/collection";

export type PlaceholderGender = "female" | "male" | null | undefined;

// In-memory cache so we don't re-generate the same SVG on every render.
const cache = new Map<string, string>();

export function getPlaceholderAvatar(profileId: string, gender?: PlaceholderGender): string {
  const seed = profileId || "anonymous";
  const isMale = gender === "male";
  const key = `${isMale ? "m" : "f"}:${seed}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const common = {
    seed,
    size: 256,
    radius: 50,
    backgroundType: ["gradientLinear", "solid"] as ("gradientLinear" | "solid")[],
    backgroundColor: isMale
      ? ["1e3a8a", "0f172a", "374151", "065f46", "3730a3", "7c2d12"]
      : ["fce7f3", "fbcfe8", "fed7aa", "fef3c7", "ddd6fe", "e0e7ff"],
  };
  const svg = (isMale
    ? createAvatar(notionists, common)
    : createAvatar(lorelei, common)
  ).toDataUri();

  cache.set(key, svg);
  return svg;
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
 * Resolve the avatar to display on viewer-facing surfaces (homepage feed,
 * discover, leaderboard, profile-detail viewed by someone else, premium live card).
 *
 * - If the profile has an avatar → return it as-is.
 * - Else if isOwner → return empty string (owner sees their real blank state).
 * - Else → return a deterministic, unique generated portrait
 *   (female style for hosts/default, male style when gender='male').
 *
 * NEVER use on the owner's own edit/settings screen or admin moderation
 * panels without passing isOwner=true (admin should also pass isOwner=true
 * — they need to see truth, not the placeholder).
 */
export function getDisplayAvatar(
  profileId: string,
  avatarUrl?: string | null,
  opts: DisplayAvatarOpts = {},
): string {
  if (avatarUrl && avatarUrl.trim().length > 0) return avatarUrl;
  if (opts.isOwner) return "";
  return getPlaceholderAvatar(profileId, opts.gender);
}
