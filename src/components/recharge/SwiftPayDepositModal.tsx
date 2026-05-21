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
  /** "helper_application" (default, server enforces $100 crypto floor) | "campaign" (no floor — mirrors My Diamond package flow) */
  userCustomPurpose?: "helper_application" | "campaign";
  /** Called after successful credit so parent can refresh or proceed. */
  onCredited?: (coins: number, topupId?: string) => void;

}

// Recommendation logic (per owner directive):
//  - Small payments (< $10): ERC20 is recommended (accepts small amounts)
//  - Large payments (≥ $10): TRC20 is recommended (lowest fee for bigger amounts)
const LARGE_PAYMENT_THRESHOLD_USD = 10;

const BASE_CRYPTO_OPTIONS = [
  { value: "usdttrc20", label: "USDT (TRC20)" },
  { value: "usdtbep20", label: "USDT (BEP20 / BSC)" },
  { value: "usdterc20", label: "USDT (ERC20)" },
  { value: "btc", label: "Bitcoin (BTC)" },
  { value: "eth", label: "Ethereum (ETH)" },
  { value: "bnb", label: "BNB" },
];

const getRecommendedCurrency = (priceUsd: number | null | undefined) => {
  if (!priceUsd || priceUsd < LARGE_PAYMENT_THRESHOLD_USD) return "usdterc20";
  return "usdttrc20";
};

const getCryptoOptions = (priceUsd: number | null | undefined) => {
  const recommended = getRecommendedCurrency(priceUsd);
  return BASE_CRYPTO_OPTIONS.map((o) => {
    if (o.value !== recommended) return o;
    const suffix =
      recommended === "usdterc20"
        ? " — recommended for small payments"
        : " — recommended, lowest fee";
    return { ...o, label: `${o.label}${suffix}` };
  });
};

type Step = "pick_pkg" | "pick_currency" | "pay" | "done";

const MINIMUM_DEPOSIT_MESSAGE =
  "This crypto network requires a larger deposit amount. Please choose a bigger diamond package and try again.";

// Detect upstream gateway "currency not enabled / not supported" errors so we can
// automatically fall back to another enabled crypto network instead of failing.
const isCurrencyDisabledError = (payload: any, fallback?: string | null) => {
  const code = String(payload?.error ?? "").toLowerCase();
  const message = String(payload?.message || payload?.details?.error || payload?.error || fallback || "").toLowerCase();
  if (code.includes("currency") || code.includes("disabled") || code.includes("unsupported")) return true;
  return (
    message.includes("currency not enabled")
    || message.includes("currency is not enabled")
    || message.includes("not enabled")
    || message.includes("not supported")
    || message.includes("unsupported currency")
    || message.includes("disabled")
  );
};

const getDepositErrorMessage = (payload: any, fallback?: string | null) => {
  const code = String(payload?.error ?? "").toLowerCase();
  const message = String(payload?.message || payload?.details?.error || payload?.error || fallback || "Gateway error");
  const lower = message.toLowerCase();

  if (code === "minimum_deposit_not_met" || lower.includes("less than minimal") || lower.includes("less than minimum")) {
    return MINIMUM_DEPOSIT_MESSAGE;
  }

  return message;
};

