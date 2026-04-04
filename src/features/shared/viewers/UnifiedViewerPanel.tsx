import { useState } from "react";
import { X, Users, Crown, Eye } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { ViewerListItem, ApplicantListItem } from "./ViewerListItem";
import { ViewerEmptyState } from "./ViewerEmptyState";
import { useViewers } from "./useViewers";
import type { ViewerPanelProps, Viewer, SeatApplicant } from "./types";

/**
 * UnifiedViewerPanel
 * 
 * A single viewer panel component used across:
 * - Live Streams
 * - Party Rooms (Audio, Video, Game)
 * 
 * One Link = One Change = All Places Updated
 */
export const UnifiedViewerPanel = ({
  isOpen,
  onClose,
  streamId,
  roomId,
  viewerCount,
  viewers: externalViewers,
  seatApplicants = [],
  isHost = false,
  onInviteViewer,
  onAcceptApplicant,
  onRejectApplicant,
  onViewProfile,
  roomType = 'live',
}: ViewerPanelProps) => {
  const [activeTab, setActiveTab] = useState<'audience' | 'applicant'>('audience');
  
  // CRITICAL FIX: Always use hook for real-time viewer sync in BOTH live and party rooms
  // External viewers are only used as initial fallback, hook provides real-time updates
  const { viewers: hookViewers, loading } = useViewers({
    streamId,
    roomId: roomType === 'party' ? roomId : undefined,
    enabled: isOpen, // Always enabled when panel is open - let hook manage real-time
  });
  
  // Prefer hook data for real-time, fall back to external only if hook returns empty initially
  const viewers = hookViewers.length > 0 ? hookViewers : (externalViewers || []);
  const liveViewerCount = Math.max(viewers.length, viewerCount ?? 0);
  const totalViewers = liveViewerCount;
  const vipCount = viewers.filter(v => v.is_vip).length;
  const showTabs = roomType === 'party' && isHost && seatApplicants.length > 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25 }}
            className="absolute bottom-0 left-0 right-0 max-h-[70vh] bg-gradient-to-b from-[#1a1035] to-[#0f0820] rounded-t-3xl border-t border-purple-500/20"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="flex justify-center pt-2 pb-1">
              <div className="w-10 h-1 bg-white/20 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 pb-2">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-purple-400" />
                <h2 className="text-sm font-bold text-white">
                  {roomType === 'party' ? 'Viewers' : 'Viewers'}
                </h2>
                <Badge variant="secondary" className="bg-purple-500/20 text-purple-300 text-[10px] px-1.5 py-0">
                  {totalViewers}
                </Badge>
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={onClose}
                className="w-7 h-7 rounded-full bg-white/10"
              >
                <X className="w-4 h-4 text-white/70" />
              </Button>
            </div>

            {/* Tabs for Party Room (Host Only) */}
            {showTabs && (
              <div className="flex gap-2 px-4 pb-2">
                <button
                  onClick={() => setActiveTab('audience')}
                  className={`flex-1 py-1.5 px-3 rounded-full text-xs font-medium transition-all ${
                    activeTab === 'audience'
                      ? 'bg-gradient-to-r from-pink-500 to-purple-500 text-white'
                      : 'bg-white/10 text-white/60'
                  }`}
                >
                  Audience ({liveViewerCount})
                </button>
                <button
                  onClick={() => setActiveTab('applicant')}
                  className={`flex-1 py-1.5 px-3 rounded-full text-xs font-medium transition-all relative ${
                    activeTab === 'applicant'
                      ? 'bg-gradient-to-r from-pink-500 to-purple-500 text-white'
                      : 'bg-white/10 text-white/60'
                  }`}
                >
                  Applicants
                  {seatApplicants.length > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] flex items-center justify-center">
                      {seatApplicants.length}
                    </span>
                  )}
                </button>
              </div>
            )}

            {/* Stats Bar */}
            <div className="flex items-center gap-4 px-4 py-2 bg-black/30">
              <div className="flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-green-400" />
                <span className="text-[11px] text-white/60">
                  Live: <span className="text-white font-medium">{liveViewerCount}</span>
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Crown className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-[11px] text-white/60">
                  VIP: <span className="text-white font-medium">{vipCount}</span>
                </span>
              </div>
            </div>

            {/* Content */}
            <ScrollArea className="h-[calc(70vh-140px)]">
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="w-6 h-6 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
                </div>
              ) : activeTab === 'audience' ? (
                // Viewer List
                viewers.length === 0 ? (
                  <ViewerEmptyState message="No viewers yet" />
                ) : (
                  <div className="p-2 space-y-0.5">
                    {viewers.map((viewer, index) => (
                      <ViewerListItem
                        key={viewer.id}
                        viewer={viewer}
                        index={index}
                        isHost={isHost}
                        showInvite={roomType === 'party'}
                        onInvite={onInviteViewer}
                        onViewProfile={onViewProfile}
                      />
                    ))}
                  </div>
                )
              ) : (
                // Applicant List (Party Room Only)
                seatApplicants.length === 0 ? (
                  <ViewerEmptyState message="No applicants" />
                ) : (
                  <div className="p-2 space-y-1">
                    {seatApplicants.map((applicant, index) => (
                      <ApplicantListItem
                        key={applicant.id}
                        applicant={applicant}
                        index={index}
                        onAccept={onAcceptApplicant}
                        onReject={onRejectApplicant}
                      />
                    ))}
                  </div>
                )
              )}
            </ScrollArea>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
