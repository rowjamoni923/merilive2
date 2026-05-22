import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, UserPlus, UserX, Trash2, Check, XCircle, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import AvatarWithFrame from "@/components/common/AvatarWithFrame";
import { supabase } from "@/integrations/supabase/client";

interface Viewer {
  id: string;
  displayName: string;
  avatarUrl?: string;
  level: number;
  countryFlag?: string;
  isVIP?: boolean;
  frameId?: string;
}

interface SeatApplicant {
  id: string;
  user_id?: string; // CRITICAL: User ID for Accept/Reject callbacks
  displayName: string;
  avatarUrl?: string;
  level: number;
  requestedAt: Date;
}

interface ChametStyleViewerPanelProps {
  isOpen: boolean;
  onClose: () => void;
  viewers: Viewer[];
  applicants: SeatApplicant[];
  onAcceptApplicant?: (userId: string) => void;
  onRejectApplicant?: (userId: string) => void;
  onInviteViewer?: (userId: string) => void;
  onKickViewer?: (userId: string) => void;
  onModerateViewer?: (userId: string, displayName: string) => void;
  isHost: boolean;
  roomId?: string; // CRITICAL: Add roomId for real-time sync
}

export const ChametStyleViewerPanel = ({
  isOpen,
  onClose,
  viewers: externalViewers,
  applicants,
  onAcceptApplicant,
  onRejectApplicant,
  onInviteViewer,
  onKickViewer,
  onModerateViewer,
  isHost,
  roomId
}: ChametStyleViewerPanelProps) => {
  const [activeTab, setActiveTab] = useState<'audience' | 'applicant'>('audience');
  const [realtimeViewers, setRealtimeViewers] = useState<Viewer[]>([]);
  const [loading, setLoading] = useState(false);
  const isMountedRef = useRef(true);
  const roomIdRef = useRef(roomId);
  
  // Update roomId ref when it changes
  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);

  // CRITICAL: Fetch viewers from party_room_participants with real-time sync
  const fetchPartyViewers = useCallback(async () => {
    const currentRoomId = roomIdRef.current;
    if (!currentRoomId) return;
    
    setLoading(true);
    
    try {
      const { data: partyViewers, error } = await supabase
        .from("party_room_participants")
        .select(`
          user_id,
          joined_at,
          profiles!party_room_participants_user_id_fkey (
            id,
            display_name,
            avatar_url,
            user_level,
            coins,
            frame_id,
            country_flag
          )
        `)
        .eq("room_id", currentRoomId)
        .is("left_at", null)
        .order("joined_at", { ascending: false });

      if (error) {
        console.error('[ChametStyleViewerPanel] Error fetching party viewers:', error);
        setLoading(false);
        return;
      }

      if (partyViewers && isMountedRef.current) {
        const viewerList: Viewer[] = partyViewers.map((pv: any) => ({
          id: pv.profiles?.id || pv.user_id,
          displayName: pv.profiles?.display_name || "Anonymous",
          avatarUrl: pv.profiles?.avatar_url,
          level: pv.profiles?.user_level || 1,
          countryFlag: pv.profiles?.country_flag || '🌍',
          isVIP: (pv.profiles?.coins || 0) >= 10000,
          frameId: pv.profiles?.frame_id || undefined,
        }));
        setRealtimeViewers(viewerList);
        console.log('[ChametStyleViewerPanel] ✅ Fetched', viewerList.length, 'party viewers');
      }
    } catch (err) {
      console.error('[ChametStyleViewerPanel] Exception fetching viewers:', err);
    }
    
    setLoading(false);
  }, []);

  // Pkg81 LiveKit-Purist audit: REMOVED `chamet-viewers-${roomId}` Supabase
  // postgres_changes channel on `party_room_participants`. Viewer presence
  // arrives via LiveKit `participant_joined` / `participant_left` DataPackets
  // (Pkg80). We refetch the full list on those window events + a 20s safety
  // REST poll. Satisfies $1400-rule (≥5s G1) and LiveKit-Purist policy.
  useEffect(() => {
    isMountedRef.current = true;
    if (!isOpen || !roomId) return;

    // Initial fetch
    fetchPartyViewers();

    // LiveKit window-event refresh (joined / left / seat_action)
    const onPartyEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const payload = detail?.payload;
      if (!payload || payload.roomId !== roomId) return;
      fetchPartyViewers();
    };
    window.addEventListener('livekit-party-event', onPartyEvent);

    // Safety net: REST snapshot every 20s in case a LiveKit packet is missed
    // guard-ok: 20s ≥ 5s floor, single bounded poll, no realtime channel
    const pollId = window.setInterval(() => {
      if (isMountedRef.current) fetchPartyViewers();
    }, 20000);

    return () => {
      isMountedRef.current = false;
      window.removeEventListener('livekit-party-event', onPartyEvent);
      window.clearInterval(pollId);
    };
  }, [isOpen, roomId, fetchPartyViewers]);


  // Use real-time data if available, otherwise fall back to external viewers
  const viewers = realtimeViewers.length > 0 ? realtimeViewers : externalViewers;

  // Pkg164: 5-tier palette parity with Pkg162 join stack
  const getTier = (level: number) => {
    if (level >= 50) return { grad: 'from-amber-400 via-yellow-300 to-orange-500', ring: 'rgba(251,191,36,0.9)', glow: 'rgba(251,191,36,0.55)', icon: '👑', label: 'VIP' };
    if (level >= 30) return { grad: 'from-fuchsia-500 via-purple-500 to-indigo-500', ring: 'rgba(217,70,239,0.85)', glow: 'rgba(217,70,239,0.5)', icon: '💎', label: 'Elite' };
    if (level >= 20) return { grad: 'from-cyan-400 to-sky-500', ring: 'rgba(56,189,248,0.85)', glow: 'rgba(56,189,248,0.45)', icon: '⭐', label: 'Pro' };
    if (level >= 10) return { grad: 'from-emerald-400 to-teal-500', ring: 'rgba(52,211,153,0.85)', glow: 'rgba(52,211,153,0.45)', icon: '✨', label: 'Active' };
    return { grad: 'from-slate-400 to-slate-500', ring: 'rgba(148,163,184,0.7)', glow: 'rgba(148,163,184,0.3)', icon: '', label: 'New' };
  };

  // Top-3 podium (highest level)
  const podium = [...viewers].sort((a, b) => (b.level || 0) - (a.level || 0)).slice(0, 3);
  const rest = viewers.length > 3 ? viewers.slice(0).sort((a, b) => (b.level || 0) - (a.level || 0)).slice(3) : viewers;
  const podiumOrder = [1, 0, 2]; // 2nd, 1st, 3rd visual order

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 28, stiffness: 320, mass: 0.7 }}
          className="fixed inset-x-0 bottom-0 z-50"
          style={{ height: "72vh", willChange: 'transform', transform: 'translateZ(0)' }}
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm -z-10"
            onClick={onClose}
          />

          {/* Panel Container — premium glass dark sheet */}
          <div
            className="flex flex-col h-full rounded-t-[28px] overflow-hidden relative"
            style={{
              background: 'linear-gradient(180deg, rgba(20,15,35,0.97) 0%, rgba(12,8,24,0.98) 100%)',
              boxShadow: '0 -20px 60px -10px rgba(168,85,247,0.25), inset 0 1px 0 rgba(255,255,255,0.08)',
              backdropFilter: 'blur(24px)',
            }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-2.5 pb-1">
              <div className="w-10 h-1 rounded-full bg-white/25" />
            </div>

            {/* Tabs Header */}
            <div className="flex px-3 pt-1 pb-2 gap-2 border-b border-white/5">
              <button
                onClick={() => setActiveTab('audience')}
                className={cn(
                  "flex-1 py-2.5 text-center font-semibold text-[15px] transition-colors relative rounded-xl",
                  activeTab === 'audience' ? "text-white" : "text-white/45"
                )}
              >
                {activeTab === 'audience' && (
                  <motion.div
                    layoutId="cvpTabPill"
                    className="absolute inset-0 rounded-xl"
                    style={{ background: 'linear-gradient(135deg, rgba(168,85,247,0.25), rgba(236,72,153,0.18))', boxShadow: '0 0 18px rgba(168,85,247,0.35), inset 0 1px 0 rgba(255,255,255,0.12)' }}
                    transition={{ type: 'spring', damping: 28, stiffness: 380 }}
                  />
                )}
                <span className="relative">Audience <span className="text-white/55 text-xs ml-0.5">({viewers.length})</span></span>
              </button>
              <button
                onClick={() => setActiveTab('applicant')}
                className={cn(
                  "flex-1 py-2.5 text-center font-semibold text-[15px] transition-colors relative rounded-xl",
                  activeTab === 'applicant' ? "text-white" : "text-white/45"
                )}
              >
                {activeTab === 'applicant' && (
                  <motion.div
                    layoutId="cvpTabPill"
                    className="absolute inset-0 rounded-xl"
                    style={{ background: 'linear-gradient(135deg, rgba(168,85,247,0.25), rgba(236,72,153,0.18))', boxShadow: '0 0 18px rgba(168,85,247,0.35), inset 0 1px 0 rgba(255,255,255,0.12)' }}
                    transition={{ type: 'spring', damping: 28, stiffness: 380 }}
                  />
                )}
                <span className="relative inline-flex items-center gap-1.5">
                  Seat Requests
                  {applicants.length > 0 && (
                    <motion.span
                      animate={{ scale: [1, 1.15, 1] }}
                      transition={{ duration: 1.4, repeat: Infinity }}
                      className="px-1.5 py-0.5 bg-gradient-to-r from-rose-500 to-red-500 text-white text-[10px] rounded-full font-bold shadow-[0_0_10px_rgba(244,63,94,0.6)]"
                    >
                      {applicants.length}
                    </motion.span>
                  )}
                </span>
              </button>
            </div>

            {/* Content */}
            <div
              className="flex-1 overflow-y-auto overscroll-contain"
              style={{ scrollBehavior: 'smooth', WebkitOverflowScrolling: 'touch' }}
            >
              {activeTab === 'audience' ? (
                <div className="p-3">
                  {viewers.length > 0 ? (
                    <>
                      {/* Top-3 podium */}
                      {podium.length >= 1 && (
                        <div className="flex items-end justify-around mb-3 px-2 pt-2 pb-3 rounded-2xl"
                          style={{ background: 'linear-gradient(180deg, rgba(168,85,247,0.10), rgba(236,72,153,0.04))', border: '1px solid rgba(255,255,255,0.06)' }}
                        >
                          {podiumOrder.map((idx) => {
                            const v = podium[idx];
                            if (!v) return <div key={idx} className="w-16" />;
                            const tier = getTier(v.level);
                            const rank = idx + 1;
                            const isFirst = rank === 1;
                            return (
                              <motion.div
                                key={v.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.06, type: 'spring', damping: 22, stiffness: 360 }}
                                className="flex flex-col items-center"
                                style={{ width: isFirst ? 84 : 72 }}
                              >
                                <div className="relative">
                                  {isFirst && (
                                    <motion.div
                                      animate={{ rotate: 360 }}
                                      transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
                                      className="absolute -inset-1.5 rounded-full"
                                      style={{ background: 'conic-gradient(from 0deg, #fde047, #f97316, #fbbf24, #fde047)' }}
                                    />
                                  )}
                                  <div
                                    className="relative rounded-full p-[2px]"
                                    style={{ background: tier.ring, boxShadow: `0 0 14px ${tier.glow}` }}
                                  >
                                    <AvatarWithFrame
                                      userId={v.id}
                                      src={v.avatarUrl}
                                      name={v.displayName}
                                      level={v.level}
                                      size={isFirst ? 'md' : 'sm'}
                                      showFrame={true}
                                      frameId={v.frameId}
                                    />
                                  </div>
                                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                                    style={{ background: rank === 1 ? 'linear-gradient(135deg,#fde047,#f59e0b)' : rank === 2 ? 'linear-gradient(135deg,#e2e8f0,#94a3b8)' : 'linear-gradient(135deg,#fdba74,#c2410c)', color: '#0a0a0a', boxShadow: '0 2px 6px rgba(0,0,0,0.4)' }}>
                                    {rank}
                                  </div>
                                </div>
                                <span className="mt-2 text-[11px] text-white/90 font-medium truncate max-w-full">{v.displayName}</span>
                                <span className="text-[9px] text-white/50">Lv {v.level}</span>
                              </motion.div>
                            );
                          })}
                        </div>
                      )}

                      <div className="space-y-2">
                        {rest.map((viewer, i) => {
                          const tier = getTier(viewer.level);
                          return (
                            <motion.div
                              key={viewer.id}
                              initial={{ opacity: 0, x: -8 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: Math.min(i * 0.02, 0.2) }}
                              className="flex items-center justify-between p-2.5 rounded-2xl"
                              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div
                                  className="rounded-full p-[1.5px] shrink-0"
                                  style={{ background: tier.ring, boxShadow: `0 0 8px ${tier.glow}` }}
                                >
                                  <AvatarWithFrame
                                    userId={viewer.id}
                                    src={viewer.avatarUrl}
                                    name={viewer.displayName}
                                    level={viewer.level}
                                    size="sm"
                                    showFrame={true}
                                    frameId={viewer.frameId}
                                  />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-semibold text-white text-sm truncate">{viewer.displayName}</span>
                                    {viewer.countryFlag && <span className="text-xs">{viewer.countryFlag}</span>}
                                  </div>
                                  <Badge className={cn(
                                    "bg-gradient-to-r text-white text-[9px] px-1.5 h-4 border-0 mt-1",
                                    tier.grad
                                  )}>
                                    {tier.icon && <span className="mr-0.5">{tier.icon}</span>}Lv {viewer.level}
                                  </Badge>
                                </div>
                              </div>
                              {isHost && (
                                <div className="flex gap-1.5 shrink-0">
                                  <Button
                                    size="sm"
                                    onClick={() => onInviteViewer?.(viewer.id)}
                                    className="h-8 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-full px-3 text-xs shadow-[0_4px_14px_rgba(168,85,247,0.4)]"
                                  >
                                    <UserPlus className="w-3.5 h-3.5 mr-1" />
                                    Invite
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => onKickViewer?.(viewer.id)}
                                    className="h-8 rounded-full px-2.5"
                                  >
                                    <UserX className="w-3.5 h-3.5" />
                                  </Button>
                                  {onModerateViewer && (
                                    <Button
                                      size="sm"
                                      onClick={() => onModerateViewer(viewer.id, viewer.displayName)}
                                      className="h-8 bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-full px-2.5"
                                    >
                                      <Shield className="w-3.5 h-3.5" />
                                    </Button>
                                  )}
                                </div>
                              )}
                            </motion.div>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <EmptyState type="audience" />
                  )}
                </div>
              ) : (
                <div className="p-3">
                  {applicants.length > 0 ? (
                    <div className="space-y-2">
                      {applicants.map((applicant, i) => {
                        const tier = getTier(applicant.level);
                        return (
                          <motion.div
                            key={applicant.id}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: Math.min(i * 0.03, 0.18) }}
                            className="flex items-center justify-between p-2.5 rounded-2xl"
                            style={{ background: 'linear-gradient(135deg, rgba(251,191,36,0.12), rgba(249,115,22,0.08))', border: '1px solid rgba(251,191,36,0.25)' }}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="relative shrink-0">
                                <div
                                  className="rounded-full p-[1.5px]"
                                  style={{ background: tier.ring, boxShadow: `0 0 8px ${tier.glow}` }}
                                >
                                  <AvatarWithFrame
                                    userId={applicant.id}
                                    src={applicant.avatarUrl}
                                    name={applicant.displayName || "U"}
                                    level={applicant.level || 1}
                                    size="sm"
                                    showFrame={true}
                                  />
                                </div>
                                <motion.div
                                  animate={{ scale: [1, 1.2, 1], rotate: [0, -10, 10, 0] }}
                                  transition={{ duration: 1.5, repeat: Infinity }}
                                  className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center shadow-[0_0_8px_rgba(251,191,36,0.7)]"
                                >
                                  <span className="text-[8px]">🖐️</span>
                                </motion.div>
                              </div>
                              <div className="min-w-0">
                                <span className="font-semibold text-white text-sm truncate block">{applicant.displayName}</span>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <Badge className={cn(
                                    "bg-gradient-to-r text-white text-[9px] px-1.5 h-4 border-0",
                                    tier.grad
                                  )}>
                                    {tier.icon && <span className="mr-0.5">{tier.icon}</span>}Lv {applicant.level}
                                  </Badge>
                                  <span className="text-[10px] text-amber-300/90">Requesting seat…</span>
                                </div>
                              </div>
                            </div>
                            {isHost && (
                              <div className="flex gap-1.5 shrink-0">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    const userId = applicant.user_id || applicant.id;
                                    console.log('[ChametStyleViewerPanel] Reject clicked for userId:', userId);
                                    onRejectApplicant?.(userId);
                                  }}
                                  className="h-8 rounded-full border-rose-400/50 text-rose-300 hover:bg-rose-500/15 bg-transparent text-xs px-2.5"
                                >
                                  <XCircle className="w-3.5 h-3.5 mr-1" />
                                  Reject
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    const userId = applicant.user_id || applicant.id;
                                    console.log('[ChametStyleViewerPanel] Accept clicked for userId:', userId);
                                    onAcceptApplicant?.(userId);
                                  }}
                                  className="h-8 bg-gradient-to-r from-emerald-500 to-green-500 text-white rounded-full text-xs px-3 shadow-[0_4px_14px_rgba(16,185,129,0.5)]"
                                >
                                  <Check className="w-3.5 h-3.5 mr-1" />
                                  Accept
                                </Button>
                              </div>
                            )}
                          </motion.div>
                        );
                      })}
                    </div>
                  ) : (
                    <EmptyState type="applicant" />
                  )}
                </div>
              )}
            </div>

            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/8 hover:bg-white/15 text-white/70 flex items-center justify-center transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// Empty state with cute illustration matching Chamet
