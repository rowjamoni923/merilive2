import { useState, useEffect, useMemo, Suspense } from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { getEquippedPrivilegesForUser, EquippedPrivileges } from "@/hooks/useUserPrivileges";
import { motion } from "framer-motion";
import Premium3DFrame from "./Premium3DFrame";
import { getDisplayAvatar } from "@/utils/placeholderAvatar";
import { normalizeProfileMediaUrl } from "@/utils/profileMediaUrl";
import UniversalFramePlayer from './UniversalFramePlayer';

// Animated frame formats (SVGA / Lottie) can NOT be decoded by an <img> tag —
// they're binary animation containers that need a player. Without this the
// browser shows a broken-image icon with alt text "Frame".

type FrameKind = 'svga' | 'lottie' | 'vap' | 'mp4' | 'webm' | 'gif' | 'webp' | 'static';
const detectFrameType = (url: string): FrameKind => {
  const lower = url.toLowerCase();
  const path = lower.split('?')[0].split('#')[0];
  if (path.endsWith('.svga')) return 'svga';
  if (path.endsWith('.json')) return 'lottie';
  if (path.endsWith('.mp4')) {
    if (lower.includes('vap') || lower.includes('_bmp') || lower.includes('file_vap_')) return 'vap';
    return 'mp4';
  }
  if (path.endsWith('.webm')) return 'webm';
  if (path.endsWith('.gif')) return 'gif';
  if (path.endsWith('.webp')) return 'webp';
  return 'static';
};
import {
  getCachedGender,
  getCachedViewerId,
  requestGender,
  ensureViewerLoaded,
} from "@/utils/avatarGenderCache";

interface FramedAvatarWithPrivilegesProps {
  userId: string;
  src?: string | null;
  name?: string;
  level?: number;
  /** When known, callers can pass gender to skip the cache lookup. */
  gender?: 'male' | 'female' | null;
  /** Force owner-mode. When undefined, auto-detect via signed-in viewer. */
  isOwner?: boolean;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
  showFrame?: boolean;
  showAnimation?: boolean;
  showGlow?: boolean;
  className?: string;
  avatarClassName?: string;
  fallbackClassName?: string;
  onClick?: () => void;
}


const avatarSizeClasses = {
  xs: "w-6 h-6",
  sm: "w-10 h-10",
  md: "w-14 h-14",
  lg: "w-20 h-20",
  xl: "w-28 h-28",
  "2xl": "w-36 h-36",
};

// Frame container matches avatar EXACTLY (parity with AvatarWithFrame used on
// the gifting / home / chat surfaces). The frame artwork is rendered as an
// absolute overlay that extends slightly past the avatar disc via a small
// negative inset, so the ring sits flush around the avatar with no gap.
const frameSizeClasses = avatarSizeClasses;

const frameInsetPx: Record<keyof typeof avatarSizeClasses, number> = {
  xs: -3,
  sm: -4,
  md: -6,
  lg: -8,
  xl: -10,
  "2xl": -12,
};

const fallbackTextSizes = {
  xs: "text-[8px]",
  sm: "text-xs",
  md: "text-sm",
  lg: "text-xl",
  xl: "text-2xl",
  "2xl": "text-3xl",
};

// Glow colors based on level
const getGlowColor = (level: number) => {
  if (level >= 50) return "rgba(251, 191, 36, 0.6)"; // Gold
  if (level >= 40) return "rgba(249, 115, 22, 0.5)"; // Orange
  if (level >= 30) return "rgba(236, 72, 153, 0.5)"; // Pink
  if (level >= 20) return "rgba(168, 85, 247, 0.5)"; // Purple
  if (level >= 10) return "rgba(59, 130, 246, 0.4)"; // Blue
  return "rgba(139, 92, 246, 0.3)"; // Light purple
};

/**
 * FramedAvatarWithPrivileges - Avatar component that shows purchased/unlocked frames
 * The frame itself is animated with effects around it (not below or separate)
 */
