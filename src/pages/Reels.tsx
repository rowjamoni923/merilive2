import { useState, useEffect, useRef, useCallback } from "react";

import { useNavigate } from "react-router-dom";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { Heart, MessageCircle, Share2, Music2, Plus, User, Bookmark, MoreVertical, Flag, X, Send, Play, Pause, Volume2, VolumeX, Gift, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { BottomNavigation } from "@/components/layout/BottomNavigation";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion, AnimatePresence, PanInfo } from "framer-motion";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import FramedAvatarWithPrivileges from "@/components/common/FramedAvatarWithPrivileges";
import { LevelBadge } from "@/components/common/LevelBadge";
import { ReelUploadModal } from "@/components/reels/ReelUploadModal";
import { GiftPanel, GiftData } from "@/components/live/GiftPanel";
import { FlyingGiftAnimation } from "@/components/live/FlyingGiftAnimation";
import { useFlyingGifts } from "@/hooks/useFlyingGifts";
import { sendGift } from "@/features/shared/gifting/GiftingService";
import { recordClientError } from "@/utils/clientErrorLog";
interface Sound {
  id: string;
  title: string;
  artist: string;
  audio_url: string;
  cover_image_url?: string;
  duration_seconds: number;
}

interface Reel {
  id: string;
  user_id: string;
  video_url: string;
  thumbnail_url: string | null;
  caption: string | null;
  music_title: string | null;
  music_artist: string | null;
  sound_id?: string | null;
  sound_title?: string | null;
  sound_artist?: string | null;
  sound_audio_url?: string | null;
  is_original_sound?: boolean;
  view_count: number;
  like_count: number;
  comment_count: number;
  share_count: number;
  beans_earned: number;
  created_at: string;
  user: {
    id: string;
    app_uid?: string | null;
    display_name: string | null;
    avatar_url: string | null;
    user_level: number | null;
    is_verified: boolean | null;
    is_host: boolean | null;
    frame_id?: string | null;
    equipped_frame_id?: string | null;
  } | null;
  is_liked?: boolean;
  is_following?: boolean;
}

interface Comment {
  id: string;
  content: string;
  created_at: string;
  user: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    user_level: number | null;
  } | null;
}

interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
}

