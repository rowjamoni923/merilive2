import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Heart, Users, Clock, Home, UserPlus, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface RoomEndedModalProps {
  isOpen: boolean;
  hostName: string;
  hostAvatar?: string;
  hostId?: string; // NEW: Host ID for follow functionality
  roomType: 'live' | 'party';
  onExit: () => void;
  // Optional stats - removed giftsReceived
  viewerCount?: number;
  duration?: string;
}

/**
 * Premium Room Ended Modal
 * Used for both Live Stream and Party Room when host ends the session
 * Features Follow button (no Offline badge, no Gifts stat)
 */
export const RoomEndedModal: React.FC<RoomEndedModalProps> = ({
  isOpen,
  hostName,
  hostAvatar,
  hostId,
  roomType,
  onExit,
  viewerCount = 0,
  duration = '0:00',
}) => {
  const [isFollowing, setIsFollowing] = useState(false);
  const [isFollowLoading, setIsFollowLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const title = roomType === 'live' ? 'Live Ended' : 'Room Closed';
  const message = roomType === 'live' 
    ? `${hostName} has ended the live stream`
    : `${hostName} has ended the party`;
  const buttonText = roomType === 'live' ? 'Back to Home' : 'Back to Home';

  // Check if already following on mount
  useEffect(() => {
    const checkFollowStatus = async () => {
      if (!hostId) return;
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      setCurrentUserId(user.id);
      
      // Don't allow self-follow
      if (user.id === hostId) return;
      
      const { data } = await supabase
        .from('followers')
        .select('id')
        .eq('follower_id', user.id)
        .eq('following_id', hostId)
        .maybeSingle();
      
      setIsFollowing(!!data);
    };
    
    if (isOpen && hostId) {
      checkFollowStatus();
    }
  }, [isOpen, hostId]);

  const handleFollow = async () => {
    if (!hostId || !currentUserId || isFollowLoading) return;
    
    // Don't allow self-follow
    if (currentUserId === hostId) {
      toast.error("You can't follow yourself");
      return;
    }
    
    setIsFollowLoading(true);
    
    try {
      if (isFollowing) {
        // Unfollow
        const { error } = await supabase
          .from('followers')
          .delete()
          .eq('follower_id', currentUserId)
          .eq('following_id', hostId);
        
        if (error) throw error;
        setIsFollowing(false);
        toast.success('Unfollowed');
      } else {
        // Follow
        const { error } = await supabase
          .from('followers')
          .insert({
            follower_id: currentUserId,
            following_id: hostId,
          });
        
        if (error) throw error;
        setIsFollowing(true);
        toast.success(`Following ${hostName}`);
      }
    } catch (error) {
      console.error('Follow error:', error);
      toast.error('Something went wrong');
    } finally {
      setIsFollowLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center"
        >
          {/* Premium Dark Backdrop with animated gradient */}
          <div className="absolute inset-0 bg-gradient-to-b from-black via-slate-950 to-black">
            {/* Subtle animated glow orbs */}
            <motion.div
              animate={{
                scale: [1, 1.2, 1],
                opacity: [0.3, 0.5, 0.3],
              }}
              transition={{
                duration: 4,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              className="absolute top-1/4 left-1/4 w-64 h-64 bg-purple-600/20 rounded-full blur-3xl"
            />
            <motion.div
              animate={{
                scale: [1.2, 1, 1.2],
                opacity: [0.3, 0.5, 0.3],
              }}
              transition={{
                duration: 5,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              className="absolute bottom-1/4 right-1/4 w-48 h-48 bg-pink-600/20 rounded-full blur-3xl"
            />
          </div>

          {/* Content Container */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative z-10 w-full max-w-sm mx-6"
          >
            {/* Premium Card */}
 <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900/95 via-purple-950/90 to-slate-900/95 backdrop-blur-xl border border-white/10 shadow-2xl">
              {/* Top Glow Line */}
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-purple-400/50 to-transparent" />
              
              {/* Inner Content */}
              <div className="relative p-8">
                {/* Host Avatar with Premium Ring - NO OFFLINE BADGE */}
                <div className="flex justify-center mb-6">
                  <div className="relative">
                    {/* Animated Glow Ring */}
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                      className="absolute -inset-3 rounded-full bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500 opacity-60 blur-md"
                    />
                    
                    {/* Avatar Container */}
 <div className="relative w-24 h-24 rounded-full overflow-hidden border-4 border-white/20 shadow-2xl">
                      {hostAvatar ? (
                        <img loading="lazy" decoding="async" 
                          src={hostAvatar} 
                          alt={hostName}
                          className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center">
 <span className="text-3xl font-bold text-white">
                            {hostName.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Title & Message */}
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="text-center mb-6"
                >
 <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">
                    {title}
                  </h2>
 <p className="text-white/70 text-sm">
                    {message}
                  </p>
                </motion.div>

                {/* Stats Row - ONLY Viewers and Duration (NO Gifts) */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="grid grid-cols-2 gap-3 mb-6"
                >
                  {/* Viewers */}
 <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-3 text-center border border-white/10">
                    <Users className="w-5 h-5 mx-auto mb-1.5 text-purple-400" />
 <p className="text-white font-semibold text-sm">{viewerCount}</p>
 <p className="text-white/50 text-[10px]">Viewers</p>
                  </div>

                  {/* Duration */}
 <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-3 text-center border border-white/10">
                    <Clock className="w-5 h-5 mx-auto mb-1.5 text-pink-400" />
 <p className="text-white font-semibold text-sm">{duration}</p>
 <p className="text-white/50 text-[10px]">Duration</p>
                  </div>
                </motion.div>

                {/* Follow Button - Small & Elegant */}
                {hostId && currentUserId && currentUserId !== hostId && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.35 }}
                    className="flex justify-center mb-5"
                  >
                    <Button
                      onClick={handleFollow}
                      disabled={isFollowLoading}
                      size="sm"
                      className={`rounded-full px-6 py-2 text-sm font-medium transition-all ${
                        isFollowing
 ?'bg-white/10 hover:bg-white/20 text-white border border-white/20'
 :'bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-400 hover:to-purple-400 text-white shadow-lg shadow-pink-500/20'
                      }`}
                    >
                      {isFollowLoading ? (
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
 className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                        />
                      ) : isFollowing ? (
                        <span className="flex items-center gap-1.5">
                          <Check className="w-4 h-4" />
                          Following
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5">
                          <UserPlus className="w-4 h-4" />
                          Follow
                        </span>
                      )}
                    </Button>
                  </motion.div>
                )}

                {/* Thank You Message */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
 className="bg-gradient-to-r from-purple-500/10 via-pink-500/10 to-purple-500/10 rounded-2xl p-4 mb-6 border border-white/10"
                >
                  <div className="flex items-center justify-center gap-2">
                    <Heart className="w-4 h-4 text-pink-400" />
 <p className="text-white/80 text-sm">
                      Thank you for watching!
                    </p>
                    <Heart className="w-4 h-4 text-pink-400" />
                  </div>
                </motion.div>

                {/* Premium Exit Button */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                >
                  <Button
                    onClick={onExit}
 className="w-full relative overflow-hidden bg-gradient-to-r from-purple-600 via-pink-600 to-purple-600 hover:from-purple-500 hover:via-pink-500 hover:to-purple-500 text-white font-semibold rounded-2xl py-4 shadow-lg shadow-purple-500/20 transition-all duration-300 hover:shadow-purple-500/40 hover:scale-[1.02] active:scale-[0.98]"
                  >
                    {/* Shine Effect */}
                    <motion.div
                      animate={{
                        x: ['-100%', '200%'],
                      }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        repeatDelay: 3,
                        ease: "easeInOut",
                      }}
                      className="absolute inset-0 w-1/3 bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12"
                    />
                    
                    <div className="relative flex items-center justify-center gap-2">
                      <Home className="w-5 h-5" />
                      <span>{buttonText}</span>
                    </div>
                  </Button>
                </motion.div>

                {/* Auto-redirect hint */}
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.6 }}
 className="text-center text-white/40 text-xs mt-4"
                >
                  Redirecting automatically...
                </motion.p>
              </div>

              {/* Bottom Glow Line */}
              <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-pink-400/30 to-transparent" />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default RoomEndedModal;
