/**
 * TopUpCampaignBanner — Shows active recharge campaigns as attractive cards
 * Displays on: Home, Party, Reels, Profile, Messages screens
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

import { Diamond, Sparkles, Timer, Gift, Zap, X } from 'lucide-react';
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
  display_locations: string[] | null;
  target_audience: string;
  is_first_recharge_only: boolean;
  priority: number;
  schedule_start: string | null;
  schedule_end: string | null;
}

interface TopUpCampaignBannerProps {
  location: 'home' | 'party' | 'reels' | 'chat' | 'profile';
  compact?: boolean;
  className?: string;
}

export function TopUpCampaignBanner({ location, compact = false, className }: TopUpCampaignBannerProps) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const navigate = useNavigate();

  const fetchCampaigns = useCallback(async () => {
    const now = new Date().toISOString();
    const { data } = await supabase
      .from('recharge_campaigns')
      .select('*')
      .eq('is_active', true)
      .order('priority', { ascending: false });

    if (data) {
      const filtered = (data as Campaign[]).filter(c => {
        // Check location
        if (c.display_locations && !c.display_locations.includes(location)) return false;
        // Check schedule
        if (c.schedule_start && new Date(c.schedule_start) > new Date()) return false;
        if (c.schedule_end && new Date(c.schedule_end) < new Date()) return false;
        return true;
      });
      setCampaigns(filtered);
    }
  }, [location]);

  useEffect(() => {
    fetchCampaigns();
    // Pkg91: recharge_campaigns is admin-managed (tg_admin_broadcast_recharge_campaigns).
    // Use Pkg37 'admin-table-update' window event instead of dead postgres_changes
    // (table not in supabase_realtime publication).
    const onAdminUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ table?: string }>).detail;
      if (detail?.table === 'recharge_campaigns') fetchCampaigns();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchCampaigns();
    };
    window.addEventListener('admin-table-update', onAdminUpdate as EventListener);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('admin-table-update', onAdminUpdate as EventListener);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fetchCampaigns, location]);


  const visibleCampaigns = campaigns.filter(c => !dismissed.has(c.id));

  if (visibleCampaigns.length === 0) return null;

  const campaign = visibleCampaigns[0]; // Show highest priority

  const handleClick = () => {
    navigate('/recharge');
  };

  const handleDismiss = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDismissed(prev => new Set(prev).add(id));
  };

  const discountPercent = campaign.offer_price_usd && campaign.original_price_usd > 0
    ? Math.round((1 - campaign.offer_price_usd / campaign.original_price_usd) * 100)
    : campaign.bonus_percentage ?? 0;

  if (compact) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn('mx-2 mb-2', className)}
      >
        <button
          onClick={handleClick}
          className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-gradient-to-r from-amber-500/20 via-orange-500/15 to-pink-500/20 border border-amber-500/30 active:scale-[0.98] transition-transform"
        >
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shrink-0">
 <Diamond className="w-5 h-5 text-slate-900" />
          </div>
          <div className="flex-1 text-left">
 <p className="text-slate-900 text-xs font-semibold truncate">{campaign.campaign_name}</p>
            <p className="text-amber-700 text-[10px]">
              {campaign.bonus_diamonds > 0 && `+${campaign.bonus_diamonds.toLocaleString()} bonus 💎`}
              {discountPercent > 0 && ` • ${discountPercent}% OFF`}
            </p>
          </div>
 <div className="shrink-0 px-2.5 py-1 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-slate-900 text-[10px] font-bold">
            {campaign.badge_text || 'GET'}
          </div>
        </button>
      </motion.div>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        key={campaign.id}
        initial={{ opacity: 0, y: 15, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.95 }}
        transition={{ type: 'spring', damping: 20 }}
        className={cn('mx-2 mb-3', className)}
      >
        <div
          onClick={handleClick}
          className="relative overflow-hidden rounded-2xl cursor-pointer active:scale-[0.98] transition-transform"
        >
          {/* Background */}
          {campaign.banner_image_url ? (
            <div className="relative">
              <img
                src={campaign.banner_image_url}
                alt={campaign.campaign_name}
                className="w-full h-24 object-cover rounded-2xl"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/30 to-transparent rounded-2xl" />
              {/* Content over image */}
              <div className="absolute inset-0 flex items-center justify-between px-4">
                <div>
 <p className="text-slate-900 font-bold text-sm">{campaign.campaign_name}</p>
                  <p className="text-amber-700 text-xs mt-0.5">
                    💎 {campaign.diamonds_amount.toLocaleString()}
                    {campaign.bonus_diamonds > 0 && ` +${campaign.bonus_diamonds.toLocaleString()} Bonus`}
                  </p>
                </div>
                <div className="text-right">
                  {campaign.offer_price_usd ? (
                    <>
 <p className="text-slate-700/50 text-xs line-through">${campaign.original_price_usd}</p>
 <p className="text-slate-900 font-bold text-lg">${campaign.offer_price_usd}</p>
                    </>
                  ) : (
 <p className="text-slate-900 font-bold text-lg">${campaign.original_price_usd}</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="relative bg-gradient-to-r from-amber-600/90 via-orange-500/90 to-pink-500/90 p-4 rounded-2xl">
              {/* Decorative elements */}
              <div className="absolute top-1 right-1 opacity-10">
 <Sparkles className="w-16 h-16 text-slate-900" />
              </div>
              
              <div className="flex items-center justify-between relative z-10">
                <div className="flex-1">
                  <div className="flex items-center gap-1.5 mb-1">
                    {campaign.badge_text && (
 <span className="px-2 py-0.5 rounded-full bg-white/20 text-slate-900 text-[9px] font-bold uppercase">
                        {campaign.badge_text}
                      </span>
                    )}
                    {discountPercent > 0 && (
 <span className="px-2 py-0.5 rounded-full bg-red-500 text-slate-900 text-[9px] font-bold">
                        -{discountPercent}%
                      </span>
                    )}
                  </div>
 <p className="text-slate-900 font-bold text-sm">{campaign.campaign_name}</p>
 <p className="text-slate-700/80 text-xs mt-0.5">
                    💎 {campaign.diamonds_amount.toLocaleString()} Diamonds
                    {campaign.bonus_diamonds > 0 && (
                      <span className="text-yellow-200 font-semibold"> +{campaign.bonus_diamonds.toLocaleString()} Bonus</span>
                    )}
                  </p>
                </div>
                
                <div className="text-right ml-3">
                  {campaign.offer_price_usd && campaign.offer_price_usd < campaign.original_price_usd ? (
                    <>
 <p className="text-slate-700/50 text-[10px] line-through">${campaign.original_price_usd}</p>
 <p className="text-slate-900 font-bold text-xl">${campaign.offer_price_usd}</p>
                    </>
                  ) : (
 <p className="text-slate-900 font-bold text-xl">${campaign.original_price_usd}</p>
                  )}
                  <div className="mt-1 px-3 py-1 rounded-full bg-white/20 backdrop-blur-sm">
 <span className="text-slate-900 text-[10px] font-semibold">Top Up →</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Dismiss button */}
          <button
            onClick={(e) => handleDismiss(e, campaign.id)}
 className="absolute top-2 right-2 w-5 h-5 rounded-full bg-slate-100/40 flex items-center justify-center z-20"
          >
 <X className="w-3 h-3 text-slate-700/70" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export default TopUpCampaignBanner;