// Compute total diamonds including bonus_percentage (always applied — bonus is
// part of the published amount the user expects to receive).
const getBonusInclusiveCoins = (p: { coins: number; bonus_percentage?: number }) => {
  const bonusPct = Number(p.bonus_percentage ?? 0);
  const bonus = bonusPct > 0 ? Math.floor((p.coins * bonusPct) / 100) : 0;
  return { total: p.coins + bonus, bonus, bonusPct };
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
  userCustomPurpose = "helper_application",
  onCredited,

}: Props) {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("pick_pkg");
  const [pkg, setPkg] = useState<PkgLite | null>(null);
  const [currency, setCurrency] = useState("usdterc20");
  const [creating, setCreating] = useState(false);
  const [deposit, setDeposit] = useState<any>(null);




  useEffect(() => {
    if (!open) {
      setStep("pick_pkg");
      setPkg(null);
      setCurrency("usdterc20");
      setDeposit(null);
      setCreating(false);
      return;
    }
    if (mode === "helper" && helperCustomCoins && helperCustomPriceUsd) {
      setPkg({ id: `helper_${helperId}`, coins: helperCustomCoins, price_usd: helperCustomPriceUsd, name: "Trader Wallet Top-Up" });
      setStep((prev) => (prev === "pick_pkg" ? "pick_currency" : prev));
      return;
    }
    if (mode === "user" && userCustomCoins && userCustomPriceUsd) {
      setPkg({ id: `custom_${userCustomPriceUsd}`, coins: userCustomCoins, price_usd: userCustomPriceUsd, name: userCustomLabel || "Custom" });
      setStep((prev) => (prev === "pick_pkg" ? "pick_currency" : prev));
      return;
    }
    if (initialPackageId) {
      const pre = packages.find((p) => p.id === initialPackageId);
      if (pre) {
        setPkg(pre);
        setStep((prev) => (prev === "pick_pkg" ? "pick_currency" : prev));
      }
    }
  }, [open, initialPackageId, mode, helperId, helperCustomCoins, helperCustomPriceUsd, userCustomCoins, userCustomPriceUsd, userCustomLabel]);

  // Auto-select recommended crypto whenever the selected package changes
  useEffect(() => {
    if (pkg) setCurrency(getRecommendedCurrency(pkg.price_usd));
  }, [pkg?.id]);

  const createDeposit = useCallback(async () => {
    if (!pkg) return;
    setCreating(true);
    try {
      // Build an ordered list of currencies to try: user pick first, then the
      // remaining BASE_CRYPTO_OPTIONS as automatic fallbacks. If the gateway
      // returns "currency not enabled / unsupported", we silently move on to
      // the next one so the user never sees that raw error.
      const tryOrder = [currency, ...BASE_CRYPTO_OPTIONS.map((o) => o.value).filter((v) => v !== currency)];

      let lastErrMsg: string | null = null;
      let lastErrIsMinimum = false;

      for (let i = 0; i < tryOrder.length; i++) {
        const tryCurrency = tryOrder[i];
        const requestBody: Record<string, unknown> = { pay_currency: tryCurrency };
        if (mode === "helper" && helperId && helperCustomCoins && helperCustomPriceUsd) {
          requestBody.target = "helper_wallet";
          requestBody.helper_id = helperId;
          requestBody.custom_coins = helperCustomCoins;
          requestBody.custom_price_usd = helperCustomPriceUsd;
        } else if (mode === "user" && userCustomCoins && userCustomPriceUsd) {
          requestBody.custom_coins = userCustomCoins;
          requestBody.custom_price_usd = userCustomPriceUsd;
          requestBody.purpose = userCustomPurpose;

        } else {
          requestBody.package_id = pkg.id;
        }

        const { data, error } = await supabase.functions.invoke("swift-pay-create-deposit", {
          body: requestBody,
        });

        // Try to parse a structured error payload from the FunctionsHttpError context.
        let parsedErrPayload: any = null;
        if (error) {
          try {
            const ctx: any = (error as any).context;
            if (ctx && typeof ctx.json === "function") parsedErrPayload = await ctx.json();
          } catch { /* ignore */ }
        }

        const errPayload = parsedErrPayload || (data?.error || data?.ok === false || data?.fallback ? data : null);

        if (!error && !errPayload) {
          // SUCCESS — persist chosen currency so the UI reflects what actually worked.
          if (tryCurrency !== currency) setCurrency(tryCurrency);
          setDeposit(data);
          setStep("pay");
          setCreating(false);
          return;
        }

        // Decide whether to auto-fallback to next currency.
        if (errPayload && isCurrencyDisabledError(errPayload, error?.message)) {
          // silently try next currency
          continue;
        }

        // Minimum-deposit failures are not currency-specific — bail out immediately.
        if (errPayload?.error === "minimum_deposit_not_met") {
          lastErrMsg = MINIMUM_DEPOSIT_MESSAGE;
          lastErrIsMinimum = true;
          break;
        }

        lastErrMsg = getDepositErrorMessage(errPayload, error?.message);
        // Non-currency, non-minimum gateway error → stop trying.
        break;
      }

      toast({
        title: lastErrIsMinimum ? "Amount too small" : "Could not start deposit",
        description: lastErrMsg || "All available crypto networks are unavailable right now. Please try again shortly.",
        variant: "destructive",
      });
      setCreating(false);
    } catch (e: any) {
      toast({ title: "Error", description: e?.message ?? "unknown", variant: "destructive" });
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
        onCredited?.(deposit.coins_amount, deposit.topup_id);
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
              {packages.map((p) => {
                const { total, bonus, bonusPct } = getBonusInclusiveCoins(p);
                return (
                  <button
                    key={p.id}
                    onClick={() => { setPkg(p); setStep("pick_currency"); }}
                    className="relative rounded-lg border border-amber-500/30 bg-slate-800/60 hover:border-amber-400 hover:bg-slate-800 p-3 text-left transition"
                  >
                    {bonus > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 px-1.5 py-0.5 text-[9px] font-black text-slate-950 shadow">
                        +{bonusPct}%
                      </span>
                    )}
                    <p className="text-lg font-black text-amber-200">{fmt(total)}</p>
                    <p className="text-[10px] text-amber-100/60 uppercase">diamonds</p>
                    {bonus > 0 && (
                      <p className="text-[10px] font-semibold text-emerald-300 mt-0.5">
                        {fmt(p.coins)} + {fmt(bonus)} bonus
                      </p>
                    )}
                    <p className="text-sm font-bold text-amber-100 mt-1">${p.price_usd.toFixed(2)}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === "pick_currency" && pkg && (
          <div className="space-y-4">
            {mode !== "helper" && !(mode === "user" && userCustomCoins && userCustomPriceUsd) && (
              <button onClick={() => setStep("pick_pkg")} className="flex items-center gap-1 text-xs text-amber-200/80 hover:text-amber-200">
                <ChevronLeft className="w-3 h-3" /> Back
              </button>
            )}
            <div className="rounded-lg bg-slate-800/60 border border-amber-500/30 p-3">
              {(() => {
                const { total, bonus, bonusPct } = getBonusInclusiveCoins(pkg);
                return (
                  <>
                    <p className="text-2xl font-black text-amber-200">{fmt(total)} <span className="text-xs">diamonds</span></p>
                    {bonus > 0 && (
                      <p className="text-[11px] font-semibold text-emerald-300 mt-0.5">
                        {fmt(pkg.coins)} + {fmt(bonus)} bonus <span className="opacity-70">(+{bonusPct}%)</span>
                      </p>
                    )}
                    <p className="text-sm text-amber-100/80 mt-0.5">${pkg.price_usd.toFixed(2)} USD</p>
                  </>
                );
              })()}
            </div>
            <div>
              <label className="text-sm font-medium text-amber-100/90 mb-1.5 block">Choose crypto</label>
              <Select value={currency} onValueChange={setCurrency} disabled={creating}>
                <SelectTrigger className="bg-slate-800/60 border-amber-500/30 text-amber-50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {getCryptoOptions(pkg.price_usd).map((o) => (
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
