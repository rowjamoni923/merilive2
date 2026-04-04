import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, UserPlus, UserX, Trash2, Check, XCircle } from "lucide-react";
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

  // Real-time subscription for party room participants + polling fallback for native apps
  useEffect(() => {
    isMountedRef.current = true;
    
    if (!isOpen || !roomId) return;
    
    // Initial fetch
    fetchPartyViewers();
    
    // Real-time subscription
    const channel = supabase
      .channel(`chamet-viewers-${roomId}-${Date.now()}`) // Unique channel name
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "party_room_participants",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          console.log('[ChametStyleViewerPanel] 📡 Real-time viewer update:', payload.eventType);
          // Refetch all viewers to ensure accurate list
          fetchPartyViewers();
        }
      )
      .subscribe((status) => {
        console.log('[ChametStyleViewerPanel] Subscription status:', status);
      });

    // NATIVE APP FALLBACK: Polling every 3 seconds for when realtime fails
    const pollInterval = setInterval(() => {
      console.log('[ChametStyleViewerPanel] 🔄 Polling viewers (native fallback)');
      fetchPartyViewers();
    }, 3000);

    return () => {
      isMountedRef.current = false;
      clearInterval(pollInterval);
      supabase.removeChannel(channel);
    };
  }, [isOpen, roomId, fetchPartyViewers]);

  // Use real-time data if available, otherwise fall back to external viewers
  const viewers = realtimeViewers.length > 0 ? realtimeViewers : externalViewers;

  const getLevelGradient = (level: number) => {
    if (level >= 50) return 'from-purple-500 to-pink-500';
    if (level >= 40) return 'from-cyan-400 to-blue-500';
    if (level >= 30) return 'from-yellow-400 to-orange-500';
    if (level >= 20) return 'from-green-400 to-emerald-500';
    return 'from-blue-400 to-indigo-500';
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="fixed inset-x-0 bottom-0 z-50"
          style={{ height: "70vh" }}
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 -z-10"
            onClick={onClose}
          />

          {/* Panel Container */}
          <div className="flex flex-col h-full bg-white rounded-t-3xl overflow-hidden">
            {/* Tabs Header */}
            <div className="flex border-b border-gray-200">
              <button
                onClick={() => setActiveTab('audience')}
                className={cn(
                  "flex-1 py-4 text-center font-semibold text-lg transition-colors relative",
                  activeTab === 'audience' ? "text-gray-900" : "text-gray-400"
                )}
              >
                Audience ({viewers.length})
                {activeTab === 'audience' && (
                  <motion.div 
                    layoutId="tabIndicator"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-600"
                  />
                )}
              </button>
              <button
                onClick={() => setActiveTab('applicant')}
                className={cn(
                  "flex-1 py-4 text-center font-semibold text-lg transition-colors relative",
                  activeTab === 'applicant' ? "text-gray-900" : "text-gray-400"
                )}
              >
                Seat Requests
                {applicants.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 bg-red-500 text-white text-xs rounded-full">
                    {applicants.length}
                  </span>
                )}
                {activeTab === 'applicant' && (
                  <motion.div 
                    layoutId="tabIndicator"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-600"
                  />
                )}
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {activeTab === 'audience' ? (
                <div className="p-4">
                  {viewers.length > 0 ? (
                    <div className="space-y-3">
                      {viewers.map((viewer) => (
                        <motion.div
                          key={viewer.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl"
                        >
                          <div className="flex items-center gap-3">
                            <AvatarWithFrame
                              userId={viewer.id}
                              src={viewer.avatarUrl}
                              name={viewer.displayName}
                              level={viewer.level}
                              size="sm"
                              showFrame={true}
                              frameId={viewer.frameId}
                            />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-gray-900">{viewer.displayName}</span>
                                {viewer.countryFlag && <span>{viewer.countryFlag}</span>}
                              </div>
                              <Badge className={cn(
                                "bg-gradient-to-r text-white text-[9px] px-1.5 h-4 border-0 mt-1",
                                getLevelGradient(viewer.level)
                              )}>
                                ✦ Level {viewer.level}
                              </Badge>
                            </div>
                          </div>
                          {isHost && (
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => onInviteViewer?.(viewer.id)}
                                className="bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-full px-3"
                              >
                                <UserPlus className="w-4 h-4 mr-1" />
                                Invite
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => onKickViewer?.(viewer.id)}
                                className="rounded-full px-3"
                              >
                                <UserX className="w-4 h-4" />
                              </Button>
                            </div>
                          )}
                        </motion.div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState type="audience" />
                  )}
                </div>
              ) : (
                <div className="p-4">
                  {applicants.length > 0 ? (
                    <div className="space-y-3">
                      {applicants.map((applicant) => (
                        <motion.div
                          key={applicant.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="flex items-center justify-between p-3 bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl border border-amber-200"
                        >
                          <div className="flex items-center gap-3">
                            <div className="relative">
                              <AvatarWithFrame
                                userId={applicant.id}
                                src={applicant.avatarUrl}
                                name={applicant.displayName || "U"}
                                level={applicant.level || 1}
                                size="sm"
                                showFrame={true}
                              />
                              <motion.div
                                animate={{ scale: [1, 1.2, 1] }}
                                transition={{ duration: 1.5, repeat: Infinity }}
                                className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center"
                              >
                                <span className="text-[8px] text-white">🖐️</span>
                              </motion.div>
                            </div>
                            <div>
                              <span className="font-semibold text-gray-900">{applicant.displayName}</span>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge className={cn(
                                  "bg-gradient-to-r text-white text-[9px] px-1.5 h-4 border-0",
                                  getLevelGradient(applicant.level)
                                )}>
                                  ✦ Level {applicant.level}
                                </Badge>
                                <span className="text-[10px] text-amber-600">
                                  Requesting seat...
                                </span>
                              </div>
                            </div>
                          </div>
                          {isHost && (
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  // Use user_id for callback, fallback to id
                                  const userId = applicant.user_id || applicant.id;
                                  console.log('[ChametStyleViewerPanel] Reject clicked for userId:', userId);
                                  onRejectApplicant?.(userId);
                                }}
                                className="rounded-full border-red-300 text-red-600 hover:bg-red-50"
                              >
                                <XCircle className="w-4 h-4 mr-1" />
                                Reject
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => {
                                  // Use user_id for callback, fallback to id
                                  const userId = applicant.user_id || applicant.id;
                                  console.log('[ChametStyleViewerPanel] Accept clicked for userId:', userId);
                                  onAcceptApplicant?.(userId);
                                }}
                                className="bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-full"
                              >
                                <Check className="w-4 h-4 mr-1" />
                                Accept
                              </Button>
                            </div>
                          )}
                        </motion.div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState type="applicant" />
                  )}
                </div>
              )}
            </div>
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
