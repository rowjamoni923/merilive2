import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Gift, Lock, Timer, Sparkles, X, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UserParcel } from '@/hooks/useParcels';
import { useCountdown } from './useCountdown';

interface ParcelDetailSheetProps {
  parcel: UserParcel | null;
  isOpen: boolean;
  onClose: () => void;
  onClaim: (parcelId: string) => Promise<any>;
  isClaiming: boolean;
}

const CONDITION_LABELS: Record<string, string> = {
  none: 'No task needed',
  recharge: 'Recharge diamonds',
  watch_live: 'Watch live stream',
  send_gift: 'Send gifts',
  daily_login: 'Login streak',
  first_recharge: 'Make first recharge',
  level_reach: 'Reach level',
  invite_friend: 'Invite a friend',
};

export default function ParcelDetailSheet({ parcel, isOpen, onClose, onClaim, isClaiming }: ParcelDetailSheetProps) {
  const [claimResult, setClaimResult] = useState<{ success: boolean; reward_type?: string; reward_amount?: number } | null>(null);
  const [showOpenAnimation, setShowOpenAnimation] = useState(false);

  const template = parcel?.parcel_templates;
  const isLocked = parcel?.status === 'locked';
  const expiryCountdown = useCountdown(parcel?.expires_at || null);
  const unlockCountdown = useCountdown(parcel?.unlocks_at || null);
  const glowColor = template?.glow_color || '#a855f7';

  const handleClaim = async () => {
    if (!parcel) return;
    setShowOpenAnimation(true);
    
    setTimeout(async () => {
      try {
        const result = await onClaim(parcel.id);
        setClaimResult(result);
      } catch {
        setClaimResult({ success: false });
      }
      setShowOpenAnimation(false);
    }, 1500);
  };

  const handleClose = () => {
    setClaimResult(null);
    setShowOpenAnimation(false);
    onClose();
  };

  if (!parcel || !template) return null;

  const canOpen = parcel.status === 'unlocked' && !unlockCountdown;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-white/80 backdrop-blur-sm z-50"
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 max-h-[85vh] overflow-y-auto"
          >
            <div className="relative rounded-t-3xl border-t border-amber-200/60 bg-gradient-to-b from-[#FAF5EA] to-[#FFFBF2] p-6 pb-10">
              {/* Handle */}
              <div className="absolute top-3 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full bg-amber-50" />
              
              {/* Close */}
              <button onClick={handleClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-900">
                <X className="w-5 h-5" />
              </button>

              {/* Opening Animation */}
              <AnimatePresence>
                {showOpenAnimation && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.5 }}
                    className="absolute inset-0 z-20 flex items-center justify-center rounded-t-3xl bg-white/80"
                  >
                    <motion.div
                      animate={{
                        rotate: [0, 10, -10, 10, 0],
                        scale: [1, 1.2, 1.1, 1.3, 1],
                      }}
                      transition={{ duration: 1.5 }}
                    >
                      <Gift className="w-24 h-24" style={{ color: glowColor }} />
                    </motion.div>
                    <motion.div
                      className="absolute inset-0"
                      animate={{ opacity: [0, 0.5, 0] }}
                      transition={{ duration: 1.5 }}
                      style={{ background: `radial-gradient(circle, ${glowColor}60, transparent 60%)` }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Claim Result */}
              {claimResult ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center gap-4 pt-8 pb-4"
                >
                  {claimResult.success ? (
                    <>
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 0.6 }}
                      >
                        <CheckCircle2 className="w-16 h-16 text-emerald-400" />
                      </motion.div>
                      <h2 className="text-2xl font-bold text-foreground">🎉 Congratulations!</h2>
                      <div className="text-center">
                        <p className="text-lg text-amber-400 font-bold">
                          +{claimResult.reward_amount} {claimResult.reward_type === 'diamonds' ? 'Diamonds' : claimResult.reward_type}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">Reward added to your account</p>
                      </div>
                      <Button onClick={handleClose} variant="premium" size="lg" className="mt-4 w-full">
                        Awesome!
                      </Button>
                    </>
                  ) : (
                    <>
                      <X className="w-16 h-16 text-red-400" />
                      <h2 className="text-xl font-bold text-foreground">Oops!</h2>
                      <p className="text-muted-foreground">Could not claim this parcel. Please try again.</p>
                      <Button onClick={handleClose} variant="outline" className="mt-4">Close</Button>
                    </>
                  )}
                </motion.div>
              ) : (
                <>
                  {/* Parcel Icon */}
                  <div className="flex justify-center mt-6 mb-4">
                    <motion.div
                      animate={canOpen ? { rotate: [0, -8, 8, -8, 0], y: [0, -5, 0] } : {}}
                      transition={{ repeat: Infinity, duration: 2, repeatDelay: 2 }}
                      className="w-24 h-24 rounded-2xl flex items-center justify-center relative"
                      style={{ background: `linear-gradient(135deg, ${glowColor}30, ${glowColor}10)`, boxShadow: `0 0 40px ${glowColor}30` }}
                    >
                      {template.parcel_type === 'mega' ? (
                        <Sparkles className="w-12 h-12" style={{ color: glowColor }} />
                      ) : (
                        <Gift className="w-12 h-12" style={{ color: glowColor }} />
                      )}
                      {isLocked && (
                        <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-background rounded-full flex items-center justify-center border border-amber-200/60">
                          <Lock className="w-4 h-4 text-orange-400" />
                        </div>
                      )}
                    </motion.div>
                  </div>

                  {/* Title */}
                  <h2 className="text-xl font-bold text-center text-foreground">{template.name}</h2>
                  <p className="text-sm text-muted-foreground text-center mt-1">{template.description}</p>

                  {/* Reward Preview */}
                  <div className="mt-5 p-4 rounded-xl bg-white/5 border border-amber-200/60">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Reward</span>
                      <span className="text-lg font-bold text-amber-400">
                        🎁 {template.reward_label || `${template.reward_amount} ${template.reward_type}`}
                      </span>
                    </div>
                  </div>

                  {/* Progress bar (if locked) */}
                  {isLocked && parcel.required_progress > 0 && (
                    <div className="mt-4">
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>{CONDITION_LABELS[template.unlock_condition] || 'Complete task'}</span>
                        <span>{parcel.current_progress}/{parcel.required_progress}</span>
                      </div>
                      <div className="h-2 bg-amber-50/70 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min((parcel.current_progress / parcel.required_progress) * 100, 100)}%` }}
                          className="h-full rounded-full"
                          style={{ background: `linear-gradient(to right, ${glowColor}, ${glowColor}cc)` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Timers */}
                  <div className="mt-4 space-y-2">
                    {unlockCountdown && (
                      <div className="flex items-center gap-2 text-sm">
                        <Timer className="w-4 h-4 text-blue-400" />
                        <span className="text-muted-foreground">Unlocks in:</span>
                        <span className="text-blue-400 font-mono font-bold">{unlockCountdown}</span>
                      </div>
                    )}
                    {expiryCountdown && (
                      <div className="flex items-center gap-2 text-sm">
                        <Timer className="w-4 h-4 text-amber-400" />
                        <span className="text-muted-foreground">Expires in:</span>
                        <span className="text-amber-400 font-mono font-bold">{expiryCountdown}</span>
                      </div>
                    )}
                  </div>

                  {/* CTA */}
                  <div className="mt-6">
                    {canOpen ? (
                      <Button
                        onClick={handleClaim}
                        disabled={isClaiming}
                        variant="premium"
                        size="lg"
                        className="w-full text-base"
                      >
                        {isClaiming ? 'Opening...' : '🎁 Open Now'}
                      </Button>
                    ) : isLocked ? (
                      <Button variant="outline" size="lg" className="w-full" disabled>
                        <Lock className="w-4 h-4 mr-2" />
                        Complete Task to Unlock
                      </Button>
                    ) : unlockCountdown ? (
                      <Button variant="secondary" size="lg" className="w-full" disabled>
                        <Timer className="w-4 h-4 mr-2" />
                        Wait {unlockCountdown}
                      </Button>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
