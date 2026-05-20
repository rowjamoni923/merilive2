import { useState, useEffect } from "react";
import { X, Users, Crown, Eye } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import AvatarWithFrame from "@/components/common/AvatarWithFrame";

interface Viewer {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  user_level: number;
  coins: number;
  is_vip?: boolean;
  joined_at: string;
}

interface ViewerListPanelProps {
  isOpen: boolean;
  onClose: () => void;
  streamId: string;
  viewerCount: number;
}

export const ViewerListPanel = ({
  isOpen,
  onClose,
  streamId,
  viewerCount,
}: ViewerListPanelProps) => {
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen || !streamId) return;

    const fetchViewers = async () => {
      setLoading(true);
      
      console.log('[ViewerListPanel] Fetching viewers for stream:', streamId);
      
      const { data: streamViewers, error } = await supabase
        .from("stream_viewers")
        .select(`
          viewer_id,
          joined_at,
          left_at,
          profiles!stream_viewers_viewer_id_fkey (
            id,
            display_name,
            avatar_url,
            user_level,
            coins
          )
        `)
        .eq("stream_id", streamId)
        .is("left_at", null)
        .order("joined_at", { ascending: false });

      if (error) {
        console.error('[ViewerListPanel] Error fetching viewers:', error);
      }
      
      console.log('[ViewerListPanel] Raw viewers data:', streamViewers);

      if (streamViewers) {
        const viewerList: Viewer[] = streamViewers.map((sv: any) => ({
          id: sv.profiles?.id || sv.viewer_id,
          display_name: sv.profiles?.display_name || "Anonymous",
          avatar_url: sv.profiles?.avatar_url,
          user_level: sv.profiles?.user_level || 1,
          coins: sv.profiles?.coins || 0,
          is_vip: (sv.profiles?.coins || 0) >= 10000,
          joined_at: sv.joined_at,
        }));
        console.log('[ViewerListPanel] Processed viewers:', viewerList.length);
        setViewers(viewerList);
      }
      
      setLoading(false);
    };

    fetchViewers();

    // Subscribe to real-time viewer changes
    const channel = supabase
      .channel(`viewers_${streamId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "stream_viewers",
          filter: `stream_id=eq.${streamId}`,
        },
        () => {
          fetchViewers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isOpen, streamId]);

  const getLevelColor = (level: number) => {
    if (level >= 50) return "from-amber-400 to-amber-600";
    if (level >= 30) return "from-purple-400 to-purple-600";
    if (level >= 10) return "from-blue-400 to-blue-600";
    return "from-gray-400 to-gray-600";
  };

  const formatJoinTime = (joinedAt: string) => {
    const diff = Date.now() - new Date(joinedAt).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

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

            {/* Header - Compact */}
            <div className="flex items-center justify-between px-4 pb-2">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-purple-400" />
                <h2 className="text-sm font-bold text-white">Viewers</h2>
                <Badge variant="secondary" className="bg-purple-500/20 text-purple-300 text-[10px] px-1.5 py-0">
                  {viewerCount}
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

            {/* Stats Bar - Compact */}
            <div className="flex items-center gap-4 px-4 py-2 bg-black/30">
              <div className="flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-green-400" />
                <span className="text-[11px] text-white/60">
                  Live: <span className="text-white font-medium">{viewers.length}</span>
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Crown className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-[11px] text-white/60">
                  VIP: <span className="text-white font-medium">
                    {viewers.filter(v => v.is_vip).length}
                  </span>
                </span>
              </div>
            </div>

            {/* Viewer List - Mobile Optimized */}
            <ScrollArea className="h-[calc(70vh-120px)]">
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="w-6 h-6 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
                </div>
              ) : viewers.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-white/70">
                  <Users className="w-10 h-10 mb-2 opacity-40" />
                  <p className="text-xs">No viewers yet</p>
                </div>
              ) : (
                <div className="p-2 space-y-0.5">
                  {viewers.map((viewer, index) => (
                    <motion.div
                      key={viewer.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.03 }}
                      className="flex items-center gap-2 p-2 rounded-xl hover:bg-white/5 transition-colors"
                    >
                      {/* Rank Badge */}
                      <div className="w-5 text-center shrink-0">
                        {index < 3 ? (
                          <span className="text-sm">
                            {index === 0 ? "🥇" : index === 1 ? "🥈" : "🥉"}
                          </span>
                        ) : (
                          <span className="text-[10px] text-white/65">
                            {index + 1}
                          </span>
                        )}
                      </div>

                      {/* Avatar with Frame */}
                      <div className="shrink-0">
                        <AvatarWithFrame
                          userId={viewer.id}
                          src={viewer.avatar_url}
                          name={viewer.display_name || "U"}
                          level={viewer.user_level}
                          size="xs"
                          showAnimation={viewer.user_level >= 20}
                        />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="font-medium truncate text-xs text-white">
                            {viewer.display_name || "Anonymous"}
                          </p>
                          <Badge
                            variant="secondary"
                            className={`text-[8px] px-1 py-0 bg-gradient-to-r ${getLevelColor(viewer.user_level)} text-white border-0`}
                          >
                            Lv{viewer.user_level}
                          </Badge>
                        </div>
                        <p className="text-[10px] text-white/65">
                          {formatJoinTime(viewer.joined_at)}
                        </p>
                      </div>

                      {/* VIP Badge */}
                      {viewer.is_vip && (
                        <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      )}
                    </motion.div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
