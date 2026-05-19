import { useEffect, useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Copy, Loader2, CheckCircle2, Sparkles } from "lucide-react";
import { formatNumber } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  package: {
    id: string;
    coins: number;
    bonus_percentage?: number;
    price_usd: number;
    name?: string;
  } | null;
}

const CRYPTO_OPTIONS = [
  { value: "usdttrc20", label: "USDT (TRC20) — recommended" },
  { value: "usdtbep20", label: "USDT (BEP20 / BSC)" },
  { value: "usdterc20", label: "USDT (ERC20)" },
  { value: "btc", label: "Bitcoin (BTC)" },
  { value: "eth", label: "Ethereum (ETH)" },
  { value: "bnb", label: "BNB" },
];

export default function SwiftPayDepositModal({ open, onOpenChange, package: pkg }: Props) {
  const { toast } = useToast();
  const [currency, setCurrency] = useState("usdttrc20");
  const [creating, setCreating] = useState(false);
  const [deposit, setDeposit] = useState<any>(null);
  const [credited, setCredited] = useState(false);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setDeposit(null);
      setCredited(false);
      setCreating(false);
    }
  }, [open]);

  const createDeposit = useCallback(async () => {
    if (!pkg) return;
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("swift-pay-create-deposit", {
        body: { package_id: pkg.id, pay_currency: currency },
      });
      if (error || data?.error) {
        toast({
          title: "Could not start deposit",
          description: data?.error || error?.message || "Gateway error",
          variant: "destructive",
        });
        setCreating(false);
        return;
      }
      setDeposit(data);
    } catch (e: any) {
      toast({ title: "Error", description: e?.message ?? "unknown", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  }, [pkg, currency, toast]);

  // Poll for status when deposit exists
  useEffect(() => {
    if (!deposit?.topup_id || credited) return;
    let active = true;
    const tick = async () => {
      const { data } = await supabase
        .from("swift_pay_topups")
        .select("status, credited_at")
        .eq("id", deposit.topup_id)
        .maybeSingle();
      if (!active) return;
      if (data?.status === "credited") {
        setCredited(true);
        toast({
          title: "✅ Diamonds credited!",
          description: `${formatNumber(deposit.coins_amount)} diamonds added to your balance.`,
        });
      } else {
        // also trigger the gateway poll so credit happens fast
        supabase.functions.invoke("swift-pay-poll-deposits", {
          body: { topup_id: deposit.topup_id },
        }).catch(() => {});
      }
    };
    tick();
    const id = setInterval(tick, 15000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [deposit, credited, toast]);

  const copy = (s: string) => {
    navigator.clipboard.writeText(s);
    toast({ title: "Copied" });
  };

  if (!pkg) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-gradient-to-b from-slate-900 to-slate-950 border-amber-500/30 text-amber-50">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-200">
            <Sparkles className="w-5 h-5" /> Swift Pay — Crypto Auto-Credit
          </DialogTitle>
          <DialogDescription className="text-amber-100/70">
            {formatNumber(pkg.coins)} diamonds · ${pkg.price_usd.toFixed(2)} USD
          </DialogDescription>
        </DialogHeader>

        {!deposit && (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-amber-100/90 mb-1.5 block">
                Choose crypto currency
              </label>
              <Select value={currency} onValueChange={setCurrency} disabled={creating}>
                <SelectTrigger className="bg-slate-800/60 border-amber-500/30 text-amber-50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CRYPTO_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={createDeposit}
              disabled={creating}
              className="w-full bg-gradient-to-r from-amber-500 to-yellow-600 hover:opacity-90 text-slate-950 font-bold"
            >
              {creating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating address…
                </>
              ) : (
                "Generate payment address"
              )}
            </Button>
            <p className="text-[11px] text-amber-100/60 leading-relaxed">
              You'll get a one-time crypto address. As soon as your payment confirms on-chain,
              diamonds are auto-credited — no screenshot, no waiting for a helper.
            </p>
          </div>
        )}

        {deposit && !credited && (
          <div className="space-y-3">
            <div className="rounded-lg bg-slate-800/60 border border-amber-500/30 p-3">
              <p className="text-[11px] uppercase tracking-wider text-amber-200/70 mb-1">
                Send exactly
              </p>
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xl font-black text-amber-200">
                  {deposit.pay_amount} <span className="text-sm">{deposit.pay_currency?.toUpperCase()}</span>
                </p>
                <Button size="sm" variant="ghost" onClick={() => copy(String(deposit.pay_amount))}>
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
              {deposit.network && (
                <p className="text-[10px] text-amber-100/60 mt-1">Network: {deposit.network}</p>
              )}
            </div>

            <div className="rounded-lg bg-slate-800/60 border border-amber-500/30 p-3">
              <p className="text-[11px] uppercase tracking-wider text-amber-200/70 mb-1">
                To this address
              </p>
              <div className="flex items-center justify-between gap-2">
                <p className="font-mono text-xs text-amber-100 break-all">{deposit.pay_address}</p>
                <Button size="sm" variant="ghost" onClick={() => copy(deposit.pay_address)}>
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 p-3">
              <Loader2 className="w-4 h-4 animate-spin text-amber-300" />
              <p className="text-xs text-amber-100/90">
                Waiting for blockchain confirmation… diamonds will appear automatically.
              </p>
            </div>
          </div>
        )}

        {credited && (
          <div className="text-center py-6 space-y-3">
            <CheckCircle2 className="w-14 h-14 text-emerald-400 mx-auto" />
            <p className="text-lg font-bold text-emerald-300">Payment received!</p>
            <p className="text-sm text-amber-100/80">
              {formatNumber(deposit.coins_amount)} diamonds added to your balance.
            </p>
            <Button onClick={() => onOpenChange(false)} className="w-full">Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
