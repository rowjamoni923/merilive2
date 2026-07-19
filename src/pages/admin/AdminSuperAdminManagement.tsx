import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, ShieldCheck, FileText, DollarSign, Users, History, Link2, Copy, Gem, Inbox } from "lucide-react";
import AdminCsaDiamondSettings from "@/components/admin/agency/AdminCsaDiamondSettings";
import AdminCsaApprovals from "@/components/admin/agency/AdminCsaApprovals";

type Application = {
  id: string;
  applicant_user_id: string;
  country_code: string;
  full_name: string;
  business_name: string | null;
  official_email: string;
  official_phone: string;
  whatsapp: string | null;
  telegram: string | null;
  signed_contract_url: string | null;
  national_id_url: string | null;
  business_doc_url: string | null;
  deposit_amount_usd: number;
  deposit_proof_url: string | null;
  deposit_tx_ref: string | null;
  requested_commission_percent: number;
  notes: string | null;
  status: string;
  created_at: string;
};

type ActiveAdmin = {
  id: string;
  user_id: string;
  country_code: string;
  allowed_payment_methods: string[];
  auto_pay_enabled: boolean;
  min_withdraw_usd: number;
  max_withdraw_usd: number;
  daily_cap_usd: number;
  commission_percent: number;
  deposit_amount_usd: number;
  contract_url: string | null;
  status: string;
  assigned_at: string;
};

type Settings = {
  id: string;
  min_deposit_usd: number;
  default_commission_percent: number;
  max_commission_percent: number;
  require_signed_contract: boolean;
  require_official_contact: boolean;
  is_program_open: boolean;
};

