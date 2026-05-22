/**
 * Persona-aware level picker for read-only display surfaces
 * (search results, live cards, leaderboards, chat list, message bubbles).
 *
 * Profile pages use `useRealtimeLevelProgress` which does a heavier
 * tier-resolution + self-heal. For lists we cannot afford that per row,
 * so we just pick the right stored field based on persona and never
 * read the wrong one (e.g. female host's stale user_level).
 */
export interface DisplayLevelProfile {
  is_host?: boolean | null;
  gender?: string | null;
  user_level?: number | null;
  host_level?: number | null;
  max_user_level?: number | null;
}

export const isFemaleHostPersona = (
  profile: Pick<DisplayLevelProfile, "is_host" | "gender"> | null | undefined,
): boolean => {
  if (!profile) return false;
  return Boolean(profile.is_host) && String(profile.gender ?? "").toLowerCase() === "female";
};

/**
 * Returns the level number that should be shown to viewers everywhere
 * in the app (badge, avatar frame, leaderboard rank).
 *
 *  - Female hosts → host_level (their persona is "host")
 *  - Everyone else (regular users + male hosts) → max(user_level, max_user_level)
 *    so we never regress when user_level is briefly stale.
 *
 * Returns 1 as the safe floor for non-hosts and 0 for hosts (host can be Lv0).
 */
export const pickDisplayLevel = (
  profile: DisplayLevelProfile | null | undefined,
): number => {
  if (!profile) return 1;
  if (isFemaleHostPersona(profile)) {
    return Math.max(Number(profile.host_level ?? 0), 0);
  }
  const userLevel = Number(profile.user_level ?? 0);
  const maxUserLevel = Number(profile.max_user_level ?? 0);
  return Math.max(userLevel, maxUserLevel, 1);
};
