import { useState, useEffect, useRef, useCallback, forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Gift, X, Upload, CheckCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { getAppSetting } from '@/utils/appSettingsCache';
import { useAppSyncEvent } from '@/hooks/useAppSyncEvent';
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

  // Any submitted claim blocks this popup forever; terminal decisions stay in history only.
  const isLocked = latestStatus === 'pending' || latestStatus === 'approved' || latestStatus === 'rejected';

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

      const [enabledValue, amountValue] = await Promise.all([
        getAppSetting<unknown>('rating_popup_enabled'),
        getAppSetting<unknown>('rating_reward_amounts'),
      ]);

      const enabled =
        enabledValue === true ||
        enabledValue === 'true' ||
        localStorage.getItem(RATING_PENDING_KEY) === 'true';

      if (!enabled) return;

      try {
        const cfg = typeof amountValue === 'string' ? JSON.parse(amountValue) : amountValue;
        const hb = Number((cfg as any)?.host_beans);
        const ud = Number((cfg as any)?.user_diamonds);
        if (Number.isFinite(hb) && hb > 0 && Number.isFinite(ud) && ud > 0) {
          setRewardAmounts({ host_beans: hb, user_diamonds: ud });
        }
      } catch { /* keep null → popup hidden */ }

      await refreshLatestClaim(user.id);
      setIsEnabled(true);
    };

    void checkClaim();
  }, [refreshLatestClaim]);

  // Pkg91: rating_reward_claims not in supabase_realtime publication.
  // Use app_sync trigger (tg_app_sync_rating_reward_claims) via useAppSyncEvent.
  useAppSyncEvent(
    ['rating_reward_claims'],
    () => { if (userId) void refreshLatestClaim(userId); },
    !!userId,
  );



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
      // Per spec: admin approves/rejects the screenshot manually. We do NOT
      // hard-block the user with a client-side Vision pre-check anymore —
      // that was rejecting legitimate Play Store screenshots (non-English
      // locales, different layouts, dark mode, etc.) and preventing upload.
      // The image still goes through admin review in AdminRatingRewards.
      // Fire-and-forget hint to the Vision function for telemetry only.
      try {
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve) => {
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
        base64Promise.then((b64) => {
          supabase.functions
            .invoke('verify-rating-screenshot', { body: { base64_image: b64 } })
            .catch(() => { /* hint only — never blocks upload */ });
        });
      } catch { /* ignore hint failures */ }

      // Upload to storage
      const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
      const path = `${userId}/rating_${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('rating-screenshots')
        .upload(path, file, { contentType: file.type || 'image/png', upsert: false });

      if (uploadError) {
        console.error('Rating screenshot upload error:', uploadError);
        toast.error(uploadError.message || 'Failed to upload screenshot. Please try again.');
        return;
      }

      const screenshotRef = path;

      // Detect platform (Capacitor native → android/ios, otherwise web)
      let platform = 'web';
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (Capacitor?.isNativePlatform?.()) {
          platform = Capacitor.getPlatform() || 'android';
        }
      } catch { /* web fallback */ }

      // Server-side RPC decides reward type (host beans vs user diamonds) + amount
      // from admin app_settings. Client cannot inflate reward.
      const { data: rpcResult, error: rpcError } = await supabase.rpc('submit_rating_proof', {
        _screenshot_url: screenshotRef,
        _platform: platform,
      });

      if (rpcError) {
        console.error('Rating claim RPC error:', rpcError);
        toast.error(rpcError.message || 'Failed to submit claim');
        return;
      }

      const result = rpcResult as { success?: boolean; error?: string; status?: string } | null;
      if (!result?.success) {
        const code = result?.error;
        if (code === 'already_submitted') {
          toast.error(result?.status === 'approved'
            ? 'You have already claimed this reward'
            : 'Your previous submission is still under review');
        } else if (code === 'reward_not_configured') {
          toast.error('Reward is temporarily unavailable. Please try later.');
        } else if (code === 'unauthorized') {
          toast.error('Please sign in to submit a proof');
        } else {
          toast.error('Failed to submit claim');
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
                <img loading="lazy" decoding="async" 
                  src={ratingBannerImg}
                  alt="Rate us and get reward"
                  className="w-full h-auto" />
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
          className="max-w-sm mx-auto border-0 p-0 overflow-hidden rounded-[24px]"
          style={{
            background: 'radial-gradient(120% 80% at 50% 0%, #ffffff 0%, #fff8ec 55%, #fef3e0 100%)',
            boxShadow:
              '0 30px 60px -20px rgba(180,83,9,0.30), 0 0 0 1px rgba(251,191,36,0.30), 0 0 60px rgba(245,158,11,0.18)',
          }}
        >
          {step === 'screenshot' && (
            <>
              <DialogHeader className="px-5 pt-5 pb-0">
                <DialogTitle className="text-center text-base font-extrabold tracking-wide">
                  <span
                    className="bg-clip-text text-transparent"
                    style={{
                      backgroundImage:
                        'linear-gradient(180deg, #f59e0b 0%, #d97706 50%, #92400e 100%)',
                    }}
                  >
                    📸 Submit Rating Proof
                  </span>
                </DialogTitle>
              </DialogHeader>
              <div className="p-5 space-y-4">
                {latestStatus === 'rejected' && (
                  <div className="rounded-xl px-4 py-3 text-xs leading-relaxed"
                    style={{
                      background: 'linear-gradient(135deg, #fee2e2, #fecaca)',
                      border: '1px solid rgba(220,38,38,0.30)',
                      color: '#7f1d1d',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)',
                    }}
                  >
                    <div className="font-extrabold text-red-700 mb-1">Previous submission rejected</div>
                    <div className="text-red-800/85">
                      {rejectionReason || 'Screenshot did not show a valid 5-star rating.'}
                    </div>
                    <div className="text-red-700/70 mt-1.5">Please upload a clearer screenshot to try again.</div>
                  </div>
                )}
                <div className="rounded-2xl p-5 text-center relative overflow-hidden"
                  style={{
                    background: 'linear-gradient(135deg, #fff7d6 0%, #fef3c7 55%, #ffedd5 100%)',
                    border: '1px solid rgba(180,83,9,0.25)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8), 0 8px 24px -12px rgba(120,53,15,0.18)',
                  }}
                >
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-16 rounded-full opacity-40"
                    style={{ background: 'radial-gradient(ellipse, rgba(251,191,36,0.65), transparent)' }}
                  />
                  <div className="relative">
                    <div className="w-14 h-14 mx-auto mb-3 rounded-2xl flex items-center justify-center"
                      style={{
                        background: 'linear-gradient(135deg, #fde68a, #f59e0b)',
                        border: '1px solid rgba(180,83,9,0.35)',
                        boxShadow: '0 6px 18px rgba(245,158,11,0.35), inset 0 1px 0 rgba(255,255,255,0.6)',
                      }}
                    >
                      <Gift className="w-7 h-7 text-amber-950" />
                    </div>
                    <p className="font-extrabold text-lg tracking-wide text-amber-900">Claim Your Reward</p>
                    <div className="flex items-center justify-center gap-2 mt-3 flex-wrap">
                      <span className="text-[11px] font-extrabold px-3 py-1.5 rounded-lg text-amber-900"
                        style={{
                          background: 'linear-gradient(180deg, #ffffff, #fde68a)',
                          border: '1px solid rgba(180,83,9,0.30)',
                          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), 0 2px 4px rgba(180,83,9,0.08)',
                        }}
                      >
                        Hosts: {rewardAmounts.host_beans.toLocaleString()} 🫘
                      </span>
                      <span className="text-amber-700/60 text-xs">•</span>
                      <span className="text-[11px] font-extrabold px-3 py-1.5 rounded-lg text-violet-900"
                        style={{
                          background: 'linear-gradient(180deg, #ffffff, #ede9fe)',
                          border: '1px solid rgba(139,92,246,0.30)',
                          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), 0 2px 4px rgba(139,92,246,0.10)',
                        }}
                      >
                        Users: {rewardAmounts.user_diamonds.toLocaleString()} 💎
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-slate-600 text-xs text-center leading-relaxed font-medium">
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
                    className="w-full h-12 gap-2 font-black rounded-2xl border-0 relative overflow-hidden"
                    style={{
                      background: uploading
                        ? 'linear-gradient(180deg, #fde68a, #fbbf24)'
                        : 'linear-gradient(180deg, #fde68a 0%, #f59e0b 38%, #b45309 100%)',
                      boxShadow: uploading
                        ? 'inset 0 1px 0 rgba(255,255,255,0.5)'
                        : '0 14px 30px -10px rgba(245,158,11,0.6), inset 0 1px 0 rgba(255,255,255,0.55), inset 0 -2px 0 rgba(120,53,15,0.5)',
                      color: '#3b1e05',
                      textShadow: '0 1px 0 rgba(255,255,255,0.5)',
                    }}
                  >
                    {uploading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-amber-950/30 border-t-amber-950 rounded-full animate-spin" />
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

                <p className="text-slate-500 text-[10px] text-center font-medium">
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
                    background: 'linear-gradient(180deg, #34d399, #059669)',
                    border: '1px solid rgba(5,150,105,0.40)',
                    boxShadow: '0 8px 24px rgba(16,185,129,0.40), inset 0 1px 0 rgba(255,255,255,0.5)',
                  }}
                >
                  <CheckCircle className="w-9 h-9 text-white" />
                </div>
              </motion.div>
              <div>
                <p className="font-black text-lg text-emerald-900">Submitted Successfully! 🎉</p>
                <p className="text-slate-600 text-sm mt-2 leading-relaxed">
                  Your screenshot has been submitted for review. You'll receive your reward once approved by admin.
                </p>
              </div>
              <div className="flex items-center justify-center gap-2 text-amber-700 text-xs font-semibold">
                <Clock className="w-3.5 h-3.5" />
                Usually reviewed within 24 hours
              </div>
              <Button
                onClick={() => setShowDialog(false)}
                className="w-full h-11 rounded-2xl font-black border-0 relative overflow-hidden"
                style={{
                  background: 'linear-gradient(180deg, #fde68a 0%, #f59e0b 38%, #b45309 100%)',
                  boxShadow: '0 12px 26px -10px rgba(245,158,11,0.55), inset 0 1px 0 rgba(255,255,255,0.5), inset 0 -2px 0 rgba(120,53,15,0.5)',
                  color: '#3b1e05',
                  textShadow: '0 1px 0 rgba(255,255,255,0.5)',
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
