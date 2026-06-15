/**
 * RoomTopNoticeStack
 * =================================================================
 * True-top notice slot for in-room screens (LiveStream / PartyRoom /
 * ActiveCallScreen). Anchors admin rule banner + host welcome at the
 * top of the room (just below the host header), NOT above the bottom
 * action buttons.
 *
 * Bigo/Chamet/Olamet pattern (verified against reference video frames
 * 5, 30, 45): system notices sit at the true top, compact pill style,
 * welcome auto-collapses, admin rule stays visible while the room is
 * young then fades to a thin chip after first interaction.
 *
 * No DB / business logic — it composes the existing `RoomWelcomeBanner`
 * (admin rule) and a compact host welcome line.
 */
import { useEffect, useState, memo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { RoomWelcomeBanner } from "@/components/room/RoomWelcomeBanner";
import {
  ensureValidLevel,
  formatLevel,
} from "@/features/shared/level";

type RoomKind = "live" | "party_audio" | "party_video" | "party_game";

interface RoomTopNoticeStackProps {
  /** Decides which admin rule banner row is fetched. */
  roomType: RoomKind;
  /** Host display name (for the host welcome line). */
  hostName?: string;
  /** Host level for the inline level badge. */
  hostLevel?: number;
  /** Optional room title appended after host name. */
  roomTitle?: string;
  /** When false, the host welcome line is suppressed (e.g. private call). */
  showHostWelcome?: boolean;
  /** Distance from the very top of the room in px. Caller controls the
   *  exact gap below the header so we stay layout-agnostic. */
  topOffsetPx?: number;
  /** Optional className override (positioning, max-width). */
  className?: string;
}

/** Auto-collapse the host welcome row after this many ms. */
const HOST_WELCOME_VISIBLE_MS = 6000;

export const RoomTopNoticeStack = memo(function RoomTopNoticeStack({
  roomType,
  hostName,
  hostLevel,
  roomTitle,
  showHostWelcome = true,
  topOffsetPx = 64,
  className,
}: RoomTopNoticeStackProps) {
  const [welcomeOpen, setWelcomeOpen] = useState(true);

  useEffect(() => {
    if (!showHostWelcome || !hostName) return;
    const t = window.setTimeout(
      () => setWelcomeOpen(false),
      HOST_WELCOME_VISIBLE_MS,
    );
    return () => window.clearTimeout(t);
  }, [hostName, showHostWelcome]);

  const level = ensureValidLevel(hostLevel ?? 1);
  const kindLabel =
    roomType === "party_audio"
      ? "Audio Party"
      : roomType === "party_video"
        ? "Video Party"
        : roomType === "party_game"
          ? "Game Party"
          : "Live Stream";

  return (
    <div
      className={cn(
        "fixed left-0 right-0 z-[60] flex flex-col items-start gap-1 px-3 pointer-events-none",
        className,
      )}
      style={{
        top: `calc(env(safe-area-inset-top, 0px) + ${topOffsetPx}px)`,
      }}
      aria-live="polite"
    >
      {/* Admin rule banner — sticky while present. */}
      <div className="pointer-events-auto max-w-[92%]">
        <RoomWelcomeBanner roomType={roomType} />
      </div>

      {/* Host welcome — auto-collapses after 6s. */}
      <AnimatePresence>
        {showHostWelcome && hostName && welcomeOpen && (
          <motion.div
            key="host-welcome"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25 }}
            className={cn(
              "pointer-events-auto flex items-center gap-1 py-0.5 px-2 rounded-lg w-fit max-w-[92%]",
              "bg-amber-500/20 backdrop-blur-sm border border-amber-300/20",
            )}
          >
            <span className="text-[10px] shrink-0 opacity-80">👋</span>
            <span className="text-[10px] text-amber-50/90 font-normal drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] leading-tight truncate">
              Welcome to {hostName}'s {kindLabel}
              {roomTitle && ` — ${roomTitle}`}
              <span className="ml-1 text-amber-200 font-semibold">
                {formatLevel(level)}
              </span>
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

export default RoomTopNoticeStack;
