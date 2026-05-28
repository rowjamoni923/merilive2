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
