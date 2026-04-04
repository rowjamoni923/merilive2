import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Flame, Clock, Check, Sparkles, Gift } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getTaskDate } from "@/utils/taskDateUtils";
import { toast } from "sonner";
import BeansIcon from "@/components/common/BeansIcon";

interface NewHostBonusCardProps {
  hostId: string;
  streamStartTime: number;
  isStreamActive?: boolean;
  onBeansClaimed?: (beansAmount: number) => void;
}

interface BonusSettings {
  beans_per_hour: number;
  max_hours_per_day: number;
  eligible_days: number;
  is_active: boolean;
}

interface BonusProgress {
  hours_completed: number;
  beans_earned: number;
  day_number: number;
}

const NewHostBonusCard = ({ hostId, streamStartTime, isStreamActive = true, onBeansClaimed }: NewHostBonusCardProps) => {
  const [settings, setSettings] = useState<BonusSettings | null>(null);
  const [progress, setProgress] = useState<BonusProgress | null>(null);
  const [isEligible, setIsEligible] = useState(false);
  const [daysRemaining, setDaysRemaining] = useState(0);
  const [elapsedMinutes, setElapsedMinutes] = useState(0);
  const [claiming, setClaiming] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Calculate time remaining for next hour
  const currentHourProgress = elapsedMinutes % 60;
  const minutesRemaining = 60 - currentHourProgress;
  const hoursStreamed = Math.floor(elapsedMinutes / 60);
  const canClaimHour = currentHourProgress >= 60 || hoursStreamed > (progress?.hours_completed || 0);
  const claimableHours = Math.max(0, hoursStreamed - (progress?.hours_completed || 0));
  const maxReached = (progress?.hours_completed || 0) >= (settings?.max_hours_per_day || 5);

  useEffect(() => {
    fetchBonusData();
  }, [hostId]);

  // Live timer - ONLY runs when stream is active
  useEffect(() => {
    if (!isStreamActive) return; // ⛔ Stop timer when stream ends
    
    const interval = setInterval(() => {
      if (!isStreamActive) return; // Double safety check
      const elapsed = Math.floor((Date.now() - streamStartTime) / 1000 / 60);
      setElapsedMinutes(elapsed);
    }, 1000);
    return () => clearInterval(interval);
  }, [streamStartTime, isStreamActive]);

  const fetchBonusData = async () => {
    try {
      // Fetch settings
      const { data: settingsData } = await supabase
        .from('new_host_live_bonus_settings' as any)
        .select('*')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (!settingsData) return;
      setSettings(settingsData as any);

      // Check eligibility
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_host, is_face_verified, created_at')
        .eq('id', hostId)
        .single();

      if (!(profile as any)?.is_host || !(profile as any)?.is_face_verified) return;

      const createdAt = new Date((profile as any).created_at);
      const daysSince = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));

      if (daysSince >= (settingsData as any).eligible_days) return;

      setIsEligible(true);
      setDaysRemaining((settingsData as any).eligible_days - daysSince);

      // Fetch today's progress
      const today = getTaskDate();
      const { data: progressData } = await supabase
        .from('new_host_live_bonus_progress' as any)
        .select('*')
        .eq('user_id', hostId)
        .eq('bonus_date', today)
        .maybeSingle();

      if (progressData) {
        setProgress(progressData as any);
      } else {
        setProgress({ hours_completed: 0, beans_earned: 0, day_number: daysSince + 1 });
      }
    } catch (error) {
      console.error('[NewHostBonus] Error:', error);
    }
  };

  const handleClaim = async () => {
    if (claiming || claimableHours <= 0 || maxReached) return;
    setClaiming(true);

    try {
      const hoursToClaim = Math.min(claimableHours, (settings?.max_hours_per_day || 5) - (progress?.hours_completed || 0));
      
      const { data, error } = await supabase.rpc('claim_new_host_live_bonus', {
        p_user_id: hostId,
        p_hours: hoursToClaim
      });

      if (error) throw error;

      const result = data as any;
      if (result?.success) {
        const earned = hoursToClaim * (settings?.beans_per_hour || 18000);
        setProgress(prev => prev ? {
          ...prev,
          hours_completed: prev.hours_completed + hoursToClaim,
          beans_earned: prev.beans_earned + earned
        } : prev);

        setShowCelebration(true);
        setTimeout(() => setShowCelebration(false), 3000);
        toast.success(`🎉 +${earned.toLocaleString()} Beans received!`);
        onBeansClaimed?.(earned);
      } else {
        toast.error(result?.error || 'Claim failed');
      }
    } catch (error: any) {
      console.error('[NewHostBonus] Claim error:', error);
      toast.error('Failed to claim bonus');
    } finally {
      setClaiming(false);
    }
  };

  if (!isEligible || !settings) return null;

  const progressPercent = (currentHourProgress / 60) * 100;
  const secondsRemaining = (minutesRemaining * 60) - (60 - Math.floor((Date.now() - streamStartTime) / 1000) % 60);
  const displayMinutes = Math.floor(minutesRemaining);
  const displaySeconds = 59 - (Math.floor((Date.now() - streamStartTime) / 1000) % 60);

  if (collapsed) {
    return (
      <motion.button
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        onClick={() => setCollapsed(false)}
        className="relative w-11 h-11 rounded-full overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #7c3aed, #ec4899)',
          boxShadow: '0 0 20px rgba(168,85,247,0.5), inset 0 1px 0 rgba(255,255,255,0.3)',
        }}
      >
        <Flame className="w-5 h-5 text-white mx-auto mt-[10px]" />
        {claimableHours > 0 && !maxReached && (
          <motion.div
            animate={{ scale: [1, 1.3, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
            className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 flex items-center justify-center"
          >
            <span className="text-[8px] font-bold text-white">{claimableHours}</span>
          </motion.div>
        )}
      </motion.button>
    );
  }

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
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0, opacity: 0 }}
              className="pointer-events-none"
            >
              <div className="bg-gradient-to-br from-fuchsia-500 via-purple-600 to-violet-700 p-6 rounded-3xl shadow-2xl text-center"
                style={{ boxShadow: '0 0 60px rgba(168,85,247,0.6)' }}
              >
                <Sparkles className="w-12 h-12 text-amber-300 mx-auto mb-2 animate-pulse" />
                <p className="text-white font-bold text-lg">Bonus Claimed! 🎉</p>
                <div className="flex items-center justify-center gap-1 mt-2">
                  <BeansIcon size={20} />
                  <span className="text-amber-300 font-bold text-xl">+{(settings?.beans_per_hour || 18000).toLocaleString()}</span>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Card */}
      <motion.div
        initial={{ y: -20, opacity: 0, scale: 0.9 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        className="relative w-[280px] rounded-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(145deg, rgba(15,5,30,0.95) 0%, rgba(45,27,105,0.92) 50%, rgba(15,5,30,0.95) 100%)',
          border: '1px solid rgba(168,85,247,0.35)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 20px rgba(168,85,247,0.15), inset 0 1px 0 rgba(255,255,255,0.08)',
          backdropFilter: 'blur(20px)',
        }}
      >
        {/* Animated glow border */}
        <motion.div
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="absolute inset-0 rounded-2xl pointer-events-none"
          style={{ border: '1px solid rgba(236,72,153,0.3)' }}
        />

        {/* Header */}
        <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-fuchsia-500 to-purple-600 flex items-center justify-center"
              style={{ boxShadow: '0 0 12px rgba(217,70,239,0.4)' }}
            >
              <Flame className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-white text-[11px] font-bold">New Host Bonus</span>
                <span className="text-[8px] bg-gradient-to-r from-amber-400 to-orange-500 px-1.5 py-[1px] rounded-full font-bold text-white">
                  LIMITED
                </span>
              </div>
              <p className="text-purple-300/60 text-[9px]">{daysRemaining}d remaining · {settings.beans_per_hour.toLocaleString()}/hr</p>
            </div>
          </div>
          <button onClick={() => setCollapsed(true)} className="text-white/40 hover:text-white/70 transition-colors p-1">
            <span className="text-[10px]">✕</span>
          </button>
        </div>

        {/* Progress bar for current hour */}
        {!maxReached && (
          <div className="px-3 pb-2">
            <div className="relative h-5 rounded-full overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <motion.div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${Math.min(progressPercent, 100)}%`,
                  background: 'linear-gradient(90deg, #a855f7, #ec4899, #f59e0b)',
                }}
                animate={{ opacity: [0.8, 1, 0.8] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
              {/* Timer text */}
              <div className="absolute inset-0 flex items-center justify-center gap-1">
                <Clock className="w-3 h-3 text-white/80" />
                <span className="text-[10px] font-bold text-white/90">
                  {progressPercent >= 100 
                    ? '✅ Ready to claim!' 
                    : `${displayMinutes}m ${displaySeconds < 10 ? '0' : ''}${displaySeconds}s left`
                  }
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Hour slots */}
        <div className="px-3 pb-2">
          <div className="flex gap-1">
            {Array.from({ length: settings.max_hours_per_day }, (_, i) => {
              const completed = (progress?.hours_completed || 0) > i;
              const isCurrent = hoursStreamed === i && !completed;
              return (
                <motion.div
                  key={i}
                  className={`flex-1 h-8 rounded-lg flex flex-col items-center justify-center transition-all ${
                    completed
                      ? 'bg-gradient-to-b from-fuchsia-500 to-purple-600'
                      : isCurrent
                      ? 'bg-gradient-to-b from-fuchsia-500/30 to-purple-600/30 border border-fuchsia-400/50'
                      : 'bg-white/5 border border-white/8'
                  }`}
                  style={completed ? { boxShadow: '0 0 10px rgba(217,70,239,0.3)' } : {}}
                >
                  {completed ? (
                    <Check className="w-3.5 h-3.5 text-white" />
                  ) : isCurrent ? (
                    <motion.div
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    >
                      <Clock className="w-3 h-3 text-fuchsia-300" />
                    </motion.div>
                  ) : (
                    <Clock className="w-3 h-3 text-white/20" />
                  )}
                  <span className={`text-[7px] font-bold ${completed ? 'text-white' : isCurrent ? 'text-fuchsia-300' : 'text-white/20'}`}>
                    {i + 1}h
                  </span>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Bottom: Earnings + Claim Button */}
        <div className="px-3 pb-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-center">
              <div className="flex items-center gap-0.5">
                <BeansIcon size={12} />
                <span className="text-amber-400 font-bold text-[11px]">{(progress?.beans_earned || 0).toLocaleString()}</span>
              </div>
              <p className="text-[7px] text-white/30">Earned</p>
            </div>
            <div className="w-px h-5 bg-white/10" />
            <div className="text-center">
              <span className="text-fuchsia-400 font-bold text-[11px]">Day {progress?.day_number || 1}/{settings.eligible_days}</span>
              <p className="text-[7px] text-white/30">Period</p>
            </div>
          </div>

          {claimableHours > 0 && !maxReached ? (
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={handleClaim}
              disabled={claiming}
              className="px-4 py-1.5 rounded-xl text-white text-[11px] font-bold relative overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, #a855f7, #ec4899)',
                boxShadow: '0 0 15px rgba(168,85,247,0.4), inset 0 1px 0 rgba(255,255,255,0.2)',
              }}
            >
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                animate={{ x: ['-100%', '100%'] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
              <span className="relative z-10 flex items-center gap-1">
                <Gift className="w-3.5 h-3.5" />
                {claiming ? '...' : 'Receive'}
              </span>
            </motion.button>
          ) : maxReached ? (
            <div className="px-3 py-1.5 rounded-xl bg-green-500/20 border border-green-400/30">
              <span className="text-green-400 text-[10px] font-bold flex items-center gap-1">
                <Check className="w-3 h-3" /> Done!
              </span>
            </div>
          ) : null}
        </div>
      </motion.div>
    </>
  );
};

export default NewHostBonusCard;
