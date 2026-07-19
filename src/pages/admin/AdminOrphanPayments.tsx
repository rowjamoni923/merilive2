import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, RefreshCw, Search, AlertTriangle, ExternalLink, Plus,
  Clock, CheckCircle2, XCircle, Wallet, User,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { toast } from "sonner";
import { format } from "date-fns";

type Row = {
  kind: "claim" | "swift_pay_stuck" | "google_play_stuck";
  id: string;
  created_at: string;
  status: string;
  user_ref: string;                // app_uid or email or phone
  user_id: string | null;
  amount: string;
  method: string;
  reference: string;
  details: Record<string, unknown>;
};

const STATUS_STYLES: Record<string, string> = {
  open: "bg-red-100 text-red-700 border-red-200",
  investigating: "bg-amber-100 text-amber-700 border-amber-200",
  matched: "bg-emerald-100 text-emerald-700 border-emerald-200",
  refunded: "bg-blue-100 text-blue-700 border-blue-200",
  rejected: "bg-slate-200 text-slate-700 border-slate-300",
  closed: "bg-slate-100 text-slate-500 border-slate-200",
  pending: "bg-amber-100 text-amber-700 border-amber-200",
  expired: "bg-slate-200 text-slate-600 border-slate-300",
  received: "bg-amber-100 text-amber-700 border-amber-200",
  validating_with_google: "bg-blue-100 text-blue-700 border-blue-200",
  failed: "bg-red-100 text-red-700 border-red-200",
};

