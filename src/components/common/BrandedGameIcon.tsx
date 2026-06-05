import { cn } from "@/lib/utils";
import icon3dGames from "@/assets/icon-3d-games.png";

interface BrandedGameIconProps {
  className?: string;
  alt?: string;
}

/** Unified premium 3D game trigger icon across LiveStream / PartyRoom / Chat. */
export const BrandedGameIcon = ({ className, alt = "Games" }: BrandedGameIconProps) => (
  <img
    src={icon3dGames}
    alt={alt}
    width={512}
    height={512}
    loading="lazy"
    draggable={false}
    className={cn("object-contain select-none pointer-events-none", className)}
  />
);

export default BrandedGameIcon;
