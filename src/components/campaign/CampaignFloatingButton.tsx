/**
 * CampaignFloatingButton — Floating button with per-session countdown timer.
 * 
 * Logic:
 * - Each time the user opens the app, a FRESH countdown starts (duration_minutes).
 * - If user doesn't purchase within the time, button hides until next app visit.
 * - If user purchases, mark as purchased in localStorage → never show again for this campaign.
 * - Floating button shows the admin-configured banner_image_url (NOT diamond icon).
 * - Only visible to users (not hosts).
 * - Buy Now → shows payment method selection (Google / Recommended / Skrill for international)
 *   then navigates to Recharge page with campaign & method pre-selected.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { X, CreditCard, Wallet, Globe } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Diamond3DIcon from '@/components/common/Diamond3DIcon';

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

export function CampaignFloatingButton() {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [showPopup, setShowPopup] = useState(false);
  const [isHost, setIsHost] = useState<boolean | null>(null);
  const [purchased, setPurchased] = useState(false);
  const [isBangladesh, setIsBangladesh] = useState(true);
  const [selectedPaymentTab, setSelectedPaymentTab] = useState<PaymentTab>('google');
  const [showPaymentMethods, setShowPaymentMethods] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const navigate = useNavigate();

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

      // Check if already purchased this campaign
      if (localStorage.getItem(PURCHASED_KEY + c.id)) {
        setPurchased(true);
        setCampaign(null);
        return;
      }

      // Per-session timer
      const sessionKey = SESSION_KEY + '_' + c.id;
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
        return;
      }

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

  // Hide if: host, no campaign, expired, purchased, or not logged in
  if (isHost === true || isHost === null || !campaign || remainingSeconds <= 0 || purchased) return null;

  const discountPercent = campaign.offer_price_usd && campaign.original_price_usd > 0
    ? Math.round((1 - campaign.offer_price_usd / campaign.original_price_usd) * 100)
    : campaign.bonus_percentage ?? 0;

  const bonusText = discountPercent > 0 ? `${discountPercent}%` : '';

  const handleBuyNow = () => {
    setShowPaymentMethods(true);
  };

  const handleSelectPayment = (tab: PaymentTab) => {
    // Mark as purchased so it hides permanently
    localStorage.setItem(PURCHASED_KEY + campaign.id, 'true');
    setPurchased(true);
    setShowPopup(false);
    
    // Navigate to Recharge page with campaign and payment tab pre-selected
    navigate(`/recharge?campaign_id=${campaign.id}&tab=${tab}`);
  };

  // Payment method tabs based on country
  const paymentTabs: { key: PaymentTab; label: string; icon: React.ReactNode; description: string }[] = [
    {
      key: 'google',
      label: 'Google Pay',
      icon: <CreditCard className="w-5 h-5" />,
      description: 'Pay with Google Play',
    },
    {
      key: 'recommend',
      label: 'Recommended',
      icon: <Wallet className="w-5 h-5" />,
      description: 'Local payment methods',
    },
    // Skrill only for international users
    ...(!isBangladesh ? [{
      key: 'skrill' as PaymentTab,
      label: 'Skrill',
      icon: <Globe className="w-5 h-5" />,
      description: 'International payment',
    }] : []),
  ];

  return (
    <>
      {/* Floating Button — shows admin banner_image_url */}
      <AnimatePresence>
        {!showPopup && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="fixed z-[45] flex flex-col items-center"
            style={{ bottom: 'calc(var(--bottom-nav-height, 64px) + 32px)', right: '12px' }}
          >
            {/* Countdown badge on top */}
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 px-2 py-0.5 rounded-full bg-red-600 shadow-lg shadow-red-600/50 min-w-[44px] text-center">
              <span className="text-[9px] font-bold text-white tabular-nums">{formatCountdown(remainingSeconds)}</span>
            </div>
            
            <button
              onClick={() => setShowPopup(true)}
              className="relative w-[56px] h-[56px] rounded-full shadow-xl shadow-amber-500/40"
            >
              {/* Animated glow ring */}
              <div className="absolute inset-0 rounded-full animate-pulse" style={{ animationDuration: '2s' }}>
                <div className="w-full h-full rounded-full bg-gradient-to-tr from-amber-400 via-yellow-500 to-orange-500 opacity-80" />
              </div>
              {/* Inner circle — admin logo from banner_image_url */}
              <div className="absolute inset-[3px] rounded-full bg-gradient-to-br from-[#1a1a2e] to-[#16213e] flex items-center justify-center border border-amber-500/40 overflow-hidden">
                {campaign.banner_image_url ? (
                  <img 
                    src={campaign.banner_image_url} 
                    alt="" 
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  <Diamond3DIcon size={30} />
                )}
              </div>
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
            onClick={() => { setShowPopup(false); setShowPaymentMethods(false); }}
          >
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
            
            <motion.div
              initial={{ scale: 0.85, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.85, y: 30 }}
              transition={{ type: 'spring', damping: 22, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-[300px] rounded-3xl overflow-hidden shadow-2xl shadow-amber-500/20 border border-amber-600/30 bg-gradient-to-b from-[#1c1c1c] via-[#111111] to-[#0a0a0a]"
            >
              {/* Close button */}
              <button
                onClick={() => { setShowPopup(false); setShowPaymentMethods(false); }}
                className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/10 flex items-center justify-center z-10"
              >
                <X className="w-3.5 h-3.5 text-white/60" />
              </button>

              {/* Top section — Bonus banner */}
              <div className="relative pt-5 pb-3 flex flex-col items-center">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-40 bg-amber-500/15 rounded-full blur-3xl" />
                
                {bonusText && (
                  <div className="relative z-10 px-6 py-3 rounded-xl border-2 border-amber-500/50 bg-gradient-to-b from-amber-900/60 to-amber-950/40">
                    <p className="text-center">
                      <span className="text-amber-400 font-extrabold text-4xl drop-shadow-lg" style={{ textShadow: '0 0 20px rgba(251,191,36,0.5)' }}>
                        {bonusText}
                      </span>
                    </p>
                    <p className="text-amber-300 font-bold text-xl text-center tracking-wider" style={{ textShadow: '0 0 10px rgba(251,191,36,0.4)' }}>
                      BONUS
                    </p>
                  </div>
                )}

                {campaign.badge_text && (
                  <div className="mt-3 px-4 py-1 rounded-full bg-white/10 border border-white/20">
                    <span className="text-white/70 text-xs font-medium">{campaign.badge_text}</span>
                  </div>
                )}
              </div>

              <p className="text-white/80 text-sm font-semibold text-center px-4">
                {campaign.campaign_name}
              </p>

              {/* Diamond amount */}
              <div className="flex items-center justify-center gap-2 mt-3">
                <Diamond3DIcon size={22} />
                <span className="text-amber-400 font-bold text-2xl">
                  {campaign.diamonds_amount.toLocaleString()}
                  {campaign.bonus_diamonds > 0 && (
                    <span className="text-green-400 text-lg ml-1">+{campaign.bonus_diamonds.toLocaleString()}</span>
                  )}
                </span>
              </div>

              {/* Price */}
              <div className="flex items-center justify-center gap-2 mt-2">
                {campaign.offer_price_usd && campaign.offer_price_usd < campaign.original_price_usd ? (
                  <>
                    <span className="text-white/30 text-sm line-through">${campaign.original_price_usd}</span>
                    <span className="text-white font-bold text-xl">${campaign.offer_price_usd}</span>
                  </>
                ) : (
                  <span className="text-white font-bold text-xl">${campaign.original_price_usd}</span>
                )}
              </div>

              {/* Timer */}
              <div className="flex items-center justify-center gap-2 mt-3 mx-6 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <span className="text-amber-400 text-lg">👑</span>
                <span className="text-amber-300 text-sm font-bold tabular-nums">
                  {formatCountdown(remainingSeconds)} remaining
                </span>
              </div>

              {/* Payment Method Selection OR Buy Now Button */}
              <div className="px-5 pt-4 pb-3">
                {!showPaymentMethods ? (
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handleBuyNow}
                    className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-500 text-black font-extrabold text-base shadow-lg shadow-amber-500/30 active:shadow-sm transition-shadow"
                  >
                    Buy Now
                  </motion.button>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-2"
                  >
                    <p className="text-white/50 text-[10px] text-center font-medium uppercase tracking-wider mb-2">
                      Select Payment Method
                    </p>
                    {paymentTabs.map((tab) => (
                      <motion.button
                        key={tab.key}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => handleSelectPayment(tab.key)}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                          selectedPaymentTab === tab.key
                            ? 'border-amber-500/50 bg-amber-500/10'
                            : 'border-white/10 bg-white/5 hover:bg-white/10'
                        }`}
                      >
                        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center text-amber-400">
                          {tab.icon}
                        </div>
                        <div className="text-left flex-1">
                          <p className="text-white text-sm font-semibold">{tab.label}</p>
                          <p className="text-white/40 text-[10px]">{tab.description}</p>
                        </div>
                        <div className="text-amber-400 text-xs font-bold">→</div>
                      </motion.button>
                    ))}
                  </motion.div>
                )}
              </div>

              {/* Close (not dismiss permanently) */}
              <button
                onClick={() => { setShowPopup(false); setShowPaymentMethods(false); }}
                className="w-full text-center text-white/25 text-[11px] pb-4"
              >
                Not now
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default CampaignFloatingButton;
