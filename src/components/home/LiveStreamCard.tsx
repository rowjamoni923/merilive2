import { Eye, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import AvatarWithFrame from "@/components/common/AvatarWithFrame";
import { enhanceThumbnail } from "@/utils/enhanceThumbnail";
import { normalizeProfileMediaUrl } from "@/utils/profileMediaUrl";

interface LiveStreamCardProps {
  id: string;
  hostId?: string;
  hostName: string;
  hostAvatar: string;
  thumbnailUrl: string;
  viewerCount: number;
  country: string;
  countryFlag: string;
  isOnline?: boolean;
  tags?: string[];
  hostLevel?: number;
}

export const LiveStreamCard = ({
  id,
  hostId,
  hostName,
  hostAvatar,
  thumbnailUrl,
  viewerCount,
  country,
  countryFlag,
  isOnline = true,
  tags = [],
  hostLevel = 1,
}: LiveStreamCardProps) => {
  const normalizedThumbnailUrl = normalizeProfileMediaUrl(thumbnailUrl) || thumbnailUrl;
  const normalizedHostAvatar = normalizeProfileMediaUrl(hostAvatar) || hostAvatar;

  return (
    <div className="relative group cursor-pointer overflow-hidden rounded-2xl aspect-[3/4] bg-neutral-900">
      {/* Thumbnail */}
      <img loading="lazy" decoding="async"
        src={enhanceThumbnail(normalizedThumbnailUrl, { width: 600, quality: 90, sharpen: 1.4 })}
        alt={hostName}
        // @ts-expect-error – fetchpriority is a standard HTML hint
        fetchpriority="high"
        onError={(e) => {
          const img = e.currentTarget;
          if (img.src !== normalizedThumbnailUrl && normalizedThumbnailUrl) img.src = normalizedThumbnailUrl;
        }}
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
        style={{
          filter: 'brightness(1.04) contrast(1.10) saturate(1.18)',
          WebkitFilter: 'brightness(1.04) contrast(1.10) saturate(1.18)',
        }}
      />

      {/* Full-photo card: no dark panel, border band, or screen overlay. */}

      {/* Live Badge */}
      {isOnline && (
        <div className="absolute top-3 left-3 flex items-center gap-1.5">
          <Badge className="bg-destructive text-destructive-foreground border-0 gap-1 px-2 py-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            LIVE
          </Badge>
        </div>
      )}

      {/* Viewer Count */}
      <div className="absolute top-3 right-3 flex items-center gap-1 bg-black/50 backdrop-blur-sm rounded-full px-2 py-1">
        <Eye className="w-3.5 h-3.5 text-on-dark" />
        <span className="text-xs text-on-dark font-medium">
          {viewerCount > 1000 ? `${(viewerCount / 1000).toFixed(1)}k` : viewerCount}
        </span>
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div className="absolute top-12 left-3 flex flex-wrap gap-1">
          {tags.slice(0, 2).map((tag, index) => (
            <Badge
              key={index}
              variant="secondary"
              className="bg-primary/80 text-on-dark border-0 text-[10px] px-1.5 py-0"
            >
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {/* Bottom Info */}
      <div className="absolute bottom-0 left-0 right-0 p-3 pointer-events-none">
        <div className="flex items-center gap-2">
          <div className="relative">
            <AvatarWithFrame
              userId={hostId}
              src={normalizedHostAvatar}
              name={hostName}
              level={hostLevel}
              size="sm"
              showFrame={true}
              showAnimation={true}
              isOnline={isOnline}
            />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-on-dark font-semibold text-sm truncate" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.75)' }}>{hostName}</h3>
            <div className="flex items-center gap-1 text-on-dark-muted text-xs" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.75)' }}>
              <span>{countryFlag}</span>
              <span className="truncate">{country}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Hover Effect */}
      <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
    </div>
  );
};