export default function AdminSuperAdminManagement() {
  const [tab, setTab] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [apps, setApps] = useState<Application[]>([]);
  const [actives, setActives] = useState<ActiveAdmin[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [commissions, setCommissions] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);

  const [reviewApp, setReviewApp] = useState<Application | null>(null);
  const [reviewForm, setReviewForm] = useState({
    allowed_payment_methods: "bkash,nagad",
    auto_pay_enabled: false,
    commission_percent: 25,
    min_withdraw_usd: 5,
    max_withdraw_usd: 1000,
    daily_cap_usd: 5000,
    deposit_amount_usd: 10000,
  });
  const [submitting, setSubmitting] = useState(false);


  const load = async () => {
    setLoading(true);
    const [a, b, c, d, e] = await Promise.all([
      supabase.from("country_super_admin_applications").select("*").order("created_at", { ascending: false }),
      supabase.from("country_payroll_admins").select("*").order("assigned_at", { ascending: false }),
      supabase.from("country_super_admin_settings").select("*").limit(1).maybeSingle(),
      supabase.from("country_payroll_admin_commissions").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("country_payroll_admin_audit").select("*").order("created_at", { ascending: false }).limit(200),
    ]);
    if (a.data) setApps(a.data as any);
    if (b.data) setActives(b.data as any);
    if (c.data) setSettings(c.data as any);
    if (d.data) setCommissions(d.data);
    if (e.data) setAudit(e.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Realtime: instantly refresh when a helper submits / updates an application
  useEffect(() => {
    const channel = supabase
      .channel(`admin-super-admin-apps-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'country_super_admin_applications' },
        () => { load(); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'country_payroll_admins' },
        () => { load(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const updateSettings = async (patch: Partial<Settings>) => {
    if (!settings) return;
    const { error } = await supabase.from("country_super_admin_settings").update(patch).eq("id", settings.id);
    if (error) return toast.error(error.message);
    toast.success("Settings updated");
    setSettings({ ...settings, ...patch });
  };

  const openReview = (app: Application) => {
    setReviewApp(app);
    setReviewForm({
      allowed_payment_methods: "bkash,nagad",
      auto_pay_enabled: false,
      commission_percent: Math.min(25, app.requested_commission_percent || 25),
      min_withdraw_usd: 5,
      max_withdraw_usd: 1000,
      daily_cap_usd: 5000,
      deposit_amount_usd: Math.max(10000, Number(app.deposit_amount_usd) || 10000),
    });
  };

  const copyAccessLink = async (countryCode: string) => {
    const base = window.location.origin;
    const link = `${base}/country-admin/dashboard?country=${countryCode}`;
    try {
      await navigator.clipboard.writeText(link);
      toast.success(`Access link for ${countryCode} copied. Send via official email.`);
    } catch {
      toast.error("Copy failed — please copy manually: " + link);
    }
  };

  const approve = async () => {
    if (!reviewApp) return;
    if (reviewForm.deposit_amount_usd < (settings?.min_deposit_usd || 10000)) {
      return toast.error(`Confirmed deposit must be at least $${settings?.min_deposit_usd || 10000}`);
    }
    setSubmitting(true);
    const methods = reviewForm.allowed_payment_methods
      .split(",").map(s => s.trim()).filter(Boolean);
    const { error } = await supabase.rpc("approve_country_super_admin_application", {
      _application_id: reviewApp.id,
      _allowed_payment_methods: methods as any,
      _auto_pay_enabled: reviewForm.auto_pay_enabled,
      _commission_percent: reviewForm.commission_percent,
      _min_withdraw_usd: reviewForm.min_withdraw_usd,
      _max_withdraw_usd: reviewForm.max_withdraw_usd,
      _daily_cap_usd: reviewForm.daily_cap_usd,
      _deposit_amount_usd: reviewForm.deposit_amount_usd,
    } as any);
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success(`Super Admin approved for ${reviewApp.country_code}. Copy access link from the Active tab.`);
    const country = reviewApp.country_code;
    setReviewApp(null);
    load();
    // Auto-copy the access link so the admin can paste it into the onboarding email straight away.
    setTimeout(() => copyAccessLink(country), 300);
  };


  const reject = async (id: string) => {
    const notes = prompt("Rejection reason?") || "";
    const { error } = await supabase.from("country_super_admin_applications")
      .update({ status: "rejected", reviewer_notes: notes, reviewed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Rejected");
    load();
  };

  const suspend = async (admin: ActiveAdmin) => {
    const reason = prompt("Suspend reason?") || "";
    const { error } = await supabase.from("country_payroll_admins")
      .update({ status: "suspended", suspended_reason: reason })
      .eq("id", admin.id);
    if (error) return toast.error(error.message);
    toast.success("Suspended");
    load();
  };

  const revoke = async (admin: ActiveAdmin) => {
    if (!confirm("Permanently revoke this Super Admin?")) return;
    const { error } = await supabase.from("country_payroll_admins")
      .update({ status: "revoked", revoked_at: new Date().toISOString() })
      .eq("id", admin.id);
    if (error) return toast.error(error.message);
    toast.success("Revoked");
    load();
  };

  const pending = apps.filter(a => a.status === "pending" || a.status === "under_review");

  return (
    <div className="admin-pro-shell p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex items-center gap-3">
        <ShieldCheck className="w-7 h-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Super Admin Management</h1>
          <p className="text-sm text-muted-foreground">
            Per-country Payroll Manager program · min $10,000 deposit · 25% commission per withdrawal
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 w-full h-auto gap-1">
          <TabsTrigger value="pending"><FileText className="w-4 h-4 mr-1" />Pending ({pending.length})</TabsTrigger>
          <TabsTrigger value="active"><Users className="w-4 h-4 mr-1" />Active ({actives.filter(a=>a.status==='active').length})</TabsTrigger>
          <TabsTrigger value="commissions"><DollarSign className="w-4 h-4 mr-1" />Commissions</TabsTrigger>
          <TabsTrigger value="approvals"><Inbox className="w-4 h-4 mr-1" />Approvals</TabsTrigger>
          <TabsTrigger value="diamond"><Gem className="w-4 h-4 mr-1" />Diamond Wallet</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="audit"><History className="w-4 h-4 mr-1" />Audit</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-3 mt-4">
          {loading && <Loader2 className="animate-spin" />}
          {!loading && pending.length === 0 && (
            <Card><CardContent className="py-8 text-center text-muted-foreground">No pending applications</CardContent></Card>
          )}
          {pending.map(app => (
            <Card key={app.id}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div>
                  <CardTitle className="text-base">{app.full_name} · {app.country_code}</CardTitle>
                  <p className="text-xs text-muted-foreground">{app.business_name || "—"} · {new Date(app.created_at).toLocaleString()}</p>
                </div>
                <Badge variant={app.deposit_amount_usd >= (settings?.min_deposit_usd || 10000) ? "default" : "destructive"}>
                  ${app.deposit_amount_usd.toLocaleString()} deposit
                </Badge>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>📧 {app.official_email}</div>
                  <div>📱 {app.official_phone}</div>
                  {app.whatsapp && <div>WhatsApp: {app.whatsapp}</div>}
                  {app.telegram && <div>Telegram: {app.telegram}</div>}
                  <div className="col-span-2">🏠 {(app as any).full_address || "—"}</div>
                  <div>NID ({(app as any).nid_country}): <b>{(app as any).nid_number || "—"}</b></div>
                  <div>Commission requested: <b>{app.requested_commission_percent}%</b></div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  {(app as any).agreement_pdf_url && (
                    <a href={(app as any).agreement_pdf_url} target="_blank" rel="noreferrer"
                       className="px-2 py-1 rounded bg-primary/10 text-primary">📄 Signed Agreement PDF</a>
                  )}
                  {(app as any).nid_front_url && (
                    <a href={(app as any).nid_front_url} target="_blank" rel="noreferrer"
                       className="px-2 py-1 rounded bg-muted">🪪 NID Front</a>
                  )}
                  {(app as any).nid_back_url && (
                    <a href={(app as any).nid_back_url} target="_blank" rel="noreferrer"
                       className="px-2 py-1 rounded bg-muted">🪪 NID Back</a>
                  )}
                  {app.business_doc_url && (
                    <a href={app.business_doc_url} target="_blank" rel="noreferrer"
                       className="px-2 py-1 rounded bg-muted">📁 Business Doc</a>
                  )}
                  {app.deposit_proof_url && (
                    <a href={app.deposit_proof_url} target="_blank" rel="noreferrer"
                       className="px-2 py-1 rounded bg-muted">💵 Deposit Proof</a>
                  )}
                </div>
                {(app as any).signature_data_url && (
                  <div className="border rounded p-2 bg-white inline-block">
                    <div className="text-[10px] text-muted-foreground mb-1">Signature</div>
                    <img src={(app as any).signature_data_url} alt="signature" className="h-16" />
                  </div>
                )}
                {app.notes && <div className="text-xs text-muted-foreground italic">"{app.notes}"</div>}
                <div className="flex gap-2 pt-3">
                  <Button size="sm" onClick={() => openReview(app)}>Review & Approve</Button>
                  <Button size="sm" variant="destructive" onClick={() => reject(app.id)}>Reject</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="active" className="space-y-3 mt-4">
          {actives.filter(a => a.status === 'active').map(a => (
            <Card key={a.id}>
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  <span>🌍 {a.country_code}</span>
                  <Badge>{a.commission_percent}% commission</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <div className="text-xs text-muted-foreground">User ID: {a.user_id}</div>
                <div>Deposit locked: ${a.deposit_amount_usd.toLocaleString()}</div>
                <div>Methods: {Array.isArray(a.allowed_payment_methods) ? a.allowed_payment_methods.join(", ") : "—"}</div>
                <div>Auto-pay: {a.auto_pay_enabled ? "ON" : "OFF (helper-routed)"}</div>
                <div>Limits: ${a.min_withdraw_usd}–${a.max_withdraw_usd} · daily cap ${a.daily_cap_usd}</div>
                <div className="flex flex-wrap gap-2 pt-3">
                  <Button size="sm" variant="default" onClick={() => copyAccessLink(a.country_code)}>
                    <Link2 className="w-3.5 h-3.5 mr-1" /> Copy access link
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => suspend(a)}>Suspend</Button>
                  <Button size="sm" variant="destructive" onClick={() => revoke(a)}>Revoke</Button>
                </div>

              </CardContent>
            </Card>
          ))}
          {actives.filter(a => a.status === 'active').length === 0 && !loading && (
            <Card><CardContent className="py-8 text-center text-muted-foreground">No active super admins yet</CardContent></Card>
          )}
        </TabsContent>

        <TabsContent value="commissions" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Commission ledger (last 200)</CardTitle></CardHeader>
            <CardContent className="text-xs overflow-x-auto">
              <table className="w-full">
                <thead><tr className="text-left"><th>Date</th><th>Country</th><th>Source</th><th>Amount</th><th>%</th><th>Commission</th><th>Status</th></tr></thead>
                <tbody>
                  {commissions.map(c => (
                    <tr key={c.id} className="border-t">
                      <td>{new Date(c.created_at).toLocaleString()}</td>
                      <td>{c.country_code}</td>
                      <td>{c.withdrawal_source}</td>
                      <td>${Number(c.withdrawal_amount_usd).toFixed(2)}</td>
                      <td>{c.commission_percent}%</td>
                      <td className="font-bold text-primary">${Number(c.commission_amount_usd).toFixed(2)}</td>
                      <td>{c.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {commissions.length === 0 && <div className="text-center py-4 text-muted-foreground">No commissions yet</div>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="approvals" className="mt-4">
          <AdminCsaApprovals />
        </TabsContent>

        <TabsContent value="diamond" className="mt-4">
          <AdminCsaDiamondSettings />
        </TabsContent>

        <TabsContent value="settings" className="space-y-4 mt-4">
          {settings ? (
            <Card>
              <CardHeader><CardTitle className="text-base">Global program settings</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Minimum deposit (USD)</Label>
                  <Input type="number" defaultValue={settings.min_deposit_usd}
                    onBlur={(e) => updateSettings({ min_deposit_usd: Number(e.target.value) })} />
                </div>
                <div>
                  <Label>Default commission % (per withdrawal)</Label>
                  <Input type="number" defaultValue={settings.default_commission_percent}
                    onBlur={(e) => updateSettings({ default_commission_percent: Number(e.target.value) })} />
                </div>
                <div>
                  <Label>Max commission % (hard ceiling)</Label>
                  <Input type="number" defaultValue={settings.max_commission_percent}
                    onBlur={(e) => updateSettings({ max_commission_percent: Number(e.target.value) })} />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Require signed contract</Label>
                  <Switch checked={settings.require_signed_contract}
                    onCheckedChange={(v) => updateSettings({ require_signed_contract: v })} />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Require official contact (email + phone)</Label>
                  <Switch checked={settings.require_official_contact}
                    onCheckedChange={(v) => updateSettings({ require_official_contact: v })} />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Program open for new applications</Label>
                  <Switch checked={settings.is_program_open}
                    onCheckedChange={(v) => updateSettings({ is_program_open: v })} />
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Global program settings</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  No program settings row found yet. Check the <b>Diamond Wallet</b> tab for CSA diamond/bonus/visibility configuration.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Diamond Wallet settings always available here too */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Gem className="w-4 h-4 text-amber-400" /> CSA Diamond Wallet</CardTitle>
            </CardHeader>
            <CardContent>
              <AdminCsaDiamondSettings />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Audit log (last 200)</CardTitle></CardHeader>
            <CardContent className="text-xs overflow-x-auto">
              <table className="w-full">
                <thead><tr className="text-left"><th>Date</th><th>Action</th><th>Country</th><th>Actor</th></tr></thead>
                <tbody>
                  {audit.map(r => (
                    <tr key={r.id} className="border-t">
                      <td>{new Date(r.created_at).toLocaleString()}</td>
                      <td>{r.action}</td>
                      <td>{r.country_code || "—"}</td>
                      <td className="text-muted-foreground">{r.actor_id?.slice(0,8) || "system"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!reviewApp} onOpenChange={(o) => !o && setReviewApp(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Super Admin — {reviewApp?.country_code}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="bg-muted p-3 rounded text-xs">
              Contract: {reviewApp?.signed_contract_url || (reviewApp as any)?.agreement_pdf_url ? "✅" : "❌"} ·
              Signature: {(reviewApp as any)?.signature_data_url ? "✅" : "❌"} ·
              Contact: {reviewApp?.official_email && reviewApp?.official_phone ? "✅" : "❌"} ·
              NID: {(reviewApp as any)?.nid_front_url ? "✅" : "❌"}
            </div>
            <div className="rounded border border-amber-500/40 bg-amber-50 p-3 text-xs space-y-1">
              <div className="font-semibold text-amber-700">⚠ Confirm the actual USD deposit you received</div>
              <p className="text-muted-foreground">The applicant does not enter a deposit amount — only you do, after verifying funds.</p>
            </div>
            <div>
              <Label>Confirmed deposit (USD) *</Label>
              <Input type="number" min={settings?.min_deposit_usd || 10000} value={reviewForm.deposit_amount_usd}
                onChange={(e) => setReviewForm({ ...reviewForm, deposit_amount_usd: Number(e.target.value) })} />
              <p className="text-[10px] text-muted-foreground mt-1">
                Minimum ${settings?.min_deposit_usd?.toLocaleString() || "10,000"}. This locks the deposit on record.
              </p>
            </div>

            <div>
              <Label>Allowed payment methods (comma-separated)</Label>
              <Input value={reviewForm.allowed_payment_methods}
                onChange={(e) => setReviewForm({ ...reviewForm, allowed_payment_methods: e.target.value })}
                placeholder="bkash,nagad,rocket" />
            </div>
            <div className="flex items-center justify-between">
              <Label>Auto-pay enabled</Label>
              <Switch checked={reviewForm.auto_pay_enabled}
                onCheckedChange={(v) => setReviewForm({ ...reviewForm, auto_pay_enabled: v })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Commission % (max 25)</Label>
                <Input type="number" max={25} min={0} value={reviewForm.commission_percent}
                  onChange={(e) => setReviewForm({ ...reviewForm, commission_percent: Math.min(25, Number(e.target.value)) })} />
              </div>
              <div>
                <Label>Min withdraw USD</Label>
                <Input type="number" value={reviewForm.min_withdraw_usd}
                  onChange={(e) => setReviewForm({ ...reviewForm, min_withdraw_usd: Number(e.target.value) })} />
              </div>
              <div>
                <Label>Max withdraw USD</Label>
                <Input type="number" value={reviewForm.max_withdraw_usd}
                  onChange={(e) => setReviewForm({ ...reviewForm, max_withdraw_usd: Number(e.target.value) })} />
              </div>
              <div>
                <Label>Daily cap USD</Label>
                <Input type="number" value={reviewForm.daily_cap_usd}
                  onChange={(e) => setReviewForm({ ...reviewForm, daily_cap_usd: Number(e.target.value) })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewApp(null)}>Cancel</Button>
            <Button onClick={approve} disabled={submitting}>
              {submitting ? <Loader2 className="animate-spin w-4 h-4 mr-1" /> : null}
              Approve & Activate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
