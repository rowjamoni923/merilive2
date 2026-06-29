import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RefreshCw, Smartphone, AlertTriangle, CheckCircle2, Clock, Info } from "lucide-react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

// Mirror of the client-side normaliser in src/hooks/useAppUpdate.ts so the
// admin dashboard explains exactly the same comparison the device performed.
const versionNameToCode = (version: string | null | undefined): number => {
  const raw = String(version ?? "").trim();
  if (!raw) return 0;
  if (!raw.includes(".")) {
    const n = parseInt(raw.replace(/\D/g, ""), 10);
    return Number.isFinite(n) ? n : 0;
  }
  const parts = raw.split(".").map((p) => parseInt(p.replace(/\D/g, ""), 10) || 0);
  return (parts[0] || 0) * 10000 + (parts[1] || 0) * 100 + (parts[2] || 0);
};
const toComparable = (code: number | null | undefined, name: string | null | undefined) => {
  const c = Number(code);
  const fromCode = Number.isFinite(c) && c > 0 ? c : 0;
  return Math.max(fromCode, versionNameToCode(name));
};

interface CheckLog {
  id: string;
  user_id: string | null;
  platform: string;
  current_version_name: string | null;
  current_version_code: number | null;
  server_version_name: string | null;
  server_version_code: number | null;
  min_version_code: number | null;
  update_available: boolean;
  force_update: boolean;
  modal_shown: boolean;
  outcome: string;
  device_model: string | null;
  app_build: string | null;
  created_at: string;
}

const PAGE_SIZE = 50;

const outcomeBadge = (o: string) => {
  switch (o) {
    case "shown":
      return <Badge className="bg-blue-500 text-white">Modal Shown</Badge>;
    case "dismissed":
      return <Badge variant="secondary">Dismissed</Badge>;
    case "store_opened":
      return <Badge className="bg-amber-500 text-white">Store Opened</Badge>;
    case "updated":
      return <Badge className="bg-emerald-500 text-white">Updated</Badge>;
    default:
      return <Badge variant="outline">Checked</Badge>;
  }
};

const AdminAppUpdateLogs = () => {
  const [logs, setLogs] = useState<CheckLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [outcome, setOutcome] = useState<string>("all");
  const [platform, setPlatform] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<CheckLog | null>(null);
  const [stats, setStats] = useState({
    total: 0,
    shown: 0,
    forced: 0,
    storeOpened: 0,
    updated: 0,
  });

  const fetchLogs = async () => {
    setLoading(true);
    try {
      let q = supabase
        .from("app_update_check_log")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (outcome !== "all") q = q.eq("outcome", outcome);
      if (platform !== "all") q = q.eq("platform", platform);

      const { data, error } = await q;
      if (error) throw error;
      setLogs((data || []) as CheckLog[]);
    } catch (err) {
      console.error("[AdminAppUpdateLogs] fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const since = new Date();
      since.setHours(since.getHours() - 24);
      const { data } = await supabase
        .from("app_update_check_log")
        .select("outcome,force_update,modal_shown")
        .gte("created_at", since.toISOString());

      const rows = (data || []) as Pick<CheckLog, "outcome" | "force_update" | "modal_shown">[];
      setStats({
        total: rows.length,
        shown: rows.filter((r) => r.modal_shown).length,
        forced: rows.filter((r) => r.force_update).length,
        storeOpened: rows.filter((r) => r.outcome === "store_opened").length,
        updated: rows.filter((r) => r.outcome === "updated").length,
      });
    } catch (err) {
      console.error("[AdminAppUpdateLogs] stats error:", err);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [outcome, platform, page]);

  useEffect(() => {
    fetchStats();
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return logs;
    const s = search.toLowerCase();
    return logs.filter(
      (l) =>
        l.user_id?.toLowerCase().includes(s) ||
        l.current_version_name?.toLowerCase().includes(s) ||
        l.server_version_name?.toLowerCase().includes(s) ||
        l.device_model?.toLowerCase().includes(s)
    );
  }, [logs, search]);

  return (
    <div className="p-4 md:p-6 space-y-6 bg-white min-h-screen">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Smartphone className="w-6 h-6 text-blue-600" />
            App Update Check Logs
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Live record of every app update check — version compare, force-update trigger, and modal outcome.
          </p>
        </div>
        <Button
          onClick={() => {
            fetchLogs();
            fetchStats();
          }}
          variant="outline"
          size="sm"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-slate-500 font-medium">Checks (24h)</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl font-bold text-slate-900">{stats.total}</div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-slate-500 font-medium flex items-center gap-1">
              <Clock className="w-3 h-3" /> Modal Shown
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl font-bold text-blue-600">{stats.shown}</div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-slate-500 font-medium flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Force Update
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl font-bold text-red-500">{stats.forced}</div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-slate-500 font-medium">Store Opened</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl font-bold text-amber-500">{stats.storeOpened}</div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-slate-500 font-medium flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Updated
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl font-bold text-emerald-500">{stats.updated}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-4 flex flex-wrap gap-3 items-center">
          <Input
            placeholder="Search user id / version / device..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <Select value={outcome} onValueChange={(v) => { setOutcome(v); setPage(0); }}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Outcome" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All outcomes</SelectItem>
              <SelectItem value="checked">Checked (no update)</SelectItem>
              <SelectItem value="shown">Modal Shown</SelectItem>
              <SelectItem value="dismissed">Dismissed</SelectItem>
              <SelectItem value="store_opened">Store Opened</SelectItem>
              <SelectItem value="updated">Updated</SelectItem>
            </SelectContent>
          </Select>
          <Select value={platform} onValueChange={(v) => { setPlatform(v); setPage(0); }}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Platform" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All platforms</SelectItem>
              <SelectItem value="android">Android</SelectItem>
              <SelectItem value="ios">iOS</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead>Device Version</TableHead>
                <TableHead>Server Version</TableHead>
                <TableHead>Update?</TableHead>
                <TableHead>Force?</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead>User</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-slate-400 py-8">
                    No update checks logged yet. Logs will appear after the next APK build pings the server.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="text-xs text-slate-600">
                    {format(new Date(l.created_at), "MMM dd, HH:mm:ss")}
                  </TableCell>
                  <TableCell><Badge variant="outline">{l.platform}</Badge></TableCell>
                  <TableCell className="font-mono text-xs">
                    {l.current_version_name ?? "?"}{" "}
                    <span className="text-slate-400">({l.current_version_code ?? "?"})</span>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {l.server_version_name ?? "?"}{" "}
                    <span className="text-slate-400">({l.server_version_code ?? "?"})</span>
                  </TableCell>
                  <TableCell>
                    {l.update_available ? (
                      <Badge className="bg-blue-500 text-white">Yes</Badge>
                    ) : (
                      <Badge variant="secondary">No</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {l.force_update ? (
                      <Badge className="bg-red-500 text-white">Forced</Badge>
                    ) : (
                      <span className="text-slate-400 text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell>{outcomeBadge(l.outcome)}</TableCell>
                  <TableCell className="font-mono text-xs text-slate-500">
                    {l.user_id ? l.user_id.slice(0, 8) : "anon"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-500">Page {page + 1}</div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0 || loading}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={logs.length < PAGE_SIZE || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AdminAppUpdateLogs;
