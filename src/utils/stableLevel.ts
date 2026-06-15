import { pickDisplayLevel, type DisplayLevelProfile } from "@/utils/displayLevel";

export type StableLevelProfile = DisplayLevelProfile & {
  previous_host_level?: number | null;
};

export const getStableDisplayLevel = (
  profile: StableLevelProfile | null | undefined,
  fallback?: number | null,
): number | null => {
  if (!profile) return fallback ?? null;
  const hasAnyLevel = [profile.user_level, profile.host_level, profile.max_user_level, profile.previous_host_level]
    .some((value) => value !== null && value !== undefined);

  if (hasAnyLevel) return pickDisplayLevel(profile);
  return fallback ?? null;
};

export const getRequiredDisplayLevel = (
  profile: StableLevelProfile | null | undefined,
  fallback: number = 1,
): number => getStableDisplayLevel(profile, fallback) ?? fallback;
