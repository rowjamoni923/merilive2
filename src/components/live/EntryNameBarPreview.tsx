import { memo } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import UniversalFramePlayer from "@/components/common/UniversalFramePlayer";
import { getLevelBadgeBg, getLevelTextColor, ensureValidLevel } from "@/features/shared/level";
import { getDisplayAvatar } from "@/utils/getDisplayAvatar";
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

/**
 * Shared preview for "Entry Name Bar" privileges — composites the SVGA / VAP
 * / Lottie / image animation underneath the engraved avatar + name + level
 * overlay using the SAME percentages as the in-room `EntryNameBarAnimation`,
 * so the preview shown in VIP Membership > Mine and Shop matches the actual
 * in-room render 1:1. Animation loops so the user always sees motion together
 * with the engraved content — never frozen.
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
  const hasAnim = !!animationUrl;

  return (
    <div
      className={cn(
        "relative w-full aspect-[1024/280] overflow-hidden",
        className,
      )}
    >
      {/* Layer 1: animation OR static preview */}
      {hasAnim ? (
        <UniversalFramePlayer
          src={animationUrl!}
          className="absolute inset-0 w-full h-full"
          loop
          autoPlay
          muted
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

      {/* Layer 2: engraved avatar + name + level — IDENTICAL slot to
          EntryNameBarAnimation so preview matches in-room exactly. */}
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
