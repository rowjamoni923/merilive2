import { Gift } from "lucide-react";
import { useBrandingRealtime } from "@/hooks/useAdminSettingsRealtime";
import { cn } from "@/lib/utils";

interface BrandedGiftIconProps {
  className?: string;
  /** size for the lucide fallback */
  fallbackSize?: number;
  alt?: string;
}

/**
 * Renders the admin-uploaded app logo in place of the generic gift icon.
 * Falls back to the lucide Gift icon only if no branding logo is configured.
 *
 * Used to replace gift-trigger icons in Chat / LiveStream / PartyRoom /
 * PrivateCall / ProfileDetail per professional-app branding requirement.
 */
export const BrandedGiftIcon = ({ className, fallbackSize, alt = "Gift" }: BrandedGiftIconProps) => {
  const { branding } = useBrandingRealtime();
  const logoUrl = branding?.logo_image_url;

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={alt}
        draggable={false}
        className={cn("object-contain select-none pointer-events-none", className)}
      />
    );
  }

  return <Gift className={className} style={fallbackSize ? { width: fallbackSize, height: fallbackSize } : undefined} />;
};

export default BrandedGiftIcon;
