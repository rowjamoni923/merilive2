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
import { useAppState } from '@/hooks/useAppState';

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

const getCampaignSessionKey = (campaignId: string) => `${SESSION_KEY}_${campaignId}`;

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
  const [selectedPaymentTab, setSelectedPaymentTab] = useState<PaymentTab>('google');
  const [helperMethods, setHelperMethods] = useState<HelperMethod[]>([]);
  const [selectedLocalMethodName, setSelectedLocalMethodName] = useState<string | null>(null);
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
  const activeCampaignIdRef = useRef<string | null>(null);
  const { toast } = useToast();
  const appState = useAppState();

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

  const fetchCampaign = useCallback(async (resetSession = false) => {
    const { data } = await supabase
      .from('recharge_campaigns')
      .select('*')
      .eq('is_active', true)
      .order('priority', { ascending: false })
      .limit(1);

    if (data && data.length > 0) {
      const c = data[0] as Campaign;
      const now = new Date();
      if (c.schedule_start && new Date(c.schedule_start) > now) { setCampaign(null); setRemainingSeconds(0); return; }
      if (c.schedule_end && new Date(c.schedule_end) < now) { setCampaign(null); setRemainingSeconds(0); return; }

      activeCampaignIdRef.current = c.id;

      if (localStorage.getItem(PURCHASED_KEY + c.id)) {
        setPurchased(true);
        setCampaign(null);
        setRemainingSeconds(0);
        return;
      }

      setPurchased(false);
      const sessionKey = getCampaignSessionKey(c.id);
      if (resetSession) {
        sessionStorage.removeItem(sessionKey);
      }

      let sessionStart = sessionStorage.getItem(sessionKey);
      if (!sessionStart) {
        sessionStart = String(Date.now());
        sessionStorage.setItem(sessionKey, sessionStart);
      }

      const startMs = parseInt(sessionStart, 10);
      const endMs = startMs + (c.duration_minutes * 60 * 1000);
      const remaining = Math.max(0, Math.floor((endMs - Date.now()) / 1000));

      if (remaining <= 0) {
        setCampaign(null);
        setRemainingSeconds(0);
        return;
      }

      setCampaign(c);
      setRemainingSeconds(remaining);
    } else {
      activeCampaignIdRef.current = null;
      setPurchased(false);
      setCampaign(null);
      setRemainingSeconds(0);
    }
  }, []);

  useEffect(() => { fetchCampaign(); }, [fetchCampaign]);

  useEffect(() => {
    if (!appState.isActive || !appState.backgroundDuration || !activeCampaignIdRef.current) return;
    void fetchCampaign(true);
  }, [appState.isActive, appState.backgroundDuration, fetchCampaign]);

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

      const availableMethodNames = Array.from(new Set(unique.map((method) => method.method_name.toLowerCase())));
      setHelperMethods(unique);
      setCurrentMethodIndex(0);
      setSelectedLocalMethodName((prev) => {
        if (availableMethodNames.length === 0) return null;
        return prev && availableMethodNames.includes(prev) ? prev : availableMethodNames[0];
      });
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
  const formatMethodLabel = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
  const recommendedMethodNames = Array.from(new Set(helperMethods.map((method) => method.method_name.toLowerCase())));
  const filteredHelperMethods = selectedLocalMethodName
    ? helperMethods.filter((method) => method.method_name.toLowerCase() === selectedLocalMethodName)
    : helperMethods;
  const currentMethod = filteredHelperMethods[currentMethodIndex] || filteredHelperMethods[0] || null;
  const recommendPreviewText = recommendedMethodNames.length > 0
    ? recommendedMethodNames.slice(0, 2).map(formatMethodLabel).join(', ')
    : 'Local Pay';

  const convertToLocalCurrency = (usdAmount: number) => {
    if (userCountryCode === 'BD') return `৳${Math.round(usdAmount * 120)}`;
    return `$${usdAmount.toFixed(2)}`;
  };

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedNumber(true);
    toast({ title: 'Copied!', description: text });
    setTimeout(() => setCopiedNumber(false), 2000);
  };

  const handleBuyNow = async () => {
    setSelectedPaymentTab('google');
    setPopupView('payment_select');
    await fetchMatchedPackage(campaign);
  };

  const resetHelperForm = () => {
    setHelperPaymentStep('form');
    setHelperTransactionId('');
    setHelperPaymentProof(null);
    setUploadingHelperProof(false);
    setHelperPaymentProcessing(false);
  };

  const closePopup = () => {
    setShowPopup(false);
    setPopupView('main');
    setSelectedPaymentTab('google');
    setCopiedNumber(false);
    resetHelperForm();
  };

  const handleSelectPayment = async (tab: PaymentTab) => {
    setSelectedPaymentTab(tab);

    if (tab === 'recommend') {
      await Promise.all([fetchHelperPaymentMethods(), matchedPackage ? Promise.resolve() : fetchMatchedPackage(campaign)]);
      return;
    }

    if (tab === 'skrill') {
      return;
    }
  };

  const handleContinueSelectedPayment = async () => {
    if (selectedPaymentTab === 'google') {
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
            sessionStorage.removeItem(getCampaignSessionKey(campaign.id));
            setPurchased(true);
            setCampaign(null);
            setRemainingSeconds(0);
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

    if (selectedPaymentTab === 'recommend') {
      if (!selectedLocalMethodName) {
        toast({ title: 'Select payment method', description: 'Please choose Nagad, Bkash, Rocket or another available method.', variant: 'destructive' });
        return;
      }

      if (!matchedPackage) {
        await fetchMatchedPackage(campaign);
      }

      resetHelperForm();
      setCurrentMethodIndex(0);
      setPopupView('payment_number');
      return;
    }

    if (selectedPaymentTab === 'skrill') {
      toast({ title: 'Skrill', description: 'Skrill payment coming soon' });
    }
  };

  const handleShowNextNumber = () => {
    if (filteredHelperMethods.length > 1) {
      setCurrentMethodIndex(prev => (prev + 1) % filteredHelperMethods.length);
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
        localStorage.setItem(PURCHASED_KEY + campaign.id, 'true');
        sessionStorage.removeItem(getCampaignSessionKey(campaign.id));
        setPurchased(true);
        setCampaign(null);
        setRemainingSeconds(0);
        setShowPopup(false);
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

      localStorage.setItem(PURCHASED_KEY + campaign.id, 'true');
      sessionStorage.removeItem(getCampaignSessionKey(campaign.id));
      setPurchased(true);
      setCampaign(null);
      setRemainingSeconds(0);
      setShowPopup(false);
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
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            onClick={closePopup}
          >
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

            <motion.div
              initial={{ scale: 0.85, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.85, y: 30 }}
              transition={{ type: 'spring', damping: 22, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-[340px] rounded-3xl overflow-hidden shadow-2xl max-h-[85vh] overflow-y-auto"
              style={{
                background: template.popupBg,
                border: `1.5px solid ${template.popupBorder}`,
                boxShadow: template.accentGlow,
                WebkitOverflowScrolling: 'touch',
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

                  <div className="space-y-4">
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => handleSelectPayment('google')}
                        className={`flex-1 min-w-[130px] relative overflow-hidden rounded-2xl p-3 transition-all duration-200 ${
                          selectedPaymentTab === 'google'
                            ? 'bg-gradient-to-br from-emerald-500 to-green-600 shadow-lg shadow-green-500/25'
                            : 'bg-white border-2 border-gray-100 hover:border-green-400/50 shadow-sm'
                        }`}
                      >
                        <div className="relative flex items-center gap-2">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-base ${selectedPaymentTab === 'google' ? 'bg-white/20' : 'bg-green-50'}`}>
                            🎮
                          </div>
                          <div className="flex-1 text-left">
                            <p className={`font-bold text-[13px] ${selectedPaymentTab === 'google' ? 'text-white' : 'text-gray-800'}`}>
                              Google Play
                            </p>
                            <p className={`text-[10px] font-medium ${selectedPaymentTab === 'google' ? 'text-white/80' : 'text-gray-500'}`}>
                              Worldwide • Instant
                            </p>
                          </div>
                          {selectedPaymentTab === 'google' && (
                            <div className="w-5 h-5 rounded-full bg-white/25 flex items-center justify-center">
                              <Check className="w-3 h-3 text-white" />
                            </div>
                          )}
                        </div>
                      </button>

                      <button
                        onClick={() => handleSelectPayment('recommend')}
                        className={`flex-1 min-w-[130px] relative overflow-hidden rounded-2xl p-3 transition-all duration-200 ${
                          selectedPaymentTab === 'recommend'
                            ? 'bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-orange-500/25'
                            : 'bg-white border-2 border-gray-100 hover:border-orange-400/50 shadow-sm'
                        }`}
                      >
                        <div className="relative flex items-center gap-2">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-base ${selectedPaymentTab === 'recommend' ? 'bg-white/20' : 'bg-orange-50'}`}>
                            ⭐
                          </div>
                          <div className="flex-1 text-left">
                            <p className={`font-bold text-[13px] ${selectedPaymentTab === 'recommend' ? 'text-white' : 'text-gray-800'}`}>
                              Recommend
                            </p>
                            <p className={`text-[10px] truncate max-w-[70px] font-medium ${selectedPaymentTab === 'recommend' ? 'text-white/80' : 'text-gray-500'}`}>
                              {recommendPreviewText}
                            </p>
                          </div>
                          {selectedPaymentTab === 'recommend' && (
                            <div className="w-5 h-5 rounded-full bg-white/25 flex items-center justify-center">
                              <Check className="w-3 h-3 text-white" />
                            </div>
                          )}
                        </div>
                      </button>

                      {!isBangladesh && (
                        <button
                          onClick={() => handleSelectPayment('skrill')}
                          className={`w-full relative overflow-hidden rounded-2xl p-3 transition-all duration-200 ${
                            selectedPaymentTab === 'skrill'
                              ? 'bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/25'
                              : 'bg-white border-2 border-gray-100 hover:border-indigo-400/50 shadow-sm'
                          }`}
                        >
                          <div className="relative flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-base ${selectedPaymentTab === 'skrill' ? 'bg-white/20' : 'bg-indigo-50'}`}>
                              💳
                            </div>
                            <div className="flex-1 text-left">
                              <p className={`font-bold text-[13px] ${selectedPaymentTab === 'skrill' ? 'text-white' : 'text-gray-800'}`}>
                                Skrill
                              </p>
                              <p className={`text-[10px] font-medium ${selectedPaymentTab === 'skrill' ? 'text-white/80' : 'text-gray-500'}`}>
                                International payment
                              </p>
                            </div>
                            {selectedPaymentTab === 'skrill' && (
                              <div className="w-5 h-5 rounded-full bg-white/25 flex items-center justify-center">
                                <Check className="w-3 h-3 text-white" />
                              </div>
                            )}
                          </div>
                        </button>
                      )}
                    </div>

                    {selectedPaymentTab === 'recommend' && (
                      <div className="space-y-3">
                        {loadingMethods ? (
                          <div className="flex items-center justify-center py-6">
                            <motion.div
                              animate={{ rotate: 360 }}
                              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                              className="w-7 h-7 border-2 border-orange-400 border-t-transparent rounded-full"
                            />
                          </div>
                        ) : recommendedMethodNames.length > 0 ? (
                          <>
                            <div className="flex flex-wrap gap-2">
                              {recommendedMethodNames.map((methodName) => {
                                const isSelected = selectedLocalMethodName === methodName;
                                return (
                                  <button
                                    key={methodName}
                                    type="button"
                                    onClick={() => {
                                      setSelectedLocalMethodName(methodName);
                                      setCurrentMethodIndex(0);
                                      setCopiedNumber(false);
                                    }}
                                    className={`min-w-[92px] rounded-2xl px-4 py-3 text-sm font-bold transition-all ${
                                      isSelected
                                        ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg shadow-orange-500/25'
                                        : 'bg-white text-gray-700 border border-gray-100'
                                    }`}
                                  >
                                    {formatMethodLabel(methodName)}
                                  </button>
                                );
                              })}
                            </div>

                            <button
                              type="button"
                              onClick={handleContinueSelectedPayment}
                              disabled={!selectedLocalMethodName || !matchedPackage}
                              className="w-full rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 px-4 py-3.5 text-sm font-bold text-[#2d1a00] shadow-lg disabled:opacity-40"
                            >
                              Continue with {selectedLocalMethodName ? formatMethodLabel(selectedLocalMethodName) : 'Local Pay'}
                            </button>
                          </>
                        ) : (
                          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-center">
                            <p className="text-sm text-white/80">No local payment methods available right now.</p>
                          </div>
                        )}
                      </div>
                    )}

                    {selectedPaymentTab === 'google' && (
                      <button
                        type="button"
                        onClick={handleContinueSelectedPayment}
                        className="w-full rounded-2xl bg-gradient-to-r from-emerald-400 to-green-500 px-4 py-3.5 text-sm font-bold text-[#062b1d] shadow-lg"
                      >
                        Continue with Google Play
                      </button>
                    )}

                    {selectedPaymentTab === 'skrill' && (
                      <button
                        type="button"
                        onClick={handleContinueSelectedPayment}
                        className="w-full rounded-2xl bg-gradient-to-r from-indigo-400 to-purple-500 px-4 py-3.5 text-sm font-bold text-white shadow-lg"
                      >
                        Continue with Skrill
                      </button>
                    )}
                  </div>
                </div>
              )}

              {popupView === 'payment_number' && helperPaymentStep === 'form' && (
                <div className="px-4 pt-4 pb-4" style={{ maxHeight: '80vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
                  {/* Secure Payment Header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-xl bg-purple-500/20 flex items-center justify-center">
                        <CreditCard className="w-5 h-5 text-purple-400" />
                      </div>
                      <h3 className="text-base font-bold text-white">Secure Payment</h3>
                    </div>
                    <button onClick={closePopup} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                      <X className="w-4 h-4 text-white/60" />
                    </button>
                  </div>

                  {loadingMethods ? (
                    <div className="flex items-center justify-center py-10">
                      <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full" />
                    </div>
                  ) : !currentMethod ? (
                    <div className="text-center py-8">
                      <p className="text-sm text-white/50">No payment methods available</p>
                    </div>
                  ) : (
                    <>
                      <p className="text-xs text-white/60 mb-3">
                        Pay via {currentMethod.method_name} to receive {campaign.diamonds_amount.toLocaleString()} diamonds
                      </p>

                      {/* Amount Card */}
                      <div className="rounded-2xl bg-white/5 border border-white/10 p-3 mb-3">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">Amount</span>
                          <span className="text-xl font-bold text-white">
                            {convertToLocalCurrency(campaign.offer_price_usd || campaign.original_price_usd)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-white/50">You'll receive</span>
                          <span className="text-sm font-semibold text-white">
                            💎 {campaign.diamonds_amount.toLocaleString()} Diamonds
                          </span>
                        </div>
                      </div>

                      {/* Payment Method Card */}
                      <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-900/40 to-amber-800/20 p-3 mb-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="w-9 h-9 rounded-xl bg-amber-500/20 flex items-center justify-center overflow-hidden">
                              {currentMethod.logo_url ? (
                                <img src={currentMethod.logo_url} alt={currentMethod.method_name} className="h-6 w-6 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                              ) : (
                                <span className="text-lg">{currentMethod.method_name.toLowerCase() === 'nagad' ? '🧡' : currentMethod.method_name.toLowerCase() === 'bkash' ? '💜' : '💳'}</span>
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-white">{currentMethod.method_name}</p>
                              <p className="text-[10px] text-white/50">{currentMethod.additional_info?.gateway_type === 'zinipay' ? 'Merchant' : (currentMethod.account_name || currentMethod.method_name)}</p>
                            </div>
                          </div>
                          {currentMethod.additional_info?.gateway_type && (
                            <div className="px-3 py-1 rounded-full bg-amber-600/30 border border-amber-500/40 flex items-center gap-1">
                              <span className="text-[10px]">⚡</span>
                              <span className="text-[10px] font-bold text-amber-300 uppercase">Auto</span>
                            </div>
                          )}
                        </div>

                        {/* Number + Copy */}
                        <div className="rounded-xl bg-black/20 border border-white/5 p-3">
                          <p className="text-[10px] font-medium uppercase tracking-wider text-white/40 mb-1">
                            {currentMethod.method_name} Number
                          </p>
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-lg font-bold text-white tracking-wide break-all">
                              {currentMethod.account_number}
                            </p>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(currentMethod.account_number)}
                              className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-600/30 border border-amber-500/30 text-amber-300 text-xs font-semibold"
                            >
                              {copiedNumber ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                              Copy
                            </button>
                          </div>
                          {currentMethod.account_name && (
                            <p className="mt-1 text-[11px] text-white/40">• Name: {currentMethod.account_name}</p>
                          )}
                        </div>
                      </div>

                      {/* Auto-Approve / Payment Notice */}
                      <div className="rounded-2xl border border-amber-400/20 bg-amber-900/20 p-3 mb-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-base">⚠️</span>
                          <p className="text-xs font-bold text-amber-300">
                            {currentMethod.additional_info?.gateway_type ? 'Auto-Approve Notice' : 'Payment Notice'}
                          </p>
                        </div>
                        <p className="text-[11px] leading-5 text-white/70">
                          👉 You must send the <strong className="text-white">exact amount shown below</strong>, including decimals.
                        </p>
                        <p className="mt-1 text-[11px] text-white/60">
                          💰 Amount to send: <strong className="text-amber-300">{convertToLocalCurrency(campaign.offer_price_usd || campaign.original_price_usd)}</strong>
                        </p>
                      </div>

                      {/* Show different number */}
                      {filteredHelperMethods.length > 1 && (
                        <button
                          type="button"
                          onClick={handleShowNextNumber}
                          className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-center text-[11px] font-medium text-white/60 mb-3"
                        >
                          Show different number ({Math.min(currentMethodIndex + 1, filteredHelperMethods.length)}/{filteredHelperMethods.length})
                        </button>
                      )}

                      {/* Transaction ID */}
                      <div className="mb-2">
                        <label className="text-white/50 font-semibold text-[10px] uppercase tracking-wider">Transaction ID *</label>
                        <input
                          type="text"
                          value={helperTransactionId}
                          onChange={(e) => setHelperTransactionId(e.target.value)}
                          placeholder="Enter your TrxID here"
                          className="mt-1 w-full rounded-xl text-sm h-10 px-3 border border-white/10 bg-white/5 text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
                          autoComplete="off"
                        />
                      </div>

                      {/* Payment Screenshot */}
                      {!currentMethod.additional_info?.gateway_type && (
                        <div className="mb-3">
                          <label className="text-white/50 text-[10px] uppercase tracking-wider font-semibold">Payment Screenshot</label>
                          <div className="mt-1">
                            {helperPaymentProof ? (
                              <div className="relative rounded-xl overflow-hidden border border-white/10">
                                <img src={helperPaymentProof} alt="Proof" className="w-full h-20 object-cover" />
                                <button onClick={() => setHelperPaymentProof(null)} className="absolute top-1 right-1 bg-red-500/80 text-white p-0.5 rounded-full">
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <label className="flex flex-col items-center justify-center w-full h-16 border border-dashed border-white/15 rounded-xl cursor-pointer hover:bg-white/[0.02]">
                                {uploadingHelperProof ? (
                                  <div className="w-4 h-4 border-2 border-amber-300 border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <>
                                    <Upload className="w-4 h-4 text-white/30 mb-0.5" />
                                    <span className="text-[10px] text-white/30">Upload screenshot</span>
                                  </>
                                )}
                                <input type="file" accept="image/*" className="hidden" onChange={handleUploadHelperProof} disabled={uploadingHelperProof} />
                              </label>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Submit Button */}
                      <button
                        type="button"
                        onClick={handleHelperPaymentSubmit}
                        disabled={!helperTransactionId.trim() || helperPaymentProcessing || !matchedPackage}
                        className="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-400 to-yellow-500 text-[#2d1a00] font-bold text-sm shadow-lg disabled:opacity-40"
                      >
                        {helperPaymentProcessing
                          ? 'Processing...'
                          : currentMethod.additional_info?.gateway_type
                            ? 'Verify Transaction'
                            : 'Submit to Helper'}
                      </button>
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
