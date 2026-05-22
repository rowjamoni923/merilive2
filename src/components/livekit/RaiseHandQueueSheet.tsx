/**
 * Pkg131 UI — Host raise-hand queue sheet.
 *
 * Shows the live FIFO queue of audience members who raised their hand (Pkg131
 * `useRaisedHands` reading Pkg107 metadata). Host can Promote (Pkg130
 * `promoteToSpeaker`) or Dismiss (their identity is removed from the local
 * cache only — the audience member's metadata flag is still theirs to
 * clear, but Promote auto-clears it too via permission update).
 *
 * Zero new Supabase channels / polls / cross-user reads beyond a single
 * batched `profiles_public` lookup for display names.
 */
import { useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { Hand, ArrowUpCircle, Loader2, X } from "lucide-react";
import { useRaisedHands, lowerHand } from "@/lib/livekitRaiseHand";
import { promoteToSpeaker } from "@/lib/livekitUpdatePermission";
import type { MetadataScope } from "@/lib/livekitMetadata";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  open: boolean;
  onClose: () => void;
  /** LiveKit room scope. */
  scope: MetadataScope;
  /** Stream / party / call id (matches scope). */
  id: string | null | undefined;
  /** LiveKit room name e.g. `live_${id}` or `party_${roomId}`. */
  roomName: string | null | undefined;
}

interface NameRow {
  id: string;
  display_name?: string | null;
  avatar_url?: string | null;
}

export const RaiseHandQueueSheet = ({ open, onClose, scope, id, roomName }: Props) => {
  const hands = useRaisedHands(open ? scope : undefined, open ? id ?? undefined : undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Record<string, NameRow>>({});

  // Batched name lookup — only fetches identities we don't already have.
  useEffect(() => {
    if (!open || hands.length === 0) return;
    const missing = hands.map(h => h.identity).filter(idn => !profiles[idn]);
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles_public")
        .select("id, display_name, avatar_url")
        .in("id", missing);
      if (cancelled || !data) return;
      setProfiles(prev => {
        const next = { ...prev };
        for (const row of data) next[row.id] = row as NameRow;
        return next;
      });
    })();
    return () => { cancelled = true; };
  }, [open, hands, profiles]);

  const list = useMemo(() => hands, [hands]);

  const handlePromote = async (identity: string) => {
    if (!roomName) {
      toast.error("Missing room.");
      return;
    }
    setBusy(identity);
    try {
      const res = await promoteToSpeaker(roomName, identity, "raise_hand_promote");
      if (res.success) {
        toast.success("Promoted to speaker");
      } else {
        const code = res.error || "";
        toast.error(
          code === "update_permission_disabled" ? "Promote/demote is disabled by admin." :
          code === "not_room_host" ? "You are not the host of this room." :
          code || "Promote failed.",
        );
      }
    } catch (e) {
      toast.error((e as Error)?.message || "Promote failed.");
    } finally {
      setBusy(null);
    }
  };

  // Host-side dismiss: clears only when the host happens to be the raised
  // participant (rare). For audience members, the metadata can only be
  // cleared by themselves — but the cache row is dropped when they get
  // promoted (permission update triggers a metadata refresh) or leave.
  const handleDismissSelf = async () => {
    if (!scope || !id) return;
    await lowerHand(scope, id);
  };

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[75vh]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Hand className="w-5 h-5 text-amber-500" />
            Raised Hands ({list.length})
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="mt-2 max-h-[55vh] pr-2">
          {list.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No raised hands yet.
            </div>
          ) : (
            <div className="flex flex-col gap-2 py-2">
              {list.map((h, idx) => {
                const p = profiles[h.identity];
                const name = p?.display_name || h.identity.slice(0, 8);
                const isBusy = busy === h.identity;
                return (
                  <div
                    key={h.identity}
                    className="flex items-center gap-3 rounded-xl bg-muted/40 px-3 py-2"
                  >
                    <span className="w-6 text-center text-xs font-semibold text-muted-foreground">
                      {idx + 1}
                    </span>
                    <Avatar className="w-9 h-9">
                      <AvatarImage src={p?.avatar_url || undefined} />
                      <AvatarFallback>{name.slice(0, 1).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{name}</div>
                      {h.reason && (
                        <div className="text-xs text-muted-foreground truncate">
                          “{h.reason}”
                        </div>
                      )}
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handlePromote(h.identity)}
                      disabled={isBusy || busy !== null}
                      className="gap-1 bg-emerald-500 hover:bg-emerald-600 text-white" // dark-ok: emerald button
                    >
                      {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowUpCircle className="w-3.5 h-3.5" />}
                      Promote
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <div className="pt-3 flex justify-end">
          <Button variant="ghost" size="sm" onClick={handleDismissSelf} className="gap-1 text-muted-foreground">
            <X className="w-3.5 h-3.5" /> Lower my hand
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default RaiseHandQueueSheet;
