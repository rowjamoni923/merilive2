import { useEffect, useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Copy, Loader2, CheckCircle2, Sparkles, ChevronLeft } from "lucide-react";

const fmt = (n: number) => new Intl.NumberFormat("en-US").format(Math.floor(n || 0));

interface PkgLite {
  id: string;
  coins: number;
  bonus_percentage?: number;
  price_usd: number;
  name?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  packages: PkgLite[];
  initialPackageId?: string | null;
}

const CRYPTO_OPTIONS = [
  { value: "usdttrc20", label: "USDT (TRC20) — recommended, lowest fee" },
  { value: "usdtbep20", label: "USDT (BEP20 / BSC)" },
  { value: "usdterc20", label: "USDT (ERC20)" },
  { value: "btc", label: "Bitcoin (BTC)" },
  { value: "eth", label: "Ethereum (ETH)" },
  { value: "bnb", label: "BNB" },
];

type Step = "pick_pkg" | "pick_currency" | "pay" | "done";

export default function SwiftPayDepositModal({ open, onOpenChange, packages }: Props) {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("pick_pkg");
  const [pkg, setPkg] = useState<PkgLite | null>(null);
  const [currency, setCurrency] = useState("usdttrc20");
  const [creating, setCreating] = useState(false);
  const [deposit, setDeposit] = useState<any>(null);

  useEffect(() => {
    if (!open) {
      setStep("pick_pkg");
      setPkg(null);
      setCurrency("usdttrc20");
      setDeposit(null);
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
      setStep("pay");
    } catch (e: any) {
      toast({ title: "Error", description: e?.message ?? "unknown", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  }, [pkg, currency, toast]);

  // Poll for credit status
  useEffect(() => {
    if (step !== "pay" || !deposit?.topup_id) return;
    let active = true;
    const tick = async () => {
      const { data } = await supabase
        .from("swift_pay_topups")
        .select("status")
        .eq("id", deposit.topup_id)
        .maybeSingle();
      if (!active) return;
      if (data?.status === "credited") {
        setStep("done");
        toast({
          title: "✅ Diamonds credited!",
          description: `${fmt(deposit.coins_amount)} diamonds added to your balance.`,
        });
      } else {
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
  }, [step, deposit, toast]);

  const copy = (s: string) => {
    navigator.clipboard.writeText(s);
    toast({ title: "Copied" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-gradient-to-b from-slate-900 to-slate-950 border-amber-500/30 text-amber-50 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-200">
            <Sparkles className="w-5 h-5" /> MeriCash — Crypto Auto-Credit
          </DialogTitle>
          <DialogDescription className="text-amber-100/70 text-xs">
            Pay with crypto, diamonds credit automatically on blockchain confirmation.
          </DialogDescription>
        </DialogHeader>

        {step === "pick_pkg" && (
          <div className="space-y-3">
            <p className="text-sm text-amber-100/90">Choose a diamond package:</p>
            <div className="grid grid-cols-2 gap-2 max-h-[50vh] overflow-y-auto">
              {packages.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setPkg(p); setStep("pick_currency"); }}
                  className="rounded-lg border border-amber-500/30 bg-slate-800/60 hover:border-amber-400 hover:bg-slate-800 p-3 text-left transition"
                >
                  <p className="text-lg font-black text-amber-200">{fmt(p.coins)}</p>
                  <p className="text-[10px] text-amber-100/60 uppercase">diamonds</p>
                  <p className="text-sm font-bold text-amber-100 mt-1">${p.price_usd.toFixed(2)}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === "pick_currency" && pkg && (
          <div className="space-y-4">
            <button onClick={() => setStep("pick_pkg")} className="flex items-center gap-1 text-xs text-amber-200/80 hover:text-amber-200">
              <ChevronLeft className="w-3 h-3" /> Back
            </button>
            <div className="rounded-lg bg-slate-800/60 border border-amber-500/30 p-3">
              <p className="text-2xl font-black text-amber-200">{fmt(pkg.coins)} <span className="text-xs">diamonds</span></p>
              <p className="text-sm text-amber-100/80">${pkg.price_usd.toFixed(2)} USD</p>
            </div>
            <div>
              <label className="text-sm font-medium text-amber-100/90 mb-1.5 block">Choose crypto</label>
              <Select value={currency} onValueChange={setCurrency} disabled={creating}>
                <SelectTrigger className="bg-slate-800/60 border-amber-500/30 text-amber-50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CRYPTO_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={createDeposit}
              disabled={creating}
              className="w-full bg-gradient-to-r from-amber-500 to-yellow-600 hover:opacity-90 text-slate-950 font-bold"
            >
              {creating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating address…</> : "Generate payment address"}
            </Button>
          </div>
        )}

        {step === "pay" && deposit && (
          <div className="space-y-3">
            <div className="rounded-lg bg-slate-800/60 border border-amber-500/30 p-3">
              <p className="text-[11px] uppercase tracking-wider text-amber-200/70 mb-1">Send exactly</p>
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xl font-black text-amber-200">
                  {deposit.pay_amount} <span className="text-sm">{String(deposit.pay_currency || "").toUpperCase()}</span>
                </p>
                <Button size="sm" variant="ghost" onClick={() => copy(String(deposit.pay_amount))}>
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
              {deposit.network && <p className="text-[10px] text-amber-100/60 mt-1">Network: {deposit.network}</p>}
            </div>
            <div className="rounded-lg bg-slate-800/60 border border-amber-500/30 p-3">
              <p className="text-[11px] uppercase tracking-wider text-amber-200/70 mb-1">To this address</p>
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

        {step === "done" && deposit && (
          <div className="text-center py-6 space-y-3">
            <CheckCircle2 className="w-14 h-14 text-emerald-400 mx-auto" />
            <p className="text-lg font-bold text-emerald-300">Payment received!</p>
            <p className="text-sm text-amber-100/80">
              {fmt(deposit.coins_amount)} diamonds added to your balance.
            </p>
            <Button onClick={() => onOpenChange(false)} className="w-full">Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
