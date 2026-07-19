import { useEffect, useMemo, useState } from "react";
import { Activity, Users, Ban, Award, RefreshCw, ShieldOff, TrendingUp, Phone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import useAdminRealtime from "@/hooks/useAdminRealtime";


type ProfileLite = { id: string; username: string | null; avatar_url: string | null };

const fmtTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : "—");
const fmtDur = (sec?: number | null) => {
  if (!sec) return "0s";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
};

export default function AdminRandomCallOps() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({
    activeNow: 0,
    queuedNow: 0,
    callsToday: 0,
    completedToday: 0,
    shortToday: 0,
    coinsToday: 0,
    beansToday: 0,
    callsWeek: 0,
    coinsWeek: 0,
    beansWeek: 0,
    suspendedHosts: 0,
  });
  const [sessions, setSessions] = useState<any[]>([]);
  const [queue, setQueue] = useState<any[]>([]);
  const [suspended, setSuspended] = useState<any[]>([]);
  const [topHosts, setTopHosts] = useState<any[]>([]);
  const [skipAbusers, setSkipAbusers] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});

  const pName = (id?: string | null) => (id ? profiles[id]?.username || id.slice(0, 8) : "—");
  const pAvatar = (id?: string | null) => (id ? profiles[id]?.avatar_url || null : null);

  const loadAll = async () => {
    setRefreshing(true);
    const startToday = new Date();
    startToday.setHours(0, 0, 0, 0);
    const start7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      { data: liveSess },
      { data: queueData },
      { data: suspData },
      { data: topData },
      { data: skipData },
      { data: todayData },
      { data: weekData },
      { count: queuedNow },
      { count: activeNow },
      { count: suspCount },
    ] = await Promise.all([
      (supabase as any).from("random_call_sessions")
        .select("*").in("status", ["ringing", "active"]).order("started_at", { ascending: false }).limit(50),
      (supabase as any).from("random_call_queue")
        .select("*").eq("status", "waiting").order("score", { ascending: false }).limit(50),
      (supabase as any).from("host_match_availability")
        .select("host_id, suspended_until, suspension_reason, match_suspend_until, suspend_reason, reports_window_count, updated_at")
        .or("suspended_until.gt.now,match_suspend_until.gt.now")
        .order("updated_at", { ascending: false }).limit(50),
      (supabase as any).from("host_match_stats")
        .select("host_id, calls_completed_7d, avg_duration_sec_7d, avg_rating_7d, rating_count_7d, acceptance_pct, quality_score, report_count_24h, is_queue_suppressed")
        .order("quality_score", { ascending: false }).limit(20),
      (supabase as any).from("random_call_skip_counters")
        .select("*").order("skip_count", { ascending: false }).limit(20),
      (supabase as any).from("random_call_sessions")
        .select("id, status, billable_seconds, diamonds_charged, beans_awarded")
        .gte("started_at", startToday.toISOString()).limit(5000),
      (supabase as any).from("random_call_sessions")
        .select("id, diamonds_charged, beans_awarded")
        .gte("started_at", start7d.toISOString()).limit(20000),
      (supabase as any).from("random_call_queue").select("id", { count: "exact", head: true }).eq("status", "waiting"),
      (supabase as any).from("random_call_sessions").select("id", { count: "exact", head: true }).in("status", ["ringing", "active"]),
      (supabase as any).from("host_match_availability").select("host_id", { count: "exact", head: true })
        .or("suspended_until.gt.now,match_suspend_until.gt.now"),
    ]);

    setSessions(liveSess || []);
    setQueue(queueData || []);
    setSuspended(suspData || []);
    setTopHosts(topData || []);
    setSkipAbusers(skipData || []);

    const today = todayData || [];
    const week = weekData || [];
    const completed = today.filter((r: any) => r.status === "completed" || (r.billable_seconds || 0) > 0);
    const short = today.filter((r: any) => r.status === "ended" && (r.billable_seconds || 0) === 0);

    setStats({
    });

    // Fetch profile names for all referenced user ids
    const ids = new Set<string>();
    (liveSess || []).forEach((r: any) => { if (r.caller_id) ids.add(r.caller_id); if (r.host_id) ids.add(r.host_id); });
    (queueData || []).forEach((r: any) => { if (r.user_id) ids.add(r.user_id); });
    (suspData || []).forEach((r: any) => { if (r.host_id) ids.add(r.host_id); });
    (topData || []).forEach((r: any) => { if (r.host_id) ids.add(r.host_id); });
    (skipData || []).forEach((r: any) => { if (r.user_id) ids.add(r.user_id); });
    if (ids.size > 0) {
      const { data: profs } = await (supabase as any)
        .from("profiles").select("id, username, avatar_url").in("id", Array.from(ids));
      const map: Record<string, ProfileLite> = {};
      (profs || []).forEach((p: any) => { map[p.id] = p; });
      setProfiles(map);
    }

    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    loadAll();
  }, []);
  useAdminRealtime(
    ["random_call_sessions", "random_call_queue", "random_call_skip_counters", "host_match_availability"],
    () => loadAll(),
    "admin-random-call-ops-rt"
  );


  const unsuspendHost = async (hostId: string) => {
    const { error } = await (supabase as any)
      .from("host_match_availability")
      .update({
        suspended_until: null,
        suspension_reason: null,
        match_suspend_until: null,
        suspend_reason: null,
        reports_window_count: 0,
        updated_at: new Date().toISOString(),
      })
      .eq("host_id", hostId);
    if (error) return toast.error("Failed: " + error.message);
    toast.success("Host unsuspended");
    loadAll();
  };

  const forceSuspend = async (hostId: string) => {
    const until = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { error } = await (supabase as any)
      .from("host_match_availability")
      .update({
      })
      .eq("host_id", hostId);
    if (error) return toast.error("Failed: " + error.message);
    toast.success("Host suspended 24h");
    loadAll();
  };

  const forceEndSession = async (sessionId: string) => {
    if (!confirm("Force-end this call? Caller will be charged for billable seconds only.")) return;
    // Compute duration from the live session row so the RPC has a real number
    // (server clamps it again to its own elapsed value — this is just the floor).
    const sess = sessions.find((s) => s.id === sessionId);
    const startedAtMs = sess?.started_at ? new Date(sess.started_at).getTime() : Date.now();
    const duration = Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
    const { error } = await (supabase as any).rpc("settle_random_call", {
      p_session_id: sessionId,
      p_duration_seconds: duration,
      p_ended_by: "admin",
    });
    if (error) return toast.error("Failed: " + error.message);
    toast.success("Session settled");
    loadAll();
  };

  const clearQueueEntry = async (id: string) => {
    const { error } = await (supabase as any)
      .from("random_call_queue").update({ status: "cancelled" }).eq("id", id);
    if (error) return toast.error("Failed: " + error.message);
    toast.success("Removed from queue");
    loadAll();
  };

  const Stat = ({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) => (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-2xl font-bold ${color || ""}`}>{value}</div>
        {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );

  if (loading) {
    return <div className="admin-pro-shell admin-content p-6"><AdminPageHeader title="Random Call Operations" subtitle="Loading..." icon={Activity} /></div>;
  }

  return (
    <div className="admin-pro-shell admin-content p-4 md:p-6 space-y-5 max-w-7xl mx-auto">
      <AdminPageHeader
        title="Random Call Operations"
        subtitle="Live monitoring, queue, suspensions, revenue & top performers — auto-refresh 15s"
        icon={Activity}
        actions={
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/random-call"><Phone className="h-4 w-4 mr-1" />Settings</Link>
            </Button>
            <Button onClick={loadAll} disabled={refreshing} size="sm">
              <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? "animate-spin" : ""}`} />Refresh
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Active calls" value={stats.activeNow} color="text-emerald-600" />
        <Stat label="Waiting in queue" value={stats.queuedNow} color="text-cyan-600" />
        <Stat label="Suspended hosts" value={stats.suspendedHosts} color="text-rose-600" />
        <Stat label="Calls today" value={stats.callsToday} sub={`${stats.completedToday} billed · ${stats.shortToday} < 40s`} />
        <Stat label="Diamonds charged (today)" value={stats.coinsToday.toLocaleString()} />
        <Stat label="Beans paid (today)" value={stats.beansToday.toLocaleString()} />
        <Stat label="Diamonds charged (7d)" value={stats.coinsWeek.toLocaleString()} />
        <Stat label="Beans paid (7d)" value={stats.beansWeek.toLocaleString()} />
      </div>

      <Tabs defaultValue="live" className="w-full">
        <TabsList className="grid grid-cols-5 w-full">
          <TabsTrigger value="live"><Activity className="h-4 w-4 mr-1" />Live</TabsTrigger>
          <TabsTrigger value="queue"><Users className="h-4 w-4 mr-1" />Queue</TabsTrigger>
          <TabsTrigger value="suspended"><Ban className="h-4 w-4 mr-1" />Suspended</TabsTrigger>
          <TabsTrigger value="top"><Award className="h-4 w-4 mr-1" />Top Hosts</TabsTrigger>
          <TabsTrigger value="abuse"><ShieldOff className="h-4 w-4 mr-1" />Skip Abuse</TabsTrigger>
        </TabsList>

        <TabsContent value="live">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Active & Ringing Sessions</CardTitle>
              <CardDescription>Force-end if a call is stuck. Settles caller refund + host beans automatically.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Caller</TableHead>
                    <TableHead>Host</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Rate</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No live sessions</TableCell></TableRow>
                  )}
                  {sessions.map((r) => {
                    const dur = r.started_at ? Math.floor((Date.now() - new Date(r.started_at).getTime()) / 1000) : 0;
                    return (
                      <TableRow key={r.id}>
                        <TableCell><Badge variant={r.status === "active" ? "default" : "secondary"}>{r.status}</Badge></TableCell>
                        <TableCell className="font-mono text-xs">{pName(r.caller_id)}</TableCell>
                        <TableCell className="font-mono text-xs">{pName(r.host_id)}</TableCell>
                        <TableCell className="text-xs">{fmtTime(r.started_at)}</TableCell>
                        <TableCell className="text-xs">{fmtDur(dur)}</TableCell>
                        <TableCell className="text-xs">{r.diamond_rate_per_min}/min</TableCell>
                        <TableCell>
                          <Button size="sm" variant="destructive" onClick={() => forceEndSession(r.id)}>Force end</Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="queue">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Waiting Queue (ranked by score)</CardTitle>
              <CardDescription>Re-scored every {30}s by pg_cron. Highest score matches first.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Role</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>VIP</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Rate</TableHead>
                    <TableHead>Entered</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queue.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Queue empty</TableCell></TableRow>
                  )}
                  {queue.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell><Badge variant="outline">{r.role}</Badge></TableCell>
                      <TableCell className="text-xs">{pName(r.user_id)}</TableCell>
                      <TableCell>{r.is_vip ? <Badge>VIP</Badge> : "—"}</TableCell>
                      <TableCell className="font-mono">{r.score}</TableCell>
                      <TableCell className="text-xs">{r.diamond_rate_per_min || "—"}</TableCell>
                      <TableCell className="text-xs">{fmtTime(r.entered_at)}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => clearQueueEntry(r.id)}>Remove</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="suspended">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Suspended Hosts</CardTitle>
              <CardDescription>Auto-suspended for excess reports, flash-disconnects, or manual admin action.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Host</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Reports</TableHead>
                    <TableHead>Suspended until</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suspended.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No suspended hosts</TableCell></TableRow>
                  )}
                  {suspended.map((r) => (
                    <TableRow key={r.host_id}>
                      <TableCell className="text-xs">{pName(r.host_id)}</TableCell>
                      <TableCell className="text-xs">{r.suspend_reason || r.suspension_reason || "—"}</TableCell>
                      <TableCell>{r.reports_window_count || 0}</TableCell>
                      <TableCell className="text-xs">{fmtTime(r.match_suspend_until || r.suspended_until)}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => unsuspendHost(r.host_id)}>Lift suspension</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="top">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" />Top Hosts (7-day quality)</CardTitle>
              <CardDescription>Composite score = acceptance × completion × rating. Suppressed = excluded from queue.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Host</TableHead>
                    <TableHead>Quality</TableHead>
                    <TableHead>Calls</TableHead>
                    <TableHead>Avg duration</TableHead>
                    <TableHead>Accept %</TableHead>
                    <TableHead>Rating</TableHead>
                    <TableHead>Reports 24h</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topHosts.length === 0 && (
                    <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No data yet</TableCell></TableRow>
                  )}
                  {topHosts.map((r, i) => (
                    <TableRow key={r.host_id} className={r.is_queue_suppressed ? "opacity-50" : ""}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell className="text-xs">{pName(r.host_id)}</TableCell>
                      <TableCell className="font-mono">{Number(r.quality_score || 0).toFixed(1)}</TableCell>
                      <TableCell>{r.calls_completed_7d || 0}</TableCell>
                      <TableCell className="text-xs">{fmtDur(Math.round(r.avg_duration_sec_7d || 0))}</TableCell>
                      <TableCell>{Number(r.acceptance_pct || 0).toFixed(0)}%</TableCell>
                      <TableCell>{Number(r.avg_rating_7d || 0).toFixed(1)} ({r.rating_count_7d || 0})</TableCell>
                      <TableCell>{r.report_count_24h || 0}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => forceSuspend(r.host_id)}>Suspend 24h</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="abuse">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Top Skippers</CardTitle>
              <CardDescription>Callers near or over their daily skip limit. Cooldowns apply automatically.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Skips today</TableHead>
                    <TableHead>Cooldown until</TableHead>
                    <TableHead>Last skip</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {skipAbusers.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No skip activity</TableCell></TableRow>
                  )}
                  {skipAbusers.map((r) => (
                    <TableRow key={r.user_id || r.id}>
                      <TableCell className="text-xs">{pName(r.user_id)}</TableCell>
                      <TableCell>{r.skip_count ?? r.daily_count ?? 0}</TableCell>
                      <TableCell className="text-xs">{fmtTime(r.cooldown_until)}</TableCell>
                      <TableCell className="text-xs">{fmtTime(r.updated_at || r.last_skip_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
