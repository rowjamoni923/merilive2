import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, Gift, Clock, Video, Users, MessageCircle, Star, Sparkles, Flame, Trophy, Upload, ExternalLink, CheckCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { getCachedUser } from "@/utils/cachedAuth";
import { getTaskDate, getMsUntilNextReset } from "@/utils/taskDateUtils";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { updateCachedBalance } from "@/hooks/useUserBalance";
import { subscribeToTables } from "@/hooks/useUniversalRealtime";
import { PLAY_STORE_URL } from "@/utils/shareLinks";
import { recordClientError } from "@/utils/clientErrorLog";

interface DailyTask {
  id: string;
  title: string;
  description: string;
  requirement_type: string;
  requirement_value: number;
  reward_beans: number;
  reward_coins: number;
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
  video: Video,
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
  play_store_rating: 'play_store',
};

const Tasks = () => {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [progress, setProgress] = useState<Record<string, TaskProgress>>({});
  const [loading, setLoading] = useState(true);
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
      ['notifications', 'profiles'],
      () => {
        fetchTasks();
      }
    );

    // Also subscribe to task-specific tables via direct channel for user_task_progress
    const tasksChannel = supabase
      .channel('tasks-progress-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_task_progress' }, () => {
        fetchTasks();
      })
      .subscribe();

    // Auto-refresh at 12:30 AM local time when tasks reset
    const msUntilReset = getMsUntilNextReset();
    const resetTimer = setTimeout(() => {
      console.log('[Tasks] Task day reset - refreshing');
      setProgress({});
      fetchTasks();
    }, msUntilReset);

    return () => {
      unsubscribe();
      supabase.removeChannel(tasksChannel);
      clearTimeout(resetTimer);
    };
  }, []);

  const fetchNewHostBonus = async (): Promise<boolean> => {
    try {
      const user = await getCachedUser();
      if (!user) return false;

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
      const earnedCoins = Number((result as any)?.coins ?? task.reward_coins ?? 0);

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
    return <LoadingSpinner fullScreen size="lg" text="Loading Tasks" />;
  }


  const totalDailyBonus = bonusSettings ? bonusSettings.beans_per_hour * bonusSettings.max_hours_per_day : 0;

  return (
    <div className="fixed inset-0 flex flex-col bg-background overflow-y-auto overflow-x-hidden">
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

      {/* Header */}
      <header className="flex-shrink-0 sticky top-0 z-40 bg-gradient-to-r from-amber-400 via-orange-400 to-yellow-400 text-white p-4 shadow-lg safe-area-top">
        <div className="flex items-center gap-3">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigate(-1)}
            className="text-slate-800 hover:bg-white/20"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <Star className="w-5 h-5 text-slate-800" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Task Center</h1>
              <p className="text-xs text-slate-600">Complete daily tasks, earn rewards</p>
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
          className="bg-gradient-to-r from-amber-500 via-orange-500 to-yellow-500 rounded-2xl p-5 shadow-xl text-white mb-6"
        >
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-lg font-bold">Today's Tasks</h2>
              <p className="text-sm text-slate-600">
                {Object.values(progress).filter(p => p.is_claimed).length}/{tasks.length} Completed
              </p>
            </div>
            <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center">
              <Gift className="w-7 h-7" />
            </div>
          </div>
          <Progress 
            value={(Object.values(progress).filter(p => p.is_claimed).length / Math.max(tasks.length, 1)) * 100} 
            className="h-2 bg-white/30"
          />
        </motion.div>

        {/* ========== NEW HOST LIVE BONUS SECTION ========== */}
        {isEligibleForBonus && bonusSettings && (
          <motion.div
            initial={{ y: -10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="mb-6 rounded-2xl overflow-hidden shadow-xl"
            style={{
              background: 'linear-gradient(135deg, #1a0533 0%, #2d1b69 50%, #1a0533 100%)',
              border: '1px solid rgba(168,85,247,0.3)',
            }}
          >
            {/* Header */}
            <div className="p-4 pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-fuchsia-500 to-purple-600 flex items-center justify-center shadow-lg shadow-fuchsia-500/30">
                    <Flame className="w-5 h-5 text-slate-800" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                      🔥 New Host Live Bonus
                      <span className="text-[9px] bg-gradient-to-r from-amber-400 to-orange-500 px-1.5 py-0.5 rounded-full font-bold">
                        LIMITED
                      </span>
                    </h3>
                    <p className="text-[11px] text-purple-300/70">
                      {bonusDaysRemaining} day{bonusDaysRemaining !== 1 ? 's' : ''} remaining
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-amber-400 font-bold text-lg">{bonusSettings.beans_per_hour.toLocaleString()}</p>
                  <p className="text-[10px] text-purple-300/60">beans/hour</p>
                </div>
              </div>
            </div>

            {/* Hourly Progress Slots */}
            <div className="px-4 pb-3">
              <div className="flex gap-1.5">
                {Array.from({ length: bonusSettings.max_hours_per_day }, (_, i) => {
                  const completed = (bonusProgress?.hours_completed || 0) > i;
                  return (
                    <div
                      key={i}
                      className={`flex-1 h-10 rounded-xl flex flex-col items-center justify-center ${
                        completed
                          ? 'bg-gradient-to-b from-fuchsia-500 to-purple-600 shadow-lg shadow-fuchsia-500/30'
                          : 'bg-white/5 border border-white/10'
                      }`}
                    >
                      {completed ? (
                        <Check className="w-4 h-4 text-slate-800" />
                      ) : (
                        <Clock className="w-3.5 h-3.5 text-slate-600" />
                      )}
                      <span className={`text-[8px] font-bold mt-0.5 ${completed ? 'text-slate-800' : 'text-slate-600'}`}>
                        {i + 1}h
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Summary */}
            <div className="mx-4 mb-4 p-3 rounded-xl bg-white/5 border border-white/10">
              {/* Stats row */}
              <div className="flex items-center justify-around mb-3">
                <div className="text-center">
                  <p className="text-amber-400 font-bold text-sm">{(bonusProgress?.beans_earned || 0).toLocaleString()}</p>
                  <p className="text-[9px] text-slate-600">Earned Today</p>
                </div>
                <div className="w-px h-6 bg-white/10" />
                <div className="text-center">
                  <p className="text-slate-800 font-bold text-sm">{totalDailyBonus.toLocaleString()}</p>
                  <p className="text-[9px] text-slate-600">Max/Day</p>
                </div>
                <div className="w-px h-6 bg-white/10" />
                <div className="text-center">
                  <p className="text-fuchsia-400 font-bold text-sm">Day {bonusProgress?.day_number || 1}/{bonusSettings.eligible_days}</p>
                  <p className="text-[9px] text-slate-600">Period</p>
                </div>
              </div>
              {/* Go Live button - full width */}
              <Button
                size="sm"
                onClick={() => navigate('/go-live')}
                className="w-full bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white text-xs h-9 rounded-xl shadow-lg shadow-fuchsia-500/30"
              >
                <Video className="w-4 h-4 mr-1.5" />
                Go Live
              </Button>
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
                className={`bg-white/10 backdrop-blur-sm rounded-2xl p-4 shadow-md border-2 transition-all ${
                  status === 'claimed' 
                    ? 'border-green-500/30 bg-green-500/10' 
                    : status === 'completed'
                    ? 'border-amber-400/50 shadow-amber-500/10'
                    : 'border-white/10'
                }`}
              >
                <div className="flex items-center gap-4">
                  {/* Icon */}
                  <div 
                    className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${task.icon_color}20` }}
                  >
                    <IconComponent 
                      className="w-6 h-6" 
                      style={{ color: task.icon_color }}
                    />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground">{task.title}</h3>
                    <p className="text-xs text-muted-foreground mb-2">{task.description}</p>
                    
                    {/* Progress Bar - hide for rating task */}
                    {task.requirement_type !== 'play_store_rating' && (
                      <div className="flex items-center gap-2">
                        <Progress 
                          value={progressPercent} 
                          className="h-1.5 flex-1 bg-white/10"
                        />
                        <span className="text-xs text-muted-foreground">
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
                              background: 'linear-gradient(135deg, rgba(251,191,36,0.15), rgba(245,158,11,0.1))',
                              border: '1px solid rgba(251,191,36,0.3)',
                              color: '#d97706',
                              boxShadow: '0 2px 8px rgba(251,191,36,0.15)',
                            }}
                          >
                            Hosts: 10,000 🫘 Beans
                          </span>
                          <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg"
                            style={{
                              background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(168,85,247,0.1))',
                              border: '1px solid rgba(139,92,246,0.3)',
                              color: '#7c3aed',
                              boxShadow: '0 2px 8px rgba(139,92,246,0.15)',
                            }}
                          >
                            Users: 5,000 💎 Diamonds
                          </span>
                        </>
                      ) : (
                        <>
                          {task.reward_beans > 0 && (
                            <span className="text-xs bg-gradient-to-r from-amber-500/20 to-yellow-500/20 text-amber-400 px-2 py-0.5 rounded-full font-medium">
                              +{task.reward_beans} Beans
                            </span>
                          )}
                          {task.reward_coins > 0 && (
                            <span className="text-xs bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-400 px-2 py-0.5 rounded-full font-medium">
                              +{task.reward_coins} 💎 Diamonds
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
                      <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                        <Check className="w-5 h-5 text-green-400" />
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          <Button
                            size="sm"
                            className="text-slate-800 text-xs h-8 gap-1 rounded-lg font-bold border-0"
                            style={{
                              background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
                              boxShadow: '0 3px 12px rgba(245,158,11,0.4)',
                            }}
                            onClick={() => handleRatingTaskAction('do_it')}
                          >
                            <ExternalLink className="w-3 h-3" /> Rate
                          </Button>
                          <Button
                            size="sm"
                            className="text-xs h-8 gap-1 rounded-lg font-bold border-0"
                            style={{
                              background: 'linear-gradient(135deg, rgba(139,92,246,0.12), rgba(168,85,247,0.08))',
                              border: '1px solid rgba(139,92,246,0.3)',
                              color: '#7c3aed',
                            }}
                            onClick={() => handleRatingTaskAction('claim')}
                          >
                            <Upload className="w-3 h-3" /> Claim
                          </Button>
                        </div>
                      )
                    ) : status === 'claimed' ? (
                      <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                        <Check className="w-5 h-5 text-green-400" />
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
                        className="border-white/20 text-slate-500 hover:bg-white/10"
                        onClick={() => {
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
            <Star className="w-16 h-16 text-amber-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-muted-foreground">No Tasks Available</h3>
            <p className="text-sm text-muted-foreground/70">New tasks coming soon</p>
          </div>
        )}
      </div>
      </div>

      {/* Rating Screenshot Upload Dialog */}
      <Dialog open={showRatingUpload} onOpenChange={setShowRatingUpload}>
        <DialogContent
          className="max-w-sm mx-auto border-0 p-0 overflow-hidden"
          style={{
            background: 'linear-gradient(180deg, #1a0533 0%, #0f0a1a 100%)',
            border: '1px solid rgba(167,139,250,0.3)',
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
                    background: 'linear-gradient(135deg, rgba(251,191,36,0.08) 0%, rgba(124,58,237,0.06) 100%)',
                    border: '1px solid rgba(251,191,36,0.2)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
                  }}
                >
                  {/* Subtle glow */}
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-16 rounded-full opacity-20"
                    style={{ background: 'radial-gradient(ellipse, rgba(251,191,36,0.6), transparent)' }}
                  />
                  <div className="relative">
                    <div className="w-14 h-14 mx-auto mb-3 rounded-2xl flex items-center justify-center"
                      style={{
                        background: 'linear-gradient(135deg, rgba(251,191,36,0.2), rgba(245,158,11,0.1))',
                        border: '1px solid rgba(251,191,36,0.3)',
                        boxShadow: '0 4px 20px rgba(251,191,36,0.15)',
                      }}
                    >
                      <Gift className="w-7 h-7 text-amber-400" />
                    </div>
                    <p className="text-amber-300 font-bold text-lg tracking-wide">Claim Your Reward</p>
                    <div className="flex items-center justify-center gap-3 mt-3">
                      <span className="text-[11px] font-bold px-3 py-1.5 rounded-lg"
                        style={{
                          background: 'linear-gradient(135deg, rgba(251,191,36,0.12), rgba(245,158,11,0.06))',
                          border: '1px solid rgba(251,191,36,0.25)',
                          color: '#fbbf24',
                          boxShadow: '0 2px 8px rgba(251,191,36,0.1)',
                        }}
                      >
                        Hosts: 10,000 🫘
                      </span>
                      <span className="text-purple-400/40 text-xs">•</span>
                      <span className="text-[11px] font-bold px-3 py-1.5 rounded-lg"
                        style={{
                          background: 'linear-gradient(135deg, rgba(139,92,246,0.12), rgba(168,85,247,0.06))',
                          border: '1px solid rgba(139,92,246,0.25)',
                          color: '#a78bfa',
                          boxShadow: '0 2px 8px rgba(139,92,246,0.1)',
                        }}
                      >
                        Users: 5,000 💎
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-purple-200/60 text-xs text-center leading-relaxed">
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
                    className="w-full h-12 gap-2 font-bold rounded-xl text-slate-800 border-0"
                    style={{
                      background: ratingUploading
                        ? 'rgba(167,139,250,0.15)'
                        : 'linear-gradient(135deg, #7c3aed, #a855f7)',
                      boxShadow: ratingUploading ? 'none' : '0 4px 24px rgba(124,58,237,0.4), inset 0 1px 0 rgba(255,255,255,0.1)',
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

                <p className="text-purple-300/25 text-[10px] text-center">
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
                    background: 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(52,211,153,0.08))',
                    border: '1px solid rgba(16,185,129,0.3)',
                    boxShadow: '0 4px 20px rgba(16,185,129,0.2)',
                  }}
                >
                  <CheckCircle className="w-9 h-9 text-emerald-400" />
                </div>
              </motion.div>
              <div>
                <p className="text-slate-800 font-bold text-lg">Submitted Successfully! 🎉</p>
                <p className="text-purple-200/50 text-sm mt-2 leading-relaxed">
                  Your screenshot has been submitted for review. You'll receive your reward once approved by admin.
                </p>
              </div>
              <div className="flex items-center justify-center gap-2 text-amber-400/50 text-xs">
                <Clock className="w-3.5 h-3.5" />
                Usually reviewed within 24 hours
              </div>
              <Button
                onClick={() => setShowRatingUpload(false)}
                className="w-full h-10 rounded-xl text-slate-800 font-bold border-0"
                style={{
                  background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
                  boxShadow: '0 4px 20px rgba(124,58,237,0.3)',
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