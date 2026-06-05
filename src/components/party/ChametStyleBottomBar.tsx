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
import { BrandedGiftIcon } from "@/components/common/BrandedGiftIcon";
import { cn } from "@/lib/utils";
import { useState, useCallback } from "react";

/** Lightweight haptic ping — silently no-ops on devices without Vibration API (iOS Safari etc.). */
const haptic = (pattern: number | number[] = 8) => {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(pattern);
    }
  } catch { /* silent */ }
};

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
  { id: "seat", icon: Armchair, label: "Seat", radial: "radial-gradient(120% 120% at 30% 20%, #6ee7b7 0%, #10b981 45%, #047857 100%)", glow: "rgba(16,185,129,0.55)" },
  { id: "background", icon: Image, label: "Background", radial: "radial-gradient(120% 120% at 30% 20%, #bae6fd 0%, #38bdf8 45%, #075985 100%)", glow: "rgba(56,189,248,0.55)" },
  { id: "music", icon: Music, label: "Music", radial: "radial-gradient(120% 120% at 30% 20%, #f5d0fe 0%, #d946ef 45%, #86198f 100%)", glow: "rgba(217,70,239,0.55)" },
  { id: "layout", icon: LayoutDashboard, label: "Layout", radial: "radial-gradient(120% 120% at 30% 20%, #c4b5fd 0%, #8b5cf6 45%, #4c1d95 100%)", glow: "rgba(139,92,246,0.55)" },
  { id: "messages", icon: MessageSquare, label: "Messages", radial: "radial-gradient(120% 120% at 30% 20%, #fbcfe8 0%, #f43f5e 45%, #9f1239 100%)", glow: "rgba(244,63,94,0.55)" },
  { id: "share", icon: Share2, label: "Share", radial: "radial-gradient(120% 120% at 30% 20%, #fed7aa 0%, #f97316 45%, #9a3412 100%)", glow: "rgba(249,115,22,0.55)" },
  { id: "topup", icon: Diamond, label: "Top Up", radial: "radial-gradient(120% 120% at 30% 20%, #fde68a 0%, #f59e0b 45%, #92400e 100%)", glow: "rgba(245,158,11,0.55)" },
  { id: "settings", icon: Settings, label: "Settings", radial: "radial-gradient(120% 120% at 30% 20%, rgba(255,255,255,0.28) 0%, rgba(100,116,139,0.85) 45%, rgba(30,41,59,0.95) 100%)", glow: "rgba(148,163,184,0.4)" },
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
                          <motion.div
                            whileHover={{ y: -2 }}
                            className="w-[52px] h-[52px] rounded-2xl flex items-center justify-center relative overflow-hidden"
                            style={{
                              background: item.radial,
                              boxShadow: `0 10px 24px ${item.glow}, inset 0 1px 0 rgba(255,255,255,0.4), inset 0 -3px 6px rgba(0,0,0,0.28)`,
                            }}
                          >
                            <span className="absolute inset-x-1.5 top-1 h-3 rounded-xl pointer-events-none" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.5), transparent)" }} />
                            <Icon className="w-5 h-5 text-white relative z-10" style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.4))" }} />
                          </motion.div>
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
              bg="radial-gradient(120% 120% at 30% 20%, #fed7aa 0%, #f97316 45%, #9a3412 100%)"
              shadow="rgba(249,115,22,0.55)"
            />

            {/* Gift — Hero button (premium breathing glow + haptic) */}
            <motion.button
              whileTap={{ scale: 0.88, rotate: -4 }}
              transition={{ type: "spring", damping: 12, stiffness: 500 }}
              onClick={() => { haptic(12); onGiftClick?.(); }}
              className="flex flex-col items-center gap-0.5 -mt-4 will-change-transform"
              style={{ transform: "translateZ(0)" }}
            >
              <div className="relative">
                <motion.div
                  className="w-[62px] h-[62px] rounded-[20px] flex items-center justify-center relative overflow-hidden"
                  style={{
                    background: "linear-gradient(135deg, #ec4899, #a855f7, #7c3aed)",
                    boxShadow: "0 10px 28px rgba(168,85,247,0.45), 0 0 0 2px rgba(255,255,255,0.08), inset 0 2px 0 rgba(255,255,255,0.12)",
                  }}
                  animate={{ y: [0, -1.5, 0] }}
                  transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
                >
                  <div className="absolute inset-0 bg-gradient-to-b from-white/18 to-transparent" />
                  {/* Diagonal shine sweep */}
                  <motion.div
                    className="absolute inset-0 pointer-events-none"
                    style={{ background: "linear-gradient(115deg, transparent 38%, rgba(255,255,255,0.32) 50%, transparent 62%)" }}
                    animate={{ x: ["-110%", "120%"] }}
                    transition={{ duration: 3.2, repeat: Infinity, ease: "linear", repeatDelay: 1.8 }}
                  />
                  <motion.div
                    animate={{ rotate: [-4, 4, -4] }}
                    transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
                    className="relative z-10"
                  >
                    <BrandedGiftIcon className="w-9 h-9 rounded-md drop-shadow-lg" />
                  </motion.div>
                </motion.div>
                {/* Breathing aura glow */}
                <motion.div
                  animate={{ scale: [1, 1.28, 1], opacity: [0.45, 0.15, 0.45] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute inset-0 rounded-[20px] -z-10"
                  style={{ background: "linear-gradient(135deg, #ec4899, #a855f7)", filter: "blur(16px)" }}
                />
              </div>
              <span className="text-white/85 text-[9px] font-semibold mt-0.5">Gift</span>
            </motion.button>


            {/* Host: Seat Mgmt  |  Visitor: Join */}
            {isHost ? (
              <BarButton
                icon={Armchair}
                label="Seat"
                onClick={onJoinSeatClick}
                bg="radial-gradient(120% 120% at 30% 20%, #6ee7b7 0%, #10b981 45%, #047857 100%)"
                shadow="rgba(16,185,129,0.55)"
                badge={applicantCount > 0 ? applicantCount : undefined}
              />
            ) : (
              <motion.button
                whileTap={{ scale: 0.9 }}
                whileHover={{ y: -2, scale: 1.03 }}
                transition={{ type: "spring", damping: 14, stiffness: 480 }}
                onClick={!isWaitingToJoin ? () => { haptic(10); onJoinRequest?.(); } : undefined}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl relative overflow-hidden"
                style={{
                  background: isWaitingToJoin
                    ? "radial-gradient(120% 120% at 30% 20%, #fde68a 0%, #f59e0b 45%, #92400e 100%)"
                    : "radial-gradient(120% 120% at 30% 20%, #a5f3fc 0%, #06b6d4 45%, #3730a3 100%)",
                  boxShadow: isWaitingToJoin
                    ? "0 8px 20px rgba(245,158,11,0.55), inset 0 1px 0 rgba(255,255,255,0.5), inset 0 -3px 6px rgba(0,0,0,0.25)"
                    : "0 8px 20px rgba(99,102,241,0.5), inset 0 1px 0 rgba(255,255,255,0.5), inset 0 -3px 6px rgba(0,0,0,0.25)",
                  border: "1px solid rgba(255,255,255,0.18)",
                }}
              >
                <span className="absolute inset-x-1.5 top-0.5 h-2 rounded-xl pointer-events-none" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.55), transparent)" }} />
                {isWaitingToJoin ? (
                  <>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                      className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full relative z-10"
                    />
                    <span className="text-white font-bold text-[11px] relative z-10" style={{ textShadow: "0 1px 2px rgba(0,0,0,0.35)" }}>Waiting</span>
                  </>
                ) : (
                  <>
                    <Hand className="w-3.5 h-3.5 text-white relative z-10" style={{ filter: "drop-shadow(0 1px 1.5px rgba(0,0,0,0.4))" }} />
                    <span className="text-white font-bold text-[11px] relative z-10" style={{ textShadow: "0 1px 2px rgba(0,0,0,0.35)" }}>Join</span>
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
              bg={showMoreMenu
                ? "radial-gradient(120% 120% at 30% 20%, rgba(236,72,153,0.55) 0%, rgba(168,85,247,0.85) 45%, rgba(76,29,149,0.95) 100%)"
                : "radial-gradient(120% 120% at 30% 20%, rgba(255,255,255,0.2) 0%, rgba(40,30,55,0.85) 45%, rgba(10,8,20,0.95) 100%)"}
              shadow={showMoreMenu ? "rgba(168,85,247,0.55)" : "rgba(0,0,0,0.4)"}
              border={showMoreMenu ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.12)"}
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
  const handlePress = useCallback(() => {
    haptic(8);
    onClick?.();
  }, [onClick]);
  return (
    <motion.button
      whileTap={{ scale: 0.88 }}
      whileHover={{ y: -2, scale: 1.05 }}
      transition={{ type: "spring", damping: 14, stiffness: 480 }}
      onClick={handlePress}
      className="flex flex-col items-center gap-0.5 px-1.5 py-0.5 will-change-transform"
      style={{ transform: "translateZ(0)" }}
    >
      <motion.div
        whileTap={{ rotate: -6 }}
        transition={{ type: "spring", damping: 10, stiffness: 600 }}
        className="relative w-11 h-11 rounded-2xl flex items-center justify-center overflow-hidden"
        style={{
          background: bg,
          boxShadow: shadow !== "none"
            ? `0 8px 20px ${shadow}, inset 0 1px 0 rgba(255,255,255,0.5), inset 0 -3px 6px rgba(0,0,0,0.25)`
            : `inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -2px 4px rgba(0,0,0,0.18)`,
          border: border ? `1px solid ${border}` : undefined,
        }}
      >
        <span className="absolute inset-x-1.5 top-0.5 h-2 rounded-xl pointer-events-none" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.5), transparent)" }} />
        <Icon className="w-5 h-5 text-white relative z-10" style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.4))" }} />
        {badge && badge > 0 && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", damping: 10, stiffness: 400 }}
            className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full flex items-center justify-center ring-2 ring-[#0c0820]"
            style={{ background: "linear-gradient(135deg, #ef4444, #dc2626)", boxShadow: "0 3px 6px rgba(239,68,68,0.4)" }}
          >
            <span className="text-white text-[8px] font-bold tabular-nums">{badge > 99 ? "99+" : badge}</span>
          </motion.div>
        )}
      </motion.div>
      <span className="text-white/80 text-[9px] font-semibold tracking-tight" style={{ textShadow: "0 1px 2px rgba(0,0,0,0.4)" }}>{label}</span>
    </motion.button>
  );
}

export default ChametStyleBottomBar;
