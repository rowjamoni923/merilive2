import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Shield, Search, AlertTriangle, CheckCircle2, Skull, Users, Clock } from "lucide-react";
import { format } from "date-fns";
import useAdminRealtime from "@/hooks/useAdminRealtime";

interface BanCase {
  id: string;
  target_user_id: string;
  initiated_by: string;
  status: "pending_review" | "approved" | "executed" | "rejected" | string;
  reason: string;
  evidence: any;
  include_gift_links: boolean;
  lookback_days: number;
  linked_target_count: number;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  executed_by: string | null;
  executed_at: string | null;
  execution_summary: any;
  created_at: string;
  target?: { display_name: string; avatar_url: string | null; app_uid: string | null };
  initiator?: { display_name: string; app_uid: string | null };
}

const StatusBadge = ({ status }: { status: string }) => {
  const map: Record<string, string> = {
    pending_review: "bg-amber-500/20 text-amber-300 border-amber-500/40",
    approved: "bg-blue-500/20 text-blue-300 border-blue-500/40",
    executed: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
    rejected: "bg-rose-500/20 text-rose-300 border-rose-500/40",
  };
  return <Badge variant="outline" className={map[status] || ""}>{status.replace("_", " ")}</Badge>;
};

export default function AdminPermanentBan() {
  const [isOwner, setIsOwner] = useState(false);
  const [cases, setCases] = useState<BanCase[]>([]);
  const [loading, setLoading] = useState(true);

  // Step 1 form
  const [searchUid, setSearchUid] = useState("");
  const [searchedUser, setSearchedUser] = useState<any>(null);
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState("");
  const [includeGiftLinks, setIncludeGiftLinks] = useState(true);
  const [lookbackDays, setLookbackDays] = useState(90);
  const [previewTargets, setPreviewTargets] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Detail dialog
  const [selectedCase, setSelectedCase] = useState<BanCase | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [caseTargets, setCaseTargets] = useState<any[]>([]);

  useAdminRealtime(["admin_permanent_ban_cases", "admin_permanent_ban_case_targets"], () => fetchCases());

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("is_owner" as any);
      setIsOwner(!!data);
    })();
    fetchCases();
  }, []);

  const fetchCases = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("admin_permanent_ban_cases")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      console.error(error);
      toast.error("Failed to load cases");
      setLoading(false);
      return;
    }
    const rows = (data as BanCase[]) || [];
    const ids = Array.from(new Set([
      ...rows.map(r => r.target_user_id),
      ...rows.map(r => r.initiated_by),
    ]));
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, app_uid")
        .in("id", ids);
      const map = new Map((profs || []).map((p: any) => [p.id, p]));
      rows.forEach(r => {
        r.target = map.get(r.target_user_id) as any;
        r.initiator = map.get(r.initiated_by) as any;
      });
    }
    setCases(rows);
    setLoading(false);
  };

  const handleSearchUser = async () => {
    if (!searchUid.trim()) return;
    setSearchedUser(null);
    setPreviewTargets([]);
    const q = searchUid.trim();
    const { data, error } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url, app_uid, is_blocked, role")
      .or(`app_uid.eq.${q},id.eq.${q}`)
      .maybeSingle();
    if (error || !data) {
      toast.error("User not found");
      return;
    }
    setSearchedUser(data);
    // preview targets
    const { data: targets } = await supabase.rpc("admin_resolve_permanent_ban_targets" as any, {
      _target_user_id: data.id,
      _lookback_days: lookbackDays,
    });
    setPreviewTargets((targets as any[]) || []);
  };

  const handleStepOne = async () => {
    if (!searchedUser) {
      toast.error("Search a user first");
      return;
    }
    if (!reason.trim()) {
      toast.error("Reason is required");
      return;
    }
    setSubmitting(true);
    const evidenceArr = evidence.trim()
      ? evidence.split("\n").filter(Boolean).map(line => ({ note: line }))
      : [];
    const { data, error } = await supabase.rpc("admin_permanent_ban_step_one" as any, {
      _target_user_id: searchedUser.id,
      _reason: reason.trim(),
      _evidence: evidenceArr,
      _include_gift_links: includeGiftLinks,
      _lookback_days: lookbackDays,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Case created. ${(data as any)?.linked_target_count ?? 0} targets queued for owner approval.`);
    setSearchUid(""); setSearchedUser(null); setReason(""); setEvidence(""); setPreviewTargets([]);
    fetchCases();
  };

  const openCase = async (c: BanCase) => {
    setSelectedCase(c);
    setReviewNote(c.review_note || "");
    const { data } = await (supabase as any)
      .from("admin_permanent_ban_case_targets")
      .select("*")
      .eq("case_id", c.id)
      .order("created_at", { ascending: true });
    const rows = (data as any[]) || [];
    if (rows.length) {
      const ids = rows.map(r => r.user_id);
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, app_uid")
        .in("id", ids);
      const map = new Map((profs || []).map((p: any) => [p.id, p]));
      rows.forEach(r => { r.profile = map.get(r.user_id); });
    }
    setCaseTargets(rows);
  };

  const handleStepTwo = async (approve: boolean) => {
    if (!selectedCase) return;
    if (!isOwner) { toast.error("Only owners can approve/reject"); return; }
    setSubmitting(true);
    if (approve) {
      const { error } = await supabase.rpc("admin_permanent_ban_step_two" as any, {
        _case_id: selectedCase.id,
        _review_note: reviewNote || null,
      });
      setSubmitting(false);
      if (error) { toast.error(error.message); return; }
      toast.success("Approved. Now click Step 3 to execute.");
    } else {
      const { error } = await (supabase as any)
        .from("admin_permanent_ban_cases")
        .update({ status: "rejected", review_note: reviewNote, reviewed_at: new Date().toISOString() })
        .eq("id", selectedCase.id);
      setSubmitting(false);
      if (error) { toast.error(error.message); return; }
      toast.success("Case rejected");
    }
    setSelectedCase(null);
    fetchCases();
  };

  const handleStepThree = async () => {
    if (!selectedCase) return;
    if (!isOwner) { toast.error("Only owners can execute"); return; }
    if (!confirm("Permanently ban ALL listed accounts? This cannot be undone.")) return;
    setSubmitting(true);
    const { data, error } = await supabase.rpc("admin_permanent_ban_step_three" as any, {
      _case_id: selectedCase.id,
    });
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    const summary = data as any;
    toast.success(`Banned ${summary?.banned_count ?? 0} account(s) permanently.`);
    setSelectedCase(null);
    fetchCases();
  };

  const counts = {
    pending: cases.filter(c => c.status === "pending_review").length,
    approved: cases.filter(c => c.status === "approved").length,
    executed: cases.filter(c => c.status === "executed").length,
    rejected: cases.filter(c => c.status === "rejected").length,
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <Skull className="h-6 w-6 text-rose-500" />
        <div>
          <h1 className="text-2xl font-bold">Permanent Ban (3-Step)</h1>
          <p className="text-sm text-muted-foreground">Admin initiates → Owner approves → Owner executes. Linked accounts (via gifts) are banned together.</p>
        </div>
        <Badge variant={isOwner ? "default" : "secondary"} className="ml-auto">
          {isOwner ? "Owner Access" : "Admin Access"}
        </Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Pending Review</div><div className="text-2xl font-bold text-amber-400">{counts.pending}</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Approved</div><div className="text-2xl font-bold text-blue-400">{counts.approved}</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Executed</div><div className="text-2xl font-bold text-emerald-400">{counts.executed}</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Rejected</div><div className="text-2xl font-bold text-rose-400">{counts.rejected}</div></CardContent></Card>
      </div>

      <Tabs defaultValue="initiate">
        <TabsList>
          <TabsTrigger value="initiate"><Shield className="h-4 w-4 mr-1" /> Step 1 — Initiate</TabsTrigger>
          <TabsTrigger value="cases"><Users className="h-4 w-4 mr-1" /> Cases</TabsTrigger>
        </TabsList>

        <TabsContent value="initiate">
          <Card>
            <CardHeader><CardTitle>Initiate Permanent Ban Case</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input placeholder="App UID or User UUID (e.g., 1645256350)" value={searchUid} onChange={e => setSearchUid(e.target.value)} />
                <Button onClick={handleSearchUser} variant="secondary"><Search className="h-4 w-4 mr-1" /> Search</Button>
              </div>

              {searchedUser && (
                <div className="rounded-lg border border-border bg-muted/40 p-3 flex items-center gap-3">
                  <img src={searchedUser.avatar_url || "/placeholder.svg"} className="h-10 w-10 rounded-full object-cover" alt="" />
                  <div className="flex-1">
                    <div className="font-semibold">{searchedUser.display_name}</div>
                    <div className="text-xs text-muted-foreground">UID: {searchedUser.app_uid} • Role: {searchedUser.role}</div>
                  </div>
                  {searchedUser.is_blocked && <Badge variant="destructive">Already blocked</Badge>}
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <Label>Reason *</Label>
                  <Textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="e.g., Diamond fraud / chargeback abuse" />
                </div>
                <div>
                  <Label>Evidence (one per line)</Label>
                  <Textarea value={evidence} onChange={e => setEvidence(e.target.value)} rows={3} placeholder="Tx ID, gift IDs, screenshots URL, etc." />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch checked={includeGiftLinks} onCheckedChange={setIncludeGiftLinks} />
                  <Label>Auto-link gift recipients/senders</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-sm">Lookback (days)</Label>
                  <Input type="number" className="w-24" value={lookbackDays} onChange={e => setLookbackDays(Math.max(1, parseInt(e.target.value || "90")))} />
                </div>
                {searchedUser && (
                  <Button variant="outline" size="sm" onClick={handleSearchUser}>Refresh linked targets</Button>
                )}
              </div>

              {previewTargets.length > 0 && (
                <div className="rounded-lg border border-border p-3">
                  <div className="text-sm font-medium mb-2 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-400" />
                    {previewTargets.length} account(s) will be banned together
                  </div>
                  <div className="max-h-48 overflow-auto space-y-1 text-xs">
                    {previewTargets.map((t: any, i) => (
                      <div key={i} className="flex justify-between gap-2 border-b border-border/40 py-1">
                        <span className="truncate">{t.user_id}</span>
                        <span className="text-muted-foreground">{t.source}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Button onClick={handleStepOne} disabled={submitting || !searchedUser || !reason.trim()} className="w-full">
                <Shield className="h-4 w-4 mr-1" /> Submit for Owner Approval (Step 1)
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cases">
          <Card>
            <CardHeader><CardTitle>All Ban Cases</CardTitle></CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center text-muted-foreground py-8">Loading…</div>
              ) : cases.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">No cases yet</div>
              ) : (
                <div className="space-y-2">
                  {cases.map(c => (
                    <button
                      key={c.id}
                      onClick={() => openCase(c)}
                      className="w-full text-left rounded-lg border border-border bg-card hover:bg-muted/40 p-3 transition flex items-center gap-3"
                    >
                      <img src={c.target?.avatar_url || "/placeholder.svg"} className="h-10 w-10 rounded-full object-cover" alt="" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{c.target?.display_name || c.target_user_id}</div>
                        <div className="text-xs text-muted-foreground truncate">{c.reason}</div>
                        <div className="text-[10px] text-muted-foreground flex items-center gap-2 mt-1">
                          <Clock className="h-3 w-3" /> {format(new Date(c.created_at), "PP p")}
                          • {c.linked_target_count} target(s)
                          • by {c.initiator?.display_name || "—"}
                        </div>
                      </div>
                      <StatusBadge status={c.status} />
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!selectedCase} onOpenChange={(o) => !o && setSelectedCase(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Skull className="h-5 w-5 text-rose-500" /> Ban Case Details
            </DialogTitle>
            <DialogDescription>
              {selectedCase && <StatusBadge status={selectedCase.status} />}
            </DialogDescription>
          </DialogHeader>

          {selectedCase && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border p-3">
                <div className="text-sm"><span className="text-muted-foreground">Target:</span> {selectedCase.target?.display_name} ({selectedCase.target?.app_uid})</div>
                <div className="text-sm"><span className="text-muted-foreground">Initiated by:</span> {selectedCase.initiator?.display_name || selectedCase.initiated_by}</div>
                <div className="text-sm"><span className="text-muted-foreground">Reason:</span> {selectedCase.reason}</div>
                {selectedCase.review_note && <div className="text-sm"><span className="text-muted-foreground">Review note:</span> {selectedCase.review_note}</div>}
                {selectedCase.execution_summary && (
                  <div className="text-sm"><span className="text-muted-foreground">Execution:</span> banned {(selectedCase.execution_summary as any).banned_count}, skipped {(selectedCase.execution_summary as any).skipped_count}</div>
                )}
              </div>

              <div className="rounded-lg border border-border p-3">
                <div className="text-sm font-medium mb-2">Linked Targets ({caseTargets.length})</div>
                <div className="max-h-56 overflow-auto space-y-1 text-xs">
                  {caseTargets.map((t: any) => (
                    <div key={t.id} className="flex items-center justify-between border-b border-border/40 py-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <img src={t.profile?.avatar_url || "/placeholder.svg"} className="h-6 w-6 rounded-full object-cover" alt="" />
                        <div className="truncate">{t.profile?.display_name || t.user_id} <span className="text-muted-foreground">({t.profile?.app_uid || "—"})</span></div>
                      </div>
                      <Badge variant="outline" className="text-[10px]">{t.source}</Badge>
                    </div>
                  ))}
                </div>
              </div>

              {(selectedCase.status === "pending_review") && (
                <div className="space-y-2">
                  <Label>Review note (optional)</Label>
                  <Textarea rows={2} value={reviewNote} onChange={e => setReviewNote(e.target.value)} />
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            {selectedCase?.status === "pending_review" && isOwner && (
              <>
                <Button variant="outline" onClick={() => handleStepTwo(false)} disabled={submitting}>Reject</Button>
                <Button onClick={() => handleStepTwo(true)} disabled={submitting}>
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Approve (Step 2)
                </Button>
              </>
            )}
            {selectedCase?.status === "approved" && isOwner && (
              <Button variant="destructive" onClick={handleStepThree} disabled={submitting}>
                <Skull className="h-4 w-4 mr-1" /> Execute Permanent Ban (Step 3)
              </Button>
            )}
            {!isOwner && selectedCase && ["pending_review", "approved"].includes(selectedCase.status) && (
              <div className="text-xs text-muted-foreground">Only owners can approve/execute.</div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
