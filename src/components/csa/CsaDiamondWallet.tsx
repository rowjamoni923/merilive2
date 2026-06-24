import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Gem, Loader2, ArrowDownToLine, ArrowUpFromLine, TrendingUp, AlertCircle, Sparkles, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface Summary {
  balance: number;
  total_purchased: number;
  total_spent: number;
  country_code: string;
  visibility_now: "csa" | "official";
  settings: {
    min_purchase_usd: number;
    diamonds_per_usd: number;
    visibility_threshold_diamonds: number;
    owner_fallback_enabled: boolean;
    auto_credit_on_payment: boolean;
  };
}

export default function CsaDiamondWallet() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [ledger, setLedger] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [buyOpen, setBuyOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: s }, { data: p }, { data: l }] = await Promise.all([
        supabase.rpc("csa_my_diamond_summary" as any),
        supabase.from("csa_diamond_purchases" as any).select("*").order("created_at", { ascending: false }).limit(20),
        supabase.from("csa_diamond_ledger" as any).select("*").order("created_at", { ascending: false }).limit(30),
      ]);
      setSummary(s as any);
      setPurchases((p as any[]) || []);
      setLedger((l as any[]) || []);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load wallet");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading || !summary) {
    return <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin text-emerald-400" /></div>;
  }

  const s = summary;
  const balancePct = Math.min(100, (s.balance / Math.max(1, s.settings.visibility_threshold_diamonds)) * 100);
  const isVisible = s.visibility_now === "csa";

  return (
    <div className="space-y-4">
      {/* Balance hero */}
      <Card className="bg-gradient-to-br from-emerald-900/60 via-slate-900 to-teal-900/40 border-emerald-500/30 p-5 relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-2">
            <Gem className="w-5 h-5 text-emerald-300" />
            <p className="text-xs text-emerald-200/70 uppercase tracking-widest">Diamond Balance</p>
          </div>
          <p className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-emerald-200 to-teal-300 bg-clip-text text-transparent">
            {s.balance.toLocaleString()} 💎
          </p>
          <p className="text-xs text-white/50 mt-1">
            Country: {s.country_code} · Rate: ${(1 / s.settings.diamonds_per_usd).toFixed(4)} per 💎
          </p>

          {/* Visibility status */}
          <div className={`mt-4 rounded-lg p-3 border ${isVisible ? "bg-emerald-500/10 border-emerald-500/40" : "bg-amber-500/10 border-amber-500/40"}`}>
            <div className="flex items-center gap-2">
              {isVisible ? <Sparkles className="w-4 h-4 text-emerald-300" /> : <AlertCircle className="w-4 h-4 text-amber-300" />}
              <p className="text-sm font-semibold">
                {isVisible
                  ? "Your payment methods are LIVE for users in this country"
                  : "Owner's official methods are showing to users"}
              </p>
            </div>
            <p className="text-[11px] text-white/60 mt-1">
              Threshold: {s.settings.visibility_threshold_diamonds.toLocaleString()} 💎.
              {isVisible
                ? " Your methods stay live as long as balance stays above threshold."
                : ` Buy ${(s.settings.visibility_threshold_diamonds - s.balance).toLocaleString()} more 💎 to switch.`}
            </p>
            <div className="h-1.5 bg-black/30 rounded-full overflow-hidden mt-2">
              <div className={`h-full ${isVisible ? "bg-gradient-to-r from-emerald-400 to-teal-500" : "bg-gradient-to-r from-amber-400 to-yellow-500"}`}
                style={{ width: `${balancePct}%` }} />
            </div>
          </div>

          <Button onClick={() => setBuyOpen(true)}
            className="mt-4 w-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:from-emerald-400 font-semibold">
            <ArrowDownToLine className="w-4 h-4 mr-2" /> Buy Diamonds (Crypto auto-credit)
          </Button>
        </div>
      </Card>

      {/* Totals */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="bg-slate-900/60 border-emerald-500/20 p-3">
          <p className="text-[10px] text-emerald-300/70 uppercase">Total Purchased</p>
          <p className="text-lg font-bold text-emerald-200">{s.total_purchased.toLocaleString()}</p>
        </Card>
        <Card className="bg-slate-900/60 border-rose-500/20 p-3">
          <p className="text-[10px] text-rose-300/70 uppercase">Total Spent (Helpers)</p>
          <p className="text-lg font-bold text-rose-200">{s.total_spent.toLocaleString()}</p>
        </Card>
      </div>

      {/* Purchases */}
      <Card className="bg-slate-900/60 border-amber-500/20 p-4">
        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <ArrowDownToLine className="w-4 h-4 text-amber-300" /> My Purchases
        </h4>
        {purchases.length === 0 ? (
          <p className="text-xs text-white/40 text-center py-4">No purchases yet — minimum ${s.settings.min_purchase_usd}</p>
        ) : (
          <div className="space-y-2">
            {purchases.map((p) => (
              <div key={p.id} className="flex items-center justify-between bg-slate-800/50 rounded-lg p-2 text-xs">
                <div>
                  <p className="font-medium">${Number(p.amount_usd).toLocaleString()} → {Number(p.diamonds_to_credit).toLocaleString()} 💎</p>
                  <p className="text-[10px] text-white/40">{new Date(p.created_at).toLocaleString()}</p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded ${
                  p.status === "credited" ? "bg-emerald-500/20 text-emerald-300" :
                  p.status === "failed" ? "bg-rose-500/20 text-rose-300" :
                  "bg-amber-500/20 text-amber-300"
                }`}>{p.status}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Ledger */}
      <Card className="bg-slate-900/60 border-violet-500/20 p-4">
        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-violet-300" /> Recent Activity
        </h4>
        {ledger.length === 0 ? (
          <p className="text-xs text-white/40 text-center py-4">No activity yet</p>
        ) : (
          <div className="space-y-1.5">
            {ledger.map((l) => (
              <div key={l.id} className="flex items-center justify-between bg-slate-800/40 rounded p-2 text-xs">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{l.reason.replace(/_/g, " ")}</p>
                  <p className="text-[10px] text-white/40">{new Date(l.created_at).toLocaleString()}{l.notes ? ` · ${l.notes}` : ""}</p>
                </div>
                <span className={`font-mono font-semibold ${l.change_amount >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                  {l.change_amount >= 0 ? "+" : ""}{Number(l.change_amount).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {buyOpen && (
        <BuyDialog summary={s} onClose={() => setBuyOpen(false)} onCreated={() => { setBuyOpen(false); load(); }} />
      )}
    </div>
  );
}

function BuyDialog({ summary, onClose, onCreated }: { summary: Summary; onClose: () => void; onCreated: () => void }) {
  const [amount, setAmount] = useState(String(summary.settings.min_purchase_usd));
  const [busy, setBusy] = useState(false);
  const [order, setOrder] = useState<any>(null);
  const diamonds = Math.floor(Number(amount || 0) * summary.settings.diamonds_per_usd);

  const submit = async () => {
    if (Number(amount) < summary.settings.min_purchase_usd) {
      toast.error(`Minimum is $${summary.settings.min_purchase_usd}`);
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("csa_create_diamond_purchase" as any, {
        _amount_usd: Number(amount),
        _gateway: "crypto",
      });
      if (error) throw error;
      setOrder(data);
      toast.success("Order created — pay via crypto to auto-credit diamonds");
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-gradient-to-br from-slate-900 to-emerald-950/40 border-emerald-500/30 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-emerald-300">
            <Gem className="w-5 h-5" /> Buy Diamonds
          </DialogTitle>
        </DialogHeader>

        {order ? (
          <div className="space-y-3 py-2">
            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-4 text-center">
              <p className="text-xs text-emerald-300/70 uppercase">Order created</p>
              <p className="text-2xl font-bold mt-1">${Number(order.amount_usd).toLocaleString()}</p>
              <p className="text-emerald-200 mt-1">→ {Number(order.diamonds_to_credit).toLocaleString()} 💎</p>
            </div>
            <div className="rounded-lg bg-slate-800/60 border border-white/10 p-3 text-xs space-y-1">
              <p className="text-white/70 font-semibold">Next step:</p>
              <p className="text-white/60">
                Pay the equivalent amount via your owner-configured crypto gateway. Once the webhook confirms payment,
                diamonds will be auto-credited to your balance and you'll get a notification.
              </p>
              <p className="text-[10px] text-amber-300/70 mt-2">Order ID: {order.purchase_id}</p>
            </div>
            <Button onClick={onCreated} className="w-full bg-emerald-600 hover:bg-emerald-500">Done</Button>
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-white/70 text-xs">Amount (USD) · min ${summary.settings.min_purchase_usd}</Label>
              <Input type="number" min={summary.settings.min_purchase_usd} step="100" value={amount}
                onChange={(e) => setAmount(e.target.value)} className="bg-slate-800 border-slate-700 mt-1" />
              <p className="text-xs text-emerald-300/80 mt-2">
                You will receive: <span className="font-bold">{diamonds.toLocaleString()} 💎</span>
              </p>
            </div>
            <p className="text-[11px] text-white/40 leading-relaxed">
              Payment goes through our crypto gateway. Diamonds auto-credit on confirmation.
              When balance ≥ {summary.settings.visibility_threshold_diamonds.toLocaleString()} 💎, your country's
              payment methods become live for end users.
            </p>
            <DialogFooter>
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button onClick={submit} disabled={busy}
                className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white">
                {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowUpFromLine className="w-4 h-4 mr-2" />}
                Create Order
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
