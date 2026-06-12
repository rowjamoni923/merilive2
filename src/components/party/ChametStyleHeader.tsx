import { motion, AnimatePresence } from "framer-motion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Plus, Users, Crown, ChevronRight, Sparkles, Gem } from "lucide-react";
import { cn } from "@/lib/utils";
import BeansIcon from "@/components/common/BeansIcon";
import AvatarWithFrame from "@/components/common/AvatarWithFrame";
import { useNavigate } from "react-router-dom";
import { getDisplayAvatar } from "@/utils/placeholderAvatar";
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
            transition={{ type: "spring", stiffness: 320, damping: 26, mass: 0.7 }}
            className="flex items-center gap-2 rounded-full pl-1 pr-3 py-1 relative overflow-hidden will-change-transform"
            style={{
              background: "linear-gradient(135deg, rgba(10,10,20,0.88), rgba(25,15,45,0.85))",
              backdropFilter: "blur(20px)",
              border: "1px solid rgba(168,85,247,0.12)",
              boxShadow: "0 6px 24px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.05)",
              transform: "translateZ(0)",
            }}
          >
            {/* Top shimmer */}
            <motion.div
              className="absolute top-0 left-0 right-0 h-px"
              style={{ background: "linear-gradient(90deg, transparent, rgba(168,85,247,0.35), transparent)" }}
              animate={{ opacity: [0.3, 0.7, 0.3] }}
              transition={{ duration: 3, repeat: Infinity }}
            />
            {/* Specular shine sweep — premium glass feel */}
            <motion.div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: "linear-gradient(115deg, transparent 35%, rgba(255,255,255,0.10) 50%, transparent 65%)",
              }}
              animate={{ x: ["-110%", "120%"] }}
              transition={{ duration: 4.5, repeat: Infinity, ease: "linear", repeatDelay: 2.2 }}
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
            {/* Pulsing live dot — Bigo-style "LIVE" energy */}
            <motion.div
              className="relative z-10 w-2 h-2 rounded-full bg-white"
              animate={{ opacity: [1, 0.45, 1], scale: [1, 0.85, 1] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
              style={{ boxShadow: "0 0 8px rgba(255,255,255,0.7)" }}
            />
            <Users className="w-3.5 h-3.5 text-white relative z-10" />
            <motion.span
              key={viewerCount}
              initial={{ scale: 1.45, y: -3, opacity: 0.6 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              transition={{ type: "spring", damping: 12, stiffness: 380 }}
              className="text-white text-xs font-black relative z-10 tabular-nums"
              style={{ textShadow: "0 1px 2px rgba(0,0,0,0.4)" }}
            >
              {formatNumber(viewerCount)}
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
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", damping: 14, stiffness: 320, delay: 0.25 + i * 0.08 }}
                whileTap={{ scale: 0.9 }}
                className="relative cursor-pointer"
                onClick={() => navigate(`/profile/${viewer.id}`)}
              >
                {/* Rank-1 rotating gold shimmer ring */}
                {i === 0 && (
                  <motion.div
                    className="absolute -inset-1 rounded-full pointer-events-none"
                    style={{
                      background: "conic-gradient(from 0deg, transparent, rgba(251,191,36,0.85), transparent 40%, transparent 60%, rgba(251,191,36,0.85), transparent)",
                      filter: "blur(2px)",
                    }}
                    animate={{ rotate: 360 }}
                    transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                  />
                )}
                <div
                  className={cn(
                    "rounded-full relative",
                    i === 0
                      ? "ring-[1.5px] ring-amber-400"
                      : i === 1
                      ? "ring-[1.5px] ring-slate-300"
                      : "ring-[1.5px] ring-amber-600"
                  )}
                  style={i === 0 ? { boxShadow: "0 0 10px rgba(251,191,36,0.55)" } : undefined}
                >
                  <AvatarWithFrame
                    userId={viewer.id}
                    src={viewer.avatarUrl}
                    name={viewer.displayName}
                    level={viewer.level}
                    size="xs"
                    showAnimation
                  />
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 text-[7px] leading-none drop-shadow-md z-10">
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
