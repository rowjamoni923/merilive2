import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Crown, LogOut, Plus, Star, StarOff, Trash2, Edit, ArrowDownToLine, ArrowUpFromLine, Wallet, Package, Sparkles, Building2, Users, Mic2, HeartHandshake, Film, Radio } from "lucide-react";
import { toast } from "sonner";
import CsaDiamondWallet from "@/components/csa/CsaDiamondWallet";

interface CsaContext {
  country_code: string;
  agency_id: string;
  agency_name?: string;
  email: string;
  commission_percent: number;
}
interface Kpis {
  country_code: string;
  month_deposit_usd: number;
  month_withdraw_usd: number;
  pending_topups: number;
  pending_withdrawals: number;
  active_topup_methods: number;
  active_withdrawal_methods: number;
}
interface CountryOverview {
  country_code: string;
  agencies_total: number;
  agencies_active: number;
  hosts_total: number;
  users_total: number;
  helpers_total: number;
  helpers_l1: number;
  helpers_l2: number;
  helpers_l3: number;
  helpers_l4: number;
  helpers_l5: number;
  reels_total: number;
  lives_live_now: number;
}

const countryName = (code: string) => ({
  BD: "Bangladesh", IN: "India", PK: "Pakistan", ID: "Indonesia",
  MY: "Malaysia", PH: "Philippines", NP: "Nepal", LK: "Sri Lanka",
  EG: "Egypt", SA: "Saudi Arabia", AE: "UAE", TR: "Turkey",
  US: "United States", GB: "United Kingdom",
} as Record<string, string>)[code] || code;

const flag = (code: string) => {
  if (!code || code.length !== 2) return "🌐";
  return String.fromCodePoint(...[...code.toUpperCase()].map(c => 0x1f1a5 + c.charCodeAt(0)));
};

