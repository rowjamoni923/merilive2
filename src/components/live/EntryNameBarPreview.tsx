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

  const avatar = avatarUrl || getDisplayAvatar(userName);

  return (
    <div
      className={cn(
        "relative w-full aspect-[1024/280] overflow-hidden",
        className,
      )}
    >
      <motion.div
        className="absolute inset-0 origin-left"
        animate={{ x: ["-1.6%", "0%", "1.2%", "0%", "-1.6%"] }}
        transition={{ duration: 2.8, repeat: Infinity, ease: "linear" }}
      >
        {/* Animation and user identity are intentionally inside ONE moving
            composite, so avatar/name/level never look like separate static
            HTML sitting on top of the effect. */}
        {isSvga && animationUrl ? (
          <EntryAnimationFrame
            src={animationUrl}
            size="fill"
            type="svga"
            loop
            muted
            volume={0}
            center={false}
            dynamicAvatarUrl={avatar}
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

        {/* For SVGA, avatar/name/level are engraved INSIDE the canvas via
            dynamic slot injection (Chamet/BIGO parity) — no HTML overlay.
            For non-SVGA (GIF/image/VAP) we render the identity overlay so
            the user still sees their info on top of the static art. */}
        {!isSvga && (
          <div className="absolute top-[31%] bottom-[31%] left-[7.25%] right-[47%] flex items-center gap-[4%] pointer-events-none">
            <div className="relative flex-shrink-0 h-full aspect-square">
              <Avatar className="h-full w-full ring-2 ring-white/75 shadow-md">
                <AvatarImage src={avatar} alt={userName} className="object-cover" />
                <AvatarFallback className="bg-primary text-primary-foreground text-[10px] font-bold">
                  {userName.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div
                className={cn(
                  "absolute -right-[10%] bottom-[-5%] h-[43%] aspect-square rounded-full font-black flex items-center justify-center shadow-md text-[9px] leading-none ring-1 ring-white/80",
                  getLevelBadgeBg(lvl),
                  getLevelTextColor(lvl),
                )}
              >
                {String(lvl)}
              </div>
            </div>
            <div className="flex flex-col justify-center min-w-0 flex-1 pl-[2%]">
              <span
                className="text-primary-foreground font-black truncate leading-tight text-[12px]"
                style={{ textShadow: "0 1px 3px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,0.75)" }}
              >
                {userName}
              </span>
              <span
                className="text-primary-foreground/95 font-semibold truncate text-[9px] leading-tight"
                style={{ textShadow: "0 1px 2px rgba(0,0,0,0.85)" }}
              >
                Joined the room
              </span>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
});

EntryNameBarPreview.displayName = "EntryNameBarPreview";

export default EntryNameBarPreview;