const EmptyState = ({ type }: { type: 'audience' | 'applicant' }) => (
  <div className="flex flex-col items-center justify-center py-16">
    {/* Cute Robot Illustration */}
    <div className="relative mb-4">
      <div className="w-24 h-24 bg-gradient-to-br from-purple-100 to-pink-100 rounded-3xl flex items-center justify-center">
        {/* Robot Head */}
        <div className="relative">
          <div className="w-16 h-14 bg-gradient-to-br from-purple-400 to-pink-400 rounded-2xl relative">
            {/* Eye */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 w-5 h-5 bg-white rounded-full flex items-center justify-center">
              <div className="w-3 h-3 bg-gray-800 rounded-full" />
            </div>
            {/* Antennae */}
            <div className="absolute -top-4 left-1/2 -translate-x-1/2">
              <div className="w-1.5 h-4 bg-purple-400 rounded-full" />
              <div className="w-3 h-3 bg-pink-400 rounded-full -mt-1 -ml-0.5" />
            </div>
          </div>
          {/* Arms */}
          <div className="absolute -left-3 top-6 w-3 h-3 bg-purple-300 rounded-full" />
          <div className="absolute -right-3 top-6 w-3 h-3 bg-purple-300 rounded-full" />
        </div>
      </div>
      {/* Paper/Document */}
      <div className="absolute -bottom-2 -right-2 w-14 h-16 bg-white rounded-lg shadow-lg border border-gray-100 flex flex-col items-center justify-center gap-1 p-2">
        <div className="w-8 h-1 bg-gray-200 rounded" />
        <div className="w-6 h-1 bg-gray-200 rounded" />
        <div className="w-7 h-1 bg-gray-200 rounded" />
        <X className="w-4 h-4 text-gray-300 mt-1" />
      </div>
    </div>
    <p className="text-gray-400 text-lg">
      {type === 'audience' ? 'No viewers yet' : 'No seat requests'}
    </p>
    <p className="text-gray-300 text-sm mt-1">
      {type === 'audience' ? 'Invite friends to join!' : 'Waiting for viewers to request seats'}
    </p>
  </div>
);

export default ChametStyleViewerPanel;
