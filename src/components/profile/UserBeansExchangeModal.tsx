import { useState, useEffect, forwardRef } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ArrowRight, Sparkles, CheckCircle2, X, ArrowDownUp } from "lucide-react";
import Beans3DIcon from "@/components/common/Beans3DIcon";
import Diamond3DIcon from "@/components/common/Diamond3DIcon";
import { sendNotification } from "@/services/notificationService";

interface ExchangeTier {
  id: string;
  beans_amount: number;
  diamonds_reward: number;
  display_order: number;
}

interface UserBeansExchangeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentBeans: number;
  userId: string;
  onExchangeComplete: () => void;
}

const UserBeansExchangeModal = forwardRef<HTMLDivElement, UserBeansExchangeModalProps>(function UserBeansExchangeModal({
  open,
  onOpenChange,
  currentBeans,
  userId,
  onExchangeComplete
}, ref) {
  const { toast } = useToast();
  const [tiers, setTiers] = useState<ExchangeTier[]>([]);
  const [selectedTier, setSelectedTier] = useState<ExchangeTier | null>(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [customBeans, setCustomBeans] = useState("");
  const [useCustom, setUseCustom] = useState(false);

  useEffect(() => {
    if (open) {
      fetchTiers();
      setCustomBeans("");
      setUseCustom(false);
      setSelectedTier(null);
    }
  }, [open]);

  const fetchTiers = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('user_beans_exchange_tiers')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true });
    if (data) setTiers(data);
    setLoading(false);
  };

  // Calculate diamonds for custom input based on the best matching tier ratio
  const getCustomDiamonds = (beans: number): number => {
    if (!tiers.length || beans <= 0) return 0;
    // Use the ratio from the first tier as the base conversion rate
    const ratio = tiers[0].diamonds_reward / tiers[0].beans_amount;
    return Math.floor(beans * ratio);
  };

  const customBeansNum = parseInt(customBeans) || 0;
  const customDiamonds = getCustomDiamonds(customBeansNum);
  const canAffordCustom = customBeansNum > 0 && currentBeans >= customBeansNum;

  const handleExchange = async () => {
    const beansToExchange = useCustom ? customBeansNum : selectedTier?.beans_amount;
    const diamondsToReceive = useCustom ? customDiamonds : selectedTier?.diamonds_reward;
    const tierId = useCustom ? tiers[0]?.id : selectedTier?.id;

    if (!beansToExchange || !diamondsToReceive || !tierId || !userId) return;

    if (currentBeans < beansToExchange) {
      toast({ title: "Insufficient Beans", description: `You need ${beansToExchange.toLocaleString()} beans`, variant: "destructive" });
      return;
    }

    setProcessing(true);
    try {
      const { error } = await supabase.rpc('exchange_user_beans_to_diamonds', {
        _user_id: userId,
        _beans_amount: beansToExchange,
        _diamonds_reward: diamondsToReceive,
        _tier_id: tierId
      });
      if (error) throw error;

      toast({ title: "Exchange Successful! 🎉", description: `Converted ${beansToExchange.toLocaleString()} beans to ${diamondsToReceive.toLocaleString()} diamonds` });
      onExchangeComplete();
      await sendNotification({
        userId, type: 'beans_exchanged',
        title: '💎 Beans Exchanged Successfully!',
        message: `You exchanged ${beansToExchange.toLocaleString()} Beans and received ${diamondsToReceive.toLocaleString()} Diamonds`,
        data: { beans_deducted: beansToExchange, diamonds_received: diamondsToReceive, exchange_type: 'beans_to_diamonds' }
      });
      onOpenChange(false);
      setSelectedTier(null);
      setCustomBeans("");
      setUseCustom(false);
    } catch (error: any) {
      toast({ title: "Exchange Failed", description: error.message || "Failed to exchange beans", variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  const isReady = useCustom ? canAffordCustom : !!selectedTier;
  const exchangeLabel = useCustom
    ? `Exchange ${customBeansNum.toLocaleString()} Beans`
    : selectedTier ? `Exchange ${selectedTier.beans_amount.toLocaleString()} Beans` : "";
  const diamondLabel = useCustom ? customDiamonds : selectedTier?.diamonds_reward;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0a0e1a] border border-amber-500/15 max-w-md mx-4 rounded-3xl p-0 overflow-hidden [&>button]:hidden shadow-[0_0_80px_-20px_rgba(245,158,11,0.15)]">
        {/* Header with animated gradient border */}
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-amber-600/20 via-yellow-500/10 to-amber-600/20" />
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />
          <div className="relative p-5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-yellow-600 flex items-center justify-center shadow-lg shadow-amber-500/30">
                <ArrowDownUp className="w-4 h-4 text-black" />
              </div>
              <h2 className="text-white font-bold text-lg tracking-tight">Beans → Diamonds</h2>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center transition-all"
            >
              <X className="w-4 h-4 text-white/60" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Balance Card */}
          <div className="relative overflow-hidden rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/5 via-transparent to-orange-500/5 p-4">
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            <div className="relative flex items-center justify-center gap-3">
              <Beans3DIcon size={36} />
              <div className="text-center">
                <span className="text-amber-400 font-bold text-3xl tracking-tight">
                  {currentBeans.toLocaleString()}
                </span>
                <p className="text-white/40 text-xs font-medium mt-0.5">Available Beans</p>
              </div>
            </div>
          </div>

          {/* Mode Toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => { setUseCustom(false); setCustomBeans(""); }}
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-semibold transition-all duration-300 border ${
                !useCustom
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-400 shadow-[0_0_20px_-5px_rgba(245,158,11,0.3)]'
                  : 'bg-white/3 border-white/8 text-white/40 hover:text-white/60 hover:border-white/15'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 inline mr-1.5" />
              Quick Select
            </button>
            <button
              onClick={() => { setUseCustom(true); setSelectedTier(null); }}
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-semibold transition-all duration-300 border ${
                useCustom
                  ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-400 shadow-[0_0_20px_-5px_rgba(6,182,212,0.3)]'
                  : 'bg-white/3 border-white/8 text-white/40 hover:text-white/60 hover:border-white/15'
              }`}
            >
              ✏️ Custom Amount
            </button>
          </div>

          {/* Content */}
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-8 h-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
            </div>
          ) : useCustom ? (
            /* Custom Input Mode */
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
                  className="w-full h-14 pl-12 pr-4 rounded-2xl bg-white/5 border border-white/10 text-white text-lg font-semibold placeholder:text-white/20 focus:outline-none focus:border-cyan-500/50 focus:bg-cyan-500/5 transition-all"
                />
              </div>
              
              {customBeansNum > 0 && (
                <div className="flex items-center justify-center gap-3 py-3 px-4 rounded-2xl bg-gradient-to-r from-cyan-500/5 to-blue-500/5 border border-cyan-500/15">
                  <div className="flex items-center gap-1.5">
                    <Beans3DIcon size={18} />
                    <span className="text-amber-400 font-bold">{customBeansNum.toLocaleString()}</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-white/30" />
                  <div className="flex items-center gap-1.5">
                    <Diamond3DIcon size={18} />
                    <span className="text-cyan-400 font-bold">{customDiamonds.toLocaleString()}</span>
                  </div>
                </div>
              )}

              {customBeansNum > 0 && !canAffordCustom && (
                <p className="text-red-400/80 text-xs text-center">
                  Insufficient beans. You need {(customBeansNum - currentBeans).toLocaleString()} more.
                </p>
              )}
            </div>
          ) : (
            /* Quick Select Tiers */
            <div className="grid grid-cols-2 gap-2.5">
              {tiers.map((tier) => {
                const canAfford = currentBeans >= tier.beans_amount;
                const isSelected = selectedTier?.id === tier.id;
                
                return (
                  <button
                    key={tier.id}
                    onClick={() => { if (canAfford) setSelectedTier(tier); }}
                    disabled={!canAfford}
                    className={`relative p-3.5 rounded-2xl border transition-all duration-300 group ${
                      isSelected
                        ? 'border-cyan-400/60 bg-gradient-to-br from-cyan-500/15 to-blue-600/10 shadow-[0_0_30px_-8px_rgba(6,182,212,0.4)] scale-[1.02]'
                        : canAfford
                          ? 'border-white/8 bg-white/[0.02] hover:border-amber-500/30 hover:bg-amber-500/5'
                          : 'border-white/5 bg-white/[0.01] opacity-35 cursor-not-allowed'
                    }`}
                  >
                    {isSelected && (
                      <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-cyan-500 flex items-center justify-center shadow-lg shadow-cyan-500/50">
                        <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                      </div>
                    )}
                    
                    <div className="text-center space-y-1.5">
                      <div className="flex items-center justify-center gap-1.5">
                        <Beans3DIcon size={18} />
                        <span className="text-amber-400 font-bold text-base">{tier.beans_amount.toLocaleString()}</span>
                      </div>
                      
                      <div className="text-white/20 text-[10px]">→</div>
                      
                      <div className="flex items-center justify-center gap-1.5">
                        <Diamond3DIcon size={18} />
                        <span className="text-cyan-400 font-bold text-base">{tier.diamonds_reward.toLocaleString()}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Exchange Button */}
          <Button
            onClick={handleExchange}
            disabled={!isReady || processing}
            className={`w-full h-14 rounded-2xl text-base font-bold transition-all duration-300 border-0 ${
              isReady
                ? 'bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-500 text-black shadow-[0_4px_30px_-5px_rgba(245,158,11,0.5)] hover:shadow-[0_4px_40px_-5px_rgba(245,158,11,0.7)]'
                : 'bg-white/5 text-white/25 cursor-not-allowed'
            }`}
          >
            {processing ? (
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
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

          <p className="text-center text-white/30 text-[11px]">
            Exchanged diamonds will be added to your My Diamonds balance
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
});

export default UserBeansExchangeModal;
