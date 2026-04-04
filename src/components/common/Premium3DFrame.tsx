/**
 * Premium3DFrame - DEPRECATED: Now a thin wrapper around AvatarWithFrame
 * 
 * This component is kept for backward compatibility.
 * All functionality is now delegated to AvatarWithFrame for consistent frame rendering.
 * 
 * IMPORTANT: Use AvatarWithFrame directly in new code.
 */
import { memo, forwardRef } from "react";
import AvatarWithFrame from "./AvatarWithFrame";

interface Premium3DFrameProps {
  src?: string | null;
  name?: string;
  level?: number;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
  showAnimation?: boolean;
  className?: string;
  onClick?: () => void;
  frameUrl?: string | null;
  frameType?: string | null;
  isHost?: boolean;
  frameId?: string | null;
  userId?: string | null;
}

/**
 * Premium3DFrame is now a wrapper around AvatarWithFrame
 * This ensures consistent frame rendering across the entire app
 */
const Premium3DFrame = memo(forwardRef<HTMLDivElement, Premium3DFrameProps>(({
  src,
  name = "U",
  level = 1,
  size = "md",
  showAnimation = true,
  className,
  onClick,
  frameUrl,
  frameType,
  isHost = false,
  frameId,
  userId,
}, ref) => {
  // Delegate everything to AvatarWithFrame for unified caching and rendering
  return (
    <AvatarWithFrame
      ref={ref}
      userId={userId || undefined}
      src={src}
      name={name}
      level={level}
      isHost={isHost}
      size={size}
      showFrame={true}
      showAnimation={showAnimation}
      showGlow={level >= 10}
      className={className}
      onClick={onClick}
      frameId={frameId || undefined}
    />
  );
}));

Premium3DFrame.displayName = 'Premium3DFrame';

export default Premium3DFrame;
