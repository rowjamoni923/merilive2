import { cn } from "@/lib/utils";
import Premium3DFrame from "./Premium3DFrame";

interface FramedAvatarProps {
  src?: string | null;
  name?: string;
  level?: number;
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
 * FramedAvatar - A reusable avatar component with Premium 3D animated level frame
 * Use this component everywhere to show user avatars with their level frames
 */
const FramedAvatar = ({
  src,
  name = "U",
  level = 1,
  size = "md",
  showFrame = true,
  showAnimation = true,
  showGlow = true,
  className,
  avatarClassName,
  fallbackClassName,
  onClick,
}: FramedAvatarProps) => {
  // If no frame needed, just render basic avatar
  if (!showFrame || level < 1) {
    return (
      <Premium3DFrame
        src={src}
        name={name}
        level={0}
        size={size}
        showAnimation={false}
        className={className}
        onClick={onClick}
      />
    );
  }

  return (
    <Premium3DFrame
      src={src}
      name={name}
      level={level}
      size={size}
      showAnimation={showAnimation}
      className={className}
      onClick={onClick}
    />
  );
};

export default FramedAvatar;