const AdminOrphanPayments = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"all" | "claim" | "swift_pay_stuck" | "google_play_stuck">("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    reported_app_uid: "",
    reported_phone: "",
    claimed_amount: "",
    claimed_currency: "USD",
    claimed_payment_method: "",
    claimed_reference: "",
    notes: "",
  });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [claimsRes, swiftRes, googleRes] = await Promise.all([
        supabase
          .from("user_payment_claims" as any)
          .select("*")
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("swift_pay_topups")
          .select("*")
          .in("status", ["pending", "expired"])
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("google_play_purchase_attempts" as any)
          .select("*")
          .not("status", "in", "(completed,already_processed)")
          .order("created_at", { ascending: false })
          .limit(500),
      ]);

      const claimRows: Row[] = ((claimsRes.data as any[]) || []).map((c) => ({
        kind: "claim",
        id: c.id,
        created_at: c.created_at,
        status: c.status,
        user_ref: c.reported_app_uid || c.reported_phone || c.reported_email || "—",
        user_id: c.reported_user_id,
        amount: c.claimed_amount ? `${c.claimed_amount} ${c.claimed_currency || ""}` : "—",
        method: c.claimed_payment_method || "—",
        reference: c.claimed_reference || "—",
        details: c,
      }));

      const swiftRows: Row[] = ((swiftRes.data as any[]) || []).map((r) => {
        const snap = r.last_poll_snapshot || null;
        const shortfall = snap?.shortfall_usd;
        const gatewayHint = snap
          ? (shortfall > 0
              ? ` · gateway received $${Number(snap.total_deposited || 0).toFixed(2)} / $${Number(snap.needed_total_usd || 0).toFixed(2)} (short $${Number(shortfall).toFixed(2)})`
              : ` · gateway confirmed — pending credit`)
          : " · never confirmed on-chain";
        return {
          kind: "swift_pay_stuck",
          id: r.id,
          created_at: r.created_at,
          status: r.status,
          user_ref: r.user_id?.slice(0, 8) || "—",
          user_id: r.user_id,
          amount: `${r.pay_amount || 0} ${r.pay_currency || ""} ($${r.price_usd || 0})`,
          method: `Swift Pay ${r.pay_network || ""}${gatewayHint}`,
          reference: r.payment_id || r.idempotency_key || "—",
          details: r,
        };
      });


      const googleRows: Row[] = ((googleRes.data as any[]) || []).map((r) => ({
        kind: "google_play_stuck",
        id: r.id,
        created_at: r.created_at,
        status: r.status,
        user_ref: r.user_id?.slice(0, 8) || "—",
        user_id: r.user_id,
        amount: `${r.diamonds_amount || 0} diamonds${r.amount_usd ? ` ($${r.amount_usd})` : ""}`,
        method: "Google Play",
        reference: r.google_order_id || r.requested_order_id || `token…${r.purchase_token_suffix || ""}`,
        details: r,
      }));

      const merged = [...claimRows, ...swiftRows, ...googleRows]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setRows(merged);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load orphan payments");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useAdminRealtime(["user_payment_claims", "swift_pay_topups", "google_play_purchase_attempts"], fetchAll);

  const filtered = useMemo(() => {
    let r = rows;
    if (tab !== "all") r = r.filter((x) => x.kind === tab);
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter((x) =>
        x.user_ref.toLowerCase().includes(q) ||
        x.reference.toLowerCase().includes(q) ||
        x.method.toLowerCase().includes(q) ||
        x.amount.toLowerCase().includes(q),
      );
    }
    return r;
  }, [rows, tab, search]);

  const counts = useMemo(() => ({
    claim: rows.filter((r) => r.kind === "claim" && r.status === "open").length,
    swift: rows.filter((r) => r.kind === "swift_pay_stuck").length,
    google: rows.filter((r) => r.kind === "google_play_stuck").length,
  }), [rows]);

  const submitClaim = async () => {
    if (!form.reported_app_uid && !form.reported_phone) {
      toast.error("Enter at least app UID or phone");
      return;
    }
    let user_id: string | null = null;
    if (form.reported_app_uid) {
      const { data } = await supabase
        .from("profiles_public")
        .select("id")
        .eq("app_uid", form.reported_app_uid.trim())
        .maybeSingle();
      user_id = (data as any)?.id || null;
    }
    const { error } = await supabase
      .from("user_payment_claims" as any)
      .insert({
        reported_app_uid: form.reported_app_uid.trim() || null,
        reported_phone: form.reported_phone.trim() || null,
        reported_user_id: user_id,
        claimed_amount: form.claimed_amount ? Number(form.claimed_amount) : null,
        claimed_currency: form.claimed_currency || null,
        claimed_payment_method: form.claimed_payment_method || null,
        claimed_reference: form.claimed_reference || null,
        notes: form.notes || null,
        channel: "admin_note",
      });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Claim logged");
    setCreateOpen(false);
    setForm({
      reported_app_uid: "", reported_phone: "", claimed_amount: "",
      claimed_currency: "USD", claimed_payment_method: "", claimed_reference: "", notes: "",
    });
    fetchAll();
  };

  const updateClaimStatus = async (id: string, status: string) => {
    const { error } = await supabase
      .from("user_payment_claims" as any)
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success(`Marked ${status}`); fetchAll(); }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-slate-900">Orphan Payments</h1>
            <p className="text-sm text-slate-500">
              User payment claims, stuck Swift Pay deposits, and unfinished Google Play attempts.
            </p>
          </div>
          <Button variant="outline" onClick={fetchAll}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> Log user claim
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card><CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-8 h-8 text-red-500" />
              <div><div className="text-2xl font-bold">{counts.claim}</div>
              <div className="text-xs text-slate-500">Open user claims</div></div>
            </div>
          </CardContent></Card>
          <Card><CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Clock className="w-8 h-8 text-amber-500" />
              <div><div className="text-2xl font-bold">{counts.swift}</div>
              <div className="text-xs text-slate-500">Swift Pay pending / expired</div></div>
            </div>
          </CardContent></Card>
          <Card><CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Wallet className="w-8 h-8 text-blue-500" />
              <div><div className="text-2xl font-bold">{counts.google}</div>
              <div className="text-xs text-slate-500">Google Play unfinished</div></div>
            </div>
          </CardContent></Card>
        </div>

        <Card>
          <CardHeader className="flex-row items-center gap-3 space-y-0">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <Input
                placeholder="Search user UID, reference, method..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                <SelectItem value="claim">User claims</SelectItem>
                <SelectItem value="swift_pay_stuck">Swift Pay stuck</SelectItem>
                <SelectItem value="google_play_stuck">Google Play stuck</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            {loading && rows.length === 0 ? (
              <div className="text-center py-12 text-slate-400">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                <div className="text-slate-600 font-medium">No orphan payments.</div>
                <div className="text-xs text-slate-400 mt-1">Nothing needs attention right now.</div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-slate-500 border-b">
                    <tr>
                      <th className="py-2 pr-2">Kind</th>
                      <th className="py-2 pr-2">When</th>
                      <th className="py-2 pr-2">User</th>
                      <th className="py-2 pr-2">Amount</th>
                      <th className="py-2 pr-2">Method</th>
                      <th className="py-2 pr-2">Reference</th>
                      <th className="py-2 pr-2">Status</th>
                      <th className="py-2 pr-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => (
                      <tr key={`${r.kind}:${r.id}`} className="border-b hover:bg-slate-50">
                        <td className="py-2 pr-2">
                          <Badge variant="outline" className="text-xs">
                            {r.kind === "claim" ? "User claim"
                              : r.kind === "swift_pay_stuck" ? "Swift Pay"
                                : "Google Play"}
                          </Badge>
                        </td>
                        <td className="py-2 pr-2 text-slate-600">
                          {format(new Date(r.created_at), "MMM d, HH:mm")}
                        </td>
                        <td className="py-2 pr-2">
                          <div className="flex items-center gap-1">
                            <User className="w-3.5 h-3.5 text-slate-400" />
                            <span className="font-mono text-xs">{r.user_ref}</span>
                          </div>
                        </td>
                        <td className="py-2 pr-2 font-medium">{r.amount}</td>
                        <td className="py-2 pr-2 text-slate-600">{r.method}</td>
                        <td className="py-2 pr-2 font-mono text-xs text-slate-500 max-w-[220px] truncate" title={r.reference}>
                          {r.reference}
                        </td>
                        <td className="py-2 pr-2">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs border ${STATUS_STYLES[r.status] || "bg-slate-100 text-slate-600 border-slate-200"}`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="py-2 pr-2 text-right">
                          {r.kind === "claim" && r.status === "open" ? (
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="outline" onClick={() => updateClaimStatus(r.id, "investigating")}>
                                Investigate
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => updateClaimStatus(r.id, "matched")}>
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => updateClaimStatus(r.id, "rejected")}>
                                <XCircle className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          ) : r.user_id ? (
                            <Button size="sm" variant="ghost"
                              onClick={() => navigate(`/admin/wallet-ledger?user=${r.user_id}`)}>
                              <ExternalLink className="w-3.5 h-3.5 mr-1" /> Ledger
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Log user payment claim</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-1">
              <label className="text-xs text-slate-500">App UID</label>
              <Input value={form.reported_app_uid}
                onChange={(e) => setForm({ ...form, reported_app_uid: e.target.value })}
                placeholder="0733697258" />
            </div>
            <div className="col-span-1">
              <label className="text-xs text-slate-500">Phone</label>
              <Input value={form.reported_phone}
                onChange={(e) => setForm({ ...form, reported_phone: e.target.value })} />
            </div>
            <div className="col-span-1">
              <label className="text-xs text-slate-500">Amount</label>
              <Input type="number" value={form.claimed_amount}
                onChange={(e) => setForm({ ...form, claimed_amount: e.target.value })} />
            </div>
            <div className="col-span-1">
              <label className="text-xs text-slate-500">Currency</label>
              <Input value={form.claimed_currency}
                onChange={(e) => setForm({ ...form, claimed_currency: e.target.value })} />
            </div>
            <div className="col-span-1">
              <label className="text-xs text-slate-500">Payment method</label>
              <Input value={form.claimed_payment_method}
                onChange={(e) => setForm({ ...form, claimed_payment_method: e.target.value })}
                placeholder="Google Play / bKash / ..." />
            </div>
            <div className="col-span-1">
              <label className="text-xs text-slate-500">Reference / txn id</label>
              <Input value={form.claimed_reference}
                onChange={(e) => setForm({ ...form, claimed_reference: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-slate-500">Notes</label>
              <Textarea rows={3} value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={submitClaim}>Save claim</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminOrphanPayments;
