import { ComponentProps, useMemo } from "react";
import { AvatarImage } from "@/components/ui/avatar";
import { getDisplayAvatar, PlaceholderGender } from "@/utils/placeholderAvatar";

interface UserAvatarImageProps extends Omit<ComponentProps<typeof AvatarImage>, "src"> {
  src?: string | null;
  seed?: string | null;
  gender?: PlaceholderGender;
}

let counter = 0;

export function UserAvatarImage({ src, seed, gender, ...rest }: UserAvatarImageProps) {
  // Per-instance unique fallback so rows without a seed still get distinct
  // placeholder photos instead of every row collapsing to the same image.
  const instanceSeed = useMemo(() => `auto-${++counter}-${Math.random().toString(36).slice(2)}`, []);
  const effectiveSeed = seed || src || instanceSeed;
  const resolved = getDisplayAvatar(effectiveSeed, src, { gender });
  return <AvatarImage src={resolved} {...rest} />;
}
