import { motion, AnimatePresence } from "framer-motion";
import { Crown, Lock, Mic, MicOff, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import BeansIcon from "@/components/common/BeansIcon";
import AvatarWithFrame from "@/components/common/AvatarWithFrame";

interface Participant {
  id: string;
  userId: string;
  displayName: string;
  avatarUrl?: string;
  level: number;
  beans?: number;
  isHost?: boolean;
  isSpeaking?: boolean;
  isMuted?: boolean;
}

interface SeatPosition {
  id: number;
  participant?: Participant | null;
  isLocked?: boolean;
  hasRequest?: boolean;
}

interface ChametStyleSeatGridProps {
  seats: SeatPosition[];
  currentUserId?: string;
  isHost?: boolean;
  onSeatClick?: (seatId: number) => void;
  onRequestSeat?: (seatId: number) => void;
}

/* ───────── Empty Seat ───────── */
const EmptySeat = ({
  seat,
  isHostSeat,
  onClick,
  index,
}: {
  seat: SeatPosition;
  isHostSeat: boolean;
  onClick?: () => void;
  index: number;
}) => {
  const size = isHostSeat ? "w-[72px] h-[72px]" : "w-[56px] h-[56px]";

  return (
    <motion.button
      onClick={onClick}
      disabled={seat.isLocked}
      initial={{ opacity: 0, scale: 0.7 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.04, type: "spring", stiffness: 400, damping: 22 }}
      className="flex flex-col items-center gap-1"
    >
      <div
        className={cn(
          "relative rounded-full flex items-center justify-center",
          size,
          seat.isLocked ? "opacity-40" : "active:scale-90 transition-transform"
        )}
        style={{
          background: "radial-gradient(circle at 40% 30%, rgba(255,255,255,0.08), rgba(255,255,255,0.02))",
          border: seat.isLocked
            ? "1.5px solid rgba(255,255,255,0.08)"
            : "1.5px dashed rgba(168,85,247,0.35)",
          boxShadow: seat.isLocked
            ? "none"
            : "inset 0 0 16px rgba(168,85,247,0.06), 0 4px 12px rgba(0,0,0,0.2)",
        }}
      >
        {seat.isLocked ? (
          <Lock className="w-4 h-4 text-white/20" />
        ) : (
          <motion.div
            animate={{ scale: [1, 1.15, 1], opacity: [0.35, 0.6, 0.35] }}
            transition={{ duration: 2.5, repeat: Infinity }}
            className="w-5 h-5 rounded-full"
            style={{
            }}
          />
        )}
      </div>
      {isHostSeat && (
        <span className="text-[9px] text-white/30 font-medium tracking-wide">HOST</span>
      )}
    </motion.button>
  );
};

/* ───────── Occupied Seat ───────── */
const OccupiedSeat = ({
  seat,
  isCurrentUser,
  isHostSeat,
  onClick,
  index,
}: {
  seat: SeatPosition;
  isCurrentUser: boolean;
  isHostSeat: boolean;
  onClick?: () => void;
  index: number;
}) => {
  const p = seat.participant!;
  const avatarSize = isHostSeat ? "md" : "sm";

  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, scale: 0.7 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.04, type: "spring", stiffness: 400, damping: 22 }}
      className={cn(
        "flex flex-col items-center relative",
        isHostSeat ? "scale-110" : ""
      )}
    >
      {/* Speaking Pulse Rings */}
      <AnimatePresence>
        {p.isSpeaking && (
          <>
            <motion.div
              key="ring1"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0.3, 0.6, 0.3], scale: [1, 1.25, 1] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.2, repeat: Infinity }}
              className="absolute rounded-full -z-10"
              style={{
                inset: isHostSeat ? "-8px" : "-6px",
                background: "linear-gradient(135deg, rgba(52,211,153,0.3), rgba(34,211,238,0.3))",
                filter: "blur(8px)",
              }}
            />
            <motion.div
              key="ring2"
              animate={{ opacity: [0.2, 0.5, 0.2], scale: [1, 1.4, 1] }}
              transition={{ duration: 1.6, repeat: Infinity, delay: 0.2 }}
              className="absolute rounded-full -z-20"
              style={{
              }}
            />
          </>
        )}
      </AnimatePresence>

      {/* Crown for host */}
      {(isHostSeat || p.isHost) && (
        <motion.div
          className="absolute z-20"
          style={{ top: isHostSeat ? "-14px" : "-12px" }}
          animate={{ y: [0, -2, 0], rotate: [0, -5, 5, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        >
          <Crown
            className={cn("text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.7)]", isHostSeat ? "w-6 h-6" : "w-5 h-5")}
            fill="#fbbf24"
          />
        </motion.div>
      )}

      {/* Avatar */}
      <div className="relative">
        <AvatarWithFrame
          userId={p.userId}
          src={p.avatarUrl}
          name={p.displayName}
          level={p.level}
          size={avatarSize}
          showFrame={true}
          showAnimation={true}
          showGlow={p.level >= 10}
        />

        {/* Mic indicator */}
        <div
          className={cn(
            "absolute -bottom-0.5 -right-0.5 w-[18px] h-[18px] rounded-full flex items-center justify-center z-20 ring-2",
            p.isMuted
              ? "bg-red-500/90 ring-red-500/30"
              : p.isSpeaking
              ? "bg-emerald-500/90 ring-emerald-500/30"
              : "bg-slate-600/90 ring-slate-600/30"
          )}
        >
          {p.isMuted ? (
            <MicOff className="w-2.5 h-2.5 text-white" />
          ) : (
            <Mic className="w-2.5 h-2.5 text-white" />
          )}
        </div>

        {/* Level badge */}
        <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 z-20">
          <div
            className="px-2 py-[1px] rounded-full text-[8px] font-black text-white whitespace-nowrap"
            style={{
              background:
                p.level >= 50
                  ? "linear-gradient(135deg, #9333ea, #ec4899)"
                  : p.level >= 40
                  ? "linear-gradient(135deg, #f59e0b, #ea580c)"
                  : p.level >= 30
                  ? "linear-gradient(135deg, #ec4899, #f43f5e)"
                  : p.level >= 20
                  ? "linear-gradient(135deg, #06b6d4, #6366f1)"
                  : p.level >= 10
                  ? "linear-gradient(135deg, #22c55e, #14b8a6)"
                  : "linear-gradient(135deg, #64748b, #475569)",
              boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
            }}
          >
            Lv.{p.level}
          </div>
        </div>
      </div>

      {/* Name */}
      <div className="flex flex-col items-center mt-3.5 w-[68px]">
        <span
          className={cn(
            "text-[10px] font-semibold truncate w-full text-center leading-tight",
            isHostSeat || p.isHost
              ? "text-amber-300"
              : isCurrentUser
              ? "text-cyan-300"
              : "text-white/90"
          )}
          style={{ textShadow: "0 1px 4px rgba(0,0,0,0.6)" }}
        >
          {p.displayName}
        </span>

        {/* Beans */}
        {p.beans !== undefined && p.beans > 0 && (
          <div
            className="flex items-center gap-0.5 mt-0.5 px-1.5 py-[1px] rounded-full"
            style={{
              backdropFilter: "blur(4px)",
            }}
          >
            <BeansIcon size={9} />
            <span className="text-[9px] text-white/80 font-medium tabular-nums">
              {p.beans >= 1000
                ? `${(p.beans / 1000).toFixed(p.beans >= 10000 ? 0 : 1)}K`
                : p.beans.toLocaleString()}
            </span>
          </div>
        )}
      </div>
    </motion.button>
  );
};

/* ───────── Seat Wrapper ───────── */
const ChametSeat = ({
  seat,
  isCurrentUser,
  isHostSeat,
  onClick,
  index,
}: {
  seat: SeatPosition;
  isCurrentUser: boolean;
  isHostSeat: boolean;
  onClick?: () => void;
  index: number;
}) => {
  if (!seat.participant) {
    return <EmptySeat seat={seat} isHostSeat={isHostSeat} onClick={onClick} index={index} />;
  }
  return (
    <OccupiedSeat seat={seat} isCurrentUser={isCurrentUser} isHostSeat={isHostSeat} onClick={onClick} index={index} />
  );
};

/* ═════════════════════════════════════════════
   MAIN GRID — Professional 1+8 Chamet Layout
   Row 1: 4 guest seats
   Center: Host seat (larger, prominent)
   Row 2: 4 guest seats
   ═════════════════════════════════════════════ */
export const ChametStyleSeatGrid = ({
  seats,
  currentUserId,
  isHost = false,
  onSeatClick,
  onRequestSeat,
}: ChametStyleSeatGridProps) => {
  const hostSeat = seats.find((s) => s.id === 0);
  const guestSeats = seats.filter((s) => s.id !== 0);

  // Ensure 8 guest slots
  while (guestSeats.length < 8) {
    guestSeats.push({ id: guestSeats.length + 1, participant: null, isLocked: false });
  }

  const topRow = guestSeats.slice(0, 4);
  const bottomRow = guestSeats.slice(4, 8);

  const handleClick = (seatId: number, hasParticipant: boolean) => {
    if (hasParticipant) {
      onSeatClick?.(seatId);
    } else {
      onRequestSeat?.(seatId);
    }
  };

  return (
    <div className="flex flex-col items-center gap-3 py-2 px-2">
      {/* ─── Top Row: 4 seats ─── */}
      <div className="flex items-end justify-center gap-5">
        {topRow.map((seat, i) => (
          <ChametSeat
            key={seat.id}
            seat={seat}
            isCurrentUser={seat.participant?.userId === currentUserId}
            isHostSeat={false}
            onClick={() => handleClick(seat.id, !!seat.participant)}
            index={i}
          />
        ))}
      </div>

      {/* ─── Host Seat (Center, Prominent) ─── */}
      {hostSeat && (
        <div className="relative my-1">
          {/* Decorative glow behind host */}
          <div
            className="absolute inset-0 -z-10 rounded-full"
            style={{
              inset: "-20px",
              background:
                "radial-gradient(circle, rgba(168,85,247,0.08) 0%, rgba(236,72,153,0.05) 50%, transparent 70%)",
            }}
          />
          <ChametSeat
            seat={hostSeat}
            isCurrentUser={hostSeat.participant?.userId === currentUserId}
            isHostSeat={true}
            onClick={() => handleClick(hostSeat.id, !!hostSeat.participant)}
            index={0}
          />
        </div>
      )}

      {/* ─── Bottom Row: 4 seats ─── */}
      <div className="flex items-start justify-center gap-5">
        {bottomRow.map((seat, i) => (
          <ChametSeat
            key={seat.id}
            seat={seat}
            isCurrentUser={seat.participant?.userId === currentUserId}
            isHostSeat={false}
            onClick={() => handleClick(seat.id, !!seat.participant)}
            index={i + 4}
          />
        ))}
      </div>
    </div>
  );
};

export default ChametStyleSeatGrid;