export default function CountryAdminDashboard() {
  const navigate = useNavigate();
  const [ctx, setCtx] = useState<CsaContext | null>(null);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [overview, setOverview] = useState<CountryOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [topupMethods, setTopupMethods] = useState<any[]>([]);
  const [wdMethods, setWdMethods] = useState<any[]>([]);
  const [editTarget, setEditTarget] = useState<{ kind: "topup" | "wd"; row: any | null } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: c, error: ce } = await supabase.rpc("csa_get_my_context");
      if (ce) throw ce;
      if (!c) {
        toast.error("You are not a Country Super Admin");
        navigate("/csa-login", { replace: true });
        return;
      }
      const context = c as unknown as CsaContext;
      setCtx(context);

      const [{ data: k }, { data: ov }, { data: tu }, { data: wd }] = await Promise.all([
        supabase.rpc("csa_country_kpis"),
        supabase.rpc("csa_country_overview" as any),
        supabase.from("topup_payment_methods").select("*").contains("country_codes", [context.country_code]).order("display_order"),
        supabase.from("helper_country_payment_methods").select("*").eq("country_code", context.country_code).order("display_order"),
      ]);
      setKpis(k as unknown as Kpis);
      setOverview(ov as unknown as CountryOverview);
      setTopupMethods(tu || []);
      setWdMethods(wd || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => { load(); }, [load]);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate("/csa-login", { replace: true });
  };

  const toggleTopup = async (row: any, field: "is_active" | "is_recommended") => {
    try {
      const { error } = await supabase.rpc("csa_upsert_topup_method", {
        _id: row.id,
        _name: row.name,
        _method_type: row.method_type,
        _payment_number: row.payment_number,
        _account_name: row.account_name,
        _payment_instructions: row.payment_instructions,
        _icon_url: row.icon_url,
        _logo_url: row.logo_url,
        _is_active: field === "is_active" ? !row.is_active : row.is_active,
        _is_recommended: field === "is_recommended" ? !row.is_recommended : row.is_recommended,
        _display_order: row.display_order || 0,
      });
      if (error) throw error;
      toast.success("Submitted for owner approval", { description: "Change applies after owner approves." });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  };

  const deleteTopup = async (id: string) => {
    if (!confirm("Submit delete for owner approval?")) return;
    const { error } = await supabase.rpc("csa_delete_topup_method", { _id: id });
    if (error) toast.error(error.message);
    else toast.success("Delete submitted for owner approval");
  };

  const deleteWd = async (id: string) => {
    if (!confirm("Submit delete for owner approval?")) return;
    const { error } = await supabase.rpc("csa_delete_withdrawal_method", { _id: id });
    if (error) toast.error(error.message);
    else toast.success("Delete submitted for owner approval");
  };

  if (loading || !ctx) {
    return (
      <div className="admin-pro-shell min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="admin-pro-shell min-h-screen bg-white text-slate-900">
      {/* Hero */}
      <div className="relative overflow-hidden border-b border-slate-200">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.08),transparent_60%)]" />
        <div className="relative max-w-6xl mx-auto px-4 py-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-yellow-600 flex items-center justify-center shadow-lg ring-2 ring-amber-300/40">
              <Crown className="w-7 h-7 text-black" />
            </div>
            <div>
              <p className="text-xs text-amber-300/70 uppercase tracking-widest font-semibold">Country Super Admin</p>
              <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
                <span className="text-3xl">{flag(ctx.country_code)}</span>
                <span className="bg-gradient-to-r from-amber-200 to-yellow-400 bg-clip-text text-transparent">
                  {countryName(ctx.country_code)}
                </span>
              </h1>
              <p className="text-xs text-white/50 mt-0.5">{ctx.agency_name} · {ctx.email}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={signOut}
            className="bg-slate-900/60 border-amber-500/30 text-amber-200 hover:bg-amber-500/10">
            <LogOut className="w-4 h-4 mr-1" /> Sign out
          </Button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* KPI cards */}
        {kpis && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard icon={<ArrowDownToLine className="w-5 h-5" />} label="Deposits (MTD)" value={`$${kpis.month_deposit_usd.toFixed(2)}`} accent="from-emerald-500 to-teal-600" />
            <KpiCard icon={<ArrowUpFromLine className="w-5 h-5" />} label="Withdrawals (MTD)" value={`$${kpis.month_withdraw_usd.toFixed(2)}`} accent="from-rose-500 to-red-600" />
            <KpiCard icon={<Wallet className="w-5 h-5" />} label="Pending Top-ups" value={kpis.pending_topups} accent="from-amber-500 to-yellow-600" />
            <KpiCard icon={<Package className="w-5 h-5" />} label="Pending Withdrawals" value={kpis.pending_withdrawals} accent="from-violet-500 to-purple-600" />
          </div>
        )}

        {/* Country overview */}
        {overview && (
          <div>
            <p className="text-xs uppercase tracking-widest text-amber-300/70 font-semibold mb-2">My Country at a glance</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard icon={<Building2 className="w-5 h-5" />} label="Agencies" value={`${overview.agencies_active} / ${overview.agencies_total}`} accent="from-cyan-500 to-blue-600" />
              <KpiCard icon={<Mic2 className="w-5 h-5" />} label="Hosts" value={overview.hosts_total} accent="from-pink-500 to-rose-600" />
              <KpiCard icon={<Users className="w-5 h-5" />} label="Total Users" value={overview.users_total} accent="from-indigo-500 to-violet-600" />
              <KpiCard icon={<HeartHandshake className="w-5 h-5" />} label="Helpers" value={overview.helpers_total} accent="from-amber-500 to-yellow-600" />
              <KpiCard icon={<Radio className="w-5 h-5" />} label="Live Now" value={overview.lives_live_now} accent="from-red-500 to-orange-600" />
              <KpiCard icon={<Film className="w-5 h-5" />} label="Reels" value={overview.reels_total} accent="from-fuchsia-500 to-purple-600" />
            </div>
            <Card className="bg-slate-900/60 border-amber-500/20 p-4 mt-3">
              <p className="text-xs text-white/50 mb-2">Helpers by Level</p>
              <div className="grid grid-cols-5 gap-2">
                {[
                  { n: 1, v: overview.helpers_l1 },
                  { n: 2, v: overview.helpers_l2 },
                  { n: 3, v: overview.helpers_l3 },
                  { n: 4, v: overview.helpers_l4 },
                  { n: 5, v: overview.helpers_l5 },
                ].map(({ n, v }) => (
                  <div key={n} className="rounded-lg bg-gradient-to-br from-slate-800 to-slate-900 border border-amber-500/15 p-3 text-center">
                    <p className="text-[10px] text-amber-300/70 uppercase tracking-wider">Level {n}</p>
                    <p className="text-2xl font-bold mt-0.5 bg-gradient-to-r from-amber-200 to-yellow-400 bg-clip-text text-transparent">{v}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        <Tabs defaultValue="topup">
          <TabsList className="bg-slate-900/60 border border-amber-500/20 p-1 flex-wrap h-auto">
            <TabsTrigger value="topup" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-yellow-600 data-[state=active]:text-black">
              Top-up Methods ({topupMethods.length})
            </TabsTrigger>
            <TabsTrigger value="wd" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-rose-500 data-[state=active]:to-red-600 data-[state=active]:text-white">
              Withdrawal Methods ({wdMethods.length})
            </TabsTrigger>
            <TabsTrigger value="myqueue" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-violet-500 data-[state=active]:to-purple-600 data-[state=active]:text-white">
              My Submissions
            </TabsTrigger>
            <TabsTrigger value="wallet" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-500 data-[state=active]:to-teal-600 data-[state=active]:text-white">
              💎 Diamond Wallet
            </TabsTrigger>
          </TabsList>

          <TabsContent value="wallet" className="mt-4">
            <CsaDiamondWallet />
          </TabsContent>

          <TabsContent value="myqueue" className="mt-4">
            <MyApprovalQueue />
          </TabsContent>

          <TabsContent value="topup" className="mt-4 space-y-3">
            <div className="flex justify-end">
              <Button onClick={() => setEditTarget({ kind: "topup", row: null })}
                className="bg-gradient-to-r from-amber-500 to-yellow-600 text-black hover:from-amber-400">
                <Plus className="w-4 h-4 mr-1" /> Add Top-up Method
              </Button>
            </div>
            {topupMethods.length === 0 ? (
              <Card className="bg-slate-900/60 border-amber-500/20 p-8 text-center text-white/50">
                No top-up methods for {ctx.country_code} yet.
              </Card>
            ) : topupMethods.map((m) => (
              <Card key={m.id} className="bg-slate-900/60 border-amber-500/20 p-4 flex items-center gap-3">
                {m.is_recommended && <Sparkles className="w-5 h-5 text-amber-400" />}
                {m.logo_url && <img src={m.logo_url} alt="" className="w-10 h-10 rounded-lg object-cover" />}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold flex items-center gap-2">
                    {m.name}
                    {m.is_recommended && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">RECOMMENDED</span>}
                  </p>
                  <p className="text-xs text-white/50 truncate">{m.method_type} · {m.payment_number}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => toggleTopup(m, "is_recommended")}
                  className={m.is_recommended ? "text-amber-300" : "text-white/40"}>
                  {m.is_recommended ? <Star className="w-4 h-4 fill-current" /> : <StarOff className="w-4 h-4" />}
                </Button>
                <Switch checked={m.is_active} onCheckedChange={() => toggleTopup(m, "is_active")} />
                <Button variant="ghost" size="icon" onClick={() => setEditTarget({ kind: "topup", row: m })}>
                  <Edit className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => deleteTopup(m.id)} className="text-rose-400 hover:text-rose-300">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="wd" className="mt-4 space-y-3">
            <div className="flex justify-end">
              <Button onClick={() => setEditTarget({ kind: "wd", row: null })}
                className="bg-gradient-to-r from-rose-500 to-red-600 text-white hover:from-rose-400">
                <Plus className="w-4 h-4 mr-1" /> Add Withdrawal Method
              </Button>
            </div>
            {wdMethods.length === 0 ? (
              <Card className="bg-slate-900/60 border-rose-500/20 p-8 text-center text-white/50">
                No withdrawal methods for {ctx.country_code} yet.
              </Card>
            ) : wdMethods.map((m) => (
              <Card key={m.id} className="bg-slate-900/60 border-rose-500/20 p-4 flex items-center gap-3">
                {m.logo_url && <img src={m.logo_url} alt="" className="w-10 h-10 rounded-lg object-cover" />}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold">{m.method_name || m.payment_method_name}</p>
                  <p className="text-xs text-white/50 truncate">{m.method_type} · {m.account_number}</p>
                </div>
                <Switch checked={m.is_active} disabled />
                <Button variant="ghost" size="icon" onClick={() => setEditTarget({ kind: "wd", row: m })}>
                  <Edit className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => deleteWd(m.id)} className="text-rose-400 hover:text-rose-300">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </div>

      {editTarget && (
        <MethodEditDialog
          target={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); load(); }}
        />
      )}
    </div>
  );
}

function KpiCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: React.ReactNode; accent: string }) {
  return (
    <Card className="bg-slate-900/60 border-amber-500/20 p-4 relative overflow-hidden">
      <div className={`absolute -top-6 -right-6 w-20 h-20 rounded-full bg-gradient-to-br ${accent} opacity-20 blur-xl`} />
      <div className="relative">
        <div className="text-amber-300 mb-1">{icon}</div>
        <p className="text-xs text-white/50">{label}</p>
        <p className="text-xl font-bold mt-0.5">{value}</p>
      </div>
    </Card>
  );
}

function MethodEditDialog({ target, onClose, onSaved }: { target: { kind: "topup" | "wd"; row: any | null }; onClose: () => void; onSaved: () => void }) {
  const isTopup = target.kind === "topup";
  const r = target.row || {};
  const [form, setForm] = useState({
    name: r.name || r.method_name || r.payment_method_name || "",
    method_type: r.method_type || "",
    payment_number: r.payment_number || r.account_number || "",
    account_name: r.account_name || "",
    bank_name: r.bank_name || "",
    instructions: r.payment_instructions || r.instructions || "",
    logo_url: r.logo_url || r.icon_url || "",
    is_active: r.is_active ?? true,
    is_recommended: r.is_recommended ?? false,
    display_order: r.display_order ?? 0,
  });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      if (isTopup) {
        const { error } = await supabase.rpc("csa_upsert_topup_method", {
          _id: r.id || null,
          _name: form.name,
          _method_type: form.method_type,
          _payment_number: form.payment_number,
          _account_name: form.account_name,
          _payment_instructions: form.instructions,
          _icon_url: form.logo_url,
          _logo_url: form.logo_url,
          _is_active: form.is_active,
          _is_recommended: form.is_recommended,
          _display_order: Number(form.display_order) || 0,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc("csa_upsert_withdrawal_method", {
          _method_name: form.name,
          _account_number: form.payment_number,
          _bank_name: form.bank_name,
          _instructions: form.instructions,
        });
        if (error) throw error;
      }
      toast.success("Submitted for owner approval", { description: "Change applies after owner approves." });
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-amber-500/30 text-white max-w-md">
        <DialogHeader>
          <DialogTitle>{r.id ? "Edit" : "Add"} {isTopup ? "Top-up" : "Withdrawal"} Method</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto">
          <Field label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
          <Field label="Type (e.g. bkash, nagad, bank)" value={form.method_type} onChange={(v) => setForm({ ...form, method_type: v })} />
          <Field label={isTopup ? "Payment Number" : "Account Number"} value={form.payment_number} onChange={(v) => setForm({ ...form, payment_number: v })} />
          <Field label="Account Name" value={form.account_name} onChange={(v) => setForm({ ...form, account_name: v })} />
          {!isTopup && <Field label="Bank Name" value={form.bank_name} onChange={(v) => setForm({ ...form, bank_name: v })} />}
          <Field label="Logo URL" value={form.logo_url} onChange={(v) => setForm({ ...form, logo_url: v })} />
          <div>
            <Label className="text-white/80 text-xs">Instructions</Label>
            <textarea
              value={form.instructions}
              onChange={(e) => setForm({ ...form, instructions: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm"
              rows={3}
            />
          </div>
          <Field label="Display Order" type="number" value={String(form.display_order)} onChange={(v) => setForm({ ...form, display_order: Number(v) || 0 })} />
          <div className="flex items-center justify-between">
            <Label className="text-white/80 text-xs">Active</Label>
            <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
          </div>
          {isTopup && (
            <div className="flex items-center justify-between">
              <Label className="text-white/80 text-xs">Recommended (⭐ shown first)</Label>
              <Switch checked={form.is_recommended} onCheckedChange={(v) => setForm({ ...form, is_recommended: v })} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy} className="bg-amber-500 text-black hover:bg-amber-400">
            {busy && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <Label className="text-white/80 text-xs">{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="bg-slate-800 border-slate-700" />
    </div>
  );
}

function MyApprovalQueue() {
  const [rows, setRows] = useState<any[]>([]);
  const [tab, setTab] = useState<"pending" | "approved" | "rejected">("pending");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("csa_pending_actions")
      .select("*")
      .eq("status", tab)
      .order("requested_at", { ascending: false })
      .limit(100);
    setRows(data || []);
    setLoading(false);
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-3">
      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="bg-slate-800 border border-slate-700">
          <TabsTrigger value="pending" className="data-[state=active]:bg-amber-500 data-[state=active]:text-black">Pending</TabsTrigger>
          <TabsTrigger value="approved" className="data-[state=active]:bg-emerald-600">Approved</TabsTrigger>
          <TabsTrigger value="rejected" className="data-[state=active]:bg-rose-600">Rejected</TabsTrigger>
        </TabsList>
      </Tabs>
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-amber-400" /></div>
      ) : rows.length === 0 ? (
        <Card className="bg-slate-900/60 border-amber-500/20 p-6 text-center text-white/50">
          No {tab} submissions.
        </Card>
      ) : rows.map((r) => (
        <Card key={r.id} className="bg-slate-900/60 border-amber-500/20 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">{r.description || r.action_type}</p>
              <p className="text-[10px] text-white/40 mt-0.5">
                {new Date(r.requested_at).toLocaleString()}
                {r.reviewed_at && ` · Reviewed ${new Date(r.reviewed_at).toLocaleString()}`}
              </p>
              {r.reject_reason && (
                <p className="text-xs text-rose-300 mt-1">Owner rejected: {r.reject_reason}</p>
              )}
            </div>
            <span className={`text-[10px] px-2 py-0.5 rounded border ${
              r.status === "pending" ? "bg-amber-500/20 text-amber-300 border-amber-500/40" :
              r.status === "approved" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" :
              "bg-rose-500/20 text-rose-300 border-rose-500/40"
            }`}>{r.status}</span>
          </div>
        </Card>
      ))}
    </div>
  );
}
