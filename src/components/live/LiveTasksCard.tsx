import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Star, Radio, Clock, Users, Gift, MessageCircle, Check, Sparkles, ChevronRight, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getTaskDate, getMsUntilNextReset, getMsUntilNextHour } from "@/utils/taskDateUtils";
import { toast } from "sonner";
import BeansIcon from "@/components/common/BeansIcon";
import { updateCachedBalance } from "@/hooks/useUserBalance";

interface LiveTask {
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

const iconMap: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  video: Radio,
  clock: Clock,
  users: Users,
  gift: Gift,
  'message-circle': MessageCircle,
  star: Star,
};

interface LiveTasksCardProps {
  hostId: string;
}

const LiveTasksCard = ({ hostId }: LiveTasksCardProps) => {
  const [tasks, setTasks] = useState<LiveTask[]>([]);
  const [progress, setProgress] = useState<Record<string, TaskProgress>>({});
  const [claiming, setClaiming] = useState(false);
  const [showCelebration, setShowCelebration] = useState<{ beans: number; diamonds: number } | null>(null);
  const [isEligible, setIsEligible] = useState<boolean | null>(null);

  useEffect(() => {
    checkEligibilityAndFetch();
    const channel = supabase
      .channel('live-tasks-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_task_progress' }, () => {
        fetchLiveTasks();
      })
      .subscribe();

    // Auto-refresh at 12:30 AM local time when tasks reset
    const msUntilReset = getMsUntilNextReset();
    const resetTimer = setTimeout(() => {
      console.log('[LiveTasks] Task day reset - refreshing');
      setProgress({});
      checkEligibilityAndFetch();
    }, msUntilReset);

    return () => { 
      supabase.removeChannel(channel);
      clearTimeout(resetTimer);
    };
  }, [hostId]);

  const checkEligibilityAndFetch = async () => {
    try {
      const [{ data: profile }, { data: bonusSettings }] = await Promise.all([
        supabase.from('profiles_public').select('is_host, is_face_verified, created_at').eq('id', hostId).single(),
        supabase.from('new_host_live_bonus_settings' as any).select('eligible_days, is_active').eq('is_active', true).limit(1).maybeSingle(),
      ]);
      if (!(profile as any)?.is_host || !(profile as any)?.is_face_verified || !bonusSettings) {
        setIsEligible(false);
        return;
      }
      const verifiedAt = new Date((profile as any).created_at);
      const daysSince = Math.floor((Date.now() - verifiedAt.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSince >= (bonusSettings as any).eligible_days) {
        setIsEligible(false);
        return;
      }
      setIsEligible(true);
      await fetchLiveTasks();
    } catch (error) {
      console.error('[LiveTasks] Eligibility check error:', error);
      setIsEligible(false);
    }
  };

  const fetchLiveTasks = async () => {
    try {
      const { data: tasksData } = await supabase
        .from('daily_tasks' as any)
        .select('*')
        .eq('is_active', true)
        .eq('show_in_live', true)
        .order('display_order');
      if (!tasksData || tasksData.length === 0) return;
      setTasks(tasksData as any);

      const today = getTaskDate();
      const { data: progressData } = await supabase
        .from('user_task_progress')
        .select('*')
        .eq('user_id', hostId)
        .eq('reset_date', today);
      if (progressData) {
        const map: Record<string, TaskProgress> = {};
        progressData.forEach((p) => { map[p.task_id] = p; });
        setProgress(map);
      }
    } catch (error) {
      console.error('[LiveTasks] Error:', error);
    }
  };

  // Find the CURRENT active task — first unclaimed one
  const currentTask = useMemo(() => {
    for (const task of tasks) {
      const p = progress[task.id];
      if (!p || !p.is_claimed) return task;
    }
    return null;
  }, [tasks, progress]);

  const completedCount = useMemo(() => {
    return tasks.filter(t => progress[t.id]?.is_claimed).length;
  }, [tasks, progress]);

  const claimReward = async (task: LiveTask) => {
    if (claiming) return;
    setClaiming(true);
    try {
      const taskProg = progress[task.id];
      if (!taskProg?.is_completed || taskProg?.is_claimed) {
        setClaiming(false);
        return;
      }

      // Use server-side RPC for secure claiming (verifies active live stream)
      const { data: result, error: claimError } = await supabase.rpc('claim_task_reward', {
        _task_id: task.id
      });

      if (claimError || !(result as any)?.success) {
        const errMsg = (result as any)?.error || claimError?.message || 'Failed to claim reward.';
        toast.error(errMsg);
        setClaiming(false);
        return;
      }

      // Update local balance cache
      updateCachedBalance(0); // Force refresh on next balance check

      setProgress(prev => ({
        ...prev,
        [task.id]: { ...prev[task.id], is_claimed: true }
      }));

      const earnedBeans = (result as any)?.beans || task.reward_beans;
      const earnedCoins = (result as any)?.coins || task.reward_coins;
      setShowCelebration({ beans: earnedBeans, diamonds: earnedCoins });
      setTimeout(() => setShowCelebration(null), 3000);
      toast.success(`🎉 +${earnedBeans} Beans, +${earnedCoins} 💎`);
    } catch (error) {
      console.error('[LiveTasks] Claim error:', error);
      toast.error('Claim failed.');
    } finally {
      setClaiming(false);
    }
  };

  if (!isEligible || tasks.length === 0) return null;

  // All tasks claimed
  if (!currentTask) {
    return (
      <motion.div
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="w-full rounded-2xl overflow-hidden p-3"
        style={{
          background: 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(34,197,94,0.08))',
          border: '1px solid rgba(34,197,94,0.25)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
        }}
      >
        <div className="flex items-center gap-2.5">
          <motion.div
            animate={{ rotate: [0, 15, -15, 0], scale: [1, 1.1, 1] }}
            transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #22c55e, #10b981)', boxShadow: '0 0 16px rgba(34,197,94,0.4)' }}
          >
            <Check className="w-4 h-4 text-white" />
          </motion.div>
          <div>
            <span className="text-green-300 text-[11px] font-bold">All Tasks Complete! 🎉</span>
            <p className="text-green-400/50 text-[9px]">{tasks.length}/{tasks.length} done</p>
          </div>
        </div>
      </motion.div>
    );
  }

  const IconComp = iconMap[currentTask.icon_name] || Star;
  const taskProg = progress[currentTask.id];
  const currentProgress = taskProg?.current_progress || 0;
  const percent = Math.min((currentProgress / currentTask.requirement_value) * 100, 100);
  const isCompleted = taskProg?.is_completed;

  const progressLabel = currentTask.requirement_type === 'live_minutes'
    ? `${currentProgress}/${currentTask.requirement_value} min`
    : `${currentProgress}/${currentTask.requirement_value}`;

  return (
    <>
      {/* Celebration overlay */}
      <AnimatePresence>
        {showCelebration && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none"
          >
            {/* Particle effects */}
            {[...Array(12)].map((_, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 1, scale: 0, x: 0, y: 0 }}
                animate={{
                  opacity: [1, 1, 0],
                  scale: [0, 1.5, 0.5],
                  x: Math.cos(i * 30 * Math.PI / 180) * 120,
                  y: Math.sin(i * 30 * Math.PI / 180) * 120 - 40,
                }}
                transition={{ duration: 1.5, ease: 'easeOut' }}
                className="absolute w-3 h-3 rounded-full"
                style={{
                  background: i % 3 === 0 ? '#fbbf24' : i % 3 === 1 ? '#a855f7' : '#ec4899',
                  boxShadow: `0 0 8px ${i % 3 === 0 ? '#fbbf24' : i % 3 === 1 ? '#a855f7' : '#ec4899'}`,
                }}
              />
            ))}
            <motion.div
              initial={{ scale: 0, rotate: -15 }}
              animate={{ scale: [0, 1.15, 1], rotate: [- 15, 5, 0] }}
              exit={{ scale: 0, rotate: 10 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15 }}
              className="p-6 rounded-3xl text-center pointer-events-none relative"
              style={{
                background: 'linear-gradient(145deg, rgba(168,85,247,0.97), rgba(236,72,153,0.97))',
                boxShadow: '0 0 80px rgba(168,85,247,0.6), 0 0 160px rgba(236,72,153,0.3), inset 0 1px 0 rgba(255,255,255,0.2)',
                border: '1px solid rgba(255,255,255,0.15)',
              }}
            >
              <motion.div animate={{ rotate: [0, 360] }} transition={{ duration: 2, ease: 'linear', repeat: Infinity }}>
                <Sparkles className="w-14 h-14 text-amber-300 mx-auto mb-3" />
              </motion.div>
              <p className="text-white font-bold text-xl">Reward Claimed!</p>
              <div className="flex gap-4 mt-3 justify-center">
                {showCelebration.beans > 0 && (
                  <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.3 }} className="flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1">
                    <BeansIcon size={16} />
                    <span className="text-amber-300 font-bold text-sm">+{showCelebration.beans}</span>
                  </motion.div>
                )}
                {showCelebration.diamonds > 0 && (
                  <motion.div initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.4 }} className="flex items-center gap-1 bg-white/10 rounded-full px-3 py-1">
                    <span className="text-cyan-300 font-bold text-sm">+{showCelebration.diamonds} 💎</span>
                  </motion.div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ultra-premium task card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentTask.id}
          initial={{ x: -40, opacity: 0, scale: 0.9 }}
          animate={{ x: 0, opacity: 1, scale: 1 }}
          exit={{ x: 40, opacity: 0, scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 280, damping: 22 }}
          className="w-full rounded-2xl overflow-hidden relative"
          style={{
            background: 'linear-gradient(160deg, rgba(8,2,18,0.93) 0%, rgba(30,15,72,0.9) 50%, rgba(50,10,60,0.88) 100%)',
            border: '1px solid rgba(168,85,247,0.25)',
            boxShadow: '0 12px 40px rgba(0,0,0,0.6), 0 0 24px rgba(168,85,247,0.1), inset 0 1px 0 rgba(255,255,255,0.05)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
          }}
        >
          {/* Animated top border gradient */}
          <motion.div
            className="absolute top-0 left-0 right-0 h-[2px]"
            style={{
              background: isCompleted
                ? 'linear-gradient(90deg, #22c55e, #10b981, #34d399, #22c55e)'
                : 'linear-gradient(90deg, #a855f7, #ec4899, #f97316, #a855f7)',
              backgroundSize: '200% 100%',
            }}
            animate={{ backgroundPosition: ['0% 0%', '200% 0%'] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
          />

          <div className="px-3.5 py-3 flex items-center gap-3">
            {/* Premium 3D icon */}
            <motion.div
              animate={isCompleted ? { scale: [1, 1.15, 1], boxShadow: ['0 0 12px rgba(34,197,94,0.3)', '0 0 24px rgba(34,197,94,0.6)', '0 0 12px rgba(34,197,94,0.3)'] } : {}}
              transition={{ duration: 2, repeat: Infinity }}
              className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 relative"
              style={{
                background: isCompleted
                  ? 'linear-gradient(145deg, rgba(34,197,94,0.25), rgba(16,185,129,0.15))'
                  : `linear-gradient(145deg, ${currentTask.icon_color}25, ${currentTask.icon_color}10)`,
                border: isCompleted
                  ? '1.5px solid rgba(34,197,94,0.4)'
                  : `1.5px solid ${currentTask.icon_color}35`,
                boxShadow: isCompleted
                  ? '0 0 16px rgba(34,197,94,0.3), inset 0 1px 0 rgba(255,255,255,0.1)'
                  : `0 0 12px ${currentTask.icon_color}15, inset 0 1px 0 rgba(255,255,255,0.05)`,
              }}
            >
              <IconComp className="w-5 h-5" style={{ color: isCompleted ? '#22c55e' : currentTask.icon_color, filter: 'drop-shadow(0 0 4px currentColor)' }} />
              {isCompleted && (
                <motion.div
                  initial={{ scale: 0, rotate: -90 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 400 }}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, #22c55e, #10b981)', boxShadow: '0 0 10px rgba(34,197,94,0.5), 0 2px 4px rgba(0,0,0,0.3)' }}
                >
                  <Check className="w-3 h-3 text-white" strokeWidth={3} />
                </motion.div>
              )}
            </motion.div>

            {/* Task info + progress */}
            <div className="flex-1 min-w-0">
              {/* Title row */}
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Zap className="w-3 h-3 text-amber-400 flex-shrink-0" />
                  <p className="text-white text-[12px] font-bold truncate leading-tight">{currentTask.title}</p>
                </div>
                <span className="text-[9px] text-white/25 flex-shrink-0 ml-2 font-medium tabular-nums bg-white/5 px-1.5 py-0.5 rounded-md">
                  {completedCount + 1}/{tasks.length}
                </span>
              </div>

              {/* Premium progress bar */}
              <div className="flex items-center gap-2 mb-1.5">
                <div className="flex-1 h-[6px] rounded-full overflow-hidden relative" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  {/* Shimmer background */}
                  <motion.div
                    className="absolute inset-0 rounded-full"
                    style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.03), transparent)', backgroundSize: '200% 100%' }}
                    animate={{ backgroundPosition: ['200% 0%', '-200% 0%'] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                  <motion.div
                    className="h-full rounded-full relative"
                    initial={{ width: 0 }}
                    animate={{ width: `${percent}%` }}
                    transition={{ duration: 1, ease: 'easeOut' }}
                    style={{
                      background: isCompleted
                        ? 'linear-gradient(90deg, #22c55e, #10b981, #34d399)'
                        : 'linear-gradient(90deg, #a855f7, #d946ef, #ec4899, #f97316)',
                      boxShadow: isCompleted
                        ? '0 0 10px rgba(34,197,94,0.5)'
                        : '0 0 10px rgba(168,85,247,0.4), 0 0 20px rgba(236,72,153,0.2)',
                    }}
                  >
                    {/* Gleam effect on progress */}
                    <motion.div
                      className="absolute inset-0 rounded-full"
                      style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)' }}
                      animate={{ x: ['-100%', '200%'] }}
                      transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
                    />
                  </motion.div>
                </div>
                <span className="text-[9px] text-white/35 flex-shrink-0 tabular-nums font-medium">{progressLabel}</span>
              </div>

              {/* Rewards row */}
              <div className="flex items-center gap-2.5">
                {currentTask.reward_beans > 0 && (
                  <span className="text-[10px] text-amber-400/90 font-bold flex items-center gap-1 bg-amber-400/8 rounded-md px-1.5 py-0.5">
                    <BeansIcon size={10} /> +{currentTask.reward_beans}
                  </span>
                )}
                {currentTask.reward_coins > 0 && (
                  <span className="text-[10px] text-cyan-400/90 font-bold bg-cyan-400/8 rounded-md px-1.5 py-0.5">+{currentTask.reward_coins} 💎</span>
                )}
              </div>
            </div>

            {/* Premium Claim button */}
            {isCompleted && (
              <motion.button
                initial={{ scale: 0, rotate: -10 }}
                animate={{ scale: 1, rotate: 0 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.92 }}
                onClick={() => claimReward(currentTask)}
                disabled={claiming}
                className="flex-shrink-0 px-4 py-2 rounded-xl text-[11px] font-extrabold text-white relative overflow-hidden"
                style={{
                  background: 'linear-gradient(145deg, #a855f7, #d946ef, #ec4899)',
                  boxShadow: '0 0 20px rgba(168,85,247,0.5), 0 6px 16px rgba(236,72,153,0.3), inset 0 1px 0 rgba(255,255,255,0.2)',
                }}
              >
                {/* Button shimmer */}
                <motion.div
                  className="absolute inset-0"
                  style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)' }}
                  animate={{ x: ['-100%', '200%'] }}
                  transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 0.5 }}
                />
                <motion.span
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="relative z-10"
                >
                  {claiming ? '...' : 'Claim ✨'}
                </motion.span>
              </motion.button>
            )}

            {!isCompleted && (
              <motion.div
                animate={{ x: [0, 3, 0] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                <ChevronRight className="w-4 h-4 text-white/20 flex-shrink-0" />
              </motion.div>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </>
  );
};

export default LiveTasksCard;