const Reels = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("/chat");
  const [reels, setReels] = useState<Reel[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [userCoins, setUserCoins] = useState(0);
  const [isHost, setIsHost] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showGiftPanel, setShowGiftPanel] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [sendingComment, setSendingComment] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [preSelectedSound, setPreSelectedSound] = useState<Sound | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [reportReason, setReportReason] = useState<string>("");
  const [submittingReport, setSubmittingReport] = useState(false);
  const videoRefs = useRef<{ [key: string]: HTMLVideoElement | null }>({});
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Flying gift animations
  const { gifts: flyingGifts, addGift: addFlyingGift, removeGift } = useFlyingGifts();

  useEffect(() => {
    // ⚡ Parallel init: auth + categories + profile all at once
    const init = async () => {
      const { getCachedUser } = await import('@/utils/cachedAuth');
      const user = await getCachedUser();
      
      if (user) {
        setCurrentUserId(user.id);
        // Fetch profile and categories in parallel
        const [profileRes, categoriesRes] = await Promise.all([
          supabase.from('profiles').select('is_host, coins').eq('id', user.id).single(),
          supabase.from('reel_categories').select('*').eq('is_active', true).order('display_order'),
        ]);
        setIsHost(profileRes.data?.is_host || false);
        setUserCoins(profileRes.data?.coins || 0);
        if (categoriesRes.data) setCategories(categoriesRes.data);
      } else {
        const { data } = await supabase.from('reel_categories').select('*').eq('is_active', true).order('display_order');
        if (data) setCategories(data);
      }
    };
    init();
  }, []);

  useEffect(() => {
    fetchReels(reels.length === 0);
  }, [selectedCategory, currentUserId]);

  const fetchReels = async (isInitial = false) => {
    // Only show loading on initial load, not on category/filter change
    if (isInitial || reels.length === 0) setLoading(true);
    let query = supabase
      .from('reels')
      .select(`
        *,
        user:profiles_public!reels_user_id_fkey(id, app_uid, display_name, avatar_url, user_level, is_verified, is_host, frame_id, equipped_frame_id)
      `)
      .eq('is_active', true)
      .eq('is_approved', true)
      .order('created_at', { ascending: false });

    if (selectedCategory !== 'all') {
      const category = categories.find(c => c.slug === selectedCategory);
      if (category) {
        query = query.eq('category_id', category.id);
      }
    }

    const { data, error } = await query.limit(50);
    
    if (error) {
      console.error('Error fetching reels:', error);
      recordClientError({ label: "Reels.category", message: error instanceof Error ? error.message : String(error) });
      setLoading(false);
      return;
    }

    if (data && currentUserId) {
      // Check likes and follows
      const reelIds = data.map(r => r.id);
      const userIds = data.map(r => r.user_id);

      const [likesRes, followsRes] = await Promise.all([
        supabase.from('reel_likes').select('reel_id').eq('user_id', currentUserId).in('reel_id', reelIds),
        supabase.from('followers').select('following_id').eq('follower_id', currentUserId).in('following_id', userIds)
      ]);

      const likedReels = new Set(likesRes.data?.map(l => l.reel_id) || []);
      const followingUsers = new Set(followsRes.data?.map(f => f.following_id) || []);

      const reelsWithStatus = data.map(reel => ({
        ...reel,
        is_liked: likedReels.has(reel.id),
        is_following: followingUsers.has(reel.user_id)
      }));

      setReels(reelsWithStatus);
    } else {
      setReels(data || []);
    }
    setLoading(false);
  };

  const handleLike = async (reelId: string) => {
    if (!currentUserId) {
      toast.error("Please login to like");
      return;
    }

    const reel = reels.find(r => r.id === reelId);
    if (!reel) return;

    if (reel.is_liked) {
      // Unlike
      await supabase.from('reel_likes').delete().eq('reel_id', reelId).eq('user_id', currentUserId);
      await supabase.from('reels').update({ like_count: Math.max(0, reel.like_count - 1) }).eq('id', reelId);
      setReels(prev => prev.map(r => 
        r.id === reelId ? { ...r, is_liked: false, like_count: Math.max(0, r.like_count - 1) } : r
      ));
    } else {
      // Like
      await supabase.from('reel_likes').insert({ reel_id: reelId, user_id: currentUserId });
      await supabase.from('reels').update({ like_count: reel.like_count + 1 }).eq('id', reelId);
      setReels(prev => prev.map(r => 
        r.id === reelId ? { ...r, is_liked: true, like_count: r.like_count + 1 } : r
      ));
    }
  };

  const handleFollow = async (userId: string) => {
    if (!currentUserId) {
      toast.error("Please login to follow");
      return;
    }

    const reel = reels.find(r => r.user_id === userId);
    if (!reel) return;

    if (reel.is_following) {
      await supabase.from('followers').delete().eq('follower_id', currentUserId).eq('following_id', userId);
      setReels(prev => prev.map(r => 
        r.user_id === userId ? { ...r, is_following: false } : r
      ));
      toast.success("Unfollowed");
    } else {
      await supabase.from('followers').insert({ follower_id: currentUserId, following_id: userId });
      setReels(prev => prev.map(r => 
        r.user_id === userId ? { ...r, is_following: true } : r
      ));
      toast.success("Following!");
    }
  };

  const handleShare = async (reelId: string) => {
    const reel = reels.find(r => r.id === reelId);
    if (!reel) return;

    const shareUrl = `https://merilive.com/link?target=/reels/${reelId}`;
    try {
      await navigator.share({
        title: reel.caption || 'Check out this reel!',
        url: shareUrl
      });
      
      if (currentUserId) {
        await supabase.from('reel_shares').insert({ reel_id: reelId, user_id: currentUserId });
        await supabase.from('reels').update({ share_count: reel.share_count + 1 }).eq('id', reelId);
        setReels(prev => prev.map(r => 
          r.id === reelId ? { ...r, share_count: r.share_count + 1 } : r
        ));
      }
    } catch (err) {
      // Copy link if share not supported
      navigator.clipboard.writeText(shareUrl);
      toast.success("Link copied!");
    }
  };

  const fetchComments = async (reelId: string) => {
    const { data } = await supabase
      .from('reel_comments')
      .select(`
        *,
        user:profiles_public!reel_comments_user_id_fkey(id, display_name, avatar_url, user_level)
      `)
      .eq('reel_id', reelId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    
    setComments(data || []);
  };

  const openComments = (reelId: string) => {
    fetchComments(reelId);
    setShowComments(true);
  };

  const sendComment = async () => {
    if (!newComment.trim() || !currentUserId || sendingComment) return;
    
    const currentReel = reels[currentIndex];
    if (!currentReel) return;

    setSendingComment(true);
    const { data, error } = await supabase
      .from('reel_comments')
      .insert({
        reel_id: currentReel.id,
        user_id: currentUserId,
        content: newComment.trim()
      })
      .select(`
        *,
        user:profiles_public!reel_comments_user_id_fkey(id, display_name, avatar_url, user_level)
      `)
      .single();

    if (!error && data) {
      setComments(prev => [data, ...prev]);
      await supabase.from('reels').update({ comment_count: currentReel.comment_count + 1 }).eq('id', currentReel.id);
      setReels(prev => prev.map(r => 
        r.id === currentReel.id ? { ...r, comment_count: r.comment_count + 1 } : r
      ));
      setNewComment("");
    }
    setSendingComment(false);
  };

  const handleSwipe = (direction: 'up' | 'down') => {
    if (direction === 'up' && currentIndex < reels.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else if (direction === 'down' && currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  };

  const handleDragEnd = (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const swipeThreshold = 80;
    const velocityThreshold = 300;
    
    // Check both offset and velocity for better swipe detection
    if (info.offset.y < -swipeThreshold || info.velocity.y < -velocityThreshold) {
      // Swipe up - go to next reel
      if (currentIndex < reels.length - 1) {
        setCurrentIndex(prev => prev + 1);
      }
    } else if (info.offset.y > swipeThreshold || info.velocity.y > velocityThreshold) {
      // Swipe down - go to previous reel
      if (currentIndex > 0) {
        setCurrentIndex(prev => prev - 1);
      }
    }
  };

  const togglePlay = () => {
    const currentVideo = videoRefs.current[reels[currentIndex]?.id];
    if (currentVideo) {
      if (isPlaying) {
        currentVideo.pause();
      } else {
        currentVideo.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const toggleMute = () => {
    Object.values(videoRefs.current).forEach(video => {
      if (video) video.muted = !isMuted;
    });
    setIsMuted(!isMuted);
  };

  // Auto-play current video
  useEffect(() => {
    Object.entries(videoRefs.current).forEach(([id, video]) => {
      if (video) {
        if (id === reels[currentIndex]?.id) {
          video.play().catch(() => {});
          setIsPlaying(true);
        } else {
          video.pause();
          video.currentTime = 0;
        }
      }
    });

    // Increment view count
    const currentReel = reels[currentIndex];
    if (currentReel) {
      supabase.rpc('increment_reel_view', { reel_uuid: currentReel.id });
    }
  }, [currentIndex, reels]);

  const formatCount = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  // Handle sending gift to reel creator
  const handleSendGift = async (gift: GiftData, count: number) => {
    const currentReel = reels[currentIndex];
    if (!currentReel || !currentUserId) {
      toast.error("Please login to send gifts");
      return;
    }

    if (currentReel.user_id === currentUserId) {
      toast.error("You cannot send gifts to your own reel");
      return;
    }

    const totalCost = gift.coins * count;
    if (totalCost > userCoins) {
      toast.error("Not enough diamonds!");
      return;
    }

    const previousCoins = userCoins;
    setUserCoins(prev => prev - totalCost);
    const { updateCachedBalance, getCachedBalance } = await import("@/hooks/useUserBalance");
    updateCachedBalance(getCachedBalance() - totalCost);
    setShowGiftPanel(false);

    addFlyingGift({
      giftName: gift.name,
      giftIcon: gift.emoji,
      giftImageUrl: gift.icon_url || undefined,
      animationUrl: gift.animation_url || gift.icon_url || undefined,
      soundUrl: gift.sound_url || undefined,
      senderName: 'You',
      giftColor: 'from-pink-500 to-purple-500',
      count,
      coins: gift.coins,
      isOwnGift: true,
    });

    try {
      const result = await sendGift({
        giftId: gift.id,
        senderId: currentUserId,
        receiverId: currentReel.user_id,
        quantity: count,
        context: 'reel',
        reelId: currentReel.id,
      });

      if (!result.success) throw new Error(result.error || 'Failed to send gift');

      const beansEarned = result.transaction?.beans_earned || 0;
      setReels(prev => prev.map(r =>
        r.id === currentReel.id
          ? { ...r, beans_earned: (r.beans_earned || 0) + beansEarned }
          : r
      ));

      const { data: updatedProfile } = await supabase
        .from('profiles')
        .select('coins')
        .eq('id', currentUserId)
        .single();
      if (updatedProfile) {
        setUserCoins(updatedProfile.coins || 0);
        updateCachedBalance(updatedProfile.coins || 0);
      }

      toast.success(`Sent ${count}x ${gift.name}!`);
    } catch (error) {
      console.error('Gift error:', error);
      recordClientError({ label: "Reels.beansEarned", message: error instanceof Error ? error.message : String(error) });
      setUserCoins(previousCoins);
      updateCachedBalance(previousCoins);
      toast.error("Failed to send gift");
    }
  };

  const currentReel = reels[currentIndex];

  return (
    <div className="fixed inset-0 bg-black flex flex-col overflow-hidden">
      {/* Header - Professional Minimal (TikTok-style) */}
      <div className="fixed top-0 left-0 right-0 z-50 safe-area-top pointer-events-none">
        <div className="px-4 pt-3 pb-10 flex items-center justify-between bg-gradient-to-b from-black/55 via-black/20 to-transparent">
          <h1 className="text-white font-bold text-[17px] tracking-[-0.01em] drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)] pointer-events-auto">
            Reels
          </h1>

          {currentUserId && (
            <button
              onClick={() => setShowUploadModal(true)}
              aria-label="Upload reel"
              className="pointer-events-auto w-9 h-9 rounded-full bg-white/12 hover:bg-white/20 backdrop-blur-md flex items-center justify-center text-white border border-white/15 transition-all active:scale-90"
            >
              <Plus className="w-[18px] h-[18px]" strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>

      {/* Campaign Banner */}
      
      
      {/* Reels Container - Full Screen with native scroll */}
      <div className="flex-1 overflow-hidden">
        {loading ? (
          <LoadingSpinner fullScreen />
        ) : reels.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-white px-6">
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-white/10 flex items-center justify-center mb-4 sm:mb-6">
              <Play className="w-10 h-10 sm:w-12 sm:h-12 opacity-60" />
            </div>
            <p className="text-lg sm:text-xl font-semibold mb-1.5 sm:mb-2">No reels yet</p>
            <p className="text-xs sm:text-sm text-white/50">Be the first to upload!</p>
          </div>
        ) : (
          <motion.div
            ref={containerRef}
            className="h-full w-full touch-pan-y"
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.2}
            onDragEnd={handleDragEnd}
            style={{ touchAction: 'pan-y' }}
          >
          <AnimatePresence mode="wait">
            {currentReel && (
              <motion.div
                key={currentReel.id}
                initial={{ y: 50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -50, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                className="h-full w-full relative"
              >
                {/* Video */}
                <video
                  ref={el => videoRefs.current[currentReel.id] = el}
                  src={currentReel.video_url}
                  className="w-full h-full object-cover"
                  loop
                  playsInline
                  muted={isMuted}
                  onClick={togglePlay}
                  poster={currentReel.thumbnail_url || undefined}
                />

                {/* Play/Pause Overlay */}
                <AnimatePresence>
                  {!isPlaying && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.5 }}
                      className="absolute inset-0 flex items-center justify-center pointer-events-none"
                    >
                      <div className="w-20 h-20 rounded-full bg-black/50 flex items-center justify-center">
                        <Play className="w-10 h-10 text-white ml-1" fill="white" />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Right Side Actions - Professional TikTok Style */}
                <div className="absolute right-2 flex flex-col items-center gap-[22px]" style={{ bottom: 'calc(var(--bottom-nav-height, 56px) + 80px)' }}>
                  {/* Avatar + follow moved next to the username for a cleaner, professional right rail */}


                  {/* Like */}
                  <motion.button
                    onClick={() => handleLike(currentReel.id)}
                    className="flex flex-col items-center gap-1"
                    whileTap={{ scale: 0.85 }}
                  >
                    <motion.div animate={currentReel.is_liked ? { scale: [1, 1.35, 1] } : {}} transition={{ duration: 0.3 }}>
                      <Heart
                        className={cn(
                          "w-[34px] h-[34px] transition-colors",
                          currentReel.is_liked
                            ? "text-rose-500 fill-rose-500 drop-shadow-[0_0_10px_rgba(244,63,94,0.6)]"
                            : "text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.7)]"
                        )}
                        strokeWidth={1.8}
                      />
                    </motion.div>
                    <span className="text-white text-[11px] font-semibold tabular-nums drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
                      {formatCount(currentReel.like_count)}
                    </span>
                  </motion.button>

                  {/* Comment */}
                  <motion.button
                    onClick={() => openComments(currentReel.id)}
                    className="flex flex-col items-center gap-1"
                    whileTap={{ scale: 0.85 }}
                  >
                    <MessageCircle className="w-[32px] h-[32px] text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.7)]" strokeWidth={1.8} />
                    <span className="text-white text-[11px] font-semibold tabular-nums drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
                      {formatCount(currentReel.comment_count)}
                    </span>
                  </motion.button>

                  {/* Gift - consistent icon style */}
                  {currentReel.user_id !== currentUserId && (
                    <motion.button
                      onClick={() => setShowGiftPanel(true)}
                      className="flex flex-col items-center gap-1"
                      whileTap={{ scale: 0.85 }}
                    >
                      <Gift className="w-[32px] h-[32px] text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.7)]" strokeWidth={1.8} />
                      <span className="text-white text-[11px] font-semibold drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">Gift</span>
                    </motion.button>
                  )}

                  {/* Share */}
                  <motion.button
                    onClick={() => handleShare(currentReel.id)}
                    className="flex flex-col items-center gap-1"
                    whileTap={{ scale: 0.85 }}
                  >
                    <Share2 className="w-[30px] h-[30px] text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.7)]" strokeWidth={1.8} />
                    <span className="text-white text-[11px] font-semibold tabular-nums drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
                      {formatCount(currentReel.share_count)}
                    </span>
                  </motion.button>

                  {/* More */}
                  <motion.button
                    onClick={() => setShowSettings(true)}
                    whileTap={{ scale: 0.85 }}
                    aria-label="More options"
                  >
                    <MoreVertical className="w-[26px] h-[26px] text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.7)]" strokeWidth={2} />
                  </motion.button>

                  {/* Mute - small subtle */}
                  <motion.button
                    onClick={toggleMute}
                    whileTap={{ scale: 0.85 }}
                    aria-label={isMuted ? 'Unmute' : 'Mute'}
                  >
                    <div className="w-[30px] h-[30px] rounded-full bg-black/35 backdrop-blur-md flex items-center justify-center border border-white/15">
                      {isMuted ? (
                        <VolumeX className="w-[16px] h-[16px] text-white" strokeWidth={2} />
                      ) : (
                        <Volume2 className="w-[16px] h-[16px] text-white" strokeWidth={2} />
                      )}
                    </div>
                  </motion.button>

                  {/* Spinning Music Disc */}
                  <div className="w-[36px] h-[36px] rounded-full border-2 border-white/15 bg-gradient-to-br from-zinc-800 via-zinc-900 to-black flex items-center justify-center animate-spin shadow-[0_2px_8px_rgba(0,0,0,0.6)]" style={{ animationDuration: '5s' }}>
                    <div className="w-[12px] h-[12px] rounded-full bg-gradient-to-br from-rose-400 to-fuchsia-500" />
                  </div>
                </div>

                {/* Beans Earned Badge - Premium Gold */}
                {(currentReel.beans_earned || 0) > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="absolute top-16 left-3 flex items-center gap-1.5 bg-gradient-to-r from-amber-500/90 to-orange-500/90 rounded-full px-3 py-1.5 backdrop-blur-sm shadow-[0_2px_16px_rgba(245,158,11,0.3)] border border-amber-300/30"
                  >
                    <Coins className="w-3.5 h-3.5 text-white" />
                    <span className="text-white text-[11px] font-extrabold tracking-wide">{formatCount(currentReel.beans_earned || 0)}</span>
                  </motion.div>
                )}

                {/* Bottom Info - Refined Editorial */}
                <div className="absolute left-0 right-0 pointer-events-none" style={{ bottom: 'var(--bottom-nav-height, 56px)' }}>
                  <div className="bg-gradient-to-t from-black/85 via-black/45 to-transparent pt-24 pb-4 px-4">
                    <div className="pointer-events-auto pr-16">
                      {/* Username row — compact avatar + name + inline follow + */}
                      <div className="flex items-center gap-2 mb-2">
                        <button
                          onClick={() => navigate(`/profile/${currentReel.user_id}`)}
                          className="w-[32px] h-[32px] rounded-full overflow-hidden ring-[1.5px] ring-white/90 bg-black flex-shrink-0 shadow-[0_2px_8px_rgba(0,0,0,0.6)] active:scale-95 transition-transform"
                          aria-label="View profile"
                        >
                          <FramedAvatarWithPrivileges
                            userId={currentReel.user_id}
                            src={currentReel.user?.avatar_url || ''}
                            name={currentReel.user?.display_name || currentReel.user?.app_uid || 'User'}
                            level={currentReel.user?.user_level || 1}
                            size="sm"
                          />
                        </button>
                        <button
                          onClick={() => navigate(`/profile/${currentReel.user_id}`)}
                          className="text-white font-bold text-[15px] tracking-[-0.01em] drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] active:opacity-70"
                        >
                          @{currentReel.user?.display_name || 'User'}
                        </button>
                        {!currentReel.is_following && currentReel.user_id !== currentUserId && (
                          <button
                            onClick={() => handleFollow(currentReel.user_id)}
                            aria-label="Follow"
                            className="w-[18px] h-[18px] rounded-full bg-white/95 flex items-center justify-center shadow-[0_1px_4px_rgba(0,0,0,0.5)] active:scale-90 transition-transform"
                          >
                            <Plus className="w-[12px] h-[12px] text-black" strokeWidth={3} />
                          </button>
                        )}
                        {currentReel.user?.is_verified && (
                          <div className="w-[15px] h-[15px] rounded-full bg-sky-500 flex items-center justify-center shadow-[0_0_6px_rgba(14,165,233,0.5)]">
                            <span className="text-white text-[9px] font-black leading-none">✓</span>
                          </div>
                        )}
                        <LevelBadge level={currentReel.user?.user_level || 1} size="sm" />
                      </div>


                      {/* Caption */}
                      {currentReel.caption && (
                        <p className="text-white text-[13px] mb-3 line-clamp-2 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)] leading-snug">
                          {currentReel.caption}
                        </p>
                      )}

                      {/* Music Ticker */}
                      <button
                        onClick={() => {
                          if (isHost) {
                            const soundData: Sound = {
                              id: currentReel.sound_id || currentReel.id,
                              title: currentReel.sound_title || currentReel.music_title || 'Original Sound',
                              artist: currentReel.sound_artist || currentReel.music_artist || currentReel.user?.display_name || 'Unknown',
                              audio_url: currentReel.sound_audio_url || currentReel.video_url,
                              duration_seconds: 60,
                            };
                            setPreSelectedSound(soundData);
                            setShowUploadModal(true);
                          }
                        }}
                        className="flex items-center gap-1.5 max-w-full overflow-hidden"
                      >
                        <Music2 className="w-[13px] h-[13px] text-white/90 flex-shrink-0" />
                        <div className="overflow-hidden flex-1">
                          <motion.span
                            className="text-white/90 text-[11.5px] font-medium whitespace-nowrap inline-block drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]"
                            animate={{ x: [0, -140, 0] }}
                            transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
                          >
                            {currentReel.sound_title || currentReel.music_title || 'Original Sound'}
                            {' · '}
                            {currentReel.sound_artist || currentReel.music_artist || currentReel.user?.display_name || 'Unknown'}
                          </motion.span>
                        </div>
                        {isHost && (
                          <span className="text-white text-[9.5px] font-bold whitespace-nowrap flex-shrink-0 bg-white/15 backdrop-blur-sm px-1.5 py-0.5 rounded">Use</span>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Navigation arrows removed - swipe only */}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
        )}
      </div>

      {/* Comments Sheet */}
      <Sheet open={showComments} onOpenChange={setShowComments}>
        <SheetContent side="bottom" className="h-[70vh] bg-background rounded-t-3xl">
          <SheetHeader>
            <SheetTitle>{currentReel?.comment_count || 0} Comments</SheetTitle>
          </SheetHeader>
          
          <ScrollArea className="h-[calc(100%-120px)] mt-4">
            {comments.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No comments yet. Be the first!
              </div>
            ) : (
              <div className="space-y-4">
                {comments.map(comment => (
                  <div key={comment.id} className="flex gap-3">
                    <Avatar className="w-8 h-8">
                      <AvatarImage src={comment.user?.avatar_url || ''} />
                      <AvatarFallback>{comment.user?.display_name?.[0] || 'U'}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{comment.user?.display_name || 'User'}</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(comment.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-sm mt-1">{comment.content}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Comment Input */}
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-background border-t flex gap-2">
            <Input
              placeholder="Add a comment..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && sendComment()}
              className="flex-1"
            />
            <Button onClick={sendComment} disabled={!newComment.trim() || sendingComment} size="icon">
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Upload Modal */}
      <ReelUploadModal
        isOpen={showUploadModal}
        onClose={() => {
          setShowUploadModal(false);
          setPreSelectedSound(null);
        }}
        categories={categories}
        onUploadSuccess={() => {
          setShowUploadModal(false);
          setPreSelectedSound(null);
          fetchReels();
          toast.success("Reel uploaded successfully!");
        }}
        preSelectedSound={preSelectedSound}
      />

      {/* Gift Panel */}
      <GiftPanel
        isOpen={showGiftPanel}
        onClose={() => setShowGiftPanel(false)}
        onSendGift={handleSendGift}
        userCoins={userCoins}
      />

      {/* Flying Gift Animations */}
      <AnimatePresence>
        {flyingGifts.map(gift => (
          <FlyingGiftAnimation 
            key={gift.id}
            gift={gift} 
            onComplete={() => removeGift(gift.id)}
          />
        ))}
      </AnimatePresence>

      {/* Settings / More Options Sheet */}
      <Sheet open={showSettings} onOpenChange={setShowSettings}>
        <SheetContent
          side="bottom"
          className="rounded-t-3xl border-t border-white/10 bg-[#0B0F19] p-0 max-h-[85vh] shadow-[0_-12px_40px_rgba(0,0,0,0.6)]"
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="h-1.5 w-12 rounded-full bg-white/15" />
          </div>

          <SheetHeader className="px-5 pt-2 pb-3">
            <SheetTitle className="text-white text-[17px] font-semibold tracking-tight text-center">
              Reel Options
            </SheetTitle>
          </SheetHeader>

          <div className="px-3 pb-7">
            {currentReel && (
              <div className="space-y-1.5">
                {/* Save */}
                <button
                  onClick={async () => {
                    if (!currentUserId) { toast.error("Please login"); return; }
                    try {
                      const { error } = await supabase.from("saved_reels" as any).insert({ user_id: currentUserId, reel_id: currentReel.id });
                      if (error && !String(error.message).includes("duplicate")) throw error;
                      toast.success("Saved to your collection");
                    } catch (e: any) {
                      toast.error(e?.message || "Could not save");
                    }
                    setShowSettings(false);
                  }}
                  className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] active:bg-white/[0.12] border border-white/[0.06] transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-blue-500/15 ring-1 ring-blue-400/20 flex items-center justify-center shrink-0">
                    <Bookmark className="w-[18px] h-[18px] text-blue-300" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-white text-[14.5px] font-semibold leading-tight">Save</div>
                    <div className="text-slate-400 text-[12px] mt-0.5">Add to your collection</div>
                  </div>
                </button>

                {/* Copy Link */}
                <button
                  onClick={async () => {
                    try {
                      const url = `${window.location.origin}/reels?id=${currentReel.id}`;
                      await navigator.clipboard.writeText(url);
                      toast.success("Link copied to clipboard");
                    } catch {
                      toast.error("Could not copy link");
                    }
                    setShowSettings(false);
                  }}
                  className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] active:bg-white/[0.12] border border-white/[0.06] transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/15 ring-1 ring-indigo-400/20 flex items-center justify-center shrink-0">
                    <Share2 className="w-[18px] h-[18px] text-indigo-300" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-white text-[14.5px] font-semibold leading-tight">Copy Link</div>
                    <div className="text-slate-400 text-[12px] mt-0.5">Share this reel anywhere</div>
                  </div>
                </button>

                {/* Not Interested */}
                {currentReel.user_id !== currentUserId && (
                  <button
                    onClick={() => {
                      setReels(prev => prev.filter(r => r.id !== currentReel.id));
                      toast.success("We'll show fewer reels like this");
                      setShowSettings(false);
                    }}
                    className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] active:bg-white/[0.12] border border-white/[0.06] transition-colors text-left"
                  >
                    <div className="w-10 h-10 rounded-xl bg-amber-500/15 ring-1 ring-amber-400/20 flex items-center justify-center shrink-0">
                      <X className="w-[18px] h-[18px] text-amber-300" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-white text-[14.5px] font-semibold leading-tight">Not Interested</div>
                      <div className="text-slate-400 text-[12px] mt-0.5">Hide and improve recommendations</div>
                    </div>
                  </button>
                )}

                {/* Block User */}
                {currentReel.user_id !== currentUserId && (
                  <button
                    onClick={async () => {
                      if (!currentUserId) { toast.error("Please login"); return; }
                      try {
                        const { error } = await supabase.from("blocked_users").insert({ blocker_id: currentUserId, blocked_id: currentReel.user_id });
                        if (error && !String(error.message).includes("duplicate")) throw error;
                        setReels(prev => prev.filter(r => r.user_id !== currentReel.user_id));
                        toast.success("User blocked");
                      } catch (e: any) {
                        toast.error(e?.message || "Could not block user");
                      }
                      setShowSettings(false);
                    }}
                    className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl bg-rose-500/[0.06] hover:bg-rose-500/[0.12] active:bg-rose-500/[0.18] border border-rose-500/15 transition-colors text-left"
                  >
                    <div className="w-10 h-10 rounded-xl bg-rose-500/20 ring-1 ring-rose-400/30 flex items-center justify-center shrink-0">
                      <User className="w-[18px] h-[18px] text-rose-300" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-rose-200 text-[14.5px] font-semibold leading-tight">Block User</div>
                      <div className="text-rose-300/60 text-[12px] mt-0.5">You won't see their content</div>
                    </div>
                  </button>
                )}

                {/* Report */}
                {currentReel.user_id !== currentUserId && (
                  <div className="pt-4 mt-2 border-t border-white/[0.06]">
                    <div className="px-2 mb-2.5 text-[11px] uppercase tracking-[0.12em] text-slate-400 font-semibold">
                      Report this reel
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {["Spam", "Nudity", "Violence", "Hate", "Harassment", "Other"].map((reason) => (
                        <button
                          key={reason}
                          disabled={submittingReport}
                          onClick={async () => {
                            if (!currentUserId) { toast.error("Please login"); return; }
                            setSubmittingReport(true);
                            setReportReason(reason);
                            try {
                              const { error } = await supabase.from("reports" as any).insert({
                                reporter_id: currentUserId,
                                reported_user_id: currentReel.user_id,
                                content_type: "reel",
                                content_id: currentReel.id,
                                reason,
                              });
                              if (error) throw error;
                              toast.success("Report submitted. Thank you.");
                              setShowSettings(false);
                            } catch (e: any) {
                              toast.error(e?.message || "Could not submit report");
                            } finally {
                              setSubmittingReport(false);
                              setReportReason("");
                            }
                          }}
                          className="flex items-center justify-center gap-2 px-3 py-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] active:bg-white/[0.12] border border-white/[0.06] text-white text-[13px] font-medium transition-colors disabled:opacity-50"
                        >
                          <Flag className="w-3.5 h-3.5 text-slate-400" />
                          {submittingReport && reportReason === reason ? "..." : reason}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>


      {/* Bottom Navigation */}
      <BottomNavigation activeTab={activeTab} onTabChange={(path) => navigate(path)} />
    </div>
  );
};

export default Reels;
