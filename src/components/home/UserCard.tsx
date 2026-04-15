import { Phone, Star, Gem, Eye, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import AvatarWithFrame from "@/components/common/AvatarWithFrame";
import { CallButton } from "@/features/call";
import { useCall } from "@/features/call";

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
  bio,
  photoUrl,
  countryCode,
  countryFlag,
  language,
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

  const getLevelIcon = () => {
    if (level >= 6) return <Star className="w-3 h-3 fill-current" />;
    return <Gem className="w-3 h-3" />;
  };

  const getLevelColor = () => {
    if (level >= 6) return "bg-gradient-to-r from-amber-400 to-yellow-500 text-amber-900";
    if (level >= 4) return "bg-gradient-to-r from-purple-400 to-pink-500 text-white";
    return "bg-gradient-to-r from-cyan-400 to-blue-500 text-white";
  };

  const handleCallClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click
    startCall(id);
  };

  return (
    <div
      onClick={onClick}
      className="relative rounded-2xl overflow-hidden bg-card cursor-pointer group shadow-card hover:shadow-lg transition-all duration-300"
    >
      {/* Photo with Frame Overlay */}
      <div className="relative aspect-[3/4] overflow-hidden">
        <img
          src={photoUrl}
          alt={name}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />

        {/* Live Badge - Only show if actually live streaming */}
        {isLive && (
          <div className="absolute top-3 left-0">
            <div className="bg-gradient-to-r from-pink-500 to-red-500 text-white px-3 py-1.5 rounded-r-lg flex items-center gap-1.5 shadow-lg">
              <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
              <span className="text-xs font-bold">LIVE</span>
            </div>
          </div>
        )}

        {/* Viewer Count - Only show for live streams */}
        {isLive && viewerCount > 0 && (
          <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm rounded-full px-2 py-1 flex items-center gap-1">
            <Eye className="w-3 h-3 text-white" />
            <span className="text-xs text-white font-medium">{viewerCount}</span>
          </div>
        )}

        {/* Verified Badge - Top Right (if not live) */}
        {!isLive && (isVerified || isFaceVerified) && (
          <div className="absolute top-3 right-3 w-5 h-5 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full flex items-center justify-center shadow-lg border border-white/50">
            <CheckCircle className="w-3 h-3 text-white fill-current" />
          </div>
        )}

        {/* Online Indicator - Only if not live but online and not verified badge shown */}
        {!isLive && isOnline && !(isVerified || isFaceVerified) && (
          <div className="absolute top-3 right-3 w-3 h-3 bg-green-500 rounded-full border-2 border-white shadow-lg" />
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

        {/* Bottom Badges */}
        <div className="absolute bottom-3 left-2 right-16 flex items-center gap-1 flex-wrap">
          {/* Small Framed Avatar */}
          <div className="flex-shrink-0">
            <AvatarWithFrame
              userId={id}
              src={photoUrl}
              name={name}
              level={level}
              isHost={isHost}
              size="xxs"
              frameId={frameId}
              showFrame={true}
              showAnimation={true}
            />
          </div>

          {/* Country Badge */}
          <Badge className="bg-black/60 backdrop-blur-sm text-white border-0 gap-1 px-2 py-0.5 text-xs">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            {countryCode}
          </Badge>

          {/* Language Badge */}
          <Badge className="bg-black/60 backdrop-blur-sm text-white border-0 px-2 py-0.5 text-xs">
            {language}
          </Badge>

          {/* Level Badge */}
          <Badge className={cn("border-0 gap-0.5 px-2 py-0.5 text-xs", getLevelColor())}>
            {getLevelIcon()}
            Lv{level}
          </Badge>
        </div>
      </div>

      {/* Info Section */}
      <div className="p-3">
        <div className="flex items-center gap-1">
          <h3 className="font-semibold text-sm truncate">{name}</h3>
          {(isVerified || isFaceVerified) && (
            <CheckCircle className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-1">
          <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center">
            <Phone className="w-3 h-3 text-green-500" />
          </div>
          <p className="text-xs text-muted-foreground truncate flex-1">{bio}</p>
        </div>
      </div>
    </div>
  );
};