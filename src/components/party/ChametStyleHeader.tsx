import { motion, AnimatePresence } from "framer-motion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Plus, Users, Crown, ChevronRight, Sparkles, Gem } from "lucide-react";
import { cn } from "@/lib/utils";
import BeansIcon from "@/components/common/BeansIcon";
import AvatarWithFrame from "@/components/common/AvatarWithFrame";
import { useNavigate } from "react-router-dom";
import {
  getLevelBadgeBg,
  getLevelTextColor,
  ensureValidLevel,
  formatLevel,
} from "@/features/shared/level";

interface TopViewer {
  id: string;
  displayName: string;
  avatarUrl?: string;
  level: number;
  totalGifts?: number;
}

interface ChametStyleHeaderProps {
  roomName: string;
  hostName: string;
  hostAvatar?: string;
  hostLevel?: number;
  hostCountryFlag?: string;
  hostId?: string;
  hostFrameId?: string | null;
  totalBeans: number;
  viewerCount: number;
  topViewers: TopViewer[];
  pendingRequestCount?: number;
  isHost?: boolean;
  onInviteClick?: () => void;
  onViewersClick?: () => void;
}

const RANK_MEDALS = ["👑", "🥈", "🥉"];

const formatNumber = (num: number) => {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toLocaleString();
};

