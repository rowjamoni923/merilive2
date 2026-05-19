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
  /** "user" = credit user diamonds (package OR custom); "helper" = credit helper trader wallet */
  mode?: "user" | "helper";
  helperId?: string | null;
  helperCustomCoins?: number | null;
  helperCustomPriceUsd?: number | null;
  /** For user-mode custom amount (e.g. helper application fee). Bypasses package picker. */
  userCustomCoins?: number | null;
  userCustomPriceUsd?: number | null;
  userCustomLabel?: string | null;
  /** Called after successful credit so parent can refresh or proceed. */
  onCredited?: (coins: number) => void;
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

const MINIMUM_DEPOSIT_MESSAGE =
  "This crypto network requires a larger deposit amount. Please choose a bigger diamond package and try again.";

const getDepositErrorMessage = (payload: any, fallback?: string | null) => {
  const code = String(payload?.error ?? "").toLowerCase();
  const message = String(payload?.message || payload?.details?.error || payload?.error || fallback || "Gateway error");
  const lower = message.toLowerCase();

  if (code === "minimum_deposit_not_met" || lower.includes("less than minimal") || lower.includes("less than minimum")) {
    return MINIMUM_DEPOSIT_MESSAGE;
  }

  return message;
};

export default function SwiftPayDepositModal({
  open,
  onOpenChange,
  packages,
  initialPackageId,
  mode = "user",
  helperId = null,
  helperCustomCoins = null,
  helperCustomPriceUsd = null,
  userCustomCoins = null,
  userCustomPriceUsd = null,
  userCustomLabel = null,
  onCredited,
}: Props) {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("pick_pkg");
  const [pkg, setPkg] = useState<PkgLite | null>(null);
  const [currency, setCurrency] = useState("usdttrc20");
  const [creating, setCreating] = useState(false);
  const [deposit, setDeposit] = useState<any>(null);

  // Helper mode synthesises a "package" from custom amounts
  const helperPkg: PkgLite | null = mode === "helper" && helperCustomCoins && helperCustomPriceUsd
    ? { id: `helper_${helperId}`, coins: helperCustomCoins, price_usd: helperCustomPriceUsd, name: "Trader Wallet Top-Up" }
    : null;

  // User custom mode (e.g. helper application fee)
  const userCustomPkg: PkgLite | null = mode === "user" && userCustomCoins && userCustomPriceUsd
    ? { id: `custom_${userCustomPriceUsd}`, coins: userCustomCoins, price_usd: userCustomPriceUsd, name: userCustomLabel || "Custom" }
    : null;

  useEffect(() => {
    if (!open) {
      setStep("pick_pkg");
      setPkg(null);
      setCurrency("usdttrc20");
      setDeposit(null);
      setCreating(false);
      return;
    }
    if (mode === "helper" && helperPkg) {
      setPkg(helperPkg);
      setStep("pick_currency");
      return;
    }
    if (mode === "user" && userCustomPkg) {
      setPkg(userCustomPkg);
      setStep("pick_currency");
      return;
    }
    if (initialPackageId) {
      const pre = packages.find((p) => p.id === initialPackageId);
      if (pre) {
        setPkg(pre);
        setStep("pick_currency");
      }
    }
  }, [open, initialPackageId, packages, mode, helperPkg, userCustomPkg]);

  const createDeposit = useCallback(async () => {
    if (!pkg) return;
    setCreating(true);
    try {
      const requestBody: Record<string, unknown> = { pay_currency: currency };
      if (mode === "helper" && helperId && helperCustomCoins && helperCustomPriceUsd) {
        requestBody.target = "helper_wallet";
        requestBody.helper_id = helperId;
        requestBody.custom_coins = helperCustomCoins;
        requestBody.custom_price_usd = helperCustomPriceUsd;
      } else if (mode === "user" && userCustomCoins && userCustomPriceUsd) {
        requestBody.custom_coins = userCustomCoins;
        requestBody.custom_price_usd = userCustomPriceUsd;
      } else {
        requestBody.package_id = pkg.id;
      }

      const { data, error } = await supabase.functions.invoke("swift-pay-create-deposit", {
        body: requestBody,
      });

      let errMsg: string | null = null;
      if (error) {
        try {
          const ctx: any = (error as any).context;
          if (ctx && typeof ctx.json === "function") {
            const parsed = await ctx.json();
            errMsg = getDepositErrorMessage(parsed, null);
          }
        } catch { /* ignore */ }
        errMsg = errMsg || getDepositErrorMessage(null, error.message);
      } else if (data?.error || data?.ok === false || data?.fallback) {
        errMsg = getDepositErrorMessage(data, null);
      }

      if (errMsg) {
        toast({
          title: "Could not start deposit",
          description: errMsg,
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
  }, [pkg, currency, toast, mode, helperId, helperCustomCoins, helperCustomPriceUsd, userCustomCoins, userCustomPriceUsd]);

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
          title: mode === "helper" ? "✅ Trader Wallet topped up!" : "✅ Diamonds credited!",
          description: mode === "helper"
            ? `${fmt(deposit.coins_amount)} diamonds added to your Trader Wallet.`
            : `${fmt(deposit.coins_amount)} diamonds added to your balance.`,
        });
        onCredited?.(deposit.coins_amount);
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
            {mode === "helper"
              ? "Pay with crypto, diamonds credit automatically to your Trader Wallet on blockchain confirmation."
              : "Pay with crypto, diamonds credit automatically on blockchain confirmation."}
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
            {mode !== "helper" && (
              <button onClick={() => setStep("pick_pkg")} className="flex items-center gap-1 text-xs text-amber-200/80 hover:text-amber-200">
                <ChevronLeft className="w-3 h-3" /> Back
              </button>
            )}
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
              {fmt(deposit.coins_amount)} diamonds added to your {mode === "helper" ? "Trader Wallet" : "balance"}.
            </p>
            <Button onClick={() => onOpenChange(false)} className="w-full">Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
