import { useState, useEffect } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { FileText, Search, Filter, RefreshCw, User, Building2, Settings, Ban, CheckCircle, Clock, ChevronDown, Download, FileSpreadsheet, Play, Pause } from "lucide-react";
import { exportToCsv, exportToPdf } from "@/utils/exportLogs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { bn } from "date-fns/locale";
import { recordAdminError } from "@/utils/adminErrorLog";

import { formatAdminError } from "@/utils/formatAdminError";
import { UserAvatarImage } from "@/components/admin/UserAvatarImage";
interface AdminLog {
  id: string;
  admin_id: string;
  action_type: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
  admin?: {
    display_name: string;
    avatar_url: string | null;
  };
}

export default function AdminLogs() {
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState<"all" | "info" | "warn" | "error">("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(10);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [, setNowTick] = useState(0);

  // Re-render every second so the "updated Ns ago" label stays accurate
  useEffect(() => {
    const id = setInterval(() => setNowTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => {
      fetchLogs();
    }, refreshInterval * 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, refreshInterval, actionFilter, dateFrom, dateTo]);


  useEffect(() => {
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionFilter, dateFrom, dateTo]);

  useAdminRealtime(['admin_logs'], () => fetchLogs());

  const classifyLevel = (a: string): "info" | "warn" | "error" => {
    const s = (a || "").toLowerCase();
    if (s.includes("delete") || s.includes("reject") || s.includes("ban") || s.includes("error")) return "error";
    if (s.includes("block") || s.includes("warn") || s.includes("suspend") || s.includes("unblock")) return "warn";
    return "info";
  };

  const fetchLogs = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("admin_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);

      if (actionFilter !== "all") {
        query = query.eq("action_type", actionFilter);
      }
      if (dateFrom) {
        query = query.gte("created_at", new Date(dateFrom).toISOString());
      }
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        query = query.lte("created_at", end.toISOString());
      }

      const { data, error } = await query;

      if (error) throw error;
      
      // Fetch admin profiles separately
      const adminIds = [...new Set((data || []).map(log => log.admin_id).filter(Boolean))];
      
      let adminProfiles: Record<string, { display_name: string; avatar_url: string | null }> = {};
      
      if (adminIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url")
          .in("id", adminIds);
        
        if (profiles) {
          adminProfiles = profiles.reduce((acc, profile) => {
            acc[profile.id] = { display_name: profile.display_name, avatar_url: profile.avatar_url };
            return acc;
          }, {} as Record<string, { display_name: string; avatar_url: string | null }>);
        }
      }
      
      const formattedLogs = (data || []).map(log => ({
        ...log,
        admin: log.admin_id ? adminProfiles[log.admin_id] : null
      })) as AdminLog[];
      
      setLogs(formattedLogs);
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminLogs.ErrorFetchingLogs", message: formatAdminError(error)});
      toast.error("Failed to load logs");
    } finally {
      setLoading(false);
      setLastRefresh(new Date());
    }
  };

  const formatAgo = (d: Date) => {
    const s = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
    if (s < 5) return "just now";
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    return `${h}h ago`;
  };


  const getActionIcon = (actionType: string) => {
    if (actionType.includes("block")) return <Ban className="w-4 h-4 text-red-400" />;
    if (actionType.includes("unblock")) return <CheckCircle className="w-4 h-4 text-green-400" />;
    if (actionType.includes("user")) return <User className="w-4 h-4 text-blue-400" />;
    if (actionType.includes("agency")) return <Building2 className="w-4 h-4 text-purple-400" />;
    return <Settings className="w-4 h-4 text-gray-400" />;
  };

  const getActionLabel = (actionType: string) => {
    const labels: Record<string, string> = {
      block_user: "Block User",
      unblock_user: "Unblock User",
      block_agency: "Block Agency",
      unblock_agency: "Unblock Agency",
      update_settings: "Update Settings",
      create_gift: "Create Gift",
      update_gift: "Update Gift",
      delete_gift: "Delete Gift",
      verify_host: "Verify Host",
      approve_host: "Approve Host",
      reject_host: "Reject Host"
    };
    return labels[actionType] || actionType;
  };

  const getActionColor = (actionType: string) => {
    if (actionType.includes("block")) return "bg-red-500/20 text-red-400 border-red-500/30";
    if (actionType.includes("unblock") || actionType.includes("approve")) return "bg-green-500/20 text-green-400 border-green-500/30";
    if (actionType.includes("delete") || actionType.includes("reject")) return "bg-orange-500/20 text-orange-400 border-orange-500/30";
    if (actionType.includes("create")) return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    return "bg-gray-500/20 text-gray-400 border-gray-500/30";
  };

  const filteredLogs = logs
    .filter((log) => levelFilter === "all" || classifyLevel(log.action_type) === levelFilter)
    .filter((log) =>
      log.action_type?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.admin?.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.target_id?.includes(searchQuery)
    );

  const actionTypes = [
    { value: "all", label: "All Actions" },
    { value: "block_user", label: "Block User" },
    { value: "unblock_user", label: "Unblock User" },
    { value: "block_agency", label: "Block Agency" },
    { value: "unblock_agency", label: "Unblock Agency" },
    { value: "update_settings", label: "Update Settings" }
  ];

  const handleExport = (fmt: "csv" | "pdf") => {
    if (!filteredLogs.length) {
      toast.error("No logs to export");
      return;
    }
    const rows = filteredLogs.map((l) => ({
      Time: new Date(l.created_at).toLocaleString(),
      Action: getActionLabel(l.action_type),
      Level: classifyLevel(l.action_type),
      Admin: l.admin?.display_name || "Unknown",
      Target_Type: l.target_type || "",
      Target_ID: l.target_id || "",
      IP: l.ip_address || "",
      Details: l.details ? JSON.stringify(l.details) : "",
    }));
    const stamp = new Date().toISOString().slice(0, 10);
    if (fmt === "csv") exportToCsv(`activity-logs-${stamp}.csv`, rows);
    else exportToPdf(`activity-logs-${stamp}.pdf`, "Activity Logs", rows);
    toast.success(`Exported ${rows.length} logs as ${fmt.toUpperCase()}`);
  };

  return (
    <div className="admin-pro-shell admin-content space-y-6 p-4 md:p-6 -mx-4 -my-4 sm:-mx-6 sm:-my-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-gradient-to-r from-pink-500 via-rose-500 to-pink-600 rounded-2xl p-6 shadow-lg">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
            <FileText className="w-7 h-7" />
            Activity Log
          </h1>
          <p className="text-slate-900/80 text-sm mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>All admin activities</span>
            {autoRefresh ? (
              <span className="inline-flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live · {refreshInterval}s
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                Paused
              </span>
            )}
            <span className="inline-flex items-center gap-1" title={lastRefresh.toLocaleString()}>
              <Clock className="w-3 h-3" />
              Updated {formatAgo(lastRefresh)}
            </span>
          </p>

        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => setAutoRefresh((v) => !v)}
            className="border-white/40 text-slate-900 bg-white/10 hover:bg-white/20"
          >
            {autoRefresh ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
            {autoRefresh ? "Pause" : "Resume"}
          </Button>
          <Select value={String(refreshInterval)} onValueChange={(v) => setRefreshInterval(Number(v))}>
            <SelectTrigger className="w-[110px] bg-white/10 border-white/40 text-slate-900">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white border-slate-200">
              <SelectItem value="5">5s</SelectItem>
              <SelectItem value="10">10s</SelectItem>
              <SelectItem value="30">30s</SelectItem>
              <SelectItem value="60">60s</SelectItem>
            </SelectContent>
          </Select>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="border-white/40 text-slate-900 bg-white/10 hover:bg-white/20">
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-white border-slate-200">
              <DropdownMenuItem onClick={() => handleExport("csv")}>
                <FileSpreadsheet className="w-4 h-4 mr-2" /> CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("pdf")}>
                <FileText className="w-4 h-4 mr-2" /> PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={fetchLogs} variant="outline" className="border-white/40 text-slate-900 bg-white/10 hover:bg-white/20">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="bg-slate-50 border-slate-200 shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row md:flex-wrap gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
              <Input
                placeholder="Search by admin name or target ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-white border-slate-200 text-slate-900 placeholder:text-slate-600"
              />
            </div>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-full md:w-48 bg-white border-slate-200 text-slate-800">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Action Filter" />
              </SelectTrigger>
              <SelectContent className="bg-white border-slate-200">
                {actionTypes.map(type => (
                  <SelectItem key={type.value} value={type.value} className="text-slate-800">
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={levelFilter} onValueChange={(v) => setLevelFilter(v as any)}>
              <SelectTrigger className="w-full md:w-36 bg-white border-slate-200 text-slate-800">
                <SelectValue placeholder="Level" />
              </SelectTrigger>
              <SelectContent className="bg-white border-slate-200">
                <SelectItem value="all">All Levels</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="warn">Warning</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full md:w-44 bg-white border-slate-200 text-slate-900"
              aria-label="From date"
            />
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full md:w-44 bg-white border-slate-200 text-slate-900"
              aria-label="To date"
            />
            {(dateFrom || dateTo || levelFilter !== "all" || actionFilter !== "all" || searchQuery) && (
              <Button
                variant="outline"
                onClick={() => {
                  setDateFrom("");
                  setDateTo("");
                  setLevelFilter("all");
                  setActionFilter("all");
                  setSearchQuery("");
                }}
                className="border-slate-200 text-slate-700"
              >
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Logs List */}
      <Card className="bg-slate-50 border-slate-200 shadow-md">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-pink-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-600">No logs found</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-700">
              {filteredLogs.map((log) => (
                <Collapsible
                  key={log.id}
                  open={expandedLog === log.id}
                  onOpenChange={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                >
                  <CollapsibleTrigger className="w-full">
                    <div className="flex items-center gap-4 p-4 hover:bg-slate-700/50 transition-colors">
                      {/* Action Icon */}
                      <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center">
                        {getActionIcon(log.action_type)}
                      </div>

                      {/* Action Info */}
                      <div className="flex-1 text-left">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className={getActionColor(log.action_type)}>
                            {getActionLabel(log.action_type)}
                          </Badge>
                          {log.target_type && (
                            <span className="text-slate-600 text-xs">
                              ({log.target_type})
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-slate-700">
                          <Avatar className="w-5 h-5">
                            <UserAvatarImage seed={(((log.admin) as any)?.id ?? ((log.admin) as any)?.user_id ?? ((log.admin) as any)?.host_id)} gender={((log.admin) as any)?.gender} src={log.admin?.avatar_url || ""} />
                            <AvatarFallback className="bg-pink-600 text-white text-xs">
                              {log.admin?.display_name?.charAt(0) || "A"}
                            </AvatarFallback>
                          </Avatar>
                          <span>{log.admin?.display_name || "Unknown Admin"}</span>
                        </div>
                      </div>

                      {/* Time */}
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="flex items-center gap-1 text-slate-600 text-sm">
                            <Clock className="w-4 h-4" />
                            {formatDistanceToNow(new Date(log.created_at), { addSuffix: true, locale: bn })}
                          </div>
                        </div>
                        <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${expandedLog === log.id ? "rotate-180" : ""}`} />
                      </div>
                    </div>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <div className="px-4 pb-4 pl-18 space-y-3">
                      {log.target_id && (
                        <div className="bg-white rounded-lg p-3 border border-slate-200">
                          <p className="text-slate-600 text-xs mb-1">Target ID</p>
                          <p className="text-slate-800 font-mono text-sm">{log.target_id}</p>
                        </div>
                      )}
                      {log.details && Object.keys(log.details).length > 0 && (
                        <div className="bg-white rounded-lg p-3 border border-slate-200">
                          <p className="text-slate-600 text-xs mb-1">Details</p>
                          <pre className="text-slate-800 text-sm overflow-x-auto">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        </div>
                      )}
                      {log.ip_address && (
                        <div className="bg-white rounded-lg p-3 border border-slate-200">
                          <p className="text-slate-600 text-xs mb-1">IP Address</p>
                          <p className="text-slate-800 font-mono text-sm">{log.ip_address}</p>
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