export const ChametStyleHeader = ({
  roomName,
  hostName,
  hostAvatar,
  hostLevel = 1,
  hostCountryFlag,
  hostId,
  hostFrameId,
  totalBeans,
  viewerCount,
  topViewers,
  pendingRequestCount = 0,
  isHost = false,
  onInviteClick,
  onViewersClick,
}: ChametStyleHeaderProps) => {
  const navigate = useNavigate();
  const safeHostLevel = ensureValidLevel(hostLevel);
  const topThree = topViewers.slice(0, 3);

  return (
    <div className="absolute top-0 left-0 right-0 z-40 pt-safe">
      {/* Gradient scrim */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="h-28 bg-gradient-to-b from-black/75 via-black/40 to-transparent" />
      </div>

      <div className="relative px-3 pt-3 space-y-2">
        {/* ═══ Row 1: Host Pill + Viewer Badge ═══ */}
        <div className="flex items-center justify-between gap-2">
          {/* Host Pill */}
          <motion.div
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="flex items-center gap-2 rounded-full pl-1 pr-3 py-1 relative overflow-hidden"
            style={{
              background: "linear-gradient(135deg, rgba(10,10,20,0.88), rgba(25,15,45,0.85))",
              backdropFilter: "blur(20px)",
              border: "1px solid rgba(168,85,247,0.12)",
              boxShadow: "0 6px 24px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.05)",
            }}
          >
            {/* Shimmer */}
            <motion.div
              className="absolute top-0 left-0 right-0 h-px"
              style={{ background: "linear-gradient(90deg, transparent, rgba(168,85,247,0.35), transparent)" }}
              animate={{ opacity: [0.3, 0.7, 0.3] }}
              transition={{ duration: 3, repeat: Infinity }}
            />

            {/* Avatar */}
            <div onClick={() => hostId && navigate(`/profile/${hostId}`)} className="cursor-pointer relative">
              <AvatarWithFrame
                userId={hostId}
                src={hostAvatar}
                name={hostName}
                level={safeHostLevel}
                isHost={true}
                frameId={hostFrameId}
                size="sm"
                showAnimation={true}
                showGlow={false}
              />
              <motion.div
                className="absolute -top-1 -right-1"
                animate={{ rotate: [0, -6, 6, 0] }}
                transition={{ duration: 3, repeat: Infinity }}
              >
                <Crown className="w-3 h-3 text-amber-400 drop-shadow-[0_0_5px_rgba(251,191,36,0.8)]" />
              </motion.div>
            </div>

            {/* Info */}
            <div className="flex flex-col min-w-0 gap-px">
              <div className="flex items-center gap-1">
                <span className="text-white text-[11px] font-bold truncate max-w-[80px]">
                  {roomName || hostName}
                </span>
                {hostCountryFlag && <span className="text-[10px]">{hostCountryFlag}</span>}
                <span
                  className={cn(
                    "px-1.5 py-px rounded text-[8px] font-black leading-none",
                    getLevelBadgeBg(safeHostLevel),
                    getLevelTextColor(safeHostLevel)
                  )}
                >
                  {formatLevel(safeHostLevel)}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <BeansIcon size={10} />
                <motion.span
                  key={totalBeans}
                  initial={{ scale: 1.2 }}
                  animate={{ scale: 1 }}
                  className="text-[10px] font-bold tabular-nums text-amber-400"
                  style={{ textShadow: "0 0 6px rgba(251,191,36,0.35)" }}
                >
                  {formatNumber(totalBeans)}
                </motion.span>
              </div>
            </div>

            {/* Invite */}
            <motion.button
              whileTap={{ scale: 0.85 }}
              onClick={onInviteClick}
              className="w-6 h-6 rounded-full flex items-center justify-center ml-0.5"
              style={{
                background: "linear-gradient(135deg, #a855f7, #ec4899)",
                boxShadow: "0 3px 10px rgba(168,85,247,0.4)",
              }}
            >
              <Plus className="w-3 h-3 text-white" strokeWidth={3} />
            </motion.button>
          </motion.div>

          {/* Viewer Badge */}
          <motion.button
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            whileTap={{ scale: 0.92 }}
            onClick={onViewersClick}
            className="relative flex items-center gap-1.5 rounded-full px-3 py-1.5 overflow-hidden"
            style={{
              background: "linear-gradient(135deg, rgba(168,85,247,0.8), rgba(236,72,153,0.8))",
              border: "1px solid rgba(255,255,255,0.18)",
              boxShadow: "0 6px 20px rgba(168,85,247,0.35)",
            }}
          >
            <Users className="w-3.5 h-3.5 text-white relative z-10" />
            <motion.span
              key={viewerCount}
              initial={{ scale: 1.3 }}
              animate={{ scale: 1 }}
              className="text-white text-xs font-black relative z-10 tabular-nums"
            >
              {viewerCount}
            </motion.span>
            <ChevronRight className="w-3 h-3 text-white/60 relative z-10" />

            {/* Pending badge */}
            <AnimatePresence>
              {isHost && pendingRequestCount > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-white text-[9px] font-black rounded-full z-20 ring-2 ring-black/50"
                  style={{
                    background: "linear-gradient(135deg, #ef4444, #f97316)",
                    boxShadow: "0 3px 8px rgba(239,68,68,0.5)",
                  }}
                >
                  {pendingRequestCount}
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        </div>

        {/* ═══ Row 2: Top Gifters ═══ */}
        {topThree.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="flex items-center justify-end gap-1"
          >
            <Sparkles className="w-3 h-3 text-amber-400/70 mr-0.5" />
            {topThree.map((viewer, i) => (
              <motion.div
                key={viewer.id}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.25 + i * 0.08 }}
                className="relative"
                onClick={() => navigate(`/profile/${viewer.id}`)}
              >
                <Avatar
                  className={cn(
                    "w-7 h-7 cursor-pointer ring-[1.5px] shadow-md",
                    i === 0
                      ? "ring-amber-400"
                      : i === 1
                      ? "ring-slate-300"
                      : "ring-amber-600"
                  )}
                >
                  <AvatarImage
                    src={viewer.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${viewer.displayName}`}
                    className="object-cover"
                  />
                  <AvatarFallback className="text-[8px] bg-purple-700 text-white font-bold">
                    {viewer.displayName.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <span className="absolute -bottom-0.5 -right-0.5 text-[7px] leading-none drop-shadow-md">
                  {RANK_MEDALS[i]}
                </span>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default ChametStyleHeader;
