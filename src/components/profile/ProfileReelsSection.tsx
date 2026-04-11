import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Play, Film, Trash2, MoreVertical, Lock, Globe, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ProfileReel {
  id: string;
  video_url: string;
  thumbnail_url: string | null;
  caption: string | null;
  views_count: number | null;
  is_active: boolean;
}

interface ProfileReelsSectionProps {
  userId: string;
  isOwnProfile: boolean;
}

/**
 * Compact Reels section for ProfileDetail page
 * Shows horizontal scrollable thumbnails
 * Hides entirely if no reels exist
 */
export const ProfileReelsSection = ({ userId, isOwnProfile }: ProfileReelsSectionProps) => {
  const navigate = useNavigate();
  const [reels, setReels] = useState<ProfileReel[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteReelId, setDeleteReelId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    fetchReels();
    fetchCurrentUser();
  }, [userId]);

  const fetchCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setCurrentUserId(user.id);
    }
  };

  const fetchReels = async () => {
    try {
      let query = supabase
        .from('reels')
        .select('id, video_url, thumbnail_url, caption, views_count, is_active')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);

      // For own profile, show all reels (including private)
      // For others, only show active and approved
      if (!isOwnProfile) {
        query = query.eq('is_approved', true).eq('is_active', true);
      }

      const { data, error } = await query;
      if (error) throw error;
      setReels(data || []);
    } catch (error) {
      console.error('Error fetching reels:', error);
    }
    setLoading(false);
  };

  const handleDeleteReel = async () => {
    if (!deleteReelId || !currentUserId) {
      toast.error("Please login to delete");
      return;
    }
    
    setDeleting(true);
    try {
      // Hard delete the reel
      const { error } = await supabase
        .from('reels')
        .delete()
        .eq('id', deleteReelId)
        .eq('user_id', currentUserId);

      if (error) {
        console.error('Delete error:', error);
        throw error;
      }

      // Remove from local state
      setReels(prev => prev.filter(r => r.id !== deleteReelId));
      toast.success("Reel deleted!");
    } catch (error: any) {
      console.error('Delete error:', error);
      toast.error(error.message || "Failed to delete");
    } finally {
      setDeleting(false);
      setDeleteReelId(null);
    }
  };

  const handleTogglePrivacy = async (reelId: string, isCurrentlyActive: boolean) => {
    if (!currentUserId) {
      toast.error("Please login");
      return;
    }

    try {
      const { error } = await supabase
        .from('reels')
        .update({ is_active: !isCurrentlyActive })
        .eq('id', reelId)
        .eq('user_id', currentUserId);

      if (error) throw error;

      // Update local state
      setReels(prev => prev.map(r => 
        r.id === reelId ? { ...r, is_active: !isCurrentlyActive } : r
      ));

      toast.success(isCurrentlyActive ? "Reel set to Private" : "Reel set to Public");
    } catch (error: any) {
      console.error('Privacy toggle error:', error);
      toast.error("Failed to update privacy");
    }
  };

  const formatCount = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  // Hide section while loading or if no reels
  if (loading || reels.length === 0) {
    return null;
  }

  // Check if current user can manage reels (their own profile)
  const canManage = isOwnProfile && currentUserId === userId;

  return (
    <div className="mx-4 mt-4">
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          <Film className="w-5 h-5 text-pink-500" />
          <h3 className="text-lg font-bold">Reels</h3>
          <span className="text-sm text-muted-foreground">({reels.length})</span>
        </div>

        {/* Horizontal Scrollable Thumbnails */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          <AnimatePresence mode="popLayout">
            {reels.map((reel, index) => (
              <motion.div
                key={reel.id}
                layout
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ delay: index * 0.05 }}
                className="relative flex-shrink-0 w-20 h-28 bg-gradient-to-br from-pink-100 to-purple-100 dark:from-pink-950/50 dark:to-purple-950/50 cursor-pointer group overflow-hidden rounded-xl border border-pink-200 dark:border-pink-800/30"
              >
                {/* Clickable area for viewing */}
                <div 
                  onClick={() => navigate(`/reels?start=${reel.id}`)}
                  className="w-full h-full"
                >
                  {/* Thumbnail */}
                  {reel.thumbnail_url ? (
                    <img
                      src={reel.thumbnail_url}
                      alt={reel.caption || 'Reel'}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <video
                      src={reel.video_url}
                      className="w-full h-full object-cover"
                      muted
                      preload="metadata"
                    />
                  )}

                  {/* Play icon overlay */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/10 group-hover:bg-black/30 transition-colors">
                    <div className="w-8 h-8 rounded-full bg-white/90 shadow-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Play className="w-4 h-4 text-pink-500 ml-0.5" fill="currentColor" />
                    </div>
                  </div>

                  {/* View count badge */}
                  <div className="absolute bottom-1 left-1 flex items-center gap-0.5 text-white text-[9px] font-bold bg-black/60 rounded px-1.5 py-0.5">
                    <Play className="w-2.5 h-2.5" fill="white" />
                    {formatCount(reel.views_count || 0)}
                  </div>

                  {/* Private indicator */}
                  {!reel.is_active && (
                    <div className="absolute top-1 left-1 w-5 h-5 rounded-full bg-black/70 flex items-center justify-center">
                      <Lock className="w-2.5 h-2.5 text-white" />
                    </div>
                  )}
                </div>

                {/* 3-dot Menu - Only for own profile */}
                {canManage && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        onClick={(e) => e.stopPropagation()}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center hover:bg-black/80 active:scale-95 transition-all"
                      >
                        <MoreVertical className="w-3 h-3 text-white" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent 
                      align="end" 
                      className="w-40 bg-slate-900 border-white/10"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <DropdownMenuItem 
                        onClick={() => handleTogglePrivacy(reel.id, reel.is_active)}
                        className="text-white hover:bg-white/10 cursor-pointer gap-2"
                      >
                        {reel.is_active ? (
                          <>
                            <EyeOff className="w-4 h-4" />
                            Make Private
                          </>
                        ) : (
                          <>
                            <Eye className="w-4 h-4" />
                            Make Public
                          </>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="bg-white/10" />
                      <DropdownMenuItem 
                        onClick={() => setDeleteReelId(reel.id)}
                        className="text-red-400 hover:bg-red-500/20 hover:text-red-300 cursor-pointer gap-2"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteReelId} onOpenChange={() => setDeleteReelId(null)}>
        <AlertDialogContent className="bg-slate-900 border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete this reel?</AlertDialogTitle>
            <AlertDialogDescription className="text-white/60">
              This reel will be permanently deleted and cannot be recovered. Are you sure?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel 
              className="bg-slate-800 border-white/10 text-white hover:bg-slate-700"
              disabled={deleting}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteReel}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleting ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ProfileReelsSection;