/**
 * CampaignFloatingButton — Floating button with per-session countdown timer.
 * Uses admin-selected template for popup styling.
 * Payment methods shown inline (no navigation to /recharge).
 */
import { useState, useEffect, useCallback, useRef, type ChangeEvent } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { X, CreditCard, Wallet, Globe, Copy, Check, Upload } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { CAMPAIGN_TEMPLATES, type CampaignTemplate } from '@/components/admin/CampaignTemplates';
import { useToast } from '@/hooks/use-toast';
import { Capacitor } from '@capacitor/core';
import playStoreBilling, { PLAY_STORE_PRODUCTS } from '@/sdk/PlayStoreBillingSDK';

interface Campaign {
  id: string;
  campaign_name: string;
  campaign_type: string;
  original_price_usd: number;
  offer_price_usd: number | null;
  diamonds_amount: number;
  bonus_diamonds: number;
  bonus_percentage: number | null;
  duration_minutes: number;
  banner_image_url: string | null;
  badge_text: string | null;
  target_audience: string;
  is_first_recharge_only: boolean;
  priority: number;
  schedule_start: string | null;
  schedule_end: string | null;
  template_id?: string | null;
}

interface HelperMethod {
  id: string;
  helper_id: string;
  method_name: string;
  method_type: string;
  account_name: string;
  account_number: string;
  logo_url: string | null;
  instructions?: string | null;
  additional_info?: any;
}

interface MatchedPackage {
  id: string;
  coins_amount: number;
  price_usd: number;
}

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return '00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const SESSION_KEY = 'campaign_session_start';
const PURCHASED_KEY = 'campaign_purchased_';

type PaymentTab = 'google' | 'recommend' | 'skrill';
type PopupView = 'main' | 'payment_select' | 'payment_number';
type PaymentStep = 'form' | 'processing' | 'pending';

