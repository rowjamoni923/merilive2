import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Swords, Crown, Search, Users, Shuffle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface LiveHost {
  id: string;
  display_name: string;
  avatar_url: string;
  user_level: number;
  gender: string;
  stream_id: string;
  viewer_count: number;
}

interface PKBattlePanelProps {
  isOpen: boolean;
  onClose: () => void;
  currentStreamId: string;
  currentUserId: string;
  currentUserName: string;
  currentUserAvatar: string;
  currentUserLevel: number;
  onBattleStarted: (battleId: string, opponentInfo: LiveHost) => void;
}

export const PKBattlePanel = ({
  isOpen,
  onClose,
  currentStreamId,
  currentUserId,
  currentUserName,
  currentUserAvatar,
  currentUserLevel,
  onBattleStarted,
}: PKBattlePanelProps) => {
  const [liveHosts, setLiveHosts] = useState<LiveHost[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sendingRequest, setSendingRequest] = useState<string | null>(null);
  const [sendingRandom, setSendingRandom] = useState(false);

  // Pkg82d: track pending invites (direct + random) so the window-event
  // listener can route incoming pk_invite_accepted / pk_invite_declined /
  // pk_random_accepted notifications back to the right handler WITHOUT
  // opening any Supabase Realtime channel.
  const pendingDirectRef = useRef<Map<string, LiveHost>>(new Map());
  const pendingRandomRef = useRef<boolean>(false);
  const randomTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchLiveHosts();
    }
  }, [isOpen]);

  // Pkg82d: single window-event bridge for ALL PK reply signals.
  useEffect(() => {
    const handler = async (ev: Event) => {
      const detail = (ev as CustomEvent).detail as any;
      if (!detail || typeof detail.type !== "string") return;
      const data = detail.data ?? {};

      if (detail.type === "pk_invite_accepted" && data.battleId) {
        const opponent = pendingDirectRef.current.get(data.battleId);
        if (opponent) {
          pendingDirectRef.current.delete(data.battleId);
          toast.success("PK Battle starting!");
          onBattleStarted(data.battleId, opponent);
        }
      } else if (detail.type === "pk_invite_declined" && data.battleId) {
        const opponent = pendingDirectRef.current.get(data.battleId);
        if (opponent) {
          pendingDirectRef.current.delete(data.battleId);
          toast.error(`${opponent.display_name} declined the PK request`);
        }
      } else if (detail.type === "pk_random_accepted" && pendingRandomRef.current) {
        pendingRandomRef.current = false;
        if (randomTimeoutRef.current) {
          clearTimeout(randomTimeoutRef.current);
          randomTimeoutRef.current = null;
        }
        // Acceptor info comes from the notification payload.
        const acceptorId = data.fromUserId;
        const acceptorName = data.fromName || "Host";
        const acceptorAvatar = data.fromAvatar || "";
        const acceptorLevel = data.fromLevel || 1;
        const acceptorStreamId = data.fromStreamId || "";

        const { data: battle, error } = await supabase
          .from("pk_battles")
          .insert({
            challenger_id: currentUserId,
            opponent_id: acceptorId,
            challenger_stream_id: currentStreamId,
            opponent_stream_id: acceptorStreamId,
            status: "accepted",
            started_at: new Date().toISOString(),
            duration_seconds: 180,
          })
          .select()
          .single();

        if (!error && battle) {
          toast.success(`${acceptorName} accepted your PK!`);
          onBattleStarted(battle.id, {
            id: acceptorId,
            display_name: acceptorName,
            avatar_url: acceptorAvatar,
            user_level: acceptorLevel,
            gender: "female",
            stream_id: acceptorStreamId,
            viewer_count: 0,
          });
        }
      }
    };

    window.addEventListener("pk-notification", handler);
    return () => window.removeEventListener("pk-notification", handler);
  }, [currentUserId, currentStreamId, onBattleStarted]);

  useEffect(() => {
    return () => {
      if (randomTimeoutRef.current) clearTimeout(randomTimeoutRef.current);
    };
  }, []);

  const fetchLiveHosts = async () => {
    setLoading(true);
    try {
      const { data: streams, error } = await supabase
        .from("live_streams")
        .select(`
          id,
          viewer_count,
          host_id,
          profiles!live_streams_host_id_fkey (
            id,
            display_name,
            avatar_url,
            user_level,
            gender
          )
        `)
        .eq("is_active", true)
        .neq("host_id", currentUserId)
        .order("viewer_count", { ascending: false });

      if (error) throw error;

      const hosts: LiveHost[] = (streams || [])
        .filter((stream: any) => stream.profiles?.gender === "female")
        .map((stream: any) => ({
          id: stream.profiles.id,
          display_name: stream.profiles.display_name || "Host",
          avatar_url: stream.profiles.avatar_url || "",
          user_level: stream.profiles.user_level || 1,
          gender: stream.profiles.gender || "female",
          stream_id: stream.id,
          viewer_count: stream.viewer_count || 0,
        }));

      setLiveHosts(hosts);
    } catch (error) {
      console.error("Error fetching live hosts:", error);
      toast.error("Failed to load live hosts");
    } finally {
      setLoading(false);
    }
  };

  const sendPKRequest = async (opponent: LiveHost) => {
    setSendingRequest(opponent.id);
    try {
      const { data: battle, error } = await supabase
        .from("pk_battles")
        .insert({
          challenger_id: currentUserId,
          opponent_id: opponent.id,
          challenger_stream_id: currentStreamId,
          opponent_stream_id: opponent.stream_id,
          status: "pending",
          duration_seconds: 180,
        })
        .select()
        .single();

      if (error) throw error;

      // Pkg82d: send invite via FCM (was `pk_battle_${battleId}` postgres_changes).
      pendingDirectRef.current.set(battle.id, opponent);
      try {
        await supabase.functions.invoke("pk-invite-deliver", {
          body: {
            kind: "direct_invite",
            battleId: battle.id,
            toUserId: opponent.id,
            fromUserId: currentUserId,
            fromName: currentUserName,
            fromAvatar: currentUserAvatar,
            fromLevel: currentUserLevel,
            fromStreamId: currentStreamId,
            toStreamId: opponent.stream_id,
          },
        });
      } catch (err) {
        console.warn("[PKBattlePanel] pk-invite-deliver direct_invite failed:", err);
      }

      toast.success(`PK request sent to ${opponent.display_name}!`);
      onClose();
    } catch (error) {
      console.error("Error sending PK request:", error);
      toast.error("Failed to send PK request");
    } finally {
      setSendingRequest(null);
    }
  };

  // Random PK Match — broadcasts to ALL live female hosts via FCM (Pkg82d).
  const sendRandomPKRequest = async () => {
    setSendingRandom(true);
    try {
      pendingRandomRef.current = true;

      const { data, error } = await supabase.functions.invoke("pk-invite-deliver", {
        body: {
          kind: "random_invite",
          fromUserId: currentUserId,
          fromName: currentUserName,
          fromAvatar: currentUserAvatar,
          fromLevel: currentUserLevel,
          fromStreamId: currentStreamId,
        },
      });

      if (error) throw error;
      const delivered = (data as any)?.delivered ?? 0;
      toast.success(
        delivered > 0
          ? `Random PK request sent to ${delivered} live host${delivered > 1 ? "s" : ""}!`
          : "No live hosts available right now"
      );

      // Auto-clear pending flag after 25s — matches the prior cleanup window.
      randomTimeoutRef.current = setTimeout(() => {
        pendingRandomRef.current = false;
        randomTimeoutRef.current = null;
      }, 25000);

      onClose();
    } catch (error) {
      console.error("Error sending random PK:", error);
      toast.error("Failed to send random PK request");
      pendingRandomRef.current = false;
    } finally {
      setSendingRandom(false);
    }
  };

  const filteredHosts = liveHosts.filter(
    (host) =>
      host.display_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-end justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />

        <motion.div
          className="relative w-full max-w-lg bg-gradient-to-b from-purple-900 via-purple-800 to-purple-900 rounded-t-3xl overflow-hidden"
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 25 }}
        >
          <div className="relative px-4 py-4 border-b border-white/10">
            <div className="flex items-center justify-center gap-2">
              <Swords className="w-6 h-6 text-amber-400" />
              <h2 className="text-xl font-bold text-white">PK Battle</h2>
              <Swords className="w-6 h-6 text-amber-400 transform scale-x-[-1]" />
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="absolute right-3 top-3 w-8 h-8 rounded-full text-white/60 hover:text-white"
              onClick={onClose}
            >
              <X className="w-5 h-5" />
            </Button>

            <div className="mt-4 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/70" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search hosts..."
                className="w-full bg-white/10 border-white/20 rounded-full text-white placeholder:text-white/70 pl-10"
              />
            </div>
          </div>

          <ScrollArea className="h-80">
            <div className="p-4 space-y-3">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-10">
                  <div className="w-10 h-10 border-3 border-amber-400 border-t-transparent rounded-full animate-spin" />
                  <p className="text-white/60 mt-3">Loading...</p>
                </div>
              ) : filteredHosts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10">
                  <Users className="w-12 h-12 text-white/30 mb-3" />
                  <p className="text-white/60">No live hosts found</p>
                </div>
              ) : (
                filteredHosts.map((host) => (
                  <motion.div
                    key={host.id}
                    className="flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all"
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className="relative">
                      <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-pink-500 ring-2 ring-pink-500/30">
                        <img
                          src={host.avatar_url || "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150"}
                          alt={host.display_name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-400 to-amber-600 px-1.5 py-0.5 rounded text-[8px] font-bold text-black">
                        Lv{host.user_level}
                      </div>
                      <span className="absolute top-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-purple-900" />
                    </div>

                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-semibold">{host.display_name}</span>
                        <Badge className="bg-red-500/20 text-red-400 border-0 text-xs">
                          LIVE
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-white/60 text-sm mt-0.5">
                        <span>👀 {host.viewer_count}</span>
                      </div>
                    </div>

                    <Button
                      size="sm"
                      className="bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white font-bold rounded-full px-4"
                      onClick={() => sendPKRequest(host)}
                      disabled={sendingRequest === host.id}
                    >
                      {sendingRequest === host.id ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          <Swords className="w-4 h-4 mr-1" />
                          PK
                        </>
                      )}
                    </Button>
                  </motion.div>
                ))
              )}
            </div>
          </ScrollArea>

          {/* Random Match Button + Footer */}
          <div className="p-4 border-t border-white/10 bg-white/5 space-y-3">
            <Button
              className="w-full h-12 bg-gradient-to-r from-amber-500 via-orange-500 to-pink-500 hover:from-amber-600 hover:via-orange-600 hover:to-pink-600 text-white font-bold rounded-2xl text-base shadow-lg shadow-orange-500/30"
              onClick={sendRandomPKRequest}
              disabled={sendingRandom}
            >
              {sendingRandom ? (
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              ) : (
                <Shuffle className="w-5 h-5 mr-2" />
              )}
              {sendingRandom ? "Sending..." : "Random Match"}
            </Button>
            <div className="flex items-center justify-center gap-4 text-sm">
              <div className="flex items-center gap-1.5">
                <Crown className="w-4 h-4 text-amber-400" />
                <span className="text-white/70">Whoever gets more gifts wins</span>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
