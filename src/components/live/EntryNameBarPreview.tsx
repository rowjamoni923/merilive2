import { memo, useMemo } from "react";
import { motion } from "framer-motion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import EntryAnimationFrame from "@/components/entry/EntryAnimationFrame";
import { getLevelBadgeBg, getLevelTextColor, ensureValidLevel } from "@/features/shared/level";
import { getDisplayAvatar } from "@/utils/placeholderAvatar";
import { enhanceThumbnail } from "@/utils/enhanceThumbnail";
import { cn } from "@/lib/utils";

interface EntryNameBarPreviewProps {
  animationUrl?: string | null;
  previewUrl?: string | null;
  userName: string;
  avatarUrl?: string | null;
  level: number;
  className?: string;
}

const detectType = (url: string): "svga" | "gif" | "image" | "vap" | null => {
  const u = url.split("?")[0].toLowerCase();
  if (u.endsWith(".svga")) return "svga";
  if (u.endsWith(".mp4") || u.endsWith(".webm") || u.endsWith(".mov")) return "vap";
  if (u.endsWith(".gif")) return "gif";
  if (u.endsWith(".webp") || u.endsWith(".png") || u.endsWith(".jpg") || u.endsWith(".jpeg")) return "image";
  return null;
};

/**
 * Shared "Entry Name Bar" preview. Routes through `EntryAnimationFrame` with
 * dynamic avatar/name/level so SVGA templates engrave the user's info INSIDE
 * the canvas — animation + name + photo + level all animate together as one
 * unit, frame-perfectly synced, never frozen and never separately. Mirrors
 * the in-room `EntryNameBarAnimation` behavior 1:1.
 *
 * For non-SVGA (GIF/image/VAP) where SVGA dynamic compositing isn't available,
 * we still animate the whole composite as one unit using a synchronized
 * slide-in motion loop, so the user always sees the engraved entry effect.
 */
const EntryNameBarPreview = memo(({
  animationUrl,
  previewUrl,
  userName,
  avatarUrl,
  level,
  className,
}: EntryNameBarPreviewProps) => {
  const lvl = ensureValidLevel(level);
  const type = useMemo(() => (animationUrl ? detectType(animationUrl) : null), [animationUrl]);
  const isSvga = type === "svga";
  const isVap = type === "vap";

  return (
    <div
      className={cn(
        "relative w-full aspect-[1024/280] overflow-hidden",
        className,
      )}
    >
      {/* SVGA branch — fully self-contained: avatar/name/level engraved
          INSIDE the canvas via dynamic placeholders. Loops continuously. */}
      {isSvga && animationUrl ? (
        <EntryAnimationFrame
          src={animationUrl}
          size="fill"
          type="svga"
          loop
          muted
          volume={0}
          center={false}
          dynamicAvatarUrl={avatarUrl ?? getDisplayAvatar(userName)}
          dynamicUserName={userName}
          dynamicUserLevel={lvl}
        />
      ) : isVap && animationUrl ? (
        <EntryAnimationFrame
          src={animationUrl}
          size="fill"
          type="vap"
          loop
          muted
          volume={0}
          center={false}
        />
      ) : animationUrl ? (
        // GIF / image animated background — looped.
        <img
          src={animationUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 w-full h-full object-contain"
        />
      ) : previewUrl ? (
        <img
          loading="lazy"
          decoding="async"
          src={enhanceThumbnail(previewUrl, { width: 640, quality: 85 })}
          alt=""
          className="absolute inset-0 w-full h-full object-contain"
        />
      ) : null}

      {/* HTML overlay — ALWAYS rendered, sitting engraved INSIDE the ribbon's
          left content slot. Static position (not a separate slide-in) so it
          reads as one unit with the SVGA sparkles/flowers animating around
          it — exactly like the pro reference (17ae). */}
      <div className="absolute top-[28%] bottom-[28%] left-[7%] right-[48%] flex items-center gap-[3%] pointer-events-none">
        <Avatar className="flex-shrink-0 h-full aspect-square ring-2 ring-white/70 shadow-md">
          <AvatarImage
            src={avatarUrl || getDisplayAvatar(userName)}
            alt={userName}
            className="object-cover"
          />
          <AvatarFallback className="bg-gradient-to-br from-violet-600 to-purple-700 text-white text-[10px] font-bold">
            {userName.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>

        <div
          className={cn(
            "flex-shrink-0 h-[55%] aspect-square rounded-full font-black flex items-center justify-center shadow-md text-[10px] leading-none",
            getLevelBadgeBg(lvl),
            getLevelTextColor(lvl),
          )}
        >
          {String(lvl)}
        </div>

        <div className="flex flex-col justify-center min-w-0 flex-1">
          <span
            className="text-white font-black truncate leading-tight text-[13px]"
            style={{ textShadow: "0 1px 3px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,0.7)" }}
          >
            {userName}
          </span>
          <span
            className="text-white/95 font-semibold truncate text-[10px] leading-tight"
            style={{ textShadow: "0 1px 2px rgba(0,0,0,0.8)" }}
          >
            Joined the room
          </span>
        </div>
      </div>
    </div>
  );
});

EntryNameBarPreview.displayName = "EntryNameBarPreview";

export default EntryNameBarPreview;
