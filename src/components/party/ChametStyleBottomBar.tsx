import { motion, AnimatePresence } from "framer-motion";
import {
  MessageCircle,
  Gamepad2,
  Gift,
  LayoutGrid,
  X,
  Mic,
  MicOff,
  Image,
  LayoutDashboard,
  MessageSquare,
  Share2,
  Diamond,
  Music,
  Settings,
  Armchair,
  Hand,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface ChametStyleBottomBarProps {
  onChatClick?: () => void;
  onGameClick?: () => void;
  onGiftClick?: () => void;
  onMenuClick?: () => void;
  onCloseClick?: () => void;
  onMicToggle?: () => void;
  onJoinSeatClick?: () => void;
  onBackgroundClick?: () => void;
  onLayoutClick?: () => void;
  onMessagesClick?: () => void;
  onShareClick?: () => void;
  onTasksClick?: () => void;
  onTopUpClick?: () => void;
  onMusicClick?: () => void;
  onSettingsClick?: () => void;
  onJoinRequest?: () => void;
  onBeautyClick?: () => void;
  onStickerClick?: () => void;
  isMuted?: boolean;
  showChat?: boolean;
  unreadMessageCount?: number;
  pendingTaskCount?: number;
  isHost?: boolean;
  isWaitingToJoin?: boolean;
  applicantCount?: number;
}

const MENU_ITEMS = [
  { id: "seat", icon: Armchair, label: "Seat", gradient: "from-emerald-400 to-teal-600", glow: "rgba(52,211,153,0.3)" },
  { id: "background", icon: Image, label: "Background", gradient: "from-sky-400 to-blue-600", glow: "rgba(56,189,248,0.3)" },
  { id: "music", icon: Music, label: "Music", gradient: "from-fuchsia-500 to-purple-700", glow: "rgba(217,70,239,0.3)" },
  { id: "layout", icon: LayoutDashboard, label: "Layout", gradient: "from-violet-500 to-indigo-700", glow: "rgba(139,92,246,0.3)" },
  { id: "messages", icon: MessageSquare, label: "Messages", gradient: "from-rose-400 to-pink-600", glow: "rgba(251,113,133,0.3)" },
  { id: "share", icon: Share2, label: "Share", gradient: "from-orange-400 to-amber-600", glow: "rgba(251,146,60,0.3)" },
  { id: "topup", icon: Diamond, label: "Top Up", gradient: "from-yellow-400 to-amber-500", glow: "rgba(250,204,21,0.3)" },
  { id: "settings", icon: Settings, label: "Settings", gradient: "from-slate-400 to-gray-600", glow: "rgba(148,163,184,0.2)" },
];

export const ChametStyleBottomBar = ({
  onChatClick,
  onGameClick,
  onGiftClick,
  onMenuClick,
  onCloseClick,
  onMicToggle,
  onJoinSeatClick,
  onBackgroundClick,
  onLayoutClick,
  onMessagesClick,
  onShareClick,
  onTasksClick,
  onTopUpClick,
  onMusicClick,
  onSettingsClick,
  onJoinRequest,
  onBeautyClick,
  onStickerClick,
  isMuted = false,
  showChat = true,
  unreadMessageCount = 0,
  pendingTaskCount = 0,
  isHost = false,
  isWaitingToJoin = false,
  applicantCount = 0,
}: ChametStyleBottomBarProps) => {
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const menuCallbacks: Record<string, (() => void) | undefined> = {
    seat: onJoinSeatClick,
    background: onBackgroundClick,
    music: onMusicClick,
    layout: onLayoutClick,
    messages: onMessagesClick,
    share: onShareClick,
    topup: onTopUpClick,
    settings: onSettingsClick,
  };

  return (
    <>
      {/* ═══ Expandable More Menu ═══ */}
      <AnimatePresence>
        {showMoreMenu && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40"
              style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }}
              onClick={() => setShowMoreMenu(false)}
            />

            <motion.div
              initial={{ y: 180, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 180, opacity: 0 }}
              transition={{ type: "spring", damping: 26, stiffness: 320 }}
              className="fixed bottom-28 left-0 right-0 z-50 px-4 pb-safe"
            >
              <div
                className="rounded-3xl p-5 relative overflow-hidden"
                style={{
                  background: "linear-gradient(145deg, rgba(12,8,35,0.97), rgba(22,12,50,0.97))",
                  backdropFilter: "blur(28px)",
                  border: "1px solid rgba(168,85,247,0.12)",
                  boxShadow: "0 20px 56px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.04)",
                }}
              >
                {/* Glow line */}
                <motion.div
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-36 h-px rounded-full"
                  style={{ background: "linear-gradient(90deg, transparent, rgba(168,85,247,0.5), transparent)" }}
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 2.5, repeat: Infinity }}
                />

                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    <h3 className="text-white font-bold text-sm">Room Controls</h3>
                  </div>
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setShowMoreMenu(false)}
                    className="w-7 h-7 rounded-full flex items-center justify-center bg-white/8 border border-white/10"
                  >
                    <X className="w-3.5 h-3.5 text-white/60" />
                  </motion.button>
                </div>

                {/* Grid */}
                <div className="grid grid-cols-4 gap-3">
                  {MENU_ITEMS.map((item, i) => {
                    const Icon = item.icon;
                    const badge = item.id === "messages" && unreadMessageCount > 0 ? unreadMessageCount : null;
                    return (
                      <motion.button
                        key={item.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03 }}
                        whileTap={{ scale: 0.92 }}
                        onClick={() => {
                          menuCallbacks[item.id]?.();
                          setShowMoreMenu(false);
                        }}
                        className="flex flex-col items-center gap-1.5 py-1.5"
                      >
                        <div className="relative">
                          <div
                            className={cn("w-12 h-12 rounded-2xl flex items-center justify-center relative overflow-hidden bg-gradient-to-br", item.gradient)}
                            style={{ boxShadow: `0 6px 18px ${item.glow}` }}
                          >
                            <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent" />
                            <Icon className="w-5 h-5 text-white relative z-10 drop-shadow" />
                          </div>
                          {badge && (
                            <div
                              className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full flex items-center justify-center ring-2 ring-[#0c0823]"
                              style={{ background: "linear-gradient(135deg, #ef4444, #f97316)" }}
                            >
                              <span className="text-white text-[9px] font-bold">{badge > 99 ? "99+" : badge}</span>
                            </div>
                          )}
                        </div>
                        <span className="text-white/70 text-[10px] font-medium">{item.label}</span>
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ═══ Main Floating Bottom Bar ═══ */}
      <div className="fixed bottom-2 left-0 right-0 z-50 px-3 pb-safe">
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="rounded-[22px] px-2 py-2 relative overflow-hidden"
          style={{
            background: "linear-gradient(135deg, rgba(12,8,30,0.93), rgba(25,12,50,0.9))",
            backdropFilter: "blur(24px)",
            border: "1px solid rgba(168,85,247,0.1)",
            boxShadow: "0 12px 40px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.03)",
          }}
        >
          {/* Top shimmer */}
          <motion.div
            className="absolute top-0 left-0 right-0 h-px"
            style={{ background: "linear-gradient(90deg, transparent, rgba(168,85,247,0.25), transparent)" }}
            animate={{ opacity: [0.2, 0.6, 0.2] }}
            transition={{ duration: 3, repeat: Infinity }}
          />

          <div className="flex items-center justify-between gap-1">
            {/* Game */}
            <BarButton
              icon={Gamepad2}
              label="Game"
              onClick={onGameClick}
              bg="linear-gradient(135deg, #f97316, #ea580c)"
              shadow="rgba(249,115,22,0.35)"
            />

            {/* Gift — Hero button */}
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={onGiftClick}
              className="flex flex-col items-center gap-0.5 -mt-4"
            >
              <div className="relative">
                <div
                  className="w-[62px] h-[62px] rounded-[20px] flex items-center justify-center relative overflow-hidden"
                  style={{
                    background: "linear-gradient(135deg, #ec4899, #a855f7, #7c3aed)",
                    boxShadow: "0 10px 28px rgba(168,85,247,0.45), 0 0 0 2px rgba(255,255,255,0.08), inset 0 2px 0 rgba(255,255,255,0.12)",
                  }}
                >
                  <div className="absolute inset-0 bg-gradient-to-b from-white/18 to-transparent" />
                  <Gift className="w-7 h-7 text-white relative z-10 drop-shadow-lg" />
                </div>
                <motion.div
                  animate={{ scale: [1, 1.2, 1], opacity: [0.35, 0.12, 0.35] }}
                  transition={{ duration: 2.5, repeat: Infinity }}
                  className="absolute inset-0 rounded-[20px] -z-10"
                  style={{ background: "linear-gradient(135deg, #ec4899, #a855f7)", filter: "blur(14px)" }}
                />
              </div>
              <span className="text-white/75 text-[9px] font-semibold">Gift</span>
            </motion.button>

            {/* Host: Seat Mgmt  |  Visitor: Join */}
            {isHost ? (
              <BarButton
                icon={Armchair}
                label="Seat"
                onClick={onJoinSeatClick}
                bg="linear-gradient(135deg, #34d399, #059669)"
                shadow="rgba(52,211,153,0.35)"
                badge={applicantCount > 0 ? applicantCount : undefined}
              />
            ) : (
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={!isWaitingToJoin ? onJoinRequest : undefined}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl relative overflow-hidden"
                style={{
                  background: isWaitingToJoin
                    ? "linear-gradient(135deg, #f59e0b, #ea580c)"
                    : "linear-gradient(135deg, #06b6d4, #6366f1)",
                  boxShadow: isWaitingToJoin
                    ? "0 6px 16px rgba(245,158,11,0.35)"
                    : "0 6px 16px rgba(99,102,241,0.35)",
                  border: "1px solid rgba(255,255,255,0.12)",
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-b from-white/12 to-transparent" />
                {isWaitingToJoin ? (
                  <>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                      className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full relative z-10"
                    />
                    <span className="text-white font-bold text-[11px] relative z-10">Waiting</span>
                  </>
                ) : (
                  <>
                    <Hand className="w-3.5 h-3.5 text-white relative z-10" />
                    <span className="text-white font-bold text-[11px] relative z-10">Join</span>
                  </>
                )}
              </motion.button>
            )}

            {/* More */}
            <BarButton
              icon={LayoutGrid}
              label="More"
              onClick={() => {
                setShowMoreMenu(!showMoreMenu);
                onMenuClick?.();
              }}
              bg={showMoreMenu ? "linear-gradient(135deg, rgba(168,85,247,0.35), rgba(236,72,153,0.25))" : "rgba(255,255,255,0.07)"}
              shadow={showMoreMenu ? "rgba(168,85,247,0.25)" : "none"}
              border={showMoreMenu ? "rgba(168,85,247,0.35)" : "rgba(255,255,255,0.06)"}
            />
          </div>
        </motion.div>
      </div>
    </>
  );
};

/* ─── Reusable bar button ─── */
function BarButton({
  icon: Icon,
  label,
  onClick,
  bg,
  shadow,
  badge,
  border,
}: {
  icon: React.ElementType;
  label: string;
  onClick?: () => void;
  bg: string;
  shadow: string;
  badge?: number;
  border?: string;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={onClick}
      className="flex flex-col items-center gap-0.5 px-1.5 py-0.5"
    >
      <div
        className="relative w-11 h-11 rounded-2xl flex items-center justify-center overflow-hidden"
        style={{
          background: bg,
          boxShadow: shadow !== "none" ? `0 6px 16px ${shadow}` : undefined,
          border: border ? `1px solid ${border}` : undefined,
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-white/15 to-transparent" />
        <Icon className="w-5 h-5 text-white relative z-10" />
        {badge && badge > 0 && (
          <div
            className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full flex items-center justify-center ring-2 ring-[#0c0820]"
            style={{ background: "linear-gradient(135deg, #ef4444, #dc2626)", boxShadow: "0 3px 6px rgba(239,68,68,0.4)" }}
          >
            <span className="text-white text-[8px] font-bold">{badge}</span>
          </div>
        )}
      </div>
      <span className="text-white/60 text-[9px] font-medium">{label}</span>
    </motion.button>
  );
}

export default ChametStyleBottomBar;
