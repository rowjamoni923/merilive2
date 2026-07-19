import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { PageSkeleton } from "@/components/common/PageSkeleton";

import { ArrowLeft, Check, Gift, Clock, Radio, Users, MessageCircle, Star, Sparkles, Flame, Trophy, Upload, ExternalLink, CheckCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { getCachedUser } from "@/utils/cachedAuth";
import { getTaskDate, getMsUntilNextReset } from "@/utils/taskDateUtils";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Skeleton as SkeletonPrim } from "@/components/Skeleton";
import { updateCachedBalance } from "@/hooks/useUserBalance";
import { subscribeToTables } from "@/hooks/useUniversalRealtime";
import { PLAY_STORE_URL } from "@/utils/shareLinks";
import { recordClientError } from "@/utils/clientErrorLog";
import { usePersistedCache } from "@/hooks/usePersistedCache";
import NewHostBonusCard from "@/components/live/NewHostBonusCard";

interface DailyTask {
  id: string;
  title: string;
  description: string;
  requirement_type: string;
  requirement_value: number;
  reward_beans: number;
  reward_diamonds: number;
  icon_name: string;
  icon_color: string;
}

interface TaskProgress {
  task_id: string;
  current_progress: number;
  is_completed: boolean;
  is_claimed: boolean;
}

interface NewHostBonusSettings {
  beans_per_hour: number;
  max_hours_per_day: number;
  eligible_days: number;
  is_active: boolean;
}

interface NewHostBonusProgress {
  hours_completed: number;
  beans_earned: number;
  day_number: number;
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  video: Radio,
  clock: Clock,
  users: Users,
  gift: Gift,
  'message-circle': MessageCircle,
  star: Star,
};

// Navigation routes for each task type
const taskNavigationMap: Record<string, string> = {
  first_live: '/go-live',
  live_minutes: '/go-live',
  viewers: '/go-live',
  first_gift: '/go-live',
  messages_sent: '/chat',
  // NEW — Do It routes for the previously broken types
  followers: '/discover',     // grow follower count from discover/profile pages
  watch_live: '/',            // homepage live tiles
  send_gift: '/',             // homepage → tap any live → send gift
  // share_app handled specially (native share / Play Store link), no navigation
  play_store_rating: 'play_store',
};

/**
 * Trigger native share / clipboard fallback for the Share App task and
 * report the tap to the server (idempotent — 1 credit per day).
 */
const handleShareAppTask = async () => {
  const shareUrl = PLAY_STORE_URL;
  const shareText = "Join me on MeriLive — live streams, parties & rewards!";
  let shared = false;

  try {
    if (typeof navigator !== 'undefined' && (navigator as any).share) {
      await (navigator as any).share({
        title: 'MeriLive',
        text: shareText,
        url: shareUrl,
      });
      shared = true;
    } else if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
      toast.success('Link copied — share it with a friend!');
      shared = true;
    } else {
      window.open(shareUrl, '_blank');
      shared = true;
    }
  } catch (err: any) {
    // User cancelled share sheet → don't credit
    if (err?.name === 'AbortError') return;
    console.warn('[Tasks] share error:', err);
  }

  if (shared) {
    try {
      await supabase.rpc('update_task_progress', {
        _task_type: 'share_app',
        _value: null,
        _increment: 1,
      });
    } catch (e) {
      console.warn('[Tasks] share progress update failed:', e);
    }
  }
};


