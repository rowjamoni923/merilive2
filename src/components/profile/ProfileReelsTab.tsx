import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Play, Eye, Heart, Trash2, MoreVertical, Coins, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ProfileReel {
  id: string;
  video_url: string;
  thumbnail_url: string | null;
  caption: string | null;
  view_count: number;
  like_count: number;
  beans_earned: number;
  created_at: string;
  is_approved: boolean;
  is_active: boolean;
}

interface ProfileReelsTabProps {
  userId: string;
  isOwnProfile: boolean;
  compact?: boolean;
}

export const ProfileReelsTab = ({ userId, isOwnProfile, compact = false }: ProfileReelsTabProps) => {
  const navigate = useNavigate();
  const [reels, setReels] = useState<ProfileReel[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteReelId, setDeleteReelId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchReels();
  }, [userId]);

  const fetchReels = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('reels')
        .select('id, video_url, thumbnail_url, caption, view_count, like_count, beans_earned, created_at, is_approved, is_active')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      // If not own profile, only show approved & active reels
      if (!isOwnProfile) {
        query = query.eq('is_approved', true).eq('is_active', true);
      }

      const { data, error } = await query;
      if (error) throw error;
      setReels(data || []);
    } catch (error) {
      console.error('Error fetching profile reels:', error);
    }
    setLoading(false);
  };

  const handleDeleteReel = async () => {
    if (!deleteReelId) return;
    
    setDeleting(true);
    try {
      const reel = reels.find(r => r.id === deleteReelId);
      
      const { error } = await supabase
        .from('reels')
        .delete()
        .eq('id', deleteReelId);

      if (error) throw error;

      if (reel?.video_url) {
        try {
          const url = new URL(reel.video_url);
          const pathParts = url.pathname.split('/');
          const bucketIdx = pathParts.findIndex(p => p === 'reels');
          if (bucketIdx !== -1) {
            const filePath = pathParts.slice(bucketIdx + 1).join('/');
            await supabase.storage.from('reels').remove([filePath]);
          }
        } catch (storageError) {
          console.log('Could not delete video file:', storageError);
        }
      }

      setReels(prev => prev.filter(r => r.id !== deleteReelId));
      toast.success("Reel deleted successfully!");
    } catch (error) {
      console.error('Error deleting reel:', error);
      toast.error("Failed to delete reel");
    } finally {
      setDeleting(false);
      setDeleteReelId(null);
    }
  };

  const formatCount = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  const handleReelClick = (reelId: string) => {
    navigate(`/reels?start=${reelId}`);
  };

  // Don't show anything while loading
  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <div className="w-5 h-5 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Return null if no reels - hide entire section
  if (reels.length === 0) {
    return null;
  }

  // Compact mode: Horizontal scroll with small thumbnails
  if (compact) {
    return (
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {reels.map((reel, index) => (
          <motion.div
            key={reel.id}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.03 }}
            onClick={() => handleReelClick(reel.id)}
            className="relative flex-shrink-0 w-16 h-24 bg-muted cursor-pointer group overflow-hidden rounded-lg"
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
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-6 h-6 rounded-full bg-black/40 flex items-center justify-center">
                <Play className="w-3 h-3 text-white" fill="white" />
              </div>
            </div>

            {/* View count */}
            <div className="absolute bottom-0.5 left-0.5 flex items-center gap-0.5 text-white text-[8px] font-medium bg-black/50 rounded px-1">
              <Play className="w-2 h-2" fill="white" />
              {formatCount(reel.view_count)}
            </div>
          </motion.div>
        ))}
      </div>
    );
  }

  // Full mode: Grid layout
  return (
    <>
      <div className="grid grid-cols-3 gap-0.5">
        {reels.map((reel, index) => (
          <motion.div
            key={reel.id}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.05 }}
            className="relative aspect-[9/16] bg-muted cursor-pointer group overflow-hidden"
          >
            {/* Thumbnail */}
            <div onClick={() => handleReelClick(reel.id)} className="w-full h-full">
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
            </div>

            {/* Hover overlay */}
            <div className={cn(
              "absolute inset-0 bg-black/40 flex flex-col items-center justify-center transition-opacity pointer-events-none",
              "opacity-0 group-hover:opacity-100"
            )}>
              <Play className="w-10 h-10 text-white mb-2" fill="white" />
              <div className="flex items-center gap-3 text-white text-sm font-medium">
                <div className="flex items-center gap-1">
                  <Eye className="w-4 h-4" />
                  <span>{formatCount(reel.view_count)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Heart className="w-4 h-4" />
                  <span>{formatCount(reel.like_count)}</span>
                </div>
              </div>
            </div>

            {/* Delete Menu for own profile */}
            {isOwnProfile && (
              <div className="absolute top-1 right-1 z-10">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button 
                      className="p-1.5 bg-black/50 rounded-full hover:bg-black/70 transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreVertical className="w-4 h-4 text-white" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[120px]">
                    <DropdownMenuItem 
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteReelId(reel.id);
                      }}
                      className="text-red-500 focus:text-red-500"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}

            {/* Pending indicator */}
            {isOwnProfile && (!reel.is_approved || !reel.is_active) && (
              <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-yellow-500/90 rounded text-[10px] font-medium text-white flex items-center gap-0.5">
                <Lock className="w-3 h-3" />
                {!reel.is_approved ? 'Pending' : 'Hidden'}
              </div>
            )}

            {/* Bottom stats */}
            <div className="absolute bottom-1 left-1 right-1 flex items-center justify-between">
              <div className="flex items-center gap-1 text-white text-xs font-medium">
                <Play className="w-3 h-3" fill="white" />
                <span>{formatCount(reel.view_count)}</span>
              </div>
              
              {isOwnProfile && reel.beans_earned > 0 && (
                <div className="flex items-center gap-1 bg-gradient-to-r from-amber-500 to-orange-500 rounded-full px-1.5 py-0.5 text-white text-[10px] font-bold">
                  <Coins className="w-3 h-3" />
                  <span>{formatCount(reel.beans_earned)}</span>
                </div>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteReelId} onOpenChange={(open) => !open && setDeleteReelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Reel?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this reel along with all its likes, comments, and shares. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteReel}
              disabled={deleting}
              className="bg-red-500 hover:bg-red-600"
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default ProfileReelsTab;