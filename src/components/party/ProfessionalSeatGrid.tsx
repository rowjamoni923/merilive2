import { motion, AnimatePresence } from "framer-motion";
import { LevelBadge } from "@/components/common/LevelBadge";
import AvatarWithFrame from "@/components/common/AvatarWithFrame";
import { Mic, MicOff, Crown, Lock, Plus, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface Participant {
  id: string;
  userId: string;
  displayName: string;
  avatarUrl?: string;
  level: number;
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

interface ProfessionalSeatGridProps {
  seats: SeatPosition[];
  currentUserId?: string;
  isHost?: boolean;
  onSeatClick?: (seatId: number) => void;
  onRequestSeat?: (seatId: number) => void;
  maxSeats?: number;
  layout?: 'grid' | 'circle' | 'row';
}

export const ProfessionalSeatGrid = ({
  seats,
  currentUserId,
  isHost = false,
  onSeatClick,
  onRequestSeat,
  maxSeats = 8,
  layout = 'grid'
}: ProfessionalSeatGridProps) => {
  const getLayoutClass = () => {
    switch (layout) {
      case 'circle':
        return 'flex flex-wrap justify-center gap-4';
      case 'row':
        return 'flex justify-center gap-2 overflow-x-auto';
      default:
        return 'grid grid-cols-4 gap-3';
    }
  };

  return (
    <div className={getLayoutClass()}>
      {seats.slice(0, maxSeats).map((seat, i) => (
        <ProfessionalSeat
          key={seat.id}
          seat={seat}
          index={i}
          isCurrentUser={seat.participant?.userId === currentUserId}
          isHostUser={isHost}
          onClick={() => {
            if (seat.participant) {
              onSeatClick?.(seat.id);
            } else if (!seat.isLocked) {
              onRequestSeat?.(seat.id);
            }
          }}
        />
      ))}
    </div>
  );
};

interface ProfessionalSeatProps {
  seat: SeatPosition;
  index: number;
  isCurrentUser?: boolean;
  isHostUser?: boolean;
  onClick?: () => void;
}

const ProfessionalSeat = ({
  seat,
  index,
  isCurrentUser = false,
  isHostUser = false,
  onClick
}: ProfessionalSeatProps) => {
  const { participant, isLocked, hasRequest, id } = seat;
  const isHost = id === 0 || participant?.isHost;

  // Empty seat
  if (!participant) {
    return (
      <motion.button
        onClick={onClick}
        disabled={isLocked && !isHostUser}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: index * 0.04 }}
        className={cn(
          "flex flex-col items-center justify-center w-16 h-20 rounded-xl transition-all",
          isLocked
            ? "opacity-40"
            : "active:scale-95"
        )}
        whileTap={{ scale: 0.95 }}
      >
        {isLocked ? (
          <div className="w-12 h-12 rounded-full flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.04)", border: "1.5px solid rgba(255,255,255,0.06)" }}
          >
            <Lock className="w-4 h-4 text-white/20" />
          </div>
        ) : hasRequest ? (
          <motion.div
            animate={{ scale: [1, 1.08, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="w-12 h-12 rounded-full flex items-center justify-center"
            style={{
              background: "rgba(245,158,11,0.1)",
              border: "2px dashed rgba(245,158,11,0.5)",
              boxShadow: "0 0 16px rgba(245,158,11,0.1)",
            }}
          >
            <Users className="w-4 h-4 text-amber-400" />
          </motion.div>
        ) : (
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center"
            style={{
              background: "radial-gradient(circle at 40% 30%, rgba(255,255,255,0.06), rgba(255,255,255,0.02))",
              border: "1.5px dashed rgba(168,85,247,0.25)",
            }}
          >
            <Plus className="w-4 h-4 text-white/30" />
          </div>
        )}
        <span className="text-white/30 text-[9px] mt-1 font-medium">
          {isHost ? "Host" : `${id}`}
        </span>
      </motion.button>
    );
  }

  // Occupied seat
  return (
    <motion.button
      onClick={onClick}
      className="flex flex-col items-center w-16 relative"
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: index * 0.04 }}
      whileTap={{ scale: 0.95 }}
    >
      {/* Speaking pulse */}
      <AnimatePresence>
        {participant.isSpeaking && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2, repeat: Infinity }}
            className="absolute inset-0 -z-10 rounded-full"
            style={{
              background: "linear-gradient(135deg, rgba(52,211,153,0.25), rgba(34,211,238,0.25))",
              filter: "blur(10px)",
            }}
          />
        )}
      </AnimatePresence>

      {/* Host crown */}
      {isHost && (
        <motion.div
          className="absolute -top-3 z-10"
          animate={{ y: [0, -2, 0] }}
          transition={{ duration: 2.5, repeat: Infinity }}
        >
          <Crown className="w-5 h-5 text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.6)]" fill="#fbbf24" />
        </motion.div>
      )}

      {/* Avatar with Frame */}
      <div className="relative">
        <AvatarWithFrame
          userId={participant.userId}
          src={participant.avatarUrl}
          name={participant.displayName}
          level={participant.level}
          size="sm"
          showAnimation={participant.level >= 20 || !!isHost}
        />

        {/* Mic */}
        <div
          className={cn(
            "absolute -bottom-0.5 -right-0.5 w-[17px] h-[17px] rounded-full flex items-center justify-center z-10 ring-2",
            participant.isMuted
              ? "bg-red-500/90 ring-red-500/30"
              : participant.isSpeaking
              ? "bg-emerald-500/90 ring-emerald-500/30"
              : "bg-slate-600/80 ring-slate-600/30"
          )}
        >
          {participant.isMuted ? (
            <MicOff className="w-2 h-2 text-white" />
          ) : (
            <Mic className="w-2 h-2 text-white" />
          )}
        </div>
      </div>

      {/* Name and Level */}
      <div className="flex flex-col items-center mt-1.5 w-full">
        <LevelBadge level={participant.level} size="xs" />
        <span className={cn(
          "text-[10px] font-medium truncate w-full text-center mt-0.5",
          isHost ? "text-amber-300" :
          isCurrentUser ? "text-cyan-300" :
          "text-white/80"
        )}>
          {participant.displayName}
        </span>
      </div>
    </motion.button>
  );
};

// Horizontal seat bar for audio rooms
export const HorizontalSeatBar = ({
  seats,
  currentUserId,
  onSeatClick
}: {
  seats: SeatPosition[];
  currentUserId?: string;
  onSeatClick?: (seatId: number) => void;
}) => {
  return (
    <div className="flex items-center justify-center gap-4 py-4 px-2 overflow-x-auto">
      {seats.map((seat, index) => (
        <motion.div
          key={seat.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
        >
          <ProfessionalSeat
            seat={seat}
            index={index}
            isCurrentUser={seat.participant?.userId === currentUserId}
            onClick={() => onSeatClick?.(seat.id)}
          />
        </motion.div>
      ))}
    </div>
  );
};

export default ProfessionalSeatGrid;
