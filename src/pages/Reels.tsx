import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from "react";
import { useNativeImagePrefetch } from "@/hooks/useNativeImagePrefetch";

import { useNavigate, useSearchParams } from "react-router-dom";
import { Skeleton as SkeletonPrim } from "@/components/Skeleton";
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
const loadReelUploadModal = () => import("@/components/reels/ReelUploadModal");
const ReelUploadModal = lazy(() => loadReelUploadModal().then(m => ({ default: m.ReelUploadModal })));
const GiftPanel = lazy(() => import("@/components/live/GiftPanel").then(m => ({ default: m.GiftPanel })));
import type { GiftData } from "@/components/live/GiftPanel";
import { FlyingGiftAnimation } from "@/components/live/FlyingGiftAnimation";
import { useFlyingGifts } from "@/hooks/useFlyingGifts";
import { sendGift } from "@/features/shared/gifting/GiftingService";
import { recordClientError } from "@/utils/clientErrorLog";
import { subscribeToTables } from "@/hooks/useUniversalRealtime";
import { hardenVideoElementForNative } from "@/utils/videoNativeHardening";
import { useNativeReelsPlayer } from "@/hooks/useNativeReelsPlayer";
import { useStableChatScroll } from "@/hooks/useStableChatScroll";
import { tryHeartBurst } from "@/plugins/NativeHeartBurst";
import { isNativeHeartBurstFlagOn } from "@/utils/nativeHeartBurstFlag";
import { getRequiredDisplayLevel } from "@/utils/stableLevel";