export function CampaignFloatingButton() {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [showPopup, setShowPopup] = useState(false);
  const [isHost, setIsHost] = useState<boolean | null>(null);
  const [purchased, setPurchased] = useState(false);
  const [isBangladesh, setIsBangladesh] = useState(true);
  const [userCountryCode, setUserCountryCode] = useState('BD');
  const [popupView, setPopupView] = useState<PopupView>('main');
  const [helperMethods, setHelperMethods] = useState<HelperMethod[]>([]);
  const [currentMethodIndex, setCurrentMethodIndex] = useState(0);
  const [copiedNumber, setCopiedNumber] = useState(false);
  const [loadingMethods, setLoadingMethods] = useState(false);
  const [matchedPackage, setMatchedPackage] = useState<MatchedPackage | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [helperPaymentStep, setHelperPaymentStep] = useState<PaymentStep>('form');
  const [helperPaymentProcessing, setHelperPaymentProcessing] = useState(false);
  const [helperTransactionId, setHelperTransactionId] = useState('');
  const [helperPaymentProof, setHelperPaymentProof] = useState<string | null>(null);
  const [uploadingHelperProof, setUploadingHelperProof] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setIsHost(null); return; }
      setUserId(user.id);
      const { data } = await supabase
        .from('profiles')
        .select('gender, country_code')
        .eq('id', user.id)
        .single();
      setIsHost(data?.gender === 'Female');
      const cc = (data?.country_code || 'BD').toUpperCase();
      setUserCountryCode(cc);
      setIsBangladesh(cc === 'BD');
    })();
  }, []);

  const fetchCampaign = useCallback(async () => {
    const { data } = await supabase
      .from('recharge_campaigns')
      .select('*')
      .eq('is_active', true)
      .order('priority', { ascending: false })
      .limit(1);

    if (data && data.length > 0) {
      const c = data[0] as Campaign;
      const now = new Date();
      if (c.schedule_start && new Date(c.schedule_start) > now) { setCampaign(null); return; }
      if (c.schedule_end && new Date(c.schedule_end) < now) { setCampaign(null); return; }

      if (localStorage.getItem(PURCHASED_KEY + c.id)) {
        setPurchased(true);
        setCampaign(null);
        return;
      }

      const sessionKey = SESSION_KEY + '_' + c.id;
      let sessionStart = sessionStorage.getItem(sessionKey);
      if (!sessionStart) {
        sessionStart = String(Date.now());
        sessionStorage.setItem(sessionKey, sessionStart);
      }

      const startMs = parseInt(sessionStart, 10);
      const endMs = startMs + (c.duration_minutes * 60 * 1000);
      const remaining = Math.max(0, Math.floor((endMs - Date.now()) / 1000));

      if (remaining <= 0) { setCampaign(null); return; }
      setCampaign(c);
      setRemainingSeconds(remaining);
    } else {
      setCampaign(null);
    }
  }, []);

  useEffect(() => { fetchCampaign(); }, [fetchCampaign]);

  useEffect(() => {
    if (!campaign || remainingSeconds <= 0) return;
    timerRef.current = setInterval(() => {
      setRemainingSeconds(prev => {
        if (prev <= 1) { setCampaign(null); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [campaign, remainingSeconds]);

  const fetchMatchedPackage = useCallback(async (activeCampaign: Campaign) => {
    const { data } = await supabase
      .from('coin_packages')
      .select('id, coins_amount, price_usd')
      .eq('is_active', true);

    const matched = (data || []).find((pkg: any) => (
      Number(pkg.coins_amount) === Number(activeCampaign.diamonds_amount) &&
      Math.abs(Number(pkg.price_usd) - Number(activeCampaign.original_price_usd)) < 0.01
    ));

    setMatchedPackage(matched || null);
  }, []);

  const fetchHelperPaymentMethods = useCallback(async () => {
    setLoadingMethods(true);
    try {
      const [legacyRes, countryRes] = await Promise.all([
        supabase.from('helper_payment_methods').select('id, helper_id, account_name, account_number, is_active, method_type, additional_info').eq('is_active', true),
        supabase.from('helper_country_payment_methods').select('id, helper_id, country_code, payment_method_name, icon_url, is_active, account_name, account_number, logo_url, method_type, additional_info').eq('country_code', userCountryCode).eq('is_active', true),
      ]);

      const legacyNorm = (legacyRes.data || []).map((m: any) => ({
        id: m.id,
        helper_id: m.helper_id,
        method_name: m.method_type,
        method_type: m.method_type,
        account_name: m.account_name,
        account_number: m.account_number,
        logo_url: (m.additional_info as any)?.logo_url || null,
        instructions: (m.additional_info as any)?.instructions || null,
        additional_info: m.additional_info || null,
      }));

      const countryNorm = (countryRes.data || []).map((m: any) => ({
        id: m.id,
        helper_id: m.helper_id || `country-${m.id}`,
        method_name: m.payment_method_name,
        method_type: m.method_type || m.payment_method_name,
        account_name: m.account_name || m.payment_method_name,
        account_number: m.account_number || '',
        logo_url: m.logo_url || m.icon_url || null,
        instructions: (m.additional_info as any)?.instructions || null,
        additional_info: m.additional_info || null,
      }));

      const combined = [...legacyNorm, ...countryNorm].filter(m => Boolean(m.account_number));
      const helperIds = [...new Set(combined.map(m => m.helper_id).filter((id: string) => !id.startsWith('country-')))];

      let validHelperIds = new Set<string>();
      if (helperIds.length > 0) {
        const { data: helpers } = await supabase
          .from('topup_helpers')
          .select('id, user_id, wallet_balance, trader_level, payroll_enabled, is_active, is_verified')
          .in('id', helperIds);

        const userIds = (helpers || []).map(h => h.user_id).filter(Boolean);
        const agencyResults = await Promise.all(userIds.map(uid => supabase.rpc('get_agency_diamond_balance', { owner_user_id: uid })));
        const agencyMap = new Map<string, number>();
        userIds.forEach((uid, i) => agencyMap.set(uid, (agencyResults[i]?.data as number) ?? 0));

        (helpers || []).forEach(h => {
          const combinedBalance = (h.wallet_balance ?? 0) + (agencyMap.get(h.user_id) ?? 0);
          if (h.trader_level === 5 && h.payroll_enabled && combinedBalance >= 300000 && h.is_verified && h.is_active) {
            validHelperIds.add(h.id);
          }
        });
      }

      const valid = combined.filter(m => validHelperIds.has(m.helper_id) || m.helper_id.startsWith('country-'));
      const seen = new Set<string>();
      const unique = valid.filter(m => {
        const key = `${m.method_name}-${m.account_number}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      setHelperMethods(unique);
      setCurrentMethodIndex(0);
    } catch (e) {
      console.error('Error fetching helper payment methods:', e);
    }
    setLoadingMethods(false);
  }, [userCountryCode]);

  if (isHost === true || isHost === null || !campaign || remainingSeconds <= 0 || purchased) return null;

  const template: CampaignTemplate = CAMPAIGN_TEMPLATES.find(t => t.id === campaign.template_id) || CAMPAIGN_TEMPLATES[0];
  const discountPercent = campaign.offer_price_usd && campaign.original_price_usd > 0
    ? Math.round((1 - campaign.offer_price_usd / campaign.original_price_usd) * 100)
    : campaign.bonus_percentage ?? 0;
  const bonusText = discountPercent > 0 ? `${discountPercent}%` : '';
  const currentMethod = helperMethods[currentMethodIndex] || null;

  const convertToLocalCurrency = useCallback((usdAmount: number) => {
    if (userCountryCode === 'BD') return `৳${Math.round(usdAmount * 120)}`;
    return `$${usdAmount.toFixed(2)}`;
  }, [userCountryCode]);

  const copyToClipboard = useCallback(async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedNumber(true);
    toast({ title: 'Copied!', description: text });
    setTimeout(() => setCopiedNumber(false), 2000);
  }, [toast]);

  const handleBuyNow = () => setPopupView('payment_select');

  const resetHelperForm = useCallback(() => {
    setHelperPaymentStep('form');
    setHelperTransactionId('');
    setHelperPaymentProof(null);
    setUploadingHelperProof(false);
    setHelperPaymentProcessing(false);
  }, []);

  const closePopup = () => {
    setShowPopup(false);
    setPopupView('main');
    setCopiedNumber(false);
    resetHelperForm();
  };

  const handleSelectPayment = async (tab: PaymentTab) => {
    if (tab === 'google') {
      if (Capacitor.isNativePlatform()) {
        try {
          const diamonds = campaign.diamonds_amount;
          const product = PLAY_STORE_PRODUCTS[diamonds];
          const productId = product?.productId || Object.values(PLAY_STORE_PRODUCTS)[0]?.productId;
          if (!productId) { toast({ title: 'Product not found', variant: 'destructive' }); return; }
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) { toast({ title: 'Please login first', variant: 'destructive' }); return; }
          const result = await playStoreBilling.purchase(productId, user.id);
          if (result.success) {
            localStorage.setItem(PURCHASED_KEY + campaign.id, 'true');
            setPurchased(true);
            setShowPopup(false);
            toast({ title: 'Purchase successful!', description: 'Diamonds added to your account' });
          } else {
            toast({ title: 'Payment failed', description: result.error, variant: 'destructive' });
          }
        } catch {
          toast({ title: 'Payment failed', variant: 'destructive' });
        }
      } else {
        toast({ title: 'Google Play', description: 'Available on Android app only' });
      }
      return;
    }

    if (tab === 'recommend') {
      await Promise.all([fetchHelperPaymentMethods(), fetchMatchedPackage(campaign)]);
      resetHelperForm();
      setPopupView('payment_number');
      return;
    }

    if (tab === 'skrill') {
      toast({ title: 'Skrill', description: 'Skrill payment coming soon' });
    }
  };

  const handleShowNextNumber = () => {
    if (helperMethods.length > 1) {
      setCurrentMethodIndex(prev => (prev + 1) % helperMethods.length);
      setHelperTransactionId('');
      setHelperPaymentProof(null);
    }
  };

  const handleUploadHelperProof = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;

    setUploadingHelperProof(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('payment-proofs').upload(fileName, file);
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from('payment-proofs').getPublicUrl(fileName);
      setHelperPaymentProof(data.publicUrl);
      toast({ title: 'Screenshot uploaded' });
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message || 'Failed to upload screenshot', variant: 'destructive' });
    } finally {
      setUploadingHelperProof(false);
      e.target.value = '';
    }
  };

  const handleHelperPaymentSubmit = async () => {
    if (!campaign || !matchedPackage || !currentMethod || !userId) {
      toast({ title: 'Error', description: 'Missing required information', variant: 'destructive' });
      return;
    }

    if (!helperTransactionId.trim()) {
      toast({ title: 'Transaction ID Required', description: 'Please enter your payment transaction ID', variant: 'destructive' });
      return;
    }

    setHelperPaymentProcessing(true);
    setHelperPaymentStep('processing');

    try {
      const localAmount = userCountryCode === 'BD' ? campaign.original_price_usd * 120 : campaign.original_price_usd;
      const gwType = String(currentMethod.additional_info?.gateway_type || '').toLowerCase();

      if (gwType === 'zinipay') {
        const { data, error } = await supabase.functions.invoke('create-zinipay-payment', {
          body: {
            package_id: matchedPackage.id,
            payment_method_id: currentMethod.id,
            origin_url: window.location.origin,
            transaction_id: helperTransactionId.trim(),
            payment_proof: helperPaymentProof,
            skip_redirect: true,
          },
        });

        if (error || data?.error) {
          throw new Error(data?.error || error?.message || 'ZiniPay payment failed');
        }

        setHelperPaymentStep('pending');
        toast({ title: '⚡ Order Created!', description: 'Verifying transaction... Please wait.' });
        return;
      }

      const { error: orderError } = await supabase
        .from('helper_orders')
        .insert({
          helper_id: currentMethod.helper_id,
          user_id: userId,
          customer_id: userId,
          coin_amount: campaign.diamonds_amount,
          diamond_amount: campaign.diamonds_amount,
          amount_usd: campaign.offer_price_usd || campaign.original_price_usd,
          total_price_usd: campaign.offer_price_usd || campaign.original_price_usd,
          amount_local: localAmount,
          local_price: localAmount,
          currency_code: userCountryCode === 'BD' ? 'BDT' : 'USD',
          local_currency: userCountryCode === 'BD' ? 'BDT' : 'USD',
          payment_method: currentMethod.method_name,
          user_country_code: userCountryCode,
          package_id: matchedPackage.id,
          user_payment_proof: helperPaymentProof,
          payment_details: {
            transaction_id: helperTransactionId,
            method_type: currentMethod.method_type,
            account_name: currentMethod.account_name,
            account_number: currentMethod.account_number,
            campaign_id: campaign.id,
          },
          status: 'pending',
        });

      if (orderError) throw orderError;

      setHelperPaymentStep('pending');
      toast({ title: 'Order Submitted!', description: 'Helper will process your order shortly' });
    } catch (error: any) {
      console.error('Campaign helper payment error:', error);
      toast({ title: 'Payment Failed', description: error.message || 'Could not process payment. Please try again.', variant: 'destructive' });
      setHelperPaymentStep('form');
    } finally {
      setHelperPaymentProcessing(false);
    }
  };

  const paymentTabs: { key: PaymentTab; label: string; icon: React.ReactNode; description: string }[] = [
    { key: 'google', label: 'Google Pay', icon: <CreditCard className="w-5 h-5" />, description: 'Pay with Google Play' },
    { key: 'recommend', label: 'Recommended', icon: <Wallet className="w-5 h-5" />, description: 'Local payment methods' },
    ...(!isBangladesh ? [{ key: 'skrill' as PaymentTab, label: 'Skrill', icon: <Globe className="w-5 h-5" />, description: 'International payment' }] : []),
  ];

  return (
    <>
      <AnimatePresence>
        {!showPopup && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="fixed z-[45] flex flex-col items-center"
            style={{ bottom: 'calc(var(--bottom-nav-height, 64px) + 48px)', right: '10px' }}
          >
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 px-3 py-0.5 rounded-full shadow-lg min-w-[54px] text-center"
              style={{ background: 'linear-gradient(135deg, #dc2626, #b91c1c)', boxShadow: '0 4px 15px rgba(220,38,38,0.5)' }}>
              <span className="text-[10px] font-bold text-white tabular-nums">{formatCountdown(remainingSeconds)}</span>
            </div>

            <button
              onClick={() => setShowPopup(true)}
              className="relative w-[76px] h-[76px] rounded-full"
              style={{ filter: 'drop-shadow(0 6px 20px rgba(245,158,11,0.5))' }}
            >
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{ background: 'conic-gradient(from 0deg, #f59e0b, #ef4444, #f59e0b, #eab308, #f59e0b)', padding: '3px' }}
                animate={{ rotate: 360 }}
                transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
              >
                <div className="w-full h-full rounded-full" style={{ background: '#0f0a1a' }} />
              </motion.div>
              <div className="absolute inset-[4px] rounded-full overflow-hidden"
                style={{ border: '2px solid rgba(245,158,11,0.6)', background: 'radial-gradient(circle at 30% 30%, #1a1028, #0a0612)' }}>
                {campaign.banner_image_url ? (
                  <img src={campaign.banner_image_url} alt="" className="w-full h-full rounded-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-3xl">💎</span>
                  </div>
                )}
              </div>
              <motion.div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-yellow-400"
                animate={{ scale: [1, 1.4, 1], opacity: [0.8, 1, 0.8] }}
                transition={{ duration: 1.5, repeat: Infinity }} />
              <motion.div className="absolute -bottom-0.5 -left-0.5 w-2 h-2 rounded-full bg-amber-300"
                animate={{ scale: [1, 1.3, 1], opacity: [0.6, 1, 0.6] }}
                transition={{ duration: 2, repeat: Infinity, delay: 0.5 }} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPopup && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-6"
            onClick={closePopup}
          >
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

            <motion.div
              initial={{ scale: 0.85, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.85, y: 30 }}
              transition={{ type: 'spring', damping: 22, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-[320px] rounded-3xl overflow-hidden shadow-2xl"
              style={{
                background: template.popupBg,
                border: `1.5px solid ${template.popupBorder}`,
                boxShadow: template.accentGlow,
              }}
            >
              <div className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${template.popupBorder}40, transparent)` }} />

              <button onClick={closePopup} className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/10 flex items-center justify-center z-10">
                <X className="w-3.5 h-3.5 text-white/60" />
              </button>

              {popupView === 'main' && (
                <>
                  <div className="relative pt-6 pb-3 flex flex-col items-center">
                    {bonusText && (
                      <div className="relative z-10 px-6 py-3 rounded-xl" style={{ background: template.timerBg, border: `2px solid ${template.popupBorder}80` }}>
                        <p className="text-center">
                          <span className="font-extrabold text-4xl drop-shadow-lg" style={{ color: template.priceColor, textShadow: `0 0 20px ${template.popupBorder}80` }}>
                            {bonusText}
                          </span>
                        </p>
                        <p className="font-bold text-xl text-center tracking-wider" style={{ color: template.subtitleColor, textShadow: `0 0 10px ${template.popupBorder}60` }}>
                          BONUS
                        </p>
                      </div>
                    )}
                    {campaign.badge_text && (
                      <div className="mt-3 px-4 py-1 rounded-full" style={{ background: template.badgeBg }}>
                        <span className="text-xs font-bold" style={{ color: template.badgeText }}>{campaign.badge_text}</span>
                      </div>
                    )}
                  </div>

                  <p className="text-sm font-semibold text-center px-4" style={{ color: template.titleColor }}>
                    {campaign.campaign_name}
                  </p>

                  <div className="flex items-center justify-center gap-2 mt-3">
                    <span className="text-lg">{template.icon}</span>
                    <span className="font-bold text-2xl" style={{ color: template.priceColor }}>
                      {campaign.diamonds_amount.toLocaleString()}
                      {campaign.bonus_diamonds > 0 && (
                        <span className="text-lg ml-1" style={{ color: template.bonusColor }}>+{campaign.bonus_diamonds.toLocaleString()}</span>
                      )}
                    </span>
                  </div>

                  <div className="flex items-center justify-center gap-2 mt-2">
                    {campaign.offer_price_usd && campaign.offer_price_usd < campaign.original_price_usd ? (
                      <>
                        <span className="text-sm line-through opacity-50" style={{ color: template.subtitleColor }}>${campaign.original_price_usd}</span>
                        <span className="font-bold text-xl" style={{ color: template.priceColor }}>${campaign.offer_price_usd}</span>
                      </>
                    ) : (
                      <span className="font-bold text-xl" style={{ color: template.priceColor }}>${campaign.original_price_usd}</span>
                    )}
                  </div>

                  <div className="flex items-center justify-center gap-2 mt-3 mx-6 py-2 rounded-xl" style={{ background: template.timerBg }}>
                    <span className="text-lg">⏰</span>
                    <span className="text-sm font-bold tabular-nums" style={{ color: template.timerText }}>
                      {formatCountdown(remainingSeconds)} remaining
                    </span>
                  </div>

                  <div className="px-5 pt-4 pb-3">
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={handleBuyNow}
                      className="w-full py-3.5 rounded-2xl font-extrabold text-base shadow-lg"
                      style={{ background: template.buttonBg, color: template.buttonText }}
                    >
                      Buy Now
                    </motion.button>
                  </div>

                  <button onClick={closePopup} className="w-full text-center text-[11px] pb-4 opacity-25" style={{ color: template.subtitleColor }}>
                    Not now
                  </button>
                </>
              )}

              {popupView === 'payment_select' && (
                <div className="px-5 pt-6 pb-5">
                  <button onClick={() => setPopupView('main')} className="text-xs mb-3 opacity-60" style={{ color: template.subtitleColor }}>
                    ← Back
                  </button>

                  <div className="flex items-center justify-center gap-2 mb-2">
                    <span className="text-lg">⏰</span>
                    <span className="text-xs font-bold tabular-nums" style={{ color: template.timerText }}>
                      {formatCountdown(remainingSeconds)} remaining
                    </span>
                  </div>

                  <p className="text-[10px] text-center font-medium uppercase tracking-wider mb-3" style={{ color: template.subtitleColor }}>
                    Select Payment Method
                  </p>

                  <div className="space-y-2">
                    {paymentTabs.map((tab) => (
                      <motion.button
                        key={tab.key}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => handleSelectPayment(tab.key)}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all"
                        style={{ borderColor: `${template.popupBorder}30`, background: `${template.popupBorder}10` }}
                      >
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${template.popupBorder}20`, color: template.titleColor }}>
                          {tab.icon}
                        </div>
                        <div className="text-left flex-1">
                          <p className="text-sm font-semibold" style={{ color: template.titleColor }}>{tab.label}</p>
                          <p className="text-[10px] opacity-50" style={{ color: template.subtitleColor }}>{tab.description}</p>
                        </div>
                        <span className="text-xs font-bold" style={{ color: template.priceColor }}>→</span>
                      </motion.button>
                    ))}
                  </div>
                </div>
              )}

              {popupView === 'payment_number' && helperPaymentStep === 'form' && (
                <div className="px-5 pt-5 pb-4">
                  <div className="flex items-center justify-between mb-8">
                    <button
                      type="button"
                      onClick={() => setPopupView('payment_select')}
                      className="text-amber-200/80 text-sm font-medium"
                    >
                      ← Back
                    </button>
                    <button
                      type="button"
                      onClick={closePopup}
                      className="w-12 h-12 rounded-full bg-amber-100/10 text-amber-100/80 flex items-center justify-center"
                    >
                      <X className="w-6 h-6" />
                    </button>
                  </div>

                  {loadingMethods ? (
                    <div className="flex items-center justify-center py-10">
                      <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full" />
                    </div>
                  ) : !currentMethod ? (
                    <div className="text-center py-8">
                      <p className="text-sm" style={{ color: template.subtitleColor }}>No payment methods available</p>
                    </div>
                  ) : (
                    <>
                      <div className="text-center mb-6">
                        <h3 className="text-[15px] font-semibold tracking-[0.2em] uppercase text-amber-200">
                          Payment Number
                        </h3>
                      </div>

                      <div className="rounded-[1.75rem] border border-amber-400/25 bg-amber-500/5 p-4 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.08)]">
                        <div className="rounded-[1.5rem] border border-amber-400/20 bg-amber-500/10 p-5 text-center">
                          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100/10 overflow-hidden">
                            {currentMethod.logo_url ? (
                              <img
                                src={currentMethod.logo_url}
                                alt={currentMethod.method_name}
                                className="h-10 w-10 object-contain"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <span className="text-3xl text-amber-300">💳</span>
                            )}
                          </div>

                          <p className="text-2xl font-bold text-amber-300 leading-none">
                            {currentMethod.method_name}
                          </p>
                          <p className="mt-2 text-lg text-amber-100/45">
                            {currentMethod.account_name || currentMethod.method_name}
                          </p>

                          <div className="mt-6 rounded-[1.35rem] bg-amber-200/8 px-4 py-4">
                            <div className="flex items-center gap-3">
                              <div className="min-w-0 flex-1 text-left">
                                <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-amber-100/70 mb-2">
                                  {currentMethod.method_name} Number
                                </p>
                                <p className="text-[2rem] font-bold tracking-[0.12em] text-yellow-300 break-all leading-none">
                                  {currentMethod.account_number}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(currentMethod.account_number)}
                                className="shrink-0 rounded-2xl bg-amber-300/12 px-5 py-4 text-amber-300"
                              >
                                {copiedNumber ? <Check className="w-7 h-7" /> : <Copy className="w-7 h-7" />}
                              </button>
                            </div>
                          </div>

                          <p className="mt-7 text-2xl font-bold text-yellow-300">
                            Send {convertToLocalCurrency(campaign.offer_price_usd || campaign.original_price_usd)}
                          </p>
                        </div>
                      </div>

                      {helperMethods.length > 1 && (
                        <button
                          type="button"
                          onClick={handleShowNextNumber}
                          className="mt-5 w-full rounded-2xl bg-amber-200/8 px-5 py-5 text-center text-[13px] font-medium text-amber-100"
                        >
                          Show different number ({currentMethodIndex + 1}/{helperMethods.length})
                        </button>
                      )}

                      <div className="mt-5 space-y-3">
                        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/8 p-4">
                          <p className="text-xs font-bold text-amber-300 mb-2">{currentMethod.additional_info?.gateway_type ? 'Auto-Approve Notice' : 'Payment Notice'}</p>
                          <p className="text-[13px] leading-6 text-amber-100/85">👉 You must send the <strong className="text-amber-200">exact amount</strong> shown above.</p>
                          <p className="mt-2 text-[13px] leading-6 text-amber-100/65">💰 Amount to send: <strong className="text-yellow-300">{convertToLocalCurrency(campaign.offer_price_usd || campaign.original_price_usd)}</strong></p>
                          {currentMethod.additional_info?.gateway_type ? (
                            <p className="mt-2 text-[12px] text-emerald-300/90">⚡ Enter your transaction ID below to verify via ZiniPay.</p>
                          ) : (
                            <p className="mt-2 text-[12px] text-amber-100/55">Helper will check your payment proof and approve it.</p>
                          )}
                        </div>

                        <div>
                          <label htmlFor="campaignHelperTransactionId" className="text-amber-100/75 font-semibold text-xs uppercase tracking-[0.2em]">
                            Transaction ID *
                          </label>
                          <input
                            id="campaignHelperTransactionId"
                            type="text"
                            value={helperTransactionId}
                            onChange={(e) => setHelperTransactionId(e.target.value)}
                            placeholder="Enter your TrxID here"
                            className="mt-2 w-full rounded-2xl text-sm h-12 px-4 border border-amber-200/10 bg-amber-100/5 text-amber-50 placeholder:text-amber-100/20 focus:outline-none focus:ring-2 focus:ring-amber-400/30 transition-all"
                            autoComplete="off"
                          />
                        </div>

                        {currentMethod.instructions && (
                          <div className="rounded-2xl bg-amber-100/5 border border-amber-200/10 p-3">
                            <p className="text-[11px] text-amber-300/80 font-medium mb-1">📝 Note</p>
                            <p className="text-xs text-amber-50/70">{currentMethod.instructions}</p>
                          </div>
                        )}

                        {!currentMethod.additional_info?.gateway_type && (
                          <div>
                            <label className="text-amber-100/75 text-xs uppercase tracking-[0.2em] font-semibold">Payment Screenshot</label>
                            <div className="mt-2">
                              {helperPaymentProof ? (
                                <div className="relative rounded-2xl overflow-hidden border border-amber-200/10">
                                  <img src={helperPaymentProof} alt="Payment proof" className="w-full h-28 object-cover" />
                                  <button
                                    onClick={() => setHelperPaymentProof(null)}
                                    className="absolute top-2 right-2 bg-red-500/80 text-white p-1 rounded-full"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <label className="flex flex-col items-center justify-center w-full h-24 border border-dashed border-amber-200/15 rounded-2xl cursor-pointer hover:bg-amber-100/[0.03] transition-colors">
                                  {uploadingHelperProof ? (
                                    <div className="w-5 h-5 border-2 border-amber-300 border-t-transparent rounded-full animate-spin" />
                                  ) : (
                                    <>
                                      <Upload className="w-5 h-5 text-amber-100/35 mb-1" />
                                      <span className="text-xs text-amber-100/35">Upload screenshot</span>
                                    </>
                                  )}
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={handleUploadHelperProof}
                                    disabled={uploadingHelperProof}
                                  />
                                </label>
                              )}
                            </div>
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={handleHelperPaymentSubmit}
                          disabled={!helperTransactionId.trim() || helperPaymentProcessing || !matchedPackage}
                          className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-400 to-yellow-500 text-[#2d1a00] font-bold text-base shadow-lg transition-all disabled:opacity-40"
                        >
                          {helperPaymentProcessing
                            ? 'Processing...'
                            : currentMethod.additional_info?.gateway_type
                              ? 'Verify Transaction'
                              : 'Submit to Helper'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {popupView === 'payment_number' && helperPaymentStep === 'processing' && (
                <div className="text-center py-12">
                  <div className="w-16 h-16 mx-auto mb-4 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
                  <h3 className="text-lg font-bold text-white mb-2">Sending to Helper</h3>
                  <p className="text-white/60">Please wait while we process your order...</p>
                </div>
              )}

              {popupView === 'payment_number' && helperPaymentStep === 'pending' && (
                <div className="text-center py-8 px-5">
                  <div className="w-20 h-20 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
                    <Check className="w-10 h-10 text-green-500" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">Order Submitted!</h3>
                  <p className="text-white/70 mb-4">Helper has been notified and will process your order.</p>
                  <div className="bg-white/5 rounded-xl p-3 mb-6">
                    <p className="text-sm text-white/80">{campaign.diamonds_amount.toLocaleString()} Diamonds will be credited after approval.</p>
                  </div>
                  <button
                    onClick={closePopup}
                    className="w-full py-3 rounded-xl bg-white/10 text-white/80 hover:bg-white/20"
                  >
                    Close
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default CampaignFloatingButton;
