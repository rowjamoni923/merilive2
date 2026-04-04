import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check, Crown, Sparkles, Gift, Gem, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDailyLoginReward } from "@/hooks/useDailyLoginReward";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import Diamond3DIcon from "@/components/common/Diamond3DIcon";
import { motion, AnimatePresence } from "framer-motion";

/**
 * Ultra-Premium Daily Login Reward Popup
 * 
 * Features:
 * - Cinematic entrance animation
 * - Floating diamond particles
 * - Glow effects and premium gradients
 * - 7-day reward grid with glass-morphism cards
 * - Animated claim button with shimmer
 */
const DailyLoginPopup = () => {
  const {
    rewardDays,
    streak,
    canClaimToday,
    claiming,
    showPopup,
    setShowPopup,
    todayReward,
    claimReward,
  } = useDailyLoginReward();

  if (!showPopup || !canClaimToday) return null;

  const currentDay = (streak.current_streak % 7) + 1;

  return (
    <Dialog open={showPopup} onOpenChange={setShowPopup}>
      <DialogContent className="bg-transparent border-0 shadow-none max-w-[380px] mx-auto p-0 overflow-visible [&>button]:hidden">
        <VisuallyHidden><DialogTitle>Daily Login Reward</DialogTitle></VisuallyHidden>
        
        <motion.div
          initial={{ scale: 0.6, opacity: 0, y: 60, rotateX: 15 }}
          animate={{ scale: 1, opacity: 1, y: 0, rotateX: 0 }}
          transition={{ type: "spring", damping: 18, stiffness: 200 }}
          className="relative rounded-[28px] overflow-hidden"
          style={{ perspective: 1000 }}
        >
          {/* Animated gradient border */}
          <div className="absolute inset-0 rounded-[28px] p-[2px]" 
            style={{ background: 'linear-gradient(135deg, #fbbf24, #f59e0b, #ec4899, #8b5cf6, #06b6d4, #fbbf24)' }}
          >
            <div className="w-full h-full rounded-[28px] bg-[#0a0a1a]" />
          </div>

          {/* Background glow effects */}
          <div className="absolute inset-0 rounded-[28px] overflow-hidden">
            <div className="absolute -top-20 -left-20 w-60 h-60 bg-amber-500/15 rounded-full blur-3xl animate-pulse" />
            <div className="absolute -bottom-20 -right-20 w-60 h-60 bg-purple-600/15 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 bg-cyan-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '0.5s' }} />
          </div>

          {/* Content */}
          <div className="relative z-10 rounded-[28px]">
            
            {/* Close button */}
            <button
              onClick={() => setShowPopup(false)}
              className="absolute top-4 right-4 z-30 w-8 h-8 rounded-full bg-white/5 backdrop-blur-xl border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/15 transition-all duration-300"
            >
              ✕
            </button>

            {/* Floating particles */}
            {[...Array(8)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-1 h-1 rounded-full"
                style={{
                  left: `${15 + Math.random() * 70}%`,
                  top: `${10 + Math.random() * 30}%`,
                  background: ['#fbbf24', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#a855f7', '#f97316', '#10b981'][i],
                }}
                animate={{
                  y: [0, -20, 0],
                  opacity: [0.3, 0.8, 0.3],
                  scale: [0.8, 1.2, 0.8],
                }}
                transition={{
                  duration: 2 + Math.random() * 2,
                  repeat: Infinity,
                  delay: i * 0.3,
                }}
              />
            ))}

            {/* ===== HEADER SECTION ===== */}
            <div className="text-center pt-6 pb-5 px-6">
              {/* Ultra-Premium Treasure Chest Icon */}
              <motion.div 
                className="relative w-[120px] h-[120px] mx-auto mb-4"
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              >
                {/* Outer radiant glow layers */}
                <div className="absolute inset-0 scale-[2] rounded-full bg-gradient-to-b from-amber-400/30 via-amber-500/10 to-transparent blur-3xl" />
                <div className="absolute inset-0 scale-[1.6] rounded-full bg-gradient-to-tr from-cyan-400/20 via-purple-500/15 to-amber-400/20 blur-2xl animate-pulse" />
                <div className="absolute inset-0 scale-[1.3] rounded-full bg-gradient-to-br from-amber-500/25 to-orange-400/15 blur-xl" />

                {/* Main treasure container with glass card */}
                <div className="relative w-[120px] h-[120px] rounded-[24px] flex items-center justify-center overflow-hidden"
                  style={{
                    background: 'linear-gradient(145deg, rgba(15,15,40,0.95), rgba(10,10,30,0.98))',
                    border: '1.5px solid rgba(251,191,36,0.35)',
                    boxShadow: '0 0 40px rgba(245,158,11,0.2), 0 0 80px rgba(168,85,247,0.1), inset 0 1px 0 rgba(255,255,255,0.08)',
                  }}
                >
                  {/* Inner glow effect */}
                  <div className="absolute inset-0 bg-gradient-to-b from-amber-400/10 via-transparent to-purple-500/5" />
                  
                  {/* Treasure chest emoji + diamonds burst */}
                  <div className="relative z-10 flex flex-col items-center">
                    {/* Premium Diamond Icon */}
                    <motion.div
                      animate={{ scale: [1, 1.08, 1], rotate: [0, 3, -3, 0] }}
                      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                      className="relative"
                    >
                      <Diamond3DIcon size={56} />
                      {/* Golden glow behind diamond */}
                      <div className="absolute inset-0 bg-gradient-to-b from-amber-400/40 to-cyan-400/20 blur-lg rounded-full scale-150 -z-10" />
                    </motion.div>
                    
                    {/* Flying diamonds from chest */}
                    {[...Array(5)].map((_, i) => (
                      <motion.div
                        key={`chest-diamond-${i}`}
                        className="absolute"
                        style={{
                          top: '20%',
                          left: '50%',
                        }}
                        animate={{
                          x: [0, (i - 2) * 18],
                          y: [0, -20 - i * 6, -15 - i * 4],
                          opacity: [0, 1, 0],
                          scale: [0.3, 0.8, 0.4],
                        }}
                        transition={{
                          duration: 2,
                          repeat: Infinity,
                          delay: i * 0.35,
                          ease: "easeOut",
                        }}
                      >
                        <span className="text-[10px]">💎</span>
                      </motion.div>
                    ))}
                  </div>

                  {/* Corner sparkle accents */}
                  <motion.div
                    className="absolute top-2 right-2"
                    animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }}
                    transition={{ duration: 1.5, repeat: Infinity, delay: 0 }}
                  >
                    <Sparkles className="w-4 h-4 text-amber-300 drop-shadow-[0_0_8px_rgba(251,191,36,0.9)]" />
                  </motion.div>
                  <motion.div
                    className="absolute bottom-3 left-2"
                    animate={{ opacity: [0.2, 0.9, 0.2], scale: [0.7, 1.1, 0.7] }}
                    transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
                  >
                    <Star className="w-3 h-3 text-cyan-300 fill-cyan-300 drop-shadow-[0_0_6px_rgba(6,182,212,0.8)]" />
                  </motion.div>
                </div>

                {/* Orbiting sparkle ring */}
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 5, repeat: Infinity, ease: "linear" }}
                  className="absolute inset-[-8px]"
                >
                  <Sparkles className="absolute top-0 left-1/2 -translate-x-1/2 w-3.5 h-3.5 text-amber-300 drop-shadow-[0_0_8px_rgba(251,191,36,0.9)]" />
                  <Star className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3 h-3 text-purple-400 fill-purple-400 drop-shadow-[0_0_6px_rgba(168,85,247,0.8)]" />
                </motion.div>
                <motion.div
                  animate={{ rotate: -360 }}
                  transition={{ duration: 7, repeat: Infinity, ease: "linear" }}
                  className="absolute inset-[-12px]"
                >
                  <Star className="absolute top-1/2 right-0 w-2.5 h-2.5 text-cyan-300 fill-cyan-300 drop-shadow-[0_0_6px_rgba(6,182,212,0.8)]" />
                </motion.div>
              </motion.div>

              {/* Title with premium gradient */}
              <h2 className="text-[28px] font-black tracking-tight leading-tight">
                <span className="bg-gradient-to-r from-amber-200 via-yellow-100 to-amber-300 bg-clip-text text-transparent drop-shadow-[0_2px_8px_rgba(251,191,36,0.3)]">
                  Daily Reward
                </span>
              </h2>
              <div className="flex items-center justify-center gap-3 mt-2">
                <span className="text-xs font-bold text-purple-300/80 bg-purple-500/10 px-3 py-1 rounded-full border border-purple-500/20">
                  Day {currentDay}/7
                </span>
                <span className="text-xs font-bold text-cyan-300/80 bg-cyan-500/10 px-3 py-1 rounded-full border border-cyan-500/20">
                  🔥 {streak.current_streak} Streak
                </span>
              </div>
            </div>

            {/* ===== 7-DAY REWARD GRID ===== */}
            <div className="grid grid-cols-7 gap-1.5 px-4 pb-4">
              {rewardDays.map((day, i) => {
                const isToday = day.day_number === currentDay;
                const isPast = day.day_number < currentDay;
                const isClaimed = day.is_claimed || isPast;
                const isDay7 = day.day_number === 7;

                return (
                  <motion.div
                    key={day.day_number}
                    initial={{ opacity: 0, scale: 0.5, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ delay: 0.3 + i * 0.07, type: "spring", damping: 15 }}
                    className={cn(
                      "flex flex-col items-center py-2.5 px-0.5 rounded-2xl border relative overflow-hidden transition-all duration-300",
                      isToday
                        ? "border-amber-400/60 bg-gradient-to-b from-amber-500/20 via-amber-600/10 to-orange-600/5 scale-[1.05] shadow-[0_0_20px_rgba(245,158,11,0.25)] ring-1 ring-amber-400/30"
                        : isClaimed
                        ? "border-emerald-500/20 bg-emerald-500/5"
                        : "border-white/[0.05] bg-white/[0.02] hover:bg-white/[0.04]"
                    )}
                  >
                    {/* Today indicator dot */}
                    {isToday && (
                      <motion.div 
                        className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-5 h-1 rounded-full bg-gradient-to-r from-amber-400 to-orange-400"
                        animate={{ opacity: [0.5, 1, 0.5] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                      />
                    )}

                    {/* Day label */}
                    <span className={cn(
                      "text-[8px] font-extrabold uppercase tracking-[0.15em]",
                      isToday ? "text-amber-300" : isClaimed ? "text-emerald-400/60" : "text-white/30"
                    )}>
                      D{day.day_number}
                    </span>

                    {/* Icon */}
                    <div className="my-1.5 relative">
                      {isClaimed && !isToday ? (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="w-6 h-6 rounded-full bg-gradient-to-br from-emerald-400 to-green-500 flex items-center justify-center shadow-lg shadow-emerald-500/30"
                        >
                          <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                        </motion.div>
                      ) : isDay7 ? (
                        <div className="relative">
                          <Crown className="w-5 h-5 text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.6)]" fill="currentColor" />
                        </div>
                      ) : (
                        <Diamond3DIcon size={20} />
                      )}
                    </div>

                    {/* Reward amount */}
                    <span className={cn(
                      "text-[10px] font-black tabular-nums",
                      isToday ? "text-amber-200" : isClaimed ? "text-emerald-400/60" : "text-white/40"
                    )}>
                      {day.reward_coins}
                    </span>
                  </motion.div>
                );
              })}
            </div>

            {/* ===== TODAY'S REWARD DETAIL CARD ===== */}
            {todayReward && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 }}
                className="mx-4 mb-4 p-4 rounded-2xl relative overflow-hidden"
                style={{
                  background: 'linear-gradient(135deg, rgba(245,158,11,0.12), rgba(168,85,247,0.08), rgba(6,182,212,0.08))',
                  border: '1px solid rgba(245,158,11,0.15)',
                }}
              >
                {/* Animated shimmer overlay */}
                <motion.div
                  className="absolute inset-0"
                  style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 50%, transparent 100%)' }}
                  animate={{ x: ['-100%', '200%'] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                />
                
                <div className="flex items-center justify-between relative z-10">
                  <div>
                    <p className="text-[10px] text-amber-400/70 font-bold uppercase tracking-[0.2em] mb-1">Today's Reward</p>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 bg-gradient-to-r from-amber-500/15 to-orange-500/10 px-3 py-1.5 rounded-xl border border-amber-500/20">
                        <Diamond3DIcon size={20} />
                        <span className="text-xl font-black text-white">{todayReward.reward_coins}</span>
                      </div>
                      {todayReward.reward_diamonds > 0 && (
                        <div className="flex items-center gap-1 bg-cyan-500/10 px-2.5 py-1.5 rounded-xl border border-cyan-500/20">
                          <Gem className="w-4 h-4 text-cyan-400" />
                          <span className="text-lg font-black text-cyan-300">+{todayReward.reward_diamonds}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <motion.div
                    animate={{ rotate: [0, 10, -10, 0], scale: [1, 1.1, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <Gift className="w-10 h-10 text-amber-400/80 drop-shadow-[0_0_12px_rgba(245,158,11,0.4)]" />
                  </motion.div>
                </div>
              </motion.div>
            )}

            {/* ===== CLAIM BUTTON ===== */}
            <div className="px-4 pb-7">
              <motion.div 
                whileTap={{ scale: 0.96 }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.9 }}
              >
                <Button
                  onClick={claimReward}
                  disabled={claiming}
                  className="w-full h-14 text-lg font-black rounded-2xl border-0 shadow-[0_8px_32px_rgba(245,158,11,0.35)] transition-all duration-300 relative overflow-hidden group"
                  style={{
                    background: 'linear-gradient(135deg, #f59e0b, #f97316, #ef4444, #f59e0b)',
                    backgroundSize: '200% 200%',
                  }}
                >
                  {/* Shimmer effect on button */}
                  <motion.div
                    className="absolute inset-0 opacity-30"
                    style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)' }}
                    animate={{ x: ['-100%', '200%'] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear", repeatDelay: 1 }}
                  />
                  
                  {claiming ? (
                    <span className="flex items-center gap-2 relative z-10">
                      <motion.div 
                        className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      />
                      Claiming...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2 relative z-10 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
                      <Diamond3DIcon size={24} />
                      Claim Reward
                    </span>
                  )}
                </Button>
              </motion.div>

              {/* Streak bonus hint */}
              {streak.current_streak >= 6 && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.2 }}
                  className="text-center text-[11px] text-amber-400/60 mt-3 font-medium"
                >
                  🏆 Complete 7 days for MEGA bonus!
                </motion.p>
              )}
            </div>
          </div>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
};

export default DailyLoginPopup;
