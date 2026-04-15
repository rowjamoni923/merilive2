/**
 * CampaignFloatingButton — Floating button with per-session countdown timer.
 * Uses admin-selected template for popup styling.
 * Payment methods shown inline (no navigation to /recharge).
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { X, CreditCard, Wallet, Globe, Copy, Check } from 'lucide-react';
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
  method_name: string;
  account_name: string;
  account_number: string;
  logo_url: string | null;
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
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const { toast } = useToast();

  // Check if user is host & get country
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setIsHost(null); return; }
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

  // Fetch active campaign & init per-session timer
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

  // Countdown timer
  useEffect(() => {
    if (!campaign || remainingSeconds <= 0) return;
    timerRef.current = setInterval(() => {
      setRemainingSeconds(prev => {
        if (prev <= 1) { setCampaign(null); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [campaign]);

  // Fetch helper payment methods for Recommended
  const fetchHelperPaymentMethods = useCallback(async () => {
    setLoadingMethods(true);
    try {
      const GLOBAL_METHOD_TYPES = ['crypto', 'usdt', 'trc20', 'erc20', 'btc', 'eth', 'cryptocurrency'];

      const [legacyRes, countryRes] = await Promise.all([
        supabase.from('helper_payment_methods').select('id, helper_id, account_name, account_number, is_active, method_type, additional_info').eq('is_active', true),
        supabase.from('helper_country_payment_methods').select('id, helper_id, country_code, payment_method_name, icon_url, is_active, account_name, account_number, logo_url, method_type, additional_info').eq('country_code', userCountryCode).eq('is_active', true),
      ]);

      const legacyNorm = (legacyRes.data || []).map((m: any) => ({
        id: m.id, helper_id: m.helper_id, method_name: m.method_type, account_name: m.account_name,
        account_number: m.account_number, logo_url: (m.additional_info as any)?.logo_url || null,
      }));

      const countryNorm = (countryRes.data || []).flatMap((m: any) => {
        const matched = legacyNorm.filter((l: any) => l.method_name?.toLowerCase() === String(m.payment_method_name || '').toLowerCase());
        if (matched.length > 0) {
          return matched.map((l: any) => ({ ...l, logo_url: m.logo_url || m.icon_url || l.logo_url, method_name: m.payment_method_name }));
        }
        return [{ id: m.id, helper_id: m.helper_id || `country-${m.id}`, method_name: m.payment_method_name, account_name: m.account_name || m.payment_method_name, account_number: m.account_number || '', logo_url: m.logo_url || m.icon_url }];
      });

      const combined = [...legacyNorm, ...countryNorm].filter(m => Boolean(m.account_number));

      // Validate helpers
      const helperIds = [...new Set(combined.map(m => m.helper_id).filter((id: string) => !id.startsWith('country-') && !id.startsWith('global-')))];
      
      let validHelperIds = new Set<string>();
      if (helperIds.length > 0) {
        const { data: helpers } = await supabase.from('topup_helpers').select('id, user_id, wallet_balance, trader_level, payroll_enabled, is_active, is_verified').in('id', helperIds);
        
        const userIds = (helpers || []).map(h => h.user_id).filter(Boolean);
        const agencyResults = await Promise.all(userIds.map(uid => supabase.rpc('get_agency_diamond_balance', { owner_user_id: uid })));
        const agencyMap = new Map<string, number>();
        userIds.forEach((uid, i) => agencyMap.set(uid, (agencyResults[i]?.data as number) ?? 0));

        (helpers || []).forEach(h => {
          const combined = (h.wallet_balance ?? 0) + (agencyMap.get(h.user_id) ?? 0);
          if (h.trader_level === 5 && h.payroll_enabled && combined >= 300000 && h.is_verified && h.is_active) {
            validHelperIds.add(h.id);
          }
        });
      }

      const valid = combined.filter(m => validHelperIds.has(m.helper_id) || m.helper_id.startsWith('country-'));
      
      // Shuffle for variety
      for (let i = valid.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [valid[i], valid[j]] = [valid[j], valid[i]];
      }

      // Deduplicate by account_number
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

  // Hide if: host, no campaign, expired, purchased, or not logged in
  if (isHost === true || isHost === null || !campaign || remainingSeconds <= 0 || purchased) return null;

  const template: CampaignTemplate = CAMPAIGN_TEMPLATES.find(t => t.id === campaign.template_id) || CAMPAIGN_TEMPLATES[0];

  const discountPercent = campaign.offer_price_usd && campaign.original_price_usd > 0
    ? Math.round((1 - campaign.offer_price_usd / campaign.original_price_usd) * 100)
    : campaign.bonus_percentage ?? 0;
  const bonusText = discountPercent > 0 ? `${discountPercent}%` : '';

  const handleBuyNow = () => setPopupView('payment_select');

  const handleSelectPayment = async (tab: PaymentTab) => {
    if (tab === 'google') {
      // Google Play billing
      if (Capacitor.isNativePlatform()) {
        try {
          const diamonds = campaign.diamonds_amount;
          const product = PLAY_STORE_PRODUCTS[diamonds];
          const productId = product?.productId || Object.values(PLAY_STORE_PRODUCTS)[0]?.productId;
          if (!productId) { toast({ title: "Product not found", variant: "destructive" }); return; }
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) { toast({ title: "Please login first", variant: "destructive" }); return; }
          const result = await playStoreBilling.purchase(productId, user.id);
          if (result.success) {
            localStorage.setItem(PURCHASED_KEY + campaign.id, 'true');
            setPurchased(true);
            setShowPopup(false);
            toast({ title: "Purchase successful!", description: "Diamonds added to your account" });
          } else {
            toast({ title: "Payment failed", description: result.error, variant: "destructive" });
          }
        } catch (e) {
          toast({ title: "Payment failed", variant: "destructive" });
        }
      } else {
        toast({ title: "Google Play", description: "Available on Android app only" });
      }
      return;
    }

    if (tab === 'recommend') {
      await fetchHelperPaymentMethods();
      setPopupView('payment_number');
      return;
    }

    if (tab === 'skrill') {
      toast({ title: "Skrill", description: "Skrill payment coming soon" });
    }
  };

  const handleCopyNumber = (number: string) => {
    navigator.clipboard.writeText(number);
    setCopiedNumber(true);
    toast({ title: "Copied!", description: number });
    setTimeout(() => setCopiedNumber(false), 2000);
  };

  const handleShowNextNumber = () => {
    if (helperMethods.length > 1) {
      setCurrentMethodIndex(prev => (prev + 1) % helperMethods.length);
    }
  };

  const closePopup = () => {
    setShowPopup(false);
    setPopupView('main');
    setCopiedNumber(false);
  };

  const paymentTabs: { key: PaymentTab; label: string; icon: React.ReactNode; description: string }[] = [
    { key: 'google', label: 'Google Pay', icon: <CreditCard className="w-5 h-5" />, description: 'Pay with Google Play' },
    { key: 'recommend', label: 'Recommended', icon: <Wallet className="w-5 h-5" />, description: 'Local payment methods' },
    ...(!isBangladesh ? [{ key: 'skrill' as PaymentTab, label: 'Skrill', icon: <Globe className="w-5 h-5" />, description: 'International payment' }] : []),
  ];

  const currentMethod = helperMethods[currentMethodIndex];

  return (
    <>
      {/* Floating Button — luxurious design */}
      <AnimatePresence>
        {!showPopup && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="fixed z-[45] flex flex-col items-center"
            style={{ bottom: 'calc(var(--bottom-nav-height, 64px) + 48px)', right: '10px' }}
          >
            {/* Countdown badge */}
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 px-3 py-0.5 rounded-full shadow-lg min-w-[54px] text-center"
              style={{ background: 'linear-gradient(135deg, #dc2626, #b91c1c)', boxShadow: '0 4px 15px rgba(220,38,38,0.5)' }}>
              <span className="text-[10px] font-bold text-white tabular-nums">{formatCountdown(remainingSeconds)}</span>
            </div>
            
            <button
              onClick={() => setShowPopup(true)}
              className="relative w-[76px] h-[76px] rounded-full"
              style={{ filter: 'drop-shadow(0 6px 20px rgba(245,158,11,0.5))' }}
            >
              {/* Outer animated ring */}
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{ background: 'conic-gradient(from 0deg, #f59e0b, #ef4444, #f59e0b, #eab308, #f59e0b)', padding: '3px' }}
                animate={{ rotate: 360 }}
                transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
              >
                <div className="w-full h-full rounded-full" style={{ background: '#0f0a1a' }} />
              </motion.div>
              {/* Inner content */}
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
              {/* Sparkle dots */}
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

      {/* Campaign Popup */}
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
              {/* Top shine */}
              <div className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${template.popupBorder}40, transparent)` }} />

              {/* Close button */}
              <button onClick={closePopup} className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/10 flex items-center justify-center z-10">
                <X className="w-3.5 h-3.5 text-white/60" />
              </button>

              {/* NO banner image here — only in floating button */}

              {/* Main View */}
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

              {/* Payment Method Select View */}
              {popupView === 'payment_select' && (
                <div className="px-5 pt-6 pb-5">
                  {/* Back arrow */}
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

              {/* Payment Number View (Recommended) */}
              {popupView === 'payment_number' && (
                <div className="px-5 pt-6 pb-5">
                  <button onClick={() => setPopupView('payment_select')} className="text-xs mb-3 opacity-60" style={{ color: template.subtitleColor }}>
                    ← Back
                  </button>

                  {loadingMethods ? (
                    <div className="flex items-center justify-center py-10">
                      <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full" />
                    </div>
                  ) : helperMethods.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-sm" style={{ color: template.subtitleColor }}>No payment methods available</p>
                    </div>
                  ) : currentMethod ? (
                    <motion.div
                      key={currentMethodIndex}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="space-y-4"
                    >
                      <p className="text-xs text-center font-medium uppercase tracking-wider" style={{ color: template.subtitleColor }}>
                        Payment Number
                      </p>

                      {/* Method card */}
                      <div className="p-4 rounded-xl text-center" style={{ background: `${template.popupBorder}15`, border: `1px solid ${template.popupBorder}30` }}>
                        {currentMethod.logo_url && (
                          <img src={currentMethod.logo_url} alt="" className="w-10 h-10 mx-auto mb-2 rounded-lg object-contain" />
                        )}
                        <p className="text-base font-bold capitalize mb-1" style={{ color: template.titleColor }}>
                          {currentMethod.method_name}
                        </p>
                        <p className="text-xs opacity-60 mb-3" style={{ color: template.subtitleColor }}>
                          {currentMethod.account_name}
                        </p>
                        
                        {/* Number with copy */}
                        <div className="flex items-center justify-center gap-2 p-3 rounded-xl" style={{ background: `${template.popupBorder}20` }}>
                          <span className="font-mono font-bold text-lg tracking-wider" style={{ color: template.priceColor }}>
                            {currentMethod.account_number}
                          </span>
                          <button
                            onClick={() => handleCopyNumber(currentMethod.account_number)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center"
                            style={{ background: `${template.popupBorder}30` }}
                          >
                            {copiedNumber ? (
                              <Check className="w-4 h-4 text-green-400" />
                            ) : (
                              <Copy className="w-4 h-4" style={{ color: template.titleColor }} />
                            )}
                          </button>
                        </div>

                        {/* Amount to send */}
                        <p className="mt-3 text-sm font-bold" style={{ color: template.priceColor }}>
                          Send ${campaign.offer_price_usd || campaign.original_price_usd}
                        </p>
                      </div>

                      {/* Show different number */}
                      {helperMethods.length > 1 && (
                        <button
                          onClick={handleShowNextNumber}
                          className="w-full text-center text-xs font-medium py-2 rounded-lg"
                          style={{ color: template.priceColor, background: `${template.popupBorder}10` }}
                        >
                          Show different number ({currentMethodIndex + 1}/{helperMethods.length})
                        </button>
                      )}
                    </motion.div>
                  ) : null}
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
