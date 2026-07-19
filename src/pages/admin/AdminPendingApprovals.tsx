import { useEffect, useState, useCallback } from "react";
import { useAdminRealtime } from "@/hooks/useAdminRealtime";
import { adminSupabase } from "@/integrations/supabase/adminClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { format } from "date-fns";
import { Check, X, Clock, ShieldAlert, Loader2 } from "lucide-react";
import AdminPageHeader from "@/components/admin/AdminPageHeader";

type Row = {
  id: string;
  action_type: string;
  target_user_id: string | null;
  target_agency_id: string | null;
  payload: any;
  reason: string | null;
  status: string;
  requested_by_name: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  owner_notes: string | null;
  executed_result: any;
  created_at: string;
};

const ACTION_LABELS: Record<string, string> = {
  add_diamonds: "Diamond Credit",
  add_beans: "Beans Credit",
  agency_beans_adjust: "Agency Beans Adjust",
  update_gender: "Gender Change",
  process_face_verification: "Face Verification Decision",
  remove_face_verification: "Face Verification Revoke",
  reverse_auto_action: "Auto-Action Reversal",
};

function summarizePayload(action: string, payload: any): string {
  if (!payload) return "";
  switch (action) {
    case "add_diamonds":
      return `+${payload.amount} 💎 → user ${payload.user_id?.slice(0, 8)}…`;
    case "add_beans":
      return `+${payload.amount} 🫘 → user ${payload.user_id?.slice(0, 8)}…`;
    case "agency_beans_adjust":
      return `${payload.delta > 0 ? "+" : ""}${payload.delta} 🫘 → agency ${payload.agency_id?.slice(0, 8)}…`;
    case "update_gender":
      return `→ ${payload.gender} (user ${payload.user_id?.slice(0, 8)}…)`;
    case "process_face_verification":
      return `${payload.action} (submission ${payload.submission_id?.slice(0, 8)}…)${payload.set_gender ? ` as ${payload.set_gender}` : ""}`;
    case "remove_face_verification":
      return `revoke verification (user ${payload.user_id?.slice(0, 8)}…)`;
    case "reverse_auto_action":
      return `Reverse ${payload.action_type} (${payload.action_id?.slice(0, 8)}…)`;
    default:
      return JSON.stringify(payload);
  }
}

export default function AdminPendingApprovals() {
  const [tab, setTab] = useState<"pending" | "approved" | "rejected">("pending");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notesById, setNotesById] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await adminSupabase.rpc("admin_list_pending_actions", {
      _status: tab,
      _limit: 200,
    });
    if (error) toast.error(error.message);
    setRows((data as Row[]) || []);
    setLoading(false);
  }, [tab]);

  useEffect(() => { load(); }, [load]);
  // Pkg362: instant push on new owner-approval queue items.
  useAdminRealtime(['admin_pending_actions'], load, 'admin-pending-approvals', { debounceMs: 400 });


  const approve = async (id: string) => {
    setBusyId(id);
    const { data, error } = await adminSupabase.rpc("admin_approve_pending_action", {
      _id: id, _notes: notesById[id] || null,
    });
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    if ((data as any)?.success === false) { toast.error((data as any).error || "Failed"); return; }
    toast.success("Approved & executed");
    load();
  };

  const reject = async (id: string) => {
    setBusyId(id);
    const { data, error } = await adminSupabase.rpc("admin_reject_pending_action", {
      _id: id, _notes: notesById[id] || null,
    });
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    if ((data as any)?.success === false) { toast.error((data as any).error || "Failed"); return; }
    toast.success("Rejected");
    load();
  };

  return (
    <div className="admin-pro-shell admin-content space-y-4 p-4 md:p-6 -mx-4 -my-4 sm:-mx-6 sm:-my-6">

      <AdminPageHeader
        icon={ShieldAlert}
        title="Pending Approvals"
        subtitle="Sub-admin requests awaiting owner approval — diamond/beans credits, gender changes, face verification decisions."
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="pending"><Clock className="w-4 h-4 mr-1" /> Pending</TabsTrigger>
          <TabsTrigger value="approved"><Check className="w-4 h-4 mr-1" /> Approved</TabsTrigger>
          <TabsTrigger value="rejected"><X className="w-4 h-4 mr-1" /> Rejected</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          {loading ? (
            <div className="flex justify-center p-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : rows.length === 0 ? (
            <div className="admin-empty-state">No {tab} requests.</div>
          ) : (
            <div className="grid gap-3">
              {rows.map((r) => (
                <Card key={r.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Badge variant="outline">{ACTION_LABELS[r.action_type] || r.action_type}</Badge>
                        <span className="text-muted-foreground text-sm">
                          by {r.requested_by_name || "—"}
                        </span>
                      </CardTitle>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(r.created_at), "PPp")}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="text-sm font-mono bg-muted/50 p-2 rounded">
                      {summarizePayload(r.action_type, r.payload)}
                    </div>
                    {r.reason && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">Reason: </span>{r.reason}
                      </div>
                    )}
                    {r.target_user_id && (
                      <div className="text-xs text-muted-foreground">
                        Target user: <span className="font-mono">{r.target_user_id}</span>
                      </div>
                    )}
                    {r.target_agency_id && (
                      <div className="text-xs text-muted-foreground">
                        Target agency: <span className="font-mono">{r.target_agency_id}</span>
                      </div>
                    )}

                    {r.status === "pending" ? (
                      <>
                        <Textarea
                          placeholder="Owner notes (optional)"
                          value={notesById[r.id] || ""}
                          onChange={(e) => setNotesById((p) => ({ ...p, [r.id]: e.target.value }))}
                          rows={2}
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => approve(r.id)}
                            disabled={busyId === r.id}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            <Check className="w-4 h-4 mr-1" /> Approve & Execute
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => reject(r.id)}
                            disabled={busyId === r.id}
                          >
                            <X className="w-4 h-4 mr-1" /> Reject
                          </Button>
                        </div>
                      </>
                    ) : (
                      <div className="text-xs text-muted-foreground border-t pt-2">
                        {r.status === "approved" ? "Approved" : "Rejected"} by {r.reviewed_by_name || "—"}
                        {r.reviewed_at ? ` on ${format(new Date(r.reviewed_at), "PPp")}` : ""}
                        {r.owner_notes ? <div className="mt-1">Notes: {r.owner_notes}</div> : null}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
