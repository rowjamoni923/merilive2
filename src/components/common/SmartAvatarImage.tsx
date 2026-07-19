// Drop-in replacement for shadcn <AvatarImage> that GUARANTEES a real-photo
// placeholder (NEVER a cartoon) for any viewer-facing avatar in the app.
//
// Usage:
//   <Avatar>
//     <SmartAvatarImage src={user.avatar_url} userId={user.id} />
//     <AvatarFallback>…</AvatarFallback>
//   </Avatar>
//
// Resolution rules:
//   1. Real `src` (http(s) or data URI) → render as-is.
//   2. Else if viewer === owner (auto-detected from userId) → render empty
//      so AvatarFallback shows (owner sees their real blank state).
//   3. Else → render a deterministic REAL-PHOTO portrait, gender-matched:
//        female / null gender → women pool
//        male → men pool
//      Gender is fetched once per user via the batched gender cache,
//      then memoized for the rest of the session.
//
// This component MUST be used everywhere a public user/profile avatar is
// shown to other viewers. Owner-facing screens (own profile, edit, admin
// moderation) can keep raw <AvatarImage> since blank-state is intentional.

import React, { useEffect, useState } from "react";
import { AvatarImage } from "@/components/ui/avatar";
import { getDisplayAvatar } from "@/utils/placeholderAvatar";
import {
  getCachedGender,
  getCachedViewerId,
  requestGender,
  ensureViewerLoaded,
} from "@/utils/avatarGenderCache";

export interface SmartAvatarImageProps
  extends Omit<React.ComponentProps<typeof AvatarImage>, "src"> {
  /** Real avatar URL, if any. */
  src?: string | null;
  /** Profile UUID — used both for owner-detection and as the placeholder seed. */
  userId?: string | null;
  /** Stable fallback seed when userId is unknown (e.g. display name). */
  seed?: string | null;
  /** Known gender — skips the cache lookup. */
  gender?: "male" | "female" | null;
  /** Force owner mode (renders empty so AvatarFallback shows). */
  isOwner?: boolean;
}

export const SmartAvatarImage: React.FC<SmartAvatarImageProps> = ({
  src,
  userId,
  seed,
  gender: explicitGender,
  isOwner: explicitIsOwner,
  ...rest
}) => {
  const [, tick] = useState(0);

  useEffect(() => {
    if (src && src.trim().length > 0) return; // real photo, nothing to fetch
    if (explicitGender || explicitIsOwner !== undefined) return;
    if (!userId) return;

    let cancelled = false;
    Promise.all([ensureViewerLoaded(), requestGender(userId)]).then(() => {
      if (!cancelled) tick((x) => x + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [src, userId, explicitGender, explicitIsOwner]);

  // Real photo wins.
  if (src && src.trim().length > 0) {
    return <AvatarImage src={src} {...rest} />;
  }

  // Owner sees blank (real state) — never a placeholder of themselves.
  const viewerId = getCachedViewerId();
  const isOwner =
    explicitIsOwner ?? (!!userId && !!viewerId && userId === viewerId);
  if (isOwner) return <AvatarImage src="" {...rest} />;

  const cached = userId ? getCachedGender(userId) : undefined;
  const resolvedGender = explicitGender ?? cached?.gender ?? null;
  const placeholderSeed = userId || seed || "anonymous";
  const url = getDisplayAvatar(placeholderSeed, null, {
  });

  return <AvatarImage src={url} {...rest} />;
};

export default SmartAvatarImage;
