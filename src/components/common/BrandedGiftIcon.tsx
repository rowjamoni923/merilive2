import { cn } from "@/lib/utils";
import icon3dGift from "@/assets/icon-3d-gift.png";

interface BrandedGiftIconProps {
  className?: string;
  fallbackSize?: number;
  alt?: string;
}

/**
 * Unified premium 3D gift trigger icon used across Chat / LiveStream /
 * PartyRoom / PrivateCall / ProfileDetail. Single source of truth.
 */
export const BrandedGiftIcon = ({ className, alt = "Gift" }: BrandedGiftIconProps) => (
  <img
    src={icon3dGift}
    alt={alt}
    width={512}
    height={512}
    loading="lazy"
    draggable={false}
    className={cn("object-contain select-none pointer-events-none", className)}
  />
);

export default BrandedGiftIcon;
