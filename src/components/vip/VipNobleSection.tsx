import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Crown, Gift, Gem, Sparkles, Shield, Ghost, EyeOff, Coins, Zap, CheckCircle2, Clock } from "lucide-react";
import { useNobleSubscription } from "@/hooks/useNobleSubscription";
import { useVipDailyReward } from "@/hooks/useVipDailyReward";
import { toast } from "sonner";
import UniversalAnimationPlayer from "@/components/common/UniversalAnimationPlayer";

interface NobleCardRow {
  id: string;
  rank_code: string;
  rank_name: string;
  rank_order: number;
  monthly_diamond_cost: number;
  duration_days: number;
  description: string | null;
  badge_color: string | null;
  crown_url: string | null;
  entrance_animation_url: string | null;
  custom_avatar_frame_url: string | null;
  anti_kick_protection: boolean;
  stealth_mode: boolean;
  hide_real_level: boolean;
  recharge_bonus_percent: number;
  daily_free_diamonds: number;
  monthly_free_diamonds: number;
}

interface Props {
  userId: string | null;
  userDiamonds: number;
  onAfterPurchase?: () => void;
}

function formatCountdown(ms: number) {
  if (ms <= 0) return "Now";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function VipNobleSection({ userId, userDiamonds, onAfterPurchase }: Props) {
  const { noble, refetch: refetchNoble } = useNobleSubscription(userId);
  const { status: dailyStatus, claim: claimDaily, claiming, refetch: refetchDaily } = useVipDailyReward(userId);
  const [cards, setCards] = useState<NobleCardRow[]>([]);
  const [loadingCards, setLoadingCards] = useState(false);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const fetchCards = useCallback(async () => {
    setLoadingCards(true);
    const { data } = await supabase
      .from("noble_cards")
      .select(
        "id, rank_code, rank_name, rank_order, monthly_diamond_cost, duration_days, description, badge_color, crown_url, entrance_animation_url, custom_avatar_frame_url, anti_kick_protection, stealth_mode, hide_real_level, recharge_bonus_percent, daily_free_diamonds, monthly_free_diamonds"
      )
      .eq("is_active", true)
      .order("rank_order", { ascending: true });
    setCards((data as any) || []);
    setLoadingCards(false);
  }, []);

  useEffect(() => {
    fetchCards();
  }, [fetchCards]);

  // 1s tick for countdowns
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const handlePurchase = async (card: NobleCardRow) => {
    if (!userId) return;
    if (userDiamonds < card.monthly_diamond_cost) {
      toast.error(`Not enough diamonds. Need ${card.monthly_diamond_cost.toLocaleString()} 💎`);
      return;
    }
    if (!confirm(`Subscribe to ${card.rank_name} for ${card.monthly_diamond_cost.toLocaleString()} 💎 (${card.duration_days} days)?`)) return;

    setPurchasing(card.id);
    try {
      const { data, error } = await supabase.rpc("purchase_noble_card", {
        _noble_card_id: card.id,
        _auto_renew: false,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      const result: any = data;
      if (result?.success) {
        toast.success(`${card.rank_name} activated! Expires ${new Date(result.expires_at).toLocaleDateString()}`);
        await Promise.all([refetchNoble(), refetchDaily(), fetchCards()]);
        onAfterPurchase?.();
      } else {
        toast.error(result?.error || "Purchase failed");
      }
    } finally {
      setPurchasing(null);
    }
  };

  const nextClaimMs = dailyStatus?.next_claim_at
    ? new Date(dailyStatus.next_claim_at).getTime() - now
    : 0;

  return (
    <div className="space-y-4 px-4 mt-4">
      {/* ───── Daily Reward Card ───── */}
      {dailyStatus && dailyStatus.total_amount > 0 && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-100 via-yellow-50 to-amber-100 border border-amber-300/60 shadow-sm">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-amber-200/70 flex items-center justify-center">
                <Gift className="w-6 h-6 text-amber-700" />
              </div>
              <div>
                <div className="text-slate-800 font-bold text-base">Daily VIP Reward</div>
                <div className="text-slate-600 text-xs">
                  {dailyStatus.vip_amount > 0 && <>VIP +{dailyStatus.vip_amount} </>}
                  {dailyStatus.noble_amount > 0 && <>Noble +{dailyStatus.noble_amount}</>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-right">
                <div className="text-amber-700 font-bold text-lg">+{dailyStatus.total_amount} 💎</div>
                {!dailyStatus.can_claim && nextClaimMs > 0 && (
                  <div className="text-xs text-slate-500 flex items-center gap-1 justify-end">
                    <Clock className="w-3 h-3" />
                    {formatCountdown(nextClaimMs)}
                  </div>
                )}
              </div>
              <Button
                onClick={claimDaily}
                disabled={!dailyStatus.can_claim || claiming}
                className="bg-amber-500 hover:bg-amber-600 text-white"
                size="sm"
              >
                {claiming ? "..." : dailyStatus.can_claim ? "Claim" : <CheckCircle2 className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ───── Active Noble banner ───── */}
      {noble && (
        <div
          className="p-4 rounded-2xl border bg-white shadow-sm"
          style={{
            background: `linear-gradient(135deg, ${noble.badge_color || '#FFD700'}26, #ffffff 70%)`,
            borderColor: `${noble.badge_color || '#FFD700'}66`,
          }}
        >
          <div className="flex items-center gap-3">
            {noble.crown_url ? (
              <img src={noble.crown_url} alt="" className="w-12 h-12 object-contain" />
            ) : (
              <Crown className="w-10 h-10" style={{ color: noble.badge_color || '#FFD700' }} />
            )}
            <div className="flex-1">
              <div className="text-slate-800 font-bold flex items-center gap-2">
                {noble.rank_name}
                <Badge variant="outline" className="text-xs border-amber-400 text-amber-700">Active</Badge>
              </div>
              <div className="text-xs text-slate-500">
                Expires {new Date(noble.expires_at).toLocaleDateString()}
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {noble.anti_kick_protection && <Badge variant="outline" className="text-xs border-emerald-400 text-emerald-700"><Shield className="w-3 h-3 mr-1" />Anti-Kick</Badge>}
                {noble.stealth_mode && <Badge variant="outline" className="text-xs border-violet-400 text-violet-700"><Ghost className="w-3 h-3 mr-1" />Stealth</Badge>}
                {noble.hide_real_level && <Badge variant="outline" className="text-xs border-slate-300 text-slate-600"><EyeOff className="w-3 h-3 mr-1" />Hide Lvl</Badge>}
                {noble.recharge_bonus_percent > 0 && <Badge variant="outline" className="text-xs border-yellow-400 text-yellow-700"><Coins className="w-3 h-3 mr-1" />+{noble.recharge_bonus_percent}%</Badge>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ───── Noble Subscriptions ───── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-slate-800 font-bold text-lg flex items-center gap-2">
            <Crown className="w-5 h-5 text-amber-500" />
            Noble Subscriptions
          </h3>
          <span className="text-xs text-slate-500">Monthly</span>
        </div>

        {loadingCards && (
          <div className="text-center text-slate-500 py-6">Loading...</div>
        )}

        {!loadingCards && cards.length === 0 && (
          <div className="text-center text-slate-500 py-6 border border-dashed border-amber-200/60 rounded-xl bg-white/60">
            No Noble ranks available yet.
          </div>
        )}

        <div className="grid gap-3">
          {cards.map(card => {
            const isActive = noble?.noble_card_id === card.id;
            const canAfford = userDiamonds >= card.monthly_diamond_cost;
            return (
              <div
                key={card.id}
                className="rounded-2xl border border-amber-200/60 bg-white shadow-sm overflow-hidden"
              >
                <div
                  className="p-3 flex items-center justify-between gap-3"
                  style={{
                    background: `linear-gradient(135deg, ${card.badge_color || '#FFD700'}26, transparent)`,
                  }}
                >
                  <div className="flex items-center gap-3">
                    {card.crown_url ? (
                      <img src={card.crown_url} alt="" className="w-10 h-10 object-contain" />
                    ) : (
                      <Crown className="w-8 h-8" style={{ color: card.badge_color || '#FFD700' }} />
                    )}
                    <div>
                      <div className="text-slate-800 font-bold">{card.rank_name}</div>
                      <div className="text-xs text-slate-500">
                        💎 {card.monthly_diamond_cost.toLocaleString()} · {card.duration_days}d
                      </div>
                    </div>
                  </div>
                  {isActive ? (
                    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300">Active</Badge>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => handlePurchase(card)}
                      disabled={!!purchasing || !canAfford}
                      className="bg-amber-500 hover:bg-amber-600 text-white"
                    >
                      {purchasing === card.id ? "..." : canAfford ? "Subscribe" : "Need 💎"}
                    </Button>
                  )}
                </div>
                <div className="p-3 space-y-2">
                  {card.description && (
                    <p className="text-xs text-slate-600">{card.description}</p>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {card.anti_kick_protection && <Badge variant="outline" className="text-xs border-emerald-400 text-emerald-700"><Shield className="w-3 h-3 mr-1" />Anti-Kick</Badge>}
                    {card.stealth_mode && <Badge variant="outline" className="text-xs border-violet-400 text-violet-700"><Ghost className="w-3 h-3 mr-1" />Stealth</Badge>}
                    {card.hide_real_level && <Badge variant="outline" className="text-xs border-slate-300 text-slate-600"><EyeOff className="w-3 h-3 mr-1" />Hide Lvl</Badge>}
                    {card.recharge_bonus_percent > 0 && <Badge variant="outline" className="text-xs border-yellow-400 text-yellow-700">+{card.recharge_bonus_percent}% Recharge</Badge>}
                    {card.daily_free_diamonds > 0 && <Badge variant="outline" className="text-xs border-cyan-400 text-cyan-700"><Gem className="w-3 h-3 mr-1" />{card.daily_free_diamonds}/day</Badge>}
                    {card.monthly_free_diamonds > 0 && <Badge variant="outline" className="text-xs border-pink-400 text-pink-700"><Sparkles className="w-3 h-3 mr-1" />{card.monthly_free_diamonds}/mo</Badge>}
                  </div>
                  {card.entrance_animation_url && (
                    <div className="w-16 h-16 bg-slate-950 rounded overflow-hidden">
                      <UniversalAnimationPlayer
                        src={card.entrance_animation_url}
                        className="w-full h-full"
                        loop
                        autoPlay
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