const formatRelativeTime = (iso: string): string => {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diff = Math.max(0, Date.now() - then);
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo`;
  return `${Math.floor(d / 365)}y`;
};

// Module-scoped instant cache — re-entering Reels shows the last list immediately
// (zero-refresh feel) while realtime + background fetch keep it fresh.
const reelsCache: { byCategory: Map<string, any[]>; categories: any[] | null } = {
  byCategory: new Map(),
  categories: null,
};
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
    host_level?: number | null;
    max_user_level?: number | null;
    gender?: string | null;
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
    host_level?: number | null;
    max_user_level?: number | null;
    gender?: string | null;
    is_host?: boolean | null;
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
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState("/chat");
  // Hydrate from module cache so re-entry is instant (no blank/loading flash)
  const [reels, setReels] = useState<Reel[]>(() => reelsCache.byCategory.get('all') || []);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(() => (reelsCache.byCategory.get('all')?.length ?? 0) === 0);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<Comment['user'] | null>(null);
  const [userDiamonds, setUserCoins] = useState(0);
  const [isHost, setIsHost] = useState(false);
  const [categories, setCategories] = useState<Category[]>(() => reelsCache.categories || []);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showGiftPanel, setShowGiftPanel] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const reelsCommentsScroll = useStableChatScroll({
    dependency: comments.length,
    resetKey: reels[currentIndex]?.id,
    bottomThreshold: 96,
    initialPinFrames: 3,
  });
  const [newComment, setNewComment] = useState("");
  const [sendingComment, setSendingComment] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  // Default muted = true so mobile browsers allow autoplay (TikTok/Reels behaviour).
  // User can tap the speaker icon to unmute (that tap is a user gesture).
  const [isMuted, setIsMuted] = useState(true);
  const [preSelectedSound, setPreSelectedSound] = useState<Sound | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [reportReason, setReportReason] = useState<string>("");
  const [submittingReport, setSubmittingReport] = useState(false);
  const videoRefs = useRef<{ [key: string]: HTMLVideoElement | null }>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const userCoinsRef = useRef(0);
  const currentIndexRef = useRef(0);
  const currentUserIdRef = useRef<string | null>(null);

  // Pkg427 — Native Android Reels Player (ExoPlayer). When the
  // `reels:native:enabled` flag is ON for this device, ExoPlayer takes
  // over and `nativeReels.active === true` — Reels.tsx then hides the
  // <video> element so the transparent WebView reveals the native
  // surface beneath. UI overlays (like / gift / comments / captions)
  // keep rendering on top byte-identically. Default OFF → existing
  // <video> path runs for everyone.
  const nativeReels = useNativeReelsPlayer({
    url: reels[currentIndex]?.video_url ?? null,
    muted: isMuted,
    enabled: true,
    prefetchUrls: [
      reels[currentIndex + 1]?.video_url,
      reels[currentIndex - 1]?.video_url,
    ].filter((u): u is string => !!u),
  });
  
  useEffect(() => {
    userCoinsRef.current = userDiamonds;
  }, [userDiamonds]);
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);
  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  // Pkg428 Phase-9 — native Glide prefetch for upcoming reel thumbnails +
  // creator avatars (next 6). No-op on web/iOS or when flag off.
  const nativePrefetchUrls = useMemo(() => {
    const window = reels.slice(currentIndex, currentIndex + 6);
    const urls: string[] = [];
    for (const r of window) {
      if (r.thumbnail_url) urls.push(r.thumbnail_url);
      if (r.user?.avatar_url) urls.push(r.user.avatar_url);
    }
    return urls;
  }, [reels, currentIndex]);
  useNativeImagePrefetch(nativePrefetchUrls);

  
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
          supabase.from('profiles').select('is_host, gender, diamonds, display_name, avatar_url, user_level, host_level, max_user_level').eq('id', user.id).single(),
          supabase.from('reel_categories').select('*').eq('is_active', true).order('display_order'),
        ]);
        setIsHost(profileRes.data?.is_host || false);
        setCurrentUserProfile(profileRes.data ? {
          id: user.id,
          display_name: profileRes.data.display_name,
          avatar_url: profileRes.data.avatar_url,
          user_level: profileRes.data.user_level,
          host_level: (profileRes.data as any).host_level,
          max_user_level: (profileRes.data as any).max_user_level,
          gender: (profileRes.data as any).gender,
          is_host: profileRes.data.is_host,
        } : null);
        userCoinsRef.current = profileRes.data?.diamonds || 0;
        setUserCoins(profileRes.data?.diamonds || 0);
        if (categoriesRes.data) {
          setCategories(categoriesRes.data);
          reelsCache.categories = categoriesRes.data;
        }
      } else {
        const { data } = await supabase.from('reel_categories').select('*').eq('is_active', true).order('display_order');
        if (data) {
          setCategories(data);
          reelsCache.categories = data;
        }
      }
    };
    init();
  }, []);

  // ⚡ Supabase Realtime — instant feed updates without any refresh.
  // New reels appear at the top, deletes vanish, like/comment/share counts tick live.
  useEffect(() => {
    const refetchTimer = { current: null as ReturnType<typeof setTimeout> | null };
    const scheduleRefetch = () => {
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
      refetchTimer.current = setTimeout(() => fetchReels(false), 350);
    };

    const bumpCount = (reelId: string, field: 'like_count' | 'comment_count' | 'share_count', delta: number) => {
      setReels(prev => {
        const next = prev.map(r => r.id === reelId ? { ...r, [field]: Math.max(0, (r[field] as number) + delta) } : r);
        reelsCache.byCategory.set(selectedCategory, next);
        return next;
      });
    };

    const unsubscribe = subscribeToTables(
      `reels-feed-${selectedCategory}`,
      ['reels', 'reel_likes', 'reel_comments', 'reel_shares'],
      (table, event, payload) => {
        const row: any = payload?.new || payload?.old;
        if (!row) return;
        if (table === 'reels') {
          // New upload / approval flip / deletion → refetch list (debounced)
          scheduleRefetch();
        } else if (table === 'reel_likes') {
          const reelId = row.reel_id;
          if (!reelId) return;
          if (event === 'INSERT') bumpCount(reelId, 'like_count', 1);
          else if (event === 'DELETE') bumpCount(reelId, 'like_count', -1);
        } else if (table === 'reel_comments') {
          const reelId = row.reel_id;
          if (!reelId) return;
          if (event === 'INSERT') {
            if (row.user_id !== currentUserIdRef.current) bumpCount(reelId, 'comment_count', 1);
            // If user has the comments sheet open on this reel, prepend live
            if (showComments && reels[currentIndex]?.id === reelId && row.user_id !== currentUserIdRef.current) {
              // Re-fetch with profile join for the avatar/name
              fetchComments(reelId);
            }
          } else if (event === 'DELETE') {
            bumpCount(reelId, 'comment_count', -1);
          }
        } else if (table === 'reel_shares' && event === 'INSERT') {
          bumpCount(row.reel_id, 'share_count', 1);
        }
      }
    );

    return () => {
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory, currentUserId]);


  useEffect(() => {
    // Instant hydrate from per-category cache, then refresh in the background
    const cached = reelsCache.byCategory.get(selectedCategory);
    if (cached && cached.length > 0) {
      setReels(cached);
      setLoading(false);
    }
    fetchReels(reels.length === 0 && !cached);
  }, [selectedCategory, currentUserId]);

  useEffect(() => {
    const startId = searchParams.get('start') || searchParams.get('id');
    if (!startId || reels.length === 0) return;
    const index = reels.findIndex((reel) => reel.id === startId);
    if (index >= 0) setCurrentIndex(index);
  }, [searchParams, reels]);

  const fetchReels = async (isInitial = false) => {
    // Only show loading on initial cold start (no cache yet)
    const hasCache = (reelsCache.byCategory.get(selectedCategory)?.length ?? 0) > 0;
    if ((isInitial || reels.length === 0) && !hasCache) setLoading(true);
    let query = supabase
      .from('reels')
      .select(`
        *,
        user:profiles_public!reels_user_id_fkey(id, app_uid, display_name, avatar_url, user_level, host_level, max_user_level, gender, is_verified, is_host, frame_id, equipped_frame_id)
      `)
      .eq('is_active', true)
      .eq('is_approved', true)
        .order('created_at', { ascending: true });

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
      reelsCache.byCategory.set(selectedCategory, reelsWithStatus);
    } else {
      const list = data || [];
      setReels(list);
      reelsCache.byCategory.set(selectedCategory, list);
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

    try {
      if (reel.is_liked) {
        const { error } = await supabase.from('reel_likes').delete().eq('reel_id', reelId).eq('user_id', currentUserId);
        if (error) throw error;
        setReels(prev => prev.map(r => 
          r.id === reelId ? { ...r, is_liked: false, like_count: Math.max(0, r.like_count - 1) } : r
        ));
      } else {
        const { error } = await supabase.from('reel_likes').insert({ reel_id: reelId, user_id: currentUserId });
        if (error) throw error;
        setReels(prev => prev.map(r => 
          r.id === reelId ? { ...r, is_liked: true, like_count: r.like_count + 1 } : r
        ));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update like");
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
        const { error } = await supabase.from('reel_shares').insert({ reel_id: reelId, user_id: currentUserId, share_type: 'native' });
        if (error) throw error;
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
        user:profiles_public!reel_comments_user_id_fkey(id, display_name, avatar_url, user_level, host_level, max_user_level, gender, is_host)
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

    const content = newComment.trim();
    const optimisticId = `temp-comment-${Date.now()}`;
    const optimisticComment: Comment = {
      id: optimisticId,
      content,
      created_at: new Date().toISOString(),
      user: currentUserProfile || { id: currentUserId, display_name: 'You', avatar_url: null, user_level: null },
    };

    setSendingComment(true);
    setNewComment("");
    setComments(prev => [...prev, optimisticComment]);
    setReels(prev => prev.map(r => 
      r.id === currentReel.id ? { ...r, comment_count: r.comment_count + 1 } : r
    ));

    const { data, error } = await supabase
      .from('reel_comments')
      .insert({
        reel_id: currentReel.id,
        user_id: currentUserId,
        content
      })
      .select(`
        *,
        user:profiles_public!reel_comments_user_id_fkey(id, display_name, avatar_url, user_level, host_level, max_user_level, gender, is_host)
      `)
      .single();

    if (!error && data) {
      setComments(prev => prev.map(comment => comment.id === optimisticId ? data : comment));
    } else if (error) {
      setComments(prev => prev.filter(comment => comment.id !== optimisticId));
      setReels(prev => prev.map(r => 
        r.id === currentReel.id ? { ...r, comment_count: Math.max(0, r.comment_count - 1) } : r
      ));
      setNewComment(content);
      toast.error("Failed to send comment");
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

  // First-tap auto-unmute: mobile browsers require muted for autoplay, but the
  // very first user gesture inside Reels is a strong signal that they want sound.
  const autoUnmutedRef = useRef(false);

  const togglePlay = () => {
    // Unmute on first tap regardless of path (TikTok behaviour).
    const wasMuted = isMuted;
    if (wasMuted && !autoUnmutedRef.current) {
      autoUnmutedRef.current = true;
      setIsMuted(false);
    }

    // Pkg427 — when native ExoPlayer owns playback, route through plugin.
    if (nativeReels.active) {
      if (isPlaying) nativeReels.pause();
      else nativeReels.play();
      setIsPlaying(!isPlaying);
      return;
    }

    const currentVideo = videoRefs.current[reels[currentIndex]?.id];
    if (currentVideo) {
      if (wasMuted && !autoUnmutedRef.current) {
        Object.values(videoRefs.current).forEach(v => { if (v) v.muted = false; });
      }
      if (isPlaying) {
        currentVideo.pause();
      } else {
        currentVideo.play().catch(() => {});
      }
      setIsPlaying(!isPlaying);
    }
  };

  // Pkg438 Phase C — double-tap to like + native heart-burst overlay.
  // Pattern: schedule single-tap (togglePlay) on a 250ms delay; if a
  // second tap arrives within that window, cancel the toggle and run
  // the like + heart-burst. Matches Instagram/TikTok feel.
  const tapStateRef = useRef<{ timer: number | null; lastAt: number }>({ timer: null, lastAt: 0 });
  const handleVideoTap = (e: React.MouseEvent<HTMLElement>) => {
    const now = Date.now();
    const since = now - tapStateRef.current.lastAt;
    // Heart burst uses viewport coords (native overlay is fullscreen on decorView).
    const x = e.clientX;
    const y = e.clientY;
    if (since < 280 && tapStateRef.current.timer != null) {
      window.clearTimeout(tapStateRef.current.timer);
      tapStateRef.current.timer = null;
      tapStateRef.current.lastAt = 0;
      const reel = reels[currentIndex];
      if (reel && !reel.is_liked) void handleLike(reel.id);
      if (isNativeHeartBurstFlagOn()) void tryHeartBurst(x, y, { count: 7, size: 72 });
      return;
    }
    tapStateRef.current.lastAt = now;
    tapStateRef.current.timer = window.setTimeout(() => {
      tapStateRef.current.timer = null;
      togglePlay();
    }, 260);
  };


  const toggleMute = () => {
    autoUnmutedRef.current = true;
    const next = !isMuted;
    // Pkg427 — route mute to native plugin when active; the hook also
    // mirrors isMuted via a separate effect, but this gives instant feel.
    if (nativeReels.active) {
      nativeReels.setMuted(next);
    } else {
      Object.values(videoRefs.current).forEach(video => {
        if (video) video.muted = next;
      });
    }
    setIsMuted(next);
  };

  // Auto-play current video (web <video> path only — native plugin
  // already auto-plays inside useNativeReelsPlayer).
  useEffect(() => {
    if (!nativeReels.active) {
      Object.entries(videoRefs.current).forEach(([id, video]) => {
        if (video) {
          if (id === reels[currentIndex]?.id) {
            video.muted = isMuted;
            video.play().catch(() => {});
            setIsPlaying(true);
          } else {
            video.pause();
            video.currentTime = 0;
          }
        }
      });
    } else {
      // Native took over — make sure we report "playing" so the play-icon
      // overlay stays hidden.
      setIsPlaying(true);
    }

    // Increment view count
    const currentReel = reels[currentIndex];
    if (currentReel) {
      supabase.rpc('increment_reel_view', { reel_uuid: currentReel.id });
    }
  }, [currentIndex, reels, isMuted, nativeReels.active]);

  const formatCount = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  // Handle sending gift to reel creator
  const handleSendGift = async (gift: GiftData, count: number) => {
    const currentReel = reels[currentIndex];
    const sendingUserId = currentUserIdRef.current;
    const sendingReelId = currentReel?.id;
    if (!currentReel || !sendingUserId || !sendingReelId) {
      toast.error("Please login to send gifts");
      return;
    }

    if (currentReel.user_id === sendingUserId) {
      toast.error("You cannot send gifts to your own reel");
      return;
    }

    const totalCost = gift.diamonds * count;
    const availableCoins = userCoinsRef.current;
    if (totalCost > availableCoins) {
      toast.error("Not enough diamonds!");
      return;
    }

    const previousCoins = availableCoins;
    userCoinsRef.current = Math.max(0, availableCoins - totalCost);
    setUserCoins(userCoinsRef.current);
    const { updateCachedBalance, getCachedBalance } = await import("@/hooks/useUserBalance");
    updateCachedBalance(getCachedBalance() - totalCost);
    setShowGiftPanel(false);

    addFlyingGift({
      senderId: sendingUserId,
      giftName: gift.name,
      giftIcon: gift.emoji,
      giftImageUrl: gift.icon_url || undefined,
      animationUrl: gift.animation_url || gift.icon_url || undefined,
      animationFormat: gift.animation_format || null,
      animationConfigUrl: gift.animation_config_url || undefined,
      soundUrl: gift.sound_url || undefined,
      senderName: 'You',
      giftColor: 'from-pink-500 to-purple-500',
      count,
      diamonds: gift.diamonds,
      isOwnGift: true,
    });

    try {
      const result = await sendGift({
        giftId: gift.id,
        gift,
        senderId: sendingUserId,
        receiverId: currentReel.user_id,
        quantity: count,
        context: 'reel',
        reelId: sendingReelId,
      });

      if (!result.success) throw new Error(result.error || 'Failed to send gift');

      const beansEarned = result.transaction?.beans_earned || 0;
      if (currentUserIdRef.current === sendingUserId) {
        setReels(prev => prev.map(r =>
          r.id === sendingReelId
            ? { ...r, beans_earned: (r.beans_earned || 0) + beansEarned }
            : r
        ));
      }

      const { data: updatedProfile } = await supabase
        .from('profiles')
        .select('diamonds')
        .eq('id', sendingUserId)
        .single();
      if (updatedProfile) {
        userCoinsRef.current = updatedProfile.diamonds || 0;
        setUserCoins(userCoinsRef.current);
        updateCachedBalance(userCoinsRef.current);
      }

      toast.success(`Sent ${count}x ${gift.name}!`);
    } catch (error) {
      console.error('Gift error:', error);
      recordClientError({ label: "Reels.beansEarned", message: error instanceof Error ? error.message : String(error) });
      userCoinsRef.current = previousCoins;
      setUserCoins(previousCoins);
      updateCachedBalance(previousCoins);
      const msg = error instanceof Error ? error.message : 'Failed to send gift';
      toast.error(msg);
    }
  };

  const currentReel = reels[currentIndex];

  return (
    <div data-page="reels" className="fixed inset-0 bg-[#05050d] flex flex-col overflow-hidden">
      {/* Header — Premium Midnight Indigo */}
      <div className="fixed top-0 left-0 right-0 z-50 safe-area-top pointer-events-none">
        <div className="px-4 pt-3 pb-12 flex items-center justify-between bg-gradient-to-b from-[#0a0a1a]/85 via-[#0a0a1a]/30 to-transparent">
          <motion.h1
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="pointer-events-auto text-[16px] font-semibold tracking-[-0.01em] text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)]"
          >
            Reels
          </motion.h1>

          {currentUserId && (
            <motion.button
              onPointerDown={() => loadReelUploadModal().catch(() => {})}
              onTouchStart={() => loadReelUploadModal().catch(() => {})}
              onClick={() => setShowUploadModal(true)}
              aria-label="Upload reel"
              whileTap={{ scale: 0.88 }}
              className="pointer-events-auto w-8 h-8 rounded-full flex items-center justify-center text-white bg-white/10 backdrop-blur-md ring-1 ring-white/15"
            >
              <Plus className="w-[16px] h-[16px]" strokeWidth={2.4} />
            </motion.button>
          )}
        </div>
      </div>

      {/* Campaign Banner */}
      
      
      {/* Reels Container - Full Screen with native scroll */}
      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="h-full w-full relative bg-black" aria-busy="true">
            {/* Side action buttons skeleton */}
            <div className="absolute right-3 bottom-24 flex flex-col gap-5 items-center">
              <SkeletonPrim className="w-10 h-10 rounded-full" />
              <SkeletonPrim className="w-10 h-10 rounded-full" />
              <SkeletonPrim className="w-10 h-10 rounded-full" />
              <SkeletonPrim className="w-10 h-10 rounded-full" />
            </div>
            {/* Bottom info skeleton */}
            <div className="absolute left-4 bottom-20 flex items-center gap-3">
              <SkeletonPrim className="w-10 h-10 rounded-full" />
              <div className="space-y-2">
                <SkeletonPrim className="h-4 w-32" />
                <SkeletonPrim className="h-3 w-24" />
              </div>
            </div>
          </div>
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
                {/* Video — Pkg427: when native ExoPlayer is active, render
                    a transparent tap-target instead of <video> so the
                    SurfaceView beneath the (transparent) WebView shows
                    through. Web / iOS / flag-OFF fallback keeps <video>. */}
                {nativeReels.active ? (
                  <div
                    className="absolute inset-0 w-full h-full"
                    style={{ background: 'transparent' }}
                    onClick={handleVideoTap}
                  />
                ) : (
                  <video
                    ref={el => {
                      videoRefs.current[currentReel.id] = el;
                      if (el) hardenVideoElementForNative(el, { muted: isMuted });
                    }}
                    src={currentReel.video_url}
                    poster={currentReel.thumbnail_url || undefined}
                    preload="auto"
                    className="w-full h-full object-cover"
                    loop
                    playsInline
                    autoPlay
                    muted={isMuted}
                    onClick={handleVideoTap}
                  />
                )}



                {/* Play/Pause Overlay — cinematic indigo glow */}
                <AnimatePresence>
                  {!isPlaying && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.4 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.4 }}
                      transition={{ type: 'spring', stiffness: 320, damping: 22 }}
                      className="absolute inset-0 flex items-center justify-center pointer-events-none"
                    >
                      <div className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-500/35 to-[#0a0a1a]/70 backdrop-blur-xl flex items-center justify-center ring-1 ring-white/20 shadow-[0_0_60px_rgba(79,70,229,0.55),inset_0_2px_0_rgba(255,255,255,0.18)]">
                        <Play className="w-11 h-11 text-white ml-1.5 drop-shadow-[0_2px_8px_rgba(79,70,229,0.9)]" fill="white" />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Right Side Actions — Minimal Pro (TikTok/IG style) */}
                <div className="absolute right-2 flex flex-col items-center gap-5" style={{ bottom: 'calc(var(--bottom-nav-height, 56px) + 72px)' }}>
                  {/* Like */}
                  <motion.button
                    onClick={() => handleLike(currentReel.id)}
                    className="flex flex-col items-center gap-1"
                    whileTap={{ scale: 0.85 }}
                  >
                    <motion.div
                      animate={currentReel.is_liked ? { scale: [1, 1.35, 1] } : {}}
                      transition={{ duration: 0.3, ease: 'easeOut' }}
                      className="flex items-center justify-center"
                    >
                      <Heart
                        className={cn(
                          "w-[30px] h-[30px] drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)]",
                          currentReel.is_liked ? "text-rose-500 fill-rose-500" : "text-white"
                        )}
                        strokeWidth={1.8}
                      />
                    </motion.div>
                    <span className="text-white text-[11px] font-semibold tabular-nums drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]">
                      {formatCount(currentReel.like_count)}
                    </span>
                  </motion.button>

                  {/* Comment */}
                  <motion.button
                    onClick={() => openComments(currentReel.id)}
                    className="flex flex-col items-center gap-1"
                    whileTap={{ scale: 0.85 }}
                  >
                    <MessageCircle className="w-[30px] h-[30px] text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)]" strokeWidth={1.8} />
                    <span className="text-white text-[11px] font-semibold tabular-nums drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]">
                      {formatCount(currentReel.comment_count)}
                    </span>
                  </motion.button>

                  {/* Gift */}
                  {currentReel.user_id !== currentUserId && (
                    <motion.button
                      onClick={() => setShowGiftPanel(true)}
                      className="flex flex-col items-center gap-1"
                      whileTap={{ scale: 0.85 }}
                    >
                      <Gift className="w-[30px] h-[30px] text-amber-300 drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)]" strokeWidth={1.8} />
                      <span className="text-white text-[11px] font-semibold drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]">Gift</span>
                    </motion.button>
                  )}

                  {/* Share */}
                  <motion.button
                    onClick={() => handleShare(currentReel.id)}
                    className="flex flex-col items-center gap-1"
                    whileTap={{ scale: 0.85 }}
                  >
                    <Share2 className="w-[28px] h-[28px] text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)]" strokeWidth={1.8} />
                    <span className="text-white text-[11px] font-semibold tabular-nums drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]">
                      {formatCount(currentReel.share_count)}
                    </span>
                  </motion.button>

                  {/* More */}
                  <motion.button
                    onClick={() => setShowSettings(true)}
                    whileTap={{ scale: 0.85 }}
                    aria-label="More options"
                    className="flex items-center justify-center"
                  >
                    <MoreVertical className="w-[24px] h-[24px] text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)]" strokeWidth={2} />
                  </motion.button>

                  {/* Mute */}
                  <motion.button
                    onClick={toggleMute}
                    whileTap={{ scale: 0.85 }}
                    aria-label={isMuted ? 'Unmute' : 'Mute'}
                    className="flex items-center justify-center"
                  >
                    {isMuted ? (
                      <VolumeX className="w-[20px] h-[20px] text-white/85 drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)]" strokeWidth={2} />
                    ) : (
                      <Volume2 className="w-[20px] h-[20px] text-white/85 drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)]" strokeWidth={2} />
                    )}
                  </motion.button>

                  {/* Spinning Music Disc — compact */}
                  <div className="relative w-[34px] h-[34px] rounded-full bg-gradient-to-br from-[#1e1e5a] via-[#141432] to-[#0a0a1a] flex items-center justify-center animate-spin shadow-[0_2px_8px_rgba(0,0,0,0.6)]" style={{ animationDuration: '5s' }}>
                    <div className="w-[10px] h-[10px] rounded-full bg-gradient-to-br from-indigo-300 to-fuchsia-500 ring-1 ring-white/30" />
                  </div>
                </div>

                {/* Beans Earned Badge — Indigo→Gold premium */}
                {(currentReel.beans_earned || 0) > 0 && (
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                    className="absolute top-14 left-3 flex items-center gap-1 rounded-full px-2 py-0.5 backdrop-blur-md bg-black/40 ring-1 ring-amber-300/30"
                  >
                    <Coins className="w-3 h-3 text-amber-300" />
                    <span className="text-white text-[10.5px] font-semibold tracking-wide">{formatCount(currentReel.beans_earned || 0)}</span>
                  </motion.div>
                )}

                {/* Bottom Info — Edge-to-edge Midnight Indigo gradient fade */}
                <div className="absolute left-0 right-0 pointer-events-none" style={{ bottom: 'var(--bottom-nav-height, 56px)' }}>
                  <div className="pt-28 pb-5 px-4 bg-gradient-to-t from-[#05050d]/95 via-[#0a0a1a]/70 via-30% to-transparent">
                    <motion.div
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                      className="pointer-events-auto mr-20"
                    >
                      {/* Username row */}
                      <div className="flex items-center gap-2 mb-2.5">
                        <button
                          onClick={() => navigate(`/profile/${currentReel.user_id}`)}
                          className="relative w-[36px] h-[36px] rounded-full overflow-hidden flex-shrink-0 active:scale-95 transition-transform
                                     ring-2 ring-indigo-400/70 shadow-[0_0_16px_rgba(79,70,229,0.55),0_2px_8px_rgba(0,0,0,0.6)]"
                          aria-label="View profile"
                        >
                          <FramedAvatarWithPrivileges
                            userId={currentReel.user_id}
                            src={currentReel.user?.avatar_url || ''}
                            name={currentReel.user?.display_name || currentReel.user?.app_uid || 'User'}
                            level={getRequiredDisplayLevel(currentReel.user)}
                            size="sm"
                          />
                        </button>
                        <button
                          onClick={() => navigate(`/profile/${currentReel.user_id}`)}
                          className="text-white font-extrabold text-[15.5px] tracking-[-0.015em] drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)] active:opacity-70"
                        >
                          @{currentReel.user?.display_name || 'User'}
                        </button>
                        {!currentReel.is_following && currentReel.user_id !== currentUserId && (
                          <motion.button
                            onClick={() => handleFollow(currentReel.user_id)}
                            aria-label="Follow"
                            whileTap={{ scale: 0.9 }}
                            className="ml-1 px-2 py-[3px] rounded-full text-[10px] font-semibold tracking-wide text-white bg-white/10 backdrop-blur-md ring-1 ring-white/20"
                          >
                            Follow
                          </motion.button>
                        )}
                        {currentReel.user?.is_verified && (
                          <div className="w-[16px] h-[16px] rounded-full bg-gradient-to-br from-sky-400 to-indigo-600 flex items-center justify-center shadow-[0_0_8px_rgba(79,70,229,0.7)]">
                            <span className="text-white text-[9px] font-black leading-none">✓</span>
                          </div>
                        )}
                        <LevelBadge level={getRequiredDisplayLevel(currentReel.user)} size="sm" />
                      </div>

                      {/* Caption */}
                      {currentReel.caption && (
                        <p className="text-white/95 text-[13.5px] mb-3 line-clamp-2 drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)] leading-snug font-medium">
                          {currentReel.caption}
                        </p>
                      )}

                      {/* Music Ticker — premium glass capsule */}
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
                        className="flex items-center gap-2 max-w-full overflow-hidden bg-white/[0.06] backdrop-blur-md rounded-full pl-2 pr-3 py-1 ring-1 ring-white/10"
                      >
                        <Music2 className="w-[13px] h-[13px] text-indigo-300 flex-shrink-0" />
                        <div className="overflow-hidden flex-1">
                          <motion.span
                            className="text-white/95 text-[11.5px] font-semibold whitespace-nowrap inline-block"
                            animate={{ x: [0, -140, 0] }}
                            transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
                          >
                            {currentReel.sound_title || currentReel.music_title || 'Original Sound'}
                            {' · '}
                            {currentReel.sound_artist || currentReel.music_artist || currentReel.user?.display_name || 'Unknown'}
                          </motion.span>
                        </div>
                        {isHost && (
                          <span className="text-white text-[9.5px] font-bold whitespace-nowrap flex-shrink-0 bg-gradient-to-r from-indigo-500 to-indigo-700 px-1.5 py-0.5 rounded ring-1 ring-indigo-300/40">Use</span>
                        )}
                      </button>
                    </motion.div>
                  </div>
                </div>


                {/* Navigation arrows removed - swipe only */}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
        )}
      </div>

      {/* Comments Sheet — premium dark glass to match Reels theme */}
      <Sheet open={showComments} onOpenChange={setShowComments}>
        <SheetContent
          side="bottom"
          className="h-[78vh] p-0 border-t border-white/10 rounded-t-3xl bg-gradient-to-b from-[#0F1320] via-[#0B0F19] to-[#070A12] shadow-[0_-20px_60px_rgba(0,0,0,0.7)] text-white [&>button]:hidden flex flex-col"
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-1 shrink-0">
            <div className="h-1.5 w-12 rounded-full bg-white/20" />
          </div>

          {/* Header */}
          <SheetHeader className="px-5 pt-2 pb-3 shrink-0">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-white text-base font-semibold flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-white/70" />
                <span>{currentReel?.comment_count || 0}</span>
                <span className="text-white/60 font-normal">
                  {(currentReel?.comment_count || 0) === 1 ? 'Comment' : 'Comments'}
                </span>
              </SheetTitle>
              <button
                onClick={() => setShowComments(false)}
                className="h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 transition flex items-center justify-center"
                aria-label="Close"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
          </SheetHeader>

          <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent shrink-0" />

          {/* List */}
          <ScrollArea ref={reelsCommentsScroll.scrollRef} className="flex-1 min-h-0 chat-scroll-stable" style={{ paddingBottom: 'calc(var(--kb-h, 0px) + 0.75rem)' }}>
            {comments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-4">
                  <MessageCircle className="w-7 h-7 text-white/40" />
                </div>
                <p className="text-white font-medium">No comments yet</p>
                <p className="text-white/50 text-sm mt-1">Be the first to share your thoughts</p>
              </div>
            ) : (
              <div className="px-4 py-3 space-y-1">
                <AnimatePresence initial={false}>
                  {comments.map((comment) => (
                    <motion.div
                      key={comment.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.22, ease: 'easeOut' }}
                      className="flex gap-3 px-2 py-3 rounded-2xl hover:bg-white/[0.03] transition"
                    >
                      <Avatar className="w-9 h-9 ring-2 ring-white/10 shrink-0">
                        <AvatarImage src={comment.user?.avatar_url || ''} />
                        <AvatarFallback className="bg-gradient-to-br from-purple-500 to-pink-500 text-white text-xs font-semibold">
                          {comment.user?.display_name?.[0]?.toUpperCase() || 'U'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-white truncate max-w-[140px]">
                            {comment.user?.display_name || 'User'}
                          </span>
                          {comment.user ? (
                            <LevelBadge level={getRequiredDisplayLevel(comment.user)} size="xs" />
                          ) : null}
                          <span className="text-[11px] text-white/40">
                            {formatRelativeTime(comment.created_at)}
                          </span>
                        </div>
                        <p className="text-sm text-white/85 mt-0.5 leading-snug break-words whitespace-pre-wrap">
                          {comment.content}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                <div className="h-2" />
              </div>
            )}
          </ScrollArea>

          {/* Input */}
          <div
            className="shrink-0 border-t border-white/10 bg-[#0B0F19]/95 backdrop-blur-xl px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] chat-composer-stable"
            style={{ transform: 'translate3d(0, calc(var(--kb-h, 0px) * -1), 0)' }}
          >
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <Input
                  placeholder="Add a comment..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !(e.nativeEvent as KeyboardEvent).isComposing) sendComment();
                  }}
                  maxLength={500}
                  className="h-11 rounded-full bg-white/[0.06] border-white/10 text-white placeholder:text-white/40 focus-visible:ring-2 focus-visible:ring-pink-500/40 focus-visible:border-pink-400/40 px-4"
                />
              </div>
              <Button
                onClick={sendComment}
                disabled={!newComment.trim() || sendingComment}
                size="icon"
                className="h-11 w-11 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 hover:from-pink-500 hover:to-purple-700 disabled:opacity-40 disabled:from-white/10 disabled:to-white/10 shadow-[0_4px_18px_rgba(236,72,153,0.35)] active:scale-95 transition"
              >
                <Send className="w-4 h-4 text-white" />
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>


      {/* Upload Modal */}
      {showUploadModal && (
        <Suspense fallback={null}>
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
        </Suspense>
      )}

      {/* Gift Panel */}
      {showGiftPanel && (
        <Suspense fallback={null}>
          <GiftPanel
            isOpen={showGiftPanel}
            onClose={() => setShowGiftPanel(false)}
            onSendGift={handleSendGift}
            userDiamonds={userDiamonds}
          />
        </Suspense>
      )}

      {/* Flying Gift Animations */}
      <AnimatePresence>
        {flyingGifts.map((gift, idx) => (
          <FlyingGiftAnimation 
            key={gift.id}
            gift={gift} 
            stackIndex={idx}
            onComplete={() => removeGift(gift.id)}
          />
        ))}
      </AnimatePresence>

      {/* Settings / More Options Sheet */}
      <Sheet open={showSettings} onOpenChange={setShowSettings}>
        <SheetContent
          side="bottom"
          className="rounded-t-3xl border-t border-white/10 !bg-none bg-[#0B0F19] p-0 max-h-[85vh] shadow-[0_-12px_40px_rgba(0,0,0,0.6)] [background-image:none]"
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
                              const { error } = await supabase.from("reel_reports").insert({
                                user_id: currentUserId,
                                reel_id: currentReel.id,
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
