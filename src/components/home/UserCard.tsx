import { Star, Gem, Eye, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import AvatarWithFrame from "@/components/common/AvatarWithFrame";
import { CallButton } from "@/components/call/CallButton";
import { useCall } from "@/components/call/CallContext";
import { normalizeProfileMediaUrl } from "@/utils/profileMediaUrl";

interface UserCardProps {
  id: string;
  name: string;
  bio: string;
  photoUrl: string;
  countryCode: string;
  countryFlag: string;
  language: string;
  level: number;
  isOnline?: boolean;
  isLive?: boolean;
  viewerCount?: number;
  isVerified?: boolean;
  isFaceVerified?: boolean;
  isHost?: boolean;
  frameId?: string | null;
  onClick?: () => void;
}

export const UserCard = ({
  id,
  name,
  photoUrl,
  countryCode,
  countryFlag,
  level,
  isOnline = false,
  isLive = false,
  viewerCount = 0,
  isVerified = false,
  isFaceVerified = false,
  isHost = false,
  frameId,
  onClick,
}: UserCardProps) => {
  const { startCall } = useCall();
  const normalizedPhotoUrl = normalizeProfileMediaUrl(photoUrl) || photoUrl;

  const getLevelIcon = () => {
    if (level >= 6) return <Star className="w-3 h-3 fill-current" />;
    return <Gem className="w-3 h-3" />;
  };

  const getLevelColor = () => {
    if (level >= 6) return "bg-gradient-to-r from-amber-400 to-yellow-500 text-amber-900";
    if (level >= 4) return "bg-gradient-to-r from-purple-400 to-pink-500 text-on-dark";
    return "bg-gradient-to-r from-cyan-400 to-blue-500 text-on-dark";
  };

  const handleCallClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click
    startCall(id);
  };

  return (
    <div
      onClick={onClick}
      className="relative rounded-2xl overflow-hidden cursor-pointer group shadow-card hover:shadow-lg transition-all duration-300 bg-neutral-900"
    >
      {/* Photo with Frame Overlay */}
      <div className="relative aspect-[3/4] overflow-hidden bg-neutral-900">

        <img loading="lazy" decoding="async"
          src={normalizedPhotoUrl}
          alt={name}
          data-host-card-photo="true"
          // @ts-expect-error – fetchpriority is a standard HTML hint
          fetchpriority="high"
          className="host-card-photo w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
 />

        {/* Live Badge - Only show if actually live streaming */}
        {isLive && (
          <div className="absolute top-3 left-0">
            <div className="bg-gradient-to-r from-pink-500 to-red-500 text-on-dark px-3 py-1.5 rounded-r-lg flex items-center gap-1.5 shadow-lg">
              <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
              <span className="text-xs font-bold">LIVE</span>
            </div>
          </div>
        )}

        {/* Viewer Count - Only show for live streams */}
        {isLive && viewerCount > 0 && (
          <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm rounded-full px-2 py-1 flex items-center gap-1">
            <Eye className="w-3 h-3 text-on-dark" />
            <span className="text-xs text-on-dark font-medium">{viewerCount}</span>
          </div>
        )}

        {/* Online Indicator - subtle green dot only (industry standard, no text) */}
        {!isLive && isOnline && (
          <div className="absolute top-3 left-3 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white/80 shadow-md animate-pulse" />
        )}

        {/* Verified Badge - Top Right (if not live) */}
        {!isLive && (isVerified || isFaceVerified) && (
          <div className="absolute top-3 right-3 w-5 h-5 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full flex items-center justify-center shadow-lg border border-white/50">
            <CheckCircle className="w-3 h-3 text-on-dark fill-current" />
          </div>
        )}

        {/* Call Button for Hosts - Bottom Right */}
        {isHost && isOnline && (
          <div 
            className="absolute bottom-3 right-2 z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <CallButton
              hostId={id}
              onClick={() => startCall(id)}
              size="sm"
              showRate={true}
            />
          </div>
        )}

        {/* Bottom Info — floats directly on the photo; no gray panel/border. */}
        <div className="absolute bottom-3 left-2 right-16 flex items-end gap-2 pointer-events-none">
          {/* Small Framed Avatar */}
          <div className="flex-shrink-0">
            <AvatarWithFrame
              userId={id}
              src={normalizedPhotoUrl}
              name={name}
              level={level}
              isHost={isHost}
              size="xxs"
              frameId={frameId}
              showFrame={true}
              showAnimation={true}
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <h3 className="font-bold text-sm truncate text-on-dark" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.75)' }}>{name}</h3>
              {(isVerified || isFaceVerified) && (
                <CheckCircle className="w-3.5 h-3.5 text-info flex-shrink-0 drop-shadow" />
              )}
            </div>
            <div className="flex items-center gap-1 mt-1">
              <Badge className={cn("border-0 gap-0.5 px-2 py-0.5 text-xs", getLevelColor())}>
                {getLevelIcon()}
                Lv{level}
              </Badge>
              <Badge className="bg-foreground/55 backdrop-blur-sm text-on-dark border-0 gap-1 px-2 py-0.5 text-xs">
                <span>{countryFlag || countryCode}</span>
              </Badge>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};