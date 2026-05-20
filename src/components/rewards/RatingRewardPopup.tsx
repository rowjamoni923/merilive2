import { useState, useEffect, useRef, useCallback, forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Gift, X, Upload, CheckCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { PLAY_STORE_URL } from '@/utils/shareLinks';
import { onAppStateChange } from '@/utils/nativeUtils';
import ratingBannerImg from '@/assets/rating-reward-banner.jpg';

type Step = 'banner' | 'screenshot' | 'submitted';

const RATING_PENDING_KEY = 'rating_reward_return_pending';

declare global {
  interface WindowEventMap {
    'open-rating-banner': CustomEvent;
    'open-rating-proof-popup': CustomEvent;
  }
}

const RatingRewardPopup = forwardRef<HTMLDivElement>(function RatingRewardPopup(_, _ref) {
  const [showBanner, setShowBanner] = useState(false);
  const [step, setStep] = useState<Step>('banner');
  const [showDialog, setShowDialog] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [latestStatus, setLatestStatus] = useState<'pending' | 'approved' | 'rejected' | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isEnabled, setIsEnabled] = useState(false);
  const [rewardAmounts, setRewardAmounts] = useState<{ host_beans: number; user_diamonds: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Pkg63 — pending/approved blocks new submissions; rejected → allow retry.
  const isLocked = latestStatus === 'pending' || latestStatus === 'approved';

  const refreshLatestClaim = useCallback(async (uid: string) => {
    const { data } = await supabase
      .from('rating_reward_claims')
      .select('status, rejection_reason')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setLatestStatus((data?.status as 'pending' | 'approved' | 'rejected' | null) ?? null);
    setRejectionReason(data?.rejection_reason ?? null);
  }, []);

  useEffect(() => {
    const checkClaim = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const [{ data: settingData }, { data: amountData }] = await Promise.all([
        supabase.from('app_settings').select('setting_value').eq('setting_key', 'rating_popup_enabled').maybeSingle(),
        supabase.from('app_settings').select('setting_value').eq('setting_key', 'rating_reward_amounts').maybeSingle(),
      ]);

      const enabled =
        settingData?.setting_value === true ||
        settingData?.setting_value === 'true' ||
        localStorage.getItem(RATING_PENDING_KEY) === 'true';

      if (!enabled) return;

      try {
        const raw = amountData?.setting_value;
        const cfg = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const hb = Number(cfg?.host_beans);
        const ud = Number(cfg?.user_diamonds);
        if (Number.isFinite(hb) && hb > 0 && Number.isFinite(ud) && ud > 0) {
          setRewardAmounts({ host_beans: hb, user_diamonds: ud });
        }
      } catch { /* keep null → popup hidden */ }

      await refreshLatestClaim(user.id);
      setIsEnabled(true);
    };

    void checkClaim();
  }, [refreshLatestClaim]);

  // Pkg63 — realtime: admin approve/reject reflects in user UI within 1s.
  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`rating-claim-status-${userId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'rating_reward_claims',
        filter: `user_id=eq.${userId}`,
      }, () => { void refreshLatestClaim(userId); })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [userId, refreshLatestClaim]);


  const openProofDialog = useCallback(() => {
    localStorage.removeItem(RATING_PENDING_KEY);
    setShowBanner(false);
    setStep('screenshot');
    setShowDialog(true);
  }, []);

  const openPendingProofIfNeeded = useCallback(() => {
    if (localStorage.getItem(RATING_PENDING_KEY) !== 'true') return false;
    openProofDialog();
    return true;
  }, [openProofDialog]);

  useEffect(() => {
    if (!isEnabled || isLocked) return;

    openPendingProofIfNeeded();

    return undefined;
  }, [isLocked, isEnabled, openPendingProofIfNeeded]);

  useEffect(() => {
    if (!isEnabled || isLocked) return;

    // The old in-component "rate us" banner is fully retired.
    // The ONLY rating banner shown to users now comes from the admin-managed
    // `rating_banners` table via <FullScreenPromoBanners />. That banner
    // dispatches "open-rating-proof-popup" when tapped, which opens the
    // proof / claim flow below. Same behaviour on web and native Android.
    const handleOpenProof = () => {
      openProofDialog();
    };

    window.addEventListener('open-rating-proof-popup', handleOpenProof);

    return () => {
      window.removeEventListener('open-rating-proof-popup', handleOpenProof);
    };
  }, [isLocked, isEnabled, openProofDialog]);

  useEffect(() => {
    if (!isEnabled || isLocked) return;

    const handleFocus = () => {
      openPendingProofIfNeeded();
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        openPendingProofIfNeeded();
      }
    };

    const cleanup = onAppStateChange((isActive) => {
      if (isActive) openPendingProofIfNeeded();
    });

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cleanup();
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isLocked, isEnabled, openPendingProofIfNeeded]);

  const handleOpenPlayStore = async () => {
    sessionStorage.setItem('rating_popup_dismissed', 'true');
    localStorage.setItem(RATING_PENDING_KEY, 'true');
    setShowBanner(false);

    try {
      const { openInApp } = await import('@/utils/inAppNavigation');
      await openInApp(PLAY_STORE_URL);
    } catch {
      window.location.href = PLAY_STORE_URL;
    }
  };

  const handleDismiss = () => {
    setShowBanner(false);
    sessionStorage.setItem('rating_popup_dismissed', 'true');
  };

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'png';
      const path = `${userId}/rating_${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('rating-screenshots')
        .upload(path, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('rating-screenshots')
        .getPublicUrl(path);

      // Detect platform (Capacitor native → android/ios, otherwise web)
      let platform = 'web';
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (Capacitor?.isNativePlatform?.()) {
          platform = Capacitor.getPlatform() || 'android';
        }
      } catch { /* web fallback */ }

      const { error: claimError } = await supabase
        .from('rating_reward_claims')
        .insert({
          user_id: userId,
          screenshot_url: urlData.publicUrl,
          platform,
        });

      if (claimError) {
        if (claimError.code === '23505') {
          toast.error('You have already submitted a rating claim');
        } else {
          console.error('Rating claim insert error:', claimError);
          toast.error(claimError.message || 'Failed to submit claim');
        }
        return;
      }

      setStep('submitted');
      setLatestStatus('pending');
      setRejectionReason(null);
      toast.success('Screenshot submitted! Reward will be credited after admin approval.');
    } catch (err) {
      console.error('Upload error:', err);
      toast.error('Failed to upload screenshot');
    } finally {
      setUploading(false);
    }
  }, [userId]);

  if (isLocked || !isEnabled || !rewardAmounts) return null;

  return (
    <>
      <AnimatePresence>
        {showBanner && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-white/80 backdrop-blur-sm p-4"
            onClick={handleDismiss}
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative w-full max-w-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={handleDismiss}
                className="absolute -top-3 -right-3 z-10 w-9 h-9 rounded-full bg-white/80 border border-amber-200/60 flex items-center justify-center text-slate-700 hover:text-white hover:bg-white/80 transition-all shadow-lg"
              >
                <X className="w-4 h-4" />
              </button>

              <div
                className="relative rounded-2xl overflow-hidden cursor-pointer shadow-2xl"
                onClick={handleOpenPlayStore}
                style={{
                  border: '2px solid rgba(251,191,36,0.3)',
                  boxShadow: '0 25px 80px rgba(124,58,237,0.6), 0 0 40px rgba(251,191,36,0.15)',
                }}
              >
                <img
                  src={ratingBannerImg}
                  alt="Rate us and get reward"
                  className="w-full h-auto"
                />
                <div className="absolute inset-0 rounded-2xl border-2 border-amber-400/20 pointer-events-none" />
                <div className="absolute inset-0 bg-gradient-to-t from-amber-50 via-transparent to-transparent pointer-events-none" />
              </div>

              <button
                onClick={handleDismiss}
                className="mt-4 mx-auto block text-slate-500 text-sm hover:text-slate-700 transition-colors"
              >
                Skip
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <Dialog open={showDialog} onOpenChange={(open) => { if (!open) setShowDialog(false); }}>
        <DialogContent
          className="max-w-sm mx-auto border-0 p-0 overflow-hidden"
          style={{
            background: 'linear-gradient(180deg, #1a0533 0%, #0f0a1a 100%)',
            border: '1px solid rgba(167,139,250,0.3)',
          }}
        >
          {step === 'screenshot' && (
            <>
              <DialogHeader className="px-5 pt-5 pb-0">
                <DialogTitle className="text-white text-center text-base font-bold tracking-wide">
                  📸 Submit Rating Proof
                </DialogTitle>
              </DialogHeader>
              <div className="p-5 space-y-4">
                {latestStatus === 'rejected' && (
                  <div className="rounded-xl px-4 py-3 text-xs leading-relaxed"
                    style={{
                      background: 'linear-gradient(135deg, rgba(239,68,68,0.12), rgba(220,38,38,0.05))',
                      border: '1px solid rgba(239,68,68,0.3)',
                      color: '#fca5a5',
                    }}
                  >
                    <div className="font-bold text-red-300 mb-1">Previous submission rejected</div>
                    <div className="text-red-200/80">
                      {rejectionReason || 'Screenshot did not show a valid 5-star rating.'}
                    </div>
                    <div className="text-red-200/60 mt-1.5">Please upload a clearer screenshot to try again.</div>
                  </div>
                )}
                <div className="rounded-2xl p-5 text-center relative overflow-hidden"
                  style={{
                    background: 'linear-gradient(135deg, rgba(251,191,36,0.08) 0%, rgba(124,58,237,0.06) 100%)',
                    border: '1px solid rgba(251,191,36,0.2)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
                  }}
                >
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
                        Hosts: {rewardAmounts.host_beans.toLocaleString()} 🫘
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
                        Users: {rewardAmounts.user_diamonds.toLocaleString()} 💎
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
                    onChange={handleFileSelect}
                    className="hidden"
                  />

                  <Button
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="w-full h-12 gap-2 font-bold rounded-xl text-white border-0"
                    style={{
                      background: uploading
                        ? 'rgba(167,139,250,0.15)'
                        : 'linear-gradient(135deg, #7c3aed, #a855f7)',
                      boxShadow: uploading ? 'none' : '0 4px 24px rgba(124,58,237,0.4), inset 0 1px 0 rgba(255,255,255,0.1)',
                    }}
                  >
                    {uploading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-amber-200/60 border-t-white rounded-full animate-spin" />
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
          )}

          {step === 'submitted' && (
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
                <p className="text-white font-bold text-lg">Submitted Successfully! 🎉</p>
                <p className="text-purple-200/50 text-sm mt-2 leading-relaxed">
                  Your screenshot has been submitted for review. You'll receive your reward once approved by admin.
                </p>
              </div>
              <div className="flex items-center justify-center gap-2 text-amber-400/50 text-xs">
                <Clock className="w-3.5 h-3.5" />
                Usually reviewed within 24 hours
              </div>
              <Button
                onClick={() => setShowDialog(false)}
                className="w-full h-10 rounded-xl text-white font-bold border-0"
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
    </>
  );
});

export default RatingRewardPopup;
