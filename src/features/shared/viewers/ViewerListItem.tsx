import { motion } from "framer-motion";
import { Crown, UserPlus, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import AvatarWithFrame from "@/components/common/AvatarWithFrame";
import type { Viewer, SeatApplicant } from "./types";
import { getLevelGradient, ensureValidLevel, formatLevel } from "@/features/shared/level";

interface ViewerListItemProps {
  viewer: Viewer;
  index: number;
  isHost?: boolean;
  showInvite?: boolean;
  onInvite?: (viewerId: string) => void;
  onViewProfile?: (viewerId: string) => void;
}

interface ApplicantListItemProps {
  applicant: SeatApplicant;
  index: number;
  onAccept?: (applicantId: string) => void;
  onReject?: (applicantId: string) => void;
}

const formatJoinTime = (joinedAt?: string) => {
  if (!joinedAt) return "";
  const diff = Date.now() - new Date(joinedAt).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
};

export const ViewerListItem = ({ 
  viewer, 
  index, 
  isHost,
  showInvite,
  onInvite,
  onViewProfile 
}: ViewerListItemProps) => {
  const level = ensureValidLevel(viewer.user_level);
  
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03 }}
      className="flex items-center gap-2 p-2 rounded-xl hover:bg-white/5 transition-colors"
      onClick={() => onViewProfile?.(viewer.id)}
    >
      {/* Rank Badge */}
      <div className="w-5 text-center shrink-0">
        {index < 3 ? (
          <span className="text-sm">
            {index === 0 ? "🥇" : index === 1 ? "🥈" : "🥉"}
          </span>
        ) : (
          <span className="text-[10px] text-white/40">
            {index + 1}
          </span>
        )}
      </div>

      {/* Avatar with Frame - Show frame properly */}
      <div className="shrink-0">
        <AvatarWithFrame
          userId={viewer.id}
          src={viewer.avatar_url}
          name={viewer.display_name || "U"}
          level={level}
          size="sm"
          showAnimation={level >= 15}
          showFrame={true}
        />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="font-medium truncate text-xs text-white">
            {viewer.display_name || "Anonymous"}
          </p>
          <Badge
            variant="secondary"
            className={`text-[8px] px-1 py-0 bg-gradient-to-r ${getLevelGradient(level)} text-white border-0`}
          >
            {formatLevel(level)}
          </Badge>
        </div>
        <p className="text-[10px] text-white/55 truncate">
          ID: {viewer.app_uid || viewer.id.slice(0, 8)}
        </p>
        {viewer.joined_at && (
          <p className="text-[10px] text-white/40">
            {formatJoinTime(viewer.joined_at)}
          </p>
        )}
      </div>

      {/* VIP Badge or Invite Button */}
      {showInvite && isHost ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation();
            onInvite?.(viewer.id);
          }}
          className="h-6 px-2 bg-gradient-to-r from-pink-500/20 to-purple-500/20 hover:from-pink-500/30 hover:to-purple-500/30 text-white text-[10px]"
        >
          <UserPlus className="w-3 h-3 mr-1" />
          Invite
        </Button>
      ) : viewer.is_vip ? (
        <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
      ) : null}
    </motion.div>
  );
};

export const ApplicantListItem = ({ 
  applicant, 
  index,
  onAccept,
  onReject 
}: ApplicantListItemProps) => {
  const level = ensureValidLevel(applicant.user_level);
  
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03 }}
      className="flex items-center gap-2 p-2 rounded-xl bg-white/5"
    >
      {/* Avatar */}
      <div className="shrink-0">
        <AvatarWithFrame
          userId={applicant.user_id}
          src={applicant.avatar_url}
          name={applicant.display_name || "U"}
          level={level}
          size="xs"
          showAnimation={level >= 20}
        />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="font-medium truncate text-xs text-white">
            {applicant.display_name || "Anonymous"}
          </p>
          <Badge
            variant="secondary"
            className={`text-[8px] px-1 py-0 bg-gradient-to-r ${getLevelGradient(level)} text-white border-0`}
          >
            {formatLevel(level)}
          </Badge>
        </div>
        <p className="text-[10px] text-white/40">Wants to join</p>
      </div>

      {/* Action Buttons - Use user_id for callback (applicant.id is request ID) */}
      <div className="flex gap-1">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onAccept?.(applicant.user_id || applicant.id)}
          className="h-6 w-6 p-0 bg-green-500/20 hover:bg-green-500/30 text-green-400"
        >
          <Check className="w-3 h-3" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onReject?.(applicant.user_id || applicant.id)}
          className="h-6 w-6 p-0 bg-red-500/20 hover:bg-red-500/30 text-red-400"
        >
          <X className="w-3 h-3" />
        </Button>
      </div>
    </motion.div>
  );
};
