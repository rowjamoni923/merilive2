/**
 * AdminSupportReports
 *
 * Owner-only inbox of reports filed by support admins.
 * Each row carries: user ID/UID, original ticket subject + reported message,
 * the support admin's display name, the reason, and a status owner can update.
 */
import { useEffect, useState, useCallback } from "react";
import { adminSupabase } from "@/integrations/supabase/adminClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShieldAlert, RefreshCw, Loader2, ExternalLink, Copy, CheckCircle2, XCircle } from "lucide-react";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import useAdminAccess from "@/hooks/useAdminAccess";

interface Report {
  id: string;
  ticket_id: string | null;
  message_id: string | null;
  user_id: string | null;
  user_app_uid: string | null;
  user_display_name: string | null;
  ticket_subject: string | null;
  message_content: string;
  reason: string;
  reported_by_admin_id: string | null;
  reported_by_admin_name: string | null;
  status: "open" | "reviewed" | "dismissed";
  owner_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
}

const STATUSES: Report["status"][] = ["open", "reviewed", "dismissed"];

export default function AdminSupportReports() {
  const { isOwner, isLoading: accessLoading } = useAdminAccess();
  const { toast } = useToast();
  const [tab, setTab] = useState<Report["status"] | "all">("open");
  const [rows, setRows] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await adminSupabase.rpc("admin_list_support_reports" as any, {
        _status: tab === "all" ? null : tab,
        _limit: 200,
        _offset: 0,
      });
      if (error) throw error;
      setRows((data as any) ?? []);
    } catch (e: any) {
      toast({ title: "Failed to load", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [tab, toast]);

  useEffect(() => { if (isOwner) load(); }, [load, isOwner]);

  const updateStatus = async (id: string, status: Report["status"]) => {
    setBusy(id);
    try {
      const { error } = await adminSupabase.rpc("admin_update_support_report" as any, {
        _report_id: id, _status: status, _notes: notes[id] ?? null,
      });
      if (error) throw error;
      toast({ title: `Marked ${status}` });
      load();
    } catch (e: any) {
      toast({ title: "Update failed", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  if (accessLoading) {
    return <div className="p-6"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  }
  if (!isOwner) {
    return (
      <div className="p-6 max-w-2xl">
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          Only the owner can view forwarded support reports.
        </CardContent></Card>
      </div>
    );
  }

  const counts = {
    all: rows.length,
    open: rows.filter(r => r.status === "open").length,
  };

  return (
    <div className="admin-content p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-amber-400" />
          <h1 className="text-xl font-semibold">Support Reports</h1>
          {tab === "open" && counts.open > 0 && (
            <Badge variant="destructive">{counts.open} new</Badge>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-3 h-3 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="open">Open</TabsTrigger>
          <TabsTrigger value="reviewed">Reviewed</TabsTrigger>
          <TabsTrigger value="dismissed">Dismissed</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="flex items-center justify-center p-10"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className="admin-empty-state p-10 text-center text-muted-foreground text-sm">
          No reports here yet.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(r => (
            <Card key={r.id} className="border-border/40">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between flex-wrap gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs">
                      <Badge variant={r.status === "open" ? "destructive" : r.status === "reviewed" ? "default" : "secondary"}>
                        {r.status.toUpperCase()}
                      </Badge>
                      <span className="text-muted-foreground">
                        {format(new Date(r.created_at), "dd MMM yyyy HH:mm")}
                      </span>
                      <span className="text-muted-foreground">•</span>
                      <span>by <b>{r.reported_by_admin_name ?? "—"}</b></span>
                    </div>
                    <div className="text-sm font-semibold">{r.ticket_subject ?? "(no subject)"}</div>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px]">
                    {r.user_app_uid && (
                      <button
                        onClick={() => { navigator.clipboard.writeText(r.user_app_uid!); toast({ title: "UID copied" }); }}
                        className="font-mono bg-primary/10 text-primary px-2 py-1 rounded inline-flex items-center gap-1"
                      >
                        ID: {r.user_app_uid} <Copy className="w-3 h-3" />
                      </button>
                    )}
                    {r.user_display_name && <span className="text-muted-foreground">{r.user_display_name}</span>}
                    {r.ticket_id && (
                      <Link to={`/admin/support-tickets`} className="inline-flex items-center gap-0.5 text-blue-400 hover:underline">
                        Open ticket <ExternalLink className="w-3 h-3" />
                      </Link>
                    )}
                  </div>
                </div>

                {r.message_content && (
                  <div className="rounded-md bg-muted/30 border border-border/30 p-3 text-xs whitespace-pre-wrap">
                    <div className="text-[10px] text-muted-foreground mb-1">User message</div>
                    {r.message_content}
                  </div>
                )}

                <div className="rounded-md bg-amber-500/5 border border-amber-500/20 p-3 text-xs whitespace-pre-wrap">
                  <div className="text-[10px] text-amber-500 mb-1">Reason</div>
                  {r.reason}
                </div>

                {r.owner_notes && (
                  <div className="text-[11px] text-muted-foreground">
                    Owner notes: {r.owner_notes}
                  </div>
                )}

                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Textarea
                      rows={2}
                      placeholder="Add owner notes (optional)…"
                      value={notes[r.id] ?? ""}
                      onChange={(e) => setNotes(p => ({ ...p, [r.id]: e.target.value }))}
                      className="text-xs"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Button size="sm" variant="default" disabled={busy === r.id} onClick={() => updateStatus(r.id, "reviewed")}>
                      <CheckCircle2 className="w-3 h-3 mr-1" /> Reviewed
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={() => updateStatus(r.id, "dismissed")}>
                      <XCircle className="w-3 h-3 mr-1" /> Dismiss
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
