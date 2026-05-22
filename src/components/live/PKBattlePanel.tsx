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
        transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
      >
        <div
          className="absolute inset-0 bg-black/65 backdrop-blur-md"
          onClick={onClose}
        />

        <motion.div
          className="relative w-full max-w-lg rounded-t-[28px] overflow-hidden border-t border-white/10 shadow-[0_-20px_60px_-10px_rgba(0,0,0,0.6)]"
          style={{
            background: 'linear-gradient(180deg, rgba(20,15,35,0.97) 0%, rgba(12,8,24,0.98) 100%)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
          }}
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 28, stiffness: 320 }}
        >
          {/* Battle aurora overlay */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.4]"
            style={{
              background:
                'radial-gradient(60% 40% at 12% 0%, rgba(239,68,68,0.28), transparent 70%), radial-gradient(60% 40% at 88% 0%, rgba(59,130,246,0.28), transparent 70%), radial-gradient(50% 30% at 50% 100%, rgba(168,85,247,0.18), transparent 70%)',
            }}
          />

          {/* Header */}
          <div className="relative px-4 pt-3 pb-3 border-b border-white/10">
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-white/25" />

            <div className="flex items-center justify-center gap-2.5">
              <motion.div
                animate={{ rotate: [-8, 8, -8] }}
                transition={{ repeat: Infinity, duration: 2.4, ease: "easeInOut" }}
              >
                <Swords className="w-6 h-6 text-amber-300 drop-shadow-[0_2px_8px_rgba(251,191,36,0.55)]" />
              </motion.div>
              <h2
                className="text-xl font-extrabold tracking-wide"
                style={{
                  background: 'linear-gradient(90deg, #fca5a5, #fde68a 50%, #93c5fd)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                PK Battle
              </h2>
              <motion.div
                animate={{ rotate: [8, -8, 8] }}
                transition={{ repeat: Infinity, duration: 2.4, ease: "easeInOut" }}
              >
                <Swords className="w-6 h-6 text-amber-300 transform scale-x-[-1] drop-shadow-[0_2px_8px_rgba(251,191,36,0.55)]" />
              </motion.div>
            </div>

            <Button
              size="icon"
              variant="ghost"
              className="absolute right-3 top-3 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 text-white"
              onClick={onClose}
            >
              <X className="w-4 h-4" />
            </Button>

            {/* Search */}
            <div className="mt-3 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/55" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search hosts..."
                className="w-full rounded-full text-white placeholder:text-white/50 pl-10 border-white/10 focus-visible:ring-2 focus-visible:ring-pink-500/50"
                style={{
                  background: 'linear-gradient(135deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.05) 100%)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
                }}
              />
            </div>
          </div>

          <ScrollArea className="h-80 relative">
            <div className="p-4 space-y-2.5" style={{ WebkitOverflowScrolling: 'touch' }}>
              {loading ? (
                <div className="flex flex-col items-center justify-center py-10">
                  <div className="w-10 h-10 border-2 border-amber-400/70 border-t-transparent rounded-full animate-spin" />
                  <p className="text-white/55 text-sm mt-3">Loading...</p>
                </div>
              ) : filteredHosts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-3">
                    <Users className="w-8 h-8 text-white/30" />
                  </div>
                  <p className="text-white/70 text-sm font-medium">No live hosts found</p>
                  <p className="text-white/40 text-xs mt-1">Try Random Match below</p>
                </div>
              ) : (
                filteredHosts.map((host, idx) => (
                  <motion.div
                    key={host.id}
                    className="relative flex items-center gap-3 p-3 rounded-2xl overflow-hidden"
                    style={{
                      background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
                    }}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: 'spring', damping: 24, stiffness: 360, delay: Math.min(idx * 0.035, 0.18) }}
                    whileTap={{ scale: 0.985 }}
                  >
                    <div className="relative flex-shrink-0">
                      <div
                        className="w-14 h-14 rounded-full overflow-hidden"
                        style={{
                          boxShadow: '0 0 0 2px rgba(236,72,153,0.85), 0 0 0 4px rgba(236,72,153,0.25), 0 6px 16px -4px rgba(236,72,153,0.45)',
                        }}
                      >
                        <img
                          src={host.avatar_url || "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150"}
                          alt={host.display_name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div
                        className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded text-[9px] font-bold text-black"
                        style={{
                          background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                          boxShadow: '0 2px 6px -1px rgba(251,191,36,0.55), inset 0 1px 0 rgba(255,255,255,0.4)',
                        }}
                      >
                        Lv{host.user_level}
                      </div>
                      <span
                        className="absolute top-0 right-0 w-3 h-3 bg-emerald-400 rounded-full"
                        style={{ boxShadow: '0 0 0 2px rgba(20,15,35,1), 0 0 10px 1px rgba(52,211,153,0.65)' }}
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-semibold text-sm truncate">{host.display_name}</span>
                        <Badge
                          className="border-0 text-[10px] font-bold tracking-wide px-1.5 py-0"
                          style={{
                            background: 'linear-gradient(135deg, rgba(239,68,68,0.30), rgba(244,63,94,0.22))',
                            color: '#fecaca',
                            boxShadow: 'inset 0 0 0 1px rgba(248,113,113,0.35)',
                          }}
                        >
                          • LIVE
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-white/55 text-xs mt-0.5">
                        <span className="tabular-nums">👀 {host.viewer_count}</span>
                      </div>
                    </div>

                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={() => sendPKRequest(host)}
                      disabled={sendingRequest === host.id}
                      className="relative overflow-hidden text-white font-bold rounded-full px-4 py-2 text-sm flex items-center gap-1 disabled:opacity-60"
                      style={{
                        background: 'linear-gradient(95deg, #ec4899 0%, #a855f7 100%)',
                        boxShadow: '0 6px 18px -4px rgba(168,85,247,0.55), inset 0 1px 0 rgba(255,255,255,0.30)',
                      }}
                    >
                      <div
                        className="absolute inset-0 pointer-events-none"
                        style={{
                          background: 'linear-gradient(115deg, transparent 42%, rgba(255,255,255,0.28) 50%, transparent 58%)',
                          animation: 'giftSendShine 2.8s ease-in-out infinite',
                        }}
                      />
                      {sendingRequest === host.id ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin relative z-10" />
                      ) : (
                        <>
                          <Swords className="w-4 h-4 relative z-10" />
                          <span className="relative z-10">PK</span>
                        </>
                      )}
                    </motion.button>
                  </motion.div>
                ))
              )}
            </div>
          </ScrollArea>

          {/* Random Match Button + Footer */}
          <div
            className="relative p-4 border-t border-white/10 space-y-2.5"
            style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.02), rgba(0,0,0,0.25))' }}
          >
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={sendRandomPKRequest}
              disabled={sendingRandom}
              className="w-full h-12 relative overflow-hidden text-white font-bold rounded-2xl text-base flex items-center justify-center gap-2 disabled:opacity-70"
              style={{
                background: 'linear-gradient(95deg, #f59e0b 0%, #f97316 50%, #ec4899 100%)',
                boxShadow: '0 10px 28px -8px rgba(249,115,22,0.65), 0 4px 12px -2px rgba(236,72,153,0.45), inset 0 1px 0 rgba(255,255,255,0.30)',
                animation: 'giftSendBreathe 2.4s ease-in-out infinite',
              }}
            >
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: 'linear-gradient(115deg, transparent 42%, rgba(255,255,255,0.30) 50%, transparent 58%)',
                  animation: 'giftSendShine 2.6s ease-in-out infinite',
                }}
              />
              {sendingRandom ? (
                <Loader2 className="w-5 h-5 animate-spin relative z-10" />
              ) : (
                <Shuffle className="w-5 h-5 relative z-10" />
              )}
              <span className="relative z-10 drop-shadow-[0_1px_2px_rgba(0,0,0,0.25)]">
                {sendingRandom ? "Sending..." : "Random Match"}
              </span>
            </motion.button>
            <div className="flex items-center justify-center gap-1.5">
              <Crown className="w-3.5 h-3.5 text-amber-300" />
              <span className="text-white/65 text-xs">Whoever gets more gifts wins</span>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
