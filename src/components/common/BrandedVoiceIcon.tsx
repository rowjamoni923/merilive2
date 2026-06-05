import { cn } from "@/lib/utils";
import icon3dVoice from "@/assets/icon-3d-voice.png";

interface BrandedVoiceIconProps {
  className?: string;
  alt?: string;
}

/** Unified premium 3D voice/mic trigger icon across Chat / LiveStream / PartyRoom / PrivateCall. */
export const BrandedVoiceIcon = ({ className, alt = "Voice" }: BrandedVoiceIconProps) => (
  <img
    src={icon3dVoice}
    alt={alt}
    width={512}
    height={512}
    loading="lazy"
    draggable={false}
    className={cn("object-contain select-none pointer-events-none", className)}
  />
);

export default BrandedVoiceIcon;