const FramedAvatarWithPrivileges = ({
  userId,
  src,
  name = "U",
  level = 1,
  gender: genderProp,
  isOwner: isOwnerProp,
  size = "md",
  showFrame = true,
  showAnimation = true,
  showGlow = true,
  className,
  avatarClassName,
  fallbackClassName,
  onClick,
}: FramedAvatarWithPrivilegesProps) => {
  const [privileges, setPrivileges] = useState<EquippedPrivileges | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (userId) {
      loadPrivileges();
    }
  }, [userId]);

  const loadPrivileges = async () => {
    setIsLoading(true);
    const equipped = await getEquippedPrivilegesForUser(userId);
    setPrivileges(equipped);
    setIsLoading(false);
  };

  // ───────── Gender-aware AI placeholder resolution ─────────
  const hasRealSrc = !!(src && src.trim().length > 0);
  const cached = userId ? getCachedGender(userId) : undefined;
  const initialGender: 'male' | 'female' | null =
    genderProp ??
    (cached
      ? (cached.is_host || cached.gender === 'female' ? 'female' : (cached.gender === 'male' ? 'male' : null))
      : null);
  const [resolvedGender, setResolvedGender] = useState<'male' | 'female' | null>(initialGender);
  const [viewerId, setViewerId] = useState<string | null>(getCachedViewerId());

  useEffect(() => {
    if (hasRealSrc || !userId || genderProp || resolvedGender) return;
    let cancelled = false;
    requestGender(userId).then(() => {
      if (cancelled) return;
      const c = getCachedGender(userId);
      if (!c) return;
      setResolvedGender(
        c.is_host || c.gender === 'female' ? 'female' : c.gender === 'male' ? 'male' : null,
      );
    });
    return () => { cancelled = true; };
  }, [userId, hasRealSrc, genderProp, resolvedGender]);

  useEffect(() => {
    if (viewerId || isOwnerProp !== undefined) return;
    let cancelled = false;
    ensureViewerLoaded().then(() => {
      if (cancelled) return;
      const id = getCachedViewerId();
      if (id) setViewerId(id);
    });
    return () => { cancelled = true; };
  }, [viewerId, isOwnerProp]);

  const isOwner = isOwnerProp !== undefined
    ? isOwnerProp
    : !!(userId && viewerId && userId === viewerId);

  const effectiveSrc = useMemo(() => {
    if (hasRealSrc) return normalizeProfileMediaUrl(src) || src!;
    if (!userId) return undefined;
    if (isOwner) return undefined;
    return getDisplayAvatar(userId, null, { gender: resolvedGender ?? 'female' });
  }, [hasRealSrc, src, userId, isOwner, resolvedGender]);

  const displayName = name?.charAt(0)?.toUpperCase() || "U";
  const glowColor = getGlowColor(level);


  // Check if user has a custom frame
  const customFrame = privileges?.frame || privileges?.portrait_frame;
  const frameUrl = customFrame?.animation_file_url || customFrame?.animation_url || customFrame?.preview_url;
  const frameType = frameUrl ? detectFrameType(frameUrl) : 'static';
  // Anything that an <img> tag cannot decode must go through the universal player.
  const isAnimatedFrame = frameType === 'svga' || frameType === 'lottie' || frameType === 'vap' || frameType === 'mp4' || frameType === 'webm';

  const avatarContent = (
    <Avatar
      className={cn(
        avatarSizeClasses[size],
        "border-2 border-white/30 shadow-lg",
        avatarClassName
      )}
      onClick={onClick}
    >
      <AvatarImage
        src={effectiveSrc || undefined}
        className="object-cover w-full h-full"
      />
      <AvatarFallback
        className={cn(
          "bg-gradient-to-br from-purple-500 to-pink-500 text-white font-bold",
          fallbackTextSizes[size],
          fallbackClassName
        )}
      >
        {displayName}
      </AvatarFallback>
    </Avatar>
  );

  // If no frame should be shown
  if (!showFrame || level < 1) {
    return (
      <div className={className} onClick={onClick}>
        {avatarContent}
      </div>
    );
  }

  // If user has a custom purchased frame - show animated frame around avatar
  if (frameUrl && !isLoading) {
    return (
      <div className={cn("relative inline-block", className)} onClick={onClick}>
        {/* Main container with frame */}
        <div className={cn("relative", frameSizeClasses[size])}>
          
          {/* Animated Glow Effect - Around the frame (outer ring) */}
          {showGlow && showAnimation && level >= 5 && (
            <motion.div
              className="absolute -inset-1 rounded-full pointer-events-none"
              style={{
                background: `radial-gradient(circle, ${glowColor} 0%, transparent 70%)`,
                filter: "blur(6px)",
              }}
              animate={{
                opacity: [0.5, 0.9, 0.5],
                scale: [1, 1.08, 1],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          )}

          {/* Rotating particle ring - Around the frame sides */}
          {showAnimation && level >= 10 && (
            <motion.div
              className="absolute -inset-1 rounded-full pointer-events-none"
              animate={{ rotate: 360 }}
              transition={{
              }}
            >
              {[0, 60, 120, 180, 240, 300].map((angle, i) => (
                <motion.div
                  key={i}
                  className="absolute w-1.5 h-1.5 rounded-full"
                  style={{
                    boxShadow: `0 0 6px ${glowColor}`,
                    top: "50%",
                    left: "50%",
                    transform: `rotate(${angle}deg) translateX(${size === 'xs' ? 14 : size === 'sm' ? 20 : 24}px) translateY(-50%)`,
                  }}
                  animate={{
                  }}
                  transition={{
                    delay: i * 0.2,
                  }}
                />
              ))}
            </motion.div>
          )}

          {/* Shimmer effect on frame - moves across the frame */}
          {showAnimation && level >= 15 && (
            <motion.div
              className="absolute inset-0 rounded-full pointer-events-none overflow-hidden"
              style={{ zIndex: 15 }}
            >
              <motion.div
                className="absolute inset-0"
                style={{
                }}
                animate={{
                  x: ["-100%", "200%"],
                }}
                transition={{
                  repeatDelay: 1.5,
                }}
              />
            </motion.div>
          )}

          {/* The Animated Frame - extends slightly past the avatar disc.
              SVGA/Lottie need a player (an <img> tag can't decode them and
              would show broken-image alt text). Static/GIF/WebP render as
              a regular <img>. */}
          {isAnimatedFrame ? (
            <div
              className="absolute pointer-events-none"
              style={{
                inset: frameInsetPx[size],
                width: `calc(100% + ${Math.abs(frameInsetPx[size]) * 2}px)`,
                height: `calc(100% + ${Math.abs(frameInsetPx[size]) * 2}px)`,
                zIndex: 20,
              }}
            >
              <Suspense fallback={null}>
                <UniversalFramePlayer
                  src={frameUrl!}
                  type={frameType as any}
                  className="w-full h-full"
                  loop
                  autoPlay
                />
              </Suspense>
            </div>
          ) : (
            <motion.img
              src={frameUrl}
              alt=""
              className="absolute w-auto h-auto object-contain pointer-events-none"
              style={{
              }}
              animate={showAnimation ? {
                  ? ["brightness(1)", "brightness(1.15)", "brightness(1)"]
                  : undefined,
              } : {}}
              transition={{
              }}
            />
          )}
          
          {/* Avatar fills the entire container — no inner padding gap */}
          <div 
            className="absolute inset-0 flex items-center justify-center"
            style={{ zIndex: 10 }}
          >
            {avatarContent}
          </div>


          {/* Sparkle effects on frame edges for high levels */}
          {showAnimation && level >= 25 && (
            <>
              {[0, 90, 180, 270].map((angle, i) => (
                <motion.div
                  key={`sparkle-${i}`}
                  className="absolute text-xs pointer-events-none"
                  style={{
                  }}
                  animate={{
                  }}
                  transition={{
                  }}
                >
                  ✨
                </motion.div>
              ))}
            </>
          )}
        </div>
      </div>
    );
  }

  // Fall back to Premium3DFrame (with 3D animation on the frame)
  // Pass userId for unified frame fetching
  return (
    <Premium3DFrame
      src={effectiveSrc}
      name={name}
      level={level}
      size={size}
      showAnimation={showAnimation}
      className={className}
      onClick={onClick}
      userId={userId}
    />
  );
};

export default FramedAvatarWithPrivileges;