const Tasks = () => {
  const navigate = useNavigate();
  const [tasksCache, setTasksCache, hadTasksCache] = usePersistedCache<DailyTask[]>("tasks:list", []);
  const [progressCache, setProgressCache, hadProgressCache] = usePersistedCache<Record<string, TaskProgress>>("tasks:progress", {});
  const tasks = tasksCache ?? [];
  const progress = progressCache ?? {};
  const setTasks = (next: DailyTask[]) => setTasksCache(next);
  const setProgress = (next: Record<string, TaskProgress> | ((p: Record<string, TaskProgress>) => Record<string, TaskProgress>)) =>
    setProgressCache((prev) => (typeof next === 'function' ? (next as any)(prev ?? {}) : next));
  const [loading, setLoading] = useState(!(hadTasksCache && hadProgressCache));
  const [isHost, setIsHost] = useState<boolean>(false);
  const [isCurrentlyLive, setIsCurrentlyLive] = useState<boolean>(false);
  const [claimingTask, setClaimingTask] = useState<string | null>(null);
  const [showReward, setShowReward] = useState<{ beans: number; diamonds: number } | null>(null);
  
  // Rating task states
  const [showRatingUpload, setShowRatingUpload] = useState(false);
  const [ratingUploading, setRatingUploading] = useState(false);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [ratingAlreadyClaimed, setRatingAlreadyClaimed] = useState(false);
  const [ratingTaskHidden, setRatingTaskHidden] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  
  // New Host Bonus states
  const [bonusSettings, setBonusSettings] = useState<NewHostBonusSettings | null>(null);
  const [bonusProgress, setBonusProgress] = useState<NewHostBonusProgress | null>(null);
  const [isEligibleForBonus, setIsEligibleForBonus] = useState(false);
  const [bonusDaysRemaining, setBonusDaysRemaining] = useState(0);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        // Check if user is a host (use cached auth for speed)
        const user = await getCachedUser();
        if (!user) { setLoading(false); return; }
        
        const { data: profile } = await supabase
          .from('profiles')
          .select('is_host')
          .eq('id', user.id)
          .single();
        
        const hostStatus = !!(profile as any)?.is_host;
        setIsHost(hostStatus);

        // Check if user already claimed rating reward
        const { data: ratingClaims, error: ratingClaimsError } = await supabase
          .from('rating_reward_claims')
          .select('id, status')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1);

        if (ratingClaimsError) {
          console.error('Failed to check rating claim status:', ratingClaimsError);
          recordClientError({ label: "Tasks.hostStatus", message: ratingClaimsError instanceof Error ? ratingClaimsError.message : String(ratingClaimsError) });
        } else if ((ratingClaims?.length ?? 0) > 0) {
          const claimStatus = ratingClaims![0].status;
          // Any existing claim (pending/approved/rejected) = hide task permanently
          setRatingAlreadyClaimed(true);
          setRatingTaskHidden(true);
        }

        // Check if host is currently live
        if (hostStatus) {
          const { data: activeStream } = await supabase
            .from('live_streams')
            .select('id')
            .eq('host_id', user.id)
            .eq('is_active', true)
            .maybeSingle();
          setIsCurrentlyLive(!!activeStream);
        }
        
        let eligible = false;
        if (hostStatus) {
          eligible = await fetchNewHostBonus();
        }
        await fetchTasks(eligible, hostStatus);
      } catch (error) {
        console.error('[Tasks] Init error:', error);
        recordClientError({ label: "Tasks.claimStatus", message: error instanceof Error ? error.message : String(error) });
        setLoading(false);
      }
    };
    init();
    
    // Real-time subscription using universal system (no extra channels)
    const subscriberId = `tasks-page-${Date.now()}`;
    const unsubscribe = subscribeToTables(
      subscriberId,
      ['notifications'],
      () => {
        fetchTasks();
      }
    );

    // No-auto-refresh: task mutations refresh inline; no visibility refetch.



    // Auto-refresh at 12:30 AM local time when tasks reset
    const msUntilReset = getMsUntilNextReset();
    const resetTimer = setTimeout(() => {
      console.log('[Tasks] Task day reset - refreshing');
      setProgress({});
      fetchTasks();
    }, msUntilReset);

    return () => {
      unsubscribe();
      clearTimeout(resetTimer);
    };
  // eslint-disable-next-line

  }, []);

  const fetchNewHostBonus = async (): Promise<boolean> => {
    try {
      const user = await getCachedUser();
      if (!user) return false;
      setCurrentUserId(user.id);

      // Fetch settings
      const { data: settings } = await supabase
        .from('new_host_live_bonus_settings' as any)
        .select('*')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (!settings) return false;
      setBonusSettings(settings as any);

      // Check if user is eligible (verified host within eligible days)
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_host, is_face_verified, created_at')
        .eq('id', user.id)
        .single();

      if (!(profile as any)?.is_host || !(profile as any)?.is_face_verified) return false;

      const verifiedAt = new Date((profile as any).created_at);
      const daysSince = Math.floor((Date.now() - verifiedAt.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysSince >= (settings as any).eligible_days) return false;

      setIsEligibleForBonus(true);
      setBonusDaysRemaining((settings as any).eligible_days - daysSince);

      // Fetch today's progress
      const today = getTaskDate();
      const { data: progressData } = await supabase
        .from('new_host_live_bonus_progress' as any)
        .select('*')
        .eq('user_id', user.id)
        .eq('bonus_date', today)
        .maybeSingle();

      if (progressData) {
        setBonusProgress(progressData as any);
      } else {
        setBonusProgress({ hours_completed: 0, beans_earned: 0, day_number: daysSince + 1 });
      }
      return true;
    } catch (error) {
      console.error('Error fetching new host bonus:', error);
      recordClientError({ label: "Tasks.today", message: error instanceof Error ? error.message : String(error) });
      return false;
    }
  };

  const fetchTasks = async (eligible?: boolean, hostStatus?: boolean) => {
    try {
      const user = await getCachedUser();
      
      // Fetch active tasks
      const { data: tasksData, error: tasksError } = await supabase
        .from('daily_tasks')
        .select('*')
        .eq('is_active', true)
        .order('display_order');

      if (tasksError) throw tasksError;
      
      const currentIsHost = hostStatus ?? isHost;
      const isHostEligible = eligible ?? isEligibleForBonus;
      
      // Filter tasks by target_audience and eligibility
      const filteredTasks = (tasksData || []).filter((task: any) => {
        const audience = task.target_audience || 'all';
        
        // Filter by audience type
        if (audience === 'host' && !currentIsHost) return false;
        if (audience === 'user' && currentIsHost) return false;
        
        // Hourly live tasks only for eligible new hosts
        if (task.requirement_type === 'live_minutes' && task.requirement_value >= 60) {
          return isHostEligible;
        }
        return true;
      });
      setTasks(filteredTasks);

      // Fetch user progress if logged in
      if (user) {
        // Server-authoritative sync: ask the RPC to recompute progress for every
        // requirement_type currently shown (from real activity rows). Fires in
        // parallel; failures of any one type are non-fatal.
        const types = Array.from(
          new Set(
            filteredTasks
              .map((t: any) => t.requirement_type)
              .filter((rt: string) =>
                [
                  'first_live','live_minutes','viewers','first_gift','messages_sent',
                  'followers','watch_live','send_gift','share_app',
                ].includes(rt)
              )
          )
        );
        await Promise.allSettled(
          types.map((rt) =>
            supabase.rpc('update_task_progress', {
              _task_type: rt,
              _value: null,
              _increment: null,
            })
          )
        );

        const today = getTaskDate();
        const { data: progressData, error: progressError } = await supabase
          .from('user_task_progress')
          .select('*')
          .eq('user_id', user.id)
          .eq('reset_date', today);

        if (!progressError && progressData) {
          const progressMap: Record<string, TaskProgress> = {};
          progressData.forEach((p: any) => {
            progressMap[p.task_id] = {
              task_id: p.task_id,
              current_progress: p.current_progress ?? p.current_count ?? 0,
              is_completed: p.is_completed ?? false,
              is_claimed: p.is_claimed ?? p.reward_claimed ?? false,
            };
          });
          setProgress(progressMap);
        }
      }

    } catch (error) {
      console.error('Error fetching tasks:', error);
      recordClientError({ label: "Tasks.progressMap", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setLoading(false);
    }
  };

  const claimReward = async (task: DailyTask) => {
    try {
      setClaimingTask(task.id);
      const user = await getCachedUser();

      if (!user) {
        toast.error("Please login to claim rewards");
        return;
      }

      const taskProgress = progress[task.id];
      if (!taskProgress?.is_completed || taskProgress?.is_claimed) {
        return;
      }

      // Task was completed while live — no need to still be live to claim

      // Atomic server-side claim (race-safe)
      const { data: result, error: claimError } = await supabase.rpc('claim_task_reward', {
        _user_id: user.id,
        _task_id: task.id,
      });

      if (claimError || !(result as any)?.success) {
        const errMsg = (result as any)?.error || claimError?.message || 'Failed to claim reward';
        toast.error(errMsg);
        return;
      }

      const earnedBeans = Number((result as any)?.beans ?? task.reward_beans ?? 0);
      const earnedCoins = Number((result as any)?.diamonds ?? task.reward_diamonds ?? 0);

      // Force balance refresh on next balance check
      updateCachedBalance(0);

      // Show reward animation
      setShowReward({ beans: earnedBeans, diamonds: earnedCoins });
      setTimeout(() => setShowReward(null), 3000);

      // Update local state immediately
      setProgress(prev => ({
        ...prev,
        [task.id]: { ...prev[task.id], is_claimed: true }
      }));

      toast.success(`🎉 Reward claimed! +${earnedBeans} Beans, +${earnedCoins} Diamonds`);
    } catch (error) {
      console.error('Error claiming reward:', error);
      recordClientError({ label: "Tasks.earnedCoins", message: error instanceof Error ? error.message : String(error) });
      toast.error("Failed to claim reward");
    } finally {
      setClaimingTask(null);
    }
  };

  const getTaskStatus = (task: DailyTask) => {
    const taskProgress = progress[task.id];
    if (!taskProgress) return 'pending';
    if (taskProgress.is_claimed) return 'claimed';
    if (taskProgress.is_completed) return 'completed';
    return 'in_progress';
  };

  const getProgressPercentage = (task: DailyTask) => {
    const taskProgress = progress[task.id];
    if (!taskProgress) return 0;
    return Math.min((taskProgress.current_progress / task.requirement_value) * 100, 100);
  };

  // Handle rating screenshot upload
  const handleRatingFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    setRatingUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const ext = file.name.split('.').pop() || 'png';
      const path = `${user.id}/rating_${Date.now()}.${ext}`;
      
      const { error: uploadError } = await supabase.storage
        .from('rating-screenshots')
        .upload(path, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('rating-screenshots')
        .getPublicUrl(path);

      const { error: claimError } = await supabase
        .from('rating_reward_claims')
        .insert({
          user_id: user.id,
          screenshot_url: urlData.publicUrl,
        });

      if (claimError) {
        if (claimError.code === '23505') {
          toast.error('You have already submitted a rating claim');
        } else {
          throw claimError;
        }
        return;
      }

      // Instantly cache "already claimed" so the home rating banner never
      // pops up again for this user on this device — no wait for the next
      // DB roundtrip. Matches FullScreenPromoBanners.ratingClaimedCacheKey.
      try { localStorage.setItem(`rating_reward_claimed_v1_${user.id}`, "true"); } catch { /* ignore */ }

      setRatingSubmitted(true);
      setRatingAlreadyClaimed(true);
      toast.success('Screenshot submitted! Reward will be credited after admin approval.');
    } catch (err: any) {
      console.error('Rating upload error:', err);
      recordClientError({ label: "Tasks.path", message: err instanceof Error ? err.message : String(err) });
      toast.error('Failed to upload screenshot');
    } finally {
      setRatingUploading(false);
    }
  }, []);

  // Handle rating task button actions
  const handleRatingTaskAction = async (action: 'do_it' | 'claim') => {
    if (action === 'do_it') {
      try {
        const { openInApp } = await import('@/utils/inAppNavigation');
        await openInApp(PLAY_STORE_URL);
      } catch {
        window.location.href = PLAY_STORE_URL;
      }
    } else {
      setRatingSubmitted(false);
      setShowRatingUpload(true);
    }
  };

  if (loading) {
    return <PageSkeleton className="fixed inset-0 flex flex-col bg-background overflow-hidden" rows={6} hero />;
  }



  // Note: totalDailyBonus removed — per-hour tier visualization moved into <NewHostBonusCard /> which reads server state directly.

  return (
    <div data-page="tasks" className="fixed inset-0 flex flex-col bg-gradient-to-br from-[#FFFBF2] via-[#FAF5EA] to-[#F5EFDF] overflow-y-auto overflow-x-hidden">
      {/* Reward Animation Overlay */}
      <AnimatePresence>
        {showReward && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-white/90"
          >
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0, rotate: 180 }}
              className="bg-gradient-to-br from-amber-400 to-orange-500 p-8 rounded-3xl shadow-2xl text-center"
            >
              <Sparkles className="w-16 h-16 text-slate-800 mx-auto mb-4 animate-pulse" />
              <h2 className="text-2xl font-bold text-slate-800 mb-4">🎉 Congratulations!</h2>
              <div className="flex gap-6 justify-center">
                <div className="bg-white/20 px-4 py-2 rounded-xl">
                  <p className="text-slate-800 text-sm">Beans</p>
                  <p className="text-2xl font-bold text-slate-800">+{showReward.beans}</p>
                </div>
                <div className="bg-white/20 px-4 py-2 rounded-xl">
                  <p className="text-slate-800 text-sm">Diamonds</p>
                  <p className="text-2xl font-bold text-slate-800">+{showReward.diamonds}</p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Premium Header */}
      <header
        className="flex-shrink-0 sticky top-0 z-40 bg-white/90 backdrop-blur-xl safe-area-top"
        style={{ boxShadow: '0 6px 18px -10px rgba(217,119,6,0.32), inset 0 -1px 0 rgba(217,182,107,0.4)' }}
      >
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => navigate(-1)}
            className="h-9 w-9 rounded-full bg-white flex items-center justify-center transition-all hover:-translate-y-0.5 active:translate-y-0"
            style={{ boxShadow: '0 4px 12px -4px rgba(146,64,14,0.25), inset 0 1px 0 rgba(255,255,255,0.95), 0 0 0 1px rgba(217,182,107,0.45)' }}
          >
            <ArrowLeft className="w-5 h-5 text-slate-700" />
          </button>
          <div className="flex items-center gap-2.5">
            <div
              className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center"
              style={{ boxShadow: '0 10px 20px -8px rgba(245,158,11,0.55), inset 0 1px 0 rgba(255,255,255,0.4), inset 0 -2px 0 rgba(146,64,14,0.2)' }}
            >
              <Star className="w-5 h-5 text-white" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.25))' }} />
            </div>
            <div>
              <h1 className="text-slate-900 font-bold text-base leading-tight tracking-tight">Task Center</h1>
              <p className="text-slate-500 text-[10px]">Complete daily tasks, earn rewards</p>
            </div>
          </div>
        </div>
      </header>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'var(--content-bottom-padding)' }}>
      {/* Daily Tasks Summary Card */}
      <div className="p-4">
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="relative overflow-hidden rounded-2xl p-5 mb-6 text-white"
          style={{
            background: 'linear-gradient(135deg, #f59e0b 0%, #f97316 50%, #fbbf24 100%)',
            boxShadow: '0 16px 36px -10px rgba(245,158,11,0.55), inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -2px 0 rgba(146,64,14,0.25)'
          }}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_0%,rgba(255,255,255,0.35),transparent_55%)] pointer-events-none" />
          <div className="relative flex items-center justify-between mb-3">
            <div>
              <h2 className="text-lg font-bold tracking-tight" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.18)' }}>Today's Tasks</h2>
              <p className="text-sm text-white/95">
                {Object.values(progress).filter(p => p.is_claimed).length}/{tasks.length} Completed
              </p>
            </div>
            <div
              className="w-14 h-14 rounded-2xl bg-white/25 backdrop-blur-sm flex items-center justify-center"
              style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5), 0 6px 14px -6px rgba(0,0,0,0.25)' }}
            >
              <Gift className="w-7 h-7 text-white" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.25))' }} />
            </div>
          </div>
          <Progress
            value={(Object.values(progress).filter(p => p.is_claimed).length / Math.max(tasks.length, 1)) * 100}
            className="relative h-2 bg-white/30"
          />
        </motion.div>

        {/* ========== NEW HOST LIVE BONUS SECTION ========== */}
        {/* Per-hour tier claim card (uses server RPC get_host_live_bonus_state + claim_host_live_hour_bonus). */}
        {/* isStreamActive={false} → no minute-heartbeat from Tasks page; minutes only accumulate while host is actually live. */}
        {/* Card auto-hides if user is not an eligible verified host within the program window. */}
        {currentUserId && (
          <motion.div
            initial={{ y: -10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="mb-6 flex flex-col items-center"
          >
            <NewHostBonusCard
              hostId={currentUserId}
              isStreamActive={false}
              onBeansClaimed={() => updateCachedBalance(0)}
            />
            <div className="w-full max-w-[320px] mt-3 flex flex-col gap-2">
              <Button
                size="sm"
                onClick={() => navigate('/go-live')}
                className="w-full bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-xs h-9 rounded-xl shadow-lg shadow-fuchsia-500/30"
              >
                <Radio className="w-4 h-4 mr-1.5" />
                Go Live to Earn Bonus
              </Button>
              <button
                onClick={() => navigate('/host-bonus-ledger')}
                className="w-full text-[11px] text-purple-700/80 hover:text-purple-900 underline underline-offset-2"
              >
                View bonus ledger →
              </button>
            </div>
          </motion.div>
        )}

        {/* Task List */}
        <div className="space-y-3">
          {tasks.filter(t => !(ratingTaskHidden && t.requirement_type === 'play_store_rating')).map((task, index) => {
            const IconComponent = iconMap[task.icon_name] || Star;
            const status = getTaskStatus(task);
            const progressPercent = getProgressPercentage(task);

            return (
              <motion.div
                key={task.id}
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: index * 0.1 }}
                className="relative overflow-hidden rounded-2xl p-4 transition-all hover:-translate-y-0.5 active:translate-y-0"
                style={{
                    ? 'linear-gradient(135deg, rgba(16,185,129,0.10), rgba(34,197,94,0.06))'
                    : status === 'completed'
                      ? 'linear-gradient(135deg, #ffffff, rgba(254,243,199,0.95))'
                      : 'linear-gradient(135deg, #ffffff, rgba(255,251,240,0.95))',
                  border: status === 'claimed'
                    ? '1px solid rgba(34,197,94,0.45)'
                    : status === 'completed'
                      ? '1px solid rgba(245,158,11,0.55)'
                      : '1px solid rgba(217,182,107,0.4)',
                    ? '0 12px 28px -10px rgba(245,158,11,0.4), inset 0 1px 0 rgba(255,255,255,0.95)'
                    : '0 6px 18px -10px rgba(146,64,14,0.25), inset 0 1px 0 rgba(255,255,255,0.95)',
                }}
              >
                {status === 'completed' && (
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer pointer-events-none" />
                )}
                <div className="relative flex items-center gap-4">
                  {/* Icon */}
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                    style={{
                    }}
                  >
                    <IconComponent
                      className="w-6 h-6 text-white"
                      style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.25))' }}
                    />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-800">{task.title}</h3>
                    <p className="text-xs text-slate-500 mb-2">{task.description}</p>
                    
                    {/* Progress Bar - hide for rating task */}
                    {task.requirement_type !== 'play_store_rating' && (
                      <div className="flex items-center gap-2">
                        <Progress 
                          value={progressPercent} 
                          className="h-1.5 flex-1 bg-amber-100"
                        />
                        <span className="text-xs text-slate-500">
                          {task.requirement_type === 'live_minutes' 
                            ? `${progress[task.id]?.current_progress || 0} min / ${task.requirement_value} min`
                            : `${progress[task.id]?.current_progress || 0}/${task.requirement_value}`
                          }
                        </span>
                      </div>
                    )}

                    {/* Rewards */}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {task.requirement_type === 'play_store_rating' ? (
                        <>
                          <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg"
                            style={{
                              color: '#d97706',
                            }}
                          >
                            Hosts: 10,000 🫘 Beans
                          </span>
                          <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg"
                            style={{
                            }}
                          >
                            Users: 5,000 💎 Diamonds
                          </span>
                        </>
                      ) : (
                        <>
                          {task.reward_beans > 0 && (
                            <span className="text-xs bg-gradient-to-r from-amber-100 to-yellow-100 text-amber-800 px-2 py-0.5 rounded-full font-medium">
                              +{task.reward_beans} Beans
                            </span>
                          )}
                          {task.reward_diamonds > 0 && (
                            <span className="text-xs bg-gradient-to-r from-purple-100 to-pink-100 text-purple-800 px-2 py-0.5 rounded-full font-medium">
                              +{task.reward_diamonds} 💎 Diamonds
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Action Button */}
                  <div className="flex-shrink-0">
                    {task.requirement_type === 'play_store_rating' ? (
                      ratingAlreadyClaimed ? (
                      <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                        <Check className="w-5 h-5 text-green-700" />
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          <Button
                            size="sm"
                            className="text-white text-xs h-8 gap-1 rounded-lg font-bold border-0"
                            style={{
                            }}
                            onClick={() => handleRatingTaskAction('do_it')}
                          >
                            <ExternalLink className="w-3 h-3" /> Rate
                          </Button>
                          <Button
                            size="sm"
                            className="text-xs h-8 gap-1 rounded-lg font-bold border-0"
                            style={{
                            }}
                            onClick={() => handleRatingTaskAction('claim')}
                          >
                            <Upload className="w-3 h-3" /> Claim
                          </Button>
                        </div>
                      )
                    ) : status === 'claimed' ? (
                      <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                        <Check className="w-5 h-5 text-green-700" />
                      </div>
                    ) : status === 'completed' ? (
                      <Button
                        size="sm"
                        onClick={() => claimReward(task)}
                        disabled={claimingTask === task.id}
                        className="bg-gradient-to-r from-amber-400 to-orange-500 text-white shadow-lg animate-pulse"
                      >
                        {claimingTask === task.id ? '...' : 'Claim'}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-amber-300 text-amber-800 hover:bg-amber-50 active:bg-amber-100"
                        onClick={async () => {
                          // Share App is handled inline (native share / clipboard)
                          if (task.requirement_type === 'share_app') {
                            await handleShareAppTask();
                            // refresh progress so the bar/Claim button updates
                            fetchTasks();
                            return;
                          }
                          const route = taskNavigationMap[task.requirement_type];
                          if (route) {
                            navigate(route);
                          }
                        }}
                      >
                        Do It
                      </Button>

                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {tasks.length === 0 && !isEligibleForBonus && (
          <div className="text-center py-12">
            <Star className="w-16 h-16 text-amber-700 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-700">No Tasks Available</h3>
            <p className="text-sm text-slate-500">New tasks coming soon</p>
          </div>
        )}
      </div>
      </div>

      {/* Rating Screenshot Upload Dialog */}
      <Dialog open={showRatingUpload} onOpenChange={setShowRatingUpload}>
        <DialogContent
          className="max-w-sm mx-auto border-0 p-0 overflow-hidden"
          style={{
          }}
        >
          {!ratingSubmitted ? (
            <>
              <DialogHeader className="px-5 pt-5 pb-0">
                <DialogTitle className="text-slate-800 text-center text-base font-bold tracking-wide">
                  📸 Submit Rating Proof
                </DialogTitle>
              </DialogHeader>
              <div className="p-5 space-y-4">
                {/* Premium reward card */}
                <div className="rounded-2xl p-5 text-center relative overflow-hidden"
                  style={{
                  }}
                >
                  {/* Subtle glow */}
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-16 rounded-full opacity-20"
                    style={{ background: 'radial-gradient(ellipse, rgba(251,191,36,0.6), transparent)' }}
                  />
                  <div className="relative">
                    <div className="w-14 h-14 mx-auto mb-3 rounded-2xl flex items-center justify-center"
                      style={{
                      }}
                    >
                      <Gift className="w-7 h-7 text-amber-700" />
                    </div>
                    <p className="text-amber-800 font-bold text-lg tracking-wide">Claim Your Reward</p>
                    <div className="flex items-center justify-center gap-3 mt-3">
                      <span className="text-[11px] font-bold px-3 py-1.5 rounded-lg"
                        style={{
                        }}
                      >
                      </span>
                      <span className="text-purple-500/70 text-xs">•</span>
                      <span className="text-[11px] font-bold px-3 py-1.5 rounded-lg"
                        style={{
                        }}
                      >
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-slate-600 text-xs text-center leading-relaxed">
                    Take a screenshot of your 5-star rating on Play Store and upload it below
                  </p>
                  
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    onChange={handleRatingFileSelect}
                    className="hidden"
                  />

                  <Button
                    onClick={() => fileRef.current?.click()}
                    disabled={ratingUploading}
                    className="w-full h-12 gap-2 font-bold rounded-xl text-white border-0"
                    style={{
                        ? 'rgba(167,139,250,0.35)'
                        : 'linear-gradient(135deg, #7c3aed, #a855f7)',
                    }}
                  >
                    {ratingUploading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="w-5 h-5" />
                        Upload Screenshot
                      </>
                    )}
                  </Button>
                </div>

                <p className="text-slate-500/80 text-[10px] text-center">
                  Your reward will be credited after admin verification
                </p>
              </div>
            </>
          ) : (
            <div className="p-6 text-center space-y-4">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', damping: 10 }}
              >
                <div className="w-16 h-16 mx-auto rounded-full flex items-center justify-center"
                  style={{
                  }}
                >
                  <CheckCircle className="w-9 h-9 text-emerald-700" />
                </div>
              </motion.div>
              <div>
                <p className="text-slate-800 font-bold text-lg">Submitted Successfully! 🎉</p>
                <p className="text-slate-600 text-sm mt-2 leading-relaxed">
                  Your screenshot has been submitted for review. You'll receive your reward once approved by admin.
                </p>
              </div>
              <div className="flex items-center justify-center gap-2 text-amber-700/80 text-xs">
                <Clock className="w-3.5 h-3.5" />
                Usually reviewed within 24 hours
              </div>
              <Button
                onClick={() => setShowRatingUpload(false)}
                className="w-full h-10 rounded-xl text-white font-bold border-0"
                style={{
                }}
              >
                Got it!
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Tasks;