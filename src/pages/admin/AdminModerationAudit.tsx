/**
 * AdminModerationAudit
 *
 * Searchable history of every moderation/report action. Backed by
 * `admin_list_moderation_audit` RPC (Pkg64). Streamed via admin_broadcast.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import AdminPagination from "@/components/admin/AdminPagination";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ScrollText, RefreshCw, Search, Eye, Loader2 } from "lucide-react";

const TABLES = [
  { value: "all", label: "All tables" },
  { value: "live_bans", label: "Live Bans" },
  { value: "blocked_users", label: "Blocked Users" },
  { value: "blocked_ips", label: "Blocked IPs" },
  { value: "banned_devices", label: "Banned Devices" },
  { value: "host_contact_violations", label: "Contact Violations" },
  { value: "live_face_violations", label: "Face Violations" },
  { value: "user_reports", label: "User Reports" },
  { value: "support_reports", label: "Support Reports" },
  { value: "chat_moderation_logs", label: "Chat Moderation" },
  { value: "admin_permanent_ban_cases", label: "Permanent Ban Cases" },
  { value: "admin_permanent_ban_case_targets", label: "Ban Case Targets" },
];

const ACTIONS = [
  { value: "all", label: "All actions" },
  { value: "INSERT", label: "Created" },
  { value: "UPDATE", label: "Updated" },
  { value: "DELETE", label: "Deleted" },
];

const PAGE_SIZE = 50;

type Row = {
  id: string;
  occurred_at: string;
  table_name: string;
  action: "INSERT" | "UPDATE" | "DELETE";
  row_id: string | null;
  target_user_id: string | null;
  admin_id: string | null;
  admin_display: string | null;
  ip_address: string | null;
  summary: string | null;
  changed_keys: string[] | null;
  before_data: any;
  after_data: any;
  total_count: number;
};

const actionStyle = (a: Row["action"]) => {
  switch (a) {
    case "INSERT":
      return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
    case "UPDATE":
      return "bg-amber-500/15 text-amber-300 border-amber-500/30";
    case "DELETE":
      return "bg-rose-500/15 text-rose-300 border-rose-500/30";
  }
};

export default function AdminModerationAudit() {
  const [search, setSearch] = useState("");
  const [tableFilter, setTableFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Row | null>(null);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: [
      "admin-moderation-audit",
      search.trim(),
      tableFilter,
      actionFilter,
      page,
    ],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "admin_list_moderation_audit" as any,
        {
          _search: search.trim() || null,
          _table: tableFilter === "all" ? null : tableFilter,
          _action: actionFilter === "all" ? null : actionFilter,
          _admin_id: null,
          _target_user_id: null,
          _from: null,
          _to: null,
          _limit: PAGE_SIZE,
          _offset: page * PAGE_SIZE,
        }
      );
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["admin-moderation-audit-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "admin_moderation_audit_stats" as any
      );
      if (error) throw error;
      return data as {
        total: number;
        today: number;
        last_7d: number;
        by_action: Record<string, number>;
        by_table: Record<string, number>;
      };
    },
  });

  const total = data?.[0]?.total_count ?? 0;
  const totalPages = Math.max(1, Math.ceil(Number(total) / PAGE_SIZE));

  const summary = useMemo(
    () => [
      { label: "Total events", value: stats?.total ?? "—" },
      { label: "Today", value: stats?.today ?? "—" },
      { label: "Last 7 days", value: stats?.last_7d ?? "—" },
      {
        label: "Created (7d)",
        value: stats?.by_action?.INSERT ?? 0,
      },
      {
        label: "Updated (7d)",
        value: stats?.by_action?.UPDATE ?? 0,
      },
      {
        label: "Deleted (7d)",
        value: stats?.by_action?.DELETE ?? 0,
      },
    ],
    [stats]
  );

  return (
    <div className="admin-pro-shell admin-content space-y-5 p-4 md:p-6 -mx-4 -my-4 sm:-mx-6 sm:-my-6">

      <AdminPageHeader
        icon={ScrollText}
        title="Moderation Audit"
        subtitle="Every save, status change, and delete on bans, reports, and moderation tables — with full before/after diff and actor history."
      />

      {/* Stats strip */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {summary.map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-slate-200 bg-white/[0.02] p-3"
          >
            <div className="text-[10px] uppercase tracking-[0.1em] text-slate-500 font-bold">
              {s.label}
            </div>
            <div className="text-xl font-bold text-slate-900 mt-1">
              {typeof s.value === "number" ? s.value.toLocaleString() : s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input
            placeholder="Search summary, row ID, admin name, target user UUID…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="pl-9 bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 rounded-xl"
          />
        </div>

        <Select
          value={tableFilter}
          onValueChange={(v) => {
            setTableFilter(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-[180px] bg-white border-slate-200 text-slate-900 rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TABLES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={actionFilter}
          onValueChange={(v) => {
            setActionFilter(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-[150px] bg-white border-slate-200 text-slate-900 rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACTIONS.map((a) => (
              <SelectItem key={a.value} value={a.value}>
                {a.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          className="rounded-xl"
        >
          <RefreshCw
            className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`}
          />
          <span className="ml-1 hidden sm:inline">Refresh</span>
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white text-[10px] uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <th className="text-left px-3 py-2.5">When</th>
                <th className="text-left px-3 py-2.5">Action</th>
                <th className="text-left px-3 py-2.5">Table</th>
                <th className="text-left px-3 py-2.5">Summary</th>
                <th className="text-left px-3 py-2.5">Admin</th>
                <th className="text-left px-3 py-2.5">Target</th>
                <th className="text-left px-3 py-2.5">IP</th>
                <th className="text-right px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {isLoading && (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-slate-500">
                    <Loader2 className="w-5 h-5 animate-spin inline-block" />
                  </td>
                </tr>
              )}
              {!isLoading && data?.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-12 text-center text-slate-500">
                    No audit events match these filters.
                  </td>
                </tr>
              )}
              {data?.map((r) => (
                <tr
                  key={r.id}
                  className="hover:bg-white/[0.02] transition-colors"
                >
                  <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap text-xs font-mono">
                    {new Date(r.occurred_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge
                      className={`${actionStyle(r.action)} border text-[10px] font-bold`}
                    >
                      {r.action}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 text-slate-300 text-xs font-mono">
                    {r.table_name}
                  </td>
                  <td className="px-3 py-2.5 text-slate-200 max-w-md truncate">
                    {r.summary ?? "—"}
                    {r.changed_keys?.length ? (
                      <span className="ml-2 text-[10px] text-amber-400/80">
                        ({r.changed_keys.join(", ")})
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-slate-300 text-xs">
                    {r.admin_display ?? (
                      <span className="text-slate-600 italic">system</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-slate-400 text-[11px] font-mono">
                    {r.target_user_id?.slice(0, 8) ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-slate-500 text-[11px] font-mono">
                    {r.ip_address ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelected(r)}
                      className="h-7 px-2"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <AdminPagination
          page={page + 1}
          totalPages={totalPages}
          totalCount={Number(total)}
          pageSize={PAGE_SIZE}
          refreshing={isFetching}
          onPageChange={(p) => setPage(p - 1)}
        />
      </div>

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScrollText className="w-4 h-4" />
              Audit event details
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <Field label="When" value={new Date(selected.occurred_at).toLocaleString()} mono />
                <Field label="Action" value={selected.action} />
                <Field label="Table" value={selected.table_name} mono />
                <Field label="Row ID" value={selected.row_id ?? "—"} mono />
                <Field label="Admin" value={selected.admin_display ?? "system"} />
                <Field label="Admin ID" value={selected.admin_id ?? "—"} mono />
                <Field label="Target user" value={selected.target_user_id ?? "—"} mono />
                <Field label="IP address" value={selected.ip_address ?? "—"} mono />
              </div>

              {selected.changed_keys?.length ? (
                <div>
                  <div className="text-[10px] uppercase tracking-[0.1em] text-slate-500 font-bold mb-1">
                    Changed fields
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {selected.changed_keys.map((k) => (
                      <Badge key={k} variant="outline" className="text-[10px]">
                        {k}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}

              {selected.summary && (
                <div>
                  <div className="text-[10px] uppercase tracking-[0.1em] text-slate-500 font-bold mb-1">
                    Summary
                  </div>
                  <div className="text-slate-200">{selected.summary}</div>
                </div>
              )}

              <DiffBlock label="Before" data={selected.before_data} />
              <DiffBlock label="After" data={selected.after_data} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.1em] text-slate-500 font-bold">
        {label}
      </div>
      <div
        className={`text-slate-200 break-all ${
          mono ? "font-mono text-xs" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function DiffBlock({ label, data }: { label: string; data: any }) {
  if (!data) return null;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.1em] text-slate-500 font-bold mb-1">
        {label}
      </div>
      <pre className="bg-black/40 border border-slate-200 rounded-lg p-3 text-[11px] text-slate-300 font-mono overflow-x-auto max-h-72">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}
