import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, Users, Armchair, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface SeatSelectorPanelProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  currentSeats: number;
  maxSeatsAllowed: number; // From Admin Panel
  isHost: boolean;
  onSeatsChanged: (newSeatCount: number) => void;
}

// Available seat options (must be even numbers for grid layout)
const SEAT_OPTIONS = [2, 4, 6, 8, 10];

export function SeatSelectorPanel({
  isOpen,
  onClose,
  roomId,
  currentSeats,
  maxSeatsAllowed,
  isHost,
  onSeatsChanged
}: SeatSelectorPanelProps) {
  const [selectedSeats, setSelectedSeats] = useState(currentSeats);
  const [isUpdating, setIsUpdating] = useState(false);

  // Filter options based on max allowed from admin
  const availableOptions = SEAT_OPTIONS.filter(n => n <= maxSeatsAllowed);

  useEffect(() => {
    setSelectedSeats(currentSeats);
  }, [currentSeats, isOpen]);

  const handleSelectSeats = async (seatCount: number) => {
    if (!isHost) {
      toast.error("Only host can change seat count");
      return;
    }
    
    setSelectedSeats(seatCount);
    setIsUpdating(true);

    try {
      const { error } = await supabase
        .from('party_rooms')
        .update({ active_seats: seatCount } as any)
        .eq('id', roomId);

      if (error) throw error;

      // Pkg81: LiveKit-only fanout — replaces `party-room-status-${roomId}`
      // Supabase Realtime active_seats listener. Host is the sole writer;
      // every participant receives within ~50ms via DataPacket.
      void import('@/lib/livekitPartyEventsSignaling').then(({ publishRoomStateChanged }) =>
        publishRoomStateChanged(roomId, { active_seats: seatCount })
      );

      onSeatsChanged(seatCount);
      // System notification hidden per design requirements
      onClose();
    } catch (error) {
      console.error('Error updating seats:', error);
      toast.error("Failed to update seats");
      setSelectedSeats(currentSeats);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl overflow-hidden shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center">
                  <Armchair className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Seat Settings</h3>
                  <p className="text-xs text-gray-500">Choose number of seats</p>
                </div>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Seat Options Grid */}
            <div className="p-5 pb-safe">
              {!isHost && (
                <div className="mb-4 p-3 bg-amber-50 rounded-xl flex items-center gap-2">
                  <Crown className="w-5 h-5 text-amber-500" />
                  <span className="text-sm text-amber-700">Only room host can change seats</span>
                </div>
              )}
              
              <div className="grid grid-cols-5 gap-3">
                {availableOptions.map((seatCount) => {
                  const isSelected = selectedSeats === seatCount;
                  const isCurrent = currentSeats === seatCount;
                  
                  return (
                    <motion.button
                      key={seatCount}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => isHost && handleSelectSeats(seatCount)}
                      disabled={!isHost || isUpdating}
                      className={cn(
                        "relative flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all",
                        isSelected
                          ? "bg-gradient-to-br from-green-50 to-emerald-50 border-green-500 shadow-lg shadow-green-500/20"
                          : "bg-gray-50 border-gray-200 hover:border-gray-300",
                        !isHost && "opacity-60 cursor-not-allowed"
                      )}
                    >
                      {/* Seat Count */}
                      <span className={cn(
                        "text-2xl font-bold",
                        isSelected ? "text-green-600" : "text-gray-700"
                      )}>
                        {seatCount}
                      </span>
                      
                      {/* Label */}
                      <span className={cn(
                        "text-xs font-medium",
                        isSelected ? "text-green-600" : "text-gray-500"
                      )}>
                        Seats
                      </span>

                      {/* Visual representation */}
                      <div className="flex flex-wrap justify-center gap-0.5 mt-1">
                        {Array.from({ length: seatCount }).map((_, i) => (
                          <div
                            key={i}
                            className={cn(
                              "w-2 h-2 rounded-full",
                              isSelected ? "bg-green-400" : "bg-gray-300"
                            )}
                          />
                        ))}
                      </div>

                      {/* Current indicator */}
                      {isCurrent && (
                        <div className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center shadow-md">
                          <Check className="w-3 h-3 text-white" />
                        </div>
                      )}
                    </motion.button>
                  );
                })}
              </div>

              {/* Info text */}
              <div className="mt-4 p-3 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Users className="w-4 h-4" />
                  <span>
                    Max seats allowed by admin: <strong>{maxSeatsAllowed}</strong>
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default SeatSelectorPanel;
