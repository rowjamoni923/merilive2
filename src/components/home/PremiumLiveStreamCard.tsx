import { Eye, Gift, Crown, Diamond, Flame, MapPin, Verified, Star } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import AvatarWithFrame from "@/components/common/AvatarWithFrame";
import { LevelBadge } from "@/components/common/LevelBadge";
import { enhanceThumbnail } from "@/utils/enhanceThumbnail";
import { getDisplayAvatar } from "@/utils/placeholderAvatar";

const DEFAULT_THUMB = "/placeholder.svg";

interface PremiumLiveStreamCardProps {
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
  userLevel?: number;
  isVIP?: boolean;
  isVerified?: boolean;
  giftCount?: number;
  isPK?: boolean;
  pkProgress?: number;
  streamType?: "live" | "party" | "pk" | "game";
  onClick?: () => void;
}

export const PremiumLiveStreamCard = ({
  hostId,
  hostName,
  hostAvatar,
  thumbnailUrl,
  viewerCount,
  country,
  countryFlag,
  isOnline = true,
  tags = [],
  userLevel = 1,
  isVIP = false,
  isVerified = false,
  giftCount = 0,
  isPK = false,
  pkProgress = 50,
  streamType = "live",
  onClick,
}: PremiumLiveStreamCardProps) => {
  
  // Get stream type badge config
  const getStreamTypeBadge = () => {
    switch (streamType) {
      case "party":
        return { text: "PARTY", color: "from-purple-500 to-indigo-500", icon: Star };
      case "pk":
        return { text: "PK", color: "from-red-500 to-orange-500", icon: Flame };
      case "game":
        return { text: "GAME", color: "from-green-500 to-teal-500", icon: Diamond };
      default:
        return { text: "LIVE", color: "from-red-500 to-pink-500", icon: null };
    }
  };
  
  const streamBadge = getStreamTypeBadge();

  return (
    <motion.div 
      className="relative group cursor-pointer overflow-hidden rounded-2xl aspect-[3/4] bg-muted shadow-xl"
      whileHover={{ scale: 1.02, y: -4 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
    >
      {/* Resolve the best image: live thumbnail when present, otherwise the
          host's avatar (profile_photo_url) so offline hosts still render. */}
      {(() => {
        const avatarFallback = hostId
          ? getDisplayAvatar(hostId, hostAvatar || null)
          : (hostAvatar || DEFAULT_THUMB);
        const hasLiveThumb = !!thumbnailUrl && thumbnailUrl !== DEFAULT_THUMB;
        const primarySrc = hasLiveThumb
          ? enhanceThumbnail(thumbnailUrl, { width: 600, quality: 90, sharpen: 1.4 })
          : avatarFallback;
        return (
          <img
            src={primarySrc}
            alt={hostName}
            loading="eager"
            decoding="sync"
            // @ts-expect-error – fetchpriority is a standard HTML hint
            fetchpriority="high"
            onError={(e) => {
              const img = e.currentTarget;
              // Step 1: raw thumbnail URL (skip CDN proxy)
              if (hasLiveThumb && img.src !== thumbnailUrl && !img.dataset.s1) {
                img.dataset.s1 = "1";
                img.src = thumbnailUrl;
                return;
              }
              // Step 2: host avatar fallback (stable placeholder)
              if (!img.dataset.s2 && img.src !== avatarFallback) {
                img.dataset.s2 = "1";
                img.src = avatarFallback;
                return;
              }
              // Step 3: final placeholder
              if (img.src !== DEFAULT_THUMB) img.src = DEFAULT_THUMB;
            }}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
            style={{
              filter: 'brightness(1.04) contrast(1.10) saturate(1.18)',
              WebkitFilter: 'brightness(1.04) contrast(1.10) saturate(1.18)',
            }}
          />
        );
      })()}



      {/* Premium Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
      
      {/* Top shimmer effect on hover */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100"
        animate={{ x: ["-100%", "100%"] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
      />

      {/* Stream Type Badge with Animation */}
      {isOnline && (
        <div className="absolute top-3 left-3 z-10">
          <div className="flex items-center gap-1">
            <Badge className={cn(
              "border-0 gap-1 px-2 py-0.5 font-bold text-white shadow-lg",
              `bg-gradient-to-r ${streamBadge.color}`
            )}>
              <motion.span 
                className="w-2 h-2 rounded-full bg-white"
                animate={{ scale: [1, 1.3, 1], opacity: [1, 0.5, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              />
              {streamBadge.text}
            </Badge>
            
            {/* VIP Badge */}
            {isVIP && (
              <Badge className="bg-gradient-to-r from-amber-400 to-orange-500 border-0 text-white shadow-lg">
                <Crown className="w-3 h-3 mr-0.5" />
                VIP
              </Badge>
            )}
          </div>
        </div>
      )}

      {/* Viewer Count with Live Animation */}
      <div className="absolute top-3 right-3 z-10">
        <motion.div
          className="flex items-center gap-1 bg-black/60 backdrop-blur-md rounded-full px-2.5 py-1 border border-white/10"
          animate={{ boxShadow: ["0 0 10px rgba(236,72,153,0.3)", "0 0 20px rgba(236,72,153,0.5)", "0 0 10px rgba(236,72,153,0.3)"] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            <Eye className="w-3.5 h-3.5 text-pink-600" />
          </motion.div>
          <span className="text-xs text-white font-bold">
            {viewerCount > 1000 ? `${(viewerCount / 1000).toFixed(1)}k` : viewerCount}
          </span>
        </motion.div>
      </div>

      {/* Gift Counter */}
      {giftCount > 0 && (
        <div className="absolute top-12 right-3 z-10">
          <div className="flex items-center gap-1 bg-gradient-to-r from-pink-500/80 to-purple-500/80 backdrop-blur-md rounded-full px-2.5 py-1">
            <motion.div
              animate={{ rotate: [0, 15, -15, 0], scale: [1, 1.2, 1] }}
              transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 2 }}
            >
              <Gift className="w-3.5 h-3.5 text-yellow-700" />
            </motion.div>
            <span className="text-xs text-white font-bold">{giftCount}</span>
          </div>
        </div>
      )}

      {/* Tags */}
      {tags.length > 0 && (
        <div className="absolute top-12 left-3 flex flex-wrap gap-1 z-10">
          {tags.slice(0, 2).map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="bg-white/20 backdrop-blur-sm text-white border-0 text-[10px] px-1.5 py-0"
            >
              #{tag}
            </Badge>
          ))}
        </div>
      )}

      {/* PK Battle Progress Bar */}
      {isPK && (
        <motion.div 
          className="absolute top-1/2 left-0 right-0 z-10 px-3"
          initial={{ opacity: 0, scaleX: 0 }}
          animate={{ opacity: 1, scaleX: 1 }}
        >
          <div className="h-2 bg-white/20 rounded-full overflow-hidden flex">
            <motion.div
              className="bg-gradient-to-r from-blue-500 to-cyan-400 h-full"
              initial={{ width: 0 }}
              animate={{ width: `${pkProgress}%` }}
              transition={{ duration: 1, ease: "easeOut" }}
            />
            <motion.div
              className="bg-gradient-to-r from-red-400 to-pink-500 h-full flex-1"
              initial={{ width: 0 }}
              animate={{ width: `${100 - pkProgress}%` }}
              transition={{ duration: 1, ease: "easeOut" }}
            />
          </div>
          <div className="flex justify-between mt-1 text-[10px] text-white font-bold">
            <span className="text-blue-600">{pkProgress}%</span>
            <motion.span 
              className="text-yellow-600"
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 0.5, repeat: Infinity }}
            >
              ⚔️ VS
            </motion.span>
            <span className="text-pink-600">{100 - pkProgress}%</span>
          </div>
        </motion.div>
      )}

      {/* Bottom Info with Premium 3D Frame */}
      <div className="absolute bottom-0 left-0 right-0 p-3 z-10">
        <div className="flex items-center gap-2">
          {/* Avatar with SVGA Frame */}
          <div className="relative">
            <AvatarWithFrame
              userId={hostId}
              src={hostAvatar}
              name={hostName}
              level={userLevel}
              size="xxs"
              showFrame={true}
              showAnimation={true}
              showGlow={userLevel >= 10}
              isOnline={isOnline}
            />
          </div>
          
          <div className="flex-1 min-w-0">
            {/* Host Name with Verified Badge */}
            <div className="flex items-center gap-1">
              <h3 className="text-white font-bold text-sm truncate drop-shadow-lg">{hostName}</h3>
              {isVerified && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 500 }}
                >
                  <Verified className="w-4 h-4 text-blue-600 fill-blue-400" />
                </motion.div>
              )}
            </div>
            
            {/* Level Badge and Location */}
            <div className="flex items-center gap-1.5 mt-0.5">
              <LevelBadge level={userLevel} size="xs" animated />
              <div className="flex items-center gap-0.5 text-white/80 text-[10px]">
                <span>{countryFlag}</span>
                <span className="truncate max-w-[60px]">{country}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Premium Border Glow Effect */}
      <motion.div
        className="absolute inset-0 rounded-2xl pointer-events-none"
        style={{
          boxShadow: "inset 0 0 30px rgba(236, 72, 153, 0.3)",
        }}
        animate={{
          boxShadow: [
            "inset 0 0 30px rgba(236, 72, 153, 0.3)",
            "inset 0 0 40px rgba(168, 85, 247, 0.4)",
            "inset 0 0 30px rgba(236, 72, 153, 0.3)",
          ],
        }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Corner Decorations for Premium Effect */}
      {userLevel >= 20 && (
        <>
          <motion.div
            className="absolute top-0 left-0 w-8 h-8 pointer-events-none"
            style={{
              background: "linear-gradient(135deg, rgba(255,215,0,0.5) 0%, transparent 60%)",
            }}
            animate={{ opacity: [0.5, 0.8, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <motion.div
            className="absolute top-0 right-0 w-8 h-8 pointer-events-none"
            style={{
              background: "linear-gradient(-135deg, rgba(255,215,0,0.5) 0%, transparent 60%)",
            }}
            animate={{ opacity: [0.5, 0.8, 0.5] }}
            transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
          />
        </>
      )}
    </motion.div>
  );
};

export default PremiumLiveStreamCard;
