// Stable AI placeholder avatars for approved hosts without an uploaded photo.
// Mapping is deterministic per host UUID so the same host always shows the same image.
import a01 from "@/assets/placeholder-avatars/avatar_01.jpg";
import a02 from "@/assets/placeholder-avatars/avatar_02.jpg";
import a03 from "@/assets/placeholder-avatars/avatar_03.jpg";
import a04 from "@/assets/placeholder-avatars/avatar_04.jpg";
import a05 from "@/assets/placeholder-avatars/avatar_05.jpg";
import a06 from "@/assets/placeholder-avatars/avatar_06.jpg";
import a07 from "@/assets/placeholder-avatars/avatar_07.jpg";
import a08 from "@/assets/placeholder-avatars/avatar_08.jpg";
import a09 from "@/assets/placeholder-avatars/avatar_09.jpg";
import a10 from "@/assets/placeholder-avatars/avatar_10.jpg";
import a11 from "@/assets/placeholder-avatars/avatar_11.jpg";
import a12 from "@/assets/placeholder-avatars/avatar_12.jpg";

const POOL = [a01, a02, a03, a04, a05, a06, a07, a08, a09, a10, a11, a12];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function getPlaceholderAvatar(hostId: string): string {
  if (!hostId) return POOL[0];
  return POOL[hashStr(hostId) % POOL.length];
}

/**
 * Resolve the avatar to display on viewer-facing surfaces (homepage feed,
 * discover, leaderboards). If the host hasn't uploaded one, returns a stable
 * AI-generated placeholder. NEVER use on the host's own profile/edit screen
 * or in admin moderation panels.
 */
export function getDisplayAvatar(hostId: string, avatarUrl?: string | null): string {
  if (avatarUrl && avatarUrl.trim().length > 0) return avatarUrl;
  return getPlaceholderAvatar(hostId);
}
