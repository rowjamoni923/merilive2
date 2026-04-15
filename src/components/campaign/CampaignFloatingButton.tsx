/**
 * CampaignFloatingButton — Floating circular button with countdown timer
 * Shows near bottom-right above bottom nav. Click opens campaign popup.
 * Only visible to users (not hosts). Auto-vanishes when timer expires.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Diamond, X, Timer, Sparkles, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

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
  created_at?: string;
}

// Format remaining time as MM:SS or HH:MM:SS
function formatCountdown(seconds: number): string {
  if (seconds <= 0) return '00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function CampaignFloatingButton() {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [showPopup, setShowPopup] = useState(false);
  const [isHost, setIsHost] = useState<boolean | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const navigate = useNavigate();
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  // Check if user is host
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setIsHost(null); return; }
      const { data } = await supabase
        .from('profiles')
        .select('gender')
        .eq('id', user.id)
        .single();
      // Hosts are Female gender
      setIsHost(data?.gender === 'Female');
    })();
  }, []);

  // Fetch active campaign
  const fetchCampaign = useCallback(async () => {
    const { data } = await supabase
      .from('recharge_campaigns')
      .select('*')
      .eq('is_active', true)
      .order('priority', { ascending: false })
      .limit(1);

    if (data && data.length > 0) {
      const c = data[0] as Campaign;
      // Check schedule
      const now = new Date();
      if (c.schedule_start && new Date(c.schedule_start) > now) { setCampaign(null); return; }
      if (c.schedule_end && new Date(c.schedule_end) < now) { setCampaign(null); return; }
      
      // Calculate remaining seconds from campaign start
      const startTime = c.schedule_start ? new Date(c.schedule_start).getTime() : 
                        (c.created_at ? new Date(c.created_at).getTime() : now.getTime());
      const endTime = startTime + (c.duration_minutes * 60 * 1000);
      const remaining = Math.max(0, Math.floor((endTime - now.getTime()) / 1000));
      
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

  useEffect(() => {
    fetchCampaign();
  }, [fetchCampaign]);

  // Countdown timer
  useEffect(() => {
    if (!campaign || remainingSeconds <= 0) return;
    
    timerRef.current = setInterval(() => {
      setRemainingSeconds(prev => {
        if (prev <= 1) {
          setCampaign(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [campaign]);

  // Don't show for hosts or if no campaign
  if (isHost || !campaign || remainingSeconds <= 0 || dismissed) return null;

  const discountPercent = campaign.offer_price_usd && campaign.original_price_usd > 0
    ? Math.round((1 - campaign.offer_price_usd / campaign.original_price_usd) * 100)
    : campaign.bonus_percentage ?? 0;

  return (
    <>
      {/* Floating Button - positioned above bottom nav, right side */}
      <AnimatePresence>
        {!showPopup && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="fixed z-[45] flex flex-col items-center"
            style={{ bottom: 'calc(var(--bottom-nav-height, 64px) + 12px)', right: '12px' }}
          >
            {/* Countdown badge */}
            <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-10 px-1.5 py-0.5 rounded-full bg-red-500 shadow-lg shadow-red-500/40 min-w-[40px] text-center">
              <span className="text-[8px] font-bold text-white tabular-nums">{formatCountdown(remainingSeconds)}</span>
            </div>
            
            <button
              onClick={() => setShowPopup(true)}
              className="relative w-14 h-14 rounded-full shadow-xl shadow-amber-500/30 overflow-hidden"
            >
              {/* Animated ring */}
              <div className="absolute inset-0 rounded-full animate-spin" style={{ animationDuration: '3s' }}>
                <div className="w-full h-full rounded-full bg-gradient-to-tr from-amber-400 via-orange-500 to-pink-500" />
              </div>
              {/* Inner circle with logo */}
              <div className="absolute inset-[3px] rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                {campaign.banner_image_url ? (
                  <img 
                    src={campaign.banner_image_url} 
                    alt="" 
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  <Diamond className="w-6 h-6 text-white drop-shadow" />
                )}
              </div>
              
              {/* Discount badge */}
              {discountPercent > 0 && (
                <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 px-1.5 py-0 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 shadow-sm">
                  <span className="text-[8px] font-extrabold text-white">{discountPercent}%</span>
                </div>
              )}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Campaign Popup Modal */}
      <AnimatePresence>
        {showPopup && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            onClick={() => setShowPopup(false)}
          >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
            
            {/* Popup Content */}
            <motion.div
              initial={{ scale: 0.8, y: 40 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.8, y: 40 }}
              transition={{ type: 'spring', damping: 22, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl"
            >
              {/* Header gradient */}
              <div className="relative bg-gradient-to-br from-amber-500 via-orange-500 to-pink-600 p-6 pb-8">
                {/* Decorative */}
                <div className="absolute top-2 right-2 opacity-15">
                  <Sparkles className="w-20 h-20 text-white" />
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-slate-900 to-transparent" />
                
                {/* Close button */}
                <button
                  onClick={() => setShowPopup(false)}
                  className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center z-10"
                >
                  <X className="w-4 h-4 text-white" />
                </button>

                {/* Campaign image or icon */}
                <div className="flex justify-center mb-3">
                  {campaign.banner_image_url ? (
                    <img 
                      src={campaign.banner_image_url} 
                      alt={campaign.campaign_name}
                      className="w-20 h-20 rounded-2xl object-cover shadow-lg"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-lg">
                      <Diamond className="w-10 h-10 text-white" />
                    </div>
                  )}
                </div>

                <h2 className="text-white font-bold text-xl text-center">{campaign.campaign_name}</h2>
                
                {campaign.badge_text && (
                  <div className="flex justify-center mt-2">
                    <span className="px-3 py-1 rounded-full bg-white/20 backdrop-blur-sm text-white text-xs font-bold">
                      🔥 {campaign.badge_text}
                    </span>
                  </div>
                )}
              </div>

              {/* Body */}
              <div className="bg-slate-900 p-5 space-y-4">
                {/* Timer */}
                <div className="flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-red-500/15 border border-red-500/30">
                  <Timer className="w-4 h-4 text-red-400 animate-pulse" />
                  <span className="text-red-400 text-sm font-bold tabular-nums">
                    {formatCountdown(remainingSeconds)}
                  </span>
                  <span className="text-red-300/70 text-xs">remaining</span>
                </div>

                {/* Diamond details */}
                <div className="flex items-center justify-between py-3 px-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <div className="flex items-center gap-2">
                    <Diamond className="w-5 h-5 text-amber-400" />
                    <div>
                      <p className="text-white font-bold text-lg">
                        {campaign.diamonds_amount.toLocaleString()}
                      </p>
                      <p className="text-white/50 text-[10px]">Diamonds</p>
                    </div>
                  </div>
                  {campaign.bonus_diamonds > 0 && (
                    <div className="text-right">
                      <p className="text-amber-400 font-bold text-lg flex items-center gap-1">
                        <Zap className="w-4 h-4" />
                        +{campaign.bonus_diamonds.toLocaleString()}
                      </p>
                      <p className="text-amber-400/60 text-[10px]">Bonus</p>
                    </div>
                  )}
                </div>

                {/* Price */}
                <div className="flex items-center justify-center gap-3">
                  {campaign.offer_price_usd && campaign.offer_price_usd < campaign.original_price_usd ? (
                    <>
                      <span className="text-white/40 text-lg line-through">${campaign.original_price_usd}</span>
                      <span className="text-white font-extrabold text-3xl">${campaign.offer_price_usd}</span>
                      <span className="px-2 py-0.5 rounded-full bg-green-500 text-white text-xs font-bold">
                        -{discountPercent}%
                      </span>
                    </>
                  ) : (
                    <span className="text-white font-extrabold text-3xl">${campaign.original_price_usd}</span>
                  )}
                </div>

                {/* CTA Button */}
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    setShowPopup(false);
                    navigate('/recharge');
                  }}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-pink-500 text-white font-bold text-base shadow-lg shadow-orange-500/30 active:shadow-sm transition-shadow"
                >
                  ⚡ Top Up Now
                </motion.button>

                {/* Dismiss link */}
                <button
                  onClick={() => { setShowPopup(false); setDismissed(true); }}
                  className="w-full text-center text-white/30 text-xs py-1"
                >
                  Not interested
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default CampaignFloatingButton;
