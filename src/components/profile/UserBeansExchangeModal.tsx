import { useState, useEffect, forwardRef, useMemo } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ArrowRight, Sparkles, CheckCircle2, X, ArrowDownUp } from "lucide-react";
import Beans3DIcon from "@/components/common/Beans3DIcon";
import Diamond3DIcon from "@/components/common/Diamond3DIcon";
import { sendNotification } from "@/services/notificationService";
import Skeleton from "@/components/Skeleton";

/**
 * Tier shape matches the current `user_beans_exchange_tiers` schema:
 *   min_beans, max_beans (nullable = no upper limit),
 *   exchange_rate (diamonds per 1 bean),
 *   bonus_percent (0–100 added on top).
 */
interface ExchangeTier {
  id: string;
  tier_name: string | null;
  min_beans: number;
  max_beans: number | null;
  exchange_rate: number;
  bonus_percent: number | null;
  display_order: number;
}

interface CoinExchangeSettings {
  beans_to_diamonds_rate: number;
  exchange_fee_percent: number;
  min_exchange_amount: number;
}

const normalizeDiamondExchangeSettings = (value: unknown): CoinExchangeSettings | null => {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<Record<keyof CoinExchangeSettings, unknown>>;
  const rate = Number(raw.beans_to_diamonds_rate ?? 0);
  const fee = Number(raw.exchange_fee_percent ?? 0);
  const min = Number(raw.min_exchange_amount ?? 0);
  if (!Number.isFinite(rate) || rate <= 0 || !Number.isFinite(min) || min <= 0) return null;

  return {
    beans_to_diamonds_rate: rate,
    exchange_fee_percent: Number.isFinite(fee) && fee >= 0 ? fee : 0,
    min_exchange_amount: min,
  };
};

const parseAppSettingValue = (value: unknown) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  return value;
};

interface UserBeansExchangeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentBeans: number;
  userId: string;
  onExchangeComplete: () => void;
}

function diamondsFor(tier: ExchangeTier, beans: number): number {
  if (!tier || beans <= 0) return 0;
  const bonus = 1 + (Number(tier.bonus_percent) || 0) / 100;
  return Math.floor(beans * Number(tier.exchange_rate) * bonus);
}

function diamondsForSettings(settings: CoinExchangeSettings, beans: number): number {
  if (!settings || beans <= 0) return 0;
  const rawDiamonds = Math.floor(beans / settings.beans_to_diamonds_rate);
  const fee = Math.floor(rawDiamonds * settings.exchange_fee_percent / 100);
  return Math.max(0, rawDiamonds - fee);
}

