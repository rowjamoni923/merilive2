// Stable AI placeholder avatars for profiles without an uploaded photo.
// - Female pool → hosts (and any female user with no avatar)
// - Male pool → male users with no avatar
// Mapping is deterministic per UUID so the same profile always shows the same image.
// Owner-side surfaces (own profile/edit screen, admin moderation) MUST pass isOwner=true
// so the real (empty) state shows — owner should never see the placeholder of themselves.
import f01 from "@/assets/placeholder-avatars/avatar_01.jpg";
import f02 from "@/assets/placeholder-avatars/avatar_02.jpg";
import f03 from "@/assets/placeholder-avatars/avatar_03.jpg";
import f04 from "@/assets/placeholder-avatars/avatar_04.jpg";
import f05 from "@/assets/placeholder-avatars/avatar_05.jpg";
import f06 from "@/assets/placeholder-avatars/avatar_06.jpg";
import f07 from "@/assets/placeholder-avatars/avatar_07.jpg";
import f08 from "@/assets/placeholder-avatars/avatar_08.jpg";
import f09 from "@/assets/placeholder-avatars/avatar_09.jpg";
import f10 from "@/assets/placeholder-avatars/avatar_10.jpg";
import f11 from "@/assets/placeholder-avatars/avatar_11.jpg";
import f12 from "@/assets/placeholder-avatars/avatar_12.jpg";
import m01 from "@/assets/placeholder-avatars/male_01.jpg";
import m02 from "@/assets/placeholder-avatars/male_02.jpg";
import m03 from "@/assets/placeholder-avatars/male_03.jpg";
import m04 from "@/assets/placeholder-avatars/male_04.jpg";
import m05 from "@/assets/placeholder-avatars/male_05.jpg";
import m06 from "@/assets/placeholder-avatars/male_06.jpg";

const FEMALE_POOL = [f01, f02, f03, f04, f05, f06, f07, f08, f09, f10, f11, f12];
const MALE_POOL = [m01, m02, m03, m04, m05, m06];

export type PlaceholderGender = "female" | "male" | null | undefined;

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function pickPool(gender: PlaceholderGender): string[] {
  // Female = default (hosts / unspecified). Male only when explicitly male.
  return gender === "male" ? MALE_POOL : FEMALE_POOL;
}

export function getPlaceholderAvatar(profileId: string, gender?: PlaceholderGender): string {
  const pool = pickPool(gender);
  if (!profileId) return pool[0];
  return pool[hashStr(profileId) % pool.length];
}

export interface DisplayAvatarOpts {
  /** 'female' | 'male'. Female = default (hosts). */
  gender?: PlaceholderGender;
  /**
   * True when the currently-signed-in viewer IS the profile owner.
   * Owners always see the real (possibly empty) avatar so they're nudged
   * to upload — never the AI placeholder of themselves.
   */
  isOwner?: boolean;
}

/**
 * Resolve the avatar to display on viewer-facing surfaces (homepage feed,
 * discover, leaderboard, profile-detail viewed by someone else, premium live card).
 *
 * - If the profile has an avatar → return it as-is.
 * - Else if isOwner → return empty string (owner sees their real blank state).
 * - Else → return a stable AI placeholder (female pool for hosts/default,
 *   male pool when gender='male').
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
