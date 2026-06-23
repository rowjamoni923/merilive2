import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  DollarSign,
  Users,
  Clock,
  Loader2,
} from "lucide-react";

type Assignment = {
  id: string;
  country_code: string;
  commission_percent: number;
  min_withdraw_usd: number;
  max_withdraw_usd: number;
  daily_cap_usd: number;
  deposit_amount_usd: number;
  status: string;
};

type HelperRow = {
  id: string;
  helper_id: string;
  usd_amount: number | null;
  beans_amount: number | null;
  status: string;
  country_admin_status: string;
  country_admin_notes: string | null;
  country_admin_reviewed_at: string | null;
  created_at: string;
  payment_screenshot_url: string | null;
  helper: { user_id: string; country_code: string | null } | null;
};

export default function CountryAdminDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [rows, setRows] = useState<HelperRow[]>([]);
  const [tab, setTab] = useState<"pending" | "reviewed" | "all">("pending");
  const [target, setTarget] = useState<HelperRow | null>(null);
  const [decision, setDecision] = useState<"approved" | "rejected" | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        navigate("/auth");
        return;
      }
      const { data: assigns } = await supabase
        .from("country_payroll_admins")
        .select("id,country_code,commission_percent,min_withdraw_usd,max_withdraw_usd,daily_cap_usd,deposit_amount_usd,status")
        .eq("user_id", auth.user.id)
        .eq("status", "active");

      if (!assigns || assigns.length === 0) {
        toast.error("You are not an active Country Super Admin");
        navigate("/");
        return;
      }
      setAssignments(assigns as Assignment[]);
      await loadRows(assigns.map((a) => a.country_code));
      setLoading(false);
    })();
  }, []);

  const loadRows = async (countries: string[]) => {
    const { data } = await supabase
      .from("helper_withdrawal_requests")
      .select(`
        id, helper_id, usd_amount, beans_amount, status,
        country_admin_status, country_admin_notes, country_admin_reviewed_at,
        created_at, payment_screenshot_url,
        helper:topup_helpers!helper_withdrawal_requests_helper_id_fkey(user_id, country_code)
      `)
      .in("status", ["pending", "screenshot_submitted", "approved", "rejected", "paid"])
      .order("created_at", { ascending: false })
      .limit(200);
    const filtered = (data || []).filter((r: any) =>
      countries.includes(r.helper?.country_code)
    );
    const normalized = filtered.map((r: any) => ({
      ...r,
      helper: Array.isArray(r.helper) ? r.helper[0] ?? null : r.helper,
    }));
    setRows(normalized as HelperRow[]);
  };

  const refresh = async () => {
    await loadRows(assignments.map((a) => a.country_code));
  };

  const filtered = useMemo(() => {
    if (tab === "pending")
      return rows.filter(
        (r) =>
          r.country_admin_status === "pending" &&
          ["pending", "screenshot_submitted"].includes(r.status)
      );
    if (tab === "reviewed")
      return rows.filter((r) => r.country_admin_status !== "pending");
    return rows;
  }, [rows, tab]);

  const stats = useMemo(() => {
    const totalPending = rows.filter(
      (r) =>
        r.country_admin_status === "pending" &&
        ["pending", "screenshot_submitted"].includes(r.status)
    ).length;
    const reviewedToday = rows.filter(
      (r) =>
        r.country_admin_reviewed_at &&
        new Date(r.country_admin_reviewed_at).toDateString() ===
          new Date().toDateString()
    ).length;
    const usdReviewed = rows
      .filter((r) => r.country_admin_status === "approved")
      .reduce((s, r) => s + (Number(r.usd_amount) || 0), 0);
    return { totalPending, reviewedToday, usdReviewed };
  }, [rows]);

  const submit = async () => {
    if (!target || !decision) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc(
        "country_admin_review_helper_withdrawal",
        { _request_id: target.id, _decision: decision, _notes: notes || null }
      );
      if (error) throw error;
      toast.success(
        decision === "approved"
          ? "Pre-approved. Sent to Owner Admin for final approval."
          : "Marked as rejected. Owner Admin will be notified."
      );
      setTarget(null);
      setDecision(null);
      setNotes("");
      await refresh();
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <ShieldCheck className="w-5 h-5 text-amber-500" />
          <div className="flex-1">
            <h1 className="text-base font-semibold">Country Super Admin</h1>
            <p className="text-xs text-muted-foreground">
              {assignments.map((a) => a.country_code).join(", ")} ·
              {" "}Pre-approval queue
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 space-y-4">
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="pt-4 text-sm text-amber-900 dark:text-amber-200">
            ⚠️ Your decisions here are <strong>pre-approvals only</strong>. The
            Owner Admin Panel must give the final approval before any funds are
            released. Nothing pays out from this screen.
          </CardContent>
        </Card>

        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="w-3.5 h-3.5" /> Awaiting review
              </div>
              <div className="text-2xl font-bold mt-1">{stats.totalPending}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Users className="w-3.5 h-3.5" /> Reviewed today
              </div>
              <div className="text-2xl font-bold mt-1">{stats.reviewedToday}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <DollarSign className="w-3.5 h-3.5" /> USD pre-approved
              </div>
              <div className="text-2xl font-bold mt-1">
                ${stats.usdReviewed.toFixed(2)}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Withdrawal requests</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
              <TabsList>
                <TabsTrigger value="pending">Pending</TabsTrigger>
                <TabsTrigger value="reviewed">Reviewed</TabsTrigger>
                <TabsTrigger value="all">All</TabsTrigger>
              </TabsList>
              <TabsContent value={tab} className="space-y-2 mt-3">
                {filtered.length === 0 && (
                  <div className="text-center text-sm text-muted-foreground py-8">
                    Nothing here.
                  </div>
                )}
                {filtered.map((r) => (
                  <div
                    key={r.id}
                    className="border rounded-lg p-3 flex flex-col gap-2"
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div>
                        <div className="text-sm font-medium">
                          ${Number(r.usd_amount || 0).toFixed(2)}{" "}
                          <span className="text-xs text-muted-foreground">
                            ({r.beans_amount || 0} beans)
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(r.created_at).toLocaleString()} ·{" "}
                          {r.helper?.country_code || "—"}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Badge variant="outline" className="text-xs">
                          Status: {r.status}
                        </Badge>
                        <Badge
                          className={
                            r.country_admin_status === "approved"
                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                              : r.country_admin_status === "rejected"
                              ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
                              : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                          }
                        >
                          Country: {r.country_admin_status}
                        </Badge>
                      </div>
                    </div>
                    {r.country_admin_notes && (
                      <p className="text-xs text-muted-foreground italic">
                        Note: {r.country_admin_notes}
                      </p>
                    )}
                    {r.payment_screenshot_url && (
                      <a
                        href={r.payment_screenshot_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-primary underline w-fit"
                      >
                        View payment proof
                      </a>
                    )}
                    {r.country_admin_status === "pending" &&
                      ["pending", "screenshot_submitted"].includes(r.status) && (
                        <div className="flex gap-2 pt-1">
                          <Button
                            size="sm"
                            className="flex-1"
                            onClick={() => {
                              setTarget(r);
                              setDecision("approved");
                              setNotes("");
                            }}
                          >
                            <CheckCircle2 className="w-4 h-4 mr-1" />
                            Pre-approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="flex-1"
                            onClick={() => {
                              setTarget(r);
                              setDecision("rejected");
                              setNotes("");
                            }}
                          >
                            <XCircle className="w-4 h-4 mr-1" />
                            Reject
                          </Button>
                        </div>
                      )}
                  </div>
                ))}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </main>

      <Dialog
        open={!!target && !!decision}
        onOpenChange={(o) => {
          if (!o) {
            setTarget(null);
            setDecision(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decision === "approved" ? "Pre-approve" : "Reject"} withdrawal
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="p-3 rounded-md bg-muted">
              ${Number(target?.usd_amount || 0).toFixed(2)} ·{" "}
              {target?.helper?.country_code}
            </div>
            <Textarea
              placeholder="Notes for the Owner Admin (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              This is a <strong>pre-approval</strong>. The Owner Admin Panel
              must finalize before any payout happens.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setTarget(null);
                setDecision(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={submitting}
              variant={decision === "rejected" ? "destructive" : "default"}
            >
              {submitting && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