const UserBeansExchangeModal = forwardRef<HTMLDivElement, UserBeansExchangeModalProps>(function UserBeansExchangeModal({
  open,
  onOpenChange,
  currentBeans,
  userId,
  onExchangeComplete,
}, ref) {
  const { toast } = useToast();
  const [tiers, setTiers] = useState<ExchangeTier[]>([]);
  const [selectedTier, setSelectedTier] = useState<ExchangeTier | null>(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [customBeans, setCustomBeans] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [coinExchangeSettings, setDiamondExchangeSettings] = useState<CoinExchangeSettings | null>(null);

  useEffect(() => {
    if (open) {
      fetchTiers();
      setCustomBeans("");
      setUseCustom(false);
      setSelectedTier(null);
    }
  }, [open]);

  const getDiamondsForTier = (tier: ExchangeTier | null, beans: number) => {
    if (!tier) return 0;
    if (tier.id.startsWith('settings-') && coinExchangeSettings) {
      return diamondsForSettings(coinExchangeSettings, beans);
    }
    return diamondsFor(tier, beans);
  };

  const fetchTiers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('user_beans_exchange_tiers')
      .select('id, tier_name, min_beans, max_beans, exchange_rate, bonus_percent, display_order')
      .eq('is_active', true)
      .order('display_order', { ascending: true });
    if (error) {
      toast({ title: 'Failed to load exchange tiers', description: error.message, variant: 'destructive' });
    }
    let activeTiers = (data as ExchangeTier[]) || [];
    const { data: settingsRow } = await supabase
      .from('app_settings')
      .select('setting_value')
      .eq('setting_key', 'diamond_exchange')
      .maybeSingle();
    const settingsValue = parseAppSettingValue(settingsRow?.setting_value);
    const settings = normalizeDiamondExchangeSettings(settingsValue);
    setDiamondExchangeSettings(settings);

    if (activeTiers.length === 0 && settings) {
      const baseAmounts = [settings.min_exchange_amount, settings.min_exchange_amount * 5, settings.min_exchange_amount * 10]
        .filter((amount, index, array) => amount > 0 && array.indexOf(amount) === index);

      activeTiers = baseAmounts.map((amount, index) => ({
        id: `settings-${amount}`,
        tier_name: index === 0 ? 'Minimum' : index === 1 ? 'Popular' : 'Premium',
        min_beans: amount,
        max_beans: null,
        exchange_rate: 1 / settings.beans_to_diamonds_rate,
        bonus_percent: -settings.exchange_fee_percent,
        display_order: index + 1,
      }));
    }
    setTiers(activeTiers);
    setLoading(false);
  };

  // For custom mode, pick the tier whose [min,max] covers the typed amount.
  const customBeansNum = parseInt(customBeans) || 0;
  const customTier = useMemo(() => {
    if (!customBeansNum) return null;
    return (
      tiers.find(t => customBeansNum >= t.min_beans && (t.max_beans == null || customBeansNum <= t.max_beans)) || null
    );
  }, [customBeansNum, tiers]);
  const customDiamonds = customTier ? getDiamondsForTier(customTier, customBeansNum) : 0;
  const canAffordCustom = customBeansNum > 0 && currentBeans >= customBeansNum && !!customTier;

  const handleExchange = async () => {
    let beansToExchange: number | undefined;
    let diamondsToReceive: number | undefined;
    let tierId: string | undefined;

    if (useCustom) {
      if (!customTier) {
        toast({ title: 'No tier matches that amount', variant: 'destructive' });
        return;
      }
      beansToExchange = customBeansNum;
      diamondsToReceive = customDiamonds;
      tierId = customTier.id.startsWith('settings-') ? undefined : customTier.id;
    } else if (selectedTier) {
      // Quick-select uses tier's min_beans as the exchange amount.
      beansToExchange = selectedTier.min_beans;
      diamondsToReceive = getDiamondsForTier(selectedTier, selectedTier.min_beans);
      tierId = selectedTier.id.startsWith('settings-') ? undefined : selectedTier.id;
    }

    if (!beansToExchange || !diamondsToReceive || !userId) return;

    if (currentBeans < beansToExchange) {
      toast({ title: "Insufficient Beans", description: `You need ${beansToExchange.toLocaleString()} beans`, variant: "destructive" });
      return;
    }

    setProcessing(true);
    try {
      const rpcArgs = {
        _user_id: userId,
        _beans_amount: beansToExchange,
        _diamonds_reward: diamondsToReceive,
        ...(tierId ? { _tier_id: tierId } : {}),
      };
      const { data, error } = await supabase.rpc('exchange_user_beans_to_diamonds', rpcArgs);
      if (error) throw error;
      const result = data as { success?: boolean; error?: string } | null;
      if (result && result.success === false) {
        throw new Error(result.error || 'Exchange failed');
      }

      toast({ title: "Exchange Successful! 🎉", description: `Converted ${beansToExchange.toLocaleString()} beans to ${diamondsToReceive.toLocaleString()} diamonds` });
      onExchangeComplete();
      await sendNotification({
        userId, type: 'beans_exchanged',
        title: '💎 Beans Exchanged Successfully!',
        message: `You exchanged ${beansToExchange.toLocaleString()} Beans and received ${diamondsToReceive.toLocaleString()} Diamonds`,
        data: { beans_deducted: beansToExchange, diamonds_received: diamondsToReceive, exchange_type: 'beans_to_diamonds' },
      });
      onOpenChange(false);
      setSelectedTier(null);
      setCustomBeans("");
      setUseCustom(false);
    } catch (error: unknown) {
      toast({ title: "Exchange Failed", description: error instanceof Error ? error.message : "Failed to exchange beans", variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  const selectedDiamonds = selectedTier ? getDiamondsForTier(selectedTier, selectedTier.min_beans) : 0;
  const isReady = useCustom ? canAffordCustom : !!selectedTier;
  const exchangeLabel = useCustom
    ? `Exchange ${customBeansNum.toLocaleString()} Beans`
    : selectedTier ? `Exchange ${selectedTier.min_beans.toLocaleString()} Beans` : "";
  const diamondLabel = useCustom ? customDiamonds : selectedDiamonds;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-gradient-to-b from-warning-50 via-card to-background border border-warning-200 max-w-md mx-4 rounded-3xl p-0 overflow-hidden [&>button]:hidden shadow-2xl shadow-warning-900/10">
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-warning-100 via-card to-warning-100" />
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-warning-300 to-transparent" />
          <div className="relative p-5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-warning-400 to-warning-600 flex items-center justify-center shadow-lg shadow-warning-500/30">
                <ArrowDownUp className="w-4 h-4 text-accent-foreground" />
              </div>
              <h2 className="text-foreground font-bold text-lg tracking-tight">Beans → Diamonds</h2>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="w-8 h-8 rounded-full bg-card hover:bg-warning-50 border border-warning-200 flex items-center justify-center transition-all shadow-sm"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          <div className="relative overflow-hidden rounded-2xl border border-warning-200 bg-card p-4 shadow-sm">
            <div className="relative flex items-center justify-center gap-3">
              <Beans3DIcon size={36} />
              <div className="text-center">
                <span className="text-warning-700 font-bold text-3xl tracking-tight">
                  {currentBeans.toLocaleString()}
                </span>
                <p className="text-muted-foreground text-xs font-medium mt-0.5">Available Beans</p>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => { setUseCustom(false); setCustomBeans(""); }}
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-semibold transition-all duration-300 border ${
                !useCustom
                  ? 'bg-warning-100 border-warning-300 text-warning-800 shadow-sm'
                  : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-warning-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 inline mr-1.5" />
              Quick Select
            </button>
            <button
              onClick={() => { setUseCustom(true); setSelectedTier(null); }}
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-semibold transition-all duration-300 border ${
                useCustom
                  ? 'bg-info-50 border-info-200 text-info-800 shadow-sm'
                  : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-info-200'
              }`}
            >
              Custom Amount
            </button>
          </div>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-border">
                  <Skeleton className="w-10 h-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                  <Skeleton className="h-6 w-16" />
                </div>
              ))}
            </div>
          ) : tiers.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground text-sm">
              No exchange tiers available right now.
            </div>
          ) : useCustom ? (
            <div className="space-y-4">
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2">
                  <Beans3DIcon size={22} />
                </div>
                <input
                  type="number"
                  placeholder="Enter beans amount..."
                  value={customBeans}
                  onChange={(e) => setCustomBeans(e.target.value)}
                  className="w-full h-14 pl-12 pr-4 rounded-2xl bg-card border border-warning-200 text-foreground text-lg font-semibold placeholder:text-muted-foreground focus:outline-none focus:border-info-300 focus:bg-info-50 transition-all"
                />
              </div>

              {customBeansNum > 0 && customTier && (
                <div className="flex items-center justify-center gap-3 py-3 px-4 rounded-2xl bg-info-50 border border-info-100">
                  <div className="flex items-center gap-1.5">
                    <Beans3DIcon size={18} />
                    <span className="text-warning-700 font-bold">{customBeansNum.toLocaleString()}</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  <div className="flex items-center gap-1.5">
                    <Diamond3DIcon size={18} />
                    <span className="text-info-700 font-bold">{customDiamonds.toLocaleString()}</span>
                  </div>
                </div>
              )}

              {customBeansNum > 0 && !customTier && (
                <p className="text-warning-700/80 text-xs text-center">
                  Amount doesn't match any active tier range.
                </p>
              )}
              {customBeansNum > 0 && customTier && currentBeans < customBeansNum && (
                <p className="text-danger-600/80 text-xs text-center">
                  Insufficient beans. You need {(customBeansNum - currentBeans).toLocaleString()} more.
                </p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              {tiers.map((tier) => {
                const tierBeans = tier.min_beans;
                const tierDiamonds = getDiamondsForTier(tier, tierBeans);
                const canAfford = currentBeans >= tierBeans;
                const isSelected = selectedTier?.id === tier.id;

                return (
                  <button
                    key={tier.id}
                    onClick={() => { if (canAfford) setSelectedTier(tier); }}
                    disabled={!canAfford}
                    className={`relative p-3.5 rounded-2xl border transition-all duration-300 group ${
                      isSelected
                        ? 'border-info-300 bg-info-50 shadow-md shadow-info-900/10 scale-[1.02]'
                        : canAfford
                          ? 'border-warning-200 bg-card hover:border-warning-300 hover:bg-warning-50'
                          : 'border-border bg-muted opacity-50 cursor-not-allowed'
                    }`}
                  >
                    {isSelected && (
                      <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-info-500 flex items-center justify-center shadow-lg shadow-info-500/50">
                        <CheckCircle2 className="w-3.5 h-3.5 text-primary-foreground" />
                      </div>
                    )}

                    <div className="text-center space-y-1.5">
                      {tier.tier_name && (
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{tier.tier_name}</p>
                      )}
                      <div className="flex items-center justify-center gap-1.5">
                        <Beans3DIcon size={18} />
                        <span className="text-warning-700 font-bold text-base">{tierBeans.toLocaleString()}</span>
                      </div>

                      <div className="text-muted-foreground text-[10px]">→</div>

                      <div className="flex items-center justify-center gap-1.5">
                        <Diamond3DIcon size={18} />
                        <span className="text-info-700 font-bold text-base">{tierDiamonds.toLocaleString()}</span>
                      </div>
                      {(tier.bonus_percent ?? 0) > 0 && (
                        <p className="text-[10px] text-success-700">+{tier.bonus_percent}% bonus</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <Button
            onClick={handleExchange}
            disabled={!isReady || processing}
            className={`w-full h-14 rounded-2xl text-base font-bold transition-all duration-300 border-0 ${
              isReady
                ? 'bg-gradient-to-r from-primary via-secondary to-primary text-primary-foreground shadow-lg shadow-brand-900/20 hover:scale-[1.01]'
                : 'bg-muted text-muted-foreground cursor-not-allowed'
            }`}
          >
            {processing ? (
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                Processing...
              </div>
            ) : isReady ? (
              <div className="flex items-center gap-2">
                <span>{exchangeLabel}</span>
                <ArrowRight className="w-5 h-5" />
                <Diamond3DIcon size={20} />
                <span>{diamondLabel?.toLocaleString()}</span>
              </div>
            ) : (
              "Select an amount to exchange"
            )}
          </Button>

          <p className="text-center text-muted-foreground text-[11px]">
            Exchanged diamonds will be added to your My Diamonds balance
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
});

export default UserBeansExchangeModal;
