import { useEffect, useState } from "react";
import { Gift } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getCachedGifts,
  getGiftsWithFetch,
  subscribeToGiftCache,
} from "@/hooks/useGiftPrefetch";

interface BrandedGiftIconProps {
  className?: string;
  /** size for the lucide fallback */
  fallbackSize?: number;
  alt?: string;
}

/**
 * Generic "gift trigger" icon used in Chat / LiveStream / PartyRoom /
 * PrivateCall / ProfileDetail.
 *
 * Per user mandate: NEVER use the app's branding logo here. Instead, pull the
 * featured gift's own admin-uploaded icon from the gift catalog (gifts.icon_url).
 * The featured pick = lowest display_order active gift with an icon_url.
 *
 * Falls back to lucide Gift only if the catalog hasn't loaded yet AND no
 * cached icon is available.
 */
const pickFeaturedIcon = (): string | null => {
  const gifts = getCachedGifts();
  if (!gifts || gifts.length === 0) return null;
  // Already sorted by display_order asc in useGiftPrefetch.
  const featured = gifts.find((g) => !!g.icon_url);
  return featured?.icon_url || null;
};

export const BrandedGiftIcon = ({
  className,
  fallbackSize,
  alt = "Gift",
}: BrandedGiftIconProps) => {
  const [iconUrl, setIconUrl] = useState<string | null>(() => pickFeaturedIcon());

  useEffect(() => {
    let cancelled = false;

    // Kick off catalog fetch if cache is cold.
    if (!iconUrl) {
      getGiftsWithFetch()
        .then(() => {
          if (cancelled) return;
          setIconUrl(pickFeaturedIcon());
        })
        .catch(() => {
          /* keep fallback */
        });
    }

    // Re-pick on any cache update (admin uploads new gift, etc.).
    const unsub = subscribeToGiftCache(() => {
      if (cancelled) return;
      setIconUrl(pickFeaturedIcon());
    });

    return () => {
      cancelled = true;
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (iconUrl) {
    return (
      <img
        src={iconUrl}
        alt={alt}
        draggable={false}
        className={cn("object-contain select-none pointer-events-none", className)}
        onError={(e) => {
          // If the featured icon URL is broken, hide the broken-image glyph.
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
    );
  }

  return (
    <Gift
      className={className}
      style={fallbackSize ? { width: fallbackSize, height: fallbackSize } : undefined}
    />
  );
};

export default BrandedGiftIcon;
