/**
 * Phase III.e — Per-seat gift target picker for Party Rooms.
 *
 * Bigo/Chamet-style horizontal strip rendered just above the GiftPanel.
 * Lets the sender pick which seated participant (host or speaker) the gift
 * should go to. Defaults to the host.
 *
 * Pure UI — receives the seated list + selection from the parent. No DB
 * calls and no business-logic changes; parent uses the selected receiverId
 * when invoking GiftingService.sendGift.
 */
import React, { useMemo } from "react";
import { Crown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PartyGiftSeatPickerSeat {
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  seatNumber: number; // 0 = host
  isHost: boolean;
}

interface Props {
  seats: PartyGiftSeatPickerSeat[];
  selectedUserId: string | null;
  onSelect: (userId: string) => void;
  selfUserId?: string | null;
}

const PartyGiftSeatPicker: React.FC<Props> = ({ seats, selectedUserId, onSelect, selfUserId }) => {
  // Exclude self (can't gift yourself) and sort: host first, then by seat number.
  const visible = useMemo(() => {
    return seats
      .filter((s) => s.userId && s.userId !== selfUserId)
      .sort((a, b) => {
        if (a.isHost && !b.isHost) return -1;
        if (!a.isHost && b.isHost) return 1;
        return a.seatNumber - b.seatNumber;
      });
  }, [seats, selfUserId]);

  if (visible.length === 0) return null;

  return (
    <div className="w-full px-3 py-2 bg-black/60 backdrop-blur-md border-t border-white/10">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[11px] uppercase tracking-wide text-white/60 font-semibold">
          Send To
        </span>
        <span className="text-[10px] text-white/40">
          {visible.find((s) => s.userId === selectedUserId)?.displayName || "Host"}
        </span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {visible.map((seat) => {
          const isSelected = seat.userId === selectedUserId;
          return (
            <button
              key={seat.userId}
              type="button"
              onClick={() => onSelect(seat.userId)}
              className={cn(
                "relative flex-shrink-0 flex flex-col items-center gap-1 px-1",
                "focus:outline-none"
              )}
            >
              <div
                className={cn(
                  "relative w-12 h-12 rounded-full overflow-hidden border-2 transition-all",
                  isSelected
                    ? "border-pink-400 ring-2 ring-pink-400/50 scale-105"
                    : "border-white/20"
                )}
              >
                {seat.avatarUrl ? (
                  <img
                    src={seat.avatarUrl}
                    alt={seat.displayName || ""}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-sm font-bold">
                    {(seat.displayName || "?").charAt(0).toUpperCase()}
                  </div>
                )}
                {seat.isHost && (
                  <div className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-yellow-500 rounded-full flex items-center justify-center shadow">
                    <Crown className="w-2.5 h-2.5 text-white" />
                  </div>
                )}
                {isSelected && (
                  <div className="absolute inset-0 bg-pink-500/20 flex items-center justify-center">
                    <Check className="w-5 h-5 text-white drop-shadow" />
                  </div>
                )}
              </div>
              <span
                className={cn(
                  "text-[10px] max-w-[52px] truncate",
                  isSelected ? "text-pink-300 font-semibold" : "text-white/70"
                )}
              >
                {seat.isHost ? "Host" : `Seat ${seat.seatNumber}`}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default PartyGiftSeatPicker;
