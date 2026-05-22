/**
 * Pkg131 UI wiring for PartyRoom — audience floating ✋ button + host queue trigger.
 * Mirrors LiveStream raise-hand UX. Zero new channels / polls (rides Pkg107 metadata).
 */
import { Hand } from "lucide-react";
import { toast } from "sonner";
import { useCallback } from "react";
import { raiseHand, lowerHand, useRaisedHands } from "@/lib/livekitRaiseHand";
import { RaiseHandQueueSheet } from "@/components/livekit/RaiseHandQueueSheet";

interface Props {
  roomId: string;
  isHost: boolean;
  hasSeat: boolean;
  currentUserId?: string;
  showQueue: boolean;
  onOpenQueue: () => void;
  onCloseQueue: () => void;
}

export const PartyRaiseHandUI = ({
  roomId,
  isHost,
  hasSeat,
  currentUserId,
  showQueue,
  onOpenQueue,
  onCloseQueue,
}: Props) => {
  const hands = useRaisedHands("party", roomId);
  const iHaveRaised = !!(currentUserId && hands.some((h) => h.identity === currentUserId));

  const handleToggle = useCallback(async () => {
    try {
      if (iHaveRaised) {
        await lowerHand("party", roomId);
        toast.success("Hand lowered");
      } else {
        const ok = await raiseHand("party", roomId);
        if (ok) toast.success("Hand raised — host has been notified");
        else toast.error("Couldn't raise hand");
      }
    } catch (e) {
      toast.error((e as Error)?.message || "Action failed");
    }
  }, [iHaveRaised, roomId]);

  // Audience without a seat → floating raise-hand toggle
  const showAudienceCta = !isHost && !hasSeat;

  // Host → floating queue button (badge with count)
  const showHostCta = isHost;

  return (
    <>
      {showAudienceCta && (
        <button
          type="button"
          onClick={handleToggle}
          className={`fixed left-4 bottom-44 z-[55] w-12 h-12 rounded-full shadow-lg flex items-center justify-center active:scale-95 transition ${
            iHaveRaised
              ? "bg-gradient-to-br from-amber-500 to-orange-600 shadow-amber-500/50 ring-2 ring-amber-300"
              : "bg-gradient-to-br from-amber-400 to-yellow-500 shadow-yellow-500/40"
          }`}
          aria-label={iHaveRaised ? "Lower hand" : "Raise hand"}
        >
          <Hand className="w-6 h-6 text-white" strokeWidth={2} />
        </button>
      )}

      {showHostCta && (
        <button
          type="button"
          onClick={onOpenQueue}
          className="fixed left-4 bottom-44 z-[55] w-12 h-12 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-orange-500/40 flex items-center justify-center active:scale-95 transition"
          aria-label={`Raised hands: ${hands.length}`}
        >
          <Hand className="w-6 h-6 text-white" strokeWidth={2} />
          {hands.length > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-background">
              {hands.length}
            </span>
          )}
        </button>
      )}

      <RaiseHandQueueSheet
        open={showQueue}
        onClose={onCloseQueue}
        scope="party"
        id={roomId}
        roomName={`party_${roomId}`}
      />
    </>
  );
};

export default PartyRaiseHandUI;
