import { useEffect, useState } from "react";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Loader2, Gem, Save, ArrowDownToLine, ArrowUpFromLine, Coins, Shield } from "lucide-react";
import { toast } from "sonner";

interface Settings {
  min_purchase_usd: number;
  diamonds_per_usd: number;
  visibility_threshold_diamonds: number;
  owner_fallback_enabled: boolean;
  auto_credit_on_payment: boolean;
  withdrawal_bonus_rate_percent: number;
  withdrawal_bonus_enabled: boolean;
  bonus_trigger_status: string;
  notes: string | null;
}

export default function AdminCsaDiamondSettings() {
  const [s, setS] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [recentPurchases, setRecentPurchases] = useState<any[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("admin_get_csa_diamond_settings" as any);
      if (error) throw error;
      setS(data as any);
      const { data: pur } = await supabase
        .from("csa_diamond_purchases" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(15);
      setRecentPurchases(((pur as any[]) || []));
    } catch (e: any) {
      toast.error(e?.message || "Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!s) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("admin_upsert_csa_diamond_settings" as any, {
        _min_purchase_usd: Number(s.min_purchase_usd),
        _diamonds_per_usd: Number(s.diamonds_per_usd),
        _visibility_threshold_diamonds: Number(s.visibility_threshold_diamonds),
        _owner_fallback_enabled: s.owner_fallback_enabled,
        _auto_credit_on_payment: s.auto_credit_on_payment,
        _notes: s.notes || null,
        _withdrawal_bonus_rate_percent: Number(s.withdrawal_bonus_rate_percent),
        _withdrawal_bonus_enabled: s.withdrawal_bonus_enabled,
        _bonus_trigger_status: s.bonus_trigger_status,
      });
      if (error) throw error;
      toast.success("Settings saved — applies to all countries instantly");
      load();
    } catch (e: any) {
      toast.error(e?.message || "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const runBackfill = async () => {
    if (!confirm("Backfill bonuses for ALL approved withdrawals (already-credited ones are skipped). Continue?")) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("admin_backfill_csa_bonuses" as any, { _country: null });
      if (error) throw error;
      const r = data as any;
      toast.success(`Scanned ${r?.scanned || 0} withdrawals · Credited ${r?.credited || 0} new bonuses`);
      load();
    } catch (e: any) {
      toast.error(e?.message || "Backfill failed");
    } finally {
      setBusy(false);
    }
  };

  const creditPurchase = async (id: string) => {
    if (!confirm("Manually credit this purchase? (Use only if webhook didn't fire)")) return;
    try {
      const { error } = await supabase.rpc("admin_credit_csa_diamonds" as any, {
        _purchase_id: id, _gateway_ref: null, _gateway_payload: null,
      });
      if (error) throw error;
      toast.success("Credited");
      load();
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    }
  };

  if (loading || !s) {
    return <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin text-amber-400" /></div>;
  }

  const previewDiamonds = Math.floor(Number(s.min_purchase_usd) * Number(s.diamonds_per_usd));

  return (
    <div className="space-y-4">
      <Card className="bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/30 border-amber-500/20 p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-yellow-600 flex items-center justify-center">
            <Gem className="w-5 h-5 text-black" />
          </div>
          <div>
            <h3 className="text-lg font-bold bg-gradient-to-r from-amber-200 to-yellow-400 bg-clip-text text-transparent">
              CSA Diamond Wallet Settings
            </h3>
            <p className="text-xs text-white/50">Single source of truth — every CSA's purchase, helper debit & visibility rule reads from here</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-white/70 text-xs flex items-center gap-1">
              <ArrowDownToLine className="w-3 h-3" /> Minimum Purchase (USD)
            </Label>
            <Input type="number" min="0" step="100" value={s.min_purchase_usd}
              onChange={(e) => setS({ ...s, min_purchase_usd: Number(e.target.value) })}
              className="bg-slate-800 border-slate-700 mt-1" />
            <p className="text-[10px] text-white/40 mt-1">CSAs cannot buy less than this in one order.</p>
          </div>
          <div>
            <Label className="text-white/70 text-xs flex items-center gap-1">
              <Coins className="w-3 h-3" /> Diamonds per 1 USD
            </Label>
            <Input type="number" min="0" step="1" value={s.diamonds_per_usd}
              onChange={(e) => setS({ ...s, diamonds_per_usd: Number(e.target.value) })}
              className="bg-slate-800 border-slate-700 mt-1" />
            <p className="text-[10px] text-amber-300/70 mt-1">
              Preview: ${Number(s.min_purchase_usd).toLocaleString()} → {previewDiamonds.toLocaleString()} 💎
            </p>
            <p className="text-[10px] text-emerald-300/70 mt-0.5">
              Rate: <b>${(100000 / Math.max(1, Number(s.diamonds_per_usd))).toFixed(2)}</b> per 1 Lakh 💎
              {" · "}<b>${(Number(s.visibility_threshold_diamonds) / Math.max(1, Number(s.diamonds_per_usd))).toFixed(2)}</b> to reach visibility threshold
            </p>
          </div>
          <div className="md:col-span-2">
            <Label className="text-white/70 text-xs flex items-center gap-1">
              <Shield className="w-3 h-3" /> Visibility Threshold (Diamonds)
            </Label>
            <Input type="number" min="0" step="100000" value={s.visibility_threshold_diamonds}
              onChange={(e) => setS({ ...s, visibility_threshold_diamonds: Number(e.target.value) })}
              className="bg-slate-800 border-slate-700 mt-1" />
            <p className="text-[10px] text-white/40 mt-1">
              If CSA balance ≥ {Number(s.visibility_threshold_diamonds).toLocaleString()} 💎 → users in that country see CSA's helper payment methods.
              Below threshold → fall back to your official methods.
            </p>
          </div>
          <div className="flex items-center justify-between bg-slate-800/60 rounded-lg p-3">
            <div>
              <p className="text-sm font-medium">Owner Fallback Enabled</p>
              <p className="text-[10px] text-white/50">When CSA balance hits zero, owner pool covers helper top-ups so service never breaks.</p>
            </div>
            <Switch checked={s.owner_fallback_enabled}
              onCheckedChange={(v) => setS({ ...s, owner_fallback_enabled: v })} />
          </div>
          <div className="flex items-center justify-between bg-slate-800/60 rounded-lg p-3">
            <div>
              <p className="text-sm font-medium">Auto-credit on Payment</p>
              <p className="text-[10px] text-white/50">Crypto webhook automatically credits diamonds. Off = manual approval only.</p>
            </div>
            <Switch checked={s.auto_credit_on_payment}
              onCheckedChange={(v) => setS({ ...s, auto_credit_on_payment: v })} />
          </div>
        </div>

        {/* Withdrawal Bonus Configuration */}
        <div className="mt-5 rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/40 to-slate-900/60 p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-bold text-emerald-300 flex items-center gap-2">
                <Coins className="w-4 h-4" /> Withdrawal Bonus (auto-reward to CSA)
              </p>
              <p className="text-[11px] text-white/50 mt-0.5">
                When agency withdrawal completes in CSA's country, bonus diamonds are auto-credited.
              </p>
            </div>
            <Switch checked={s.withdrawal_bonus_enabled}
              onCheckedChange={(v) => setS({ ...s, withdrawal_bonus_enabled: v })} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-white/70 text-xs">Bonus Rate (%)</Label>
              <Input type="number" min="0" max="100" step="0.5" value={s.withdrawal_bonus_rate_percent}
                onChange={(e) => setS({ ...s, withdrawal_bonus_rate_percent: Number(e.target.value) })}
                className="bg-slate-800 border-slate-700 mt-1" />
              <p className="text-[10px] text-emerald-300/70 mt-1">
                Preview: $1,000 withdrawal → {Math.floor(1000 * (Number(s.withdrawal_bonus_rate_percent) / 100) * Number(s.diamonds_per_usd)).toLocaleString()} 💎 bonus
              </p>
            </div>
            <div>
              <Label className="text-white/70 text-xs">Trigger on Status</Label>
              <Input value={s.bonus_trigger_status}
                onChange={(e) => setS({ ...s, bonus_trigger_status: e.target.value })}
                className="bg-slate-800 border-slate-700 mt-1" placeholder="approved" />
              <p className="text-[10px] text-white/40 mt-1">Withdrawal status that triggers bonus (default: approved)</p>
            </div>
          </div>
          <Button onClick={runBackfill} disabled={busy} variant="outline" size="sm"
            className="mt-3 w-full bg-emerald-500/10 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/20">
            Backfill missed bonuses (idempotent — safe to run anytime)
          </Button>
        </div>

        <Button onClick={save} disabled={busy}
          className="mt-5 w-full bg-gradient-to-r from-amber-500 to-yellow-600 text-black font-semibold hover:from-amber-400">
          {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Save Settings (applies instantly)
        </Button>
      </Card>

      <Card className="bg-slate-900/60 border-amber-500/20 p-4">
        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <ArrowUpFromLine className="w-4 h-4 text-amber-300" /> Recent CSA Diamond Purchases
        </h4>
        {recentPurchases.length === 0 ? (
          <p className="text-xs text-white/40 text-center py-6">No purchases yet</p>
        ) : (
          <div className="space-y-2">
            {recentPurchases.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between bg-slate-800/50 rounded-lg p-3 gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">
                    {p.country_code} · ${Number(p.amount_usd).toLocaleString()} → {Number(p.diamonds_to_credit).toLocaleString()} 💎
                  </p>
                  <p className="text-[10px] text-white/40">
                    {new Date(p.created_at).toLocaleString()} · {p.gateway || "—"}
                  </p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  p.status === "credited" ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40" :
                  p.status === "paid" ? "bg-blue-500/20 text-blue-300 border border-blue-500/40" :
                  p.status === "failed" ? "bg-rose-500/20 text-rose-300 border border-rose-500/40" :
                  "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                }`}>
                  {p.status}
                </span>
                {p.status !== "credited" && (
                  <Button size="sm" variant="outline" onClick={() => creditPurchase(p.id)}
                    className="bg-amber-500/10 border-amber-500/40 text-amber-300 hover:bg-amber-500/20 h-7 px-2 text-[11px]">
                    Credit
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
