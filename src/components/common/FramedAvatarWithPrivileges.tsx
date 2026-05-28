import AvatarWithFrame from "./AvatarWithFrame";

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
  onClick,
}: FramedAvatarWithPrivilegesProps) => {
  return (
    <AvatarWithFrame
      userId={userId}
      src={src}
      name={name}
      level={level}
      size={size}
      gender={genderProp}
      isOwner={isOwnerProp}
      showFrame={showFrame}
      showAnimation={showAnimation}
      showGlow={showGlow}
      className={className}
      avatarClassName={avatarClassName}
      onClick={onClick}
    />
  );
};

export default FramedAvatarWithPrivileges;
