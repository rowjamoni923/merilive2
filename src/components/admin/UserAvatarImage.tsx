import { ComponentProps } from "react";
import { AvatarImage } from "@/components/ui/avatar";
import { getDisplayAvatar, PlaceholderGender } from "@/utils/placeholderAvatar";

/**
 * Drop-in replacement for shadcn `<AvatarImage>` used across the admin panel.
 *
 * Behavior:
 * - Real avatar URL → normalized + rendered as-is (legacy private-bucket
 *   face-verification URLs are auto-routed through the public-profile-avatar
 *   edge function so they actually load).
 * - Empty/null avatar → deterministic real-photo placeholder so every user
 *   and host card has a face, never a blank initial.
 *
 * `seed` should be the stable row id (user_id / host_id / app.id …). It
 * guarantees the same user always sees the same placeholder. When omitted
 * we fall back to the avatar URL or `src` so equal-row rendering stays
 * consistent within a single list.
 */
interface UserAvatarImageProps extends Omit<ComponentProps<typeof AvatarImage>, "src"> {
  src?: string | null;
  seed?: string | null;
  gender?: PlaceholderGender;
}

export function UserAvatarImage({ src, seed, gender, ...rest }: UserAvatarImageProps) {
  const effectiveSeed = seed || src || "anonymous";
  const resolved = getDisplayAvatar(effectiveSeed, src, { gender });
  return <AvatarImage src={resolved} {...rest} />;
}
