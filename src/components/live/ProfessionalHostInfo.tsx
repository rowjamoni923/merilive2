import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LevelBadge } from "@/components/common/LevelBadge";
import AvatarWithFrame from "@/components/common/AvatarWithFrame";
import { Users, Eye, Heart, Share2, X } from "lucide-react";
import { cn } from "@/lib/utils";

// Audit-fix (Label #10): compact count formatter — 1.2K / 3.4M style.
const formatFollowerCount = (n: number): string => {
  if (!Number.isFinite(n) || n < 0) return '0';
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, '')}K`;
  return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0).replace(/\.0$/, '')}M`;
};

interface HostInfoProps {
  name: string;
  avatar?: string;
  level: number;
  country?: string;
  isVerified?: boolean;
  isFollowing?: boolean;
  followersCount?: number;
  onFollow?: () => void;
  onClose?: () => void;
}

export const ProfessionalHostInfo = ({
  name,
  avatar,
  level,
  country = "🌍",
  isVerified = false,
  isFollowing = false,
  followersCount = 0,
  onFollow,
  onClose
}: HostInfoProps) => {
  return (
    <motion.div
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="flex items-center gap-2 px-3 py-2 rounded-full bg-black/40 backdrop-blur-md border border-white/10"
    >
      {/* Host Avatar with Frame */}
      <AvatarWithFrame 
        src={avatar}
        name={name}
        level={level} 
        isHost={true}
        size="sm" 
        showAnimation={level >= 20}
      />

      {/* Host Info */}
      <div className="flex flex-col gap-0.5 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-white font-bold text-sm truncate max-w-[80px]">{name}</span>
          {isVerified && (
            <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center">
              <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
          )}
          <span className="text-sm">{country}</span>
        </div>
        <div className="flex items-center gap-1">
          <LevelBadge level={level} size="xs" />
          {/* Audit-fix (Label #10): proper pluralization + K/M compact
              formatting so big creators don't render "12345 followers". */}
          <span className="text-white/60 text-[10px]">
            {formatFollowerCount(followersCount)} {followersCount === 1 ? 'follower' : 'followers'}
          </span>
        </div>
      </div>

      {/* Follow Button */}
      <motion.button
        onClick={onFollow}
        className={cn(
          "px-3 py-1 rounded-full text-xs font-bold transition-all",
          isFollowing
            ? "bg-white/20 text-white/80"
            : "bg-gradient-to-r from-pink-500 to-purple-500 text-white shadow-lg"
        )}
        whileTap={{ scale: 0.95 }}
      >
        {isFollowing ? "Following" : "+ Follow"}
      </motion.button>

      {/* Close Button (for viewers) */}
      {onClose && (
        <button 
          onClick={onClose}
          className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        >
          <X className="w-4 h-4 text-white/80" />
        </button>
      )}
    </motion.div>
  );
};

interface ViewerCountProps {
  count: number;
  recentViewers?: Array<{ id: string; avatar?: string; name: string }>;
  onViewerClick?: () => void;
}

export const ProfessionalViewerCount = ({
  count,
  recentViewers = [],
  onViewerClick
}: ViewerCountProps) => {
  return (
    <motion.button
      onClick={onViewerClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-md border border-white/10"
      whileTap={{ scale: 0.95 }}
    >
      {/* Stacked Avatars */}
      <div className="flex -space-x-2">
        {recentViewers.slice(0, 3).map((viewer, index) => (
          <Avatar 
            key={viewer.id} 
            className="w-6 h-6 border-2 border-black/40"
            style={{ zIndex: 3 - index }}
          >
            <AvatarImage src={viewer.avatar} />
            <AvatarFallback className="bg-gradient-to-br from-pink-400 to-purple-500 text-white text-[8px] font-bold">
              {viewer.name[0]}
            </AvatarFallback>
          </Avatar>
        ))}
      </div>
      
      {/* Count */}
      <div className="flex items-center gap-1">
        <Eye className="w-3.5 h-3.5 text-pink-400" />
        <span className="text-white font-bold text-sm">
          {count >= 1000 ? `${(count / 1000).toFixed(1)}K` : count}
        </span>
      </div>
    </motion.button>
  );
};

// Live duration display
interface LiveDurationProps {
  startTime: number;
}

export const LiveDuration = ({ startTime }: LiveDurationProps) => {
  const [duration, setDuration] = useState("00:00");

  useEffect(() => {
    const updateDuration = () => {
      const diff = Date.now() - startTime;
      const hours = Math.floor(diff / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      
      if (hours > 0) {
        setDuration(`${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
      } else {
        setDuration(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
      }
    };

    updateDuration();
    const interval = setInterval(updateDuration, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/90 backdrop-blur-sm">
      <motion.div 
        className="w-2 h-2 rounded-full bg-white"
        animate={{ opacity: [1, 0.5, 1] }}
        transition={{ duration: 1, repeat: Infinity }}
      />
      <span className="text-white font-bold text-xs">{duration}</span>
    </div>
  );
};

export default ProfessionalHostInfo;
